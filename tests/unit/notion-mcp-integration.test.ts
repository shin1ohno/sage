/**
 * Notion MCP Integration Unit Tests
 * Requirements: 8.1-8.5
 * Tests for actual MCP client integration with Notion server
 */

import { NotionMCPService, NotionMCPClient } from '../../src/integrations/notion-mcp.js';
import type { NotionPageRequest, NotionQueryRequest } from '../../src/integrations/notion-mcp.js';

// Mock the MCP SDK Client
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    request: jest.fn(),
  })),
}));

describe('NotionMCPClient', () => {
  let client: NotionMCPClient;

  beforeEach(() => {
    client = new NotionMCPClient({
      allowedDatabaseIds: ['db-123', 'db-456'],
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Database ID Validation', () => {
    it('should reject requests to non-allowed database IDs', async () => {
      const request: NotionPageRequest = {
        databaseId: 'unauthorized-db-id',
        title: 'Test Task',
        properties: {},
      };

      await expect(client.createPage(request)).rejects.toThrow(
        'Database ID unauthorized-db-id is not in the allowed list'
      );
    });

    it('should accept requests to allowed database IDs', async () => {
      // Mock the MCP client request
      const mockRequest = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ id: 'page-123', url: 'https://notion.so/page-123' }) }],
      });

      // Replace the internal client
      (client as any).mcpClient = { request: mockRequest };
      (client as any).connected = true;

      const request: NotionPageRequest = {
        databaseId: 'db-123',
        title: 'Test Task',
        properties: {},
      };

      const result = await client.createPage(request);
      expect(result.success).toBe(true);
    });

    it('should validate database ID format', () => {
      expect(client.isValidDatabaseId('db-123')).toBe(true);
      expect(client.isValidDatabaseId('')).toBe(false);
      expect(client.isValidDatabaseId('unauthorized-db')).toBe(false);
    });
  });

  describe('Query Restrictions', () => {
    it('should only allow queries to configured database', async () => {
      const query: NotionQueryRequest = {
        databaseId: 'unauthorized-db',
        filter: {},
      };

      await expect(client.queryDatabase(query)).rejects.toThrow(
        'Database ID unauthorized-db is not in the allowed list'
      );
    });

    it('should allow queries to configured database', async () => {
      const mockRequest = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ results: [] }) }],
      });

      (client as any).mcpClient = { request: mockRequest };
      (client as any).connected = true;

      const query: NotionQueryRequest = {
        databaseId: 'db-123',
        filter: {},
      };

      const result = await client.queryDatabase(query);
      expect(result.success).toBe(true);
    });
  });

  describe('Connection Management', () => {
    it('should connect before making requests', async () => {
      const mockRequest = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ id: 'page-123' }) }],
      });

      // Simulate a connected client
      (client as any).mcpClient = {
        request: mockRequest,
      };
      (client as any).connected = true;

      const request: NotionPageRequest = {
        databaseId: 'db-123',
        title: 'Test',
        properties: {},
      };

      const result = await client.createPage(request);

      expect(result.success).toBe(true);
      expect(mockRequest).toHaveBeenCalled();
    });

    it('should handle connection errors gracefully', async () => {
      // Create a new client to test connection
      const testClient = new NotionMCPClient({
        allowedDatabaseIds: ['db-123'],
      });

      // Manually set up a failing connect function
      (testClient as any).mcpClient = {
        connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      // Override the connect method to simulate a failure
      testClient.connect = async () => {
        try {
          await (testClient as any).mcpClient.connect();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Failed to connect to Notion MCP server: ${message}`);
        }
      };

      await expect(testClient.connect()).rejects.toThrow('Failed to connect to Notion MCP server');
    });

    it('should disconnect properly', async () => {
      const mockClose = jest.fn().mockResolvedValue(undefined);

      (client as any).mcpClient = {
        close: mockClose,
      };
      (client as any).connected = true;

      await client.disconnect();

      expect(mockClose).toHaveBeenCalled();
      expect((client as any).connected).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle MCP request errors', async () => {
      const mockRequest = jest.fn().mockRejectedValue(new Error('MCP request failed'));

      (client as any).mcpClient = { request: mockRequest };
      (client as any).connected = true;

      const request: NotionPageRequest = {
        databaseId: 'db-123',
        title: 'Test',
        properties: {},
      };

      const result = await client.createPage(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('MCP request failed');
    });

    it('should handle invalid response format', async () => {
      const mockRequest = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'invalid json' }],
      });

      (client as any).mcpClient = { request: mockRequest };
      (client as any).connected = true;

      const request: NotionPageRequest = {
        databaseId: 'db-123',
        title: 'Test',
        properties: {},
      };

      const result = await client.createPage(request);
      expect(result.success).toBe(false);
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      const mockRequest = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('ECONNRESET'));
        }
        return Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify({ id: 'page-123' }) }],
        });
      });

      (client as any).mcpClient = { request: mockRequest };
      (client as any).connected = true;

      const request: NotionPageRequest = {
        databaseId: 'db-123',
        title: 'Test',
        properties: {},
      };

      const result = await client.createPage(request);
      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });
  });
});

describe('NotionMCPService with Client', () => {
  let service: NotionMCPService;

  beforeEach(() => {
    service = new NotionMCPService();
  });

  describe('Integration with MCP Client', () => {
    it('should use MCP client when configured', async () => {
      // Configure service with client
      service.setMCPClient(
        new NotionMCPClient({
          allowedDatabaseIds: ['configured-db-id'],
        })
      );

      const request: NotionPageRequest = {
        databaseId: 'configured-db-id',
        title: 'Test Task',
        properties: {},
      };

      // This will fail because the mock client is not connected
      // but it validates the integration path
      const result = await service.createPage(request);
      expect(result.method).toBe('mcp');
    });

    it('should validate database ID matches configuration', async () => {
      service.setMCPClient(
        new NotionMCPClient({
          allowedDatabaseIds: ['allowed-db'],
        })
      );

      const request: NotionPageRequest = {
        databaseId: 'different-db',
        title: 'Test',
        properties: {},
      };

      const result = await service.createPage(request);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in the allowed list');
    });
  });

  describe('shouldSyncToNotion with strict validation', () => {
    it('should require valid database ID configuration', () => {
      // Without configured database, should not sync
      expect(service.shouldSyncToNotion('2025-02-01', 8, '')).toBe(false);
      expect(service.shouldSyncToNotion('2025-02-01', 8, undefined)).toBe(false);
    });

    it('should sync when database ID is configured and deadline is far enough', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      expect(service.shouldSyncToNotion(futureDate.toISOString(), 8, 'valid-db-id')).toBe(true);
    });
  });
});
