/**
 * Pipeline types and Zod schema validation tests
 */

import { describe, expect, test } from '@jest/globals';
import {
  ActionItemSchema,
  MeetingProcessingStateSchema,
  PipelineStateFileSchema,
} from '../../src/types/pipeline-types.js';

describe('ActionItemSchema', () => {
  const validActionItem = {
    id: 'ai-001',
    description: 'Follow up on design review',
    assignee: 'Alice',
    assigneeEmail: 'alice@example.com',
    assigneeSlackId: 'U12345',
    dueDate: '2026-03-25',
    source: 'transcript',
    meetingEventId: 'evt-001',
    reminderCreated: false,
    createdAt: '2026-03-22T10:00:00Z',
  };

  test('should parse a valid action item with all fields', () => {
    const result = ActionItemSchema.safeParse(validActionItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validActionItem);
    }
  });

  test('should parse with optional fields omitted', () => {
    const minimal = {
      id: 'ai-002',
      description: 'Send meeting notes',
      dueDate: '2026-03-26',
      source: 'notion',
      meetingEventId: 'evt-002',
      reminderCreated: true,
      createdAt: '2026-03-22T11:00:00Z',
    };
    const result = ActionItemSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignee).toBeUndefined();
      expect(result.data.assigneeEmail).toBeUndefined();
      expect(result.data.assigneeSlackId).toBeUndefined();
    }
  });

  test('should reject when required fields are missing', () => {
    const invalid = { id: 'ai-003' };
    const result = ActionItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('MeetingProcessingStateSchema', () => {
  const validState = {
    eventId: 'evt-001',
    recurringEventId: 'rec-001',
    title: 'Weekly Standup',
    startTime: '2026-03-22T09:00:00Z',
    endTime: '2026-03-22T09:30:00Z',
    briefing: {
      status: 'sent' as const,
      sentAt: '2026-03-22T08:45:00Z',
    },
    postMeeting: {
      status: 'processed' as const,
      pollStartedAt: '2026-03-22T09:35:00Z',
      lastPollAt: '2026-03-22T10:00:00Z',
      processedAt: '2026-03-22T10:05:00Z',
      sources: ['transcript', 'notion'],
    },
    actionItems: [],
  };

  test('should parse a valid meeting processing state', () => {
    const result = MeetingProcessingStateSchema.safeParse(validState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventId).toBe('evt-001');
      expect(result.data.briefing.status).toBe('sent');
      expect(result.data.postMeeting.sources).toEqual(['transcript', 'notion']);
    }
  });

  test('should apply default values for sources and actionItems', () => {
    const minimal = {
      eventId: 'evt-002',
      title: 'Design Review',
      startTime: '2026-03-22T14:00:00Z',
      endTime: '2026-03-22T15:00:00Z',
      briefing: { status: 'pending' as const },
      postMeeting: { status: 'pending' as const },
    };
    const result = MeetingProcessingStateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.postMeeting.sources).toEqual([]);
      expect(result.data.actionItems).toEqual([]);
      expect(result.data.recurringEventId).toBeUndefined();
    }
  });

  test('should reject invalid briefing status', () => {
    const invalid = {
      ...validState,
      briefing: { status: 'invalid' },
    };
    const result = MeetingProcessingStateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('should reject invalid postMeeting status', () => {
    const invalid = {
      ...validState,
      postMeeting: { status: 'invalid', sources: [] },
    };
    const result = MeetingProcessingStateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('should accept briefing with error field', () => {
    const withError = {
      ...validState,
      briefing: { status: 'error' as const, error: 'Slack API timeout' },
    };
    const result = MeetingProcessingStateSchema.safeParse(withError);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.briefing.error).toBe('Slack API timeout');
    }
  });

  test('should accept postMeeting with error field', () => {
    const withError = {
      ...validState,
      postMeeting: { status: 'error' as const, sources: [], error: 'Transcript not found' },
    };
    const result = MeetingProcessingStateSchema.safeParse(withError);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.postMeeting.error).toBe('Transcript not found');
    }
  });
});

describe('PipelineStateFileSchema', () => {
  const validStateFile = {
    version: 1 as const,
    lastUpdated: '2026-03-22T12:00:00Z',
    meetings: {
      'evt-001': {
        eventId: 'evt-001',
        title: 'Weekly Standup',
        startTime: '2026-03-22T09:00:00Z',
        endTime: '2026-03-22T09:30:00Z',
        briefing: { status: 'sent' as const, sentAt: '2026-03-22T08:45:00Z' },
        postMeeting: { status: 'pending' as const, sources: [] },
        actionItems: [],
      },
    },
    channelMappings: {
      'evt-001': 'C12345',
    },
    dailyMetrics: {
      '2026-03-22': {
        briefingsSent: 3,
        postMeetingProcessed: 1,
        actionItemsCreated: 5,
        errors: 0,
      },
    },
  };

  test('should parse a valid pipeline state file', () => {
    const result = PipelineStateFileSchema.safeParse(validStateFile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.meetings['evt-001'].title).toBe('Weekly Standup');
      expect(result.data.channelMappings['evt-001']).toBe('C12345');
    }
  });

  test('should reject invalid version number', () => {
    const invalid = { ...validStateFile, version: 2 };
    const result = PipelineStateFileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('should parse with empty meetings and mappings', () => {
    const empty = {
      version: 1 as const,
      lastUpdated: '2026-03-22T12:00:00Z',
      meetings: {},
      channelMappings: {},
      dailyMetrics: {},
    };
    const result = PipelineStateFileSchema.safeParse(empty);
    expect(result.success).toBe(true);
  });

  test('should apply default values for daily metrics fields', () => {
    const withPartialMetrics = {
      version: 1 as const,
      lastUpdated: '2026-03-22T12:00:00Z',
      meetings: {},
      channelMappings: {},
      dailyMetrics: {
        '2026-03-22': {},
      },
    };
    const result = PipelineStateFileSchema.safeParse(withPartialMetrics);
    expect(result.success).toBe(true);
    if (result.success) {
      const metrics = result.data.dailyMetrics['2026-03-22'];
      expect(metrics.briefingsSent).toBe(0);
      expect(metrics.postMeetingProcessed).toBe(0);
      expect(metrics.actionItemsCreated).toBe(0);
      expect(metrics.errors).toBe(0);
    }
  });

  test('should reject when required fields are missing', () => {
    const invalid = { version: 1 };
    const result = PipelineStateFileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
