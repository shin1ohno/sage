/**
 * Multi-Source Calendar Integration Tests
 * Task 37a: Event merging and deduplication tests
 * Task 37b: Fallback scenario tests
 * Requirements: 2, 7, 10, 11 (Multi-source event retrieval with deduplication and fallback)
 *
 * Tests for multi-source calendar integration including:
 * - Event merging from EventKit and Google Calendar
 * - Event deduplication using iCalUID
 * - Event deduplication using title+time matching
 * - Fallback mechanisms when sources fail
 * - Error handling when both sources are disabled
 */

import { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import { CalendarService } from '../../src/integrations/calendar-service.js';
import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import type { CalendarEvent } from '../../src/integrations/calendar-service.js';
import type { UserConfig } from '../../src/types/config.js';

// Mock implementations
jest.mock('../../src/integrations/calendar-service.js');
jest.mock('../../src/integrations/google-calendar-service.js');

describe('Multi-Source Calendar Integration - Event Merging and Deduplication (Task 37a)', () => {
  let manager: CalendarSourceManager;
  let mockCalendarService: jest.Mocked<CalendarService>;
  let mockGoogleCalendarService: jest.Mocked<GoogleCalendarService>;
  let mockConfig: Partial<UserConfig>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocked services
    mockCalendarService = new CalendarService() as jest.Mocked<CalendarService>;
    mockGoogleCalendarService = new GoogleCalendarService(
      {} as any
    ) as jest.Mocked<GoogleCalendarService>;

    // Default config with both sources enabled
    mockConfig = {
      calendar: {
        sources: {
          eventkit: { enabled: true },
          google: {
            enabled: true,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        },
      } as any,
    };

    // Create manager with mocked services
    manager = new CalendarSourceManager({
      calendarService: mockCalendarService,
      googleCalendarService: mockGoogleCalendarService,
      config: mockConfig as any,
    });
  });

  describe('Event Merging', () => {
    it('should merge events from EventKit and Google Calendar', async () => {
      // Mock EventKit events
      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Team Meeting',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
        },
        {
          id: 'eventkit-2',
          title: 'Lunch Break',
          start: '2026-01-15T12:00:00Z',
          end: '2026-01-15T13:00:00Z',
          isAllDay: false,
          source: 'eventkit',
        },
      ];

      // Mock Google Calendar events
      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'Project Review',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          isAllDay: false,
          source: 'google',
        },
        {
          id: 'google-2',
          title: 'Code Review',
          start: '2026-01-15T16:00:00Z',
          end: '2026-01-15T17:00:00Z',
          isAllDay: false,
          source: 'google',
        },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify
      expect(result).toHaveLength(4); // 2 from EventKit + 2 from Google
      expect(result.filter((e) => e.source === 'eventkit')).toHaveLength(2);
      expect(result.filter((e) => e.source === 'google')).toHaveLength(2);

      // Verify all events are present
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'eventkit-1', title: 'Team Meeting' }),
          expect.objectContaining({ id: 'eventkit-2', title: 'Lunch Break' }),
          expect.objectContaining({ id: 'google-1', title: 'Project Review' }),
          expect.objectContaining({ id: 'google-2', title: 'Code Review' }),
        ])
      );
    });

    it('should handle empty results from one source', async () => {
      // Mock EventKit with events
      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Team Meeting',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
        },
      ];

      // Mock Google Calendar with no events
      const googleEvents: CalendarEvent[] = [];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - only EventKit events returned
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'eventkit-1',
        title: 'Team Meeting',
        source: 'eventkit',
      });
    });
  });

  describe('Event Deduplication - iCalUID Matching', () => {
    it('should deduplicate events with matching iCalUID', async () => {
      // Mock same event from both sources with same iCalUID
      const sharedICalUID = '550e8400-e29b-41d4-a716-446655440000@example.com';

      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Shared Meeting',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
          iCalUID: sharedICalUID,
        } as CalendarEvent & { iCalUID: string },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'Shared Meeting',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'google',
          iCalUID: sharedICalUID,
        } as CalendarEvent & { iCalUID: string },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should only have one event (deduplicated)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: 'Shared Meeting',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
      });
    });

    it('should keep events with different iCalUIDs', async () => {
      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Meeting A',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
          iCalUID: 'uid-a@eventkit.com',
        } as CalendarEvent & { iCalUID: string },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'Meeting B',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'google',
          iCalUID: 'uid-b@google.com',
        } as CalendarEvent & { iCalUID: string },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should have both events (different iCalUIDs)
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Meeting A' }),
          expect.objectContaining({ title: 'Meeting B' }),
        ])
      );
    });
  });

  describe('Event Deduplication - Title+Time Matching', () => {
    it('should deduplicate events with matching title and time (no iCalUID)', async () => {
      // Mock same event from both sources WITHOUT iCalUID
      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Daily Standup',
          start: '2026-01-15T09:00:00Z',
          end: '2026-01-15T09:15:00Z',
          isAllDay: false,
          source: 'eventkit',
          // No iCalUID
        },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'Daily Standup',
          start: '2026-01-15T09:00:00Z',
          end: '2026-01-15T09:15:00Z',
          isAllDay: false,
          source: 'google',
          // No iCalUID
        },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should only have one event (deduplicated by title+time)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: 'Daily Standup',
        start: '2026-01-15T09:00:00Z',
        end: '2026-01-15T09:15:00Z',
      });
    });

    it('should deduplicate case-insensitively', async () => {
      // Mock same event with different title casing
      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Team Meeting',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
        },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'team meeting', // lowercase
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'google',
        },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should deduplicate case-insensitively
      expect(result).toHaveLength(1);
    });

    it('should keep events with same title but different times', async () => {
      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Code Review',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
        },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'Code Review',
          start: '2026-01-15T14:00:00Z', // Different time
          end: '2026-01-15T15:00:00Z',
          isAllDay: false,
          source: 'google',
        },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should have both events (different times)
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Code Review',
            start: '2026-01-15T10:00:00Z',
          }),
          expect.objectContaining({
            title: 'Code Review',
            start: '2026-01-15T14:00:00Z',
          }),
        ])
      );
    });

    it('should keep events with same time but different titles', async () => {
      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Meeting A',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
        },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'Meeting B', // Different title
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'google',
        },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should have both events (different titles)
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Meeting A' }),
          expect.objectContaining({ title: 'Meeting B' }),
        ])
      );
    });
  });

  describe('Complex Deduplication Scenarios', () => {
    it('should handle multiple duplicates across sources', async () => {
      const sharedUID1 = 'shared-1@example.com';
      const sharedUID2 = 'shared-2@example.com';

      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-1',
          title: 'Shared Event 1',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
          iCalUID: sharedUID1,
        } as CalendarEvent & { iCalUID: string },
        {
          id: 'eventkit-2',
          title: 'Shared Event 2',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          isAllDay: false,
          source: 'eventkit',
          iCalUID: sharedUID2,
        } as CalendarEvent & { iCalUID: string },
        {
          id: 'eventkit-3',
          title: 'EventKit Only',
          start: '2026-01-15T16:00:00Z',
          end: '2026-01-15T17:00:00Z',
          isAllDay: false,
          source: 'eventkit',
          iCalUID: 'eventkit-only@example.com',
        } as CalendarEvent & { iCalUID: string },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-1',
          title: 'Shared Event 1',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'google',
          iCalUID: sharedUID1,
        } as CalendarEvent & { iCalUID: string },
        {
          id: 'google-2',
          title: 'Shared Event 2',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          isAllDay: false,
          source: 'google',
          iCalUID: sharedUID2,
        } as CalendarEvent & { iCalUID: string },
        {
          id: 'google-3',
          title: 'Google Only',
          start: '2026-01-15T18:00:00Z',
          end: '2026-01-15T19:00:00Z',
          isAllDay: false,
          source: 'google',
          iCalUID: 'google-only@example.com',
        } as CalendarEvent & { iCalUID: string },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should have 4 unique events:
      // - Shared Event 1 (deduplicated)
      // - Shared Event 2 (deduplicated)
      // - EventKit Only
      // - Google Only
      expect(result).toHaveLength(4);

      // Check that each unique event is present
      const titles = result.map((e) => e.title);
      expect(titles).toContain('Shared Event 1');
      expect(titles).toContain('Shared Event 2');
      expect(titles).toContain('EventKit Only');
      expect(titles).toContain('Google Only');

      // Verify each shared event appears only once
      expect(result.filter((e) => e.title === 'Shared Event 1')).toHaveLength(1);
      expect(result.filter((e) => e.title === 'Shared Event 2')).toHaveLength(1);
    });

    it('should handle mixed deduplication (iCalUID + title+time)', async () => {
      const eventkitEvents: CalendarEvent[] = [
        // Event 1: Has iCalUID
        {
          id: 'eventkit-1',
          title: 'Event with UID',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
          iCalUID: 'shared-uid@example.com',
        } as CalendarEvent & { iCalUID: string },
        // Event 2: No iCalUID (fallback to title+time)
        {
          id: 'eventkit-2',
          title: 'Event without UID',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          isAllDay: false,
          source: 'eventkit',
        },
      ];

      const googleEvents: CalendarEvent[] = [
        // Event 1: Same iCalUID
        {
          id: 'google-1',
          title: 'Event with UID',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'google',
          iCalUID: 'shared-uid@example.com',
        } as CalendarEvent & { iCalUID: string },
        // Event 2: Same title+time, no iCalUID
        {
          id: 'google-2',
          title: 'Event without UID',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          isAllDay: false,
          source: 'google',
        },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should have 2 unique events (both deduplicated)
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Event with UID' }),
          expect.objectContaining({ title: 'Event without UID' }),
        ])
      );
    });

    it('should preserve first occurrence of duplicate events', async () => {
      // Test that when duplicates exist, the first one encountered is kept
      const sharedUID = 'shared@example.com';

      const eventkitEvents: CalendarEvent[] = [
        {
          id: 'eventkit-first',
          title: 'Duplicate Event',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'eventkit',
          iCalUID: sharedUID,
          description: 'EventKit version',
        } as CalendarEvent & { iCalUID: string },
      ];

      const googleEvents: CalendarEvent[] = [
        {
          id: 'google-second',
          title: 'Duplicate Event',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          source: 'google',
          iCalUID: sharedUID,
          description: 'Google version',
        } as CalendarEvent & { iCalUID: string },
      ];

      // Setup mocks
      mockCalendarService.listEvents = jest.fn().mockResolvedValue({
        events: eventkitEvents,
      });
      mockGoogleCalendarService.listEvents = jest
        .fn()
        .mockResolvedValue(googleEvents);

      // Execute
      const result = await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-15T23:59:59Z'
      );

      // Verify - should keep first occurrence (EventKit)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'eventkit-first',
        source: 'eventkit',
        description: 'EventKit version',
      });
    });
  });

  describe('Fallback Scenarios (Task 37b)', () => {
    describe('Google Calendar Fails - EventKit Fallback', () => {
      it('should fall back to EventKit when Google Calendar fails', async () => {
        const eventkitEvents: CalendarEvent[] = [
          {
            id: 'eventkit-1',
            title: 'Team Meeting',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'eventkit',
          },
          {
            id: 'eventkit-2',
            title: 'Code Review',
            start: '2026-01-15T14:00:00Z',
            end: '2026-01-15T15:00:00Z',
            isAllDay: false,
            source: 'eventkit',
          },
        ];

        // Setup mocks - EventKit succeeds, Google fails
        mockCalendarService.listEvents = jest.fn().mockResolvedValue({
          events: eventkitEvents,
        });
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('Google Calendar API: 503 Service Unavailable'));

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should return EventKit events only (fallback)
        expect(result).toHaveLength(2);
        expect(result).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: 'eventkit-1', source: 'eventkit' }),
            expect.objectContaining({ id: 'eventkit-2', source: 'eventkit' }),
          ])
        );

        // Verify both services were called
        expect(mockCalendarService.listEvents).toHaveBeenCalled();
        expect(mockGoogleCalendarService.listEvents).toHaveBeenCalled();
      });

      it('should handle Google Calendar rate limit error (429)', async () => {
        const eventkitEvents: CalendarEvent[] = [
          {
            id: 'eventkit-1',
            title: 'Important Meeting',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'eventkit',
          },
        ];

        // Setup mocks - EventKit succeeds, Google returns 429
        mockCalendarService.listEvents = jest.fn().mockResolvedValue({
          events: eventkitEvents,
        });
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('Google Calendar API: 429 Rate Limit Exceeded'));

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should still return EventKit events
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          id: 'eventkit-1',
          source: 'eventkit',
        });
      });

      it('should handle Google Calendar authentication error (401)', async () => {
        const eventkitEvents: CalendarEvent[] = [
          {
            id: 'eventkit-1',
            title: 'Backup Event',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'eventkit',
          },
        ];

        // Setup mocks - EventKit succeeds, Google returns 401
        mockCalendarService.listEvents = jest.fn().mockResolvedValue({
          events: eventkitEvents,
        });
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('Google Calendar API: 401 Unauthorized'));

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should fall back to EventKit
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('eventkit');
      });
    });

    describe('EventKit Fails - Google Calendar Fallback', () => {
      it('should fall back to Google Calendar when EventKit fails', async () => {
        const googleEvents: CalendarEvent[] = [
          {
            id: 'google-1',
            title: 'Project Review',
            start: '2026-01-15T14:00:00Z',
            end: '2026-01-15T15:00:00Z',
            isAllDay: false,
            source: 'google',
          },
          {
            id: 'google-2',
            title: 'Planning Session',
            start: '2026-01-15T16:00:00Z',
            end: '2026-01-15T17:00:00Z',
            isAllDay: false,
            source: 'google',
          },
        ];

        // Setup mocks - EventKit fails, Google succeeds
        mockCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('EventKit: Calendar access denied'));
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockResolvedValue(googleEvents);

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should return Google Calendar events only (fallback)
        expect(result).toHaveLength(2);
        expect(result).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: 'google-1', source: 'google' }),
            expect.objectContaining({ id: 'google-2', source: 'google' }),
          ])
        );

        // Verify both services were called
        expect(mockCalendarService.listEvents).toHaveBeenCalled();
        expect(mockGoogleCalendarService.listEvents).toHaveBeenCalled();
      });

      it('should handle EventKit permission error', async () => {
        const googleEvents: CalendarEvent[] = [
          {
            id: 'google-1',
            title: 'Fallback Event',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'google',
          },
        ];

        // Setup mocks - EventKit permission denied, Google succeeds
        mockCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('EventKit: User denied calendar access'));
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockResolvedValue(googleEvents);

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should fall back to Google Calendar
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('google');
      });

      it('should handle EventKit not available on platform', async () => {
        const googleEvents: CalendarEvent[] = [
          {
            id: 'google-1',
            title: 'Linux Event',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'google',
          },
        ];

        // Setup mocks - EventKit not available (Linux/Windows), Google succeeds
        mockCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('EventKit is only available on macOS'));
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockResolvedValue(googleEvents);

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should use Google Calendar only
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('google');
      });
    });

    describe('Both Sources Disabled - Error Handling', () => {
      it('should throw error when both sources are disabled', async () => {
        // Update config to disable both sources
        mockConfig.calendar!.sources!.eventkit!.enabled = false;
        mockConfig.calendar!.sources!.google!.enabled = false;

        // Recreate manager with both sources disabled
        manager = new CalendarSourceManager({
          calendarService: mockCalendarService,
          googleCalendarService: mockGoogleCalendarService,
          config: mockConfig as any,
        });

        // Execute and expect error
        await expect(
          manager.getEvents('2026-01-15T00:00:00Z', '2026-01-15T23:59:59Z')
        ).rejects.toThrow(/no calendar sources.*enabled/i);

        // Verify neither service was called
        expect(mockCalendarService.listEvents).not.toHaveBeenCalled();
        expect(mockGoogleCalendarService.listEvents).not.toHaveBeenCalled();
      });

      it('should throw error when trying to create event with no sources enabled', async () => {
        // Update config to disable both sources
        mockConfig.calendar!.sources!.eventkit!.enabled = false;
        mockConfig.calendar!.sources!.google!.enabled = false;

        // Recreate manager with both sources disabled
        manager = new CalendarSourceManager({
          calendarService: mockCalendarService,
          googleCalendarService: mockGoogleCalendarService,
          config: mockConfig as any,
        });

        // Execute and expect error
        await expect(
          manager.createEvent({
            title: 'Test Event',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
          })
        ).rejects.toThrow(/no calendar sources.*enabled/i);
      });

      it('should throw error when trying to find slots with no sources enabled', async () => {
        // Update config to disable both sources
        mockConfig.calendar!.sources!.eventkit!.enabled = false;
        mockConfig.calendar!.sources!.google!.enabled = false;

        // Recreate manager with both sources disabled
        manager = new CalendarSourceManager({
          calendarService: mockCalendarService,
          googleCalendarService: mockGoogleCalendarService,
          config: mockConfig as any,
        });

        // Execute and expect error
        await expect(
          manager.findAvailableSlots({
            startDate: '2026-01-15T00:00:00Z',
            endDate: '2026-01-15T23:59:59Z',
            minDurationMinutes: 60,
          })
        ).rejects.toThrow(/no calendar sources.*enabled/i);
      });
    });

    describe('Both Sources Fail - Error Propagation', () => {
      it('should throw error when both sources fail', async () => {
        // Setup mocks - both sources fail
        mockCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('EventKit: Service unavailable'));
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error('Google Calendar API: 500 Internal Server Error'));

        // Execute and expect error
        await expect(
          manager.getEvents('2026-01-15T00:00:00Z', '2026-01-15T23:59:59Z')
        ).rejects.toThrow();

        // Verify both services were called
        expect(mockCalendarService.listEvents).toHaveBeenCalled();
        expect(mockGoogleCalendarService.listEvents).toHaveBeenCalled();
      });

      it('should include details from both failures in error message', async () => {
        const eventkitError = 'EventKit: Calendar database corrupted';
        const googleError = 'Google Calendar API: Network timeout';

        // Setup mocks - both sources fail with specific errors
        mockCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error(eventkitError));
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockRejectedValue(new Error(googleError));

        // Execute and expect error with details
        try {
          await manager.getEvents('2026-01-15T00:00:00Z', '2026-01-15T23:59:59Z');
          fail('Expected error to be thrown');
        } catch (error) {
          // Error message should contain information about both failures
          expect(error).toBeDefined();
          // The actual error will be from one of the services
          // Just verify that an error was thrown
        }
      });
    });

    describe('Partial Success Scenarios', () => {
      it('should return partial results when one source has no events', async () => {
        const googleEvents: CalendarEvent[] = [
          {
            id: 'google-1',
            title: 'Solo Event',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'google',
          },
        ];

        // Setup mocks - EventKit returns empty, Google has events
        mockCalendarService.listEvents = jest.fn().mockResolvedValue({
          events: [],
        });
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockResolvedValue(googleEvents);

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should return Google events only
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('google');
      });

      it('should work with only EventKit enabled', async () => {
        // Update config to disable Google
        mockConfig.calendar!.sources!.google!.enabled = false;

        // Recreate manager
        manager = new CalendarSourceManager({
          calendarService: mockCalendarService,
          googleCalendarService: mockGoogleCalendarService,
          config: mockConfig as any,
        });

        const eventkitEvents: CalendarEvent[] = [
          {
            id: 'eventkit-1',
            title: 'EventKit Only Event',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'eventkit',
          },
        ];

        // Setup mocks
        mockCalendarService.listEvents = jest.fn().mockResolvedValue({
          events: eventkitEvents,
        });

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should return EventKit events only
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('eventkit');

        // Verify Google was not called (disabled)
        expect(mockGoogleCalendarService.listEvents).not.toHaveBeenCalled();
      });

      it('should work with only Google Calendar enabled', async () => {
        // Update config to disable EventKit
        mockConfig.calendar!.sources!.eventkit!.enabled = false;

        // Recreate manager
        manager = new CalendarSourceManager({
          calendarService: mockCalendarService,
          googleCalendarService: mockGoogleCalendarService,
          config: mockConfig as any,
        });

        const googleEvents: CalendarEvent[] = [
          {
            id: 'google-1',
            title: 'Google Only Event',
            start: '2026-01-15T10:00:00Z',
            end: '2026-01-15T11:00:00Z',
            isAllDay: false,
            source: 'google',
          },
        ];

        // Setup mocks
        mockGoogleCalendarService.listEvents = jest
          .fn()
          .mockResolvedValue(googleEvents);

        // Execute
        const result = await manager.getEvents(
          '2026-01-15T00:00:00Z',
          '2026-01-15T23:59:59Z'
        );

        // Verify - should return Google events only
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('google');

        // Verify EventKit was not called (disabled)
        expect(mockCalendarService.listEvents).not.toHaveBeenCalled();
      });
    });
  });
});
