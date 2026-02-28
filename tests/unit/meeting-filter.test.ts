/**
 * Meeting Filter Tests
 *
 * Tests for shouldProcessMeeting: all-day exclusion, minimum attendees,
 * title regex/substring exclude patterns, and calendar type filtering.
 */

import { shouldProcessMeeting } from '../../src/services/meeting-filter.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';
import type { MeetingIntelligenceConfig } from '../../src/types/pipeline-config.js';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Team Standup',
    start: '2026-03-01T10:00:00Z',
    end: '2026-03-01T10:30:00Z',
    isAllDay: false,
    source: 'google',
    attendees: ['alice@example.com', 'bob@example.com'],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<MeetingIntelligenceConfig> = {}): MeetingIntelligenceConfig {
  return {
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
    ...overrides,
  };
}

describe('shouldProcessMeeting', () => {
  it('returns false for all-day events', () => {
    const event = makeEvent({ isAllDay: true });
    expect(shouldProcessMeeting(event, makeConfig())).toBe(false);
  });

  it('returns false when attendees below minimum', () => {
    const event = makeEvent({ attendees: ['alice@example.com'] });
    expect(shouldProcessMeeting(event, makeConfig({ minimumAttendees: 2 }))).toBe(false);
  });

  it('returns true when attendees meet minimum', () => {
    const event = makeEvent({ attendees: ['alice@example.com', 'bob@example.com'] });
    expect(shouldProcessMeeting(event, makeConfig({ minimumAttendees: 2 }))).toBe(true);
  });

  it('returns false when title matches a regex exclude pattern', () => {
    const event = makeEvent({ title: 'OOO - Vacation' });
    const config = makeConfig({
      excludePatterns: [{ type: 'title', pattern: '/^OOO/' }],
    });
    expect(shouldProcessMeeting(event, config)).toBe(false);
  });

  it('returns true when title does not match a regex exclude pattern', () => {
    const event = makeEvent({ title: 'Team Standup' });
    const config = makeConfig({
      excludePatterns: [{ type: 'title', pattern: '/^OOO/' }],
    });
    expect(shouldProcessMeeting(event, config)).toBe(true);
  });

  it('returns false when title matches a substring exclude pattern', () => {
    const event = makeEvent({ title: 'Weekly Lunch & Learn' });
    const config = makeConfig({
      excludePatterns: [{ type: 'title', pattern: 'Lunch' }],
    });
    expect(shouldProcessMeeting(event, config)).toBe(false);
  });

  it('returns true when title does not match a substring exclude pattern', () => {
    const event = makeEvent({ title: 'Sprint Planning' });
    const config = makeConfig({
      excludePatterns: [{ type: 'title', pattern: 'Lunch' }],
    });
    expect(shouldProcessMeeting(event, config)).toBe(true);
  });

  it('returns false when calendar matches a calendar exclude pattern', () => {
    const event = makeEvent({ calendar: 'Holidays' });
    const config = makeConfig({
      excludePatterns: [{ type: 'calendar', pattern: 'Holidays' }],
    });
    expect(shouldProcessMeeting(event, config)).toBe(false);
  });

  it('returns true when calendar does not match exclude pattern', () => {
    const event = makeEvent({ calendar: 'Work' });
    const config = makeConfig({
      excludePatterns: [{ type: 'calendar', pattern: 'Holidays' }],
    });
    expect(shouldProcessMeeting(event, config)).toBe(true);
  });

  it('returns true when excludePatterns is empty', () => {
    const event = makeEvent();
    const config = makeConfig({ excludePatterns: [] });
    expect(shouldProcessMeeting(event, config)).toBe(true);
  });
});
