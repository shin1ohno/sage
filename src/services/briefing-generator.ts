/**
 * BriefingGenerator
 *
 * Generates pre-meeting briefings by collecting context from Slack channels,
 * Notion documents, and previous action items, then using LLM to produce
 * a formatted briefing delivered via Slack DM.
 *
 * Requirements: R3.1-R3.5, R3.11, R5.1-R5.4
 */

import { createLogger } from '../utils/logger.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';

const logger = createLogger('briefing');

// Interfaces for dependencies that will be provided by other layers

export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  assigneeEmail?: string;
  assigneeSlackId?: string;
  dueDate: string;
  source: string;
  meetingEventId: string;
  reminderCreated: boolean;
  createdAt: string;
}

export interface SourceLinks {
  notionUrls: string[];
  transcriptUrl?: string;
  slackChannelUrls?: string[];
}

export interface BriefingContext {
  slackChannelSummaries: Array<{ channelName: string; summary: string }>;
  notionDocSummaries: string[];
  previousActionItems: ActionItem[];
  attendees: string[];
  agenda?: string;
  sourceLinks: SourceLinks;
}

export type BriefingResult =
  | { status: 'sent'; messageTs: string }
  | { status: 'skipped'; reason: string };

export interface ChannelDiscoveryService {
  discoverChannels(event: CalendarEvent, attendees: string[]): Promise<string[]>;
}

export interface PipelineStateStoreService {
  getMeetingState(id: string): any;
  updateMeetingState(id: string, update: any): void;
  getActionItemsForRecurring(recurringEventId: string, lastOnly: boolean): ActionItem[];
  setBriefingStatus(eventId: string, status: { status: string; sentAt?: string; error?: string }): void;
  save(): Promise<void>;
}

export interface SamplingServiceInterface {
  createMessage(params: any): Promise<any>;
}

export interface SlackServiceInterface {
  getChannelHistory(channelId: string, oldest: string, options?: any): Promise<any[]>;
  getChannelInfo(channelId: string): Promise<{ name: string } | null>;
  sendDirectMessage(blocks: any[]): Promise<string>;
  listBotChannels(): Promise<Array<{ id: string; name: string }>>;
}

export interface PromptTemplateManagerInterface {
  getPrompt(name: string, vars: Record<string, any>): string;
}

export interface MeetingIntelligenceConfig {
  enabled: boolean;
  briefingWindow: number;
  slackLookbackDays: number;
  slackMessageBatchSize: number;
  minimumAttendees: number;
  postMeetingPollInterval: number;
  postMeetingTimeout: number;
  postMeetingDelay: number;
  meetingEndBuffer: number;
  excludePatterns: Array<{ type: string; pattern: string }>;
  dailySummaryEnabled: boolean;
  promptsDir: string;
  preMeetingPollInterval: number;
}

// Utility function types (from modules not yet implemented)
type ExtractNotionUrlsFn = (description: string | undefined) => string[];
type FormatBriefingFn = (title: string, start: string, content: string, sourceLinks: SourceLinks) => any[];

/**
 * BriefingGenerator class
 *
 * Orchestrates the full pre-meeting briefing flow:
 * 1. Check if briefing already sent
 * 2. Discover relevant Slack channels
 * 3. Fetch and summarize Slack channel messages
 * 4. Collect Notion doc summaries
 * 5. Get previous action items
 * 6. Build BriefingContext
 * 7. Generate briefing via LLM
 * 8. Format and send via Slack DM
 * 9. Update meeting state
 */
export class BriefingGenerator {
  private slackService: SlackServiceInterface;
  private channelDiscovery: ChannelDiscoveryService;
  private promptTemplateManager: PromptTemplateManagerInterface;
  private pipelineStateStore: PipelineStateStoreService;
  private samplingService: SamplingServiceInterface;
  private config: MeetingIntelligenceConfig;
  private extractNotionUrls: ExtractNotionUrlsFn;
  private formatBriefing: FormatBriefingFn;

  constructor(
    slackService: SlackServiceInterface,
    channelDiscovery: ChannelDiscoveryService,
    promptTemplateManager: PromptTemplateManagerInterface,
    pipelineStateStore: PipelineStateStoreService,
    samplingService: SamplingServiceInterface,
    config: MeetingIntelligenceConfig,
    extractNotionUrls: ExtractNotionUrlsFn = defaultExtractNotionUrls,
    formatBriefing: FormatBriefingFn = defaultFormatBriefing,
  ) {
    this.slackService = slackService;
    this.channelDiscovery = channelDiscovery;
    this.promptTemplateManager = promptTemplateManager;
    this.pipelineStateStore = pipelineStateStore;
    this.samplingService = samplingService;
    this.config = config;
    this.extractNotionUrls = extractNotionUrls;
    this.formatBriefing = formatBriefing;
  }

