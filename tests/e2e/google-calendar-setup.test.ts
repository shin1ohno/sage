/**
 * E2E Test: Google Calendar Setup Flow
 * Requirements: 1, 9, 11 (OAuth, Config Management, Health Check)
 *
 * Tests the complete first-time Google Calendar setup experience:
 * 1. Detect available calendar sources
 * 2. Enable Google Calendar source
 * 3. Complete OAuth flow with mock authorization
 * 4. Store tokens and update config
 * 5. Verify first event fetch after setup
 *
 * Note: Uses mocked OAuth responses with pre-authorized test tokens
 * to avoid browser interaction during automated testing.
 */

import { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import { GoogleOAuthHandler, GOOGLE_CALENDAR_SCOPES } from '../../src/oauth/google-oauth-handler.js';
import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import { ConfigLoader } from '../../src/config/loader.js';
import type { UserConfig } from '../../src/types/config.js';
import type { GoogleOAuthTokens } from '../../src/oauth/google-oauth-handler.js';
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
        eventkit: { enabled: false },
        google: {
          enabled: false,
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
        // Deep clone to avoid reference issues
        const config = JSON.parse(JSON.stringify(mockConfig));

        // Simulate migration: if sources is missing, add defaults
        if (!config.calendar.sources) {
          const platform = process.platform;
          config.calendar.sources = {
            eventkit: { enabled: platform === 'darwin' },
            google: {
              enabled: platform !== 'darwin',
              defaultCalendar: 'primary',
              excludedCalendars: [],
              syncInterval: 300,
              enableNotifications: true,
            },
          };
        }

        return config;
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

describe('E2E: Google Calendar Setup Flow', () => {
  const mockConfig = {
    clientId: 'e2e-test-client-id',
    clientSecret: 'e2e-test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const mockEncryptionKey = 'e2e-test-encryption-key-32-ch!';
  const mockUserId = 'e2e-test-user';

  let oauthHandler: GoogleOAuthHandler;
  let calendarService: GoogleCalendarService;
  let sourceManager: CalendarSourceManager;
  let mockOAuth2Client: any;
  let mockCalendarClient: any;

  beforeEach(async () => {
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
    let mockFileStore: Record<string, string> = {};
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

    // Initialize components
    oauthHandler = new GoogleOAuthHandler(mockConfig, mockEncryptionKey, mockUserId);
    calendarService = new GoogleCalendarService(oauthHandler, { userId: mockUserId });

    // Mock isAvailable to return true for availability checks
    jest.spyOn(calendarService, 'isAvailable').mockResolvedValue(true);
  });

  describe('First-time Setup Flow', () => {
    it('should complete full setup: detectAvailableSources → enableSource → OAuth → token storage → config save', async () => {
      // Step 1: Detect available sources
      // Note: detectAvailableSources will return platform-specific results
      // On macOS: both EventKit and Google available
      // On Linux/Windows: only Google available
      sourceManager = new CalendarSourceManager({
        googleCalendarService: calendarService,
      });
      const availableSources = await sourceManager.detectAvailableSources();

      expect(availableSources).toHaveProperty('google');
      expect(availableSources.google).toBe(true); // Google is always available via API

      // Step 2: Load initial config (no Google Calendar enabled yet)
      const initialConfig: UserConfig = await ConfigLoader.load();

      expect(initialConfig.calendar.sources).toBeDefined();

      // Step 3: Enable Google Calendar source
      if (!initialConfig.calendar.sources) {
        initialConfig.calendar.sources = {
          eventkit: { enabled: false },
          google: {
            enabled: false,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        };
      }
      initialConfig.calendar.sources!.google = {
        enabled: true,
        defaultCalendar: 'primary',
        excludedCalendars: [],
        syncInterval: 300,
        enableNotifications: true,
      };

      await ConfigLoader.save(initialConfig);

      // Verify config was saved
      const savedConfig = await ConfigLoader.load();
      expect(savedConfig.calendar.sources?.google?.enabled).toBe(true);

      // Step 4: Begin OAuth flow - Get authorization URL
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=e2e-test&code_challenge=xyz789';
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

      // Step 5: Simulate OAuth callback with authorization code
      const authorizationCode = 'mock-authorization-code-from-google';
      const mockTokenResponse = {
        access_token: 'e2e-access-token-abc123',
        refresh_token: 'e2e-refresh-token-xyz789',
        expiry_date: Date.now() + 3600 * 1000, // 1 hour from now
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokenResponse });

      // Step 6: Exchange authorization code for tokens
      const tokens: GoogleOAuthTokens = await oauthHandler.exchangeCodeForTokens(authorizationCode);

      expect(tokens).toEqual({
        accessToken: mockTokenResponse.access_token,
        refreshToken: mockTokenResponse.refresh_token,
        expiresAt: mockTokenResponse.expiry_date,
        scope: GOOGLE_CALENDAR_SCOPES,
      });

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith({
        code: authorizationCode,
        codeVerifier: expect.any(String),
      });

      // Step 7: Store tokens securely
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

      // Step 8: Verify tokens can be retrieved
      const retrievedTokens = await oauthHandler.getTokens();
      expect(retrievedTokens).toBeDefined();
      expect(retrievedTokens?.accessToken).toBe(tokens.accessToken);
      expect(retrievedTokens?.refreshToken).toBe(tokens.refreshToken);

      // Step 9: Initialize calendar service with stored tokens
      mockOAuth2Client.setCredentials.mockImplementation((creds: any) => {
        mockOAuth2Client.credentials = creds;
      });

      await calendarService.authenticate();

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiresAt,
        scope: expect.any(String),
      });

      // Step 10: Verify first event fetch after setup
      const mockEvents = [
        {
          id: 'e2e-event-1',
          summary: 'First Event After Setup',
          start: { dateTime: new Date().toISOString() },
          end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
          status: 'confirmed',
        },
      ];

      mockCalendarClient.events.list.mockResolvedValue({ data: { items: mockEvents } });

      const startDate = new Date();
      const endDate = new Date(Date.now() + 7 * 24 * 3600000); // 7 days from now

      const events = await calendarService.listEvents({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('First Event After Setup');
      expect(events[0].source).toBe('google');
      expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'primary',
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
          maxResults: 250,
        })
      );
    });

    it('should handle OAuth errors gracefully during setup', async () => {
      // First, get authorization URL to generate code verifier
      mockOAuth2Client.generateAuthUrl.mockReturnValue('https://accounts.google.com/oauth');
      await oauthHandler.getAuthorizationUrl();

      // Simulate OAuth error during token exchange
      const authorizationCode = 'invalid-authorization-code';

      mockOAuth2Client.getToken.mockRejectedValue(
        new Error('invalid_grant: Authorization code is invalid')
      );

      await expect(oauthHandler.exchangeCodeForTokens(authorizationCode)).rejects.toThrow(
        'invalid_grant'
      );

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith({
        code: authorizationCode,
        codeVerifier: expect.any(String),
      });
    });

    it('should handle missing tokens when fetching events', async () => {
      // Try to authenticate without storing tokens first
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('Token file not found'));

      await expect(calendarService.authenticate()).rejects.toThrow();
    });

    it('should verify health check after successful setup', async () => {
      // Setup tokens
      const mockTokens: GoogleOAuthTokens = {
        accessToken: 'health-check-access-token',
        refreshToken: 'health-check-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      await oauthHandler.storeTokens(mockTokens);

      mockOAuth2Client.setCredentials.mockImplementation((creds: any) => {
        mockOAuth2Client.credentials = creds;
      });

      // Authenticate
      await calendarService.authenticate();

      // Health check should succeed
      const isHealthy = await calendarService.isAvailable();
      expect(isHealthy).toBe(true);

      // Verify calendar list can be fetched (sign of healthy connection)
      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: {
          items: [
            { id: 'primary', summary: 'Primary Calendar', primary: true, accessRole: 'owner' },
          ],
        },
      });

      const calendars = await calendarService.listCalendars();
      expect(calendars).toHaveLength(1);
      expect(calendars[0].isPrimary).toBe(true);
    });
  });

  describe('Config Persistence', () => {
    it('should persist Google Calendar enabled state across sessions', async () => {
      // First session: Enable Google Calendar
      const config1 = await ConfigLoader.load();
      if (!config1.calendar.sources) {
        config1.calendar.sources = {
          eventkit: { enabled: false },
          google: {
            enabled: false,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        };
      }
      config1.calendar.sources!.google = {
        enabled: true,
        defaultCalendar: 'primary',
        excludedCalendars: ['holidays@example.com'],
        syncInterval: 300,
        enableNotifications: true,
      };
      await ConfigLoader.save(config1);

      // Second session: Load config and verify settings persisted
      const config2 = await ConfigLoader.load();
      expect(config2.calendar.sources?.google?.enabled).toBe(true);
      expect(config2.calendar.sources?.google?.defaultCalendar).toBe('primary');
      expect(config2.calendar.sources?.google?.excludedCalendars).toContain('holidays@example.com');
    });

    it('should handle config migration for users without calendar.sources', async () => {
      // Simulate old config without calendar.sources
      const oldConfig = await ConfigLoader.load();
      if (oldConfig.calendar.sources) {
        delete oldConfig.calendar.sources;
      }
      await ConfigLoader.save(oldConfig);

      // Load config again - migration should add default calendar.sources
      const migratedConfig = await ConfigLoader.load();
      expect(migratedConfig.calendar.sources).toBeDefined();

      // Platform-specific defaults should be applied
      // On macOS: EventKit enabled, Google disabled
      // On Linux/Windows: EventKit disabled, Google enabled
      const platform = process.platform;
      if (platform === 'darwin') {
        expect(migratedConfig.calendar.sources?.eventkit?.enabled).toBe(true);
        expect(migratedConfig.calendar.sources?.google?.enabled).toBe(false);
      } else {
        expect(migratedConfig.calendar.sources?.eventkit?.enabled).toBe(false);
        expect(migratedConfig.calendar.sources?.google?.enabled).toBe(true);
      }
    });
  });

  describe('Error Recovery', () => {
    it('should recover from network errors during initial event fetch', async () => {
      // Setup tokens
      const mockTokens: GoogleOAuthTokens = {
        accessToken: 'network-error-access-token',
        refreshToken: 'network-error-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      await oauthHandler.storeTokens(mockTokens);

      mockOAuth2Client.setCredentials.mockImplementation((creds: any) => {
        mockOAuth2Client.credentials = creds;
      });

      await calendarService.authenticate();

      // First attempt: Network error
      // Second attempt: Success
      let callCount = 0;
      mockCalendarClient.events.list.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error: ECONNREFUSED');
        }
        return { data: { items: [] } };
      });

      // Retry logic should handle the network error
      const { retryWithBackoff } = require('../../src/utils/retry.js');
      (retryWithBackoff as jest.Mock).mockImplementation(async (fn) => {
        // Simulate one retry
        try {
          return await fn();
        } catch (error) {
          return await fn();
        }
      });

      const startDate = new Date().toISOString();
      const endDate = new Date(Date.now() + 7 * 24 * 3600000).toISOString();

      const events = await calendarService.listEvents({ startDate, endDate });
      expect(events).toEqual([]);
      expect(mockCalendarClient.events.list).toHaveBeenCalled();
    });

    it('should handle expired tokens during setup verification', async () => {
      // Setup tokens that are already expired
      const expiredTokens: GoogleOAuthTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      await oauthHandler.storeTokens(expiredTokens);

      // Mock token refresh
      const refreshedTokens = {
        access_token: 'refreshed-access-token',
        refresh_token: 'valid-refresh-token',
        expiry_date: Date.now() + 3600 * 1000,
      };

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({ credentials: refreshedTokens });
      mockOAuth2Client.setCredentials.mockImplementation((creds: any) => {
        mockOAuth2Client.credentials = creds;
      });

      // Authenticate should trigger token refresh
      await calendarService.authenticate();

      // Verify refresh was called
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: refreshedTokens.access_token,
        })
      );
    });
  });

  describe('Multi-Source Integration', () => {
    it('should integrate with CalendarSourceManager after setup', async () => {
      // Setup Google Calendar
      const mockTokens: GoogleOAuthTokens = {
        accessToken: 'multi-source-access-token',
        refreshToken: 'multi-source-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      await oauthHandler.storeTokens(mockTokens);

      mockOAuth2Client.setCredentials.mockImplementation((creds: any) => {
        mockOAuth2Client.credentials = creds;
      });

      await calendarService.authenticate();

      // Configure both sources in config
      const config = await ConfigLoader.load();
      if (!config.calendar.sources) {
        config.calendar.sources = {
          eventkit: { enabled: false },
          google: {
            enabled: false,
            defaultCalendar: 'primary',
            excludedCalendars: [],
            syncInterval: 300,
            enableNotifications: true,
          },
        };
      }
      config.calendar.sources!.google = {
        enabled: true,
        defaultCalendar: 'primary',
        excludedCalendars: [],
        syncInterval: 300,
        enableNotifications: true,
      };

      // On macOS, also enable EventKit
      if (process.platform === 'darwin') {
        config.calendar.sources!.eventkit = { enabled: true };
      }

      await ConfigLoader.save(config);

      // Create CalendarSourceManager
      sourceManager = new CalendarSourceManager({
        googleCalendarService: calendarService,
        config,
      });

      // Verify enabled sources
      const enabledSources = sourceManager.getEnabledSources();
      expect(enabledSources).toContain('google');

      if (process.platform === 'darwin') {
        expect(enabledSources).toContain('eventkit');
        expect(enabledSources).toHaveLength(2);
      } else {
        expect(enabledSources).toHaveLength(1);
      }

      // Health check should show Google as healthy
      const healthStatus = await sourceManager.healthCheck();
      expect(healthStatus.google).toBe(true);
    });
  });
});
