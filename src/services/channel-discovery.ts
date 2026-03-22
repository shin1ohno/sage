/**
 * ChannelDiscovery
 *
 * Discovers relevant Slack channels for a meeting using manual mappings,
 * cached results, and LLM-based inference.
 *
 * Requirements: R6.1-R6.5
 */

import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { PipelineStateStore } from './pipeline-state-store.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('channel-discovery');

/**
 * Interface for SlackService dependency
 */
export interface SlackServiceLike {
  listBotChannels(): Promise<Array<{ id: string; name: string }>>;
}

/**
 * Interface for SamplingService dependency
 */
export interface SamplingServiceLike {
  sendSamplingRequest(params: {
    messages: Array<{ role: string; content: { type: string; text: string } }>;
    maxTokens: number;
    systemPrompt?: string;
  }): Promise<{ content: { type: string; text: string }; model: string }>;
}

/**
 * Interface for PromptTemplateManager dependency
 */
export interface PromptTemplateManagerLike {
  getPrompt(
    templateName: string,
    variables: Record<string, string>
  ): string;
}

export class ChannelDiscovery {
  private slackService: SlackServiceLike;
  private samplingService: SamplingServiceLike;
  private stateStore: PipelineStateStore;
  private promptTemplateManager: PromptTemplateManagerLike;
  private manualMappings: Map<string, string[]> = new Map();

  constructor(
    slackService: SlackServiceLike,
    samplingService: SamplingServiceLike,
    stateStore: PipelineStateStore,
    promptTemplateManager: PromptTemplateManagerLike
  ) {
    this.slackService = slackService;
    this.samplingService = samplingService;
    this.stateStore = stateStore;
    this.promptTemplateManager = promptTemplateManager;
  }

  /**
   * Discover channels for a calendar event.
   *
   * Priority order:
   * 1. Manual mappings (regex or substring match)
   * 2. Cached results from PipelineStateStore
   * 3. LLM-based channel inference
   */
  async discoverChannels(event: CalendarEvent): Promise<string[]> {
    // 1. Check manual mappings
    for (const [pattern, channelIds] of this.manualMappings.entries()) {
      if (this.matchesPattern(event.title, pattern)) {
        logger.info({ pattern, title: event.title }, 'Manual mapping match');
        return channelIds;
      }
    }

    // 2. Check cache
    const cacheKey = event.recurringEventId || event.title;
    const cached = this.stateStore.getChannelMapping(cacheKey);
    if (cached !== null) {
      logger.info({ cacheKey }, 'Cache hit for channel mapping');
      return cached;
    }

    // 3. LLM inference
    try {
      const channels = await this.slackService.listBotChannels();
      const channelList = channels.map((c) => `${c.id}: #${c.name}`).join('\n');

      const prompt = this.promptTemplateManager.getPrompt('channel_discovery', {
        title: event.title,
        description: event.description || '',
        attendees: (event.attendees || []).join(', '),
        channels: channelList,
      });

      const response = await this.samplingService.sendSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });

      const channelIds = this.extractChannelIds(response.content.text, channels);

      // Cache the result
      this.stateStore.setChannelMapping(cacheKey, channelIds);

      logger.info({ cacheKey, channelIds }, 'Discovered channels via LLM');
      return channelIds;
    } catch (error) {
      logger.error({ err: error, title: event.title }, 'Failed to discover channels via LLM');
      return [];
    }
  }

  /**
   * Get manual mappings for a meeting pattern
   */
  getManualMappings(meetingPattern: string): string[] {
    return this.manualMappings.get(meetingPattern) || [];
  }

  /**
   * Set manual mapping for a meeting pattern
   */
  setManualMapping(meetingPattern: string, channelIds: string[]): void {
    this.manualMappings.set(meetingPattern, channelIds);
  }

  /**
   * Check if event title matches a pattern.
   * Patterns wrapped in / are treated as regex, otherwise substring match.
   */
  private matchesPattern(title: string, pattern: string): boolean {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(title);
    }
    return title.toLowerCase().includes(pattern.toLowerCase());
  }

  /**
   * Extract channel IDs from LLM response text.
   * Tries JSON parse first, then falls back to text extraction.
   */
  private extractChannelIds(
    text: string,
    knownChannels: Array<{ id: string; name: string }>
  ): string[] {
    const knownIds = new Set(knownChannels.map((c) => c.id));

    // Try JSON parse
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter((id: string) => typeof id === 'string' && knownIds.has(id));
      }
      if (parsed.channels && Array.isArray(parsed.channels)) {
        return parsed.channels.filter((id: string) => typeof id === 'string' && knownIds.has(id));
      }
    } catch {
      // Not JSON, fall through to text extraction
    }

    // Extract channel IDs from text (pattern: C followed by alphanumeric)
    const idPattern = /\b(C[A-Z0-9]+)\b/g;
    const matches = text.match(idPattern) || [];
    return matches.filter((id) => knownIds.has(id));
  }
}
