/**
 * Tool Parity Test
 *
 * Ensures that tools registered in index.ts (stdio mode) and mcp-handler.ts (remote mode)
 * are kept in sync. This prevents the common mistake of adding a tool to one file but
 * forgetting to add it to the other.
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
