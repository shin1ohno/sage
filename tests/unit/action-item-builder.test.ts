/**
 * Action Item Builder Tests
 *
 * Tests for resolveAssigneeEmail (substring matching, case-insensitivity,
 * separator removal), buildActionItem (assignee resolution + Slack ID lookup),
 * and deduplicateActionItems (LLM-based deduplication).
 */

import { resolveAssigneeEmail, buildActionItem, deduplicateActionItems } from '../../src/services/action-item-builder.js';
import type { RawActionItem } from '../../src/services/action-item-builder.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';
import type { ActionItem } from '../../src/types/pipeline-types.js';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Team Standup',
    start: '2026-03-01T10:00:00Z',
    end: '2026-03-01T10:30:00Z',
    isAllDay: false,
    source: 'google',
    attendees: ['alice.smith@example.com', 'bob-jones@example.com'],
    ...overrides,
  };
}

describe('resolveAssigneeEmail', () => {
  const emails = ['alice.smith@example.com', 'bob-jones@example.com', 'charlie_d@example.com'];

  it('matches when local part contains the assignee name', () => {
    expect(resolveAssigneeEmail('alice', emails)).toBe('alice.smith@example.com');
  });

  it('matches case-insensitively', () => {
    expect(resolveAssigneeEmail('BOB', emails)).toBe('bob-jones@example.com');
  });

  it('strips separators from local part for matching', () => {
    expect(resolveAssigneeEmail('charlied', emails)).toBe('charlie_d@example.com');
  });

  it('returns undefined when no match', () => {
    expect(resolveAssigneeEmail('dave', emails)).toBeUndefined();
  });

  it('matches when assignee name contains the local part', () => {
    expect(resolveAssigneeEmail('alicesmith', emails)).toBe('alice.smith@example.com');
  });
});

describe('buildActionItem', () => {
  it('resolves assignee email and Slack ID when available', async () => {
    const mockSlackService = {
      lookupUser: jest.fn().mockResolvedValue({ id: 'U123' }),
    };

    const event = makeEvent();
    const raw = { description: 'Write tests', assignee: 'Alice' };
    const item = await buildActionItem(event, raw, 0, '2026-03-08', mockSlackService as never);

    expect(item.assigneeEmail).toBe('alice.smith@example.com');
    expect(item.assigneeSlackId).toBe('U123');
    expect(item.description).toBe('Write tests');
    expect(item.dueDate).toBe('2026-03-08');
    expect(item.source).toBe('post-meeting');
    expect(item.meetingEventId).toBe('evt-1');
  });

  it('leaves assigneeSlackId undefined when lookupUser returns null', async () => {
    const mockSlackService = {
      lookupUser: jest.fn().mockResolvedValue(null),
    };

    const event = makeEvent();
    const raw = { description: 'Review PR', assignee: 'Alice' };
    const item = await buildActionItem(event, raw, 0, '2026-03-08', mockSlackService as never);

    expect(item.assigneeEmail).toBe('alice.smith@example.com');
    expect(item.assigneeSlackId).toBeUndefined();
  });

  it('handles assignee not found in attendees', async () => {
    const mockSlackService = {
      lookupUser: jest.fn(),
    };

    const event = makeEvent();
    const raw = { description: 'Deploy', assignee: 'Dave' };
    const item = await buildActionItem(event, raw, 0, '2026-03-08', mockSlackService as never);

    expect(item.assigneeEmail).toBeUndefined();
    expect(item.assigneeSlackId).toBeUndefined();
    expect(mockSlackService.lookupUser).not.toHaveBeenCalled();
  });

  it('uses default due date when raw item has no dueDate', async () => {
    const mockSlackService = {
      lookupUser: jest.fn(),
    };

    const event = makeEvent({ attendees: [] });
    const raw = { description: 'Task' };
    const item = await buildActionItem(event, raw, 0, '2026-03-15', mockSlackService as never);

    expect(item.dueDate).toBe('2026-03-15');
  });

  it('uses raw dueDate when provided', async () => {
    const mockSlackService = {
      lookupUser: jest.fn(),
    };

    const event = makeEvent({ attendees: [] });
    const raw = { description: 'Task', dueDate: '2026-04-01' };
    const item = await buildActionItem(event, raw, 0, '2026-03-15', mockSlackService as never);

    expect(item.dueDate).toBe('2026-04-01');
  });
});

describe('deduplicateActionItems', () => {
  const newItems: RawActionItem[] = [
    { description: 'Write tests', assignee: 'Alice' },
    { description: 'Deploy to staging', assignee: 'Bob' },
  ];

  const existingItems: ActionItem[] = [
    {
      id: 'ai-1',
      description: 'Write tests for auth module',
      assignee: 'Alice',
      dueDate: '2026-03-08',
      source: 'post-meeting',
      meetingEventId: 'evt-1',
      reminderCreated: false,
      createdAt: '2026-03-01T10:00:00Z',
    },
  ];

  function makePromptTemplateManager() {
    return {
      getPrompt: jest.fn().mockReturnValue('dedup prompt'),
    };
  }

  it('returns unique items when LLM responds with valid JSON', async () => {
    const uniqueItems = [{ description: 'Deploy to staging', assignee: 'Bob' }];
    const mockSamplingService = {
      sendSamplingRequest: jest.fn().mockResolvedValue({
        content: { type: 'text', text: JSON.stringify({ unique: uniqueItems }) },
      }),
    };

    const result = await deduplicateActionItems(
      newItems,
      existingItems,
      mockSamplingService as never,
      makePromptTemplateManager() as never,
    );

    expect(result).toEqual(uniqueItems);
    expect(mockSamplingService.sendSamplingRequest).toHaveBeenCalledTimes(1);
  });

  it('returns all new items when LLM response JSON parse fails', async () => {
    const mockSamplingService = {
      sendSamplingRequest: jest.fn().mockResolvedValue({
        content: { type: 'text', text: 'not valid json at all' },
      }),
    };

    const result = await deduplicateActionItems(
      newItems,
      existingItems,
      mockSamplingService as never,
      makePromptTemplateManager() as never,
    );

    expect(result).toEqual(newItems);
  });

  it('returns all new items when LLM response has no unique field', async () => {
    const mockSamplingService = {
      sendSamplingRequest: jest.fn().mockResolvedValue({
        content: { type: 'text', text: JSON.stringify({ result: 'no unique field' }) },
      }),
    };

    const result = await deduplicateActionItems(
      newItems,
      existingItems,
      mockSamplingService as never,
      makePromptTemplateManager() as never,
    );

    expect(result).toEqual(newItems);
  });

  it('passes correct prompt parameters', async () => {
    const mockSamplingService = {
      sendSamplingRequest: jest.fn().mockResolvedValue({
        content: { type: 'text', text: JSON.stringify({ unique: [] }) },
      }),
    };
    const mockPromptManager = makePromptTemplateManager();

    await deduplicateActionItems(
      newItems,
      existingItems,
      mockSamplingService as never,
      mockPromptManager as never,
    );

    expect(mockPromptManager.getPrompt).toHaveBeenCalledWith('action_item_dedup', {
      new_items: JSON.stringify(newItems, null, 2),
      existing_items: JSON.stringify(
        existingItems.map((i) => ({ description: i.description, assignee: i.assignee, dueDate: i.dueDate })),
        null,
        2,
      ),
    });
  });
});
