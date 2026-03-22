/**
 * ChannelDiscovery Tests
 */

import { ChannelDiscovery } from '../../src/services/channel-discovery.js';
import type { SlackServiceLike, SamplingServiceLike, PromptTemplateManagerLike } from '../../src/services/channel-discovery.js';
import type { PipelineStateStore } from '../../src/services/pipeline-state-store.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

jest.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('ChannelDiscovery', () => {
  let discovery: ChannelDiscovery;
  let mockSlackService: jest.Mocked<SlackServiceLike>;
  let mockSamplingService: jest.Mocked<SamplingServiceLike>;
  let mockStateStore: jest.Mocked<Pick<PipelineStateStore, 'getChannelMapping' | 'setChannelMapping'>>;
  let mockPromptTemplateManager: jest.Mocked<PromptTemplateManagerLike>;

  const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'event-1',
    title: 'Weekly Standup',
    start: '2026-01-01T09:00:00.000Z',
    end: '2026-01-01T09:30:00.000Z',
    isAllDay: false,
    source: 'google',
    attendees: ['alice@example.com', 'bob@example.com'],
    description: 'Weekly sync meeting',
    ...overrides,
  });

  beforeEach(() => {
    mockSlackService = {
      listBotChannels: jest.fn().mockResolvedValue([
        { id: 'C001', name: 'engineering' },
        { id: 'C002', name: 'standup' },
        { id: 'C003', name: 'general' },
      ]),
    };

    mockSamplingService = {
      sendSamplingRequest: jest.fn().mockResolvedValue({
        content: { type: 'text', text: '["C001", "C002"]' },
        model: 'claude-3',
      }),
    };

    mockStateStore = {
      getChannelMapping: jest.fn().mockReturnValue(null),
      setChannelMapping: jest.fn(),
    };

    mockPromptTemplateManager = {
      getPrompt: jest.fn().mockReturnValue('Find relevant channels for: Weekly Standup'),
    };

    discovery = new ChannelDiscovery(
      mockSlackService,
      mockSamplingService,
      mockStateStore as unknown as PipelineStateStore,
      mockPromptTemplateManager,
    );
  });

  // ------------------------------------------------------------------
  // Manual mappings
  // ------------------------------------------------------------------

  describe('discoverChannels - manual mappings', () => {
    it('returns manual mapping when title matches (highest priority)', async () => {
      discovery.setManualMapping('standup', ['C999']);

      const result = await discovery.discoverChannels(makeEvent({ title: 'Weekly Standup' }));

      expect(result).toEqual(['C999']);
      // Should not call LLM or cache
      expect(mockSamplingService.sendSamplingRequest).not.toHaveBeenCalled();
      expect(mockStateStore.getChannelMapping).not.toHaveBeenCalled();
    });

    it('matches regex patterns wrapped in slashes', async () => {
      discovery.setManualMapping('/^weekly/i', ['C888']);

      // Note: the regex /^weekly/ doesn't have the i flag in our implementation
      // since we strip the slashes and use RegExp constructor
      discovery.setManualMapping('/Weekly/', ['C888']);

      const result = await discovery.discoverChannels(makeEvent({ title: 'Weekly Standup' }));

      expect(result).toEqual(['C888']);
    });
  });

  // ------------------------------------------------------------------
  // Cache
  // ------------------------------------------------------------------

  describe('discoverChannels - cache', () => {
    it('returns cached channels on cache hit', async () => {
      mockStateStore.getChannelMapping.mockReturnValue(['C001']);

      const result = await discovery.discoverChannels(makeEvent());

      expect(result).toEqual(['C001']);
      expect(mockSamplingService.sendSamplingRequest).not.toHaveBeenCalled();
    });

    it('uses recurringEventId as cache key when available', async () => {
      mockStateStore.getChannelMapping.mockReturnValue(['C002']);

      await discovery.discoverChannels(
        makeEvent({ recurringEventId: 'rec-1' })
      );

      expect(mockStateStore.getChannelMapping).toHaveBeenCalledWith('rec-1');
    });

    it('uses title as cache key when no recurringEventId', async () => {
      mockStateStore.getChannelMapping.mockReturnValue(['C002']);

      await discovery.discoverChannels(makeEvent({ recurringEventId: undefined }));

      expect(mockStateStore.getChannelMapping).toHaveBeenCalledWith('Weekly Standup');
    });
  });

  // ------------------------------------------------------------------
  // LLM inference
  // ------------------------------------------------------------------

  describe('discoverChannels - LLM inference', () => {
    it('discovers channels via LLM when no manual mapping or cache', async () => {
      const result = await discovery.discoverChannels(makeEvent());

      expect(mockSlackService.listBotChannels).toHaveBeenCalled();
      expect(mockPromptTemplateManager.getPrompt).toHaveBeenCalledWith(
        'channel_discovery',
        expect.objectContaining({
          title: 'Weekly Standup',
          description: 'Weekly sync meeting',
        }),
      );
      expect(mockSamplingService.sendSamplingRequest).toHaveBeenCalled();
      expect(result).toEqual(['C001', 'C002']);
    });

    it('caches discovered channels in state store', async () => {
      await discovery.discoverChannels(makeEvent());

      expect(mockStateStore.setChannelMapping).toHaveBeenCalledWith(
        'Weekly Standup',
        ['C001', 'C002'],
      );
    });

    it('returns empty array when LLM fails', async () => {
      mockSamplingService.sendSamplingRequest.mockRejectedValue(new Error('LLM error'));

      const result = await discovery.discoverChannels(makeEvent());

      expect(result).toEqual([]);
    });

    it('returns empty array when no channels found in LLM response', async () => {
      mockSamplingService.sendSamplingRequest.mockResolvedValue({
        content: { type: 'text', text: 'No relevant channels found.' },
        model: 'claude-3',
      });

      const result = await discovery.discoverChannels(makeEvent());

      expect(result).toEqual([]);
    });

    it('extracts channel IDs from non-JSON text response', async () => {
      mockSamplingService.sendSamplingRequest.mockResolvedValue({
        content: { type: 'text', text: 'The relevant channels are C001 and C003.' },
        model: 'claude-3',
      });

      const result = await discovery.discoverChannels(makeEvent());

      expect(result).toEqual(['C001', 'C003']);
    });
  });

  // ------------------------------------------------------------------
  // getManualMappings / setManualMapping
  // ------------------------------------------------------------------

  describe('getManualMappings / setManualMapping', () => {
    it('returns empty array for unknown pattern', () => {
      expect(discovery.getManualMappings('nonexistent')).toEqual([]);
    });

    it('sets and gets manual mappings', () => {
      discovery.setManualMapping('standup', ['C001', 'C002']);

      expect(discovery.getManualMappings('standup')).toEqual(['C001', 'C002']);
    });
  });
});
