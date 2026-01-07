/**
 * Configuration validation tests
 */

import { describe, expect, test } from '@jest/globals';
import {
  validateCalendarSources,
  CalendarSourcesSchema,
  RoomAvailabilityRequestSchema,
  CheckRoomAvailabilitySchema,
  validateRoomAvailabilityRequest,
  validateCheckRoomAvailability,
} from '../../src/config/validation.js';

describe('Calendar Sources Validation', () => {
  describe('validateCalendarSources', () => {
    test('should accept valid configuration with EventKit enabled', () => {
      const sources = {
        eventkit: { enabled: true },
        google: {
          enabled: false,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 300,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(sources);
    });

    test('should accept valid configuration with Google Calendar enabled', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: true,
          defaultCalendar: 'primary',
          excludedCalendars: ['holidays@group.v.calendar.google.com'],
          syncInterval: 300,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(sources);
    });

    test('should accept valid configuration with both sources enabled', () => {
      const sources = {
        eventkit: { enabled: true },
        google: {
          enabled: true,
          defaultCalendar: 'work@example.com',
          excludedCalendars: [],
          syncInterval: 600,
          enableNotifications: false,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(sources);
    });

    test('should reject configuration with both sources disabled', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: false,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 300,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain(
        'At least one calendar source must be enabled'
      );
    });

    test('should apply default values for Google Calendar optional fields', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(true);
      expect(result.data?.google.defaultCalendar).toBe('primary');
      expect(result.data?.google.excludedCalendars).toEqual([]);
      expect(result.data?.google.syncInterval).toBe(300);
      expect(result.data?.google.enableNotifications).toBe(true);
    });

    test('should reject syncInterval less than 60 seconds', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: true,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 30,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toContain('syncInterval');
    });

    test('should reject syncInterval greater than 3600 seconds', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: true,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 5000,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toContain('syncInterval');
    });

    test('should accept syncInterval at minimum boundary (60)', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: true,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 60,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(true);
      expect(result.data?.google.syncInterval).toBe(60);
    });

    test('should accept syncInterval at maximum boundary (3600)', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: true,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 3600,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(true);
      expect(result.data?.google.syncInterval).toBe(3600);
    });

    test('should accept multiple excluded calendars', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: true,
          defaultCalendar: 'primary',
          excludedCalendars: [
            'holidays@group.v.calendar.google.com',
            'spam@example.com',
            'archived@example.com',
          ],
          syncInterval: 300,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(true);
      expect(result.data?.google.excludedCalendars).toHaveLength(3);
    });

    test('should reject missing eventkit field', () => {
      const sources = {
        google: {
          enabled: true,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 300,
          enableNotifications: true,
        },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(false);
    });

    test('should reject missing google field', () => {
      const sources = {
        eventkit: { enabled: true },
      };

      const result = validateCalendarSources(sources);
      expect(result.success).toBe(false);
    });
  });

  describe('CalendarSourcesSchema', () => {
    test('should parse valid configuration', () => {
      const sources = {
        eventkit: { enabled: true },
        google: {
          enabled: false,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 300,
          enableNotifications: true,
        },
      };

      const parsed = CalendarSourcesSchema.parse(sources);
      expect(parsed).toEqual(sources);
    });

    test('should throw ZodError for invalid configuration', () => {
      const sources = {
        eventkit: { enabled: false },
        google: {
          enabled: false,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 300,
          enableNotifications: true,
        },
      };

      expect(() => CalendarSourcesSchema.parse(sources)).toThrow();
    });
  });
});

describe('Room Availability Validation', () => {
  describe('RoomAvailabilityRequestSchema', () => {
    test('should accept valid request with endTime', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    test('should accept valid request with durationMinutes', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    test('should accept valid request with all filters', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
        minCapacity: 10,
        building: 'Main',
        floor: '3',
        features: ['projector', 'whiteboard'],
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.minCapacity).toBe(10);
        expect(result.data.features).toEqual(['projector', 'whiteboard']);
      }
    });

    test('should reject request without startTime', () => {
      const request = {
        endTime: '2025-01-15T11:00:00+09:00',
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    test('should reject request without endTime or durationMinutes', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('endTime'))).toBe(true);
      }
    });

    test('should reject durationMinutes less than 1', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 0,
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    test('should reject durationMinutes greater than 480', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 500,
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    test('should reject when startTime is after endTime', () => {
      const request = {
        startTime: '2025-01-15T12:00:00+09:00',
        endTime: '2025-01-15T10:00:00+09:00',
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('before'))).toBe(true);
      }
    });

    test('should accept both endTime and durationMinutes (endTime takes precedence)', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
        durationMinutes: 30,
      };

      const result = RoomAvailabilityRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('CheckRoomAvailabilitySchema', () => {
    test('should accept valid request', () => {
      const request = {
        roomId: 'room-123@resource.calendar.google.com',
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      };

      const result = CheckRoomAvailabilitySchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    test('should reject request without roomId', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      };

      const result = CheckRoomAvailabilitySchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    test('should reject request without startTime', () => {
      const request = {
        roomId: 'room-123@resource.calendar.google.com',
        endTime: '2025-01-15T11:00:00+09:00',
      };

      const result = CheckRoomAvailabilitySchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    test('should reject request without endTime', () => {
      const request = {
        roomId: 'room-123@resource.calendar.google.com',
        startTime: '2025-01-15T10:00:00+09:00',
      };

      const result = CheckRoomAvailabilitySchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    test('should reject when startTime is after endTime', () => {
      const request = {
        roomId: 'room-123@resource.calendar.google.com',
        startTime: '2025-01-15T12:00:00+09:00',
        endTime: '2025-01-15T10:00:00+09:00',
      };

      const result = CheckRoomAvailabilitySchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('before'))).toBe(true);
      }
    });
  });

  describe('validateRoomAvailabilityRequest', () => {
    test('should return success for valid request', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      };

      const result = validateRoomAvailabilityRequest(request);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    test('should return error for invalid request', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
      };

      const result = validateRoomAvailabilityRequest(request);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateCheckRoomAvailability', () => {
    test('should return success for valid request', () => {
      const request = {
        roomId: 'room-123@resource.calendar.google.com',
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      };

      const result = validateCheckRoomAvailability(request);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    test('should return error for invalid request', () => {
      const request = {
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      };

      const result = validateCheckRoomAvailability(request);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
