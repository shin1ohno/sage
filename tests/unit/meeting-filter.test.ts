/**
 * Meeting Filter Unit Tests
 */

import { shouldProcessMeeting } from '../../src/services/meeting-filter.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';
import type { MeetingIntelligenceConfig } from '../../src/types/pipeline-config.js';

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

const baseConfig: MeetingIntelligenceConfig = {
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

describe('shouldProcessMeeting', () => {
  it('returns true for a standard meeting that satisfies all criteria', () => {
    expect(shouldProcessMeeting(makeEvent(), baseConfig)).toBe(true);
  });

  it('excludes all-day events', () => {
    const event = makeEvent({ isAllDay: true });
    expect(shouldProcessMeeting(event, baseConfig)).toBe(false);
  });

  it('excludes events with fewer attendees than minimumAttendees', () => {
    const event = makeEvent({ attendees: ['alice@example.com'] });
    expect(shouldProcessMeeting(event, baseConfig)).toBe(false);
  });

  it('excludes events with no attendees when minimumAttendees > 0', () => {
    const event = makeEvent({ attendees: undefined });
    expect(shouldProcessMeeting(event, baseConfig)).toBe(false);
  });

  it('includes events when attendees exactly equal minimumAttendees', () => {
    const event = makeEvent({ attendees: ['a@x.com', 'b@x.com'] });
    const config = { ...baseConfig, minimumAttendees: 2 };
    expect(shouldProcessMeeting(event, config)).toBe(true);
  });

  it('excludes events matching a title substring pattern', () => {
    const config: MeetingIntelligenceConfig = {
      ...baseConfig,
      excludePatterns: [{ type: 'title', pattern: 'standup' }],
    };
    expect(shouldProcessMeeting(makeEvent(), config)).toBe(false);
  });

  it('title substring matching is case-insensitive', () => {
    const config: MeetingIntelligenceConfig = {
      ...baseConfig,
      excludePatterns: [{ type: 'title', pattern: 'STANDUP' }],
    };
    expect(shouldProcessMeeting(makeEvent({ title: 'team standup' }), config)).toBe(false);
  });

  it('excludes events matching a title regex pattern', () => {
    const config: MeetingIntelligenceConfig = {
      ...baseConfig,
      excludePatterns: [{ type: 'title', pattern: '/^Team/' }],
    };
    // "Team Standup" starts with "Team" — regex matches → excluded
    expect(shouldProcessMeeting(makeEvent({ title: 'Team Standup' }), config)).toBe(false);
    // "Daily Team Standup" does NOT start with "Team" — regex does not match → included
    expect(shouldProcessMeeting(makeEvent({ title: 'Daily Team Standup' }), config)).toBe(true);
  });

  it('regex pattern matches correctly', () => {
    const config: MeetingIntelligenceConfig = {
      ...baseConfig,
      excludePatterns: [{ type: 'title', pattern: '/1:1/' }],
    };
    expect(shouldProcessMeeting(makeEvent({ title: 'Manager 1:1 Sync' }), config)).toBe(false);
  });

  it('excludes events matching a calendar name pattern', () => {
    const config: MeetingIntelligenceConfig = {
      ...baseConfig,
      excludePatterns: [{ type: 'calendar', pattern: 'personal' }],
    };
    const event = makeEvent({ calendar: 'Personal Calendar' });
    expect(shouldProcessMeeting(event, config)).toBe(false);
  });

  it('calendar pattern does not match when event has no calendar', () => {
    const config: MeetingIntelligenceConfig = {
      ...baseConfig,
      excludePatterns: [{ type: 'calendar', pattern: 'personal' }],
    };
    const event = makeEvent({ calendar: undefined });
    expect(shouldProcessMeeting(event, config)).toBe(true);
  });

  it('does NOT exclude declined meetings (R3.9)', () => {
    const event = makeEvent({ status: 'confirmed' });
    // Even if the user declined, shouldProcessMeeting should still return true.
    // The status field reflects the event status, not the user's response.
    expect(shouldProcessMeeting(event, baseConfig)).toBe(true);
  });

  it('applies multiple exclude patterns — any match means exclusion', () => {
    const config: MeetingIntelligenceConfig = {
      ...baseConfig,
      excludePatterns: [
        { type: 'title', pattern: 'Lunch' },
        { type: 'title', pattern: 'standup' },
      ],
    };
    expect(shouldProcessMeeting(makeEvent({ title: 'Daily Standup' }), config)).toBe(false);
    expect(shouldProcessMeeting(makeEvent({ title: 'Project Review' }), config)).toBe(true);
  });
});
