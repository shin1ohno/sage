/**
 * Pre-meeting Briefing Generation Service
 *
 * Gathers context from Slack channels, Notion, and previous action items,
 * then generates and delivers a concise briefing via Slack DM.
 */

import type { SlackService } from '../integrations/slack-service.js';
import type { ChannelDiscovery } from './channel-discovery.js';
import type { SamplingService } from './sampling-service.js';
import type { PipelineStateStore } from './pipeline-state-store.js';
import type { PromptTemplateManager } from './prompt-templates.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { BriefingResult, BriefingContext } from '../types/pipeline-types.js';
import type { MeetingIntelligenceConfig } from '../types/pipeline-config.js';
import { SamplingError } from './sampling-service.js';
import { extractNotionUrls, extractAgenda } from '../utils/calendar-description-parser.js';
import { formatBriefing } from '../utils/slack-blocks.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('briefing');

export class BriefingGenerator {
  private readonly slackService: SlackService;
  private readonly channelDiscovery: ChannelDiscovery;
  private readonly samplingService: SamplingService;
  private readonly stateStore: PipelineStateStore;
  private readonly promptTemplateManager: PromptTemplateManager;
  private readonly config: MeetingIntelligenceConfig;

  constructor(
    slackService: SlackService,
    channelDiscovery: ChannelDiscovery,
    samplingService: SamplingService,
    stateStore: PipelineStateStore,
    promptTemplateManager: PromptTemplateManager,
    config: MeetingIntelligenceConfig,
  ) {
    this.slackService = slackService;
    this.channelDiscovery = channelDiscovery;
    this.samplingService = samplingService;
    this.stateStore = stateStore;
    this.promptTemplateManager = promptTemplateManager;
    this.config = config;
  }

