import { PipelineStateStore } from '../../src/services/pipeline-state-store.js';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

import * as fs from 'node:fs/promises';

const mockedFs = jest.mocked(fs);
const configDir = '/tmp/test-sage';

describe('PipelineStateStore', () => {
  let store: PipelineStateStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new PipelineStateStore(configDir);
  });

  describe('load', () => {
    it('initializes with empty state when file does not exist (ENOENT)', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockedFs.readFile.mockRejectedValue(error);

      await store.load();

      const state = store.getState();
      expect(state.meetings).toEqual({});
      expect(state.channelMappings).toEqual({});
    });

    it('reads valid JSON file and sets state', async () => {
      const validState = {
        version: 1,
        lastUpdated: '2026-02-28T00:00:00Z',
        meetings: {},
        channelMappings: { 'Team Standup': ['C123'] },
        dailyMetrics: {
          date: '2026-02-28',
          briefingsSent: 3,
          postMeetingProcessed: 1,
          actionItemsCreated: 5,
          errors: 0,
        },
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(validState));

      await store.load();

      const state = store.getState();
      expect(state.channelMappings).toEqual({ 'Team Standup': ['C123'] });
      expect(state.dailyMetrics.briefingsSent).toBe(3);
    });

    it('creates backup and reinits on invalid JSON', async () => {
      mockedFs.readFile.mockResolvedValue('not valid json!!!');

      await store.load();

      expect(mockedFs.rename).toHaveBeenCalledWith(
        expect.stringContaining('pipeline-state.json'),
        expect.stringContaining('.backup.'),
      );
      const state = store.getState();
      expect(state.meetings).toEqual({});
    });
  });

  describe('save', () => {
    it('performs a debounced write', async () => {
      jest.useFakeTimers();

      store.save();

      expect(mockedFs.writeFile).not.toHaveBeenCalled();

      // The debounce callback is async, so use advanceTimersByTimeAsync
      // to flush both the timer and the resulting microtask queue.
      await jest.advanceTimersByTimeAsync(1500);

      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('flush', () => {
    it('performs an immediate write', async () => {
      await store.flush();

      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('pipeline-state.json'),
        expect.any(String),
      );
    });
  });

  describe('getBriefingStatus / setBriefingStatus', () => {
    it('gets and sets briefing status', () => {
      jest.useFakeTimers();

      expect(store.getBriefingStatus('evt-1')).toBeNull();

      store.setBriefingStatus('evt-1', { status: 'sent', sentAt: '2026-02-28T09:00:00Z' });

      const state = store.getBriefingStatus('evt-1');
      expect(state).not.toBeNull();
      expect(state!.briefing.status).toBe('sent');

      jest.useRealTimers();
    });

    it('creates new entry for unknown eventId', () => {
      jest.useFakeTimers();

      store.setBriefingStatus('new-event', { status: 'gathering' });

      const meeting = store.getMeeting('new-event');
      expect(meeting).not.toBeNull();
      expect(meeting!.eventId).toBe('new-event');

      jest.useRealTimers();
    });
  });

  describe('getPostMeetingStatus / setPostMeetingStatus', () => {
    it('gets and sets post-meeting status', () => {
      jest.useFakeTimers();

      expect(store.getPostMeetingStatus('evt-1')).toBeNull();

      store.setPostMeetingStatus('evt-1', { status: 'processed', processedAt: '2026-02-28T10:00:00Z' });

      const state = store.getPostMeetingStatus('evt-1');
      expect(state).not.toBeNull();
      expect(state!.postMeeting.status).toBe('processed');

      jest.useRealTimers();
    });
  });

  describe('getActionItemsForRecurring', () => {
    beforeEach(() => {
      jest.useFakeTimers();

      // Populate state with meetings that share a recurringEventId
      const stateObj = store.getState();
      stateObj.meetings['evt-a'] = {
        eventId: 'evt-a',
        recurringEventId: 'recurring-1',
        title: 'Standup',
        startTime: '2026-02-27T09:00:00Z',
        endTime: '2026-02-27T09:30:00Z',
        briefing: { status: 'sent' },
        postMeeting: { status: 'processed' },
        actionItems: [
          { id: 'ai-1', description: 'Item A', dueDate: '2026-03-01', source: 'post-meeting', meetingEventId: 'evt-a', reminderCreated: false, createdAt: '2026-02-27T10:00:00Z' },
        ],
      };
      stateObj.meetings['evt-b'] = {
        eventId: 'evt-b',
        recurringEventId: 'recurring-1',
        title: 'Standup',
        startTime: '2026-02-28T09:00:00Z',
        endTime: '2026-02-28T09:30:00Z',
        briefing: { status: 'sent' },
        postMeeting: { status: 'processed' },
        actionItems: [
          { id: 'ai-2', description: 'Item B', dueDate: '2026-03-02', source: 'post-meeting', meetingEventId: 'evt-b', reminderCreated: false, createdAt: '2026-02-28T10:00:00Z' },
        ],
      };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('lastOnly=true returns latest only', () => {
      const items = store.getActionItemsForRecurring('recurring-1', true);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('ai-2');
    });

    it('lastOnly=false returns all', () => {
      const items = store.getActionItemsForRecurring('recurring-1', false);
      expect(items).toHaveLength(2);
    });
  });

  describe('recordActionItems', () => {
    it('appends items', () => {
      jest.useFakeTimers();

      store.recordActionItems('evt-1', [
        { id: 'ai-1', description: 'Task 1', dueDate: '2026-03-01', source: 'post-meeting', meetingEventId: 'evt-1', reminderCreated: false, createdAt: '2026-02-28T10:00:00Z' },
      ]);

      const meeting = store.getMeeting('evt-1');
      expect(meeting!.actionItems).toHaveLength(1);

      store.recordActionItems('evt-1', [
        { id: 'ai-2', description: 'Task 2', dueDate: '2026-03-02', source: 'post-meeting', meetingEventId: 'evt-1', reminderCreated: false, createdAt: '2026-02-28T11:00:00Z' },
      ]);

      const updated = store.getMeeting('evt-1');
      expect(updated!.actionItems).toHaveLength(2);

      jest.useRealTimers();
    });
  });

  describe('getChannelMapping / setChannelMapping', () => {
    it('gets and sets channel mapping', () => {
      jest.useFakeTimers();

      expect(store.getChannelMapping('Team Standup')).toBeNull();

      store.setChannelMapping('Team Standup', ['C123', 'C456']);

      expect(store.getChannelMapping('Team Standup')).toEqual(['C123', 'C456']);

      jest.useRealTimers();
    });
  });

  describe('pruneOldEntries', () => {
    it('removes old entries', () => {
      jest.useFakeTimers();

      const stateObj = store.getState();
      stateObj.meetings['old-evt'] = {
        eventId: 'old-evt',
        title: 'Old Meeting',
        startTime: '2025-01-01T09:00:00Z',
        endTime: '2025-01-01T10:00:00Z',
        briefing: { status: 'sent' },
        postMeeting: { status: 'processed' },
        actionItems: [],
      };
      stateObj.meetings['recent-evt'] = {
        eventId: 'recent-evt',
        title: 'Recent Meeting',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        briefing: { status: 'sent' },
        postMeeting: { status: 'processed' },
        actionItems: [],
      };

      store.pruneOldEntries(30);

      expect(store.getMeeting('old-evt')).toBeNull();
      expect(store.getMeeting('recent-evt')).not.toBeNull();

      jest.useRealTimers();
    });
  });
});
