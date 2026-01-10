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
    describe('when platform is detected successfully', () => {
      it.skip('should return macOS platform info with all integrations [TODO: Update for capability-based system]', async () => {
        const ctx = createMockPlatformToolsContext({
          platformInfo: DEFAULT_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core platform info
        expect(response.platform).toBe('macos');
        expect(response.clientName).toBe('claude-desktop');
        expect(response.clientVersion).toBe('1.0.0');
        expect(response.supportsSampling).toBe(true);
        expect(response.detectionConfidence).toBe('high');

        // Available integrations
        expect(response.availableIntegrations.calendar.google).toBe(true);
        expect(response.availableIntegrations.calendar.eventkit).toBe(true);
        expect(response.availableIntegrations.calendar.native).toBe(false);
        expect(response.availableIntegrations.reminders.applescript).toBe(true);
        expect(response.availableIntegrations.reminders.native).toBe(false);

        // Human-readable integration lists
        expect(response.calendarIntegrations).toContain('Google Calendar (MCP)');
        expect(response.calendarIntegrations).toContain('EventKit (MCP)');
        expect(response.remindersIntegrations).toContain('Apple Reminders (MCP via AppleScript)');

        // Platform summary (Requirement 7.3)
        expect(response.integrationSummary).toContain('macOS');

        // No warnings when everything is configured
        expect(response.warnings).toBeUndefined();
      });

      it.skip('should return iOS platform info with native integrations [TODO: Fix for capability-based system] (Requirement 7.2)', async () => {
        const ctx = createMockPlatformToolsContext({
          platformInfo: IOS_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core platform info
        expect(response.platform).toBe('ios');
        expect(response.clientName).toBe('claude-ios');
        expect(response.supportsSampling).toBe(true);

        // Available integrations (Requirement 7.2)
        expect(response.availableIntegrations.calendar.google).toBe(true);
        expect(response.availableIntegrations.calendar.native).toBe(true);
        expect(response.availableIntegrations.calendar.eventkit).toBe(false);
        expect(response.availableIntegrations.reminders.native).toBe(true);
        expect(response.availableIntegrations.reminders.applescript).toBe(false);

        // Human-readable integration lists
        expect(response.calendarIntegrations).toContain('Google Calendar (MCP)');
        expect(response.calendarIntegrations).toContain('Apple Calendar (native)');
        expect(response.remindersIntegrations).toContain('Apple Reminders (native)');

        // Platform summary (Requirement 7.2)
        expect(response.integrationSummary).toContain('iOS/iPadOS');
        expect(response.integrationSummary).toContain('Google Calendar (MCP)');
        expect(response.integrationSummary).toContain('Apple Calendar (native)');
      });

      it.skip('should return web platform info with limited integrations (Requirement 7.4)', async () => {
        const ctx = createMockPlatformToolsContext({
          platformInfo: WEB_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core platform info
        expect(response.platform).toBe('web');
        expect(response.supportsSampling).toBe(false);

        // Available integrations (Requirement 7.4)
        expect(response.availableIntegrations.calendar.google).toBe(true);
        expect(response.availableIntegrations.calendar.native).toBe(false);
        expect(response.availableIntegrations.calendar.eventkit).toBe(false);
        expect(response.availableIntegrations.reminders.native).toBe(false);
        expect(response.availableIntegrations.reminders.applescript).toBe(false);

        // Reminders warning for web
        expect(response.remindersIntegrations).toContain('Reminders not supported on web platform');

        // Platform summary (Requirement 7.4)
        expect(response.integrationSummary).toContain('Web');
        expect(response.integrationSummary).toContain('Google Calendar (MCP only)');

        // Sampling warning (Requirement 7.5)
        expect(response.warnings).toBeDefined();
        expect(response.warnings).toContain(
          'Platform-adaptive integration unavailable: Your Claude client does not support Sampling.'
        );
      });

      it.skip('should return unknown platform info with warnings [TODO: Update for capability-based system]', async () => {
        const ctx = createMockPlatformToolsContext({
          platformInfo: UNKNOWN_DETECTED_PLATFORM,
          config: DEFAULT_TEST_CONFIG,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Core platform info
        expect(response.platform).toBe('unknown');
        expect(response.detectionConfidence).toBe('low');

        // Warnings should include unknown platform warning
        expect(response.warnings).toBeDefined();
        expect(response.warnings).toContainEqual(
          expect.stringContaining('Unknown platform detected')
        );
        expect(response.warnings).toContainEqual(
          expect.stringContaining('confidence is low')
        );
      });
    });

    describe('when Google Calendar is not authenticated (Requirement 7.7)', () => {
      it('should include warning about Google Calendar authentication', async () => {
        const ctx = createMockPlatformToolsContext({
          platformInfo: DEFAULT_DETECTED_PLATFORM,
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
        const noSamplingPlatform = {
          ...DEFAULT_DETECTED_PLATFORM,
          supportsSampling: false,
        };

        const ctx = createMockPlatformToolsContext({
          platformInfo: noSamplingPlatform,
          config: DEFAULT_TEST_CONFIG,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Sampling warning (Requirement 7.5)
        expect(response.warnings).toBeDefined();
        expect(response.warnings).toContain(
          'Platform-adaptive integration unavailable: Your Claude client does not support Sampling.'
        );

        // Message should mention warnings
        expect(response.message).toContain('warning');
      });
    });

    describe('when platform is not detected', () => {
      it('should return error when platform info is null', async () => {
        const ctx = createMockPlatformToolsContext({
          platformInfo: null,
          config: DEFAULT_TEST_CONFIG,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        expect(response.error).toBe(true);
        expect(response.message).toContain('Platform not detected');
        expect(response.suggestion).toContain('reconnecting');
      });
    });

    describe('when config is null', () => {
      it('should still return platform info but with limited integration status', async () => {
        const ctx = createMockPlatformToolsContext({
          platformInfo: DEFAULT_DETECTED_PLATFORM,
          config: null,
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Platform info should still be returned
        expect(response.platform).toBe('macos');
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
          platformInfo: DEFAULT_DETECTED_PLATFORM,
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
          platformInfo: DEFAULT_DETECTED_PLATFORM,
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
