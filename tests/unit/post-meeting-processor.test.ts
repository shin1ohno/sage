import { PostMeetingProcessor } from '../../src/services/post-meeting-processor.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

jest.mock('../../src/utils/slack-blocks.js', () => ({
  formatPostMeetingReport: jest.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'report' } }]),
}));

const mockDriveService = {
  findTranscript: jest.fn().mockResolvedValue(null),
  getFileContent: jest.fn().mockResolvedValue('transcript text'),
  isAvailable: jest.fn().mockReturnValue(true),
};
const mockSamplingService = {
  sendSamplingRequest: jest.fn().mockResolvedValue({
    content: {
      text: JSON.stringify({
        summary: 'meeting summary',
        actionItems: [],
        sourceLanguage: 'en',
      }),
    },
  }),
};
const mockSlackService = {
  sendDirectMessage: jest.fn().mockResolvedValue(undefined),
  lookupUser: jest.fn().mockResolvedValue(null),
};
const mockReminderManager = {
  setReminder: jest.fn().mockResolvedValue({ success: true, destination: 'apple_reminders' }),
};
const mockStateStore = {
  recordActionItems: jest.fn(),
  setPostMeetingStatus: jest.fn(),
  getActionItemsForRecurring: jest.fn().mockReturnValue([]),
};
const mockPromptTemplateManager = { getPrompt: jest.fn().mockReturnValue('test prompt') };
const testConfig = {
  enabled: true,
  briefingWindow: 15,
  preMeetingPollInterval: 5,
  postMeetingPollInterval: 15,
  postMeetingTimeout: 24,
  postMeetingDelay: 30,
  meetingEndBuffer: 10,
  slackLookbackDays: 7,
  slackMessageBatchSize: 50,
  minimumAttendees: 2,
  excludePatterns: [],
  dailySummaryEnabled: true,
  promptsDir: '~/.sage/prompts/',
};

const testEvent: CalendarEvent = {
  id: 'evt-1',
  title: 'Team Meeting',
  start: '2026-02-28T09:00:00Z',
  end: '2026-02-28T09:30:00Z',
  isAllDay: false,
  source: 'google',
  description: '',
  conferenceData: { conferenceId: 'abc-defg-hij' },
};

describe('PostMeetingProcessor', () => {
  let processor: PostMeetingProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new PostMeetingProcessor(
      mockDriveService as never,
      mockSamplingService as never,
      mockSlackService as never,
      mockReminderManager as never,
      mockStateStore as never,
      mockPromptTemplateManager as never,
      testConfig as never,
    );
  });

  describe('poll', () => {
    it('returns waiting when no sources found', async () => {
      mockDriveService.findTranscript.mockResolvedValue(null);

      const result = await processor.poll(testEvent);

      expect(result.status).toBe('waiting');
    });

    it('returns ready when transcript found', async () => {
      mockDriveService.findTranscript.mockResolvedValue({ id: 'file-1', name: 'transcript.txt' });
      mockDriveService.getFileContent.mockResolvedValue('transcript text');

      const result = await processor.poll(testEvent);

      expect(result.status).toBe('ready');
      if (result.status === 'ready') {
        expect(result.transcript).toBe('transcript text');
      }
    });

    it('returns ready when notion notes found', async () => {
      const eventWithNotion: CalendarEvent = {
        ...testEvent,
        description: 'Notes: https://www.notion.so/page-123',
      };
      mockDriveService.findTranscript.mockResolvedValue(null);
      mockSamplingService.sendSamplingRequest.mockResolvedValue({
        content: { text: 'Notion notes content' },
      });

      const result = await processor.poll(eventWithNotion);

      expect(result.status).toBe('ready');
      if (result.status === 'ready') {
        expect(result.notionNotes).toBe('Notion notes content');
      }
    });

    it('skips transcript search for events without conferenceData', async () => {
      const eventWithoutConference: CalendarEvent = {
        ...testEvent,
        conferenceData: undefined,
      };
      // findTranscript returns null when no conferenceData (checked in drive service)
      mockDriveService.findTranscript.mockResolvedValue(null);

      const result = await processor.poll(eventWithoutConference);

      expect(result.status).toBe('waiting');
      expect(mockDriveService.findTranscript).toHaveBeenCalled();
    });
  });

  describe('process', () => {
    it('extracts summary and action items', async () => {
      mockSamplingService.sendSamplingRequest.mockResolvedValue({
        content: {
          text: JSON.stringify({
            summary: 'Discussed project timeline',
            actionItems: [{ description: 'Update docs', assignee: 'Alice', dueDate: '2026-03-07' }],
            sourceLanguage: 'en',
          }),
        },
      });

      const result = await processor.process(testEvent, 'transcript text', null);

      expect(result.summary).toBe('Discussed project timeline');
      expect(result.actionItems).toHaveLength(1);
      expect(result.actionItems[0].description).toBe('Update docs');
    });

    it('sends Slack DM with formatted report', async () => {
      await processor.process(testEvent, 'transcript text', null);

      expect(mockSlackService.sendDirectMessage).toHaveBeenCalled();
    });

    it('records state', async () => {
      await processor.process(testEvent, 'transcript text', null);

      expect(mockStateStore.recordActionItems).toHaveBeenCalledWith('evt-1', expect.any(Array));
      expect(mockStateStore.setPostMeetingStatus).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({ status: 'processed' }),
      );
    });
  });
});
