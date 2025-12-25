/**
 * Notion MCP Service Unit Tests
 * Requirements: 8.1-8.5
 */

import { NotionMCPService } from '../../src/integrations/notion-mcp.js';
import type { NotionPageRequest } from '../../src/integrations/notion-mcp.js';

describe('NotionMCPService', () => {
  let service: NotionMCPService;

  beforeEach(() => {
    service = new NotionMCPService();
  });

  describe('isAvailable', () => {
    it('should return true when in MCP environment', async () => {
      const originalEnv = process.env.MCP_SERVER;
      process.env.MCP_SERVER = 'true';

      const available = await service.isAvailable();
      expect(available).toBe(true);

      process.env.MCP_SERVER = originalEnv;
    });

    it('should return false when not in MCP environment', async () => {
      const originalEnv = process.env.MCP_SERVER;
      delete process.env.MCP_SERVER;

      const available = await service.isAvailable();
      expect(available).toBe(false);

      process.env.MCP_SERVER = originalEnv;
    });
  });

  describe('createPage', () => {
    it('should return error when not available', async () => {
      const originalEnv = process.env.MCP_SERVER;
      delete process.env.MCP_SERVER;

      const request: NotionPageRequest = {
        databaseId: 'test-db-id',
        title: 'Test Task',
        properties: {},
      };

      const result = await service.createPage(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('利用できません');

      process.env.MCP_SERVER = originalEnv;
    });

    it('should create page request with correct format', () => {
      const request: NotionPageRequest = {
        databaseId: 'test-db-id',
        title: 'Test Task',
        properties: {
          Priority: 'P1',
          DueDate: '2025-01-20',
        },
      };

      const mcpRequest = service.buildMCPRequest(request);

      expect(mcpRequest.method).toBe('tools/call');
      expect(mcpRequest.params.name).toBe('create_page');
      expect(mcpRequest.params.arguments.database_id).toBe('test-db-id');
    });

    it('should include content blocks when provided', () => {
      const request: NotionPageRequest = {
        databaseId: 'test-db-id',
        title: 'Test Task',
        properties: {},
        content: [
          { type: 'paragraph', content: 'Task description' },
          { type: 'bulleted_list_item', content: 'Step 1' },
        ],
      };

      const mcpRequest = service.buildMCPRequest(request);

      expect(mcpRequest.params.arguments.children).toHaveLength(2);
    });
  });

  describe('generateFallbackTemplate', () => {
    it('should generate Notion-ready template', () => {
      const template = service.generateFallbackTemplate({
        title: 'Test Task',
        priority: 'P1',
        deadline: '2025-01-20',
        stakeholders: ['Alice', 'Bob'],
        estimatedMinutes: 60,
      });

      expect(template).toContain('Test Task');
      expect(template).toContain('P1');
      expect(template).toContain('2025-01-20');
      expect(template).toContain('Alice');
      expect(template).toContain('60');
    });

    it('should handle minimal task info', () => {
      const template = service.generateFallbackTemplate({
        title: 'Simple Task',
      });

      expect(template).toContain('Simple Task');
    });
  });

  describe('buildNotionProperties', () => {
    it('should build Notion property format', () => {
      const properties = service.buildNotionProperties({
        title: 'Test',
        priority: 'P0',
        deadline: '2025-01-20',
        stakeholders: ['Alice'],
        estimatedMinutes: 90,
      });

      expect(properties.Name).toBeDefined();
      expect(properties.Name.title[0].text.content).toBe('Test');
    });
  });

  describe('shouldSyncToNotion', () => {
    it('should return true for tasks due more than 8 days away', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const shouldSync = service.shouldSyncToNotion(futureDate.toISOString(), 8);
      expect(shouldSync).toBe(true);
    });

    it('should return false for tasks due within 7 days', () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 5);

      const shouldSync = service.shouldSyncToNotion(nearDate.toISOString(), 8);
      expect(shouldSync).toBe(false);
    });

    it('should return false for tasks without deadline', () => {
      const shouldSync = service.shouldSyncToNotion(undefined, 8);
      expect(shouldSync).toBe(false);
    });
  });
});
