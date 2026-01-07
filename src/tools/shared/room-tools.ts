/**
 * Room Availability Tool Definitions
 *
 * Shared definitions for room availability tools used in both
 * stdio mode (index.ts) and remote mode (mcp-handler.ts).
 */

import { z } from 'zod';
import { defineTool } from './types.js';

/**
 * search_room_availability tool
 * Requirement: room-availability-search 1
 */
export const searchRoomAvailabilityTool = defineTool(
  'search_room_availability',
  'Search for available meeting rooms during a specific time period. Returns rooms sorted by capacity match with availability status.',
  z.object({
    startTime: z
      .string()
      .describe('Start time in ISO 8601 format (e.g., 2025-01-15T10:00:00+09:00)'),
    endTime: z
      .string()
      .optional()
      .describe('End time in ISO 8601 format. Either endTime or durationMinutes must be specified.'),
    durationMinutes: z
      .number()
      .min(1)
      .max(480)
      .optional()
      .describe('Meeting duration in minutes (1-480). Either endTime or durationMinutes must be specified.'),
    minCapacity: z
      .number()
      .min(1)
      .optional()
      .describe('Minimum room capacity required'),
    building: z
      .string()
      .optional()
      .describe('Filter by building name or ID'),
    floor: z
      .string()
      .optional()
      .describe('Filter by floor name or number'),
    features: z
      .array(z.string())
      .optional()
      .describe("Required room features (e.g., ['projector', 'whiteboard'])"),
  })
);

/**
 * check_room_availability tool
 * Requirement: room-availability-search 2
 */
export const checkRoomAvailabilityTool = defineTool(
  'check_room_availability',
  'Check availability of a specific meeting room during a time period. Returns detailed availability including busy periods.',
  z.object({
    roomId: z
      .string()
      .describe('Calendar ID of the room to check'),
    startTime: z
      .string()
      .describe('Start time in ISO 8601 format (e.g., 2025-01-15T10:00:00+09:00)'),
    endTime: z
      .string()
      .describe('End time in ISO 8601 format (e.g., 2025-01-15T11:00:00+09:00)'),
  })
);

/**
 * All room-related tools
 */
export const roomTools = [
  searchRoomAvailabilityTool,
  checkRoomAvailabilityTool,
] as const;
