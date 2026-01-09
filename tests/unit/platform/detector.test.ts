/**
 * Platform Detector Unit Tests
 * Requirements: 8 (Testing Strategy)
 *
 * Tests for PlatformDetector class focusing on:
 * - detectPlatform() with various clientInfo scenarios
 * - Sampling capability detection
 * - getAvailableIntegrations() with different platforms and configs
 */

import { PlatformDetector } from '../../../src/platform/detector.js';
import type { ClientInfo, Platform } from '../../../src/types/platform.js';
import type { UserConfig } from '../../../src/types/config.js';
import {
  iOSClientInfo,
  iPadOSClientInfo,
  macOSClientInfo,
  webClientInfo,
  unknownClientInfo,
  samplingCapabilities,
  noSamplingCapabilities,
  fullCapabilities,
  createMockClientInfo,
  createMockCapabilities,
} from '../../mocks/client-info.js';

describe('PlatformDetector', () => {
  describe('detectPlatform', () => {
    describe('iOS detection', () => {
      it('should detect iOS platform from claude-ios clientInfo', () => {
        const result = PlatformDetector.detectPlatform(iOSClientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ios');
        expect(result.clientName).toBe('claude-ios');
        expect(result.clientVersion).toBe('1.0.0');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect iOS from clientInfo containing "ios" substring', () => {
        const clientInfo = createMockClientInfo('my-ios-app');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ios');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should be case-insensitive for iOS detection', () => {
        const clientInfo = createMockClientInfo('Claude-iOS-App');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ios');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect iOS from "mobile" with medium confidence', () => {
        const clientInfo = createMockClientInfo('claude-mobile');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ios');
        expect(result.detectionConfidence).toBe('medium');
      });

      it('should preserve original clientName case', () => {
        const clientInfo = createMockClientInfo('Claude-IOS');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.clientName).toBe('Claude-IOS');
        expect(result.platform).toBe('ios');
      });
    });

    describe('iPadOS detection', () => {
      it('should detect iPadOS platform from claude-ipados clientInfo', () => {
        const result = PlatformDetector.detectPlatform(iPadOSClientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ipados');
        expect(result.clientName).toBe('claude-ipados');
        expect(result.clientVersion).toBe('1.0.0');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect iPadOS from clientInfo containing "ipad" substring', () => {
        const clientInfo = createMockClientInfo('my-ipad-client');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ipados');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should be case-insensitive for iPadOS detection', () => {
        const clientInfo = createMockClientInfo('IPAD-APP');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ipados');
        expect(result.detectionConfidence).toBe('high');
      });
    });

    describe('macOS detection', () => {
      it('should detect macOS from claude-desktop-macos clientInfo', () => {
        const result = PlatformDetector.detectPlatform(macOSClientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('desktop');
        expect(result.clientName).toBe('claude-desktop-macos');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect macOS from "claude-code" with medium confidence', () => {
        const clientInfo = createMockClientInfo('claude-code');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('macos');
        expect(result.detectionConfidence).toBe('medium');
      });

      it('should detect macOS from "code" keyword', () => {
        const clientInfo = createMockClientInfo('vscode-extension');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('macos');
        expect(result.detectionConfidence).toBe('medium');
      });
    });

    describe('Desktop detection', () => {
      it('should detect desktop platform from clientInfo containing "desktop"', () => {
        const clientInfo = createMockClientInfo('claude-desktop');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('desktop');
        expect(result.detectionConfidence).toBe('high');
      });
    });

    describe('Web detection', () => {
      it('should detect web platform from claude-web clientInfo', () => {
        const result = PlatformDetector.detectPlatform(webClientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('web');
        expect(result.clientName).toBe('claude-web');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect web from clientInfo containing "web" substring', () => {
        const clientInfo = createMockClientInfo('my-web-client');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('web');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should be case-insensitive for web detection', () => {
        const clientInfo = createMockClientInfo('Web-Client');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('web');
        expect(result.detectionConfidence).toBe('high');
      });
    });

    describe('Unknown platform detection', () => {
      it('should detect unknown platform from unrecognized clientInfo', () => {
        const result = PlatformDetector.detectPlatform(unknownClientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('unknown');
        expect(result.clientName).toBe('unknown-client');
        expect(result.detectionConfidence).toBe('low');
      });

      it('should log warning for unknown platform', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const clientInfo = createMockClientInfo('random-client');

        PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown platform detected')
        );
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('random-client'));

        warnSpy.mockRestore();
      });

      it('should return low confidence for unknown platforms', () => {
        const clientInfo = createMockClientInfo('mystery-app');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.detectionConfidence).toBe('low');
      });
    });

    describe('Detection priority', () => {
      it('should prioritize iOS over desktop for "ios-desktop"', () => {
        const clientInfo = createMockClientInfo('ios-desktop');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ios');
      });

      it('should prioritize iPadOS over web for "ipad-web"', () => {
        const clientInfo = createMockClientInfo('ipad-web');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ipados');
      });

      it('should prioritize desktop over web for "desktop-web"', () => {
        const clientInfo = createMockClientInfo('desktop-web');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('desktop');
      });

      it('should prioritize mobile (iOS) over code (macOS) for "mobile-code"', () => {
        const clientInfo = createMockClientInfo('mobile-code');
        const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);

        expect(result.platform).toBe('ios');
      });
    });
  });

  describe('Sampling capability detection', () => {
    describe('With Sampling support', () => {
      it('should detect Sampling when capabilities.sampling is defined', () => {
        const result = PlatformDetector.detectPlatform(iOSClientInfo, samplingCapabilities);

        expect(result.supportsSampling).toBe(true);
      });

      it('should detect Sampling with empty sampling object', () => {
        const capabilities = createMockCapabilities(true);
        const result = PlatformDetector.detectPlatform(macOSClientInfo, capabilities);

        expect(result.supportsSampling).toBe(true);
      });

      it('should detect Sampling with full capabilities', () => {
        const result = PlatformDetector.detectPlatform(webClientInfo, fullCapabilities);

        expect(result.supportsSampling).toBe(true);
      });

      it('should work across all platform types', () => {
        const platforms: Array<{ clientInfo: ClientInfo; expectedPlatform: Platform }> = [
          { clientInfo: iOSClientInfo, expectedPlatform: 'ios' },
          { clientInfo: iPadOSClientInfo, expectedPlatform: 'ipados' },
          { clientInfo: macOSClientInfo, expectedPlatform: 'desktop' },
          { clientInfo: webClientInfo, expectedPlatform: 'web' },
        ];

        platforms.forEach(({ clientInfo, expectedPlatform }) => {
          const result = PlatformDetector.detectPlatform(clientInfo, samplingCapabilities);

          expect(result.platform).toBe(expectedPlatform);
          expect(result.supportsSampling).toBe(true);
        });
      });
    });

    describe('Without Sampling support', () => {
      it('should detect no Sampling when capabilities.sampling is undefined', () => {
        const result = PlatformDetector.detectPlatform(iOSClientInfo, noSamplingCapabilities);

        expect(result.supportsSampling).toBe(false);
      });

      it('should detect no Sampling with empty capabilities object', () => {
        const result = PlatformDetector.detectPlatform(macOSClientInfo, {});

        expect(result.supportsSampling).toBe(false);
      });

      it('should detect no Sampling with other capabilities present', () => {
        const capabilities = createMockCapabilities(false, {
          roots: { listChanged: true },
          experimental: {},
        });
        const result = PlatformDetector.detectPlatform(webClientInfo, capabilities);

        expect(result.supportsSampling).toBe(false);
      });

      it('should work across all platform types', () => {
        const platforms: ClientInfo[] = [
          iOSClientInfo,
          iPadOSClientInfo,
          macOSClientInfo,
          webClientInfo,
          unknownClientInfo,
        ];

        platforms.forEach((clientInfo) => {
          const result = PlatformDetector.detectPlatform(clientInfo, noSamplingCapabilities);
          expect(result.supportsSampling).toBe(false);
        });
      });
    });
  });

  describe('getAvailableIntegrations', () => {
    // Helper to create minimal config
    const createConfig = (googleEnabled: boolean): UserConfig => ({
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      user: { name: 'Test User', timezone: 'Asia/Tokyo' },
      calendar: {
        workingHours: { start: '09:00', end: '18:00' },
        meetingHeavyDays: [],
        deepWorkDays: [],
        deepWorkBlocks: [],
        timeZone: 'Asia/Tokyo',
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
        keywordMapping: { simple: [], medium: [], complex: [], project: [] },
      },
      reminders: {
        defaultTypes: [],
        weeklyReview: { enabled: false, day: 'Friday', time: '17:00', description: '' },
        customRules: [],
      },
      team: { frequentCollaborators: [], departments: [] },
      integrations: {
        appleReminders: {
          enabled: true,
          threshold: 7,
          unit: 'days',
          defaultList: 'Reminders',
          lists: {},
        },
        notion: { enabled: false, threshold: 8, unit: 'days', databaseId: '' },
        googleCalendar: {
          enabled: googleEnabled,
          defaultCalendar: 'primary',
          conflictDetection: true,
          lookAheadDays: 14,
        },
      },
      preferences: { language: 'ja', dateFormat: 'YYYY-MM-DD', timeFormat: '24h' },
    });

    describe('iOS platform', () => {
      it('should return native integrations for iOS', () => {
        const result = PlatformDetector.getAvailableIntegrations('ios');

        expect(result.calendar.native).toBe(true);
        expect(result.calendar.eventkit).toBe(false);
        expect(result.calendar.google).toBe(false);
        expect(result.reminders.native).toBe(true);
        expect(result.reminders.applescript).toBe(false);
      });

      it('should include Google Calendar when configured on iOS', () => {
        const config = createConfig(true);
        const result = PlatformDetector.getAvailableIntegrations('ios', config);

        expect(result.calendar.google).toBe(true);
        expect(result.calendar.native).toBe(true);
      });

      it('should exclude Google Calendar when not configured on iOS', () => {
        const config = createConfig(false);
        const result = PlatformDetector.getAvailableIntegrations('ios', config);

        expect(result.calendar.google).toBe(false);
        expect(result.calendar.native).toBe(true);
      });

      it('should handle undefined config on iOS', () => {
        const result = PlatformDetector.getAvailableIntegrations('ios', undefined);

        expect(result.calendar.google).toBe(false);
        expect(result.calendar.native).toBe(true);
        expect(result.reminders.native).toBe(true);
      });
    });

    describe('iPadOS platform', () => {
      it('should return native integrations for iPadOS', () => {
        const result = PlatformDetector.getAvailableIntegrations('ipados');

        expect(result.calendar.native).toBe(true);
        expect(result.calendar.eventkit).toBe(false);
        expect(result.calendar.google).toBe(false);
        expect(result.reminders.native).toBe(true);
        expect(result.reminders.applescript).toBe(false);
      });

      it('should include Google Calendar when configured on iPadOS', () => {
        const config = createConfig(true);
        const result = PlatformDetector.getAvailableIntegrations('ipados', config);

        expect(result.calendar.google).toBe(true);
        expect(result.calendar.native).toBe(true);
      });

      it('should exclude Google Calendar when not configured on iPadOS', () => {
        const config = createConfig(false);
        const result = PlatformDetector.getAvailableIntegrations('ipados', config);

        expect(result.calendar.google).toBe(false);
        expect(result.calendar.native).toBe(true);
      });
    });

    describe('macOS platform', () => {
      const originalPlatform = process.platform;

      afterEach(() => {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      });

      it('should return EventKit and AppleScript on darwin', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        const result = PlatformDetector.getAvailableIntegrations('macos');

        expect(result.calendar.eventkit).toBe(true);
        expect(result.calendar.native).toBe(false);
        expect(result.calendar.google).toBe(false);
        expect(result.reminders.applescript).toBe(true);
        expect(result.reminders.native).toBe(false);
      });

      it('should include Google Calendar when configured on macOS', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        const config = createConfig(true);
        const result = PlatformDetector.getAvailableIntegrations('macos', config);

        expect(result.calendar.google).toBe(true);
        expect(result.calendar.eventkit).toBe(true);
      });

      it('should not return EventKit on non-darwin platform', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

        const result = PlatformDetector.getAvailableIntegrations('macos');

        expect(result.calendar.eventkit).toBe(false);
        expect(result.reminders.applescript).toBe(false);
      });

      it('should handle Windows platform', () => {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

        const result = PlatformDetector.getAvailableIntegrations('macos');

        expect(result.calendar.eventkit).toBe(false);
        expect(result.reminders.applescript).toBe(false);
      });
    });

    describe('Desktop platform', () => {
      const originalPlatform = process.platform;

      afterEach(() => {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      });

      it('should return EventKit and AppleScript on darwin', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        const result = PlatformDetector.getAvailableIntegrations('desktop');

        expect(result.calendar.eventkit).toBe(true);
        expect(result.calendar.native).toBe(false);
        expect(result.reminders.applescript).toBe(true);
        expect(result.reminders.native).toBe(false);
      });

      it('should include Google Calendar when configured on desktop', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        const config = createConfig(true);
        const result = PlatformDetector.getAvailableIntegrations('desktop', config);

        expect(result.calendar.google).toBe(true);
        expect(result.calendar.eventkit).toBe(true);
      });

      it('should not return EventKit on non-darwin platform', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

        const result = PlatformDetector.getAvailableIntegrations('desktop');

        expect(result.calendar.eventkit).toBe(false);
        expect(result.reminders.applescript).toBe(false);
      });
    });

    describe('Web platform', () => {
      it('should only support Google Calendar on web', () => {
        const config = createConfig(true);
        const result = PlatformDetector.getAvailableIntegrations('web', config);

        expect(result.calendar.google).toBe(true);
        expect(result.calendar.eventkit).toBe(false);
        expect(result.calendar.native).toBe(false);
        expect(result.reminders.applescript).toBe(false);
        expect(result.reminders.native).toBe(false);
      });

      it('should return no integrations when Google not configured', () => {
        const config = createConfig(false);
        const result = PlatformDetector.getAvailableIntegrations('web', config);

        expect(result.calendar.google).toBe(false);
        expect(result.calendar.eventkit).toBe(false);
        expect(result.calendar.native).toBe(false);
        expect(result.reminders.applescript).toBe(false);
        expect(result.reminders.native).toBe(false);
      });

      it('should handle undefined config on web', () => {
        const result = PlatformDetector.getAvailableIntegrations('web', undefined);

        expect(result.calendar.google).toBe(false);
        expect(result.calendar.eventkit).toBe(false);
        expect(result.calendar.native).toBe(false);
      });
    });

    describe('Unknown platform', () => {
      it('should return minimal integrations for unknown platform', () => {
        const result = PlatformDetector.getAvailableIntegrations('unknown');

        expect(result.calendar.google).toBe(false);
        expect(result.calendar.eventkit).toBe(false);
        expect(result.calendar.native).toBe(false);
        expect(result.reminders.applescript).toBe(false);
        expect(result.reminders.native).toBe(false);
      });

      it('should allow Google Calendar when configured', () => {
        const config = createConfig(true);
        const result = PlatformDetector.getAvailableIntegrations('unknown', config);

        expect(result.calendar.google).toBe(true);
        expect(result.calendar.eventkit).toBe(false);
        expect(result.calendar.native).toBe(false);
      });
    });

    describe('Config edge cases', () => {
      it('should handle config with missing integrations section', () => {
        const partialConfig = {
          version: '1.0.0',
        } as unknown as UserConfig;

        const result = PlatformDetector.getAvailableIntegrations('ios', partialConfig);

        expect(result.calendar.google).toBe(false);
        expect(result.calendar.native).toBe(true);
      });

      it('should handle config with missing googleCalendar section', () => {
        const partialConfig = {
          version: '1.0.0',
          integrations: {},
        } as unknown as UserConfig;

        const result = PlatformDetector.getAvailableIntegrations('macos', partialConfig);

        expect(result.calendar.google).toBe(false);
      });

      it('should handle config with undefined enabled flag', () => {
        const partialConfig = {
          version: '1.0.0',
          integrations: {
            googleCalendar: {
              defaultCalendar: 'primary',
            },
          },
        } as unknown as UserConfig;

        const result = PlatformDetector.getAvailableIntegrations('web', partialConfig);

        expect(result.calendar.google).toBe(false);
      });
    });

    describe('Cross-platform consistency', () => {
      it('should always exclude AppleScript on non-macOS platforms', () => {
        const platforms: Platform[] = ['ios', 'ipados', 'web', 'unknown'];

        platforms.forEach((platform) => {
          const result = PlatformDetector.getAvailableIntegrations(platform);
          expect(result.reminders.applescript).toBe(false);
        });
      });

      it('should always exclude native calendar on non-mobile platforms', () => {
        const platforms: Platform[] = ['macos', 'desktop', 'web', 'unknown'];

        platforms.forEach((platform) => {
          const result = PlatformDetector.getAvailableIntegrations(platform);
          expect(result.calendar.native).toBe(false);
        });
      });

      it('should always exclude EventKit on mobile platforms', () => {
        const platforms: Platform[] = ['ios', 'ipados'];

        platforms.forEach((platform) => {
          const result = PlatformDetector.getAvailableIntegrations(platform);
          expect(result.calendar.eventkit).toBe(false);
        });
      });

      it('should respect Google Calendar config across all platforms', () => {
        const config = createConfig(true);
        const platforms: Platform[] = ['ios', 'ipados', 'macos', 'desktop', 'web', 'unknown'];

        platforms.forEach((platform) => {
          const result = PlatformDetector.getAvailableIntegrations(platform, config);
          expect(result.calendar.google).toBe(true);
        });
      });
    });
  });
});
