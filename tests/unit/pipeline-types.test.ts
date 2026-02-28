/**
 * Tests for pipeline-types.ts Zod schemas
 */

import {
  ActionItemSchema,
  MeetingProcessingStateSchema,
  PipelineStateFileSchema,
} from '../../src/types/pipeline-types.js';

describe('ActionItemSchema', () => {
  const validActionItem = {
    id: 'ai-001',
    description: 'Follow up with team',
    dueDate: '2026-03-05T00:00:00Z',
    source: 'transcript',
    meetingEventId: 'evt-123',
    reminderCreated: false,
    createdAt: '2026-02-28T10:00:00Z',
  };

  it('should parse valid action item', () => {
    const result = ActionItemSchema.safeParse(validActionItem);
    expect(result.success).toBe(true);
  });

  it('should parse action item with optional fields', () => {
    const result = ActionItemSchema.safeParse({
      ...validActionItem,
      assignee: 'Alice',
      assigneeEmail: 'alice@example.com',
      assigneeSlackId: 'U12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignee).toBe('Alice');
      expect(result.data.assigneeEmail).toBe('alice@example.com');
      expect(result.data.assigneeSlackId).toBe('U12345');
    }
  });

  it('should reject action item missing required fields', () => {
    const result = ActionItemSchema.safeParse({ id: 'ai-001' });
    expect(result.success).toBe(false);
  });
});

describe('MeetingProcessingStateSchema', () => {
  const validState = {
    eventId: 'evt-123',
    title: 'Team Standup',
    startTime: '2026-02-28T09:00:00Z',
    endTime: '2026-02-28T09:30:00Z',
    briefing: { status: 'pending' as const },
    postMeeting: { status: 'pending' as const },
    actionItems: [],
  };

  it('should parse valid meeting state', () => {
    const result = MeetingProcessingStateSchema.safeParse(validState);
    expect(result.success).toBe(true);
  });

  it('should accept all briefing status values', () => {
    for (const status of ['pending', 'gathering', 'sent', 'skipped', 'failed']) {
      const result = MeetingProcessingStateSchema.safeParse({
        ...validState,
        briefing: { status },
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all postMeeting status values', () => {
    for (const status of ['pending', 'waiting', 'polling', 'processed', 'timeout', 'failed']) {
      const result = MeetingProcessingStateSchema.safeParse({
        ...validState,
        postMeeting: { status },
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid briefing status', () => {
    const result = MeetingProcessingStateSchema.safeParse({
      ...validState,
      briefing: { status: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional recurringEventId', () => {
    const result = MeetingProcessingStateSchema.safeParse({
      ...validState,
      recurringEventId: 'rec-456',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recurringEventId).toBe('rec-456');
    }
  });
});

describe('PipelineStateFileSchema', () => {
  const validStateFile = {
    version: 1 as const,
    lastUpdated: '2026-02-28T10:00:00Z',
    meetings: {},
    channelMappings: {},
    dailyMetrics: {
      date: '2026-02-28',
      briefingsSent: 0,
      postMeetingProcessed: 0,
      actionItemsCreated: 0,
      errors: 0,
    },
  };

  it('should parse valid state file', () => {
    const result = PipelineStateFileSchema.safeParse(validStateFile);
    expect(result.success).toBe(true);
  });

  it('should reject version other than 1', () => {
    const result = PipelineStateFileSchema.safeParse({
      ...validStateFile,
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it('should parse state file with meetings and mappings', () => {
    const result = PipelineStateFileSchema.safeParse({
      ...validStateFile,
      meetings: {
        'evt-123': {
          eventId: 'evt-123',
          title: 'Standup',
          startTime: '2026-02-28T09:00:00Z',
          endTime: '2026-02-28T09:30:00Z',
          briefing: { status: 'sent', sentAt: '2026-02-28T08:50:00Z' },
          postMeeting: { status: 'pending' },
          actionItems: [],
        },
      },
      channelMappings: {
        'Team Standup': ['C123', 'C456'],
      },
    });
    expect(result.success).toBe(true);
  });
});
