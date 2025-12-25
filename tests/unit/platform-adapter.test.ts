/**
 * Platform Adapter Unit Tests
 * Requirements: 7.3, 7.4, 7.5
 */

import { MCPAdapter } from '../../src/platform/adapters/mcp-adapter.js';
import { SkillsAdapteriOS } from '../../src/platform/adapters/skills-adapter-ios.js';
import { SkillsAdapterWeb } from '../../src/platform/adapters/skills-adapter-web.js';
import { PlatformAdapterFactory } from '../../src/platform/adapter-factory.js';

// Extend global for browser simulation
declare global {
  // eslint-disable-next-line no-var
  var window: any;
  // eslint-disable-next-line no-var
  var navigator: any;
}

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
      expect(info.nativeIntegrations).toContain('applescript');
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

    it('should return false for native_reminders', () => {
      expect(adapter.isCapabilityAvailable('native_reminders')).toBe(false);
    });
  });
});

describe('SkillsAdapteriOS', () => {
  let adapter: SkillsAdapteriOS;

  beforeEach(() => {
    adapter = new SkillsAdapteriOS();
  });

  describe('getPlatformInfo', () => {
    it('should return ios_skills type', () => {
      const info = adapter.getPlatformInfo();
      expect(info.type).toBe('ios_skills');
    });

    it('should include native reminders capability', () => {
      const info = adapter.getPlatformInfo();
      expect(info.capabilities).toContainEqual(
        expect.objectContaining({ name: 'native_reminders', available: true })
      );
    });

    it('should include native calendar capability', () => {
      const info = adapter.getPlatformInfo();
      expect(info.capabilities).toContainEqual(
        expect.objectContaining({ name: 'native_calendar', available: true })
      );
    });

    it('should include reminders integration', () => {
      const info = adapter.getPlatformInfo();
      expect(info.nativeIntegrations).toContain('reminders');
      expect(info.nativeIntegrations).toContain('calendar');
    });
  });

  describe('getAvailableFeatures', () => {
    it('should return iOS-specific feature set', () => {
      const features = adapter.getAvailableFeatures();
      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(true);
      expect(features.appleReminders).toBe(true);
      expect(features.calendarIntegration).toBe(true);
      expect(features.notionIntegration).toBe(true); // Notion Connector
      expect(features.fileSystemAccess).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });
  });

  describe('isCapabilityAvailable', () => {
    it('should return true for native_reminders', () => {
      expect(adapter.isCapabilityAvailable('native_reminders')).toBe(true);
    });

    it('should return false for file_system', () => {
      expect(adapter.isCapabilityAvailable('file_system')).toBe(false);
    });
  });
});

describe('SkillsAdapterWeb', () => {
  let adapter: SkillsAdapterWeb;

  beforeEach(() => {
    adapter = new SkillsAdapterWeb();
  });

  describe('getPlatformInfo', () => {
    it('should return web_skills type', () => {
      const info = adapter.getPlatformInfo();
      expect(info.type).toBe('web_skills');
    });

    it('should have no native integrations', () => {
      const info = adapter.getPlatformInfo();
      expect(info.nativeIntegrations).toHaveLength(0);
    });
  });

  describe('getAvailableFeatures', () => {
    it('should return limited feature set', () => {
      const features = adapter.getAvailableFeatures();
      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(false);
      expect(features.appleReminders).toBe(false);
      expect(features.calendarIntegration).toBe(false);
      expect(features.notionIntegration).toBe(false);
      expect(features.fileSystemAccess).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      await expect(adapter.initialize()).resolves.not.toThrow();
    });
  });

  describe('isCapabilityAvailable', () => {
    it('should return true for session_storage', () => {
      expect(adapter.isCapabilityAvailable('session_storage')).toBe(true);
    });

    it('should return false for native capabilities', () => {
      expect(adapter.isCapabilityAvailable('native_reminders')).toBe(false);
      expect(adapter.isCapabilityAvailable('native_calendar')).toBe(false);
      expect(adapter.isCapabilityAvailable('file_system')).toBe(false);
    });
  });
});

describe('PlatformAdapterFactory', () => {
  const originalProcess = global.process;
  const originalWindow = (global as any).window;

  afterEach(() => {
    global.process = originalProcess;
    (global as any).window = originalWindow;
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
      delete (global as any).window;

      const adapter = await PlatformAdapterFactory.create();

      expect(adapter).toBeInstanceOf(MCPAdapter);
      expect(adapter.getPlatformInfo().type).toBe('desktop_mcp');
    });

    it('should create SkillsAdapteriOS for iOS environment', async () => {
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

      const adapter = await PlatformAdapterFactory.create();

      expect(adapter).toBeInstanceOf(SkillsAdapteriOS);
      expect(adapter.getPlatformInfo().type).toBe('ios_skills');
    });

    it('should create SkillsAdapterWeb for Web environment', async () => {
      delete (global as any).process;
      (global as any).window = {
        claude: {},
        navigator: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome',
        },
      };
      (global as any).navigator = (global as any).window.navigator;

      const adapter = await PlatformAdapterFactory.create();

      expect(adapter).toBeInstanceOf(SkillsAdapterWeb);
      expect(adapter.getPlatformInfo().type).toBe('web_skills');
    });

    it('should throw error for unsupported platform', async () => {
      delete (global as any).process;
      delete (global as any).window;

      await expect(PlatformAdapterFactory.create()).rejects.toThrow('Unsupported platform');
    });
  });

  describe('createForPlatform', () => {
    it('should create MCPAdapter for desktop_mcp', () => {
      const adapter = PlatformAdapterFactory.createForPlatform('desktop_mcp');
      expect(adapter).toBeInstanceOf(MCPAdapter);
    });

    it('should create SkillsAdapteriOS for ios_skills', () => {
      const adapter = PlatformAdapterFactory.createForPlatform('ios_skills');
      expect(adapter).toBeInstanceOf(SkillsAdapteriOS);
    });

    it('should create SkillsAdapteriOS for ipados_skills', () => {
      const adapter = PlatformAdapterFactory.createForPlatform('ipados_skills');
      expect(adapter).toBeInstanceOf(SkillsAdapteriOS);
    });

    it('should create SkillsAdapterWeb for web_skills', () => {
      const adapter = PlatformAdapterFactory.createForPlatform('web_skills');
      expect(adapter).toBeInstanceOf(SkillsAdapterWeb);
    });
  });
});
