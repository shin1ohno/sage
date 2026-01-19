/**
 * Tool Parity Test
 *
 * Ensures that tools registered in index.ts (stdio mode) and mcp-handler.ts (remote mode)
 * are kept in sync. This prevents the common mistake of adding a tool to one file but
 * forgetting to add it to the other.
 *
 * Also verifies that Streamable HTTP Transport endpoints are available in remote mode
 * to ensure feature parity with the MCP Streamable HTTP specification.
 *
 * Requirements: FR-8 (Backward Compatibility)
 *
 * If this test fails, you need to add the missing tool(s) to the appropriate file.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Tool Parity', () => {
  // Tools that are intentionally different between modes
  // These are excluded from the parity check
  const EXCLUDED_TOOLS = [
    // Calendar sync tools use different architecture in remote mode
    'set_calendar_source',
    'sync_calendar_sources',
    'get_calendar_sync_status',
    // reload_config is stdio-only (remote mode has hot reload)
    'reload_config',
  ];

  function extractToolsFromIndex(): string[] {
    const indexPath = path.join(__dirname, '../../src/index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');

    const tools: string[] = [];

    // Match server.tool("tool_name", ...) pattern (string literals)
    const stringLiteralRegex = /server\.tool\(\s*\n?\s*["']([^"']+)["']/g;
    let match;
    while ((match = stringLiteralRegex.exec(content)) !== null) {
      tools.push(match[1]);
    }

    // Match server.tool(toolDefinition.name, ...) pattern (shared definitions)
    // Look for patterns like: searchRoomAvailabilityTool.name
    const variableRegex = /server\.tool\(\s*\n?\s*(\w+Tool)\.name/g;
    while ((match = variableRegex.exec(content)) !== null) {
      // Convert variable name to tool name: searchRoomAvailabilityTool -> search_room_availability
      const varName = match[1];
      const toolName = varName
        .replace(/Tool$/, '')
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
      tools.push(toolName);
    }

    return tools.sort();
  }

  function extractToolsFromMcpHandler(): string[] {
    const handlerPath = path.join(__dirname, '../../src/cli/mcp-handler.ts');
    const content = fs.readFileSync(handlerPath, 'utf-8');

    const tools: string[] = [];

    // Match name: 'tool_name' or name: "tool_name" pattern (string literals)
    const stringLiteralRegex = /name:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = stringLiteralRegex.exec(content)) !== null) {
      tools.push(match[1]);
    }

    // Match name: toolDefinition.name pattern (shared definitions)
    const variableRegex = /name:\s*(\w+Tool)\.name/g;
    while ((match = variableRegex.exec(content)) !== null) {
      // Convert variable name to tool name: searchRoomAvailabilityTool -> search_room_availability
      const varName = match[1];
      const toolName = varName
        .replace(/Tool$/, '')
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
      tools.push(toolName);
    }

    return tools.sort();
  }

  test('index.ts and mcp-handler.ts should have matching tools', () => {
    const indexTools = extractToolsFromIndex();
    const handlerTools = extractToolsFromMcpHandler();

    // Filter out excluded tools
    const filteredIndexTools = indexTools.filter(t => !EXCLUDED_TOOLS.includes(t));
    const filteredHandlerTools = handlerTools.filter(t => !EXCLUDED_TOOLS.includes(t));

    // Find missing tools
    const missingInHandler = filteredIndexTools.filter(t => !filteredHandlerTools.includes(t));
    const missingInIndex = filteredHandlerTools.filter(t => !filteredIndexTools.includes(t));

    // Build helpful error message
    let errorMessage = '';
    if (missingInHandler.length > 0) {
      errorMessage += `\nTools in index.ts but missing in mcp-handler.ts:\n  - ${missingInHandler.join('\n  - ')}`;
    }
    if (missingInIndex.length > 0) {
      errorMessage += `\nTools in mcp-handler.ts but missing in index.ts:\n  - ${missingInIndex.join('\n  - ')}`;
    }

    expect(missingInHandler).toEqual([]);
    expect(missingInIndex).toEqual([]);

    if (errorMessage) {
      fail(`Tool parity check failed!${errorMessage}\n\nIf these tools should be different between modes, add them to EXCLUDED_TOOLS in this test.`);
    }
  });

  test('should detect all tools from index.ts', () => {
    const tools = extractToolsFromIndex();
    // Verify we're actually extracting tools
    expect(tools.length).toBeGreaterThan(20);
    expect(tools).toContain('check_setup_status');
    expect(tools).toContain('create_calendar_event');
    expect(tools).toContain('search_room_availability');
  });

  test('should detect all tools from mcp-handler.ts', () => {
    const tools = extractToolsFromMcpHandler();
    // Verify we're actually extracting tools
    expect(tools.length).toBeGreaterThan(20);
    expect(tools).toContain('check_setup_status');
    expect(tools).toContain('create_calendar_event');
    expect(tools).toContain('search_room_availability');
  });

  test('excluded tools should be documented', () => {
    // Ensure excluded tools actually exist in at least one file
    const indexTools = extractToolsFromIndex();
    const handlerTools = extractToolsFromMcpHandler();
    const allTools = [...new Set([...indexTools, ...handlerTools])];

    for (const excludedTool of EXCLUDED_TOOLS) {
      expect(allTools).toContain(excludedTool);
    }
  });
});

/**
 * Streamable HTTP Transport Endpoint Parity Tests
 * Requirement: FR-8 (Backward Compatibility)
 *
 * Verifies that Streamable HTTP Transport endpoints are properly configured
 * in remote mode to ensure feature parity with the MCP specification.
 */
