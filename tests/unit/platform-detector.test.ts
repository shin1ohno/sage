/**
 * Platform Detector Unit Tests
 * Requirements: 7.1, 7.2, 7.3
 */

import { PlatformDetector } from '../../src/platform/detector.js';

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
        expect.objectContaining({ name: 'file_system', available: true })
      );
      expect(result.capabilities).toContainEqual(
        expect.objectContaining({ name: 'external_process', available: true })
      );
    });

    it('should detect iOS Skills environment', async () => {
      // Mock iOS Skills environment
      delete (global as any).process;
      (global as any).window = {
        claude: {
          reminders: { create: jest.fn() },
          calendar: { getEvents: jest.fn() },
        },
        navigator: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        },
      };
      (global as any).navigator = (global as any).window.navigator;

      const result = await PlatformDetector.detect();

      expect(result.type).toBe('ios_skills');
      expect(result.nativeIntegrations).toContain('reminders');
      expect(result.nativeIntegrations).toContain('calendar');
    });

    it('should detect iPadOS Skills environment', async () => {
      // Mock iPadOS Skills environment
      delete (global as any).process;
      (global as any).window = {
        claude: {
          reminders: { create: jest.fn() },
          calendar: { getEvents: jest.fn() },
        },
        navigator: {
          userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
        },
      };
      (global as any).navigator = (global as any).window.navigator;

      const result = await PlatformDetector.detect();

      expect(result.type).toBe('ipados_skills');
      expect(result.nativeIntegrations).toContain('reminders');
      expect(result.nativeIntegrations).toContain('calendar');
    });

    it('should detect Web Skills environment', async () => {
      // Mock Web Skills environment (no native integrations)
      delete (global as any).process;
      (global as any).window = {
        claude: {},
        navigator: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome',
        },
      };
      (global as any).navigator = (global as any).window.navigator;

      const result = await PlatformDetector.detect();

      expect(result.type).toBe('web_skills');
      expect(result.nativeIntegrations).toHaveLength(0);
    });

    it('should throw error for unsupported platform', async () => {
      // Mock unsupported environment
      delete (global as any).process;
      delete (global as any).window;

      await expect(PlatformDetector.detect()).rejects.toThrow('Unsupported platform');
    });
  });

  describe('getCapabilities', () => {
    it('should return full capabilities for MCP platform', () => {
      const capabilities = PlatformDetector.getCapabilities('desktop_mcp');

      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'file_system', available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'mcp_integration', available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'external_process', available: true })
      );
    });

    it('should return native integration capabilities for iOS Skills', () => {
      const capabilities = PlatformDetector.getCapabilities('ios_skills');

      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'native_reminders', available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'native_calendar', available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'file_system', available: false })
      );
    });

    it('should return limited capabilities for Web Skills', () => {
      const capabilities = PlatformDetector.getCapabilities('web_skills');

      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'session_storage', available: true })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'native_reminders', available: false })
      );
      expect(capabilities).toContainEqual(
        expect.objectContaining({ name: 'native_calendar', available: false })
      );
    });
  });

  describe('getNativeIntegrations', () => {
    it('should return applescript and notion_mcp for MCP platform', () => {
      const integrations = PlatformDetector.getNativeIntegrations('desktop_mcp');

      expect(integrations).toContain('applescript');
      expect(integrations).toContain('notion_mcp');
    });

    it('should return reminders, calendar, and notion_connector for iOS/iPadOS Skills', () => {
      const iOSIntegrations = PlatformDetector.getNativeIntegrations('ios_skills');
      const iPadOSIntegrations = PlatformDetector.getNativeIntegrations('ipados_skills');

      expect(iOSIntegrations).toContain('reminders');
      expect(iOSIntegrations).toContain('calendar');
      expect(iOSIntegrations).toContain('notion_connector');
      expect(iPadOSIntegrations).toContain('reminders');
      expect(iPadOSIntegrations).toContain('calendar');
      expect(iPadOSIntegrations).toContain('notion_connector');
    });

    it('should return empty array for Web Skills', () => {
      const integrations = PlatformDetector.getNativeIntegrations('web_skills');

      expect(integrations).toHaveLength(0);
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

    it('should return iOS-specific feature set for iOS Skills', () => {
      const features = PlatformDetector.getFeatureSet('ios_skills');

      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(true); // iCloud sync
      expect(features.appleReminders).toBe(true); // Native
      expect(features.calendarIntegration).toBe(true); // Native
      expect(features.notionIntegration).toBe(true); // Notion Connector
      expect(features.fileSystemAccess).toBe(false);
    });

    it('should return limited feature set for Web Skills', () => {
      const features = PlatformDetector.getFeatureSet('web_skills');

      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(false); // Session only
      expect(features.appleReminders).toBe(false); // Manual copy
      expect(features.calendarIntegration).toBe(false); // Manual input
      expect(features.notionIntegration).toBe(false);
      expect(features.fileSystemAccess).toBe(false);
    });
  });

  describe('isCapabilityAvailable', () => {
    it('should check capability availability correctly', () => {
      expect(PlatformDetector.isCapabilityAvailable('desktop_mcp', 'file_system')).toBe(true);
      expect(PlatformDetector.isCapabilityAvailable('ios_skills', 'file_system')).toBe(false);
      expect(PlatformDetector.isCapabilityAvailable('ios_skills', 'native_reminders')).toBe(true);
      expect(PlatformDetector.isCapabilityAvailable('web_skills', 'native_reminders')).toBe(false);
    });
  });

  describe('requiresPermission', () => {
    it('should identify capabilities requiring permission', () => {
      const capabilities = PlatformDetector.getCapabilities('ios_skills');
      const remindersCapability = capabilities.find((c) => c.name === 'native_reminders');
      const calendarCapability = capabilities.find((c) => c.name === 'native_calendar');

      expect(remindersCapability?.requiresPermission).toBe(true);
      expect(calendarCapability?.requiresPermission).toBe(true);
    });

    it('should identify capabilities not requiring permission', () => {
      const capabilities = PlatformDetector.getCapabilities('desktop_mcp');
      const fileSystemCapability = capabilities.find((c) => c.name === 'file_system');

      expect(fileSystemCapability?.requiresPermission).toBe(false);
    });
  });

  describe('hasFallback', () => {
    it('should identify capabilities with fallback options', () => {
      const capabilities = PlatformDetector.getCapabilities('web_skills');
      const remindersCapability = capabilities.find((c) => c.name === 'native_reminders');

      expect(remindersCapability?.fallbackAvailable).toBe(true); // Manual copy
    });

    it('should return true for capability with fallback', () => {
      expect(PlatformDetector.hasFallback('web_skills', 'native_reminders')).toBe(true);
      expect(PlatformDetector.hasFallback('desktop_mcp', 'native_reminders')).toBe(true);
    });

    it('should return false for unknown capability', () => {
      expect(PlatformDetector.hasFallback('desktop_mcp', 'unknown_capability')).toBe(false);
    });
  });

  describe('requiresPermission', () => {
    it('should return true for capabilities requiring permission', () => {
      expect(PlatformDetector.requiresPermission('ios_skills', 'native_reminders')).toBe(true);
      expect(PlatformDetector.requiresPermission('ios_skills', 'native_calendar')).toBe(true);
    });

    it('should return false for capabilities not requiring permission', () => {
      expect(PlatformDetector.requiresPermission('desktop_mcp', 'file_system')).toBe(false);
    });

    it('should return false for unknown capability', () => {
      expect(PlatformDetector.requiresPermission('desktop_mcp', 'unknown_capability')).toBe(false);
    });
  });

  describe('isCapabilityAvailable edge cases', () => {
    it('should return false for unknown capability name', () => {
      expect(PlatformDetector.isCapabilityAvailable('desktop_mcp', 'nonexistent')).toBe(false);
      expect(PlatformDetector.isCapabilityAvailable('ios_skills', 'nonexistent')).toBe(false);
    });
  });

  describe('iPadOS capabilities', () => {
    it('should have same capabilities as iOS', () => {
      const iosCapabilities = PlatformDetector.getCapabilities('ios_skills');
      const ipadosCapabilities = PlatformDetector.getCapabilities('ipados_skills');

      expect(iosCapabilities.length).toBe(ipadosCapabilities.length);
      expect(PlatformDetector.isCapabilityAvailable('ipados_skills', 'native_reminders')).toBe(true);
      expect(PlatformDetector.isCapabilityAvailable('ipados_skills', 'native_calendar')).toBe(true);
    });

    it('should have same feature set as iOS', () => {
      const iosFeatures = PlatformDetector.getFeatureSet('ios_skills');
      const ipadosFeatures = PlatformDetector.getFeatureSet('ipados_skills');

      expect(ipadosFeatures.taskAnalysis).toBe(iosFeatures.taskAnalysis);
      expect(ipadosFeatures.persistentConfig).toBe(iosFeatures.persistentConfig);
      expect(ipadosFeatures.appleReminders).toBe(iosFeatures.appleReminders);
    });
  });
});
