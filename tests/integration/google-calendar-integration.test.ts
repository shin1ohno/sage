/**
 * Google Calendar Integration Tests
 * Requirements: 1, 2, 3, 4, 5, 6, 10 (Google Calendar OAuth, Event CRUD, Health Check)
 *
 * End-to-end integration tests for Google Calendar authentication and operations.
 * Tests the full OAuth flow, event management, token refresh, and error handling.
 */

import { GoogleOAuthHandler, GOOGLE_CALENDAR_SCOPES } from '../../src/oauth/google-oauth-handler.js';
import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import type { GoogleOAuthTokens } from '../../src/oauth/google-oauth-handler.js';
import type { GoogleCalendarEvent } from '../../src/types/google-calendar-types.js';
import * as fs from 'fs/promises';

// Mock modules
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(),
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

jest.mock('fs/promises');

jest.mock('../../src/utils/retry.js', () => {
  const actual = jest.requireActual('../../src/utils/retry.js');
  return {
    ...actual,
    retryWithBackoff: jest.fn(async (fn) => fn()),
  };
});

describe('Google Calendar Integration', () => {
  const mockConfig = {
    clientId: 'integration-test-client-id',
    clientSecret: 'integration-test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const mockEncryptionKey = 'test-integration-key-32-chars!';
  const mockUserId = 'integration-test-user';

  let oauthHandler: GoogleOAuthHandler;
  let calendarService: GoogleCalendarService;
  let mockOAuth2Client: any;
  let mockCalendarClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock OAuth2Client
    mockOAuth2Client = {
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeToken: jest.fn(),
      credentials: {},
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

    // Mock fs operations
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue('');

    // Create handler and service instances
    oauthHandler = new GoogleOAuthHandler(mockConfig, mockEncryptionKey, mockUserId);
    calendarService = new GoogleCalendarService(oauthHandler, { userId: mockUserId });
  });

  describe('OAuth Flow Integration', () => {
    it('should complete full OAuth flow: getAuthorizationUrl → exchangeCodeForTokens → storeTokens', async () => {
      // Step 1: Get authorization URL
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&code_challenge=abc123';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);

      const authUrl = await oauthHandler.getAuthorizationUrl();

      expect(authUrl).toBe(mockAuthUrl);
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          scope: GOOGLE_CALENDAR_SCOPES,
          code_challenge: expect.any(String),
          code_challenge_method: 'S256',
          prompt: 'consent',
        })
      );

      // Step 2: Exchange authorization code for tokens
      const authCode = 'test-authorization-code-from-redirect';
      const mockTokenResponse = {
        access_token: 'integration-access-token',
        refresh_token: 'integration-refresh-token',
        expiry_date: Date.now() + 3600 * 1000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokenResponse });

      const tokens = await oauthHandler.exchangeCodeForTokens(authCode);

      expect(tokens).toEqual({
        accessToken: mockTokenResponse.access_token,
        refreshToken: mockTokenResponse.refresh_token,
        expiresAt: mockTokenResponse.expiry_date,
        scope: GOOGLE_CALENDAR_SCOPES,
      });

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith({
        code: authCode,
        codeVerifier: expect.any(String),
      });

      // Step 3: Store tokens securely
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });

      await oauthHandler.storeTokens(tokens);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.sage'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`google_oauth_tokens_${mockUserId}.enc`),
        expect.any(String),
        'utf8'
      );

      // Step 4: Retrieve stored tokens
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      const retrievedTokens = await oauthHandler.getTokens();

      expect(retrievedTokens).not.toBeNull();
      expect(retrievedTokens!.accessToken).toBe(tokens.accessToken);
      expect(retrievedTokens!.refreshToken).toBe(tokens.refreshToken);
    });

    it('should handle OAuth flow with custom redirect URI', async () => {
      const customRedirectUri = 'http://localhost:8080/custom-callback';
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=custom';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);

      const { google } = require('googleapis');
      google.auth.OAuth2.mockClear();

      await oauthHandler.getAuthorizationUrl(customRedirectUri);

      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        mockConfig.clientId,
        mockConfig.clientSecret,
        customRedirectUri
      );
    });

    it('should throw error if code_verifier not found during token exchange', async () => {
      // Create new handler without calling getAuthorizationUrl first
      const newHandler = new GoogleOAuthHandler(mockConfig, mockEncryptionKey);
      const authCode = 'test-code-without-verifier';

      await expect(newHandler.exchangeCodeForTokens(authCode)).rejects.toThrow(
        'code_verifier not found. Call getAuthorizationUrl() first.'
      );
    });
  });

  describe('Event CRUD Operations Integration', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-integration-access-token',
      refreshToken: 'valid-integration-refresh-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      // Setup: Store valid tokens and authenticate
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await oauthHandler.storeTokens(validTokens);
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      await calendarService.authenticate();
      jest.clearAllMocks();

      // Reset retryWithBackoff to default behavior
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());
    });

    it('should create, read, update, and delete event (full CRUD cycle)', async () => {
      // CREATE
      const newEvent = {
        title: 'Integration Test Event',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
        location: 'Test Location',
        description: 'Integration test description',
      };

      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'created-event-integration-123',
        summary: newEvent.title,
        start: { dateTime: newEvent.start },
        end: { dateTime: newEvent.end },
        location: newEvent.location,
        description: newEvent.description,
        iCalUID: 'ical-integration-123',
        status: 'confirmed',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      const createdEvent = await calendarService.createEvent(newEvent);

      expect(createdEvent.id).toBe('created-event-integration-123');
      expect(createdEvent.title).toBe(newEvent.title);

      // READ
      mockCalendarClient.events.list.mockResolvedValue({
        data: {
          items: [mockCreatedEvent],
        },
      });

      const events = await calendarService.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('created-event-integration-123');

      // UPDATE
      const mockUpdatedEvent: GoogleCalendarEvent = {
        ...mockCreatedEvent,
        summary: 'Updated Integration Test Event',
        location: 'Updated Location',
      };

      mockCalendarClient.events.patch.mockResolvedValue({
        data: mockUpdatedEvent,
      });

      const updatedEvent = await calendarService.updateEvent('created-event-integration-123', {
        title: 'Updated Integration Test Event',
        location: 'Updated Location',
      });

      expect(updatedEvent.title).toBe('Updated Integration Test Event');
      expect(updatedEvent.location).toBe('Updated Location');

      // DELETE
      mockCalendarClient.events.delete.mockResolvedValue({});

      await expect(
        calendarService.deleteEvent('created-event-integration-123')
      ).resolves.not.toThrow();

      expect(mockCalendarClient.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'created-event-integration-123',
      });
    });

    it('should create event with attendees and send invitations', async () => {
      const eventWithAttendees = {
        title: 'Team Meeting',
        start: '2026-01-15T14:00:00Z',
        end: '2026-01-15T15:00:00Z',
        attendees: ['alice@example.com', 'bob@example.com'],
      };

      const mockCreatedEvent: GoogleCalendarEvent = {
        id: 'meeting-event-123',
        summary: eventWithAttendees.title,
        start: { dateTime: eventWithAttendees.start },
        end: { dateTime: eventWithAttendees.end },
        attendees: [
          { email: 'alice@example.com', responseStatus: 'needsAction' },
          { email: 'bob@example.com', responseStatus: 'needsAction' },
        ],
        iCalUID: 'ical-meeting-123',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: mockCreatedEvent,
      });

      await calendarService.createEvent(eventWithAttendees);

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            attendees: [
              { email: 'alice@example.com' },
              { email: 'bob@example.com' },
            ],
          }),
          sendUpdates: 'all',
        })
      );
    });

    it('should create all-day event', async () => {
      const allDayEvent = {
        title: 'All Day Conference',
        start: '2026-01-20T00:00:00Z',
        end: '2026-01-21T00:00:00Z',
        isAllDay: true,
      };

      const mockAllDayEvent: GoogleCalendarEvent = {
        id: 'all-day-event-123',
        summary: allDayEvent.title,
        start: { date: '2026-01-20' },
        end: { date: '2026-01-21' },
        iCalUID: 'ical-all-day-123',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: mockAllDayEvent,
      });

      const createdEvent = await calendarService.createEvent(allDayEvent);

      expect(createdEvent.isAllDay).toBe(true);
      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            start: { date: '2026-01-20' },
            end: { date: '2026-01-21' },
          }),
        })
      );
    });

    it('should batch delete multiple events', async () => {
      mockCalendarClient.events.delete.mockResolvedValue({});

      const eventIds = ['event-1', 'event-2', 'event-3'];
      const result = await calendarService.deleteEventsBatch(eventIds);

      expect(result.deleted).toBe(3);
      expect(mockCalendarClient.events.delete).toHaveBeenCalledTimes(3);
    });
  });

  describe('Token Refresh Flow Integration', () => {
    it('should automatically refresh expired token and retry API call', async () => {
      // Setup: Store expired tokens
      const expiredTokens: GoogleOAuthTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() - 1000, // Expired
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await oauthHandler.storeTokens(expiredTokens);
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      // Mock token refresh response
      const newTokens = {
        access_token: 'new-refreshed-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3600 * 1000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
      });

      // Authenticate (should trigger token refresh)
      await calendarService.authenticate();

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: expiredTokens.refreshToken,
      });

      // Verify new tokens are stored
      const writeCallArgs = (fs.writeFile as jest.Mock).mock.calls;
      expect(writeCallArgs.length).toBeGreaterThan(1); // Original store + refresh store
    });

    it('should throw error if refresh token is invalid', async () => {
      const expiredTokens: GoogleOAuthTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'invalid-refresh-token',
        expiresAt: Date.now() - 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await oauthHandler.storeTokens(expiredTokens);
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      // Mock refresh failure
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(
        new Error('Invalid refresh token')
      );

      await expect(oauthHandler.ensureValidToken()).rejects.toThrow(
        'Failed to refresh expired token'
      );
    });
  });

  describe('Error Handling and Retry Logic', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-error-test-token',
      refreshToken: 'valid-error-refresh-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      // Setup: Store valid tokens and authenticate
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await oauthHandler.storeTokens(validTokens);
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      await calendarService.authenticate();
      jest.clearAllMocks();
    });

    it('should retry on rate limit error (429)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');

      let attemptCount = 0;
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        if (attemptCount === 0) {
          attemptCount++;
          const error = new Error('Rate limit exceeded 429');
          const shouldRetry = options.shouldRetry(error);
          expect(shouldRetry).toBe(true);
          // Simulate retry after backoff
          return fn();
        }
        return fn();
      });

      mockCalendarClient.events.list.mockResolvedValue({
        data: { items: [] },
      });

      await calendarService.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });

      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it('should not retry on auth error (401)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');

      retryWithBackoff.mockImplementation(async (_fn: any, options: any) => {
        const error = new Error('Unauthorized 401');
        const shouldRetry = options.shouldRetry(error);
        expect(shouldRetry).toBe(false);
        throw error;
      });

      await expect(
        calendarService.listEvents({
          startDate: '2026-01-15T00:00:00Z',
          endDate: '2026-01-16T00:00:00Z',
        })
      ).rejects.toThrow();
    });

    it('should retry on server error (500)', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');

      let attemptCount = 0;
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        if (attemptCount === 0) {
          attemptCount++;
          const error = new Error('Internal Server Error 500');
          const shouldRetry = options.shouldRetry(error);
          expect(shouldRetry).toBe(true);
          return fn();
        }
        return fn();
      });

      mockCalendarClient.events.insert.mockResolvedValue({
        data: {
          id: 'event-123',
          summary: 'Test Event',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          iCalUID: 'ical-123',
        },
      });

      await calendarService.createEvent({
        title: 'Test Event',
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T11:00:00Z',
      });

      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it('should handle network errors with retry', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');

      let attemptCount = 0;
      retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
        if (attemptCount < 2) {
          attemptCount++;
          const error = new Error('Network timeout');
          const shouldRetry = options.shouldRetry(error);
          expect(shouldRetry).toBe(true);
          return fn();
        }
        return fn();
      });

      mockCalendarClient.events.list.mockResolvedValue({
        data: { items: [] },
      });

      await calendarService.listEvents({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-16T00:00:00Z',
      });

      expect(attemptCount).toBeGreaterThan(0);
    });

    it('should throw error after max retries exhausted', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');

      retryWithBackoff.mockImplementation(async (_fn: any) => {
        throw new Error('Max retries exceeded');
      });

      await expect(
        calendarService.listEvents({
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
        calendarService.updateEvent('non-existent-event', { title: 'Updated' })
      ).rejects.toThrow();
    });
  });

  describe('Health Check Integration', () => {
    it('should return true when Google Calendar API is available', async () => {
      const validTokens: GoogleOAuthTokens = {
        accessToken: 'valid-health-check-token',
        refreshToken: 'valid-health-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await oauthHandler.storeTokens(validTokens);
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      mockCalendarClient.calendarList.list.mockResolvedValue({ data: {} });

      const isAvailable = await calendarService.isAvailable();

      expect(isAvailable).toBe(true);
      expect(mockCalendarClient.calendarList.list).toHaveBeenCalledWith({
        maxResults: 1,
      });
    });

    it('should return false when authentication fails', async () => {
      const error: any = new Error('No tokens found');
      error.code = 'ENOENT';
      (fs.readFile as jest.Mock).mockRejectedValue(error);

      const isAvailable = await calendarService.isAvailable();

      expect(isAvailable).toBe(false);
    });

    it('should return false when API call fails', async () => {
      const validTokens: GoogleOAuthTokens = {
        accessToken: 'valid-health-check-token',
        refreshToken: 'valid-health-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await oauthHandler.storeTokens(validTokens);
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      mockCalendarClient.calendarList.list.mockRejectedValue(
        new Error('Service unavailable')
      );

      const isAvailable = await calendarService.isAvailable();

      expect(isAvailable).toBe(false);
    });
  });

  describe('Calendar Management Integration', () => {
    const validTokens: GoogleOAuthTokens = {
      accessToken: 'valid-calendar-mgmt-token',
      refreshToken: 'valid-calendar-refresh-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(async () => {
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await oauthHandler.storeTokens(validTokens);
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      await calendarService.authenticate();
      jest.clearAllMocks();
    });

    it('should list all calendars', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());

      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: {
          items: [
            {
              id: 'primary-calendar',
              summary: 'Primary Calendar',
              primary: true,
              backgroundColor: '#9fe1e7',
              accessRole: 'owner',
            },
            {
              id: 'work-calendar',
              summary: 'Work Calendar',
              primary: false,
              backgroundColor: '#f83a22',
              accessRole: 'writer',
            },
          ],
        },
      });

      const calendars = await calendarService.listCalendars();

      expect(calendars).toHaveLength(2);
      expect(calendars[0].isPrimary).toBe(true);
      expect(calendars[1].name).toBe('Work Calendar');
    });

    it('should respond to event invitation', async () => {
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      retryWithBackoff.mockImplementation(async (fn: any) => fn());

      const mockUserEmail = 'integration-test@example.com';

      mockCalendarClient.calendarList.get.mockResolvedValue({
        data: { id: mockUserEmail },
      });

      mockCalendarClient.events.get.mockResolvedValue({
        data: {
          id: 'invitation-event-123',
          summary: 'Team Meeting',
          start: { dateTime: '2026-01-15T10:00:00Z' },
          end: { dateTime: '2026-01-15T11:00:00Z' },
          attendees: [
            { email: mockUserEmail, responseStatus: 'needsAction' },
            { email: 'organizer@example.com', responseStatus: 'accepted' },
          ],
          organizer: { email: 'organizer@example.com' },
        },
      });

      mockCalendarClient.events.patch.mockResolvedValue({});

      await calendarService.respondToEvent('invitation-event-123', 'accepted');

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'invitation-event-123',
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
  });
});
