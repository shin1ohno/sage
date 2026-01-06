/**
 * MCP Handler Initialization Tests
 *
 * Tests for MCPHandler initialization methods:
 * - initialize() - load config and initialize services
 * - initializeServices() - create all required service instances
 *
 * Uses mock ConfigLoader to ensure tests are independent and don't rely on external services.
 */

import { createMCPHandler } from '../../src/cli/mcp-handler.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';
import type { UserConfig } from '../../src/types/config.js';

// Mock ConfigLoader
jest.mock('../../src/config/loader.js', () => ({
  ConfigLoader: {
    load: jest.fn(),
    getConfigPath: jest.fn().mockReturnValue('/mock/config/path'),
  },
}));

// Mock hot-reload config to disable hot-reload in tests
jest.mock('../../src/config/hot-reload-config.js', () => ({
  getHotReloadConfig: jest.fn().mockReturnValue({
    disabled: true,
    debounceMs: 1000,
  }),
}));

// Import the mocked module
import { ConfigLoader } from '../../src/config/loader.js';

const mockedConfigLoader = ConfigLoader as jest.Mocked<typeof ConfigLoader>;

/**
 * Create a valid mock UserConfig for testing
 */
function createTestConfig(overrides: Partial<UserConfig> = {}): UserConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

describe('MCPHandler Initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize()', () => {
    it('should initialize with valid config', async () => {
      const mockConfig = createTestConfig();
      mockedConfigLoader.load.mockResolvedValue(mockConfig);

      const handler = await createMCPHandler();

      expect(mockedConfigLoader.load).toHaveBeenCalledTimes(1);
      expect(handler).toBeDefined();
      expect(typeof handler.handleRequest).toBe('function');
      expect(typeof handler.listTools).toBe('function');
    });

    it('should handle config load failure gracefully', async () => {
      mockedConfigLoader.load.mockRejectedValue(new Error('Config file not found'));

      // Should not throw, should handle gracefully
      const handler = await createMCPHandler();

      expect(mockedConfigLoader.load).toHaveBeenCalledTimes(1);
      expect(handler).toBeDefined();
      // Handler should still be functional even without config
      expect(typeof handler.handleRequest).toBe('function');
    });

    it('should handle null config gracefully', async () => {
      mockedConfigLoader.load.mockResolvedValue(null as unknown as UserConfig);

      const handler = await createMCPHandler();

      expect(mockedConfigLoader.load).toHaveBeenCalledTimes(1);
      expect(handler).toBeDefined();
      expect(typeof handler.handleRequest).toBe('function');
    });

    it('should skip if already initialized', async () => {
      const mockConfig = createTestConfig();
      mockedConfigLoader.load.mockResolvedValue(mockConfig);

      const handler = await createMCPHandler();

      // Calling handleRequest triggers initialization check internally
      // The handler is created fresh each time via createMCPHandler,
      // so we test that the same instance doesn't reload config
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/list',
        params: {},
      };

      // Multiple requests should not trigger multiple config loads
      await handler.handleRequest(request);
      await handler.handleRequest(request);

      // ConfigLoader.load should only be called once during createMCPHandler
      expect(mockedConfigLoader.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('initializeServices()', () => {
    it('should create all required services with valid config', async () => {
      const mockConfig = createTestConfig({
        integrations: {
          appleReminders: {
            enabled: true,
            threshold: 7,
            unit: 'days',
            defaultList: 'Test List',
            lists: {},
          },
          notion: {
            enabled: true,
            threshold: 14,
            unit: 'days',
            databaseId: 'test-db-id',
          },
          googleCalendar: {
            enabled: false,
            defaultCalendar: 'primary',
            conflictDetection: true,
            lookAheadDays: 14,
          },
        },
      });
      mockedConfigLoader.load.mockResolvedValue(mockConfig);

      const handler = await createMCPHandler();

      // Verify handler is functional by listing tools
      const tools = handler.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // Verify specific tools that require services are available
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('analyze_tasks');
      expect(toolNames).toContain('set_reminder');
      expect(toolNames).toContain('find_available_slots');
      expect(toolNames).toContain('list_calendar_events');
      expect(toolNames).toContain('list_todos');
      expect(toolNames).toContain('sync_to_notion');
    });

    it('should handle partial config for services', async () => {
      const mockConfig = createTestConfig({
        integrations: {
          appleReminders: {
            enabled: false,
            threshold: 7,
            unit: 'days',
            defaultList: '',
            lists: {},
          },
          notion: {
            enabled: false,
            threshold: 7,
            unit: 'days',
            databaseId: '',
          },
          googleCalendar: {
            enabled: false,
            defaultCalendar: 'primary',
            conflictDetection: true,
            lookAheadDays: 14,
          },
        },
      });
      mockedConfigLoader.load.mockResolvedValue(mockConfig);

      const handler = await createMCPHandler();

      // Handler should still be functional
      expect(handler).toBeDefined();
      const tools = handler.listTools();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('handler functionality after initialization', () => {
    it('should handle tools/list request after initialization', async () => {
      const mockConfig = createTestConfig();
      mockedConfigLoader.load.mockResolvedValue(mockConfig);

      const handler = await createMCPHandler();
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    });

    it('should handle initialize MCP request', async () => {
      const mockConfig = createTestConfig();
      mockedConfigLoader.load.mockResolvedValue(mockConfig);

      const handler = await createMCPHandler();
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();

      const result = response.result as {
        protocolVersion: string;
        serverInfo: { name: string; version: string };
        capabilities: Record<string, unknown>;
      };
      expect(result.protocolVersion).toBeDefined();
      expect(result.serverInfo.name).toBe('sage');
    });

    it('should return setup required for tools when no config', async () => {
      mockedConfigLoader.load.mockResolvedValue(null as unknown as UserConfig);

      const handler = await createMCPHandler();
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'analyze_tasks',
          arguments: {
            tasks: [{ title: 'Test task' }],
          },
        },
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      // Should return result (not error) with setup required message
      expect(response.result).toBeDefined();
    });
  });
});
