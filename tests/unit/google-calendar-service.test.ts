/**
 * Google Calendar Service Tests
 * Requirements: 1, 10 (Google Calendar OAuth Authentication, Health Check)
 *
 * Comprehensive tests for the GoogleCalendarService implementation.
 */

import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import { GoogleOAuthHandler } from '../../src/oauth/google-oauth-handler.js';
import type { GoogleCalendarEvent } from '../../src/types/google-calendar-types.js';

// Mock modules
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(),
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

jest.mock('../../src/utils/retry.js', () => {
  const actual = jest.requireActual('../../src/utils/retry.js');
  return {
    ...actual,
    retryWithBackoff: jest.fn(async (fn) => fn()),
  };
});

describe('GoogleCalendarService', () => {
  const mockUserId = 'test-user-123';
  const mockUserEmail = 'test@example.com';

  let service: GoogleCalendarService;
  let mockOAuthHandler: jest.Mocked<GoogleOAuthHandler>;
  let mockCalendarClient: any;
  let mockOAuth2Client: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock OAuth2Client
    mockOAuth2Client = {
      setCredentials: jest.fn(),
      credentials: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expiry_date: Date.now() + 3600 * 1000,
      },
    };

    // Create mock calendar client
    mockCalendarClient = {
      calendarList: {
        list: jest.fn(),
        get: jest.fn(),
      },
      events: {
        list: jest.fn(),
        insert: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        get: jest.fn(),
      },
    };

    // Mock googleapis
    const { google } = require('googleapis');
    google.calendar.mockReturnValue(mockCalendarClient);
    google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

    // Create mock OAuth handler
    mockOAuthHandler = {
      ensureValidToken: jest.fn().mockResolvedValue('mock-access-token'),
      getTokens: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: ['https://www.googleapis.com/auth/calendar'],
      }),
      getOAuth2Client: jest.fn().mockReturnValue(mockOAuth2Client),
    } as any;

    // Create service instance
    service = new GoogleCalendarService(mockOAuthHandler, { userId: mockUserId });
  });

  describe('constructor', () => {
    it('should create instance with OAuth handler', () => {
      expect(service).toBeInstanceOf(GoogleCalendarService);
    });

    it('should use provided userId in config', () => {
      const customService = new GoogleCalendarService(mockOAuthHandler, {
        userId: 'custom-user',
      });
      expect(customService).toBeInstanceOf(GoogleCalendarService);
    });

    it('should use default userId if not provided', () => {
      const defaultService = new GoogleCalendarService(mockOAuthHandler);
      expect(defaultService).toBeInstanceOf(GoogleCalendarService);
    });
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      await service.authenticate();

      expect(mockOAuthHandler.ensureValidToken).toHaveBeenCalledTimes(1);
      expect(mockOAuthHandler.getTokens).toHaveBeenCalledTimes(1);
      expect(mockOAuthHandler.getOAuth2Client).toHaveBeenCalledTimes(1);

      const { google } = require('googleapis');
      expect(google.calendar).toHaveBeenCalledWith({
        version: 'v3',
        auth: mockOAuth2Client,
      });
    });

    it('should throw error if ensureValidToken fails', async () => {
      mockOAuthHandler.ensureValidToken.mockRejectedValueOnce(
        new Error('Authentication failed')
      );

      await expect(service.authenticate()).rejects.toThrow(
        'Failed to authenticate with Google Calendar: Authentication failed'
      );
    });

    it('should throw error if no tokens found after ensureValidToken', async () => {
      mockOAuthHandler.getTokens.mockResolvedValueOnce(null);

      await expect(service.authenticate()).rejects.toThrow(
        'Failed to authenticate with Google Calendar: No stored tokens found after ensureValidToken()'
      );
    });

    it('should handle unknown errors during authentication', async () => {
      mockOAuthHandler.ensureValidToken.mockRejectedValueOnce('Unknown error');

      await expect(service.authenticate()).rejects.toThrow(
        'Failed to authenticate with Google Calendar: Unknown error'
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when API is available', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValueOnce({ data: {} });

      const result = await service.isAvailable();

      expect(result).toBe(true);
      expect(mockCalendarClient.calendarList.list).toHaveBeenCalledWith({
        maxResults: 1,
      });
    });

    it('should authenticate if client is not initialized', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValueOnce({ data: {} });

      const result = await service.isAvailable();

      expect(result).toBe(true);
      expect(mockOAuthHandler.ensureValidToken).toHaveBeenCalledTimes(1);
    });

    it('should return false when API call fails', async () => {
      mockCalendarClient.calendarList.list.mockRejectedValueOnce(
        new Error('API Error')
      );

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false when authentication fails', async () => {
      mockOAuthHandler.ensureValidToken.mockRejectedValueOnce(
        new Error('Auth failed')
      );

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should suppress all errors and return false', async () => {
      mockCalendarClient.calendarList.list.mockRejectedValueOnce('Unknown error');

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('listEvents', () => {
    const mockGoogleEvent: GoogleCalendarEvent = {
      id: 'event-123',
      summary: 'Test Event',
      description: 'Test Description',
      location: 'Test Location',
      start: { dateTime: '2026-01-15T10:00:00Z' },
      end: { dateTime: '2026-01-15T11:00:00Z' },
      attendees: [{ email: 'attendee@example.com', responseStatus: 'accepted' }],
      iCalUID: 'ical-123',
      status: 'confirmed',
    };

    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should successfully fetch events with pagination', async () => {
      // Mock first page response
      mockCalendarClient.events.list
        .mockResolvedValueOnce({
          data: {
            items: [mockGoogleEvent],
            nextPageToken: 'page-2-token',
          },
        })
        .mockResolvedValueOnce({
          data: {
            items: [{ ...mockGoogleEvent, id: 'event-456' }],
            nextPageToken: undefined,
          },
        });

      const events = await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });

      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event-123');
      expect(events[1].id).toBe('event-456');
      expect(mockCalendarClient.events.list).toHaveBeenCalledTimes(2);
    });

    it('should handle recurring events with singleEvents=true', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: {
          items: [mockGoogleEvent],
        },
      });

      await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });

      expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          singleEvents: true,
        })
      );
    });

    it('should convert GoogleCalendarEvent to CalendarEvent', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: {
          items: [mockGoogleEvent],
        },
      });

      const events = await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });

      expect(events[0]).toEqual({
        id: 'event-123',
        title: 'Test Event',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
        isAllDay: false,
        source: 'google',
        location: 'Test Location',
        description: 'Test Description',
        attendees: ['attendee@example.com'],
        status: 'confirmed',
        iCalUID: 'ical-123',
        calendar: undefined,
      });
    });

    it('should retry on rate limit (429)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        const error = new Error('Rate limit exceeded 429');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(true);
        return fn();
      });

      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [mockGoogleEvent] },
      });

      await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });

      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it('should handle auth errors (401) without retry', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (_fn: any, options: any) => {
        const error = new Error('Unauthorized 401');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(false);
        throw error;
      });

      await expect(
        service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        })
      ).rejects.toThrow();
    });

    it('should use custom calendar ID', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [] },
      });

      await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
        calendarId: 'custom-calendar-id',
      });

      expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'custom-calendar-id',
        })
      );
    });

    it('should normalize simple date format (YYYY-MM-DD) to RFC3339', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [] },
      });

      await service.listEvents({
        startDate: '2026-01-15', // Simple format
        endDate: '2026-01-16',
      });

      expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: '2026-01-15T00:00:00Z', // Normalized to RFC3339
          timeMax: '2026-01-16T00:00:00Z',
        })
      );
    });

    it('should pass through RFC3339 format unchanged', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [] },
      });

      await service.listEvents({
        startDate: '2026-01-15T10:00:00+09:00', // Already RFC3339
        endDate: '2026-01-16T10:00:00+09:00',
      });

      expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: '2026-01-15T10:00:00+09:00', // Unchanged
          timeMax: '2026-01-16T10:00:00+09:00',
        })
      );
    });
  });

  describe('createEvent', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should create regular event successfully', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'created-event-123',
        summary: 'New Event',
        start: { dateTime: '2026-01-15T10:00:00Z' },
        end: { dateTime: '2026-01-15T11:00:00Z' },
        iCalUID: 'ical-new-123',
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'New Event',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
      });

      expect(event.id).toBe('created-event-123');
      expect(event.title).toBe('New Event');
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          sendUpdates: 'none',
        })
      );
    });

    it('should create all-day event (uses date field)', async () => {
      const mockAllDayEvent: GoogleCalendarEvent = {
        id: 'all-day-event-123',
        summary: 'All Day Event',
        start: { date: '2026-01-15' },
        end: { date: '2026-01-16' },
        iCalUID: 'ical-all-day-123',
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockAllDayEvent,
      });

      const event = await service.createEvent({
        title: 'All Day Event',
        start: '2026-01-15T00:00:00Z',
        end: '2026-01-16T00:00:00Z',
        isAllDay: true,
      });

      expect(event.isAllDay).toBe(true);
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
          }),
        })
      );
    });

    it('should create event with attendees', async () => {
      const mockEventWithAttendees: GoogleCalendarEvent = {
        id: 'event-with-attendees-123',
        summary: 'Meeting',
        start: { dateTime: '2026-01-15T10:00:00Z' },
        end: { dateTime: '2026-01-15T11:00:00Z' },
        attendees: [
          { email: 'user1@example.com', responseStatus: 'needsAction' },
          { email: 'user2@example.com', responseStatus: 'needsAction' },
        ],
        iCalUID: 'ical-meeting-123',
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockEventWithAttendees,
      });

      await service.createEvent({
        title: 'Meeting',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
        attendees: ['user1@example.com', 'user2@example.com'],
      });

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            attendees: [{ email: 'user1@example.com' }, { email: 'user2@example.com' }],
          }),
          sendUpdates: 'all',
        })
      );
    });

    it('should create event with reminders', async () => {
      const mockEventWithReminders: GoogleCalendarEvent = {
        id: 'event-with-reminders-123',
        summary: 'Reminder Event',
        start: { dateTime: '2026-01-15T10:00:00Z' },
        end: { dateTime: '2026-01-15T11:00:00Z' },
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 30 }],
        },
        iCalUID: 'ical-reminder-123',
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockEventWithReminders,
      });

      await service.createEvent({
        title: 'Reminder Event',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 30 }],
        },
      });

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            reminders: {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: 30 }],
            },
          }),
        })
      );
    });

    it('should retry on server error (500)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        const error = new Error('Internal Server Error 500');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(true);
        return fn();
      });

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: {
          id: 'created-event-123',
          summary: 'New Event',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          iCalUID: 'ical-123',
        },
      });

      await service.createEvent({
        title: 'New Event',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
      });

      expect(retryWithBackoff).toHaveBeenCalled();
    });
  });

  describe('updateEvent', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should update event fields successfully', async () => {
      const mockUpdatedEvent: GoogleCalendarEvent = {
        id: 'event-123',
        summary: 'Updated Title',
        start: { dateTime: '2026-01-15T10:00:00Z' },
        end: { dateTime: '2026-01-15T11:00:00Z' },
        iCalUID: 'ical-123',
      };

      mockCalendarClient.events.patch.mockResolvedValueOnce({
        data: mockUpdatedEvent,
      });

      const event = await service.updateEvent('event-123', {
        title: 'Updated Title',
      });

      expect(event.title).toBe('Updated Title');
      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-123',
          requestBody: expect.objectContaining({
            summary: 'Updated Title',
          }),
          sendUpdates: 'none',
        })
      );
    });

    it('should handle partial updates (only specified fields)', async () => {
      mockCalendarClient.events.patch.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          summary: 'Original Title',
          location: 'New Location',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          iCalUID: 'ical-123',
        },
      });

      await service.updateEvent('event-123', {
        location: 'New Location',
      });

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            location: 'New Location',
          }),
        })
      );

      const callArgs = mockCalendarClient.events.patch.mock.calls[0][0];
      expect(callArgs.requestBody.summary).toBeUndefined();
    });

    it('should update all-day event', async () => {
      mockCalendarClient.events.patch.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          summary: 'All Day Event',
          start: { date: '2026-01-16' },
          end: { date: '2026-01-17' },
          iCalUID: 'ical-123',
        },
      });

      await service.updateEvent('event-123', {
        start: '2026-01-16T00:00:00Z',
        end: '2026-01-17T00:00:00Z',
        isAllDay: true,
      });

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            start: { date: '2026-01-16' },
            end: { date: '2026-01-17' },
          }),
        })
      );
    });

    it('should send notifications when attendees change', async () => {
      mockCalendarClient.events.patch.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          summary: 'Meeting',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          attendees: [{ email: 'new-attendee@example.com', responseStatus: 'needsAction' }],
          iCalUID: 'ical-123',
        },
      });

      await service.updateEvent('event-123', {
        attendees: ['new-attendee@example.com'],
      });

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          sendUpdates: 'all',
        })
      );
    });

    it('should handle 404 error', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (_fn: any, options: any) => {
        const error = new Error('Event not found 404');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(false);
        throw error;
      });

      await expect(
        service.updateEvent('non-existent-event', { title: 'Updated' })
      ).rejects.toThrow();
    });
  });

  describe('deleteEvent', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should delete single event successfully', async () => {
      mockCalendarClient.events.delete.mockResolvedValueOnce({});

      await service.deleteEvent('event-123');

      expect(mockCalendarClient.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
      });
    });

    it('should handle already deleted event (404)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (_fn: any, options: any) => {
        const error = new Error('Event not found 404');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(false);
        throw error;
      });

      // Should not throw error
      await service.deleteEvent('already-deleted-event');
    });

    it('should retry on rate limit', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        const error = new Error('Rate limit exceeded 429');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(true);
        return fn();
      });

      mockCalendarClient.events.delete.mockResolvedValueOnce({});

      await service.deleteEvent('event-123');

      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it('should use custom calendar ID', async () => {
      mockCalendarClient.events.delete.mockResolvedValueOnce({});

      await service.deleteEvent('event-123', 'custom-calendar-id');

      expect(mockCalendarClient.events.delete).toHaveBeenCalledWith({
        calendarId: 'custom-calendar-id',
        eventId: 'event-123',
      });
    });
  });

  describe('deleteEventsBatch', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should delete multiple events (< 50)', async () => {
      mockCalendarClient.events.delete
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await service.deleteEventsBatch([
        'event-1',
        'event-2',
        'event-3',
      ]);

      expect(result.deleted).toBe(3);
      expect(mockCalendarClient.events.delete).toHaveBeenCalledTimes(3);
    });

    it('should handle chunking for > 50 events', async () => {
      const eventIds = Array.from({ length: 125 }, (_, i) => `event-${i}`);
      mockCalendarClient.events.delete.mockResolvedValue({});

      const result = await service.deleteEventsBatch(eventIds);

      expect(result.deleted).toBe(125);
      // Should be called 125 times (50 + 50 + 25)
      expect(mockCalendarClient.events.delete).toHaveBeenCalledTimes(125);
    });

    it('should return correct deleted count', async () => {
      mockCalendarClient.events.delete
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await service.deleteEventsBatch(['event-1', 'event-2']);

      expect(result).toEqual({ deleted: 2 });
    });

    it('should handle partial failures', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockCalendarClient.events.delete
        .mockResolvedValueOnce({}) // event-1 success
        .mockRejectedValueOnce(new Error('Failed to delete')) // event-2 failure
        .mockResolvedValueOnce({}); // event-3 success

      await service.deleteEventsBatch(['event-1', 'event-2', 'event-3']);

      // Partial success: chunk with failure will not count, but other chunks succeed
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle 404 errors gracefully', async () => {
      mockCalendarClient.events.delete
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ message: 'Event not found 404' });

      const result = await service.deleteEventsBatch(['event-1', 'already-deleted']);

      // Both should count as successful
      expect(result.deleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('respondToEvent', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should accept invitation', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValueOnce({
        data: { id: mockUserEmail },
      });

      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          summary: 'Meeting',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          attendees: [
            { email: mockUserEmail, responseStatus: 'needsAction' },
            { email: 'organizer@example.com', responseStatus: 'accepted' },
          ],
          organizer: { email: 'organizer@example.com' },
        },
      });

      mockCalendarClient.events.patch.mockResolvedValueOnce({});

      await service.respondToEvent('event-123', 'accepted');

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-123',
          requestBody: expect.objectContaining({
            attendees: expect.arrayContaining([
              expect.objectContaining({
                email: mockUserEmail,
                responseStatus: 'accepted',
              }),
            ]),
          }),
          sendUpdates: 'all',
        })
      );
    });

    it('should decline invitation', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValueOnce({
        data: { id: mockUserEmail },
      });

      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          attendees: [
            { email: mockUserEmail, responseStatus: 'needsAction' },
          ],
          organizer: { email: 'organizer@example.com' },
        },
      });

      mockCalendarClient.events.patch.mockResolvedValueOnce({});

      await service.respondToEvent('event-123', 'declined');

      const patchCall = mockCalendarClient.events.patch.mock.calls[0][0];
      expect(patchCall.requestBody.attendees[0].responseStatus).toBe('declined');
    });

    it('should mark tentative', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValueOnce({
        data: { id: mockUserEmail },
      });

      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          attendees: [
            { email: mockUserEmail, responseStatus: 'needsAction' },
          ],
          organizer: { email: 'organizer@example.com' },
        },
      });

      mockCalendarClient.events.patch.mockResolvedValueOnce({});

      await service.respondToEvent('event-123', 'tentative');

      const patchCall = mockCalendarClient.events.patch.mock.calls[0][0];
      expect(patchCall.requestBody.attendees[0].responseStatus).toBe('tentative');
    });

    it('should throw error if not attendee', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValueOnce({
        data: { id: mockUserEmail },
      });

      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          attendees: [
            { email: 'other-user@example.com', responseStatus: 'needsAction' },
          ],
          organizer: { email: 'organizer@example.com' },
        },
      });

      await expect(
        service.respondToEvent('event-123', 'accepted')
      ).rejects.toThrow(`User ${mockUserEmail} is not an attendee of this event.`);
    });

    it('should throw error if organizer', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValueOnce({
        data: { id: mockUserEmail },
      });

      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          attendees: [
            { email: mockUserEmail, responseStatus: 'needsAction' },
          ],
          organizer: { email: mockUserEmail },
        },
      });

      await expect(
        service.respondToEvent('event-123', 'accepted')
      ).rejects.toThrow('Cannot respond to event as the organizer.');
    });

    it('should throw error if event has no attendees', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValueOnce({
        data: { id: mockUserEmail },
      });

      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          attendees: [],
        },
      });

      await expect(
        service.respondToEvent('event-123', 'accepted')
      ).rejects.toThrow('Event has no attendees. Cannot respond to this event.');
    });
  });

  describe('listCalendars', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should list all calendars', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'primary-calendar-id',
              summary: 'Primary Calendar',
              primary: true,
              backgroundColor: '#9fe1e7',
              accessRole: 'owner',
            },
            {
              id: 'secondary-calendar-id',
              summary: 'Work Calendar',
              primary: false,
              backgroundColor: '#f83a22',
              accessRole: 'writer',
            },
          ],
        },
      });

      const calendars = await service.listCalendars();

      expect(calendars).toHaveLength(2);
      expect(mockCalendarClient.calendarList.list).toHaveBeenCalledWith({
        showHidden: true,
      });
    });

    it('should return correct CalendarInfo format', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'calendar-1',
              summary: 'My Calendar',
              primary: false,
              backgroundColor: '#9fe1e7',
              accessRole: 'owner',
            },
          ],
        },
      });

      const calendars = await service.listCalendars();

      expect(calendars[0]).toEqual({
        id: 'calendar-1',
        name: 'My Calendar',
        source: 'google',
        isPrimary: false,
        color: '#9fe1e7',
        accessRole: 'owner',
      });
    });

    it('should identify primary calendar', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'primary-id',
              summary: 'Primary',
              primary: true,
              accessRole: 'owner',
            },
            {
              id: 'secondary-id',
              summary: 'Secondary',
              primary: false,
              accessRole: 'reader',
            },
          ],
        },
      });

      const calendars = await service.listCalendars();

      const primaryCalendar = calendars.find(c => c.isPrimary);
      expect(primaryCalendar).toBeDefined();
      expect(primaryCalendar?.id).toBe('primary-id');
    });

    it('should handle empty calendar list', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValueOnce({
        data: {
          items: [],
        },
      });

      const calendars = await service.listCalendars();

      expect(calendars).toEqual([]);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should retry on 429 (rate limit)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        const error = new Error('Rate limit exceeded 429');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(true);
        return fn();
      });

      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [] },
      });

      await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });
    });

    it('should retry on 500 (server error)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        const error = new Error('Internal Server Error 500');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(true);
        return fn();
      });

      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [] },
      });

      await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });
    });

    it('should retry on 503 (service unavailable)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        const error = new Error('Service Unavailable 503');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(true);
        return fn();
      });

      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [] },
      });

      await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });
    });

    it('should not retry on 401 (unauthorized)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (_fn: any, options: any) => {
        const error = new Error('Unauthorized 401');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(false);
        throw error;
      });

      await expect(
        service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        })
      ).rejects.toThrow();
    });

    it('should not retry on 403 (forbidden)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (_fn: any, options: any) => {
        const error = new Error('Forbidden 403');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(false);
        throw error;
      });

      await expect(
        service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        })
      ).rejects.toThrow();
    });

    it('should not retry on 404 (not found)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (_fn: any, options: any) => {
        const error = new Error('Event not found 404');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(false);
        throw error;
      });

      await expect(
        service.updateEvent('non-existent', { title: 'Updated' })
      ).rejects.toThrow();
    });

    it('should throw meaningful errors', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (_fn: any) => {
        throw new Error('Network timeout');
      });

      await expect(
        service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        })
      ).rejects.toThrow('Failed to list events from Google Calendar: Network timeout');
    });
  });

  describe('integration with GoogleOAuthHandler', () => {
    it('should use OAuth handler to get valid tokens', async () => {
      await service.authenticate();

      expect(mockOAuthHandler.ensureValidToken).toHaveBeenCalledTimes(1);
      expect(mockOAuthHandler.getTokens).toHaveBeenCalledTimes(1);
      expect(mockOAuthHandler.getOAuth2Client).toHaveBeenCalledTimes(1);
    });

    it('should pass tokens to OAuth2Client', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: ['https://www.googleapis.com/auth/calendar'],
      };

      mockOAuthHandler.getTokens.mockResolvedValueOnce(mockTokens);

      await service.authenticate();

      expect(mockOAuthHandler.getOAuth2Client).toHaveBeenCalledWith(mockTokens);
    });
  });
});