  /**
   * Generate and send a pre-meeting briefing for the given calendar event.
   */
  async generateBriefing(event: CalendarEvent): Promise<BriefingResult> {
    try {
      // 1. Check if briefing already sent
      const existingState = this.pipelineStateStore.getMeetingState(event.id);
      if (existingState?.briefing?.status === 'sent') {
        logger.info({ eventId: event.id }, 'Briefing already sent, skipping');
        return { status: 'skipped', reason: 'already sent' };
      }

      // 2. Discover relevant Slack channels
      const attendees = event.attendees ?? [];
      const channelIds = await this.channelDiscovery.discoverChannels(event, attendees);
      logger.debug({ eventId: event.id, channelCount: channelIds.length }, 'Discovered channels');

      // 3. Fetch and summarize Slack channel messages (batch summarization)
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - this.config.slackLookbackDays);
      const oldest = String(Math.floor(lookbackDate.getTime() / 1000));

      const channelSummaries = await Promise.all(
        channelIds.map(async (channelId) => {
          try {
            return await this.summarizeChannelMessages(channelId, oldest);
          } catch (err) {
            logger.warn({ channelId, error: err }, 'Failed to summarize channel');
            return { channelName: channelId, summary: 'Failed to retrieve messages' };
          }
        }),
      );

      // 4. Collect Notion doc summaries from event description URLs
      const notionUrls = this.extractNotionUrls(event.description);
      const notionDocSummaries: string[] = [];
      for (const url of notionUrls) {
        try {
          const response = await this.samplingService.createMessage({
            messages: [{ role: 'user', content: { type: 'text', text: `Summarize the Notion document at: ${url}` } }],
            maxTokens: 2048,
            systemPrompt: 'You are a meeting intelligence assistant.',
          });
          notionDocSummaries.push(response.content.text);
        } catch (err) {
          logger.warn({ url, error: err }, 'Failed to summarize Notion doc');
        }
      }

      // 5. Get previous action items
      let previousActionItems: ActionItem[] = [];
      if (event.recurringEventId) {
        previousActionItems = this.pipelineStateStore.getActionItemsForRecurring(event.recurringEventId, true);
      }

      // 6. Build BriefingContext
      const sourceLinks: SourceLinks = {
        notionUrls,
        slackChannelUrls: channelIds.map((id) => `https://slack.com/app_redirect?channel=${id}`),
      };

      const context: BriefingContext = {
        slackChannelSummaries: channelSummaries,
        notionDocSummaries,
        previousActionItems,
        attendees,
        sourceLinks,
      };

      // 7. Generate briefing via LLM
      const prompt = this.promptTemplateManager.getPrompt('briefing_generate', {
        title: event.title,
        start: event.start,
        attendees,
        channelSummaries: context.slackChannelSummaries,
        notionSummaries: context.notionDocSummaries,
        previousActionItems: context.previousActionItems,
      });

      const llmResponse = await this.samplingService.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });

      const briefingContent = llmResponse.content.text;

      // 8. Format as Slack blocks and send via SlackService
      const blocks = this.formatBriefing(event.title, event.start, briefingContent, context.sourceLinks);
      const messageTs = await this.slackService.sendDirectMessage(blocks);

      // 9. Update meeting state
      this.pipelineStateStore.setBriefingStatus(event.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
      });

      logger.info({ eventId: event.id }, 'Briefing sent successfully');
      return { status: 'sent', messageTs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ eventId: event.id, error: message }, 'Failed to generate briefing');
      this.pipelineStateStore.setBriefingStatus(event.id, {
        status: 'error',
        error: message,
      });
      return { status: 'skipped', reason: message };
    }
  }

  /**
   * Fetch messages from a Slack channel and produce a summary using
   * batch + aggregate two-stage summarization.
   */
  private async summarizeChannelMessages(
    channelId: string,
    oldest: string,
  ): Promise<{ channelName: string; summary: string }> {
    const channelInfo = await this.slackService.getChannelInfo(channelId);
    const channelName = channelInfo?.name ?? channelId;

    const messages = await this.slackService.getChannelHistory(channelId, oldest, {
      limit: this.config.slackMessageBatchSize * 10,
      includeThreads: true,
    });

    if (!messages || messages.length === 0) {
      return { channelName, summary: 'No recent activity' };
    }

    // Stage 1: Batch summarization
    const batchSize = this.config.slackMessageBatchSize;
    const batches: any[][] = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }

    const batchSummaries = await Promise.all(
      batches.map(async (batch) => {
        const prompt = this.promptTemplateManager.getPrompt('slack_summarize_batch', {
          channelName,
          messages: batch,
        });
        const response = await this.samplingService.createMessage({
          messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
          maxTokens: 2048,
          systemPrompt: 'You are a meeting intelligence assistant.',
        });
        return response.content.text;
      }),
    );

    // Stage 2: Aggregate summarization
    if (batchSummaries.length === 1) {
      return { channelName, summary: batchSummaries[0] };
    }

    const aggregatePrompt = this.promptTemplateManager.getPrompt('slack_summarize_aggregate', {
      channelName,
      batchSummaries,
    });
    const aggregateResponse = await this.samplingService.createMessage({
      messages: [{ role: 'user', content: { type: 'text', text: aggregatePrompt } }],
      maxTokens: 2048,
      systemPrompt: 'You are a meeting intelligence assistant.',
    });

    return { channelName, summary: aggregateResponse.content.text };
  }
}

// Default stub implementations for utility functions
function defaultExtractNotionUrls(_description: string | undefined): string[] {
  return [];
}

function defaultFormatBriefing(title: string, _start: string, content: string, _sourceLinks: SourceLinks): any[] {
  return [{ type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n${content}` } }];
}
