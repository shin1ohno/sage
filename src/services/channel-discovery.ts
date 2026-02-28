/**
 * Channel Discovery Service
 *
 * Discovers Slack channels relevant to calendar events using manual mappings,
 * cached results, and LLM-based inference via sampling.
 */

import type { SlackService } from '../integrations/slack-service.js';
import type { SamplingService } from './sampling-service.js';
import type { PipelineStateStore } from './pipeline-state-store.js';
import type { PromptTemplateManager } from './prompt-templates.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('channel-discovery');

export class ChannelDiscovery {
  private readonly slackService: SlackService;
  private readonly samplingService: SamplingService;
  private readonly stateStore: PipelineStateStore;
  private readonly promptTemplateManager: PromptTemplateManager;
  private manualMappings: Map<string, string[]> = new Map();

  constructor(
    slackService: SlackService,
    samplingService: SamplingService,
    stateStore: PipelineStateStore,
    promptTemplateManager: PromptTemplateManager,
  ) {
    this.slackService = slackService;
    this.samplingService = samplingService;
    this.stateStore = stateStore;
    this.promptTemplateManager = promptTemplateManager;
  }

  async discoverChannels(event: CalendarEvent): Promise<string[]> {
    // 1. Check manual mappings first
    for (const [pattern, channelIds] of this.manualMappings) {
      if (this.matchesPattern(pattern, event.title)) {
        logger.info({ pattern, title: event.title }, 'Manual mapping matched');
        return channelIds;
      }
    }

    // 2. Check cache
    const cacheKey = event.recurringEventId || event.title;
    const cached = this.stateStore.getChannelMapping(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Channel mapping cache hit');
      return cached;
    }

    // 3. LLM inference
    try {
      const channels = await this.slackService.listBotChannels();

      const attendees =
        event.attendeesDetailed
          ?.map((a) => a.email || a.displayName || '')
          .filter(Boolean)
          .join(', ') || 'none';

      const channelsFormatted = channels
        .map((c) => `${c.id}:${c.name}`)
        .join(', ');

      const prompt = this.promptTemplateManager.getPrompt('channel_discovery', {
        title: event.title,
        attendees,
        channels: channelsFormatted,
      });

      const response = await this.samplingService.sendSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });

      const result = response.content.text;
      const channelIds = this.parseChannelIds(result);

      this.stateStore.setChannelMapping(cacheKey, channelIds);
      logger.info({ cacheKey, channelIds }, 'Discovered channels via LLM');

      return channelIds;
    } catch (error) {
      logger.error({ error, title: event.title }, 'Failed to discover channels');
      return [];
    }
  }

  getManualMappings(meetingPattern: string): string[] {
    return this.manualMappings.get(meetingPattern) || [];
  }

  setManualMapping(meetingPattern: string, channelIds: string[]): void {
    this.manualMappings.set(meetingPattern, channelIds);
  }

  private matchesPattern(pattern: string, title: string): boolean {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(title);
    }
    return title.toLowerCase().includes(pattern.toLowerCase());
  }

  private parseChannelIds(text: string): string[] {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      logger.debug('JSON parse failed for channel IDs, falling back to regex extraction');
    }

    // Fallback: extract channel ID patterns (e.g., C01ABCDEF)
    const matches = text.match(/C[A-Z0-9]{8,}/g);
    return matches || [];
  }
}
