/**
 * Unit tests for list_calendar_events functionality
 * Requirements: 16.1-16.12
 */

import { CalendarService } from '../../src/integrations/calendar-service.js';
import type { CalendarEventDetailed, ListEventsRequest } from '../../src/integrations/calendar-service.js';

// Mock run-applescript
jest.mock('run-applescript', () => ({
  runAppleScript: jest.fn(),
}));

describe('CalendarService.listEvents', () => {
  let calendarService: CalendarService;

  beforeEach(() => {
    calendarService = new CalendarService();
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    // Requirement: 16.2 - Input parameters validation
    it('should accept startDate and endDate as required parameters', async () => {
      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      // Mock the fetchEvents to return empty array
      jest.spyOn(calendarService, 'fetchEvents').mockResolvedValue([]);

      const result = await calendarService.listEvents(request);

      expect(result).toBeDefined();
      expect(result.period.start).toBe('2025-01-15');
      expect(result.period.end).toBe('2025-01-20');
    });

    // Requirement: 16.3 - ISO 8601 date format
    it('should accept ISO 8601 date format', async () => {
      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      jest.spyOn(calendarService, 'fetchEvents').mockResolvedValue([]);

      const result = await calendarService.listEvents(request);

      expect(result.period.start).toBe('2025-01-15');
      expect(result.period.end).toBe('2025-01-20');
    });

    it('should throw error for invalid date format', async () => {
      const request: ListEventsRequest = {
        startDate: 'invalid-date',
        endDate: '2025-01-20',
      };

      await expect(calendarService.listEvents(request)).rejects.toThrow();
    });

    it('should throw error when endDate is before startDate', async () => {
      const request: ListEventsRequest = {
        startDate: '2025-01-20',
        endDate: '2025-01-15',
      };

      await expect(calendarService.listEvents(request)).rejects.toThrow();
    });

    // Requirement: 16.4 - Optional calendarName parameter
    it('should accept optional calendarName parameter', async () => {
      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
        calendarName: 'Work',
      };

      jest.spyOn(calendarService, 'fetchEvents').mockResolvedValue([]);

      const result = await calendarService.listEvents(request);

      expect(result).toBeDefined();
    });
  });

  describe('Calendar Filtering', () => {
    // Requirement: 16.4 - Filter by calendar name
    it('should filter events by calendar name when specified', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Work Meeting',
          start: '2025-01-15T10:00:00+09:00',
          end: '2025-01-15T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
          location: 'Room A',
        },
        {
          id: 'event-2',
          title: 'Personal Event',
          start: '2025-01-15T14:00:00+09:00',
          end: '2025-01-15T15:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Personal',
          location: undefined,
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
        calendarName: 'Work',
      };

      const result = await calendarService.listEvents(request);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].calendar).toBe('Work');
    });

    // Requirement: 16.5 - Return all calendars when not specified
    it('should return events from all calendars when calendarName is not specified', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Work Meeting',
          start: '2025-01-15T10:00:00+09:00',
          end: '2025-01-15T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
        },
        {
          id: 'event-2',
          title: 'Personal Event',
          start: '2025-01-15T14:00:00+09:00',
          end: '2025-01-15T15:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Personal',
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      const result = await calendarService.listEvents(request);

      expect(result.events).toHaveLength(2);
    });
  });

  describe('Event Types', () => {
    // Requirement: 16.7 - All-day events
    it('should correctly identify all-day events with isAllDay: true', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: '休暇',
          start: '2025-01-16',
          end: '2025-01-17',
          isAllDay: true,
          source: 'eventkit',
          calendar: 'Personal',
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      const result = await calendarService.listEvents(request);

      expect(result.events[0].isAllDay).toBe(true);
    });

    // Requirement: 16.8 - Multi-day events
    it('should correctly handle multi-day events with accurate start/end times', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Conference',
          start: '2025-01-15T09:00:00+09:00',
          end: '2025-01-17T18:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      const result = await calendarService.listEvents(request);

      expect(result.events[0].start).toBe('2025-01-15T09:00:00+09:00');
      expect(result.events[0].end).toBe('2025-01-17T18:00:00+09:00');
    });
  });

  describe('Response Format', () => {
    // Requirement: 16.10 - Event fields
    it('should include all required fields in event response', async () => {
      const mockEvents = [
        {
          id: 'event-uuid-1',
          title: 'チームミーティング',
          start: '2025-01-15T10:00:00+09:00',
          end: '2025-01-15T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
          location: '会議室A',
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      const result = await calendarService.listEvents(request);

      expect(result.events[0]).toHaveProperty('id');
      expect(result.events[0]).toHaveProperty('title');
      expect(result.events[0]).toHaveProperty('start');
      expect(result.events[0]).toHaveProperty('end');
      expect(result.events[0]).toHaveProperty('isAllDay');
      expect(result.events[0]).toHaveProperty('calendar');
      expect(result.events[0]).toHaveProperty('location');
    });

    // Requirement: 16.10 - Location is optional
    it('should handle events without location', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Virtual Meeting',
          start: '2025-01-15T10:00:00+09:00',
          end: '2025-01-15T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
          location: undefined,
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      const result = await calendarService.listEvents(request);

      expect(result.events[0].location).toBeUndefined();
    });

    // Response format validation
    it('should return properly formatted ListEventsResponse', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Meeting',
          start: '2025-01-15T10:00:00+09:00',
          end: '2025-01-15T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
        },
        {
          id: 'event-2',
          title: 'Lunch',
          start: '2025-01-15T12:00:00+09:00',
          end: '2025-01-15T13:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Personal',
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      const result = await calendarService.listEvents(request);

      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('totalEvents');
      expect(result.period).toEqual({ start: '2025-01-15', end: '2025-01-20' });
      expect(result.totalEvents).toBe(2);
    });
  });

  describe('Error Handling', () => {
    // Requirement: 16.12 - Error messages
    it('should return appropriate error when calendar access is unavailable', async () => {
      jest.spyOn(calendarService, 'isAvailable').mockResolvedValue(false);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      await expect(calendarService.listEvents(request)).rejects.toThrow(
        /カレンダー/
      );
    });

    it('should handle EventKit errors gracefully', async () => {
      jest.spyOn(calendarService, 'fetchEventsDetailed').mockRejectedValue(
        new Error('EventKit access denied')
      );

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      await expect(calendarService.listEvents(request)).rejects.toThrow();
    });
  });

  describe('EventKit Integration', () => {
    // Requirement: 16.6 - Recurring events
    it('should expand recurring events into individual occurrences', async () => {
      // EventKit automatically expands recurring events
      const mockEvents = [
        {
          id: 'event-1-occurrence-1',
          title: 'Weekly Standup',
          start: '2025-01-15T09:00:00+09:00',
          end: '2025-01-15T09:30:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
        },
        {
          id: 'event-1-occurrence-2',
          title: 'Weekly Standup',
          start: '2025-01-22T09:00:00+09:00',
          end: '2025-01-22T09:30:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-25',
      };

      const result = await calendarService.listEvents(request);

      // Both occurrences should be returned as separate events
      expect(result.events).toHaveLength(2);
      expect(result.events[0].title).toBe('Weekly Standup');
      expect(result.events[1].title).toBe('Weekly Standup');
      expect(result.events[0].start).not.toBe(result.events[1].start);
    });

    // Requirement: 16.11 - Same EventKit integration as find_available_slots
    it('should use the same EventKit integration as find_available_slots', async () => {
      const detectPlatformSpy = jest.spyOn(calendarService, 'detectPlatform');

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue([]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      await calendarService.listEvents(request);

      expect(detectPlatformSpy).toHaveBeenCalled();
    });
  });

  describe('Timezone Handling', () => {
    // Requirement: 16.9 - JST timezone
    it('should use JST (Asia/Tokyo) as default timezone', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'Meeting',
          start: '2025-01-15T10:00:00+09:00',
          end: '2025-01-15T11:00:00+09:00',
          isAllDay: false,
          source: 'eventkit',
          calendar: 'Work',
        },
      ];

      jest.spyOn(calendarService, 'fetchEventsDetailed').mockResolvedValue(mockEvents as CalendarEventDetailed[]);

      const request: ListEventsRequest = {
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      };

      const result = await calendarService.listEvents(request);

      // Events should have JST timezone offset (+09:00)
      expect(result.events[0].start).toContain('+09:00');
    });
  });
});

