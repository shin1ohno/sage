/**
 * PipelineScheduler Unit Tests
 */

import {
  PipelineScheduler,
  type CalendarSourceManagerDep,
  type BriefingGeneratorDep,
  type PostMeetingProcessorDep,
  type PipelineStateStoreDep,
  type SlackServiceDep,
  type WorkingCadenceServiceDep,
  type PQueueLike,
} from '../../src/services/pipeline-scheduler.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';
import type { MeetingIntelligenceConfig } from '../../src/types/pipeline-config.js';
import type { PipelineStateFile } from '../../src/types/pipeline-types.js';

// Mock ConfigLoader for daily summary tests
jest.mock('../../src/config/loader.js', () => ({
  ConfigLoader: {
    load: jest.fn().mockResolvedValue({
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      lastUpdated: '2026-01-01T00:00:00Z',
      user: { name: 'Test', timezone: 'UTC' },
      calendar: {
        workingHours: { start: '09:00', end: '18:00' },
        meetingHeavyDays: [],
        deepWorkDays: [],
        deepWorkBlocks: [],
        timeZone: 'UTC',
      },
      priorityRules: { p0Conditions: [], p1Conditions: [], p2Conditions: [], defaultPriority: 'P2' },
      estimation: { simpleTaskMinutes: 15, mediumTaskMinutes: 30, complexTaskMinutes: 60, projectTaskMinutes: 120, keywordMapping: { simple: [], medium: [], complex: [], project: [] } },
      reminders: { defaultLeadTime: 15 },
      team: { members: [] },
      integrations: {},
      preferences: {},
    }),
  },
}));

// Mock logger to suppress output during tests
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ----------------------------------------------------------------
// Factories
// ----------------------------------------------------------------

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Team Standup',
    start: '2026-03-22T10:00:00Z',
    end: '2026-03-22T10:30:00Z',
    isAllDay: false,
    source: 'google',
    attendees: ['alice@example.com', 'bob@example.com'],
    ...overrides,
  };
}

