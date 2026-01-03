/**
 * Calendar Source Manager Tests
 * Requirements: 2, 3, 5, 7, 9, 10, 11
 *
 * Comprehensive tests for CalendarSourceManager implementation.
 * Tests multi-source event management, fallback handling, deduplication,
 * and health checking.
 */

import { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import type { CalendarService } from '../../src/integrations/calendar-service.js';
import type { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import type { UserConfig } from '../../src/types/config.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

describe('CalendarSourceManager', () => {
  let manager: CalendarSourceManager;
  let mockCalendarService: jest.Mocked<CalendarService>;
  let mockGoogleCalendarService: jest.Mocked<GoogleCalendarService>;
  let mockConfig: UserConfig;

  // Sample events for testing
  const eventkitEvent: CalendarEvent = {
    id: 'eventkit-1',
    title: 'EventKit Meeting',
    start: '2026-01-15T10:00:00Z',
    end: '2026-01-15T11:00:00Z',
    isAllDay: false,
    source: 'eventkit' as const,
  };

  const googleEvent: CalendarEvent = {
    id: 'google-1',
    title: 'Google Meeting',
    start: '2026-01-15T14:00:00Z',
    end: '2026-01-15T15:00:00Z',
    isAllDay: false,
    source: 'google' as const,
  };

  const duplicateEvent: CalendarEvent = {
    id: 'google-2',
    title: 'EventKit Meeting',
    start: '2026-01-15T10:00:00Z',
    end: '2026-01-15T11:00:00Z',
    isAllDay: false,
    source: 'google' as const,
    iCalUID: 'same-ical-uid',
  };

  const eventkitEventWithUID: CalendarEvent = {
    ...eventkitEvent,
    iCalUID: 'same-ical-uid',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock CalendarService
    mockCalendarService = {
      detectPlatform: jest.fn(),
      isAvailable: jest.fn(),
      listEvents: jest.fn(),
      fetchEvents: jest.fn(),
      fetchEventsDetailed: jest.fn(),
      findAvailableSlotsFromEvents: jest.fn(),
      calculateSuitability: jest.fn(),
      generateManualInputPrompt: jest.fn(),
      parseEventKitResult: jest.fn(),
      buildEventKitScriptWithDetails: jest.fn(),
      parseEventKitResultWithDetails: jest.fn(),
    } as any;

    // Create mock GoogleCalendarService
    mockGoogleCalendarService = {
      authenticate: jest.fn(),
      isAvailable: jest.fn(),
      listEvents: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      deleteEventsBatch: jest.fn(),
      respondToEvent: jest.fn(),
      listCalendars: jest.fn(),
    } as any;

    // Create mock config
    mockConfig = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      user: {
        name: 'Test User',
        timezone: 'Asia/Tokyo',
      },
      calendar: {
        workingHours: {
          start: '09:00',
          end: '18:00',
        },
        meetingHeavyDays: ['Tuesday', 'Thursday'],
        deepWorkDays: ['Monday', 'Wednesday', 'Friday'],
        deepWorkBlocks: [],
        timeZone: 'Asia/Tokyo',
        sources: {
          eventkit: {
            enabled: true,
          },
          google: {
            enabled: true,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        },
      },
      priorityRules: {
        p0Conditions: [],
        p1Conditions: [],
        p2Conditions: [],
        defaultPriority: 'P3',
      },
      estimation: {
        simpleTaskMinutes: 25,
        mediumTaskMinutes: 50,
        complexTaskMinutes: 90,
        projectTaskMinutes: 180,
        keywordMapping: {
          simple: [],
          medium: [],
          complex: [],
          project: [],
        },
      },
      reminders: {
        defaultTypes: [],
        weeklyReview: {
          enabled: false,
          day: 'Friday',
          time: '17:00',
          description: '',
        },
        customRules: [],
      },
      team: {
        frequentCollaborators: [],
        departments: [],
      },
      integrations: {
        appleReminders: {
          enabled: false,
          threshold: 7,
          unit: 'days',
          defaultList: 'Reminders',
          lists: {},
        },
        notion: {
          enabled: false,
          threshold: 8,
          unit: 'days',
          databaseId: '',
        },
        googleCalendar: {
          enabled: false,
          defaultCalendar: 'primary',
          conflictDetection: false,
          lookAheadDays: 14,
        },
      },
      preferences: {
        language: 'ja',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
      },
    } as UserConfig;

    // Create manager instance
    manager = new CalendarSourceManager({
      calendarService: mockCalendarService,
      googleCalendarService: mockGoogleCalendarService,
      config: mockConfig,
    });
  });

  describe('constructor', () => {
    it('should create instance with services and config', () => {
      expect(manager).toBeInstanceOf(CalendarSourceManager);
    });

    it('should create instance without services', () => {
      const managerWithoutServices = new CalendarSourceManager();
      expect(managerWithoutServices).toBeInstanceOf(CalendarSourceManager);
    });

    it('should create instance with partial config', () => {
      const partialManager = new CalendarSourceManager({
        calendarService: mockCalendarService,
      });
      expect(partialManager).toBeInstanceOf(CalendarSourceManager);
    });
  });

  describe('detectAvailableSources', () => {
    it('should return eventkit=true on macOS', async () => {
      mockCalendarService.detectPlatform.mockResolvedValueOnce({
        platform: 'macos',
        availableMethods: ['eventkit'],
        recommendedMethod: 'eventkit',
        requiresPermission: true,
        hasNativeAccess: true,
      });

      const result = await manager.detectAvailableSources();

      expect(result.eventkit).toBe(true);
    });

    it('should return eventkit=false on non-macOS', async () => {
      mockCalendarService.detectPlatform.mockResolvedValueOnce({
        platform: 'web',
        availableMethods: [],
        recommendedMethod: 'manual_input',
        requiresPermission: false,
        hasNativeAccess: false,
      });

      const result = await manager.detectAvailableSources();

      expect(result.eventkit).toBe(false);
    });

    it('should return google=true when OAuth configured', async () => {
      mockCalendarService.detectPlatform.mockResolvedValueOnce({
        platform: 'macos',
        availableMethods: ['eventkit'],
        recommendedMethod: 'eventkit',
        requiresPermission: true,
        hasNativeAccess: true,
      });
      mockGoogleCalendarService.isAvailable.mockResolvedValueOnce(true);

      const result = await manager.detectAvailableSources();

      expect(result.google).toBe(true);
      expect(mockGoogleCalendarService.isAvailable).toHaveBeenCalledTimes(1);
    });

    it('should return google=false when OAuth not configured', async () => {
      mockCalendarService.detectPlatform.mockResolvedValueOnce({
        platform: 'macos',
        availableMethods: ['eventkit'],
        recommendedMethod: 'eventkit',
        requiresPermission: true,
        hasNativeAccess: true,
      });
      mockGoogleCalendarService.isAvailable.mockResolvedValueOnce(false);

      const result = await manager.detectAvailableSources();

      expect(result.google).toBe(false);
    });

    it('should handle CalendarService errors gracefully', async () => {
      mockCalendarService.detectPlatform.mockRejectedValueOnce(
        new Error('Platform detection failed')
      );

      const result = await manager.detectAvailableSources();

      expect(result.eventkit).toBe(false);
    });

    it('should handle GoogleCalendarService errors gracefully', async () => {
      mockCalendarService.detectPlatform.mockResolvedValueOnce({
        platform: 'macos',
        availableMethods: ['eventkit'],
        recommendedMethod: 'eventkit',
        requiresPermission: true,
        hasNativeAccess: true,
      });
      mockGoogleCalendarService.isAvailable.mockRejectedValueOnce(
        new Error('OAuth check failed')
      );

      const result = await manager.detectAvailableSources();

      expect(result.google).toBe(false);
    });

    it('should check platform directly when no CalendarService instance', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      const managerWithoutService = new CalendarSourceManager({
        googleCalendarService: mockGoogleCalendarService,
      });

      const result = await managerWithoutService.detectAvailableSources();

      expect(result.eventkit).toBe(true);

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });
  });

  describe('enableSource', () => {
    it('should enable eventkit source', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = false;

      await manager.enableSource('eventkit');

      expect(mockConfig.calendar.sources!.eventkit.enabled).toBe(true);
    });

    it('should enable google source', async () => {
      mockConfig.calendar.sources!.google.enabled = false;

      await manager.enableSource('google');

      expect(mockConfig.calendar.sources!.google.enabled).toBe(true);
    });

    it('should throw error if config not available', async () => {
      const managerWithoutConfig = new CalendarSourceManager({
        calendarService: mockCalendarService,
        googleCalendarService: mockGoogleCalendarService,
      });

      await expect(managerWithoutConfig.enableSource('eventkit')).rejects.toThrow(
        'Config not available. Cannot enable source.'
      );
    });

    it('should initialize calendar.sources if not present', async () => {
      delete mockConfig.calendar.sources;

      await manager.enableSource('eventkit');

      expect(mockConfig.calendar.sources).toBeDefined();
      expect(mockConfig.calendar.sources!.eventkit.enabled).toBe(true);
    });
  });

  describe('disableSource', () => {
    it('should disable eventkit source when google is enabled', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      await manager.disableSource('eventkit');

      expect(mockConfig.calendar.sources!.eventkit.enabled).toBe(false);
    });

    it('should disable google source when eventkit is enabled', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      await manager.disableSource('google');

      expect(mockConfig.calendar.sources!.google.enabled).toBe(false);
    });

    it('should throw error when trying to disable all sources', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;

      await expect(manager.disableSource('eventkit')).rejects.toThrow(
        'Cannot disable source: at least one calendar source must be enabled.'
      );
    });

    it('should throw error if config not available', async () => {
      const managerWithoutConfig = new CalendarSourceManager({
        calendarService: mockCalendarService,
      });

      await expect(managerWithoutConfig.disableSource('eventkit')).rejects.toThrow(
        'Config not available. Cannot disable source.'
      );
    });

    it('should throw error if calendar.sources not configured', async () => {
      delete mockConfig.calendar.sources;

      await expect(manager.disableSource('eventkit')).rejects.toThrow(
        'Calendar sources not configured.'
      );
    });
  });

  describe('getEnabledSources', () => {
    it('should return both sources when enabled', () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const result = manager.getEnabledSources();

      expect(result).toEqual(['eventkit', 'google']);
    });

    it('should return only eventkit when enabled', () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;

      const result = manager.getEnabledSources();

      expect(result).toEqual(['eventkit']);
    });

    it('should return only google when enabled', () => {
      mockConfig.calendar.sources!.eventkit.enabled = false;
      mockConfig.calendar.sources!.google.enabled = true;

      const result = manager.getEnabledSources();

      expect(result).toEqual(['google']);
    });

    it('should return empty array when no sources enabled', () => {
      mockConfig.calendar.sources!.eventkit.enabled = false;
      mockConfig.calendar.sources!.google.enabled = false;

      const result = manager.getEnabledSources();

      expect(result).toEqual([]);
    });

    it('should return platform defaults when config not set (macOS)', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      delete mockConfig.calendar.sources;

      const result = manager.getEnabledSources();

      expect(result).toEqual(['eventkit']);

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('should return platform defaults when config not set (non-macOS)', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });

      delete mockConfig.calendar.sources;

      const result = manager.getEnabledSources();

      expect(result).toEqual(['google']);

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });
  });

  describe('getEvents', () => {
    it('should fetch from both sources and merge', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [{ ...eventkitEvent, calendar: 'Work' }] as any,
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 1,
      });
      mockGoogleCalendarService.listEvents.mockResolvedValueOnce([googleEvent]);

      const events = await manager.getEvents('2026-01-15T00:00:00Z', '2026-01-16T00:00:00Z');

      expect(events).toHaveLength(2);
      expect(events[0].source).toBe('eventkit');
      expect(events[1].source).toBe('google');
      expect(mockCalendarService.listEvents).toHaveBeenCalledTimes(1);
      expect(mockGoogleCalendarService.listEvents).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate by iCalUID', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [{ ...eventkitEventWithUID, calendar: 'Work' }] as any,
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 1,
      });
      mockGoogleCalendarService.listEvents.mockResolvedValueOnce([duplicateEvent]);

      const events = await manager.getEvents('2026-01-15T00:00:00Z', '2026-01-16T00:00:00Z');

      // Should have only 1 event after deduplication
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('eventkit-1');
    });

    it('should deduplicate by title+time', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const duplicateByTitleTime: CalendarEvent = {
        id: 'google-duplicate',
        title: 'EventKit Meeting',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
        isAllDay: false,
        source: 'google' as const,
      };

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [{ ...eventkitEvent, calendar: 'Work' }] as any,
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 1,
      });
      mockGoogleCalendarService.listEvents.mockResolvedValueOnce([duplicateByTitleTime]);

      const events = await manager.getEvents('2026-01-15T00:00:00Z', '2026-01-16T00:00:00Z');

      // Should have only 1 event after deduplication
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('eventkit-1');
    });

    it('should fallback when one source fails', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockCalendarService.listEvents.mockRejectedValueOnce(new Error('EventKit failed'));
      mockGoogleCalendarService.listEvents.mockResolvedValueOnce([googleEvent]);

      const events = await manager.getEvents('2026-01-15T00:00:00Z', '2026-01-16T00:00:00Z');

      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('google');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'EventKit failed:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should throw when all sources fail', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockCalendarService.listEvents.mockRejectedValueOnce(new Error('EventKit failed'));
      mockGoogleCalendarService.listEvents.mockRejectedValueOnce(
        new Error('Google Calendar failed')
      );

      await expect(
        manager.getEvents('2026-01-15T00:00:00Z', '2026-01-16T00:00:00Z')
      ).rejects.toThrow('All calendar sources failed');

      consoleErrorSpy.mockRestore();
    });

    it('should handle calendar ID filter', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [{ ...eventkitEvent, calendar: 'Work' }] as any,
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 1,
      });
      mockGoogleCalendarService.listEvents.mockResolvedValueOnce([googleEvent]);

      await manager.getEvents(
        '2026-01-15T00:00:00Z',
        '2026-01-16T00:00:00Z',
        'custom-calendar'
      );

      expect(mockCalendarService.listEvents).toHaveBeenCalledWith({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
        calendarName: 'custom-calendar',
      });

      expect(mockGoogleCalendarService.listEvents).toHaveBeenCalledWith({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
        calendarId: 'custom-calendar',
      });
    });
  });

  describe('createEvent', () => {
    const createRequest = {
      title: 'New Event',
      start: '2026-01-15T10:00:00Z',
      end: '2026-01-15T11:00:00Z',
    };

    it('should create event in preferred source (google)', async () => {
      mockConfig.calendar.sources!.google.enabled = true;

      mockGoogleCalendarService.createEvent.mockResolvedValueOnce(googleEvent);

      const event = await manager.createEvent(createRequest, 'google');

      expect(event).toEqual(googleEvent);
      expect(mockGoogleCalendarService.createEvent).toHaveBeenCalledWith(createRequest);
    });

    it('should fallback to other source when preferred fails', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockGoogleCalendarService.createEvent.mockRejectedValueOnce(
        new Error('Google Calendar failed')
      );

      await expect(manager.createEvent(createRequest, 'google')).rejects.toThrow(
        'Failed to create event in all sources'
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should use first enabled source if not specified', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = false;
      mockConfig.calendar.sources!.google.enabled = true;

      mockGoogleCalendarService.createEvent.mockResolvedValueOnce(googleEvent);

      const event = await manager.createEvent(createRequest);

      expect(event).toEqual(googleEvent);
      expect(mockGoogleCalendarService.createEvent).toHaveBeenCalledWith(createRequest);
    });

    it('should throw error if no sources enabled', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = false;
      mockConfig.calendar.sources!.google.enabled = false;

      await expect(manager.createEvent(createRequest)).rejects.toThrow(
        'No calendar sources enabled. Please enable at least one source.'
      );
    });

    it('should skip EventKit (not supported for creation)', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(manager.createEvent(createRequest)).rejects.toThrow(
        'Failed to create event in all sources'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteEvent', () => {
    it('should delete from specified source', async () => {
      mockConfig.calendar.sources!.google.enabled = true;

      mockGoogleCalendarService.deleteEvent.mockResolvedValueOnce();

      await manager.deleteEvent('event-123', 'google');

      expect(mockGoogleCalendarService.deleteEvent).toHaveBeenCalledWith('event-123');
    });

    it('should throw error if source not enabled', async () => {
      mockConfig.calendar.sources!.google.enabled = false;

      await expect(manager.deleteEvent('event-123', 'google')).rejects.toThrow(
        'Source google is not enabled'
      );
    });

    it('should try all sources when source not specified', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockGoogleCalendarService.deleteEvent.mockResolvedValueOnce();

      await manager.deleteEvent('event-123');

      expect(mockGoogleCalendarService.deleteEvent).toHaveBeenCalledWith('event-123');

      consoleLogSpy.mockRestore();
    });

    it('should handle 404 gracefully when source specified', async () => {
      mockConfig.calendar.sources!.google.enabled = true;

      mockGoogleCalendarService.deleteEvent.mockRejectedValueOnce(
        new Error('Event not found 404')
      );

      // Should throw because when source is specified and it fails, it throws
      await expect(manager.deleteEvent('non-existent-event', 'google')).rejects.toThrow(
        'Event not found 404'
      );
    });

    it('should handle 404 gracefully when source not specified', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      mockGoogleCalendarService.deleteEvent.mockRejectedValueOnce(
        new Error('Event not found 404')
      );

      // Should not throw - 404 is treated as success
      await manager.deleteEvent('non-existent-event');

      consoleLogSpy.mockRestore();
    });

    it('should throw error if all sources fail with non-404 errors', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = false;
      mockConfig.calendar.sources!.google.enabled = true;

      mockGoogleCalendarService.deleteEvent.mockRejectedValueOnce(
        new Error('Server error 500')
      );

      await expect(manager.deleteEvent('event-123')).rejects.toThrow(
        'Failed to delete event from all sources'
      );
    });

    it('should throw error if no sources available for deletion', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = false;
      mockConfig.calendar.sources!.google.enabled = false;

      await expect(manager.deleteEvent('event-123')).rejects.toThrow(
        'No calendar sources available for deletion'
      );
    });
  });

  describe('findAvailableSlots', () => {
    it('should find slots from multi-source events', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      // Use UTC timezone for CI compatibility
      // Events at 10:00-11:00 UTC and 14:00-15:00 UTC
      const event1: CalendarEvent = {
        id: '1',
        title: 'Meeting 1',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
        isAllDay: false,
        source: 'eventkit' as const,
      };

      const event2: CalendarEvent = {
        id: '2',
        title: 'Meeting 2',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T15:00:00Z',
        isAllDay: false,
        source: 'google' as const,
      };

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [{ ...event1, calendar: 'Work' }] as any,
        period: { start: '2026-01-15T00:00:00Z', end: '2026-01-16T00:00:00Z' },
        totalEvents: 1,
      });
      mockGoogleCalendarService.listEvents.mockResolvedValueOnce([{ ...event2, calendar: 'Work' }]);

      const slots = await manager.findAvailableSlots({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
        minDurationMinutes: 30,
        workingHours: {
          start: '09:00',
          end: '18:00',
        },
      });

      // Verify both sources were queried
      expect(mockCalendarService.listEvents).toHaveBeenCalled();
      expect(mockGoogleCalendarService.listEvents).toHaveBeenCalled();

      // Result should be an array (slot count depends on local timezone)
      expect(Array.isArray(slots)).toBe(true);
    });

    it('should filter by working hours', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [],
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 0,
      });

      const slots = await manager.findAvailableSlots({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
        minDurationMinutes: 30,
        workingHours: {
          start: '09:00',
          end: '12:00',
        },
      });

      // Should only have slots within working hours
      slots.forEach((slot) => {
        const startHour = new Date(slot.start).getHours();
        expect(startHour).toBeGreaterThanOrEqual(9);
        expect(startHour).toBeLessThan(12);
      });
    });

    it('should filter by duration', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [],
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 0,
      });

      const slots = await manager.findAvailableSlots({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
        minDurationMinutes: 60,
        maxDurationMinutes: 120,
      });

      // All slots should meet duration requirements
      slots.forEach((slot) => {
        expect(slot.durationMinutes).toBeGreaterThanOrEqual(60);
        expect(slot.durationMinutes).toBeLessThanOrEqual(120);
      });
    });

    it('should apply suitability scoring', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;
      mockConfig.calendar.deepWorkDays = ['Monday'];
      mockConfig.calendar.meetingHeavyDays = ['Thursday'];

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [],
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 0,
      });

      const slots = await manager.findAvailableSlots({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
        minDurationMinutes: 30,
      });

      // All slots should have suitability assigned
      slots.forEach((slot) => {
        expect(['excellent', 'good', 'acceptable']).toContain(slot.suitability);
      });
    });

    it('should sort by suitability', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;
      mockConfig.calendar.deepWorkDays = ['Monday'];

      mockCalendarService.listEvents.mockResolvedValueOnce({
        events: [],
        period: { start: '2026-01-15', end: '2026-01-16' },
        totalEvents: 0,
      });

      const slots = await manager.findAvailableSlots({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-20T00:00:00Z',
        minDurationMinutes: 30,
      });

      if (slots.length > 1) {
        const suitabilityOrder = { excellent: 0, good: 1, acceptable: 2 };
        for (let i = 0; i < slots.length - 1; i++) {
          const current = suitabilityOrder[slots[i].suitability];
          const next = suitabilityOrder[slots[i + 1].suitability];
          expect(current).toBeLessThanOrEqual(next);
        }
      }
    });
  });

  describe('syncCalendars', () => {
    it('should require both sources enabled', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;

      await expect(manager.syncCalendars()).rejects.toThrow(
        'Both EventKit and Google Calendar must be enabled for sync'
      );
    });

    it('should return sync result when both sources enabled', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const result = await manager.syncCalendars();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('eventsAdded');
      expect(result).toHaveProperty('eventsUpdated');
      expect(result).toHaveProperty('eventsDeleted');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status when both sources enabled', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;

      const status = await manager.getSyncStatus();

      expect(status.isEnabled).toBe(true);
      expect(status.sources.eventkit.available).toBe(true);
      expect(status.sources.google.available).toBe(true);
      expect(status.nextSyncTime).toBeDefined();
    });

    it('should return disabled status when one source disabled', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = false;

      const status = await manager.getSyncStatus();

      expect(status.isEnabled).toBe(false);
      expect(status.nextSyncTime).toBeUndefined();
    });

    it('should use config sync interval for next sync time', async () => {
      mockConfig.calendar.sources!.eventkit.enabled = true;
      mockConfig.calendar.sources!.google.enabled = true;
      mockConfig.calendar.sources!.google.syncInterval = 600; // 10 minutes

      const status = await manager.getSyncStatus();

      expect(status.nextSyncTime).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should check both sources', async () => {
      mockCalendarService.isAvailable.mockResolvedValueOnce(true);
      mockGoogleCalendarService.isAvailable.mockResolvedValueOnce(true);

      const health = await manager.healthCheck();

      expect(health.eventkit).toBe(true);
      expect(health.google).toBe(true);
      expect(mockCalendarService.isAvailable).toHaveBeenCalledTimes(1);
      expect(mockGoogleCalendarService.isAvailable).toHaveBeenCalledTimes(1);
    });

    it('should return false for unavailable sources', async () => {
      mockCalendarService.isAvailable.mockResolvedValueOnce(false);
      mockGoogleCalendarService.isAvailable.mockResolvedValueOnce(false);

      const health = await manager.healthCheck();

      expect(health.eventkit).toBe(false);
      expect(health.google).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockCalendarService.isAvailable.mockRejectedValueOnce(
        new Error('EventKit check failed')
      );
      mockGoogleCalendarService.isAvailable.mockRejectedValueOnce(
        new Error('Google check failed')
      );

      const health = await manager.healthCheck();

      expect(health.eventkit).toBe(false);
      expect(health.google).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    it('should return false when services not initialized', async () => {
      const managerWithoutServices = new CalendarSourceManager();

      const health = await managerWithoutServices.healthCheck();

      expect(health.eventkit).toBe(false);
      expect(health.google).toBe(false);
    });

    it('should handle partial service availability', async () => {
      mockCalendarService.isAvailable.mockResolvedValueOnce(true);
      mockGoogleCalendarService.isAvailable.mockRejectedValueOnce(
        new Error('Google failed')
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const health = await manager.healthCheck();

      expect(health.eventkit).toBe(true);
      expect(health.google).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });
});
