/**
 * Platform Tool Handlers Unit Tests
 *
 * Tests for handleGetPlatformInfo tool handler.
 * Requirements: 7.1-7.7 (platform-adaptive-integration)
 */

import { handleGetPlatformInfo } from '../../../../src/tools/platform/handlers.js';
import {
  createMockPlatformToolsContext,
  DEFAULT_TEST_CONFIG,
  DEFAULT_DETECTED_PLATFORM,
  IOS_DETECTED_PLATFORM,
  WEB_DETECTED_PLATFORM,
  UNKNOWN_DETECTED_PLATFORM,
  createTestConfig,
} from '../../../helpers/index.js';

describe('Platform Tool Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleGetPlatformInfo', () => {
    describe('when client is detected successfully', () => {
      it('should return desktop client info with all integrations', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core client info
        expect(response.clientName).toBe('claude-desktop');
        expect(response.clientVersion).toBe('1.0.0');
        expect(response.supportsSampling).toBe(false); // Desktop doesn't support Sampling

        // Server environment
        expect(response.serverEnvironment).toBeDefined();
        expect(response.serverEnvironment.platform).toBe(process.platform);
        expect(response.serverEnvironment.isMacOS).toBe(process.platform === 'darwin');

        // Available integrations (capability-based)
        expect(response.availableIntegrations.calendar.google).toBe(true);
        const isMacOS = process.platform === 'darwin';
        expect(response.availableIntegrations.calendar.eventkit).toBe(isMacOS);
        expect(response.availableIntegrations.calendar.native).toBe(false); // No Sampling on desktop
        expect(response.availableIntegrations.reminders.applescript).toBe(isMacOS);
        expect(response.availableIntegrations.reminders.native).toBe(false); // No Sampling on desktop

        // Human-readable integration lists
        expect(response.calendarIntegrations).toContain('Google Calendar (MCP)');
        if (isMacOS) {
          expect(response.calendarIntegrations).toContain('EventKit (MCP)');
          expect(response.remindersIntegrations).toContain('Apple Reminders (MCP via AppleScript)');
        }

        // Warning about no Sampling support on desktop
        expect(response.warnings).toBeDefined();
        expect(response.warnings.some((w: string) =>
          w.includes('Native integration unavailable')
        )).toBe(true);
      });

      it('should return iOS client info with native integrations (Requirement 7.2)', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: IOS_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core client info
        expect(response.clientName).toBe('claude-ios');
        expect(response.supportsSampling).toBe(true);

        // Available integrations (Requirement 7.2) - capability-based
        expect(response.availableIntegrations.calendar.google).toBe(true);
        expect(response.availableIntegrations.calendar.native).toBe(true); // Sampling support
        // Note: eventkit/applescript depend on actual process.platform, not client type
        const isMacOS = process.platform === 'darwin';
        expect(response.availableIntegrations.calendar.eventkit).toBe(isMacOS); // Runtime platform check
        expect(response.availableIntegrations.reminders.native).toBe(true); // Sampling support
        expect(response.availableIntegrations.reminders.applescript).toBe(isMacOS); // Runtime platform check

        // Human-readable integration lists
        expect(response.calendarIntegrations).toContain('Google Calendar (MCP)');
        expect(response.calendarIntegrations).toContain('Apple Calendar (native via Sampling)');
        expect(response.remindersIntegrations).toContain('Apple Reminders (native via Sampling)');

        // Integration summary (Requirement 7.2)
        expect(response.integrationSummary).toContain('Full integration');
      });

      it('should return web client info with limited integrations (Requirement 7.4)', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: WEB_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core client info
        expect(response.clientName).toBe('claude-web');
        expect(response.supportsSampling).toBe(false);

        // Available integrations (Requirement 7.4) - capability-based
        expect(response.availableIntegrations.calendar.google).toBe(true);
        expect(response.availableIntegrations.calendar.native).toBe(false); // No Sampling on web
        // Note: eventkit/applescript depend on actual process.platform
        const isMacOS = process.platform === 'darwin';
        expect(response.availableIntegrations.calendar.eventkit).toBe(isMacOS); // Runtime platform check
        expect(response.availableIntegrations.reminders.native).toBe(false); // No Sampling on web
        expect(response.availableIntegrations.reminders.applescript).toBe(isMacOS); // Runtime platform check

        // Sampling warning (Requirement 7.5)
        expect(response.warnings).toBeDefined();
        expect(response.warnings.some((w: string) =>
          w.includes('Native integration unavailable')
        )).toBe(true);
      });

      it('should return unknown client info with warnings', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: UNKNOWN_DETECTED_PLATFORM,
          config: DEFAULT_TEST_CONFIG,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core client info
        expect(response.clientName).toBe('unknown-client');

        // Warnings should include Sampling not supported warning
        expect(response.warnings).toBeDefined();
        expect(response.warnings.some((w: string) =>
          w.includes('Native integration unavailable')
        )).toBe(true);
      });
    });

    describe('when Google Calendar is not authenticated (Requirement 7.7)', () => {
      it('should include warning about Google Calendar authentication', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: false },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Google Calendar should not be available
        expect(response.availableIntegrations.calendar.google).toBe(false);

        // Warning about Google Calendar (Requirement 7.7)
        expect(response.warnings).toBeDefined();
        expect(response.warnings).toContain(
          'Google Calendar: Not authenticated (run authenticate_google)'
        );

        // Integration list should include authentication hint
        expect(response.calendarIntegrations).toContain(
          'Google Calendar: Not authenticated (run authenticate_google)'
        );
      });
    });

    describe('when Sampling is not supported (Requirement 7.5)', () => {
      it('should include Sampling warning for non-Sampling clients', async () => {
        const noSamplingClient = {
          ...DEFAULT_DETECTED_PLATFORM,
          supportsSampling: false,
        };

        const ctx = createMockPlatformToolsContext({
          clientInfo: noSamplingClient,
          config: DEFAULT_TEST_CONFIG,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Sampling warning (Requirement 7.5)
        expect(response.warnings).toBeDefined();
        expect(response.warnings.some((w: string) =>
          w.includes('Native integration unavailable')
        )).toBe(true);

        // Message should mention warnings
        expect(response.message).toContain('warning');
      });
    });

    describe('when client is not detected', () => {
      it('should return error when client info is null', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: null,
          config: DEFAULT_TEST_CONFIG,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        expect(response.error).toBe(true);
        expect(response.message).toContain('Client not detected');
        expect(response.suggestion).toContain('reconnecting');
      });
    });

    describe('when config is null', () => {
      it('should still return client info but with limited integration status', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          config: null,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Client info should still be returned
        expect(response.clientName).toBe('claude-desktop');

        // Google Calendar should not be available (no config)
        expect(response.availableIntegrations.calendar.google).toBe(false);

        // Warning about Google Calendar
        expect(response.warnings).toBeDefined();
        expect(response.warnings).toContain(
          'Google Calendar: Not authenticated (run authenticate_google)'
        );
      });
    });

    describe('response format', () => {
      it('should return valid JSON in content array', async () => {
        const ctx = createMockPlatformToolsContext();

        const result = await handleGetPlatformInfo({}, ctx);

        expect(result.content).toBeInstanceOf(Array);
        expect(result.content.length).toBe(1);
        expect(result.content[0].type).toBe('text');
        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });

      it('should include message in response', async () => {
        const ctx = createMockPlatformToolsContext();

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        expect(response.message).toBeDefined();
        expect(typeof response.message).toBe('string');
      });
    });

    describe('configuration changes (Requirement 7.6)', () => {
      it('should reflect updated Google Calendar availability when config changes', async () => {
        // First call with Google disabled
        const ctx1 = createMockPlatformToolsContext({
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: false },
            },
          }),
        });

        const result1 = await handleGetPlatformInfo({}, ctx1);
        const response1 = JSON.parse(result1.content[0].text);
        expect(response1.availableIntegrations.calendar.google).toBe(false);

        // Second call with Google enabled
        const ctx2 = createMockPlatformToolsContext({
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result2 = await handleGetPlatformInfo({}, ctx2);
        const response2 = JSON.parse(result2.content[0].text);
        expect(response2.availableIntegrations.calendar.google).toBe(true);
      });
    });
  });
});
