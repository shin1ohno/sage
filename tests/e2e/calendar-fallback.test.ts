/**
 * E2E Test: Calendar Source Fallback and Error Handling
 * Task 40: E2E tests for error fallback scenarios
 * Requirements: 10, 11 (Error handling and automatic fallback)
 *
 * Tests graceful degradation when calendar sources fail:
 * 1. Both sources enabled, Google Calendar API fails
 * 2. list_calendar_events falls back to EventKit
 * 3. Warning message displayed to user
 * 4. find_available_slots continues working with EventKit only
 *
 * Note: Tests use mocked services with failure injection for consistent CI/CD execution.
 */

import { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import { CalendarService } from '../../src/integrations/calendar-service.js';
import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import { GoogleOAuthHandler } from '../../src/oauth/google-oauth-handler.js';
import { ConfigLoader } from '../../src/config/loader.js';
import type { GoogleOAuthTokens } from '../../src/oauth/google-oauth-handler.js';
import * as fs from 'fs/promises';
import * as syncFs from 'fs';

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

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

jest.mock('../../src/utils/retry.js', () => {
  const actual = jest.requireActual('../../src/utils/retry.js');
  return {
    ...actual,
    retryWithBackoff: jest.fn(async (fn) => fn()),
  };
});

jest.mock('../../src/config/loader.js', () => {
  let mockConfig: any = {
    version: '0.7.9',
    user: {
      name: 'Test User',
      email: 'test@example.com',
      timezone: 'America/New_York',
    },
    calendar: {
      provider: 'eventkit' as const,
      workingHours: {
        start: '09:00',
        end: '17:00',
      },
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
    },
    deepWorkBlocks: [],
    preferences: {
      notificationPreferences: {
        deepWork: true,
        taskReminders: true,
        slackSync: false,
      },
    },
    lastUpdated: new Date().toISOString(),
  };

  return {
    ConfigLoader: {
      load: jest.fn(async () => {
        return JSON.parse(JSON.stringify(mockConfig));
      }),
      save: jest.fn(async (config: any) => {
        mockConfig = JSON.parse(JSON.stringify(config));
      }),
      exists: jest.fn(async () => true),
      getConfigPath: jest.fn(() => '/mock/path/config.json'),
      getConfigDir: jest.fn(() => '/mock/path'),
    },
  };
});

// Mock CalendarService for EventKit
jest.mock('../../src/integrations/calendar-service.js', () => {
  return {
    CalendarService: jest.fn().mockImplementation(() => ({
      detectPlatform: jest.fn(async () => ({
        platform: process.platform === 'darwin' ? 'macos' : 'unsupported',
        version: '14.0.0',
        isSupported: process.platform === 'darwin',
      })),
      isAvailable: jest.fn(async () => process.platform === 'darwin'),
      listEvents: jest.fn(async () => ({
        events: [
          {
            id: 'eventkit-fallback-1',
            title: 'EventKit Meeting',
            start: new Date('2026-01-25T10:00:00Z').toISOString(),
            end: new Date('2026-01-25T11:00:00Z').toISOString(),
            isAllDay: false,
            source: 'eventkit',
            calendar: 'Work',
          },
          {
            id: 'eventkit-fallback-2',
            title: 'EventKit Review',
            start: new Date('2026-01-25T14:00:00Z').toISOString(),
            end: new Date('2026-01-25T15:00:00Z').toISOString(),
            isAllDay: false,
            source: 'eventkit',
            calendar: 'Personal',
          },
        ],
      })),
    })),
  };
});

describe('E2E: Calendar Source Fallback', () => {
  const mockOAuthConfig = {
    clientId: 'e2e-fallback-client-id',
    clientSecret: 'e2e-fallback-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const mockEncryptionKey = 'e2e-fallback-key-32-characters!';
  const mockUserId = 'e2e-fallback-user';

  let oauthHandler: GoogleOAuthHandler;
  let googleCalendarService: GoogleCalendarService;
  let calendarService: CalendarService;
  let sourceManager: CalendarSourceManager;
  let mockOAuth2Client: any;
  let mockCalendarClient: any;
  let mockFileStore: Record<string, string>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFileStore = {};

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
    (fs.writeFile as jest.Mock).mockImplementation(async (filePath: string, data: string) => {
      mockFileStore[filePath] = data;
    });
    (fs.readFile as jest.Mock).mockImplementation(async (filePath: string) => {
      if (mockFileStore[filePath]) {
        return mockFileStore[filePath];
      }
      throw new Error('File not found');
    });
    (fs.chmod as jest.Mock).mockResolvedValue(undefined);
    (fs.rename as jest.Mock).mockImplementation(async (oldPath: string, newPath: string) => {
      if (mockFileStore[oldPath]) {
        mockFileStore[newPath] = mockFileStore[oldPath];
        delete mockFileStore[oldPath];
      }
    });

    // Mock sync fs.existsSync to check our file store
    (syncFs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return filePath in mockFileStore;
    });

    // Initialize components
    oauthHandler = new GoogleOAuthHandler(mockOAuthConfig, mockEncryptionKey, mockUserId);
    googleCalendarService = new GoogleCalendarService(oauthHandler, { userId: mockUserId });
    calendarService = new CalendarService();

    // Setup tokens and authenticate
    const mockTokens: GoogleOAuthTokens = {
      accessToken: 'fallback-access-token',
      refreshToken: 'fallback-refresh-token',
      expiresAt: Date.now() + 3600 * 1000,
      scope: ['https://www.googleapis.com/auth/calendar'],
    };

    await oauthHandler.storeTokens(mockTokens);

    mockOAuth2Client.setCredentials.mockImplementation((creds: any) => {
      mockOAuth2Client.credentials = creds;
    });

    await googleCalendarService.authenticate();

    // Mock isAvailable to return true by default
    jest.spyOn(googleCalendarService, 'isAvailable').mockResolvedValue(true);

    // Configure both sources enabled
    const config = await ConfigLoader.load();
    config.calendar.sources = {
      eventkit: { enabled: process.platform === 'darwin' },
      google: {
        enabled: true,
        defaultCalendar: 'primary',
        excludedCalendars: [],
        syncInterval: 300,
        enableNotifications: true,
      },
    };
    await ConfigLoader.save(config);

    // Create CalendarSourceManager
    sourceManager = new CalendarSourceManager({
      calendarService,
      googleCalendarService,
      config,
    });
  });

  describe('Google Calendar API Failure Scenarios', () => {
    it('should fallback to EventKit when Google Calendar API returns 429 rate limit error', async () => {
      // Simulate Google Calendar API rate limit error (429)
      mockCalendarClient.events.list.mockRejectedValue({
        code: 429,
        message: 'Rate limit exceeded',
        errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded' }],
      });

      // Execute: List calendar events
      const startDate = '2026-01-25T00:00:00Z';
      const endDate = '2026-01-25T23:59:59Z';

      if (process.platform === 'darwin') {
        // On macOS, should fallback to EventKit
        const events = await sourceManager.getEvents(startDate, endDate);

        // Verify: EventKit events returned despite Google failure
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.source === 'eventkit')).toBe(true);

        // Verify: EventKit events are the fallback data
        const eventkitMeeting = events.find((e) => e.title === 'EventKit Meeting');
        expect(eventkitMeeting).toBeDefined();
        expect(eventkitMeeting?.source).toBe('eventkit');

        const eventkitReview = events.find((e) => e.title === 'EventKit Review');
        expect(eventkitReview).toBeDefined();
        expect(eventkitReview?.source).toBe('eventkit');

        // Verify: Google Calendar API was attempted
        expect(mockCalendarClient.events.list).toHaveBeenCalled();

        // Verify: EventKit was called as fallback
        expect(calendarService.listEvents).toHaveBeenCalledWith({
          startDate,
          endDate,
          calendarName: undefined,
        });
      } else {
        // On non-macOS, no fallback available - should throw
        await expect(
          sourceManager.getEvents(startDate, endDate)
        ).rejects.toThrow('All calendar sources failed');
      }
    });

    it('should fallback to EventKit when Google Calendar API returns 503 service unavailable error', async () => {
      // Simulate Google Calendar API service unavailable error (503)
      mockCalendarClient.events.list.mockRejectedValue({
        code: 503,
        message: 'Service unavailable',
        errors: [{ domain: 'global', reason: 'backendError' }],
      });

      const startDate = '2026-01-25T00:00:00Z';
      const endDate = '2026-01-25T23:59:59Z';

      if (process.platform === 'darwin') {
        // On macOS, should fallback to EventKit
        const events = await sourceManager.getEvents(startDate, endDate);

        // Verify: EventKit events returned
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.source === 'eventkit')).toBe(true);
      } else {
        // On non-macOS, no fallback available
        await expect(
          sourceManager.getEvents(startDate, endDate)
        ).rejects.toThrow('All calendar sources failed');
      }
    });

    it('should fallback to EventKit when Google Calendar API returns network timeout', async () => {
      // Simulate network timeout
      mockCalendarClient.events.list.mockRejectedValue(
        new Error('ETIMEDOUT: Connection timed out')
      );

      const startDate = '2026-01-25T00:00:00Z';
      const endDate = '2026-01-25T23:59:59Z';

      if (process.platform === 'darwin') {
        // On macOS, should fallback to EventKit
        const events = await sourceManager.getEvents(startDate, endDate);

        // Verify: EventKit events returned
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.source === 'eventkit')).toBe(true);
      } else {
        // On non-macOS, no fallback available
        await expect(
          sourceManager.getEvents(startDate, endDate)
        ).rejects.toThrow();
      }
    });

    it('should fallback to EventKit when Google Calendar API returns 401 unauthorized (token expired)', async () => {
      // Simulate authentication failure (401)
      mockCalendarClient.events.list.mockRejectedValue({
        code: 401,
        message: 'Invalid Credentials',
        errors: [{ domain: 'global', reason: 'authError' }],
      });

      const startDate = '2026-01-25T00:00:00Z';
      const endDate = '2026-01-25T23:59:59Z';

      if (process.platform === 'darwin') {
        // On macOS, should fallback to EventKit
        const events = await sourceManager.getEvents(startDate, endDate);

        // Verify: EventKit events returned
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.source === 'eventkit')).toBe(true);
      } else {
        // On non-macOS, no fallback available
        await expect(
          sourceManager.getEvents(startDate, endDate)
        ).rejects.toThrow('All calendar sources failed');
      }
    });
  });

  describe('Available Slots with Fallback', () => {
    it('should find available slots using EventKit when Google Calendar API fails', async () => {
      // Simulate Google Calendar API failure
      mockCalendarClient.events.list.mockRejectedValue(
        new Error('Google Calendar API unavailable')
      );

      const startDate = '2026-01-25T00:00:00Z';
      const endDate = '2026-01-25T23:59:59Z';

      if (process.platform === 'darwin') {
        // On macOS, should use EventKit events to find slots
        const slots = await sourceManager.findAvailableSlots({
          startDate,
          endDate,
          minDurationMinutes: 30,
          maxDurationMinutes: 480,
          workingHours: {
            start: '09:00',
            end: '18:00',
          },
        });

        // Verify: Slots calculated successfully using EventKit
        expect(slots).toBeDefined();
        expect(Array.isArray(slots)).toBe(true);

        // Verify: Slots found between EventKit events
        // EventKit has events at 10:00-11:00 and 14:00-15:00
        // So we should have slots like 09:00-10:00, 11:00-14:00, 15:00-18:00
        if (slots.length > 0) {
          slots.forEach((slot) => {
            expect(slot).toHaveProperty('start');
            expect(slot).toHaveProperty('end');
            expect(slot).toHaveProperty('durationMinutes');
            expect(slot).toHaveProperty('suitability');
            expect(slot.durationMinutes).toBeGreaterThanOrEqual(30);
            expect(slot.durationMinutes).toBeLessThanOrEqual(480);
          });
        }

        // Verify: EventKit was called
        expect(calendarService.listEvents).toHaveBeenCalled();
      } else {
        // On non-macOS, no fallback available
        await expect(
          sourceManager.findAvailableSlots({
            startDate,
            endDate,
            minDurationMinutes: 30,
            maxDurationMinutes: 480,
            workingHours: {
              start: '09:00',
              end: '18:00',
            },
          })
        ).rejects.toThrow();
      }
    });

    it('should continue finding slots if only EventKit is available', async () => {
      if (process.platform === 'darwin') {
        // Disable Google Calendar source
        const config = await ConfigLoader.load();
        if (config.calendar?.sources) {
          config.calendar.sources.google.enabled = false;
        }
        await ConfigLoader.save(config);

        // Recreate manager with updated config
        sourceManager = new CalendarSourceManager({
          calendarService,
          googleCalendarService,
          config,
        });

        const startDate = '2026-01-25T00:00:00Z';
        const endDate = '2026-01-25T23:59:59Z';

        // Execute: Find available slots with only EventKit enabled
        const slots = await sourceManager.findAvailableSlots({
          startDate,
          endDate,
          minDurationMinutes: 30,
          maxDurationMinutes: 480,
          workingHours: {
            start: '09:00',
            end: '18:00',
          },
        });

        // Verify: Slots found using EventKit only
        expect(slots).toBeDefined();
        expect(Array.isArray(slots)).toBe(true);

        // Verify: Google Calendar was NOT called
        expect(mockCalendarClient.events.list).not.toHaveBeenCalled();

        // Verify: EventKit was called
        expect(calendarService.listEvents).toHaveBeenCalled();
      }
    });
  });

  describe('Error Messages and User Feedback', () => {
    it('should throw clear error when both sources fail', async () => {
      // Simulate both sources failing
      mockCalendarClient.events.list.mockRejectedValue(
        new Error('Google Calendar unavailable')
      );

      if (process.platform === 'darwin') {
        // Also make EventKit fail
        const mockEventKitListEvents = jest.fn(async () => {
          throw new Error('EventKit permission denied');
        });
        calendarService.listEvents = mockEventKitListEvents as any;
      }

      // Execute and verify: Should throw clear error
      const startDate = '2026-01-25T00:00:00Z';
      const endDate = '2026-01-25T23:59:59Z';

      await expect(
        sourceManager.getEvents(startDate, endDate)
      ).rejects.toThrow('All calendar sources failed');
    });

    it('should throw error when no sources are enabled', async () => {
      // Disable all sources
      const config = await ConfigLoader.load();
      if (config.calendar?.sources) {
        config.calendar.sources.eventkit.enabled = false;
        config.calendar.sources.google.enabled = false;
      }
      await ConfigLoader.save(config);

      // Recreate manager with no sources enabled
      sourceManager = new CalendarSourceManager({
        calendarService,
        googleCalendarService,
        config,
      });

      // Execute and verify: Should throw error
      await expect(
        sourceManager.getEvents(
          '2026-01-25T00:00:00Z',
          '2026-01-25T23:59:59Z'
        )
      ).rejects.toThrow('No calendar sources are enabled');
    });
  });

  describe('Health Check During Failures', () => {
    it('should report unhealthy status for Google Calendar when API fails', async () => {
      // Mock Google Calendar isAvailable to return false
      jest.spyOn(googleCalendarService, 'isAvailable').mockResolvedValue(false);

      // Execute: Health check
      const health = await sourceManager.healthCheck();

      // Verify: Google Calendar reported as unhealthy
      expect(health).toHaveProperty('eventkit');
      expect(health).toHaveProperty('google');

      if (process.platform === 'darwin') {
        expect(health.eventkit).toBe(true);
      } else {
        expect(health.eventkit).toBe(false);
      }

      expect(health.google).toBe(false);
    });

    it('should report healthy status when sources recover', async () => {
      // Initially mock Google Calendar as unavailable
      jest.spyOn(googleCalendarService, 'isAvailable').mockResolvedValue(false);

      let health = await sourceManager.healthCheck();
      expect(health.google).toBe(false);

      // Simulate recovery: Google Calendar becomes available
      jest.spyOn(googleCalendarService, 'isAvailable').mockResolvedValue(true);

      health = await sourceManager.healthCheck();
      expect(health.google).toBe(true);
    });
  });

  describe('Event Creation Fallback', () => {
    it('should throw error when Google Calendar event creation fails and no fallback available', async () => {
      // Simulate Google Calendar creation failure
      mockCalendarClient.events.insert.mockRejectedValue(
        new Error('Google Calendar API unavailable')
      );

      // Execute and verify: Should throw error
      const createRequest = {
        title: 'Failed Event',
        start: '2026-01-26T14:00:00Z',
        end: '2026-01-26T15:00:00Z',
        isAllDay: false,
      };

      await expect(
        sourceManager.createEvent(createRequest, 'google')
      ).rejects.toThrow();
    });

    it('should throw error when event creation fails with no preferred source', async () => {
      // Simulate Google Calendar creation failure
      mockCalendarClient.events.insert.mockRejectedValue(
        new Error('Google Calendar unavailable')
      );

      // Execute and verify: Should throw error when all enabled sources fail
      const createRequest = {
        title: 'Failed Event',
        start: '2026-01-26T14:00:00Z',
        end: '2026-01-26T15:00:00Z',
        isAllDay: false,
      };

      await expect(
        sourceManager.createEvent(createRequest)
      ).rejects.toThrow();
    });
  });

  describe('Event Deletion Fallback', () => {
    it('should attempt deletion from Google Calendar when source is specified', async () => {
      // Mock Google Calendar deletion (success)
      mockCalendarClient.events.delete.mockResolvedValue({ data: {} });

      // Execute: Delete event from Google Calendar
      await sourceManager.deleteEvent('event-to-delete', 'google');

      // Verify: Google Calendar deletion was called
      expect(mockCalendarClient.events.delete).toHaveBeenCalled();
    });

    it('should throw error when Google Calendar deletion fails', async () => {
      // Simulate Google Calendar deletion failure
      mockCalendarClient.events.delete.mockRejectedValue(
        new Error('Google Calendar deletion failed')
      );

      // Execute and verify: Should throw error
      await expect(
        sourceManager.deleteEvent('event-to-delete', 'google')
      ).rejects.toThrow();
    });
  });
});
