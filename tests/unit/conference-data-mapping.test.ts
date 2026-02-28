/**
 * Tests for conferenceData mapping in convertGoogleToCalendarEvent
 */

import {
  convertGoogleToCalendarEvent,
  type GoogleCalendarEvent,
} from '../../src/types/google-calendar-types.js';

describe('convertGoogleToCalendarEvent - conferenceData', () => {
  const baseGoogleEvent: GoogleCalendarEvent = {
    id: 'evt-001',
    summary: 'Team Meeting',
    start: { dateTime: '2026-02-28T09:00:00Z' },
    end: { dateTime: '2026-02-28T09:30:00Z' },
    iCalUID: 'uid-001',
  };

  it('should map conferenceData with all fields', () => {
    const googleEvent: GoogleCalendarEvent = {
      ...baseGoogleEvent,
      conferenceData: {
        conferenceId: 'abc-defg-hij',
        conferenceSolution: { name: 'Google Meet' },
        entryPoints: [
          { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
        ],
      },
    };

    const result = convertGoogleToCalendarEvent(googleEvent);

    expect(result.conferenceData).toBeDefined();
    expect(result.conferenceData!.conferenceId).toBe('abc-defg-hij');
    expect(result.conferenceData!.conferenceSolution?.name).toBe('Google Meet');
    expect(result.conferenceData!.entryPoints).toHaveLength(1);
    expect(result.conferenceData!.entryPoints![0].uri).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('should handle conferenceData without conferenceSolution', () => {
    const googleEvent: GoogleCalendarEvent = {
      ...baseGoogleEvent,
      conferenceData: {
        conferenceId: 'abc-defg-hij',
      },
    };

    const result = convertGoogleToCalendarEvent(googleEvent);

    expect(result.conferenceData).toBeDefined();
    expect(result.conferenceData!.conferenceId).toBe('abc-defg-hij');
    expect(result.conferenceData!.conferenceSolution).toBeUndefined();
  });

  it('should set conferenceData to undefined when not present', () => {
    const result = convertGoogleToCalendarEvent(baseGoogleEvent);
    expect(result.conferenceData).toBeUndefined();
  });

  it('should handle conferenceData with multiple entry points', () => {
    const googleEvent: GoogleCalendarEvent = {
      ...baseGoogleEvent,
      conferenceData: {
        conferenceId: 'abc-defg-hij',
        entryPoints: [
          { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
          { entryPointType: 'phone', uri: 'tel:+1234567890' },
        ],
      },
    };

    const result = convertGoogleToCalendarEvent(googleEvent);

    expect(result.conferenceData!.entryPoints).toHaveLength(2);
    expect(result.conferenceData!.entryPoints![0].entryPointType).toBe('video');
    expect(result.conferenceData!.entryPoints![1].entryPointType).toBe('phone');
  });
});
