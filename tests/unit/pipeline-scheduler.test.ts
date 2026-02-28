import { PipelineScheduler } from '../../src/services/pipeline-scheduler.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

jest.mock('p-queue', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    add: jest.fn((fn: () => Promise<void>) => fn()),
    size: 0,
    pending: 0,
    clear: jest.fn(),
  })),
}));


const mockCalendarSourceManager = {
  getEvents: jest.fn().mockResolvedValue([]),
};
const mockBriefingGenerator = {
  generateBriefing: jest.fn().mockResolvedValue({ status: 'sent', messageTs: '' }),
};
const mockPostMeetingProcessor = {
  poll: jest.fn().mockResolvedValue({ status: 'waiting' }),
  process: jest.fn().mockResolvedValue({ summary: '', actionItems: [], sourceLanguage: 'en', sources: { transcript: false, notionNotes: false }, sourceLinks: { notionUrls: [] } }),
};
const mockStateStore = {
  load: jest.fn().mockResolvedValue(undefined),
  flush: jest.fn().mockResolvedValue(undefined),
  save: jest.fn(),
  getState: jest.fn().mockReturnValue({
    version: 1,
    lastUpdated: '',
    meetings: {},
    channelMappings: {},
    dailyMetrics: { date: '', briefingsSent: 0, postMeetingProcessed: 0, actionItemsCreated: 0, errors: 0 },
  }),
  getDailyMetrics: jest.fn().mockReturnValue({
    date: '',
    briefingsSent: 0,
    postMeetingProcessed: 0,
    actionItemsCreated: 0,
    errors: 0,
  }),
  incrementMetric: jest.fn(),
  ensureMeetingMetadata: jest.fn(),
  getBriefingStatus: jest.fn().mockReturnValue(null),
  setBriefingStatus: jest.fn(),
  getPostMeetingStatus: jest.fn().mockReturnValue(null),
  setPostMeetingStatus: jest.fn(),
  recordActionItems: jest.fn(),
};
const mockSlackService = {
  sendDirectMessage: jest.fn().mockResolvedValue(undefined),
};

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

function createScheduler(): PipelineScheduler {
  return new PipelineScheduler(
    mockCalendarSourceManager as never,
    mockBriefingGenerator as never,
    mockPostMeetingProcessor as never,
    mockStateStore as never,
    mockSlackService as never,
    testConfig as never,
    '18:00',
  );
}

describe('PipelineScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isRunning', () => {
    it('returns false initially', () => {
      const scheduler = createScheduler();
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('start', () => {
    it('sets running to true', async () => {
      const scheduler = createScheduler();

      await scheduler.start();

      expect(scheduler.isRunning()).toBe(true);

      await scheduler.stop();
    });
  });

  describe('stop', () => {
    it('sets running to false and calls stateStore.flush()', async () => {
      const scheduler = createScheduler();
      await scheduler.start();

      await scheduler.stop();

      expect(scheduler.isRunning()).toBe(false);
      expect(mockStateStore.flush).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns correct PipelineStatus', () => {
      const scheduler = createScheduler();

      const status = scheduler.getStatus();

      expect(status).toEqual({
        isRunning: false,
        briefingsSentToday: 0,
        postMeetingProcessedToday: 0,
        actionItemsCreatedToday: 0,
        errorsToday: 0,
        pendingPostMeetingPolls: 0,
      });
    });
  });

  describe('shouldProcessMeeting (via checkUpcomingMeetings)', () => {
    it('excludes all-day events', async () => {
      const allDayEvent: CalendarEvent = {
        id: 'evt-allday',
        title: 'All Day Event',
        start: '2026-02-28',
        end: '2026-03-01',
        isAllDay: true,
        source: 'google',
        attendees: ['a@test.com', 'b@test.com', 'c@test.com'],
      };
      mockCalendarSourceManager.getEvents.mockResolvedValue([allDayEvent]);

      const scheduler = createScheduler();
      await scheduler.start();

      // The checkUpcomingMeetings runs immediately on start
      // All-day events should be filtered out, so no briefing generated
      expect(mockBriefingGenerator.generateBriefing).not.toHaveBeenCalled();

      await scheduler.stop();
    });

    it('excludes events with too few attendees', async () => {
      const fewAttendeesEvent: CalendarEvent = {
        id: 'evt-few',
        title: 'Solo Review',
        start: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        isAllDay: false,
        source: 'google',
        attendees: ['a@test.com'], // Only 1 attendee, minimum is 2
      };
      mockCalendarSourceManager.getEvents.mockResolvedValue([fewAttendeesEvent]);

      const scheduler = createScheduler();
      await scheduler.start();

      expect(mockBriefingGenerator.generateBriefing).not.toHaveBeenCalled();

      await scheduler.stop();
    });
  });

  describe('checkUpcomingMeetings', () => {
    it('skips already sent events', async () => {
      const event: CalendarEvent = {
        id: 'evt-sent',
        title: 'Team Standup',
        start: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        isAllDay: false,
        source: 'google',
        attendees: ['a@test.com', 'b@test.com'],
      };
      mockCalendarSourceManager.getEvents.mockResolvedValue([event]);
      mockStateStore.getBriefingStatus.mockReturnValue({
        eventId: 'evt-sent',
        briefing: { status: 'sent' },
        postMeeting: { status: 'pending' },
        actionItems: [],
        title: '',
        startTime: '',
        endTime: '',
      });

      const scheduler = createScheduler();
      await scheduler.start();

      expect(mockBriefingGenerator.generateBriefing).not.toHaveBeenCalled();

      await scheduler.stop();
    });

    it('calls briefingGenerator for new events', async () => {
      const event: CalendarEvent = {
        id: 'evt-new',
        title: 'Planning Session',
        start: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        isAllDay: false,
        source: 'google',
        attendees: ['a@test.com', 'b@test.com'],
      };
      mockCalendarSourceManager.getEvents.mockResolvedValue([event]);
      mockStateStore.getBriefingStatus.mockReturnValue(null);

      const scheduler = createScheduler();
      await scheduler.start();

      expect(mockBriefingGenerator.generateBriefing).toHaveBeenCalledWith(
        event,
        expect.any(Date),
      );

      await scheduler.stop();
    });
  });
});
