/**
 * BriefingGenerator Unit Tests
 * Requirements: R3.1-R3.5, R3.11, R5.1-R5.4
 */

import { BriefingGenerator } from '../../src/services/briefing-generator.js';
import type {
  SlackServiceInterface,
  ChannelDiscoveryService,
  PromptTemplateManagerInterface,
  PipelineStateStoreService,
  SamplingServiceInterface,
  MeetingIntelligenceConfig,
  ActionItem,
} from '../../src/services/briefing-generator.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

// Suppress logger output during tests
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

function createMockSlackService(): jest.Mocked<SlackServiceInterface> {
  return {
    getChannelHistory: jest.fn().mockResolvedValue([]),
    getChannelInfo: jest.fn().mockResolvedValue({ name: 'general' }),
    sendDirectMessage: jest.fn().mockResolvedValue('1234567890.123456'),
    listBotChannels: jest.fn().mockResolvedValue([]),
  };
}

function createMockChannelDiscovery(): jest.Mocked<ChannelDiscoveryService> {
  return {
    discoverChannels: jest.fn().mockResolvedValue(['C123', 'C456']),
  };
}

function createMockPromptTemplateManager(): jest.Mocked<PromptTemplateManagerInterface> {
  return {
    getPrompt: jest.fn().mockReturnValue('mock prompt'),
  };
}

function createMockPipelineStateStore(): jest.Mocked<PipelineStateStoreService> {
  return {
    getMeetingState: jest.fn().mockReturnValue(null),
    updateMeetingState: jest.fn(),
    getActionItemsForRecurring: jest.fn().mockReturnValue([]),
    setBriefingStatus: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockSamplingService(): jest.Mocked<SamplingServiceInterface> {
  return {
    createMessage: jest.fn().mockResolvedValue({
      content: { type: 'text', text: 'LLM generated briefing content' },
      model: 'claude-3',
    }),
  };
}

function createDefaultConfig(): MeetingIntelligenceConfig {
  return {
    enabled: true,
    briefingWindow: 15,
    slackLookbackDays: 7,
    slackMessageBatchSize: 50,
    minimumAttendees: 2,
    postMeetingPollInterval: 15,
    postMeetingTimeout: 24,
    postMeetingDelay: 30,
    meetingEndBuffer: 10,
    excludePatterns: [],
    dailySummaryEnabled: true,
    promptsDir: '~/.sage/prompts/',
    preMeetingPollInterval: 5,
  };
}

function createTestEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-123',
    title: 'Weekly Team Standup',
    start: '2026-03-22T10:00:00Z',
    end: '2026-03-22T10:30:00Z',
    isAllDay: false,
    source: 'google',
    attendees: ['alice@example.com', 'bob@example.com'],
    description: 'Weekly standup meeting',
    recurringEventId: 'recurring-123',
    ...overrides,
  };
}

