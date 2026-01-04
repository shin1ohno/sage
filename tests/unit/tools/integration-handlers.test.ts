/**
 * Integration Handlers Unit Tests
 *
 * Tests for integration-related tool handlers (Notion sync, config updates)
 * using dependency injection via Context objects.
 */

import {
  handleSyncToNotion,
  handleUpdateConfig,
} from '../../../src/tools/integrations/handlers.js';
import { ConfigLoader } from '../../../src/config/loader.js';
import {
  createMockIntegrationToolsContext,
  createMockNotionMCPService,
  DEFAULT_TEST_CONFIG,
  NOTION_ENABLED_CONFIG,
} from '../../helpers/index.js';

// Mock ConfigLoader
jest.mock('../../../src/config/loader.js', () => ({
  ConfigLoader: {
    save: jest.fn(),
  },
}));

// Mock config update validation
jest.mock('../../../src/config/update-validation.js', () => ({
  validateConfigUpdate: jest.fn(),
  applyConfigUpdates: jest.fn(),
}));

import { validateConfigUpdate, applyConfigUpdates } from '../../../src/config/update-validation.js';

describe('Integration Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSyncToNotion', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockIntegrationToolsContext({
        config: null,
      });

      const result = await handleSyncToNotion(ctx, {
        taskTitle: 'Test Task',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定されていません');
    });

    it('should return error when Notion is not enabled', async () => {
      const ctx = createMockIntegrationToolsContext({
        config: DEFAULT_TEST_CONFIG, // Notion disabled in default config
      });

      const result = await handleSyncToNotion(ctx, {
        taskTitle: 'Test Task',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('Notion統合が有効になっていません');
    });

    it('should sync to Notion successfully via MCP', async () => {
      const mockNotionService = createMockNotionMCPService({
        isAvailable: jest.fn().mockResolvedValue(true),
        createPage: jest.fn().mockResolvedValue({
          success: true,
          pageId: 'page-123',
          pageUrl: 'https://notion.so/page-123',
        }),
        buildNotionProperties: jest.fn().mockReturnValue({
          Name: { title: [{ text: { content: 'Test Task' } }] },
        }),
      });

      const ctx = createMockIntegrationToolsContext({
        config: NOTION_ENABLED_CONFIG,
        notionService: mockNotionService as unknown as any,
      });

      const result = await handleSyncToNotion(ctx, {
        taskTitle: 'Test Task',
        priority: 'P1',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.method).toBe('mcp');
      expect(response.pageId).toBe('page-123');
      expect(mockNotionService.createPage).toHaveBeenCalled();
    });

    it('should return fallback template when MCP is not available', async () => {
      const mockNotionService = createMockNotionMCPService({
        isAvailable: jest.fn().mockResolvedValue(false),
        buildNotionProperties: jest.fn().mockReturnValue({}),
        generateFallbackTemplate: jest.fn().mockReturnValue('## Test Task\n- Priority: P1'),
      });

      const ctx = createMockIntegrationToolsContext({
        config: NOTION_ENABLED_CONFIG,
        notionService: mockNotionService as unknown as any,
      });

      const result = await handleSyncToNotion(ctx, {
        taskTitle: 'Test Task',
        priority: 'P1',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.method).toBe('fallback');
      expect(response.fallbackText).toBeDefined();
    });

    it('should call initializeServices when notionService is null', async () => {
      const mockNotionService = createMockNotionMCPService({
        isAvailable: jest.fn().mockResolvedValue(true),
        createPage: jest.fn().mockResolvedValue({
          success: true,
          pageId: 'page-123',
          pageUrl: 'https://notion.so/page-123',
        }),
        buildNotionProperties: jest.fn().mockReturnValue({}),
      });

      const initializeServicesMock = jest.fn();
      const getNotionServiceMock = jest.fn()
        .mockReturnValueOnce(null)
        .mockReturnValue(mockNotionService);

      const ctx = createMockIntegrationToolsContext({
        config: NOTION_ENABLED_CONFIG,
        getNotionService: getNotionServiceMock,
        initializeServices: initializeServicesMock,
      });

      await handleSyncToNotion(ctx, { taskTitle: 'Test Task' });

      expect(initializeServicesMock).toHaveBeenCalledWith(NOTION_ENABLED_CONFIG);
    });

    it('should include all task properties in Notion request', async () => {
      const mockNotionService = createMockNotionMCPService({
        isAvailable: jest.fn().mockResolvedValue(true),
        createPage: jest.fn().mockResolvedValue({
          success: true,
          pageId: 'page-123',
        }),
        buildNotionProperties: jest.fn().mockReturnValue({}),
      });

      const ctx = createMockIntegrationToolsContext({
        config: NOTION_ENABLED_CONFIG,
        notionService: mockNotionService as unknown as any,
      });

      await handleSyncToNotion(ctx, {
        taskTitle: 'Test Task',
        description: 'A test description',
        priority: 'P0',
        dueDate: '2025-01-15',
        stakeholders: ['Manager', 'Team Lead'],
        estimatedMinutes: 120,
      });

      expect(mockNotionService.buildNotionProperties).toHaveBeenCalledWith({
        title: 'Test Task',
        priority: 'P0',
        deadline: '2025-01-15',
        stakeholders: ['Manager', 'Team Lead'],
        estimatedMinutes: 120,
        description: 'A test description',
      });
    });

    it('should return fallback when MCP call fails', async () => {
      const mockNotionService = createMockNotionMCPService({
        isAvailable: jest.fn().mockResolvedValue(true),
        createPage: jest.fn().mockResolvedValue({
          success: false,
          error: 'API rate limit exceeded',
        }),
        buildNotionProperties: jest.fn().mockReturnValue({}),
        generateFallbackTemplate: jest.fn().mockReturnValue('## Task Template'),
      });

      const ctx = createMockIntegrationToolsContext({
        config: NOTION_ENABLED_CONFIG,
        notionService: mockNotionService as unknown as any,
      });

      const result = await handleSyncToNotion(ctx, {
        taskTitle: 'Test Task',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.method).toBe('fallback');
      expect(response.error).toBe('API rate limit exceeded');
    });
  });

  describe('handleUpdateConfig', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockIntegrationToolsContext({
        config: null,
      });

      const result = await handleUpdateConfig(ctx, {
        section: 'user',
        updates: { name: 'New Name' },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
    });

    it('should return error when validation fails', async () => {
      (validateConfigUpdate as jest.Mock).mockReturnValue({
        valid: false,
        error: 'Invalid timezone format',
        invalidFields: ['timezone'],
      });

      const ctx = createMockIntegrationToolsContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleUpdateConfig(ctx, {
        section: 'user',
        updates: { timezone: 'invalid' },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('検証に失敗しました');
      expect(response.invalidFields).toContain('timezone');
    });

    it('should update config successfully', async () => {
      const updatedConfig = {
        ...DEFAULT_TEST_CONFIG,
        user: { ...DEFAULT_TEST_CONFIG.user, name: 'New Name' },
      };

      (validateConfigUpdate as jest.Mock).mockReturnValue({ valid: true });
      (applyConfigUpdates as jest.Mock).mockReturnValue(updatedConfig);
      (ConfigLoader.save as jest.Mock).mockResolvedValue(undefined);

      const setConfigMock = jest.fn();
      const ctx = createMockIntegrationToolsContext({
        config: DEFAULT_TEST_CONFIG,
        setConfig: setConfigMock,
      });

      const result = await handleUpdateConfig(ctx, {
        section: 'user',
        updates: { name: 'New Name' },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.section).toBe('user');
      expect(response.updatedFields).toContain('name');
      expect(ConfigLoader.save).toHaveBeenCalledWith(updatedConfig);
      expect(setConfigMock).toHaveBeenCalledWith(updatedConfig);
    });

    it('should re-initialize services when integrations section is updated', async () => {
      const updatedConfig = {
        ...DEFAULT_TEST_CONFIG,
        integrations: {
          ...DEFAULT_TEST_CONFIG.integrations,
          notion: { ...DEFAULT_TEST_CONFIG.integrations.notion, enabled: true },
        },
      };

      (validateConfigUpdate as jest.Mock).mockReturnValue({ valid: true });
      (applyConfigUpdates as jest.Mock).mockReturnValue(updatedConfig);
      (ConfigLoader.save as jest.Mock).mockResolvedValue(undefined);

      const initializeServicesMock = jest.fn();
      const ctx = createMockIntegrationToolsContext({
        config: DEFAULT_TEST_CONFIG,
        initializeServices: initializeServicesMock,
      });

      await handleUpdateConfig(ctx, {
        section: 'integrations',
        updates: { notion: { enabled: true } },
      });

      expect(initializeServicesMock).toHaveBeenCalledWith(updatedConfig);
    });

    it('should not re-initialize services for non-integration sections', async () => {
      const updatedConfig = {
        ...DEFAULT_TEST_CONFIG,
        preferences: { ...DEFAULT_TEST_CONFIG.preferences, language: 'en' as const },
      };

      (validateConfigUpdate as jest.Mock).mockReturnValue({ valid: true });
      (applyConfigUpdates as jest.Mock).mockReturnValue(updatedConfig);
      (ConfigLoader.save as jest.Mock).mockResolvedValue(undefined);

      const initializeServicesMock = jest.fn();
      const ctx = createMockIntegrationToolsContext({
        config: DEFAULT_TEST_CONFIG,
        initializeServices: initializeServicesMock,
      });

      await handleUpdateConfig(ctx, {
        section: 'preferences',
        updates: { language: 'en' },
      });

      expect(initializeServicesMock).not.toHaveBeenCalled();
    });

    it('should handle save errors gracefully', async () => {
      (validateConfigUpdate as jest.Mock).mockReturnValue({ valid: true });
      (applyConfigUpdates as jest.Mock).mockReturnValue(DEFAULT_TEST_CONFIG);
      (ConfigLoader.save as jest.Mock).mockRejectedValue(new Error('Write permission denied'));

      const ctx = createMockIntegrationToolsContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleUpdateConfig(ctx, {
        section: 'user',
        updates: { name: 'New Name' },
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定の更新に失敗しました');
    });
  });
});
