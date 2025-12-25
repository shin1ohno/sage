/**
 * Platform Detector Unit Tests
 * Requirements: 7.1, 7.2, 7.3
 *
 * 実装:
 * - desktop_mcp: Claude Desktop/Code（AppleScript統合）
 * - remote_mcp: iOS/iPadOS/Web（Remote MCPサーバー経由）
 */

import { PlatformDetector } from '../../src/platform/detector.js';
import { CAPABILITY_NAMES, INTEGRATION_NAMES } from '../../src/platform/types.js';

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
});