const testConfig: MeetingIntelligenceConfig = {
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

function makeState(overrides: Partial<PipelineStateFile> = {}): PipelineStateFile {
  return {
    version: 1,
    lastUpdated: '',
    meetings: {},
    channelMappings: {},
    dailyMetrics: {
      [new Date().toISOString().split('T')[0]]: {
        briefingsSent: 0,
        postMeetingProcessed: 0,
        actionItemsCreated: 0,
        errors: 0,
      },
    },
    ...overrides,
  };
}

function makeStateStore(state?: PipelineStateFile): PipelineStateStoreDep & { _state: PipelineStateFile } {
  const s = state ?? makeState();
  return {
    _state: s,
    load: jest.fn().mockResolvedValue(undefined),
    save: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    getBriefingStatus: jest.fn().mockReturnValue(null),
    setBriefingStatus: jest.fn().mockImplementation((eventId: string) => {
      if (!s.meetings[eventId]) {
        s.meetings[eventId] = { title: '', startTime: '', endTime: '' };
      }
    }),
    getPostMeetingStatus: jest.fn().mockReturnValue(null),
    setPostMeetingStatus: jest.fn().mockImplementation((eventId: string) => {
      if (!s.meetings[eventId]) {
        s.meetings[eventId] = { title: '', startTime: '', endTime: '' };
      }
    }),
    getState: jest.fn().mockReturnValue(s),
    getMeeting: jest.fn().mockReturnValue(null),
  };
}

function makePQueue(): PQueueLike & { addedFns: Array<() => Promise<void>> } {
  const q: PQueueLike & { addedFns: Array<() => Promise<void>> } = {
    addedFns: [],
    add: jest.fn(async (fn: () => Promise<void>) => {
      q.addedFns.push(fn);
      await fn();
    }),
    size: 0,
    pending: 0,
    clear: jest.fn(),
  };
  return q;
}

function makeCalendarSourceManager(events: CalendarEvent[] = []): CalendarSourceManagerDep {
  return { getEvents: jest.fn().mockResolvedValue(events) };
}

function makeBriefingGenerator(
  result = { status: 'sent' as const, messageTs: '123' }
): BriefingGeneratorDep {
  return { generateBriefing: jest.fn().mockResolvedValue(result) };
}

function makePostMeetingProcessor(): PostMeetingProcessorDep {
  return {
    poll: jest.fn().mockResolvedValue({ status: 'waiting' }),
    process: jest.fn().mockResolvedValue({
      summary: 'test',
      actionItems: [],
      sourceLanguage: 'en',
      sources: { transcript: true, notionNotes: false },
      sourceLinks: { notionUrls: [] },
    }),
  };
}

function makeSlackService(): SlackServiceDep {
  return { sendDirectMessage: jest.fn().mockResolvedValue(undefined) };
}

function makeWorkingCadenceService(): WorkingCadenceServiceDep {
  return {};
}

interface Deps {
  csm: CalendarSourceManagerDep;
  bg: BriefingGeneratorDep;
  pmp: PostMeetingProcessorDep;
  store: ReturnType<typeof makeStateStore>;
  wcs: WorkingCadenceServiceDep;
  slack: SlackServiceDep;
  config: MeetingIntelligenceConfig;
  pq: ReturnType<typeof makePQueue>;
}

function createScheduler(overrides: Partial<Deps> = {}): { scheduler: PipelineScheduler; deps: Deps } {
  const deps: Deps = {
    csm: overrides.csm ?? makeCalendarSourceManager(),
    bg: overrides.bg ?? makeBriefingGenerator(),
    pmp: overrides.pmp ?? makePostMeetingProcessor(),
    store: (overrides.store ?? makeStateStore()) as ReturnType<typeof makeStateStore>,
    wcs: overrides.wcs ?? makeWorkingCadenceService(),
    slack: overrides.slack ?? makeSlackService(),
    config: overrides.config ?? testConfig,
    pq: overrides.pq ?? makePQueue(),
  };
  const scheduler = new PipelineScheduler(
    deps.csm,
    deps.bg,
    deps.pmp,
    deps.store,
    deps.wcs,
    deps.slack,
    deps.config,
    deps.pq
  );
  return { scheduler, deps };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('PipelineScheduler', () => {
  // ---- Lifecycle ------------------------------------------------

  describe('constructor / lifecycle', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('isRunning() returns false before start()', () => {
      const { scheduler } = createScheduler();
      expect(scheduler.isRunning()).toBe(false);
    });

    it('start() sets running to true and calls stateStore.load()', async () => {
      const { scheduler, deps } = createScheduler();
      await scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      expect(deps.store.load).toHaveBeenCalled();
      await scheduler.stop();
    });

    it('start() sets up pre-meeting and post-meeting intervals', async () => {
      const { scheduler } = createScheduler();
      await scheduler.start();
      // Two setInterval calls should be active (pre-meeting + post-meeting)
      expect(jest.getTimerCount()).toBeGreaterThanOrEqual(2);
      await scheduler.stop();
    });

    it('stop() sets running to false and clears intervals', async () => {
      const { scheduler, deps } = createScheduler();
      await scheduler.start();
      await scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
      expect(deps.store.flush).toHaveBeenCalled();
      // All intervals should be cleared
      expect(jest.getTimerCount()).toBe(0);
    });

    it('stop() does NOT call postMeetingQueue.clear()', async () => {
      const { scheduler, deps } = createScheduler();
      await scheduler.start();
      await scheduler.stop();
      expect(deps.pq.clear).not.toHaveBeenCalled();
    });
  });

  // ---- getStatus ------------------------------------------------

  describe('getStatus()', () => {
    it('returns correct PipelineStatus when metrics date matches today', () => {
      const today = new Date().toISOString().split('T')[0];
      const state = makeState({
        dailyMetrics: {
          [today]: {
            briefingsSent: 3,
            postMeetingProcessed: 2,
            actionItemsCreated: 5,
            errors: 1,
          },
        },
      });
      const { scheduler } = createScheduler({ store: makeStateStore(state) });
      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.briefingsSentToday).toBe(3);
      expect(status.postMeetingProcessedToday).toBe(2);
      expect(status.actionItemsCreatedToday).toBe(5);
      expect(status.errorsToday).toBe(1);
      expect(status.pendingPostMeetingPolls).toBe(0);
    });

    it('returns zero metrics when date is stale', () => {
      const state = makeState({
        dailyMetrics: {
          '2020-01-01': {
            briefingsSent: 99,
            postMeetingProcessed: 88,
            actionItemsCreated: 77,
            errors: 66,
          },
        },
      });
      const { scheduler } = createScheduler({ store: makeStateStore(state) });
      const status = scheduler.getStatus();
      expect(status.briefingsSentToday).toBe(0);
      expect(status.postMeetingProcessedToday).toBe(0);
      expect(status.actionItemsCreatedToday).toBe(0);
      expect(status.errorsToday).toBe(0);
    });
  });

  // ---- Pre-meeting polling --------------------------------------
  // Tests call checkUpcomingMeetings() directly to avoid
  // timing issues with the fire-and-forget call in start().

  describe('checkUpcomingMeetings()', () => {
    it('fetches events in the briefing window and generates briefings', async () => {
      const event = makeEvent();
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts1' });
      const { scheduler, deps } = createScheduler({ csm, bg });

      // Mark as running without calling start() to avoid the fire-and-forget
      // We use a type assertion to set the private field.
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(deps.bg.generateBriefing).toHaveBeenCalledWith(event, expect.any(Date));
    });

    it('skips events that already have "sent" briefing status', async () => {
      const event = makeEvent();
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator();
      const store = makeStateStore();
      (store.getBriefingStatus as jest.Mock).mockReturnValue({ status: 'sent' });

      const { scheduler, deps } = createScheduler({ csm, bg, store });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(deps.bg.generateBriefing).not.toHaveBeenCalled();
    });

    it('skips events that already have "skipped" briefing status', async () => {
      const event = makeEvent();
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator();
      const store = makeStateStore();
      (store.getBriefingStatus as jest.Mock).mockReturnValue({ status: 'skipped' });

      const { scheduler, deps } = createScheduler({ csm, bg, store });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(deps.bg.generateBriefing).not.toHaveBeenCalled();
    });

    it('increments briefingsSent on successful briefing', async () => {
      const event = makeEvent();
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts1' });
      const store = makeStateStore();

      const { scheduler } = createScheduler({ csm, bg, store });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(store._state.dailyMetrics[new Date().toISOString().split('T')[0]]?.briefingsSent).toBe(1);
    });

    it('increments errors and continues processing other events on failure', async () => {
      const evt1 = makeEvent({ id: 'evt-fail', title: 'Fail Meeting' });
      const evt2 = makeEvent({ id: 'evt-ok', title: 'OK Meeting' });
      const csm = makeCalendarSourceManager([evt1, evt2]);
      const bg = makeBriefingGenerator();
      (bg.generateBriefing as jest.Mock)
        .mockRejectedValueOnce(new Error('test error'))
        .mockResolvedValueOnce({ status: 'sent', messageTs: 'ts2' });
      const store = makeStateStore();

      const { scheduler } = createScheduler({ csm, bg, store });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(store._state.dailyMetrics[new Date().toISOString().split('T')[0]]?.errors).toBeGreaterThanOrEqual(1);
      expect(bg.generateBriefing).toHaveBeenCalledTimes(2);
    });

    it('does nothing when running is false', async () => {
      const csm = makeCalendarSourceManager([makeEvent()]);
      const bg = makeBriefingGenerator();
      const { scheduler, deps } = createScheduler({ csm, bg });
      await scheduler.checkUpcomingMeetings();
      expect(deps.csm.getEvents).not.toHaveBeenCalled();
    });

    it('registers processed events for post-meeting polling', async () => {
      const event = makeEvent();
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts1' });
      const store = makeStateStore();

      const { scheduler } = createScheduler({ csm, bg, store });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(scheduler.getStatus().pendingPostMeetingPolls).toBe(1);
    });
  });

  // ---- Post-meeting polling -------------------------------------

  describe('processPostMeetingQueue()', () => {
    it('enqueues eligible events (past buffer + delay) into the p-queue', async () => {
      // Event ended far in the past — well beyond buffer + delay
      const pastEvent = makeEvent({
        id: 'past-1',
        start: '2020-01-01T08:00:00Z',
        end: '2020-01-01T08:30:00Z',
      });
      const csm = makeCalendarSourceManager([pastEvent]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts' });
      const pmp = makePostMeetingProcessor();
      const pq = makePQueue();

      const { scheduler } = createScheduler({ csm, bg, pmp, pq });
      (scheduler as unknown as { running: boolean }).running = true;

      // Register the event via checkUpcomingMeetings
      await scheduler.checkUpcomingMeetings();
      (pq.add as jest.Mock).mockClear();

      await scheduler.processPostMeetingQueue();
      expect(pq.add).toHaveBeenCalled();
    });

    it('skips events not yet eligible (event end + buffer + delay in the future)', async () => {
      const futureEvent = makeEvent({
        id: 'future-1',
        start: '2030-01-01T10:00:00Z',
        end: '2030-01-01T10:30:00Z',
      });
      const csm = makeCalendarSourceManager([futureEvent]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts' });
      const pq = makePQueue();

      const { scheduler } = createScheduler({ csm, bg, pq });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      (pq.add as jest.Mock).mockClear();

      await scheduler.processPostMeetingQueue();
      expect(pq.add).not.toHaveBeenCalled();
    });

    it('marks timed-out events and removes them from pending', async () => {
      const pastEvent = makeEvent({
        id: 'timeout-1',
        start: '2020-01-01T08:00:00Z',
        end: '2020-01-01T08:30:00Z',
      });
      const csm = makeCalendarSourceManager([pastEvent]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts' });
      const store = makeStateStore();
      const pq = makePQueue();

      // Timeout of 0 hours means it's always timed out immediately
      const config = { ...testConfig, postMeetingTimeout: 0 };
      const { scheduler } = createScheduler({ csm, bg, store, pq, config });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();

      // Manually override the pollStartedAt to something in the past
      const pendingMap = (scheduler as unknown as {
        pendingPostMeetingEvents: Map<string, { event: CalendarEvent; pollStartedAt: Date }>;
      }).pendingPostMeetingEvents;
      const entry = pendingMap.get('timeout-1');
      if (entry) {
        entry.pollStartedAt = new Date('2020-01-01T00:00:00Z');
      }

      (pq.add as jest.Mock).mockClear();
      await scheduler.processPostMeetingQueue();

      expect(store.setPostMeetingStatus).toHaveBeenCalledWith('timeout-1', { status: 'timeout' });
      expect(scheduler.getStatus().pendingPostMeetingPolls).toBe(0);
    });
  });

  // ---- pollAndProcessPostMeeting --------------------------------

  describe('post-meeting poll and process', () => {
    it('does not remove event from pending when poll returns "waiting"', async () => {
      const pastEvent = makeEvent({
        id: 'wait-1',
        start: '2020-01-01T06:00:00Z',
        end: '2020-01-01T06:30:00Z',
      });
      const csm = makeCalendarSourceManager([pastEvent]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts' });
      const pmp = makePostMeetingProcessor();
      (pmp.poll as jest.Mock).mockResolvedValue({ status: 'waiting' });

      const { scheduler } = createScheduler({ csm, bg, pmp });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      await scheduler.processPostMeetingQueue();

      expect(scheduler.getStatus().pendingPostMeetingPolls).toBe(1);
    });

    it('processes event and updates metrics when poll returns "ready"', async () => {
      const pastEvent = makeEvent({
        id: 'ready-1',
        start: '2020-01-01T06:00:00Z',
        end: '2020-01-01T06:30:00Z',
      });
      const csm = makeCalendarSourceManager([pastEvent]);
      const bg = makeBriefingGenerator({ status: 'sent', messageTs: 'ts' });
      const pmp = makePostMeetingProcessor();
      (pmp.poll as jest.Mock).mockResolvedValue({
        status: 'ready',
        transcript: 'transcript text',
        notionNotes: 'notes',
      });
      (pmp.process as jest.Mock).mockResolvedValue({
        summary: 'summary',
        actionItems: [{ title: 'AI-1' }, { title: 'AI-2' }],
        sourceLanguage: 'en',
        sources: { transcript: true, notionNotes: true },
        sourceLinks: { notionUrls: [] },
      });
      const store = makeStateStore();

      const { scheduler } = createScheduler({ csm, bg, pmp, store });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      await scheduler.processPostMeetingQueue();

      expect(pmp.process).toHaveBeenCalledWith(pastEvent, 'transcript text', 'notes');
      expect(store._state.dailyMetrics[new Date().toISOString().split('T')[0]]?.postMeetingProcessed).toBeGreaterThanOrEqual(1);
      expect(store._state.dailyMetrics[new Date().toISOString().split('T')[0]]?.actionItemsCreated).toBe(2);
      expect(scheduler.getStatus().pendingPostMeetingPolls).toBe(0);
    });
  });

  // ---- registerTodaysPastMeetings -------------------------------

  describe('registerTodaysPastMeetings()', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('registers today\'s ended meetings for post-meeting polling on start()', async () => {
      const pastEvent = makeEvent({
        id: 'past-today',
        start: '2026-03-22T06:00:00Z',
        end: '2026-03-22T06:30:00Z',
      });
      const csm = makeCalendarSourceManager([pastEvent]);
      const store = makeStateStore();

      const { scheduler } = createScheduler({ csm, store });
      await scheduler.start();

      expect(csm.getEvents).toHaveBeenCalled();
      await scheduler.stop();
    });

    it('skips meetings that already have a post-meeting status', async () => {
      const pastEvent = makeEvent({ id: 'already-processed' });
      const csm = makeCalendarSourceManager([pastEvent]);
      const store = makeStateStore();
      (store.getPostMeetingStatus as jest.Mock).mockReturnValue({ status: 'processed' });

      const { scheduler } = createScheduler({ csm, store });
      await scheduler.start();

      const calls = (store.setPostMeetingStatus as jest.Mock).mock.calls;
      const registerCalls = calls.filter(
        (c: unknown[]) => c[0] === 'already-processed' && (c[1] as Record<string, unknown>).status === 'waiting'
      );
      expect(registerCalls.length).toBe(0);
      await scheduler.stop();
    });
  });

  // ---- Daily summary --------------------------------------------

  describe('checkDailySummary()', () => {
    it('sends daily summary when past working hours end', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      (ConfigLoader.load as jest.Mock).mockResolvedValue({
        user: { name: 'Test', timezone: 'UTC' },
        calendar: {
          workingHours: { start: '09:00', end: '00:00' },
          meetingHeavyDays: [],
          deepWorkDays: [],
          deepWorkBlocks: [],
          timeZone: 'UTC',
        },
      });

      const slack = makeSlackService();
      const config = { ...testConfig, dailySummaryEnabled: true };
      const { scheduler } = createScheduler({ slack, config });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.processPostMeetingQueue();
      expect(slack.sendDirectMessage).toHaveBeenCalled();
    });

    it('does not send daily summary twice on the same day', async () => {
      const { ConfigLoader } = await import('../../src/config/loader.js');
      (ConfigLoader.load as jest.Mock).mockResolvedValue({
        user: { name: 'Test', timezone: 'UTC' },
        calendar: {
          workingHours: { start: '09:00', end: '00:00' },
          meetingHeavyDays: [],
          deepWorkDays: [],
          deepWorkBlocks: [],
          timeZone: 'UTC',
        },
      });

      const slack = makeSlackService();
      const config = { ...testConfig, dailySummaryEnabled: true };
      const { scheduler } = createScheduler({ slack, config });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.processPostMeetingQueue();
      await scheduler.processPostMeetingQueue();

      expect((slack.sendDirectMessage as jest.Mock).mock.calls.length).toBe(1);
    });

    it('does not send when dailySummaryEnabled is false', async () => {
      const slack = makeSlackService();
      const config = { ...testConfig, dailySummaryEnabled: false };
      const { scheduler } = createScheduler({ slack, config });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.processPostMeetingQueue();
      expect(slack.sendDirectMessage).not.toHaveBeenCalled();
    });
  });

  // ---- Critical error -------------------------------------------

  describe('handleCriticalError()', () => {
    it('sends notification for auth-related errors (scope not granted)', async () => {
      const event = makeEvent({ id: 'crit-1' });
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator();
      (bg.generateBriefing as jest.Mock).mockRejectedValue(new Error('scope not granted'));
      const slack = makeSlackService();
      const config = { ...testConfig, dailySummaryEnabled: false };

      const { scheduler } = createScheduler({ csm, bg, slack, config });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(slack.sendDirectMessage).toHaveBeenCalled();
    });

    it('sends notification for UNAUTHENTICATED errors', async () => {
      const event = makeEvent({ id: 'crit-2' });
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator();
      (bg.generateBriefing as jest.Mock).mockRejectedValue(new Error('UNAUTHENTICATED'));
      const slack = makeSlackService();
      const config = { ...testConfig, dailySummaryEnabled: false };

      const { scheduler } = createScheduler({ csm, bg, slack, config });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(slack.sendDirectMessage).toHaveBeenCalled();
    });

    it('does NOT send notification for non-critical errors', async () => {
      const event = makeEvent({ id: 'non-crit' });
      const csm = makeCalendarSourceManager([event]);
      const bg = makeBriefingGenerator();
      (bg.generateBriefing as jest.Mock).mockRejectedValue(new Error('some random error'));
      const slack = makeSlackService();
      const config = { ...testConfig, dailySummaryEnabled: false };

      const { scheduler } = createScheduler({ csm, bg, slack, config });
      (scheduler as unknown as { running: boolean }).running = true;

      await scheduler.checkUpcomingMeetings();
      expect(slack.sendDirectMessage).not.toHaveBeenCalled();
    });
  });
});