  async generateBriefing(event: CalendarEvent, deadline: Date): Promise<BriefingResult> {
    try {
      const context = await this.gatherContext(event);

      const prompt = this.promptTemplateManager.getPrompt('briefing_generate', {
        meeting_title: event.title,
        start_time: event.start,
        attendees: context.attendees.join(', ') || 'none',
        agenda: context.agenda || 'No agenda provided',
        slack_summary: context.slackChannelSummaries
          .map((s) => `#${s.channelName}: ${s.summary}`)
          .join('\n\n') || 'No Slack context available',
        notion_summary: context.notionDocSummaries.join('\n\n') || 'No Notion documents found',
        action_items: context.previousActionItems
          .map((ai) => `- [${ai.completed ? 'x' : ' '}] ${ai.item.description}`)
          .join('\n') || 'No previous action items',
      });

      let content = '';
      try {
        const response = await this.samplingService.sendSamplingRequest({
          messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
          maxTokens: 4096,
          systemPrompt: 'You are a meeting intelligence assistant.',
        });
        content = response.content.text;
      } catch (error) {
        if (error instanceof SamplingError) {
          logger.warn({ error: error.message }, 'Sampling failed for briefing generation, using fallback');
          content = this.buildFallbackBriefing(context);
        } else {
          throw error;
        }
      }

      if (new Date() > deadline) {
        return { status: 'skipped', reason: 'deadline passed' };
      }

      const blocks = formatBriefing(event.title, event.start, content, context.sourceLinks);

      await this.slackService.sendDirectMessage(blocks);

      this.stateStore.setBriefingStatus(event.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
      });

      return { status: 'sent', messageTs: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, eventId: event.id }, 'Failed to generate briefing');
      return { status: 'skipped', reason: message };
    }
  }

  private async gatherContext(event: CalendarEvent): Promise<BriefingContext> {
    const [channelIds, notionUrls, previousActionItems] = await Promise.allSettled([
      this.channelDiscovery.discoverChannels(event),
      Promise.resolve(extractNotionUrls(event.description || '')),
      event.recurringEventId
        ? Promise.resolve(this.stateStore.getActionItemsForRecurring(event.recurringEventId, true))
        : Promise.resolve([]),
    ]);

    const resolvedChannelIds = channelIds.status === 'fulfilled' ? channelIds.value : [];
    const resolvedNotionUrls = notionUrls.status === 'fulfilled' ? notionUrls.value : [];
    const resolvedActionItems = previousActionItems.status === 'fulfilled' ? previousActionItems.value : [];

    // Resolve channel names from IDs
    let channelNameMap: Map<string, string> = new Map();
    try {
      const channels = await this.slackService.listBotChannels();
      for (const ch of channels) {
        channelNameMap.set(ch.id, ch.name);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to list channels for name resolution');
    }

    // Summarize each channel's messages
    const lookbackMs = this.config.slackLookbackDays * 24 * 60 * 60 * 1000;
    const oldest = String((Date.now() - lookbackMs) / 1000);

    const channelSummaryPromises = resolvedChannelIds.map((channelId) => {
      const channelName = channelNameMap.get(channelId) || channelId;
      return this.summarizeChannelMessages(channelId, channelName, oldest);
    });

    const channelSummaryResults = await Promise.allSettled(channelSummaryPromises);
    const slackChannelSummaries = channelSummaryResults
      .filter((r): r is PromiseFulfilledResult<{ channelName: string; summary: string }> => r.status === 'fulfilled')
      .map((r) => r.value);

    const agenda = extractAgenda(event.description || '');

    const attendees = event.attendees || [];

    return {
      slackChannelSummaries,
      notionDocSummaries: [],
      previousActionItems: resolvedActionItems.map((item) => ({
        item,
        completed: false,
      })),
      attendees,
      agenda,
      sourceLinks: {
        notionUrls: resolvedNotionUrls,
      },
    };
  }

  private async summarizeChannelMessages(
    channelId: string,
    channelName: string,
    oldest: string,
  ): Promise<{ channelName: string; summary: string }> {
    const messages = await this.slackService.getChannelHistory(channelId, oldest, {
      limit: this.config.slackMessageBatchSize * 10,
      includeThreads: true,
    });

    if (messages.length === 0) {
      return { channelName, summary: 'No recent activity' };
    }

    // Split into batches
    const batchSize = this.config.slackMessageBatchSize;
    const batches: typeof messages[] = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }

    // Summarize each batch
    const batchSummaries: string[] = [];
    for (const batch of batches) {
      const messagesText = batch
        .map((m) => `${m.user || 'unknown'}: ${m.text || ''}`)
        .join('\n');

      const prompt = this.promptTemplateManager.getPrompt('slack_summarize_batch', {
        channel_name: channelName,
        messages: messagesText,
        meeting_title: '',
      });

      try {
        const response = await this.samplingService.sendSamplingRequest({
          messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
          maxTokens: 4096,
          systemPrompt: 'You are a meeting intelligence assistant.',
        });
        batchSummaries.push(response.content.text);
      } catch (error) {
        if (error instanceof SamplingError) {
          logger.warn({ error: error.message, channelName }, 'Sampling failed for batch summarization');
          batchSummaries.push(`[Batch summary unavailable for #${channelName}]`);
        } else {
          throw error;
        }
      }
    }

    // Aggregate summaries
    if (batchSummaries.length === 1) {
      return { channelName, summary: batchSummaries[0] };
    }

    const channelSummariesText = batchSummaries
      .map((s, i) => `Batch ${i + 1}:\n${s}`)
      .join('\n\n');

    const aggregatePrompt = this.promptTemplateManager.getPrompt('slack_summarize_aggregate', {
      meeting_title: '',
      channel_summaries: channelSummariesText,
    });

    try {
      const response = await this.samplingService.sendSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: aggregatePrompt } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });
      return { channelName, summary: response.content.text };
    } catch (error) {
      if (error instanceof SamplingError) {
        logger.warn({ error: error.message, channelName }, 'Sampling failed for aggregate summarization');
        return { channelName, summary: batchSummaries.join('\n\n') };
      }
      throw error;
    }
  }

  private buildFallbackBriefing(context: BriefingContext): string {
    const parts: string[] = [];

    if (context.agenda) {
      parts.push(`*Agenda:*\n${context.agenda}`);
    }

    if (context.slackChannelSummaries.length > 0) {
      const summaries = context.slackChannelSummaries
        .map((s) => `*#${s.channelName}:* ${s.summary}`)
        .join('\n');
      parts.push(`*Slack Context:*\n${summaries}`);
    }

    if (context.previousActionItems.length > 0) {
      const items = context.previousActionItems
        .map((ai) => `- [${ai.completed ? 'x' : ' '}] ${ai.item.description}`)
        .join('\n');
      parts.push(`*Previous Action Items:*\n${items}`);
    }

    return parts.join('\n\n') || 'No context available for this meeting.';
  }
}
