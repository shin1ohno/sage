/**
 * Conference Data Mapping Tests
 * Tests for conferenceData field in CalendarEvent types and conversion
 * Requirements: meeting-intelligence-pipeline Layer 1, Tasks 5 & 6
 */

import {
  convertGoogleToCalendarEvent,
  GoogleCalendarEvent,
} from '../../src/types/google-calendar-types.js';

describe('conferenceData mapping', () => {
  const baseEvent: GoogleCalendarEvent = {
    id: 'evt-1',
    summary: 'Team Sync',
    start: { dateTime: '2026-03-22T10:00:00Z' },
    end: { dateTime: '2026-03-22T11:00:00Z' },
    iCalUID: 'uid-1@google.com',
  };

  it('maps conferenceData with all fields', () => {
    const event: GoogleCalendarEvent = {
      ...baseEvent,
      conferenceData: {
        conferenceId: 'abc-defg-hij',
        conferenceSolution: { name: 'Google Meet' },
        entryPoints: [
          { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
          { entryPointType: 'phone', uri: 'tel:+1-234-567-8901' },
        ],
      },
    };

    const result = convertGoogleToCalendarEvent(event);

    expect(result.conferenceData).toEqual({
      conferenceId: 'abc-defg-hij',
      conferenceSolution: { name: 'Google Meet' },
      entryPoints: [
        { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
        { entryPointType: 'phone', uri: 'tel:+1-234-567-8901' },
      ],
    });
  });

  it('maps conferenceData without conferenceSolution', () => {
    const event: GoogleCalendarEvent = {
      ...baseEvent,
      conferenceData: {
        conferenceId: 'abc-defg-hij',
        entryPoints: [
          { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
        ],
      },
    };

    const result = convertGoogleToCalendarEvent(event);

    expect(result.conferenceData).toEqual({
      conferenceId: 'abc-defg-hij',
      conferenceSolution: undefined,
      entryPoints: [
        { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
      ],
    });
  });

  it('returns undefined conferenceData when not present', () => {
    const result = convertGoogleToCalendarEvent(baseEvent);

    expect(result.conferenceData).toBeUndefined();
  });

  it('maps conferenceData with only conferenceId', () => {
    const event: GoogleCalendarEvent = {
      ...baseEvent,
      conferenceData: {
        conferenceId: 'abc-defg-hij',
      },
    };

    const result = convertGoogleToCalendarEvent(event);

    expect(result.conferenceData).toEqual({
      conferenceId: 'abc-defg-hij',
      conferenceSolution: undefined,
      entryPoints: undefined,
    });
  });
});