describe('Streamable HTTP Endpoint Parity', () => {
  /**
   * Extract HTTP method handlers from http-server-with-config.ts
   * Returns an object mapping HTTP methods to their handler status
   */
  function extractMCPEndpointHandlers(): {
    methods: string[];
    hasGetHandler: boolean;
    hasPostHandler: boolean;
    hasDeleteHandler: boolean;
    hasOptionsHandler: boolean;
  } {
    const serverPath = path.join(__dirname, '../../src/cli/http-server-with-config.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');

    const methods: string[] = [];

    // Check for GET /mcp handler
    const hasGetHandler = /case\s+['"]GET['"]:|handleMCPGetRequest|streamableHandler\.handleGetRequest/.test(content);
    if (hasGetHandler) methods.push('GET');

    // Check for POST /mcp handler
    const hasPostHandler = /case\s+['"]POST['"]:|handleMCPPostRequest|streamableHandler\.handlePostRequest/.test(content);
    if (hasPostHandler) methods.push('POST');

    // Check for DELETE /mcp handler
    const hasDeleteHandler = /case\s+['"]DELETE['"]:|handleMCPDeleteRequest|streamableHandler\.handleDeleteRequest/.test(content);
    if (hasDeleteHandler) methods.push('DELETE');

    // Check for OPTIONS /mcp handler (CORS preflight)
    const hasOptionsHandler = /method\s*===\s*['"]OPTIONS['"]|OPTIONS/.test(content);
    if (hasOptionsHandler) methods.push('OPTIONS');

    return {
      methods,
      hasGetHandler,
      hasPostHandler,
      hasDeleteHandler,
      hasOptionsHandler,
    };
  }

  /**
   * Extract Streamable HTTP handler methods from streamable-http-handler.ts
   */
  function extractStreamableHandlerMethods(): string[] {
    const handlerPath = path.join(__dirname, '../../src/cli/streamable-http-handler.ts');
    const content = fs.readFileSync(handlerPath, 'utf-8');

    const methods: string[] = [];

    // Check for handleGetRequest method
    if (/handleGetRequest\s*\(/.test(content)) {
      methods.push('handleGetRequest');
    }

    // Check for handlePostRequest method
    if (/handlePostRequest\s*\(/.test(content)) {
      methods.push('handlePostRequest');
    }

    // Check for handleDeleteRequest method
    if (/handleDeleteRequest\s*\(/.test(content)) {
      methods.push('handleDeleteRequest');
    }

    return methods;
  }

  test('HTTP server should support all Streamable HTTP methods on /mcp endpoint', () => {
    // Requirement FR-8: Ensure backward compatibility while supporting Streamable HTTP
    const handlers = extractMCPEndpointHandlers();

    // GET /mcp - Required for SSE stream establishment (FR-1)
    expect(handlers.hasGetHandler).toBe(true);

    // POST /mcp - Required for JSON-RPC with optional SSE response (FR-2, FR-8)
    expect(handlers.hasPostHandler).toBe(true);

    // DELETE /mcp - Required for session termination (FR-3)
    expect(handlers.hasDeleteHandler).toBe(true);

    // OPTIONS - Required for CORS preflight
    expect(handlers.hasOptionsHandler).toBe(true);

    // Verify all expected methods are present
    expect(handlers.methods).toContain('GET');
    expect(handlers.methods).toContain('POST');
    expect(handlers.methods).toContain('DELETE');
    expect(handlers.methods).toContain('OPTIONS');
  });

  test('StreamableHTTPHandler should implement all required methods', () => {
    const methods = extractStreamableHandlerMethods();

    // Required methods for Streamable HTTP Transport
    expect(methods).toContain('handleGetRequest');   // FR-1: SSE stream
    expect(methods).toContain('handlePostRequest');  // FR-2, FR-8: JSON-RPC
    expect(methods).toContain('handleDeleteRequest'); // FR-3: Session termination
  });

  test('HTTP server should route /mcp requests to StreamableHTTPHandler', () => {
    const serverPath = path.join(__dirname, '../../src/cli/http-server-with-config.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');

    // Verify HTTP server imports StreamableHTTPHandler
    expect(content).toMatch(/import.*StreamableHTTPHandler|createStreamableHTTPHandler/);

    // Verify HTTP server uses streamableHandler for /mcp routes
    expect(content).toMatch(/streamableHandler\.handleGetRequest/);
    expect(content).toMatch(/streamableHandler\.handlePostRequest/);
    expect(content).toMatch(/streamableHandler\.handleDeleteRequest/);
  });

  test('HTTP server should support SSE response mode (FR-2)', () => {
    const handlerPath = path.join(__dirname, '../../src/cli/streamable-http-handler.ts');
    const content = fs.readFileSync(handlerPath, 'utf-8');

    // Verify SSE response mode is supported
    expect(content).toMatch(/text\/event-stream/);
    expect(content).toMatch(/Content-Type.*text\/event-stream|['"]text\/event-stream['"]/);
  });

  test('HTTP server should maintain backward compatibility for JSON-only clients (FR-8)', () => {
    const handlerPath = path.join(__dirname, '../../src/cli/streamable-http-handler.ts');
    const content = fs.readFileSync(handlerPath, 'utf-8');

    // Verify JSON response mode is supported for backward compatibility
    expect(content).toMatch(/application\/json/);

    // Verify Accept header is checked to determine response mode
    expect(content).toMatch(/accept.*text\/event-stream|wantsSSE/i);
  });

  test('SSEStreamHandler should be available for event streaming', () => {
    const ssePath = path.join(__dirname, '../../src/cli/sse-stream-handler.ts');

    // Verify SSE handler file exists
    expect(fs.existsSync(ssePath)).toBe(true);

    const content = fs.readFileSync(ssePath, 'utf-8');

    // Verify SSE handler has required functionality
    expect(content).toMatch(/handleSSERequest/);
    expect(content).toMatch(/sendEvent|sendEventWithId/);
    expect(content).toMatch(/keepalive/i);
  });

  test('Session management should be available for Streamable HTTP (FR-3)', () => {
    const sessionPath = path.join(__dirname, '../../src/cli/session-manager.ts');

    // Verify session manager file exists
    expect(fs.existsSync(sessionPath)).toBe(true);

    const content = fs.readFileSync(sessionPath, 'utf-8');

    // Verify session manager has required functionality
    expect(content).toMatch(/createSession|getSession/);
    expect(content).toMatch(/deleteSession/);
    expect(content).toMatch(/Mcp-Session-Id|sessionId/i);
  });
});
