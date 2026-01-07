/**
 * Calendar Tool Definitions
 *
 * Shared definitions for calendar tools used in both
 * stdio mode (index.ts) and remote mode (mcp-handler.ts).
 */

import { z } from 'zod';
import { defineTool } from './types.js';

/**
 * update_calendar_event tool
 * Requirement: update-calendar-event 1-8
 */
export const updateCalendarEventTool = defineTool(
  'update_calendar_event',
  'Update an existing calendar event. Can modify title, time, location, attendees, room, and other properties. For room changes, use roomId to add/change a room, or removeRoom to remove an existing room.',
  z.object({
    eventId: z
      .string()
      .describe('The ID of the event to update'),
    title: z
      .string()
      .optional()
      .describe('New title/summary for the event'),
    startDate: z
      .string()
      .optional()
      .describe('New start date/time in ISO 8601 format (e.g., 2025-01-15T10:00:00+09:00)'),
    endDate: z
      .string()
      .optional()
      .describe('New end date/time in ISO 8601 format (e.g., 2025-01-15T11:00:00+09:00)'),
    location: z
      .string()
      .optional()
      .describe('New location for the event'),
    notes: z
      .string()
      .optional()
      .describe('New notes/description for the event'),
    attendees: z
      .array(z.string())
      .optional()
      .describe('New list of attendee email addresses (replaces existing attendees)'),
    alarms: z
      .array(z.string())
      .optional()
      .describe("New alarm settings (e.g., ['-15m', '-1h']). Replaces existing alarms."),
    roomId: z
      .string()
      .optional()
      .describe('Room calendar ID to add or change. Use search_room_availability to find available rooms.'),
    removeRoom: z
      .boolean()
      .optional()
      .describe('Set to true to remove the current room from the event'),
    autoDeclineMode: z
      .string()
      .optional()
      .describe('For outOfOffice/focusTime events: auto-decline behavior (declineNone, declineAllConflictingInvitations, declineOnlyNewConflictingInvitations)'),
    declineMessage: z
      .string()
      .optional()
      .describe('For outOfOffice/focusTime events: custom decline message'),
    chatStatus: z
      .string()
      .optional()
      .describe('For focusTime events: chat status (available, doNotDisturb)'),
    calendarName: z
      .string()
      .optional()
      .describe('Calendar name (uses primary calendar if not specified)'),
  })
);

/**
 * All calendar-related shared tools
 */
export const calendarTools = [
  updateCalendarEventTool,
] as const;
