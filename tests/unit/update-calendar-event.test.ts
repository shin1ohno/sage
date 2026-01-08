/**
 * Update Calendar Event Handler Tests
 * Requirements: update-calendar-event 1-8
 *
 * Unit tests for the handleUpdateCalendarEvent handler.
 */

import {
  handleUpdateCalendarEvent,
  CalendarToolsContext,
} from '../../src/tools/calendar/handlers.js';
import type { UserConfig } from '../../src/types/index.js';

describe('handleUpdateCalendarEvent', () => {
  let mockContext: CalendarToolsContext;
  let mockGetEvent: jest.Mock;
  let mockUpdateEvent: jest.Mock;
  let mockConfig: UserConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      user: { name: 'Test User', role: 'Engineer' },
      calendar: { sources: { google: { enabled: true } } },
    } as UserConfig;

    mockGetEvent = jest.fn();
    mockUpdateEvent = jest.fn();

    const mockGoogleCalendarService = {
      getEvent: mockGetEvent,
      updateEvent: mockUpdateEvent,
    };

    mockContext = {
      getConfig: jest.fn().mockReturnValue(mockConfig),
      getCalendarSourceManager: jest.fn().mockReturnValue(null),
      getCalendarEventResponseService: jest.fn().mockReturnValue(null),
      getGoogleCalendarService: jest.fn().mockReturnValue(mockGoogleCalendarService),
      getWorkingCadenceService: jest.fn().mockReturnValue(null),
      setWorkingCadenceService: jest.fn(),
      initializeServices: jest.fn(),
    };
  });

  describe('basic updates', () => {
    it('should update event title', async () => {
      const updatedEvent = {
        id: 'event-123',
        title: 'Updated Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
      };

      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        title: 'Updated Meeting',
      });

      expect(result.content[0].text).toContain('success');
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'event-123',
        { title: 'Updated Meeting' },
        undefined,
        undefined
      );
    });

    it('should update event notes/description', async () => {
      const updatedEvent = {
        id: 'event-123',
        title: 'Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
        description: 'Updated description',
      };

      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        notes: 'Updated description',
      });

      expect(result.content[0].text).toContain('success');
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'event-123',
        { description: 'Updated description' },
        undefined,
        undefined);
    });
  });

  describe('date/time updates', () => {
    it('should update start and end dates', async () => {
      const updatedEvent = {
        id: 'event-123',
        title: 'Meeting',
        start: '2026-01-16T14:00:00+09:00',
        end: '2026-01-16T15:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
      };

      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        startDate: '2026-01-16T14:00:00+09:00',
        endDate: '2026-01-16T15:00:00+09:00',
      });

      expect(result.content[0].text).toContain('success');
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'event-123',
        {
          start: '2026-01-16T14:00:00+09:00',
          end: '2026-01-16T15:00:00+09:00',
        },
        undefined,
        undefined);
    });

    it('should reject when start date is after end date', async () => {
      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        startDate: '2026-01-16T16:00:00+09:00',
        endDate: '2026-01-16T15:00:00+09:00',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('error');
      expect(responseText).toContain('開始日時は終了日時より前');
      expect(mockUpdateEvent).not.toHaveBeenCalled();
    });
  });

  describe('room management', () => {
    it('should add room to event', async () => {
      const existingEvent = {
        id: 'event-123',
        title: 'Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
        attendees: ['user1@example.com', 'user2@example.com'],
      };

      const updatedEvent = {
        ...existingEvent,
        attendees: ['user1@example.com', 'user2@example.com', 'room@resource.calendar.google.com'],
      };

      mockGetEvent.mockResolvedValue(existingEvent);
      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        roomId: 'room@resource.calendar.google.com',
      });

      expect(result.content[0].text).toContain('success');
      expect(result.content[0].text).toContain('会議室追加');
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'event-123',
        {
          attendees: ['user1@example.com', 'user2@example.com', 'room@resource.calendar.google.com'],
        },
        undefined,
        undefined);
    });

    it('should replace existing room when adding new room', async () => {
      const existingEvent = {
        id: 'event-123',
        title: 'Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
        attendees: ['user1@example.com', 'old-room@resource.calendar.google.com'],
      };

      const updatedEvent = {
        ...existingEvent,
        attendees: ['user1@example.com', 'new-room@resource.calendar.google.com'],
      };

      mockGetEvent.mockResolvedValue(existingEvent);
      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        roomId: 'new-room@resource.calendar.google.com',
      });

      expect(result.content[0].text).toContain('success');
      // Verify old room was removed and new room added
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'event-123',
        {
          attendees: ['user1@example.com', 'new-room@resource.calendar.google.com'],
        },
        undefined,
        undefined);
    });

    it('should remove room from event', async () => {
      const existingEvent = {
        id: 'event-123',
        title: 'Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
        attendees: ['user1@example.com', 'room@resource.calendar.google.com'],
      };

      const updatedEvent = {
        ...existingEvent,
        attendees: ['user1@example.com'],
      };

      mockGetEvent.mockResolvedValue(existingEvent);
      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        removeRoom: true,
      });

      expect(result.content[0].text).toContain('success');
      expect(result.content[0].text).toContain('会議室削除');
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'event-123',
        {
          attendees: ['user1@example.com'],
        },
        undefined,
        undefined);
    });
  });

  describe('error handling', () => {
    it('should return error when config is not set', async () => {
      mockContext.getConfig = jest.fn().mockReturnValue(null);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        title: 'New Title',
      });

      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('設定されていません');
    });

    it('should return error when Google Calendar is not available', async () => {
      mockContext.getGoogleCalendarService = jest.fn().mockReturnValue(null);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        title: 'New Title',
      });

      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('Google Calendar');
    });

    it('should handle event not found error', async () => {
      mockUpdateEvent.mockRejectedValue(
        new Error('Event not found (404)')
      );

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'non-existent-event',
        title: 'New Title',
      });

      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('見つかりませんでした');
    });

    it('should handle authentication error', async () => {
      mockUpdateEvent.mockRejectedValue(
        new Error('Unauthorized (401)')
      );

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        title: 'New Title',
      });

      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('アクセス権限');
    });

    it('should require Google Calendar for room operations', async () => {
      mockContext.getGoogleCalendarService = jest.fn().mockReturnValue(null);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        roomId: 'room@resource.calendar.google.com',
      });

      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('会議室');
      expect(result.content[0].text).toContain('Google Calendar');
    });
  });

  describe('attendee management', () => {
    it('should update attendees list', async () => {
      const updatedEvent = {
        id: 'event-123',
        title: 'Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
        attendees: ['new-user@example.com'],
      };

      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        attendees: ['new-user@example.com'],
      });

      expect(result.content[0].text).toContain('success');
      expect(result.content[0].text).toContain('参加者');
    });
  });

  describe('alarm/reminder updates', () => {
    it('should update reminders with alarm format', async () => {
      const updatedEvent = {
        id: 'event-123',
        title: 'Meeting',
        start: '2026-01-15T10:00:00+09:00',
        end: '2026-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google' as const,
      };

      mockUpdateEvent.mockResolvedValue(updatedEvent);

      const result = await handleUpdateCalendarEvent(mockContext, {
        eventId: 'event-123',
        alarms: ['-15m', '-1h'],
      });

      expect(result.content[0].text).toContain('success');
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'event-123',
        {
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 15 },
              { method: 'popup', minutes: 60 },
            ],
          },
        },
        undefined,
        undefined);
    });
  });
});
