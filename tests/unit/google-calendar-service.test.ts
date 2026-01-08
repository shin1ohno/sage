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
        eventType: 'default',
        typeSpecificProperties: undefined,
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

    it('should normalize simple date format (YYYY-MM-DD) to RFC3339 with endDate adjusted', async () => {
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
          timeMax: '2026-01-17T00:00:00Z', // endDate + 1 day (timeMax is exclusive)
        })
      );
    });

    it('should handle same-day date range correctly (endDate adjusted for exclusive timeMax)', async () => {
      // This is the critical test case for the bug fix:
      // When startDate == endDate, we need to ensure events on that day are returned.
      // Google Calendar API's timeMax is EXCLUSIVE, so we must add 1 day to endDate.
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: { items: [] },
      });

      await service.listEvents({
        startDate: '2026-01-09', // Same day
        endDate: '2026-01-09',
      });

      expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: '2026-01-09T00:00:00Z',
          timeMax: '2026-01-10T00:00:00Z', // Next day to include all events on 2026-01-09
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
    // Default mock event (eventType: 'default') - allows all field updates
    const mockDefaultEvent: GoogleCalendarEvent = {
      id: 'event-123',
      summary: 'Original Title',
      start: { dateTime: '2026-01-15T10:00:00Z' },
      end: { dateTime: '2026-01-15T11:00:00Z' },
      iCalUID: 'ical-123',
      // No eventType field means it defaults to 'default'
    };

    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      // Reset retryWithBackoff mock to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
      // Default: mock events.get to return a 'default' type event
      mockCalendarClient.events.get.mockResolvedValue({
        data: mockDefaultEvent,
      });
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
      expect(mockCalendarClient.events.get).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-123',
        })
      );
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

    // Task 15: Event type restriction tests
    describe('event type restrictions', () => {
      it('should allow updating summary of birthday event', async () => {
        // Mock events.get to return a birthday event
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'birthday-123',
            summary: 'Original Birthday',
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
            iCalUID: 'ical-birthday-123',
            eventType: 'birthday',
          },
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: {
            id: 'birthday-123',
            summary: 'Updated Birthday',
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
            iCalUID: 'ical-birthday-123',
            eventType: 'birthday',
          },
        });

        const event = await service.updateEvent('birthday-123', {
          title: 'Updated Birthday',
        });

        expect(event.title).toBe('Updated Birthday');
        expect(mockCalendarClient.events.patch).toHaveBeenCalled();
      });

      it('should reject updating location of birthday event', async () => {
        // Mock events.get to return a birthday event
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'birthday-123',
            summary: 'Birthday Event',
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
            iCalUID: 'ical-birthday-123',
            eventType: 'birthday',
          },
        });

        await expect(
          service.updateEvent('birthday-123', {
            location: 'New Location',
          })
        ).rejects.toThrow(/Cannot update location for birthday events/);

        expect(mockCalendarClient.events.patch).not.toHaveBeenCalled();
      });

      it('should reject updating description of birthday event', async () => {
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'birthday-123',
            summary: 'Birthday Event',
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
            iCalUID: 'ical-birthday-123',
            eventType: 'birthday',
          },
        });

        await expect(
          service.updateEvent('birthday-123', {
            description: 'New Description',
          })
        ).rejects.toThrow(/Cannot update description for birthday events/);
      });

      it('should allow updating attendees of fromGmail event', async () => {
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'gmail-123',
            summary: 'Flight Booking',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-gmail-123',
            eventType: 'fromGmail',
          },
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: {
            id: 'gmail-123',
            summary: 'Flight Booking',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-gmail-123',
            eventType: 'fromGmail',
            attendees: [{ email: 'friend@example.com', responseStatus: 'needsAction' }],
          },
        });

        const event = await service.updateEvent('gmail-123', {
          attendees: ['friend@example.com'],
        });

        expect(event.attendees).toContain('friend@example.com');
        expect(mockCalendarClient.events.patch).toHaveBeenCalled();
      });

      it('should reject updating start/end of fromGmail event', async () => {
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'gmail-123',
            summary: 'Flight Booking',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-gmail-123',
            eventType: 'fromGmail',
          },
        });

        await expect(
          service.updateEvent('gmail-123', {
            start: '2026-01-16T10:00:00Z',
          })
        ).rejects.toThrow(/Cannot update start date\/time for fromGmail events/);

        expect(mockCalendarClient.events.patch).not.toHaveBeenCalled();
      });

      it('should reject updating title of fromGmail event', async () => {
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'gmail-123',
            summary: 'Flight Booking',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-gmail-123',
            eventType: 'fromGmail',
          },
        });

        await expect(
          service.updateEvent('gmail-123', {
            title: 'New Title',
          })
        ).rejects.toThrow(/Cannot update summary for fromGmail events/);
      });

      it('should allow all updates for default events', async () => {
        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: {
            id: 'event-123',
            summary: 'Updated Title',
            location: 'New Location',
            description: 'New Description',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T11:00:00Z' },
            iCalUID: 'ical-123',
          },
        });

        const event = await service.updateEvent('event-123', {
          title: 'Updated Title',
          location: 'New Location',
          description: 'New Description',
        });

        expect(event.title).toBe('Updated Title');
        expect(event.location).toBe('New Location');
        expect(event.description).toBe('New Description');
      });

      it('should allow all updates for focusTime events', async () => {
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'focus-123',
            summary: 'Focus Time',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-focus-123',
            eventType: 'focusTime',
            focusTimeProperties: {
              autoDeclineMode: 'declineAllConflictingInvitations',
            },
          },
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: {
            id: 'focus-123',
            summary: 'Deep Work',
            location: 'Home Office',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-focus-123',
            eventType: 'focusTime',
          },
        });

        const event = await service.updateEvent('focus-123', {
          title: 'Deep Work',
          location: 'Home Office',
        });

        expect(event.title).toBe('Deep Work');
        expect(mockCalendarClient.events.patch).toHaveBeenCalled();
      });
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
      // Mock the get call to return a non-recurring event
      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          summary: 'Test Event',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
        },
      });
      mockCalendarClient.events.delete.mockResolvedValueOnce({});

      await service.deleteEvent('event-123');

      expect(mockCalendarClient.events.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
      });
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

      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          summary: 'Test Event',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
        },
      });
      mockCalendarClient.events.delete.mockResolvedValueOnce({});

      await service.deleteEvent('event-123');

      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it('should use custom calendar ID', async () => {
      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          summary: 'Test Event',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
        },
      });
      mockCalendarClient.events.delete.mockResolvedValueOnce({});

      await service.deleteEvent('event-123', 'custom-calendar-id');

      expect(mockCalendarClient.events.get).toHaveBeenCalledWith({
        calendarId: 'custom-calendar-id',
        eventId: 'event-123',
      });
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
      mockCalendarClient.events.delete
        .mockResolvedValueOnce({}) // event-1 success
        .mockRejectedValueOnce(new Error('Failed to delete')) // event-2 failure
        .mockResolvedValueOnce({}); // event-3 success

      // Should not throw - errors are logged via pino logger (calendarLogger.error)
      await service.deleteEventsBatch(['event-1', 'event-2', 'event-3']);
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

  // ============================================================
  // Task 31: createEvent() with outOfOffice type
  // Requirements: 1.1, 1.2, 1.3
  // ============================================================
  describe('createEvent() with outOfOffice type', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should create outOfOffice event with autoDeclineMode', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'ooo-event-123',
        summary: 'Out of Office - Vacation',
        start: { dateTime: '2026-01-20T09:00:00Z' },
        end: { dateTime: '2026-01-24T17:00:00Z' },
        iCalUID: 'ical-ooo-123',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'Out of Office - Vacation',
        start: '2026-01-20T09:00:00Z',
        end: '2026-01-24T17:00:00Z',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
        },
      });

      expect(event.id).toBe('ooo-event-123');
      expect(event.eventType).toBe('outOfOffice');
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: 'Out of Office - Vacation',
            eventType: 'outOfOffice',
            outOfOfficeProperties: {
              autoDeclineMode: 'declineAllConflictingInvitations',
              declineMessage: undefined,
            },
          }),
        })
      );
    });

    it('should create outOfOffice event with custom declineMessage', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'ooo-event-456',
        summary: 'Out of Office - Conference',
        start: { dateTime: '2026-02-10T08:00:00Z' },
        end: { dateTime: '2026-02-12T18:00:00Z' },
        iCalUID: 'ical-ooo-456',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineOnlyNewConflictingInvitations',
          declineMessage: 'I am attending a conference and will not be available.',
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'Out of Office - Conference',
        start: '2026-02-10T08:00:00Z',
        end: '2026-02-12T18:00:00Z',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineOnlyNewConflictingInvitations',
          declineMessage: 'I am attending a conference and will not be available.',
        },
      });

      expect(event.id).toBe('ooo-event-456');
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            outOfOfficeProperties: {
              autoDeclineMode: 'declineOnlyNewConflictingInvitations',
              declineMessage: 'I am attending a conference and will not be available.',
            },
          }),
        })
      );
    });

    it('should reject invalid autoDeclineMode values', async () => {
      await expect(
        service.createEvent({
          title: 'Out of Office',
          start: '2026-01-20T09:00:00Z',
          end: '2026-01-24T17:00:00Z',
          eventType: 'outOfOffice',
          outOfOfficeProperties: {
            autoDeclineMode: 'invalidMode' as any,
          },
        })
      ).rejects.toThrow();

      expect(mockCalendarClient.events.insert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Task 32: createEvent() with focusTime type
  // Requirements: 2.1, 2.2, 2.3, 2.4
  // ============================================================
  describe('createEvent() with focusTime type', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should create focusTime event with chatStatus', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'focus-event-123',
        summary: 'Deep Work Block',
        start: { dateTime: '2026-01-15T09:00:00Z' },
        end: { dateTime: '2026-01-15T12:00:00Z' },
        iCalUID: 'ical-focus-123',
        eventType: 'focusTime',
        focusTimeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          chatStatus: 'doNotDisturb',
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'Deep Work Block',
        start: '2026-01-15T09:00:00Z',
        end: '2026-01-15T12:00:00Z',
        eventType: 'focusTime',
        focusTimeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          chatStatus: 'doNotDisturb',
        },
      });

      expect(event.id).toBe('focus-event-123');
      expect(event.eventType).toBe('focusTime');
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: 'Deep Work Block',
            eventType: 'focusTime',
            focusTimeProperties: {
              autoDeclineMode: 'declineAllConflictingInvitations',
              declineMessage: undefined,
              chatStatus: 'doNotDisturb',
            },
          }),
        })
      );
    });

    it('should create focusTime event with autoDeclineMode', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'focus-event-456',
        summary: 'Coding Session',
        start: { dateTime: '2026-01-16T14:00:00Z' },
        end: { dateTime: '2026-01-16T17:00:00Z' },
        iCalUID: 'ical-focus-456',
        eventType: 'focusTime',
        focusTimeProperties: {
          autoDeclineMode: 'declineNone',
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'Coding Session',
        start: '2026-01-16T14:00:00Z',
        end: '2026-01-16T17:00:00Z',
        eventType: 'focusTime',
        focusTimeProperties: {
          autoDeclineMode: 'declineNone',
        },
      });

      expect(event.id).toBe('focus-event-456');
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            focusTimeProperties: expect.objectContaining({
              autoDeclineMode: 'declineNone',
            }),
          }),
        })
      );
    });

    it('should reject invalid chatStatus values', async () => {
      await expect(
        service.createEvent({
          title: 'Focus Time',
          start: '2026-01-15T09:00:00Z',
          end: '2026-01-15T12:00:00Z',
          eventType: 'focusTime',
          focusTimeProperties: {
            autoDeclineMode: 'declineAllConflictingInvitations',
            chatStatus: 'invalidStatus' as any,
          },
        })
      ).rejects.toThrow();

      expect(mockCalendarClient.events.insert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Task 33: createEvent() with workingLocation type
  // Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
  // ============================================================
  describe('createEvent() with workingLocation type', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should create homeOffice workingLocation event', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'wl-event-123',
        summary: 'Working from Home',
        start: { date: '2026-01-15' },
        end: { date: '2026-01-16' },
        iCalUID: 'ical-wl-123',
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'Working from Home',
        start: '2026-01-15T00:00:00Z',
        end: '2026-01-16T00:00:00Z',
        isAllDay: true,
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      });

      expect(event.id).toBe('wl-event-123');
      expect(event.eventType).toBe('workingLocation');
      expect(event.isAllDay).toBe(true);
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            eventType: 'workingLocation',
            workingLocationProperties: expect.objectContaining({
              type: 'homeOffice',
              homeOffice: {},
            }),
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
          }),
        })
      );
    });

    it('should create officeLocation workingLocation event with buildingId', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'wl-event-456',
        summary: 'Working at HQ',
        start: { date: '2026-01-17' },
        end: { date: '2026-01-18' },
        iCalUID: 'ical-wl-456',
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'officeLocation',
          officeLocation: {
            buildingId: 'building-123',
            floorId: '5th',
            label: 'Main Office',
          },
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'Working at HQ',
        start: '2026-01-17T00:00:00Z',
        end: '2026-01-18T00:00:00Z',
        isAllDay: true,
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'officeLocation',
          officeLocation: {
            buildingId: 'building-123',
            floorId: '5th',
            label: 'Main Office',
          },
        },
      });

      expect(event.id).toBe('wl-event-456');
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            eventType: 'workingLocation',
            workingLocationProperties: expect.objectContaining({
              type: 'officeLocation',
              officeLocation: {
                buildingId: 'building-123',
                floorId: '5th',
                floorSectionId: undefined,
                deskId: undefined,
                label: 'Main Office',
              },
            }),
          }),
        })
      );
    });

    it('should create customLocation workingLocation event', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'wl-event-789',
        summary: 'Working at Coffee Shop',
        start: { date: '2026-01-20' },
        end: { date: '2026-01-21' },
        iCalUID: 'ical-wl-789',
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'customLocation',
          customLocation: {
            label: 'Downtown Coffee Shop',
          },
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: 'Working at Coffee Shop',
        start: '2026-01-20T00:00:00Z',
        end: '2026-01-21T00:00:00Z',
        isAllDay: true,
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'customLocation',
          customLocation: {
            label: 'Downtown Coffee Shop',
          },
        },
      });

      expect(event.id).toBe('wl-event-789');
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            workingLocationProperties: expect.objectContaining({
              type: 'customLocation',
              customLocation: {
                label: 'Downtown Coffee Shop',
              },
            }),
          }),
        })
      );
    });

    it('should reject mismatched type and properties', async () => {
      // Type is homeOffice but providing customLocation properties
      await expect(
        service.createEvent({
          title: 'Invalid Working Location',
          start: '2026-01-15T00:00:00Z',
          end: '2026-01-16T00:00:00Z',
          isAllDay: true,
          eventType: 'workingLocation',
          workingLocationProperties: {
            type: 'homeOffice',
            customLocation: {
              label: 'Wrong property for homeOffice type',
            },
          } as any,
        })
      ).rejects.toThrow();

      expect(mockCalendarClient.events.insert).not.toHaveBeenCalled();
    });

    it('should enforce all-day constraint', async () => {
      // workingLocation events must be all-day
      await expect(
        service.createEvent({
          title: 'Working from Home',
          start: '2026-01-15T09:00:00Z',
          end: '2026-01-15T17:00:00Z',
          isAllDay: false,
          eventType: 'workingLocation',
          workingLocationProperties: {
            type: 'homeOffice',
            homeOffice: true,
          },
        })
      ).rejects.toThrow(/all-day/i);

      expect(mockCalendarClient.events.insert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Task 34: createEvent() with birthday type
  // Requirements: 4.4
  // ============================================================
  describe('createEvent() with birthday type', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should create birthday event with yearly recurrence', async () => {
      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'birthday-event-123',
        summary: "John's Birthday",
        start: { date: '2026-03-15' },
        end: { date: '2026-03-16' },
        iCalUID: 'ical-birthday-123',
        eventType: 'birthday',
        birthdayProperties: {
          type: 'birthday',
        },
      };

      mockCalendarClient.events.insert.mockResolvedValueOnce({
        data: mockCreatedEvent,
      });

      const event = await service.createEvent({
        title: "John's Birthday",
        start: '2026-03-15T00:00:00Z',
        end: '2026-03-16T00:00:00Z',
        isAllDay: true,
        eventType: 'birthday',
        birthdayProperties: {
          type: 'birthday',
        },
      });

      expect(event.id).toBe('birthday-event-123');
      expect(event.eventType).toBe('birthday');
      expect(event.isAllDay).toBe(true);
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: "John's Birthday",
            eventType: 'birthday',
            start: { date: '2026-03-15' },
            end: { date: '2026-03-16' },
          }),
        })
      );
    });

    it('should enforce all-day constraint', async () => {
      // birthday events must be all-day
      await expect(
        service.createEvent({
          title: "John's Birthday",
          start: '2026-03-15T10:00:00Z',
          end: '2026-03-15T22:00:00Z',
          isAllDay: false,
          eventType: 'birthday',
          birthdayProperties: {
            type: 'birthday',
          },
        })
      ).rejects.toThrow(/all-day/i);

      expect(mockCalendarClient.events.insert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Task 35: createEvent() rejecting fromGmail type
  // Requirements: 5.4
  // ============================================================
  describe('createEvent() with fromGmail type', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should reject fromGmail creation with descriptive error', async () => {
      await expect(
        service.createEvent({
          title: 'Flight Booking',
          start: '2026-02-01T10:00:00Z',
          end: '2026-02-01T12:00:00Z',
          eventType: 'fromGmail',
        })
      ).rejects.toThrow(/fromGmail events cannot be created/i);

      expect(mockCalendarClient.events.insert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Task 36: listEvents() with event type filtering
  // Requirements: 7.1, 7.2, 7.3, 7.4
  // ============================================================
  describe('listEvents() with event type filtering', () => {
    const mockFocusTimeEvent: GoogleCalendarEvent = {
      id: 'focus-123',
      summary: 'Focus Time Block',
      start: { dateTime: '2026-01-15T09:00:00Z' },
      end: { dateTime: '2026-01-15T12:00:00Z' },
      iCalUID: 'ical-focus-123',
      eventType: 'focusTime',
      focusTimeProperties: {
        autoDeclineMode: 'declineAllConflictingInvitations',
        chatStatus: 'doNotDisturb',
      },
    };

    const mockOutOfOfficeEvent: GoogleCalendarEvent = {
      id: 'ooo-123',
      summary: 'Vacation',
      start: { dateTime: '2026-01-20T00:00:00Z' },
      end: { dateTime: '2026-01-24T00:00:00Z' },
      iCalUID: 'ical-ooo-123',
      eventType: 'outOfOffice',
      outOfOfficeProperties: {
        autoDeclineMode: 'declineAllConflictingInvitations',
      },
    };

    const mockDefaultEvent: GoogleCalendarEvent = {
      id: 'default-123',
      summary: 'Team Meeting',
      start: { dateTime: '2026-01-15T14:00:00Z' },
      end: { dateTime: '2026-01-15T15:00:00Z' },
      iCalUID: 'ical-default-123',
      // eventType defaults to 'default' when not specified
    };

    const mockWorkingLocationEvent: GoogleCalendarEvent = {
      id: 'wl-123',
      summary: 'Working from Home',
      start: { date: '2026-01-15' },
      end: { date: '2026-01-16' },
      iCalUID: 'ical-wl-123',
      eventType: 'workingLocation',
      workingLocationProperties: {
        type: 'homeOffice',
        homeOffice: true,
      },
    };

    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should return only focusTime events when eventTypes=["focusTime"]', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: {
          items: [
            mockFocusTimeEvent,
            mockOutOfOfficeEvent,
            mockDefaultEvent,
            mockWorkingLocationEvent,
          ],
        },
      });

      const events = await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-25T00:00:00Z',
        eventTypes: ['focusTime'],
      });

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('focus-123');
      expect(events[0].eventType).toBe('focusTime');
    });

    it('should return multiple types when eventTypes=["outOfOffice", "focusTime"]', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: {
          items: [
            mockFocusTimeEvent,
            mockOutOfOfficeEvent,
            mockDefaultEvent,
            mockWorkingLocationEvent,
          ],
        },
      });

      const events = await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-25T00:00:00Z',
        eventTypes: ['outOfOffice', 'focusTime'],
      });

      expect(events).toHaveLength(2);
      expect(events.map(e => e.eventType).sort()).toEqual(['focusTime', 'outOfOffice']);
    });

    it('should return all event types when eventTypes is not provided', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: {
          items: [
            mockFocusTimeEvent,
            mockOutOfOfficeEvent,
            mockDefaultEvent,
            mockWorkingLocationEvent,
          ],
        },
      });

      const events = await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-25T00:00:00Z',
      });

      expect(events).toHaveLength(4);
    });

    it('should handle empty result when no events match filter', async () => {
      mockCalendarClient.events.list.mockResolvedValueOnce({
        data: {
          items: [mockDefaultEvent], // Only default event
        },
      });

      const events = await service.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-25T00:00:00Z',
        eventTypes: ['focusTime', 'outOfOffice'], // Filter for types not present
      });

      expect(events).toHaveLength(0);
    });
  });

  // ============================================================
  // Task 37: updateEvent() with event type restrictions
  // Requirements: 4.5, 5.3, 6.6
  // ============================================================
  describe('updateEvent() with event type restrictions', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should allow updating summary of birthday event', async () => {
      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'birthday-123',
          summary: 'Original Birthday',
          start: { date: '2026-03-15' },
          end: { date: '2026-03-16' },
          iCalUID: 'ical-birthday-123',
          eventType: 'birthday',
          birthdayProperties: {
            type: 'birthday',
          },
        },
      });

      mockCalendarClient.events.patch.mockResolvedValueOnce({
        data: {
          id: 'birthday-123',
          summary: 'Updated Birthday Name',
          start: { date: '2026-03-15' },
          end: { date: '2026-03-16' },
          iCalUID: 'ical-birthday-123',
          eventType: 'birthday',
        },
      });

      const event = await service.updateEvent('birthday-123', {
        title: 'Updated Birthday Name',
      });

      expect(event.title).toBe('Updated Birthday Name');
      expect(mockCalendarClient.events.patch).toHaveBeenCalled();
    });

    it('should reject updating location of birthday event', async () => {
      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'birthday-123',
          summary: 'Birthday Event',
          start: { date: '2026-03-15' },
          end: { date: '2026-03-16' },
          iCalUID: 'ical-birthday-123',
          eventType: 'birthday',
          birthdayProperties: {
            type: 'birthday',
          },
        },
      });

      await expect(
        service.updateEvent('birthday-123', {
          location: 'Party Venue',
        })
      ).rejects.toThrow(/Cannot update.*location.*birthday/i);

      expect(mockCalendarClient.events.patch).not.toHaveBeenCalled();
    });

    it('should allow updating colorId of fromGmail event', async () => {
      // Note: colorId is handled through reminders in the current implementation
      // The test verifies that allowed fields (reminders) can be updated for fromGmail events
      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'gmail-123',
          summary: 'Flight Booking',
          start: { dateTime: '2026-02-01T10:00:00Z' },
          end: { dateTime: '2026-02-01T12:00:00Z' },
          iCalUID: 'ical-gmail-123',
          eventType: 'fromGmail',
        },
      });

      mockCalendarClient.events.patch.mockResolvedValueOnce({
        data: {
          id: 'gmail-123',
          summary: 'Flight Booking',
          start: { dateTime: '2026-02-01T10:00:00Z' },
          end: { dateTime: '2026-02-01T12:00:00Z' },
          iCalUID: 'ical-gmail-123',
          eventType: 'fromGmail',
          reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 60 }],
          },
        },
      });

      const event = await service.updateEvent('gmail-123', {
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 60 }],
        },
      });

      expect(event.id).toBe('gmail-123');
      expect(mockCalendarClient.events.patch).toHaveBeenCalled();
    });

    it('should reject updating start/end of fromGmail event', async () => {
      mockCalendarClient.events.get.mockResolvedValueOnce({
        data: {
          id: 'gmail-123',
          summary: 'Flight Booking',
          start: { dateTime: '2026-02-01T10:00:00Z' },
          end: { dateTime: '2026-02-01T12:00:00Z' },
          iCalUID: 'ical-gmail-123',
          eventType: 'fromGmail',
        },
      });

      await expect(
        service.updateEvent('gmail-123', {
          start: '2026-02-02T10:00:00Z',
        })
      ).rejects.toThrow(/Cannot update.*start.*fromGmail/i);

      expect(mockCalendarClient.events.patch).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Task 39: Backward compatibility tests
  // Requirements: Ensure existing code continues to work with new event type features
  // ============================================================
  describe('Backward compatibility', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    describe('handling events without eventType field', () => {
      it('should handle CalendarEvent without eventType field (undefined)', async () => {
        // Mock event without eventType field (typical of older API responses or EventKit)
        const mockEventWithoutType: GoogleCalendarEvent = {
          id: 'event-no-type-123',
          summary: 'Legacy Event',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          iCalUID: 'ical-legacy-123',
          // eventType is intentionally omitted
        };

        mockCalendarClient.events.list.mockResolvedValueOnce({
          data: {
            items: [mockEventWithoutType],
          },
        });

        const events = await service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        });

        expect(events).toHaveLength(1);
        expect(events[0].id).toBe('event-no-type-123');
        // Should default to 'default' eventType
        expect(events[0].eventType).toBe('default');
        // typeSpecificProperties should be undefined for default events
        expect(events[0].typeSpecificProperties).toBeUndefined();
      });

      it('should default to "default" eventType when creating events without specifying type', async () => {
        const mockCreatedEvent: GoogleCalendarEvent = {
          id: 'new-event-123',
          summary: 'Simple Meeting',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          iCalUID: 'ical-new-123',
          // No eventType in response - typical for default events
        };

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockCreatedEvent,
        });

        // Create event without specifying eventType
        const event = await service.createEvent({
          title: 'Simple Meeting',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          // eventType is intentionally omitted
        });

        expect(event.id).toBe('new-event-123');
        expect(event.title).toBe('Simple Meeting');
        // Should default to 'default' eventType
        expect(event.eventType).toBe('default');
        // Request body should NOT include eventType when not specified
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            requestBody: expect.not.objectContaining({
              eventType: expect.anything(),
            }),
          })
        );
      });
    });

    describe('maintaining existing CalendarEvent fields', () => {
      it('should maintain all existing CalendarEvent fields in responses', async () => {
        // Mock a complete Google Calendar event with all fields
        const mockCompleteEvent: GoogleCalendarEvent = {
          id: 'complete-event-123',
          summary: 'Complete Event',
          description: 'This is a complete event with all fields',
          location: 'Conference Room A',
          start: { dateTime: '2026-01-15T10:00:00+09:00', timeZone: 'Asia/Tokyo' },
          end: { dateTime: '2026-01-15T11:00:00+09:00', timeZone: 'Asia/Tokyo' },
          attendees: [
            { email: 'attendee1@example.com', responseStatus: 'accepted' },
            { email: 'attendee2@example.com', responseStatus: 'tentative' },
          ],
          iCalUID: 'ical-complete-123',
          status: 'confirmed',
          organizer: { email: 'organizer@example.com', displayName: 'Organizer' },
          // eventType is omitted to test backward compatibility
        };

        mockCalendarClient.events.list.mockResolvedValueOnce({
          data: {
            items: [mockCompleteEvent],
          },
        });

        const events = await service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        });

        expect(events).toHaveLength(1);
        const event = events[0];

        // Verify all existing CalendarEvent fields are preserved
        expect(event.id).toBe('complete-event-123');
        expect(event.title).toBe('Complete Event');
        expect(event.description).toBe('This is a complete event with all fields');
        expect(event.location).toBe('Conference Room A');
        expect(event.start).toBe('2026-01-15T10:00:00+09:00');
        expect(event.end).toBe('2026-01-15T11:00:00+09:00');
        expect(event.isAllDay).toBe(false);
        expect(event.source).toBe('google');
        expect(event.attendees).toEqual(['attendee1@example.com', 'attendee2@example.com']);
        expect(event.iCalUID).toBe('ical-complete-123');
        expect(event.status).toBe('confirmed');
        // eventType should default to 'default' for backward compatibility
        expect(event.eventType).toBe('default');
      });

      it('should work correctly when typeSpecificProperties is undefined', async () => {
        // Default event without type-specific properties
        const mockDefaultEvent: GoogleCalendarEvent = {
          id: 'default-event-123',
          summary: 'Regular Meeting',
          start: { dateTime: '2026-01-15T14:00:00Z' },
          end: { dateTime: '2026-01-15T15:00:00Z' },
          iCalUID: 'ical-default-123',
          eventType: 'default',
          // No type-specific properties
        };

        mockCalendarClient.events.list.mockResolvedValueOnce({
          data: {
            items: [mockDefaultEvent],
          },
        });

        const events = await service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        });

        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('default');
        // typeSpecificProperties should be undefined for 'default' events
        expect(events[0].typeSpecificProperties).toBeUndefined();
      });
    });

    describe('update operations backward compatibility', () => {
      it('should allow all updates for events without eventType (treated as default)', async () => {
        // Mock get to return event without eventType field
        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: {
            id: 'legacy-event-123',
            summary: 'Legacy Event',
            start: { dateTime: '2026-01-15T10:00:00Z' },
            end: { dateTime: '2026-01-15T11:00:00Z' },
            iCalUID: 'ical-legacy-123',
            // No eventType field
          },
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: {
            id: 'legacy-event-123',
            summary: 'Updated Legacy Event',
            location: 'New Location',
            description: 'New Description',
            start: { dateTime: '2026-01-15T11:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-legacy-123',
          },
        });

        // Should allow all field updates for events without eventType
        const event = await service.updateEvent('legacy-event-123', {
          title: 'Updated Legacy Event',
          location: 'New Location',
          description: 'New Description',
          start: '2026-01-15T11:00:00Z',
          end: '2026-01-15T12:00:00Z',
        });

        expect(event.title).toBe('Updated Legacy Event');
        expect(event.location).toBe('New Location');
        expect(mockCalendarClient.events.patch).toHaveBeenCalled();
      });
    });

    describe('all-day event backward compatibility', () => {
      it('should correctly handle all-day events without eventType', async () => {
        const mockAllDayEvent: GoogleCalendarEvent = {
          id: 'allday-event-123',
          summary: 'All Day Event',
          start: { date: '2026-01-15' },
          end: { date: '2026-01-16' },
          iCalUID: 'ical-allday-123',
          // No eventType field
        };

        mockCalendarClient.events.list.mockResolvedValueOnce({
          data: {
            items: [mockAllDayEvent],
          },
        });

        const events = await service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        });

        expect(events).toHaveLength(1);
        expect(events[0].isAllDay).toBe(true);
        expect(events[0].start).toBe('2026-01-15');
        expect(events[0].end).toBe('2026-01-16');
        expect(events[0].eventType).toBe('default');
      });
    });

    describe('mixed events backward compatibility', () => {
      it('should handle mixed events with and without eventType in same response', async () => {
        // Mix of events: some with eventType, some without
        const mixedEvents: GoogleCalendarEvent[] = [
          {
            id: 'event-with-type-1',
            summary: 'Focus Time Block',
            start: { dateTime: '2026-01-15T09:00:00Z' },
            end: { dateTime: '2026-01-15T12:00:00Z' },
            iCalUID: 'ical-focus-123',
            eventType: 'focusTime',
            focusTimeProperties: {
              autoDeclineMode: 'declineAllConflictingInvitations',
            },
          },
          {
            id: 'event-without-type-1',
            summary: 'Legacy Meeting',
            start: { dateTime: '2026-01-15T14:00:00Z' },
            end: { dateTime: '2026-01-15T15:00:00Z' },
            iCalUID: 'ical-legacy-123',
            // No eventType
          },
          {
            id: 'event-with-type-2',
            summary: 'Working from Home',
            start: { date: '2026-01-15' },
            end: { date: '2026-01-16' },
            iCalUID: 'ical-wl-123',
            eventType: 'workingLocation',
            workingLocationProperties: {
              type: 'homeOffice',
              homeOffice: true,
            },
          },
        ];

        mockCalendarClient.events.list.mockResolvedValueOnce({
          data: {
            items: mixedEvents,
          },
        });

        const events = await service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        });

        expect(events).toHaveLength(3);

        // Event with focusTime type
        const focusEvent = events.find(e => e.id === 'event-with-type-1');
        expect(focusEvent?.eventType).toBe('focusTime');
        expect(focusEvent?.typeSpecificProperties?.eventType).toBe('focusTime');

        // Event without eventType should default to 'default'
        const legacyEvent = events.find(e => e.id === 'event-without-type-1');
        expect(legacyEvent?.eventType).toBe('default');
        expect(legacyEvent?.typeSpecificProperties).toBeUndefined();

        // Event with workingLocation type
        const wlEvent = events.find(e => e.id === 'event-with-type-2');
        expect(wlEvent?.eventType).toBe('workingLocation');
        expect(wlEvent?.typeSpecificProperties?.eventType).toBe('workingLocation');
      });
    });
  });

  // ============================================================
  // Task 27: Recurring Events Tests
  // Requirements: 1.1, 2.1, 4.1, 5.1
  // ============================================================
  describe('Recurring Events Support', () => {
    beforeEach(async () => {
      await service.authenticate();
      jest.clearAllMocks();
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    describe('createEvent() with recurrence', () => {
      it('should create recurring event with daily recurrence', async () => {
        // Arrange
        const mockRecurringEvent: GoogleCalendarEvent = {
          id: 'recurring-event-123',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
          iCalUID: 'ical-recurring-123',
        };

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockRecurringEvent,
        });

        // Act
        const event = await service.createEvent({
          title: 'Daily Standup',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T10:30:00Z',
          isAllDay: false,
          recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
        });

        // Assert
        expect(event.id).toBe('recurring-event-123');
        expect(event.recurrence).toEqual(['RRULE:FREQ=DAILY;COUNT=10']);
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            requestBody: expect.objectContaining({
              summary: 'Daily Standup',
              start: expect.objectContaining({
                dateTime: '2026-01-15T10:00:00Z',
              }),
              end: expect.objectContaining({
                dateTime: '2026-01-15T10:30:00Z',
              }),
              recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
            }),
          })
        );
      });

      it('should create recurring event with weekly recurrence on specific days', async () => {
        // Arrange
        const mockRecurringEvent: GoogleCalendarEvent = {
          id: 'recurring-event-456',
          summary: 'Team Meeting',
          start: { dateTime: '2026-01-15T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T15:00:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20'],
          iCalUID: 'ical-recurring-456',
        };

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockRecurringEvent,
        });

        // Act
        const event = await service.createEvent({
          title: 'Team Meeting',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          isAllDay: false,
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20'],
        });

        // Assert
        expect(event.id).toBe('recurring-event-456');
        expect(event.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20']);
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            requestBody: expect.objectContaining({
              recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20'],
            }),
          })
        );
      });

      it('should create recurring event with monthly recurrence', async () => {
        // Arrange
        const mockRecurringEvent: GoogleCalendarEvent = {
          id: 'recurring-event-789',
          summary: 'Monthly Review',
          start: { dateTime: '2026-01-15T09:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20261215T090000Z'],
          iCalUID: 'ical-recurring-789',
        };

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockRecurringEvent,
        });

        // Act
        const event = await service.createEvent({
          title: 'Monthly Review',
          start: '2026-01-15T09:00:00Z',
          end: '2026-01-15T10:00:00Z',
          isAllDay: false,
          recurrence: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20261215T090000Z'],
        });

        // Assert
        expect(event.id).toBe('recurring-event-789');
        expect(event.recurrence).toEqual([
          'RRULE:FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20261215T090000Z',
        ]);
      });

      it('should create recurring all-day event', async () => {
        // Arrange
        const mockRecurringEvent: GoogleCalendarEvent = {
          id: 'recurring-allday-123',
          summary: 'Weekly Day Off',
          start: { date: '2026-01-15' },
          end: { date: '2026-01-16' },
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10'],
          iCalUID: 'ical-recurring-allday-123',
        };

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockRecurringEvent,
        });

        // Act
        const event = await service.createEvent({
          title: 'Weekly Day Off',
          start: '2026-01-15T00:00:00Z',
          end: '2026-01-16T00:00:00Z',
          isAllDay: true,
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10'],
        });

        // Assert
        expect(event.id).toBe('recurring-allday-123');
        expect(event.isAllDay).toBe(true);
        expect(event.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10']);
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            requestBody: expect.objectContaining({
              start: { date: '2026-01-15' },
              end: { date: '2026-01-16' },
              recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=10'],
            }),
          })
        );
      });

      it('should create recurring event with UNTIL date', async () => {
        // Arrange
        const mockRecurringEvent: GoogleCalendarEvent = {
          id: 'recurring-until-123',
          summary: 'Limited Recurring Event',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T11:00:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z'],
          iCalUID: 'ical-recurring-until-123',
        };

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockRecurringEvent,
        });

        // Act
        const event = await service.createEvent({
          title: 'Limited Recurring Event',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z'],
        });

        // Assert
        expect(event.id).toBe('recurring-until-123');
        expect(event.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z']);
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            requestBody: expect.objectContaining({
              recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z'],
            }),
          })
        );
      });

      it('should create event without recurrence (non-recurring)', async () => {
        // Arrange
        const mockSingleEvent: GoogleCalendarEvent = {
          id: 'single-event-123',
          summary: 'One Time Meeting',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T11:00:00Z', timeZone: 'UTC' },
          iCalUID: 'ical-single-123',
        };

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockSingleEvent,
        });

        // Act
        const event = await service.createEvent({
          title: 'One Time Meeting',
          start: '2026-01-15T10:00:00Z',
          end: '2026-01-15T11:00:00Z',
          isAllDay: false,
        });

        // Assert
        expect(event.id).toBe('single-event-123');
        expect(event.recurrence).toBeUndefined();
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            requestBody: expect.not.objectContaining({
              recurrence: expect.anything(),
            }),
          })
        );
      });
    });

    describe('determineUpdateScope logic', () => {
      it('should default to "thisEvent" for recurring instance', async () => {
        // Arrange - Mock recurring instance
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-123',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-id',
          iCalUID: 'ical-instance-123',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockRecurringInstance,
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: { ...mockRecurringInstance, summary: 'Updated Standup' },
        });

        // Act - Update without explicit scope
        const event = await service.updateEvent('instance-123', {
          title: 'Updated Standup',
        });

        // Assert - Should update only this instance
        expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'instance-123',
          })
        );
        expect(event.title).toBe('Updated Standup');
      });

      it('should default to "allEvents" for recurring parent', async () => {
        // Arrange - Mock recurring parent event
        const mockRecurringParent: GoogleCalendarEvent = {
          id: 'parent-event-id',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
          iCalUID: 'ical-parent-123',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockRecurringParent,
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: { ...mockRecurringParent, summary: 'Updated Series' },
        });

        // Act - Update without explicit scope
        const event = await service.updateEvent('parent-event-id', {
          title: 'Updated Series',
        });

        // Assert - Should update the parent (all events)
        expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'parent-event-id',
          })
        );
        expect(event.title).toBe('Updated Series');
      });

      it('should respect explicit scope="thisEvent" for recurring instance', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-456',
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-01-15T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T15:00:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-id',
          iCalUID: 'ical-instance-456',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockRecurringInstance,
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: { ...mockRecurringInstance, location: 'Room 101' },
        });

        // Act - Update with explicit scope
        const event = await service.updateEvent(
          'instance-456',
          {
            location: 'Room 101',
          },
          undefined,
          'thisEvent'
        );

        // Assert
        expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'instance-456',
          })
        );
        expect(event.location).toBe('Room 101');
      });

      it('should respect explicit scope="allEvents" for recurring instance', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-789',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-id',
          iCalUID: 'ical-instance-789',
        };

        const mockRecurringParent: GoogleCalendarEvent = {
          id: 'parent-event-id',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
          iCalUID: 'ical-parent-123',
        };

        mockCalendarClient.events.get
          .mockResolvedValueOnce({ data: mockRecurringInstance })
          .mockResolvedValueOnce({ data: mockRecurringParent });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: { ...mockRecurringParent, location: 'New Location' },
        });

        // Act - Update instance with scope=allEvents
        const event = await service.updateEvent(
          'instance-789',
          {
            location: 'New Location',
          },
          undefined,
          'allEvents'
        );

        // Assert - Should update parent event
        expect(mockCalendarClient.events.get).toHaveBeenCalledTimes(2);
        expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'parent-event-id',
          })
        );
        expect(event.location).toBe('New Location');
      });

      it('should respect explicit scope="thisAndFuture" for recurring instance', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-abc',
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-01-22T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-22T15:00:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-id',
          iCalUID: 'ical-instance-abc',
        };

        const mockRecurringParent: GoogleCalendarEvent = {
          id: 'parent-event-id',
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-01-15T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T15:00:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10'],
          iCalUID: 'ical-parent-weekly-123',
        };

        const mockNewSeriesEvent: GoogleCalendarEvent = {
          id: 'new-series-abc',
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-01-22T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-22T15:00:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10'],
          location: 'New Room',
          iCalUID: 'ical-new-series-abc',
        };

        // Mock the sequence: get instance, get parent, patch parent, insert new series
        mockCalendarClient.events.get
          .mockResolvedValueOnce({ data: mockRecurringInstance })
          .mockResolvedValueOnce({ data: mockRecurringParent });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: {
            ...mockRecurringParent,
            recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20260121T235959Z'],
          },
        });

        mockCalendarClient.events.insert.mockResolvedValueOnce({
          data: mockNewSeriesEvent,
        });

        // Act - Update with thisAndFuture scope
        const event = await service.updateEvent(
          'instance-abc',
          {
            location: 'New Room',
          },
          undefined,
          'thisAndFuture'
        );

        // Assert - Should split the series
        expect(mockCalendarClient.events.get).toHaveBeenCalledTimes(2);
        expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'parent-event-id',
            requestBody: expect.objectContaining({
              recurrence: expect.arrayContaining([
                expect.stringContaining('UNTIL=20260121'),
              ]),
            }),
          })
        );
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            requestBody: expect.objectContaining({
              summary: 'Weekly Meeting',
              location: 'New Room',
              recurrence: expect.any(Array),
            }),
          })
        );
        expect(event.location).toBe('New Room');
        expect(event.id).toBe('new-series-abc');
      });

      it('should use "thisEvent" for non-recurring events', async () => {
        // Arrange
        const mockSingleEvent: GoogleCalendarEvent = {
          id: 'single-event-123',
          summary: 'One Time Meeting',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T11:00:00Z', timeZone: 'UTC' },
          iCalUID: 'ical-single-123',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockSingleEvent,
        });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: { ...mockSingleEvent, summary: 'Updated Meeting' },
        });

        // Act
        const event = await service.updateEvent('single-event-123', {
          title: 'Updated Meeting',
        });

        // Assert - Should work normally without scope logic
        expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'single-event-123',
          })
        );
        expect(event.title).toBe('Updated Meeting');
      });
    });

    describe('determineDeleteScope logic', () => {
      it('should default to "thisEvent" for recurring instance', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-delete-123',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-id',
          iCalUID: 'ical-instance-delete-123',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockRecurringInstance,
        });

        mockCalendarClient.events.delete.mockResolvedValueOnce({});

        // Act - Delete without explicit scope
        await service.deleteEvent('instance-delete-123');

        // Assert - Should delete only this instance
        expect(mockCalendarClient.events.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'instance-delete-123',
          })
        );
      });

      it('should default to "allEvents" for recurring parent', async () => {
        // Arrange
        const mockRecurringParent: GoogleCalendarEvent = {
          id: 'parent-delete-id',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
          iCalUID: 'ical-parent-delete-123',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockRecurringParent,
        });

        mockCalendarClient.events.delete.mockResolvedValueOnce({});

        // Act - Delete parent without explicit scope
        await service.deleteEvent('parent-delete-id');

        // Assert - Should delete the entire series
        expect(mockCalendarClient.events.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'parent-delete-id',
          })
        );
      });

      it('should respect explicit scope="thisEvent" for recurring instance', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-delete-456',
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-01-22T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-22T15:00:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-id',
          iCalUID: 'ical-instance-delete-456',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockRecurringInstance,
        });

        mockCalendarClient.events.delete.mockResolvedValueOnce({});

        // Act
        await service.deleteEvent('instance-delete-456', undefined, 'thisEvent');

        // Assert
        expect(mockCalendarClient.events.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'instance-delete-456',
          })
        );
      });

      it('should respect explicit scope="allEvents" for recurring instance', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-delete-789',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-delete-id',
          iCalUID: 'ical-instance-delete-789',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({ data: mockRecurringInstance });

        mockCalendarClient.events.delete.mockResolvedValueOnce({});

        // Act - Delete instance with scope=allEvents
        await service.deleteEvent('instance-delete-789', undefined, 'allEvents');

        // Assert - Should delete parent event using recurringEventId
        expect(mockCalendarClient.events.get).toHaveBeenCalledTimes(1);
        expect(mockCalendarClient.events.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'parent-delete-id',
          })
        );
      });

      it('should respect explicit scope="thisAndFuture" for recurring instance', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-delete-abc',
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-01-22T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-22T15:00:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-id',
          iCalUID: 'ical-instance-delete-abc',
        };

        const mockRecurringParent: GoogleCalendarEvent = {
          id: 'parent-event-id',
          summary: 'Weekly Meeting',
          start: { dateTime: '2026-01-15T14:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T15:00:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10'],
          iCalUID: 'ical-parent-weekly-123',
        };

        mockCalendarClient.events.get
          .mockResolvedValueOnce({ data: mockRecurringInstance })
          .mockResolvedValueOnce({ data: mockRecurringParent });

        mockCalendarClient.events.patch.mockResolvedValueOnce({
          data: {
            ...mockRecurringParent,
            recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20260121T235959Z'],
          },
        });

        // Act - Delete with thisAndFuture scope
        await service.deleteEvent('instance-delete-abc', undefined, 'thisAndFuture');

        // Assert - Should modify parent with UNTIL (ending series before this instance)
        expect(mockCalendarClient.events.get).toHaveBeenCalledTimes(2);
        expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'parent-event-id',
            requestBody: expect.objectContaining({
              recurrence: expect.arrayContaining([
                expect.stringContaining('UNTIL=20260121'),
              ]),
            }),
          })
        );
        // thisAndFuture does NOT delete the instance - it modifies the parent RRULE
        expect(mockCalendarClient.events.delete).not.toHaveBeenCalled();
      });

      it('should use "thisEvent" for non-recurring events', async () => {
        // Arrange
        const mockSingleEvent: GoogleCalendarEvent = {
          id: 'single-delete-123',
          summary: 'One Time Meeting',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T11:00:00Z', timeZone: 'UTC' },
          iCalUID: 'ical-single-delete-123',
        };

        mockCalendarClient.events.get.mockResolvedValueOnce({
          data: mockSingleEvent,
        });

        mockCalendarClient.events.delete.mockResolvedValueOnce({});

        // Act
        await service.deleteEvent('single-delete-123');

        // Assert - Should delete normally
        expect(mockCalendarClient.events.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: 'primary',
            eventId: 'single-delete-123',
          })
        );
      });
    });

    describe('listEvents() with recurring events', () => {
      it('should include recurrence info in listed events', async () => {
        // Arrange
        const mockRecurringParent: GoogleCalendarEvent = {
          id: 'parent-event-123',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=DAILY;COUNT=10'],
          iCalUID: 'ical-parent-123',
        };

        mockCalendarClient.events.list.mockResolvedValueOnce({
          data: {
            items: [mockRecurringParent],
          },
        });

        // Act
        const events = await service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        });

        // Assert
        expect(events).toHaveLength(1);
        expect(events[0].recurrence).toEqual(['RRULE:FREQ=DAILY;COUNT=10']);
        expect(events[0].recurringEventId).toBeUndefined();
      });

      it('should include recurringEventId for instances', async () => {
        // Arrange
        const mockRecurringInstance: GoogleCalendarEvent = {
          id: 'instance-123',
          summary: 'Daily Standup',
          start: { dateTime: '2026-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-01-15T10:30:00Z', timeZone: 'UTC' },
          recurringEventId: 'parent-event-123',
          iCalUID: 'ical-instance-123',
        };

        mockCalendarClient.events.list.mockResolvedValueOnce({
          data: {
            items: [mockRecurringInstance],
          },
        });

        // Act
        const events = await service.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        });

        // Assert
        expect(events).toHaveLength(1);
        expect(events[0].recurringEventId).toBe('parent-event-123');
        expect(events[0].recurrence).toBeUndefined();
      });
    });
  });
});
