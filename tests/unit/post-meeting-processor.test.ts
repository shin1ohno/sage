/**
 * PostMeetingProcessor Unit Tests
 * Requirements: R4.1-R4.11
 */

import { PostMeetingProcessor } from '../../src/services/post-meeting-processor.js';
import type {
  SlackServiceInterface,
  GoogleDriveServiceInterface,
  PromptTemplateManagerInterface,
  PipelineStateStoreService,
  SamplingServiceInterface,
  MeetingIntelligenceConfig,
} from '../../src/services/post-meeting-processor.js';
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
    sendDirectMessage: jest.fn().mockResolvedValue('1234567890.123456'),
    lookupUser: jest.fn().mockResolvedValue(null),
  };
}

function createMockGoogleDriveService(): jest.Mocked<GoogleDriveServiceInterface> {
  return {
    findTranscript: jest.fn().mockResolvedValue(null),
    getFileContent: jest.fn().mockResolvedValue(''),
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
    recordActionItems: jest.fn(),
    setPostMeetingStatus: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockSamplingService(): jest.Mocked<SamplingServiceInterface> {
  return {
    createMessage: jest.fn().mockResolvedValue({
      content: {
        type: 'text',
        text: JSON.stringify({
          summary: 'Meeting discussed project timeline',
          actionItems: [
            { description: 'Update project plan', assignee: 'Alice', dueDate: '2026-03-29T00:00:00Z' },
          ],
        }),
      },
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
    id: 'event-456',
    title: 'Weekly Team Standup',
    start: '2026-03-22T10:00:00Z',
    end: '2026-03-22T10:30:00Z',
    isAllDay: false,
    source: 'google',
    attendees: ['alice@example.com', 'bob@example.com'],
    description: 'Weekly standup meeting',
    recurringEventId: 'recurring-456',
    ...overrides,
  };
}

describe('PostMeetingProcessor', () => {
  let slackService: jest.Mocked<SlackServiceInterface>;
  let googleDriveService: jest.Mocked<GoogleDriveServiceInterface>;
  let promptTemplateManager: jest.Mocked<PromptTemplateManagerInterface>;
  let pipelineStateStore: jest.Mocked<PipelineStateStoreService>;
  let samplingService: jest.Mocked<SamplingServiceInterface>;
  let config: MeetingIntelligenceConfig;
  let mockExtractNotionUrls: jest.Mock;
  let mockFormatPostMeetingReport: jest.Mock;
  let processor: PostMeetingProcessor;

  beforeEach(() => {
    slackService = createMockSlackService();
    googleDriveService = createMockGoogleDriveService();
    promptTemplateManager = createMockPromptTemplateManager();
    pipelineStateStore = createMockPipelineStateStore();
    samplingService = createMockSamplingService();
    config = createDefaultConfig();
    mockExtractNotionUrls = jest.fn().mockReturnValue([]);
    mockFormatPostMeetingReport = jest.fn().mockReturnValue([
      { type: 'section', text: { type: 'mrkdwn', text: 'report' } },
    ]);

    processor = new PostMeetingProcessor(
      slackService,
      googleDriveService,
      promptTemplateManager,
      pipelineStateStore,
      samplingService,
      config,
      mockExtractNotionUrls,
      mockFormatPostMeetingReport,
    );
  });

  describe('pollForReadiness', () => {
    it('should check transcript and Notion notes in parallel', async () => {
      const event = createTestEvent();
      googleDriveService.findTranscript.mockResolvedValue({ id: 'file-1', name: 'transcript.txt' });
      googleDriveService.getFileContent.mockResolvedValue('Meeting transcript content');

      const result = await processor.pollForReadiness(event);

      expect(result.status).toBe('ready');
      expect(googleDriveService.findTranscript).toHaveBeenCalledWith(event);
    });

    it('should return waiting when neither source is available', async () => {
      const event = createTestEvent();
      googleDriveService.findTranscript.mockResolvedValue(null);
      mockExtractNotionUrls.mockReturnValue([]);

      const result = await processor.pollForReadiness(event);

      expect(result).toEqual({ status: 'waiting' });
    });

    it('should return ready when at least one source is available', async () => {
      const event = createTestEvent();
      googleDriveService.findTranscript.mockResolvedValue({ id: 'file-1', name: 'transcript.txt' });
      googleDriveService.getFileContent.mockResolvedValue('Transcript content');

      const result = await processor.pollForReadiness(event);

      expect(result.status).toBe('ready');
      if (result.status === 'ready') {
        expect(result.transcript).toBe('Transcript content');
      }
    });

    it('should skip transcript search for EventKit events without conferenceData', async () => {
      const event = createTestEvent({ source: 'eventkit' });

      await processor.pollForReadiness(event);

      expect(googleDriveService.findTranscript).not.toHaveBeenCalled();
    });

    it('should return ready when only Notion notes are available', async () => {
      const event = createTestEvent();
      googleDriveService.findTranscript.mockResolvedValue(null);
      mockExtractNotionUrls.mockReturnValue(['https://notion.so/notes-123']);
      samplingService.createMessage.mockResolvedValue({
        content: { type: 'text', text: 'Notion notes content' },
        model: 'claude-3',
      });

      const result = await processor.pollForReadiness(event);

      expect(result.status).toBe('ready');
      if (result.status === 'ready') {
        expect(result.notionNotes).toBe('Notion notes content');
      }
    });
  });

  describe('processPostMeeting', () => {
    beforeEach(() => {
      // Set up so polling returns 'ready' with a transcript
      googleDriveService.findTranscript.mockResolvedValue({ id: 'file-1', name: 'transcript.txt' });
      googleDriveService.getFileContent.mockResolvedValue('Full transcript of the meeting');
    });

    it('should extract summary and action items', async () => {
      const event = createTestEvent();

      const result = await processor.processPostMeeting(event);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Meeting discussed project timeline');
      expect(result!.actionItems).toHaveLength(1);
      expect(result!.actionItems[0].description).toBe('Update project plan');
    });

    it('should skip if already processed', async () => {
      const event = createTestEvent();
      pipelineStateStore.getMeetingState.mockReturnValue({
        postMeeting: { status: 'processed', processedAt: '2026-03-22T11:00:00Z' },
      });

      const result = await processor.processPostMeeting(event);

      expect(result).toBeNull();
      expect(samplingService.createMessage).not.toHaveBeenCalled();
    });

    it('should return null when sources are not ready', async () => {
      const event = createTestEvent();
      googleDriveService.findTranscript.mockResolvedValue(null);
      mockExtractNotionUrls.mockReturnValue([]);

      const result = await processor.processPostMeeting(event);

      expect(result).toBeNull();
      expect(pipelineStateStore.setPostMeetingStatus).toHaveBeenCalledWith(event.id, {
        status: 'polling',
        lastPollAt: expect.any(String),
      });
    });

    it('should resolve assignees from attendees via Slack lookup', async () => {
      const event = createTestEvent({
        attendees: ['alice@example.com', 'bob@example.com'],
      });
      slackService.lookupUser.mockImplementation(async (email) => {
        if (email === 'alice@example.com') return 'U_ALICE';
        return null;
      });

      const result = await processor.processPostMeeting(event);

      expect(result).not.toBeNull();
      expect(slackService.lookupUser).toHaveBeenCalledWith('alice@example.com');
      const aliceItem = result!.actionItems.find((item) => item.assignee === 'Alice');
      expect(aliceItem?.assigneeSlackId).toBe('U_ALICE');
      expect(aliceItem?.assigneeEmail).toBe('alice@example.com');
    });

    it('should deduplicate action items for recurring events', async () => {
      const event = createTestEvent({ recurringEventId: 'recurring-456' });
      const existingItems = [{
        id: 'old-action-1',
        description: 'Update project plan',
        dueDate: '2026-03-15T00:00:00Z',
        source: 'transcript',
        meetingEventId: 'event-old',
        reminderCreated: false,
        createdAt: '2026-03-10T00:00:00Z',
      }];
      pipelineStateStore.getActionItemsForRecurring.mockReturnValue(existingItems);

      // After dedup, LLM returns filtered items
      samplingService.createMessage
        .mockResolvedValueOnce({
          content: {
            type: 'text',
            text: JSON.stringify({
              summary: 'Discussion about timeline',
              actionItems: [{ description: 'Update project plan', assignee: 'Alice' }],
            }),
          },
          model: 'claude-3',
        })
        .mockResolvedValueOnce({
          content: {
            type: 'text',
            text: JSON.stringify([]),  // dedup removes the duplicate
          },
          model: 'claude-3',
        });

      const result = await processor.processPostMeeting(event);

      expect(pipelineStateStore.getActionItemsForRecurring).toHaveBeenCalledWith('recurring-456', false);
      expect(promptTemplateManager.getPrompt).toHaveBeenCalledWith(
        'action_item_dedup',
        expect.objectContaining({ existingItems }),
      );
      expect(result).not.toBeNull();
    });

    it('should send Slack DM with formatted report', async () => {
      const event = createTestEvent();
      const mockBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'report' } }];
      mockFormatPostMeetingReport.mockReturnValue(mockBlocks);

      await processor.processPostMeeting(event);

      expect(mockFormatPostMeetingReport).toHaveBeenCalledWith(
        event.title,
        event.start,
        'Meeting discussed project timeline',
        expect.objectContaining({ notionUrls: expect.any(Array) }),
      );
      expect(slackService.sendDirectMessage).toHaveBeenCalledWith(mockBlocks);
    });

    it('should record action items and update state', async () => {
      const event = createTestEvent();

      await processor.processPostMeeting(event);

      expect(pipelineStateStore.recordActionItems).toHaveBeenCalledWith(
        event.id,
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Update project plan',
            meetingEventId: event.id,
          }),
        ]),
      );
      expect(pipelineStateStore.setPostMeetingStatus).toHaveBeenCalledWith(event.id, {
        status: 'processed',
        processedAt: expect.any(String),
        sources: { transcript: true, notionNotes: false },
      });
    });

    it('should handle LLM errors gracefully', async () => {
      const event = createTestEvent();
      samplingService.createMessage.mockRejectedValue(new Error('LLM error'));

      const result = await processor.processPostMeeting(event);

      expect(result).toBeNull();
      expect(pipelineStateStore.setPostMeetingStatus).toHaveBeenCalledWith(event.id, {
        status: 'error',
        error: 'LLM error',
      });
    });

    it('should handle non-JSON LLM responses gracefully', async () => {
      const event = createTestEvent();
      samplingService.createMessage.mockResolvedValue({
        content: { type: 'text', text: 'This is not valid JSON' },
        model: 'claude-3',
      });

      const result = await processor.processPostMeeting(event);

      // Should still produce a result with raw text as summary
      expect(result).not.toBeNull();
      expect(result!.summary).toBe('This is not valid JSON');
      expect(result!.actionItems).toHaveLength(0);
    });

    it('should set default due date to 7 days after meeting start', async () => {
      const event = createTestEvent({ start: '2026-03-22T10:00:00Z' });
      samplingService.createMessage.mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({
            summary: 'Summary',
            actionItems: [{ description: 'Task without due date' }],
          }),
        },
        model: 'claude-3',
      });

      const result = await processor.processPostMeeting(event);

      expect(result).not.toBeNull();
      const dueDate = new Date(result!.actionItems[0].dueDate);
      const expectedDueDate = new Date('2026-03-29T10:00:00Z');
      expect(dueDate.toISOString()).toBe(expectedDueDate.toISOString());
    });

    it('should include source information in result', async () => {
      const event = createTestEvent();

      const result = await processor.processPostMeeting(event);

      expect(result).not.toBeNull();
      expect(result!.sources).toEqual({
        transcript: true,
        notionNotes: false,
      });
    });
  });
});
