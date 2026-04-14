/**
 * Calendar RSVP Integration Tests
 * Requirement: calendar-rsvp-support FR-3
 *
 * Tests the full flow of list_calendar_events including RSVP data.
 */

import { handleListCalendarEvents, CalendarToolsContext } from '../../src/tools/calendar/handlers.js';
import type { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import type { UserConfig } from '../../src/types/index.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

describe('Calendar RSVP Integration', () => {
  // Mock config
  const mockConfig: UserConfig = {
    user: { name: 'Test User', email: 'test@example.com', timezone: 'Asia/Tokyo' },
    calendar: {
      workingHours: { start: '09:00', end: '18:00' },
      sources: {
        eventkit: { enabled: false },
        google: { enabled: true },
      },
    },
    priorityRules: {
      keywords: { high: [], medium: [], low: [] },
      stakeholderPriority: {},
    },
    integrations: {
      appleReminders: { enabled: false, defaultList: '' },
      notion: { enabled: false, threshold: 7, unit: 'days' },
    },
    preferences: { language: 'ja', reminderDefault: '1 day before' },
  };

  // Mock events with RSVP data
  const mockEventsWithRSVP: CalendarEvent[] = [
    {
      id: 'event-1',
      title: 'Team Meeting',
      start: '2025-01-15T10:00:00+09:00',
      end: '2025-01-15T11:00:00+09:00',
      isAllDay: false,
      source: 'google',
      calendar: 'primary',
      organizer: {
        email: 'organizer@example.com',
        displayName: 'Team Lead',
        self: false,
      },
      attendeesDetailed: [
        { email: 'organizer@example.com', displayName: 'Team Lead', responseStatus: 'accepted', self: false },
        { email: 'me@example.com', displayName: 'Me', responseStatus: 'accepted', self: true },
        { email: 'colleague@example.com', displayName: 'Colleague', responseStatus: 'tentative', optional: false },
        { email: 'optional@example.com', displayName: 'Optional', responseStatus: 'needsAction', optional: true },
      ],
    },
    {
      id: 'event-2',
      title: 'Solo Work Block',
      start: '2025-01-15T14:00:00+09:00',
      end: '2025-01-15T16:00:00+09:00',
      isAllDay: false,
      source: 'google',
      calendar: 'primary',
      // No organizer or attendees - personal event
    },
  ];

  // Create mock CalendarSourceManager
  const createMockCalendarSourceManager = (events: CalendarEvent[]): CalendarSourceManager => ({
    getEnabledSources: jest.fn().mockReturnValue(['google']),
    getEvents: jest.fn().mockResolvedValue(events),
    detectAvailableSources: jest.fn().mockResolvedValue({ eventkit: false, google: true }),
    healthCheck: jest.fn().mockResolvedValue({ eventkit: false, google: true }),
    findAvailableSlots: jest.fn().mockResolvedValue([]),
    createEvent: jest.fn(),
    deleteEvent: jest.fn(),
    respondToEvent: jest.fn(),
    listCalendarResources: jest.fn().mockResolvedValue([]),
  } as unknown as CalendarSourceManager);

  // Create mock context
  const createMockContext = (manager: CalendarSourceManager): CalendarToolsContext => ({
    getConfig: () => mockConfig,
    getCalendarSourceManager: () => manager,
    getCalendarEventResponseService: () => null,
    getGoogleCalendarService: () => null,
    getWorkingCadenceService: () => null,
    setWorkingCadenceService: jest.fn(),
    initializeServices: jest.fn(),
  });

  describe('handleListCalendarEvents with RSVP', () => {
    it('should include attendee RSVP status in response (FR-3)', async () => {
      const mockManager = createMockCalendarSourceManager(mockEventsWithRSVP);
      const ctx = createMockContext(mockManager);

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2025-01-15',
        endDate: '2025-01-16',
      });

      // Parse the response
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.success).toBe(true);
      expect(responseData.events).toHaveLength(2);

      // Verify first event has RSVP data
      const teamMeeting = responseData.events[0];
      expect(teamMeeting.title).toBe('Team Meeting');
      expect(teamMeeting.organizer).toBeDefined();
      expect(teamMeeting.organizer.email).toBe('organizer@example.com');
      expect(teamMeeting.attendees).toHaveLength(4);

      // Verify attendee RSVP statuses
      const acceptedAttendee = teamMeeting.attendees.find(
        (a: { email: string }) => a.email === 'me@example.com'
      );
      expect(acceptedAttendee.responseStatus).toBe('accepted');
      expect(acceptedAttendee.self).toBe(true);

      const tentativeAttendee = teamMeeting.attendees.find(
        (a: { email: string }) => a.email === 'colleague@example.com'
      );
      expect(tentativeAttendee.responseStatus).toBe('tentative');

      const optionalAttendee = teamMeeting.attendees.find(
        (a: { email: string }) => a.email === 'optional@example.com'
      );
      expect(optionalAttendee.optional).toBe(true);
      expect(optionalAttendee.responseStatus).toBe('needsAction');
    });

    it('should include organizer in response (FR-3)', async () => {
      const mockManager = createMockCalendarSourceManager(mockEventsWithRSVP);
      const ctx = createMockContext(mockManager);

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2025-01-15',
        endDate: '2025-01-16',
      });

      const responseData = JSON.parse(result.content[0].text);
      const teamMeeting = responseData.events[0];

      expect(teamMeeting.organizer).toEqual({
        email: 'organizer@example.com',
        displayName: 'Team Lead',
        self: false,
      });
    });

    it('should handle events without attendees gracefully', async () => {
      const mockManager = createMockCalendarSourceManager(mockEventsWithRSVP);
      const ctx = createMockContext(mockManager);

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2025-01-15',
        endDate: '2025-01-16',
      });

      const responseData = JSON.parse(result.content[0].text);
      const soloEvent = responseData.events[1];

      expect(soloEvent.title).toBe('Solo Work Block');
      expect(soloEvent.organizer).toBeUndefined();
      expect(soloEvent.attendees).toBeUndefined();
    });

    it('should preserve backward compatibility with existing fields', async () => {
      const mockManager = createMockCalendarSourceManager(mockEventsWithRSVP);
      const ctx = createMockContext(mockManager);

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2025-01-15',
        endDate: '2025-01-16',
      });

      const responseData = JSON.parse(result.content[0].text);
      const teamMeeting = responseData.events[0];

      // Verify existing fields are still present
      expect(teamMeeting.id).toBe('event-1');
      expect(teamMeeting.title).toBe('Team Meeting');
      expect(teamMeeting.start).toBe('2025-01-15T10:00:00+09:00');
      expect(teamMeeting.end).toBe('2025-01-15T11:00:00+09:00');
      expect(teamMeeting.isAllDay).toBe(false);
      expect(teamMeeting.source).toBe('google');
      expect(teamMeeting.calendar).toBe('primary');
      expect(teamMeeting.eventType).toBe('default');
    });

    it('should work with eventTypes filter', async () => {
      const eventsWithTypes: CalendarEvent[] = [
        {
          ...mockEventsWithRSVP[0],
          eventType: 'default',
        },
        {
          id: 'focus-event',
          title: 'Focus Time',
          start: '2025-01-15T09:00:00+09:00',
          end: '2025-01-15T12:00:00+09:00',
          isAllDay: false,
          source: 'google',
          eventType: 'focusTime',
          // No attendees for focus time
        },
      ];

      const mockManager = createMockCalendarSourceManager(eventsWithTypes);
      const ctx = createMockContext(mockManager);

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2025-01-15',
        endDate: '2025-01-16',
        eventTypes: ['default'],
      });

      const responseData = JSON.parse(result.content[0].text);

      // Should only include default events (with RSVP data)
      expect(responseData.events).toHaveLength(1);
      expect(responseData.events[0].title).toBe('Team Meeting');
      expect(responseData.events[0].attendees).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing config gracefully', async () => {
      const ctx: CalendarToolsContext = {
        getConfig: () => null,
        getCalendarSourceManager: () => null,
        getCalendarEventResponseService: () => null,
        getGoogleCalendarService: () => null,
        getWorkingCadenceService: () => null,
        setWorkingCadenceService: jest.fn(),
        initializeServices: jest.fn(),
      };

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2025-01-15',
        endDate: '2025-01-16',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBe(true);
      expect(responseData.message).toContain('設定されていません');
    });

    it('should handle no enabled sources', async () => {
      const mockManager = {
        getEnabledSources: jest.fn().mockReturnValue([]),
        getEvents: jest.fn(),
      } as unknown as CalendarSourceManager;

      const ctx = createMockContext(mockManager);

      const result = await handleListCalendarEvents(ctx, {
        startDate: '2025-01-15',
        endDate: '2025-01-16',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.setupRequired).toBe(true);
      expect(responseData.integration).toBe('googleCalendar');
    });
  });
});
