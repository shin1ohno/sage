import { ChannelDiscovery } from '../../src/services/channel-discovery.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

const mockSlackService = { listBotChannels: jest.fn().mockResolvedValue([]) };
const mockSamplingService = { sendSamplingRequest: jest.fn().mockResolvedValue({ content: { text: '[]' } }) };
const mockStateStore = { getChannelMapping: jest.fn().mockReturnValue(null), setChannelMapping: jest.fn() };
const mockPromptTemplateManager = { getPrompt: jest.fn().mockReturnValue('test prompt') };

const testEvent: CalendarEvent = {
  id: 'evt-1',
  title: 'Team Standup',
  start: '2026-02-28T09:00:00Z',
  end: '2026-02-28T09:30:00Z',
  isAllDay: false,
  source: 'google',
};

describe('ChannelDiscovery', () => {
  let discovery: ChannelDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks only clears call history, not mock implementations.
    // Reset default return values explicitly so tests don't leak state.
    mockSlackService.listBotChannels.mockResolvedValue([]);
    mockSamplingService.sendSamplingRequest.mockResolvedValue({ content: { text: '[]' } });
    mockStateStore.getChannelMapping.mockReturnValue(null);
    mockStateStore.setChannelMapping.mockReturnValue(undefined);
    mockPromptTemplateManager.getPrompt.mockReturnValue('test prompt');
    discovery = new ChannelDiscovery(
      mockSlackService as never,
      mockSamplingService as never,
      mockStateStore as never,
      mockPromptTemplateManager as never,
    );
  });

  describe('discoverChannels', () => {
    it('manual mapping takes priority', async () => {
      discovery.setManualMapping('Team Standup', ['C_MANUAL']);

      const result = await discovery.discoverChannels(testEvent);

      expect(result).toEqual(['C_MANUAL']);
      expect(mockSlackService.listBotChannels).not.toHaveBeenCalled();
    });

    it('regex pattern matching works', async () => {
      discovery.setManualMapping('/standup/i', ['C_REGEX']);

      // Regex pattern: /standup/i wrapping is by convention /pattern/
      // The matchesPattern method uses new RegExp(pattern.slice(1, -1))
      // so /Standup/ matches 'Team Standup'
      discovery.setManualMapping('/Standup/', ['C_REGEX']);

      const result = await discovery.discoverChannels(testEvent);

      expect(result).toEqual(['C_REGEX']);
    });

    it('cache hit returns cached value', async () => {
      mockStateStore.getChannelMapping.mockReturnValue(['C_CACHED']);

      const result = await discovery.discoverChannels(testEvent);

      expect(result).toEqual(['C_CACHED']);
      expect(mockSlackService.listBotChannels).not.toHaveBeenCalled();
    });

    it('LLM inference discovers channels', async () => {
      mockSlackService.listBotChannels.mockResolvedValue([
        { id: 'C_GENERAL', name: 'general' },
        { id: 'C_STANDUP', name: 'standup' },
      ]);
      mockSamplingService.sendSamplingRequest.mockResolvedValue({
        content: { text: '["C_STANDUP"]' },
      });

      const result = await discovery.discoverChannels(testEvent);

      expect(result).toEqual(['C_STANDUP']);
      expect(mockSamplingService.sendSamplingRequest).toHaveBeenCalled();
    });

    it('caches LLM results', async () => {
      mockSlackService.listBotChannels.mockResolvedValue([
        { id: 'C_STANDUP', name: 'standup' },
      ]);
      mockSamplingService.sendSamplingRequest.mockResolvedValue({
        content: { text: '["C_STANDUP"]' },
      });

      await discovery.discoverChannels(testEvent);

      expect(mockStateStore.setChannelMapping).toHaveBeenCalledWith(
        testEvent.title,
        ['C_STANDUP'],
      );
    });

    it('returns empty array when no channels found', async () => {
      mockSlackService.listBotChannels.mockRejectedValue(new Error('Slack error'));

      const result = await discovery.discoverChannels(testEvent);

      expect(result).toEqual([]);
    });
  });

  describe('getManualMappings / setManualMapping', () => {
    it('gets and sets manual mappings', () => {
      expect(discovery.getManualMappings('Team Standup')).toEqual([]);

      discovery.setManualMapping('Team Standup', ['C_MANUAL']);

      expect(discovery.getManualMappings('Team Standup')).toEqual(['C_MANUAL']);
    });
  });
});
