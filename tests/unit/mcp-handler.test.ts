/**
 * MCP Handler Tests
 * Requirements: 13.1, 13.4, 13.5
 *
 * TDD: RED phase - Writing tests before implementation
 *
 * Tests the MCP request handler that processes JSON-RPC requests
 * for MCP tools over HTTP.
 */

import {
  MCPHandler,
  MCPRequest,
  createMCPHandler,
} from '../../src/cli/mcp-handler.js';

describe('MCPHandler', () => {
  let handler: MCPHandler;

  beforeEach(async () => {
    handler = await createMCPHandler();
  });

  afterEach(async () => {
    if (handler) {
      await handler.shutdown();
    }
  });

  describe('createMCPHandler', () => {
    it('should create an MCP handler instance', async () => {
      const h = await createMCPHandler();
      expect(h).toBeDefined();
      expect(typeof h.handleRequest).toBe('function');
    });

    it('should be able to list available tools', async () => {
      const h = await createMCPHandler();
      const tools = h.listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('handleRequest - tools/list', () => {
    it('should return list of available tools', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response = await handler.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();

      const result = response.result as { tools: Array<{ name: string; description: string }> };
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Check that known tools are present
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('check_setup_status');
      expect(toolNames).toContain('analyze_tasks');
      expect(toolNames).toContain('set_reminder');
      expect(toolNames).toContain('list_todos');
    });

    it('should return tool descriptions', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };

      const response = await handler.handleRequest(request);
      const result = response.result as { tools: Array<{ name: string; description: string }> };

      expect(result.tools[0].name).toBeDefined();
      expect(result.tools[0].description).toBeDefined();
      expect(typeof result.tools[0].description).toBe('string');
    });
  });

  describe('handleRequest - tools/call', () => {
    it('should call check_setup_status tool', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'check_setup_status',
          arguments: {},
        },
      };

      const response = await handler.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(3);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();

      // The result should contain content array (MCP tool response format)
      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
    });

    it('should return error for unknown tool', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {},
        },
      };

      const response = await handler.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(4);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601); // Method not found
      expect(response.error?.message).toContain('not found');
    });

    it('should pass arguments to tools', async () => {
      // Mock a config file to avoid setup requirement
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'start_setup_wizard',
          arguments: {
            mode: 'quick',
          },
        },
      };

      const response = await handler.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(5);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();

      const result = response.result as { content: Array<{ type: string; text: string }> };
      expect(result.content[0].type).toBe('text');

      // Parse the response JSON
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.sessionId).toBeDefined();
    });
  });

  describe('handleRequest - unknown method', () => {
    it('should return error for unknown JSON-RPC method', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 6,
        method: 'unknown/method',
        params: {},
      };

      const response = await handler.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(6);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601); // Method not found
    });
  });

  describe('handleRequest - initialize', () => {
    it('should handle initialize request', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 7,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await handler.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(7);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();

      const result = response.result as {
        protocolVersion: string;
        serverInfo: { name: string; version: string };
        capabilities: Record<string, unknown>;
      };
      expect(result.protocolVersion).toBeDefined();
      expect(result.serverInfo).toBeDefined();
      expect(result.serverInfo.name).toBe('sage');
      expect(result.capabilities).toBeDefined();
    });
  });

  describe('handleRequest - notifications/initialized', () => {
    it('should handle initialized notification', async () => {
      // Notifications don't have id
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: null,
        method: 'notifications/initialized',
        params: {},
      };

      const response = await handler.handleRequest(request);

      // Notifications should return empty response
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBeNull();
      expect(response.error).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing params in tools/call', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {},
      };

      const response = await handler.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32602); // Invalid params
    });

    it('should handle tool execution errors gracefully', async () => {
      // Calling analyze_tasks without config should return a proper error
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'analyze_tasks',
          arguments: {
            tasks: [{ title: 'Test task' }],
          },
        },
      };

      const response = await handler.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(9);
      // Should return result (not error) with error info in content
      expect(response.result).toBeDefined();
    });
  });

  describe('id handling', () => {
    it('should preserve string id', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'string-id-123',
        method: 'tools/list',
        params: {},
      };

      const response = await handler.handleRequest(request);

      expect(response.id).toBe('string-id-123');
    });

    it('should preserve null id for notifications', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: null,
        method: 'notifications/initialized',
        params: {},
      };

      const response = await handler.handleRequest(request);

      expect(response.id).toBeNull();
    });
  });
});

describe('MCPHandler tool definitions', () => {
  let handler: MCPHandler;

  beforeEach(async () => {
    handler = await createMCPHandler();
  });

  afterEach(async () => {
    if (handler) {
      await handler.shutdown();
    }
  });

  describe('listTools', () => {
    it('should include all sage tools', async () => {
      const tools = handler.listTools();
      const toolNames = tools.map((t) => t.name);

      // Core tools
      expect(toolNames).toContain('check_setup_status');
      expect(toolNames).toContain('start_setup_wizard');
      expect(toolNames).toContain('answer_wizard_question');
      expect(toolNames).toContain('save_config');
      expect(toolNames).toContain('analyze_tasks');
      expect(toolNames).toContain('set_reminder');
      expect(toolNames).toContain('find_available_slots');
      expect(toolNames).toContain('sync_to_notion');
      expect(toolNames).toContain('update_config');

      // TODO tools
      expect(toolNames).toContain('list_todos');
      expect(toolNames).toContain('update_task_status');
      expect(toolNames).toContain('sync_tasks');
      expect(toolNames).toContain('detect_duplicates');
    });

    it('should include tool input schemas', async () => {
      const tools = handler.listTools();

      const analyzeTasksTool = tools.find((t) => t.name === 'analyze_tasks');
      expect(analyzeTasksTool).toBeDefined();
      expect(analyzeTasksTool?.inputSchema).toBeDefined();
      expect(analyzeTasksTool?.inputSchema.type).toBe('object');
    });
  });
});
