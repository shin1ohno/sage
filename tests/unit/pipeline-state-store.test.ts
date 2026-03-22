/**
 * PipelineStateStore Tests
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { PipelineStateStore } from '../../src/services/pipeline-state-store.js';

jest.mock('node:fs/promises');
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockRename = rename as jest.MockedFunction<typeof rename>;
const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;

function makeMeeting(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'e1',
    title: 'Meeting',
    startTime: '2026-01-01T09:00:00.000Z',
    endTime: '2026-01-01T10:00:00.000Z',
    briefing: { status: 'pending' },
    postMeeting: { status: 'pending', sources: [] },
    actionItems: [],
    ...overrides,
  };
}

function makeActionItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    description: 'Do something',
    dueDate: '2026-01-15',
    source: 'transcript',
    meetingEventId: 'e1',
    reminderCreated: false,
    createdAt: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    lastUpdated: '',
    meetings: {},
    channelMappings: {},
    dailyMetrics: {},
    ...overrides,
  };
}

describe('PipelineStateStore', () => {
  let store: PipelineStateStore;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    store = new PipelineStateStore('/tmp/test-sage');
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('load', () => {
    it('initializes with default state when file does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockReadFile.mockRejectedValue(error);

      await store.load();

      const state = store.getState();
      expect(state.version).toBe(1);
      expect(state.meetings).toEqual({});
      expect(state.channelMappings).toEqual({});
    });

    it('loads valid JSON state from file', async () => {
      const validState = makeState({
        lastUpdated: '2026-01-01T00:00:00.000Z',
        meetings: {
          'event-1': makeMeeting({
            eventId: 'event-1',
            title: 'Standup',
            briefing: { status: 'sent', sentAt: '2026-01-01T08:30:00.000Z' },
          }),
        },
        channelMappings: { standup: ['C123'] },
        dailyMetrics: { '2026-01-01': { briefingsSent: 1, postMeetingProcessed: 0, actionItemsCreated: 0, errors: 0 } },
      });
      mockReadFile.mockResolvedValue(JSON.stringify(validState));

      await store.load();

      const state = store.getState();
      expect(state.meetings['event-1'].title).toBe('Standup');
      expect(state.channelMappings['standup']).toEqual(['C123']);
    });

    it('backs up and resets on invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json {{{');
      mockRename.mockResolvedValue(undefined);

      await store.load();

      expect(mockRename).toHaveBeenCalledTimes(1);
      expect(store.getState().meetings).toEqual({});
    });

    it('backs up and resets on schema validation failure', async () => {
      const invalidState = { version: 'not-a-number', meetings: 'invalid' };
      mockReadFile.mockResolvedValue(JSON.stringify(invalidState));
      mockRename.mockResolvedValue(undefined);

      await store.load();

      expect(mockRename).toHaveBeenCalledTimes(1);
      expect(store.getState().meetings).toEqual({});
    });
  });

  describe('save', () => {
    it('writes to file after debounce period', async () => {
      store.setBriefingStatus('e1', { status: 'sent' });

      expect(mockWriteFile).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1100);
      await Promise.resolve();

      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('writes to file immediately', async () => {
      store.setBriefingStatus('e1', { status: 'sent' });
      await store.flush();

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(written.meetings['e1'].briefing.status).toBe('sent');
      expect(written.lastUpdated).toBeTruthy();
    });
  });

  describe('getBriefingStatus / setBriefingStatus', () => {
    it('returns null for unknown eventId', () => {
      expect(store.getBriefingStatus('unknown')).toBeNull();
    });

    it('sets and gets briefing status', () => {
      store.setBriefingStatus('e1', { status: 'sent', sentAt: '2026-01-01T00:00:00Z' });

      const state = store.getBriefingStatus('e1');
      expect(state).not.toBeNull();
      expect(state!.briefing.status).toBe('sent');
      expect(state!.briefing.sentAt).toBe('2026-01-01T00:00:00Z');
    });

    it('creates new entry for unknown eventId', () => {
      store.setBriefingStatus('new-event', { status: 'sent' });

      const state = store.getBriefingStatus('new-event');
      expect(state).not.toBeNull();
      expect(state!.eventId).toBe('new-event');
      expect(state!.postMeeting.status).toBe('pending');
    });
  });

  describe('getPostMeetingStatus / setPostMeetingStatus', () => {
    it('returns null for unknown eventId', () => {
      expect(store.getPostMeetingStatus('unknown')).toBeNull();
    });

    it('sets and gets post-meeting status', () => {
      store.setPostMeetingStatus('e1', {
        status: 'processed',
        processedAt: '2026-01-01T10:00:00Z',
        sources: ['transcript'],
      });

      const state = store.getPostMeetingStatus('e1');
      expect(state).not.toBeNull();
      expect(state!.postMeeting.status).toBe('processed');
      expect(state!.postMeeting.sources).toEqual(['transcript']);
    });
  });

  describe('getActionItemsForRecurring', () => {
    beforeEach(async () => {
      const validState = makeState({
        meetings: {
          'e1': makeMeeting({
            eventId: 'e1',
            title: 'Standup',
            startTime: '2026-01-01T09:00:00.000Z',
            recurringEventId: 'recurring-1',
            actionItems: [makeActionItem({ id: 'a1', description: 'Task A', meetingEventId: 'e1' })],
          }),
          'e2': makeMeeting({
            eventId: 'e2',
            title: 'Standup',
            startTime: '2026-01-08T09:00:00.000Z',
            recurringEventId: 'recurring-1',
            actionItems: [makeActionItem({ id: 'a2', description: 'Task B', meetingEventId: 'e2', createdAt: '2026-01-08T10:00:00Z' })],
          }),
        },
      });
      mockReadFile.mockResolvedValue(JSON.stringify(validState));
      await store.load();
    });

    it('returns only latest entry action items when lastOnly=true', () => {
      const items = store.getActionItemsForRecurring('recurring-1', true);
      expect(items).toHaveLength(1);
      expect(items[0].description).toBe('Task B');
    });

    it('returns all action items when lastOnly=false', () => {
      const items = store.getActionItemsForRecurring('recurring-1', false);
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.description).sort()).toEqual(['Task A', 'Task B']);
    });

    it('returns empty array for unknown recurringEventId', () => {
      const items = store.getActionItemsForRecurring('nonexistent', true);
      expect(items).toEqual([]);
    });
  });

  describe('recordActionItems', () => {
    it('adds action items to meeting entry', () => {
      store.recordActionItems('e1', [makeActionItem()]);

      const meeting = store.getMeeting('e1');
      expect(meeting).not.toBeNull();
      expect(meeting!.actionItems).toHaveLength(1);
      expect(meeting!.actionItems[0].description).toBe('Do something');
    });
  });

  describe('getChannelMapping / setChannelMapping', () => {
    it('returns null for unknown pattern', () => {
      expect(store.getChannelMapping('unknown')).toBeNull();
    });

    it('sets and gets channel mapping', () => {
      store.setChannelMapping('standup', ['C001', 'C002']);
      expect(store.getChannelMapping('standup')).toEqual(['C001', 'C002']);
    });
  });

  describe('pruneOldEntries', () => {
    it('removes entries older than retention period', async () => {
      const now = new Date();
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 60);
      const recentDate = new Date(now);
      recentDate.setDate(recentDate.getDate() - 5);

      const validState = makeState({
        meetings: {
          old: makeMeeting({ eventId: 'old', title: 'Old Meeting', startTime: oldDate.toISOString() }),
          recent: makeMeeting({ eventId: 'recent', title: 'Recent Meeting', startTime: recentDate.toISOString() }),
        },
      });
      mockReadFile.mockResolvedValue(JSON.stringify(validState));
      await store.load();

      store.pruneOldEntries(30);

      expect(store.getMeeting('old')).toBeNull();
      expect(store.getMeeting('recent')).not.toBeNull();
    });
  });
});
