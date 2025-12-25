/**
 * Platform Adapter Unit Tests
 * Requirements: 7.3, 7.4, 7.5
 */

import { MCPAdapter } from '../../src/platform/adapters/mcp-adapter.js';
import { PlatformAdapterFactory } from '../../src/platform/adapter-factory.js';

describe('MCPAdapter', () => {
  let adapter: MCPAdapter;

  beforeEach(() => {
    adapter = new MCPAdapter();
  });

  describe('getPlatformInfo', () => {
    it('should return desktop_mcp type', () => {
      const info = adapter.getPlatformInfo();
      expect(info.type).toBe('desktop_mcp');
    });

    it('should include file system capability', () => {
      const info = adapter.getPlatformInfo();
      expect(info.capabilities).toContainEqual(
        expect.objectContaining({ name: 'file_system', available: true })
      );
    });

    it('should include applescript integration', () => {
      const info = adapter.getPlatformInfo();
      expect(info.integrations).toContain('applescript');
    });
  });

  describe('getAvailableFeatures', () => {
    it('should return full feature set', () => {
      const features = adapter.getAvailableFeatures();
      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(true);
      expect(features.appleReminders).toBe(true);
      expect(features.calendarIntegration).toBe(true);
      expect(features.notionIntegration).toBe(true);
      expect(features.fileSystemAccess).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });
  });

  describe('isCapabilityAvailable', () => {
    it('should return true for file_system', () => {
      expect(adapter.isCapabilityAvailable('file_system')).toBe(true);
    });

    it('should return false for unknown capability', () => {
      expect(adapter.isCapabilityAvailable('unknown_capability')).toBe(false);
    });
  });
});

describe('PlatformAdapterFactory', () => {
  const originalProcess = global.process;

  afterEach(() => {
    global.process = originalProcess;
    jest.restoreAllMocks();
  });

  describe('create', () => {
    it('should create MCPAdapter for MCP environment', async () => {
      const mockProcess = {
        ...process,
        env: { ...process.env, MCP_SERVER: 'true' },
        platform: 'darwin' as NodeJS.Platform,
      };
      global.process = mockProcess as NodeJS.Process;

      const adapter = await PlatformAdapterFactory.create();

      expect(adapter).toBeInstanceOf(MCPAdapter);
      expect(adapter.getPlatformInfo().type).toBe('desktop_mcp');
    });

    it('should create MCPAdapter for remote_mcp environment (non-MCP)', async () => {
      // When not in MCP environment, it returns remote_mcp which uses MCPAdapter
      const mockProcess = {
        ...process,
        env: { ...process.env, MCP_SERVER: undefined },
        platform: 'darwin' as NodeJS.Platform,
      };
      global.process = mockProcess as NodeJS.Process;

      const adapter = await PlatformAdapterFactory.create();

      // Remote MCP clients also use MCPAdapter through the server
      expect(adapter).toBeInstanceOf(MCPAdapter);
    });
  });

  describe('createForPlatform', () => {
    it('should create MCPAdapter for desktop_mcp', () => {
      const adapter = PlatformAdapterFactory.createForPlatform('desktop_mcp');
      expect(adapter).toBeInstanceOf(MCPAdapter);
    });

    it('should create MCPAdapter for remote_mcp', () => {
      const adapter = PlatformAdapterFactory.createForPlatform('remote_mcp');
      expect(adapter).toBeInstanceOf(MCPAdapter);
    });

    it('should throw error for unsupported platform type', () => {
      expect(() => {
        PlatformAdapterFactory.createForPlatform('unsupported' as any);
      }).toThrow('Unsupported platform type');
    });
  });
});