describe('CalendarService.buildEventKitScriptWithDetails', () => {
  let calendarService: CalendarService;

  beforeEach(() => {
    calendarService = new CalendarService();
  });

  it('should build AppleScript that includes calendar and location fields', () => {
    const script = calendarService.buildEventKitScriptWithDetails('2025-01-15', '2025-01-20');

    // Should include calendar name extraction
    expect(script).toContain('calendar');

    // Should include location extraction
    expect(script).toContain('location');
  });
});

describe('CalendarService.parseEventKitResultWithDetails', () => {
  let calendarService: CalendarService;

  beforeEach(() => {
    calendarService = new CalendarService();
  });

  it('should parse EventKit result with calendar and location fields', () => {
    // Format: title|start|end|id|isAllDay|calendar|location
    const output = 'Meeting|2025-01-15 10:00|2025-01-15 11:00|event-1|false|Work|Room A';

    const events = calendarService.parseEventKitResultWithDetails(output);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Meeting');
    expect(events[0].calendar).toBe('Work');
    expect(events[0].location).toBe('Room A');
  });

  it('should handle events without location', () => {
    const output = 'Meeting|2025-01-15 10:00|2025-01-15 11:00|event-1|false|Work|';

    const events = calendarService.parseEventKitResultWithDetails(output);

    expect(events[0].location).toBeUndefined();
  });

  it('should handle multiple events', () => {
    const output = `Meeting|2025-01-15 10:00|2025-01-15 11:00|event-1|false|Work|Room A
Lunch|2025-01-15 12:00|2025-01-15 13:00|event-2|false|Personal|`;

    const events = calendarService.parseEventKitResultWithDetails(output);

    expect(events).toHaveLength(2);
    expect(events[0].calendar).toBe('Work');
    expect(events[1].calendar).toBe('Personal');
  });
});
