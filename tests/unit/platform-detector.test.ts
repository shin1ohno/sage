/**
 * Platform Detector Unit Tests
 * Requirements: 7.1, 7.2, 7.3, 7.4, 1.1-1.5 (platform-adaptive-integration)
 *
 * 実装:
 * - desktop_mcp: Claude Desktop/Code（AppleScript統合）
 * - remote_mcp: iOS/iPadOS/Web（Remote MCPサーバー経由）
 */

import { PlatformDetector } from '../../src/platform/detector.js';
import { CAPABILITY_NAMES, INTEGRATION_NAMES } from '../../src/platform/types.js';
import type { ClientInfo, ClientCapabilities } from '../../src/types/platform.js';
import type { UserConfig } from '../../src/types/config.js';

// Extend global to include window for browser simulation
declare global {
  // eslint-disable-next-line no-var
  var window: any;
  // eslint-disable-next-line no-var
  var navigator: any;
}

describe('PlatformDetector', () => {
  // Store original values
  const originalProcess = global.process;
  const originalWindow = global.window;

  afterEach(() => {
    // Restore original values
    global.process = originalProcess;
    (global as any).window = originalWindow;
    jest.restoreAllMocks();
  });

  describe('detect', () => {
    it('should detect MCP server environment', async () => {
      // Mock MCP environment
      const mockProcess = {
        ...process,
        env: { ...process.env, MCP_SERVER: 'true' },
        platform: 'darwin' as NodeJS.Platform,
      };
      global.process = mockProcess as NodeJS.Process;
      delete (global as any).window;

      const result = await PlatformDetector.detect();

      expect(result.type).toBe('desktop_mcp');
      expect(result.capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.FILE_SYSTEM, available: true })
      );
      expect(result.capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.EXTERNAL_PROCESS, available: true })
      );
    });

    it('should detect remote MCP environment for non-MCP clients', async () => {
      // Mock non-MCP environment (iOS/iPadOS/Web clients connect via Remote MCP)
      const mockProcess = {
        ...process,
        env: { ...process.env, MCP_SERVER: undefined },
        platform: 'darwin' as NodeJS.Platform,
      };
      global.process = mockProcess as NodeJS.Process;
      delete global.process.env.MCP_SERVER;

      const result = await PlatformDetector.detect();

      expect(result.type).toBe('remote_mcp');
      expect(result.capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.REMOTE_ACCESS, available: true })
      );
      expect(result.capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.CLOUD_STORAGE, available: true })
      );
    });
  });

  describe('getCapabilities', () => {
    it('should return full capabilities for MCP platform', () => {
      const capabilities = PlatformDetector.getCapabilities('desktop_mcp');

      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.FILE_SYSTEM, available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.MCP_INTEGRATION, available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.EXTERNAL_PROCESS, available: true })
      );
    });

    it('should return remote capabilities for remote_mcp platform', () => {
      const capabilities = PlatformDetector.getCapabilities('remote_mcp');

      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.REMOTE_ACCESS, available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: CAPABILITY_NAMES.CLOUD_STORAGE, available: true })
      );
    });
  });

  describe('getIntegrations', () => {
    it('should return applescript and notion_mcp for MCP platform', () => {
      const integrations = PlatformDetector.getIntegrations('desktop_mcp');

      expect(integrations).toContain(INTEGRATION_NAMES.APPLESCRIPT);
      expect(integrations).toContain(INTEGRATION_NAMES.NOTION_MCP);
    });

    it('should return remote_mcp_server for remote_mcp platform', () => {
      const integrations = PlatformDetector.getIntegrations('remote_mcp');

      expect(integrations).toContain(INTEGRATION_NAMES.REMOTE_MCP_SERVER);
    });
  });

  describe('getFeatureSet', () => {
    it('should return full feature set for MCP platform', () => {
      const features = PlatformDetector.getFeatureSet('desktop_mcp');

      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(true);
      expect(features.appleReminders).toBe(true);
      expect(features.calendarIntegration).toBe(true);
      expect(features.notionIntegration).toBe(true);
      expect(features.fileSystemAccess).toBe(true);
    });

    it('should return remote feature set for remote_mcp platform', () => {
      const features = PlatformDetector.getFeatureSet('remote_mcp');

      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(true); // via cloud storage
      expect(features.appleReminders).toBe(true); // via Remote MCP Server
      expect(features.calendarIntegration).toBe(true); // via Remote MCP Server
      expect(features.notionIntegration).toBe(true); // via Remote MCP Server
      expect(features.fileSystemAccess).toBe(false);
    });
  });

  describe('isCapabilityAvailable', () => {
    it('should check capability availability correctly', () => {
      expect(
        PlatformDetector.isCapabilityAvailable('desktop_mcp', CAPABILITY_NAMES.FILE_SYSTEM)
      ).toBe(true);
      expect(
        PlatformDetector.isCapabilityAvailable('remote_mcp', CAPABILITY_NAMES.FILE_SYSTEM)
      ).toBe(false);
      expect(
        PlatformDetector.isCapabilityAvailable('remote_mcp', CAPABILITY_NAMES.REMOTE_ACCESS)
      ).toBe(true);
      expect(
        PlatformDetector.isCapabilityAvailable('desktop_mcp', CAPABILITY_NAMES.REMOTE_ACCESS)
      ).toBe(false);
    });

    it('should return false for unknown capability name', () => {
      expect(PlatformDetector.isCapabilityAvailable('desktop_mcp', 'nonexistent')).toBe(false);
      expect(PlatformDetector.isCapabilityAvailable('remote_mcp', 'nonexistent')).toBe(false);
    });
  });

  describe('requiresPermission', () => {
    it('should return true for capabilities requiring permission', () => {
      expect(PlatformDetector.requiresPermission('remote_mcp', CAPABILITY_NAMES.REMOTE_ACCESS)).toBe(
        true
      );
    });

    it('should return false for capabilities not requiring permission', () => {
      expect(PlatformDetector.requiresPermission('desktop_mcp', CAPABILITY_NAMES.FILE_SYSTEM)).toBe(
        false
      );
      expect(PlatformDetector.requiresPermission('remote_mcp', CAPABILITY_NAMES.CLOUD_STORAGE)).toBe(
        false
      );
    });

    it('should return false for unknown capability', () => {
      expect(PlatformDetector.requiresPermission('desktop_mcp', 'unknown_capability')).toBe(false);
    });
  });

  describe('hasFallback', () => {
    it('should return false for capabilities without fallback', () => {
      expect(PlatformDetector.hasFallback('desktop_mcp', CAPABILITY_NAMES.FILE_SYSTEM)).toBe(false);
      expect(PlatformDetector.hasFallback('remote_mcp', CAPABILITY_NAMES.REMOTE_ACCESS)).toBe(false);
    });

    it('should return false for unknown capability', () => {
      expect(PlatformDetector.hasFallback('desktop_mcp', 'unknown_capability')).toBe(false);
    });
  });

  /**
   * Tests for detectPlatform (MCP clientInfo-based detection)
   * Requirements: 1.1-1.5 (platform-adaptive-integration)
   */
  describe('detectPlatform', () => {
    describe('iOS/iPadOS detection (Requirement 1.2)', () => {
      it('should detect iOS platform from clientInfo.name containing "ios"', () => {
        const clientInfo: ClientInfo = { name: 'claude-ios', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('ios');
        expect(result.clientName).toBe('claude-ios');
        expect(result.clientVersion).toBe('1.0.0');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect iPadOS platform from clientInfo.name containing "ipad"', () => {
        const clientInfo: ClientInfo = { name: 'claude-ipad', version: '2.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('ipados');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect iOS from clientInfo.name containing "mobile" with medium confidence', () => {
        const clientInfo: ClientInfo = { name: 'claude-mobile', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('ios');
        expect(result.detectionConfidence).toBe('medium');
      });

      it('should be case-insensitive for iOS detection', () => {
        const clientInfo: ClientInfo = { name: 'Claude-iOS-App', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('ios');
        expect(result.detectionConfidence).toBe('high');
      });
    });

    describe('Desktop/macOS detection (Requirement 1.3)', () => {
      it('should detect desktop platform from clientInfo.name containing "desktop"', () => {
        const clientInfo: ClientInfo = { name: 'claude-desktop', version: '0.7.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('desktop');
        expect(result.detectionConfidence).toBe('high');
      });

      it('should detect macOS from clientInfo.name containing "claude-code"', () => {
        const clientInfo: ClientInfo = { name: 'claude-code', version: '1.5.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('macos');
        expect(result.detectionConfidence).toBe('medium');
      });
    });

    describe('Web detection (Requirement 1.4)', () => {
      it('should detect web platform from clientInfo.name containing "web"', () => {
        const clientInfo: ClientInfo = { name: 'claude-web', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('web');
        expect(result.detectionConfidence).toBe('high');
      });
    });

    describe('Unknown platform fallback (Requirement 1.5)', () => {
      it('should default to unknown platform for unrecognized client names', () => {
        const clientInfo: ClientInfo = { name: 'unknown-client', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        // Capture console.warn output
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('unknown');
        expect(result.detectionConfidence).toBe('low');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown platform detected')
        );

        warnSpy.mockRestore();
      });

      it('should log warning with client name for unknown platform', () => {
        const clientInfo: ClientInfo = { name: 'some-random-client', version: '0.1.0' };
        const capabilities: ClientCapabilities = {};

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

        PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('some-random-client')
        );

        warnSpy.mockRestore();
      });
    });

    describe('Sampling capability detection', () => {
      it('should detect Sampling support when capabilities.sampling is defined', () => {
        const clientInfo: ClientInfo = { name: 'claude-desktop', version: '1.0.0' };
        const capabilities: ClientCapabilities = { sampling: {} };

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.supportsSampling).toBe(true);
      });

      it('should detect no Sampling support when capabilities.sampling is undefined', () => {
        const clientInfo: ClientInfo = { name: 'claude-desktop', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.supportsSampling).toBe(false);
      });

      it('should detect Sampling support with other capabilities present', () => {
        const clientInfo: ClientInfo = { name: 'claude-ios', version: '2.0.0' };
        const capabilities: ClientCapabilities = {
          sampling: { enabled: true },
          roots: { listChanged: true },
        };

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.supportsSampling).toBe(true);
      });
    });

    describe('Transport hint-based detection', () => {
      it('should detect desktop from stdio transport with generic client name', () => {
        const clientInfo: ClientInfo = { name: 'Anthropic/ClaudeAI', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities, 'stdio');

        expect(result.platform).toBe('desktop');
        expect(result.detectionConfidence).toBe('medium');
      });

      it('should infer iOS from http transport + sampling with generic client name', () => {
        const clientInfo: ClientInfo = { name: 'Anthropic/ClaudeAI', version: '1.0.0' };
        const capabilities: ClientCapabilities = { sampling: {} };

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities, 'http');

        expect(result.platform).toBe('ios');
        expect(result.detectionConfidence).toBe('medium');
        expect(result.supportsSampling).toBe(true);
      });

      it('should keep unknown for http transport without sampling', () => {
        const clientInfo: ClientInfo = { name: 'Anthropic/ClaudeAI', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities, 'http');

        expect(result.platform).toBe('unknown');
        expect(result.detectionConfidence).toBe('low');
        expect(result.supportsSampling).toBe(false);
      });

      it('should not override explicit iOS detection with transport hint', () => {
        const clientInfo: ClientInfo = { name: 'claude-ios', version: '1.0.0' };
        const capabilities: ClientCapabilities = { sampling: {} };

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities, 'http');

        expect(result.platform).toBe('ios');
        expect(result.detectionConfidence).toBe('high'); // high confidence from explicit name
        expect(result.supportsSampling).toBe(true);
      });
    });

    describe('clientInfo extraction (Requirement 1.1)', () => {
      it('should extract clientInfo.name correctly', () => {
        const clientInfo: ClientInfo = { name: 'test-client', version: '1.2.3' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.clientName).toBe('test-client');
      });

      it('should extract clientInfo.version correctly', () => {
        const clientInfo: ClientInfo = { name: 'test-client', version: '3.2.1-beta' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.clientVersion).toBe('3.2.1-beta');
      });

      it('should preserve original client name case in result', () => {
        const clientInfo: ClientInfo = { name: 'Claude-Desktop', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        // Original name should be preserved
        expect(result.clientName).toBe('Claude-Desktop');
        // But detection should be case-insensitive
        expect(result.platform).toBe('desktop');
      });
    });

    describe('Detection priority', () => {
      it('should prioritize iOS over AI detection for "claude-ios-ai"', () => {
        const clientInfo: ClientInfo = { name: 'claude-ios-ai', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('ios');
      });

      it('should prioritize iPadOS over desktop for "ipad-desktop"', () => {
        const clientInfo: ClientInfo = { name: 'ipad-desktop', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('ipados');
      });

      it('should prioritize desktop over web for "desktop-web-app"', () => {
        const clientInfo: ClientInfo = { name: 'desktop-web-app', version: '1.0.0' };
        const capabilities: ClientCapabilities = {};

        const result = PlatformDetector.detectPlatform(clientInfo, capabilities);

        expect(result.platform).toBe('desktop');
      });
    });
  });

  /**
   * Tests for getAvailableIntegrations
   * Requirements: 7.2-7.4 (Platform-specific integrations)
   */
  describe('getAvailableIntegrations', () => {
    // Helper to create minimal config with Google Calendar enabled/disabled
    const createConfig = (googleEnabled: boolean): UserConfig => ({
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      user: { name: 'Test', timezone: 'Asia/Tokyo' },
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
        appleReminders: { enabled: true, threshold: 7, unit: 'days', defaultList: 'Reminders', lists: {} },
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

    describe('iOS/iPadOS integrations (Requirement 7.2)', () => {
      it('should return native calendar and reminders for iOS', () => {
        const integrations = PlatformDetector.getAvailableIntegrations('ios');

        expect(integrations.calendar.native).toBe(true);
        expect(integrations.calendar.eventkit).toBe(false);
        expect(integrations.calendar.google).toBe(false); // No config provided
        expect(integrations.reminders.native).toBe(true);
        expect(integrations.reminders.applescript).toBe(false);
      });

      it('should return native calendar and reminders for iPadOS', () => {
        const integrations = PlatformDetector.getAvailableIntegrations('ipados');

        expect(integrations.calendar.native).toBe(true);
        expect(integrations.calendar.eventkit).toBe(false);
        expect(integrations.reminders.native).toBe(true);
        expect(integrations.reminders.applescript).toBe(false);
      });

      it('should include Google Calendar on iOS when configured', () => {
        const config = createConfig(true);
        const integrations = PlatformDetector.getAvailableIntegrations('ios', config);

        expect(integrations.calendar.google).toBe(true);
        expect(integrations.calendar.native).toBe(true);
      });

      it('should include Google Calendar on iPadOS when configured', () => {
        const config = createConfig(true);
        const integrations = PlatformDetector.getAvailableIntegrations('ipados', config);

        expect(integrations.calendar.google).toBe(true);
        expect(integrations.calendar.native).toBe(true);
      });

      it('should not include Google Calendar on iOS when not configured', () => {
        const config = createConfig(false);
        const integrations = PlatformDetector.getAvailableIntegrations('ios', config);

        expect(integrations.calendar.google).toBe(false);
        expect(integrations.calendar.native).toBe(true);
      });
    });

    describe('macOS/Desktop integrations (Requirement 7.3)', () => {
      it('should return EventKit and AppleScript reminders for macOS on darwin', () => {
        // Ensure we're testing on darwin platform
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        try {
          const integrations = PlatformDetector.getAvailableIntegrations('macos');

          expect(integrations.calendar.eventkit).toBe(true);
          expect(integrations.calendar.native).toBe(false);
          expect(integrations.reminders.applescript).toBe(true);
          expect(integrations.reminders.native).toBe(false);
        } finally {
          Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
      });

      it('should return EventKit and AppleScript reminders for desktop on darwin', () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        try {
          const integrations = PlatformDetector.getAvailableIntegrations('desktop');

          expect(integrations.calendar.eventkit).toBe(true);
          expect(integrations.reminders.applescript).toBe(true);
        } finally {
          Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
      });

      it('should include Google Calendar on macOS when configured', () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        try {
          const config = createConfig(true);
          const integrations = PlatformDetector.getAvailableIntegrations('macos', config);

          expect(integrations.calendar.google).toBe(true);
          expect(integrations.calendar.eventkit).toBe(true);
        } finally {
          Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
      });

      it('should not return EventKit on non-darwin platform for desktop', () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

        try {
          const integrations = PlatformDetector.getAvailableIntegrations('desktop');

          expect(integrations.calendar.eventkit).toBe(false);
          expect(integrations.reminders.applescript).toBe(false);
        } finally {
          Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        }
      });
    });

    describe('Web integrations (Requirement 7.4)', () => {
      it('should only return Google Calendar when configured for web', () => {
        const config = createConfig(true);
        const integrations = PlatformDetector.getAvailableIntegrations('web', config);

        expect(integrations.calendar.google).toBe(true);
        expect(integrations.calendar.eventkit).toBe(false);
        expect(integrations.calendar.native).toBe(false);
        expect(integrations.reminders.applescript).toBe(false);
        expect(integrations.reminders.native).toBe(false);
      });

      it('should return no calendar integrations for web when Google not configured', () => {
        const config = createConfig(false);
        const integrations = PlatformDetector.getAvailableIntegrations('web', config);

        expect(integrations.calendar.google).toBe(false);
        expect(integrations.calendar.eventkit).toBe(false);
        expect(integrations.calendar.native).toBe(false);
      });

      it('should return no reminders integrations for web', () => {
        const config = createConfig(true);
        const integrations = PlatformDetector.getAvailableIntegrations('web', config);

        expect(integrations.reminders.applescript).toBe(false);
        expect(integrations.reminders.native).toBe(false);
      });
    });

    describe('Unknown platform integrations', () => {
      it('should return minimal integrations for unknown platform', () => {
        const integrations = PlatformDetector.getAvailableIntegrations('unknown');

        expect(integrations.calendar.google).toBe(false);
        expect(integrations.calendar.eventkit).toBe(false);
        expect(integrations.calendar.native).toBe(false);
        expect(integrations.reminders.applescript).toBe(false);
        expect(integrations.reminders.native).toBe(false);
      });

      it('should allow Google Calendar for unknown platform when configured', () => {
        const config = createConfig(true);
        const integrations = PlatformDetector.getAvailableIntegrations('unknown', config);

        expect(integrations.calendar.google).toBe(true);
        expect(integrations.calendar.eventkit).toBe(false);
        expect(integrations.calendar.native).toBe(false);
      });
    });

    describe('Config handling', () => {
      it('should handle undefined config', () => {
        const integrations = PlatformDetector.getAvailableIntegrations('ios', undefined);

        expect(integrations.calendar.google).toBe(false);
        expect(integrations.calendar.native).toBe(true);
        expect(integrations.reminders.native).toBe(true);
      });

      it('should handle config with missing integrations section', () => {
        const partialConfig = {
          version: '1.0.0',
        } as unknown as UserConfig;

        const integrations = PlatformDetector.getAvailableIntegrations('ios', partialConfig);

        expect(integrations.calendar.google).toBe(false);
        expect(integrations.calendar.native).toBe(true);
      });

      it('should handle config with missing googleCalendar section', () => {
        const partialConfig = {
          version: '1.0.0',
          integrations: {},
        } as unknown as UserConfig;

        const integrations = PlatformDetector.getAvailableIntegrations('macos', partialConfig);

        expect(integrations.calendar.google).toBe(false);
      });
    });
  });
});