describe('BriefingGenerator', () => {
  let slackService: jest.Mocked<SlackServiceInterface>;
  let channelDiscovery: jest.Mocked<ChannelDiscoveryService>;
  let promptTemplateManager: jest.Mocked<PromptTemplateManagerInterface>;
  let pipelineStateStore: jest.Mocked<PipelineStateStoreService>;
  let samplingService: jest.Mocked<SamplingServiceInterface>;
  let config: MeetingIntelligenceConfig;
  let mockExtractNotionUrls: jest.Mock;
  let mockFormatBriefing: jest.Mock;
  let generator: BriefingGenerator;

  beforeEach(() => {
    slackService = createMockSlackService();
    channelDiscovery = createMockChannelDiscovery();
    promptTemplateManager = createMockPromptTemplateManager();
    pipelineStateStore = createMockPipelineStateStore();
    samplingService = createMockSamplingService();
    config = createDefaultConfig();
    mockExtractNotionUrls = jest.fn().mockReturnValue([]);
    mockFormatBriefing = jest.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'briefing' } }]);

    generator = new BriefingGenerator(
      slackService,
      channelDiscovery,
      promptTemplateManager,
      pipelineStateStore,
      samplingService,
      config,
      mockExtractNotionUrls,
      mockFormatBriefing,
    );
  });

  describe('generateBriefing', () => {
    it('should generate briefing and send via Slack DM', async () => {
      const event = createTestEvent();

      const result = await generator.generateBriefing(event);

      expect(result).toEqual({ status: 'sent', messageTs: '1234567890.123456' });
      expect(channelDiscovery.discoverChannels).toHaveBeenCalledWith(event, event.attendees);
      expect(slackService.sendDirectMessage).toHaveBeenCalled();
      expect(pipelineStateStore.setBriefingStatus).toHaveBeenCalledWith(event.id, {
        status: 'sent',
        sentAt: expect.any(String),
      });
    });

    it('should skip if briefing already sent', async () => {
      const event = createTestEvent();
      pipelineStateStore.getMeetingState.mockReturnValue({
        briefing: { status: 'sent', sentAt: '2026-03-22T09:00:00Z' },
      });

      const result = await generator.generateBriefing(event);

      expect(result).toEqual({ status: 'skipped', reason: 'already sent' });
      expect(channelDiscovery.discoverChannels).not.toHaveBeenCalled();
      expect(slackService.sendDirectMessage).not.toHaveBeenCalled();
    });

    it('should update meeting state after sending', async () => {
      const event = createTestEvent();

      await generator.generateBriefing(event);

      expect(pipelineStateStore.setBriefingStatus).toHaveBeenCalledWith('event-123', {
        status: 'sent',
        sentAt: expect.any(String),
      });
    });

    it('should return skipped on error', async () => {
      const event = createTestEvent();
      samplingService.createMessage.mockRejectedValue(new Error('LLM unavailable'));

      const result = await generator.generateBriefing(event);

      expect(result).toEqual({ status: 'skipped', reason: 'LLM unavailable' });
      expect(pipelineStateStore.setBriefingStatus).toHaveBeenCalledWith(event.id, {
        status: 'error',
        error: 'LLM unavailable',
      });
    });

    it('should discover channels and fetch summaries in parallel', async () => {
      const event = createTestEvent();
      channelDiscovery.discoverChannels.mockResolvedValue(['C001', 'C002']);
      slackService.getChannelInfo.mockImplementation(async (id) => ({ name: `channel-${id}` }));
      slackService.getChannelHistory.mockResolvedValue([
        { text: 'message 1', ts: '1' },
        { text: 'message 2', ts: '2' },
      ]);

      await generator.generateBriefing(event);

      // Both channels should have been queried
      expect(slackService.getChannelHistory).toHaveBeenCalledTimes(2);
      expect(slackService.getChannelInfo).toHaveBeenCalledTimes(2);
    });

    it('should handle two-stage summarization for large message sets', async () => {
      const event = createTestEvent();
      channelDiscovery.discoverChannels.mockResolvedValue(['C001']);

      // Create enough messages to trigger multi-batch (>50 by default)
      const manyMessages = Array.from({ length: 120 }, (_, i) => ({
        text: `message ${i}`,
        ts: String(i),
      }));
      slackService.getChannelHistory.mockResolvedValue(manyMessages);

      // Track prompt calls
      let batchCallCount = 0;
      let aggregateCallCount = 0;
      promptTemplateManager.getPrompt.mockImplementation((name) => {
        if (name === 'slack_summarize_batch') batchCallCount++;
        if (name === 'slack_summarize_aggregate') aggregateCallCount++;
        return `mock ${name} prompt`;
      });

      await generator.generateBriefing(event);

      // 120 messages / 50 batch size = 3 batches
      expect(batchCallCount).toBe(3);
      // Aggregate call should happen once since there are multiple batches
      expect(aggregateCallCount).toBe(1);
    });

    it('should handle missing sources gracefully', async () => {
      const event = createTestEvent({ description: undefined, recurringEventId: undefined });
      channelDiscovery.discoverChannels.mockResolvedValue([]);

      const result = await generator.generateBriefing(event);

      expect(result.status).toBe('sent');
      // Should still call LLM to generate briefing even without channel summaries
      expect(samplingService.createMessage).toHaveBeenCalled();
    });

    it('should collect Notion doc summaries from event description URLs', async () => {
      const event = createTestEvent({
        description: 'Agenda: https://notion.so/doc1 and https://notion.so/doc2',
      });
      mockExtractNotionUrls.mockReturnValue(['https://notion.so/doc1', 'https://notion.so/doc2']);

      await generator.generateBriefing(event);

      expect(mockExtractNotionUrls).toHaveBeenCalledWith(event.description);
      // 2 Notion doc summaries + channel batch summaries + final briefing generation
      expect(samplingService.createMessage).toHaveBeenCalled();
    });

    it('should get previous action items for recurring events', async () => {
      const event = createTestEvent({ recurringEventId: 'recurring-abc' });
      const previousItems: ActionItem[] = [{
        id: 'action-1',
        description: 'Follow up on design review',
        dueDate: '2026-03-20T00:00:00Z',
        source: 'transcript',
        meetingEventId: 'event-old',
        reminderCreated: false,
        createdAt: '2026-03-15T00:00:00Z',
      }];
      pipelineStateStore.getActionItemsForRecurring.mockReturnValue(previousItems);

      await generator.generateBriefing(event);

      expect(pipelineStateStore.getActionItemsForRecurring).toHaveBeenCalledWith('recurring-abc', true);
    });

    it('should format briefing and send blocks via Slack', async () => {
      const event = createTestEvent();
      const mockBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'formatted briefing' } }];
      mockFormatBriefing.mockReturnValue(mockBlocks);

      await generator.generateBriefing(event);

      expect(mockFormatBriefing).toHaveBeenCalledWith(
        event.title,
        event.start,
        'LLM generated briefing content',
        expect.objectContaining({ notionUrls: expect.any(Array) }),
      );
      expect(slackService.sendDirectMessage).toHaveBeenCalledWith(mockBlocks);
    });

    it('should handle channel summarization failure gracefully', async () => {
      const event = createTestEvent();
      channelDiscovery.discoverChannels.mockResolvedValue(['C001']);
      slackService.getChannelInfo.mockRejectedValue(new Error('Channel not found'));

      const result = await generator.generateBriefing(event);

      // Should still produce a briefing despite channel failure
      expect(result.status).toBe('sent');
    });
  });
});
