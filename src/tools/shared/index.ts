/**
 * Shared Tool Definitions
 *
 * This module provides unified tool definitions that can be used in both
 * stdio mode (index.ts) and remote mode (mcp-handler.ts).
 *
 * Usage in index.ts:
 *   import { searchRoomAvailabilityTool } from './tools/shared/index.js';
 *   server.tool(
 *     searchRoomAvailabilityTool.name,
 *     searchRoomAvailabilityTool.description,
 *     searchRoomAvailabilityTool.schema,
 *     async (args) => handler(args)
 *   );
 *
 * Usage in mcp-handler.ts:
 *   import { searchRoomAvailabilityTool, toJsonSchema } from '../tools/shared/index.js';
 *   this.registerTool(
 *     {
 *       name: searchRoomAvailabilityTool.name,
 *       description: searchRoomAvailabilityTool.description,
 *       inputSchema: toJsonSchema(searchRoomAvailabilityTool.schema),
 *     },
 *     async (args) => handler(args)
 *   );
 */

// Types and utilities
export { type SharedToolDefinition, toJsonSchema, defineTool } from './types.js';

// Room availability tools
export {
  searchRoomAvailabilityTool,
  checkRoomAvailabilityTool,
  roomTools,
} from './room-tools.js';

// Calendar tools
export {
  updateCalendarEventTool,
  calendarTools,
} from './calendar-tools.js';
