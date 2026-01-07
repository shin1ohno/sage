/**
 * People Availability Tool Definitions
 *
 * Shared definitions for people availability tools used in both
 * stdio mode (index.ts) and remote mode (mcp-handler.ts).
 *
 * Requirement: check-others-availability 1, 2, 4
 */

import { z } from 'zod';
import { defineTool } from './types.js';

/**
 * check_people_availability tool
 * Check availability of multiple people by their email addresses
 * Requirement: check-others-availability 1.1-1.6
 */
export const checkPeopleAvailabilityTool = defineTool(
  'check_people_availability',
  'Check availability of people by their email addresses. Returns busy periods for each person within the specified time range. Use this to see when specific colleagues are free or busy.',
  z.object({
    emails: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe('Array of email addresses to check (1-20 people)'),
    startTime: z
      .string()
      .describe('Start time in ISO 8601 format (e.g., 2025-01-15T09:00:00+09:00)'),
    endTime: z
      .string()
      .describe('End time in ISO 8601 format (e.g., 2025-01-15T18:00:00+09:00)'),
  })
);

/**
 * find_common_availability tool
 * Find common free time slots among multiple people
 * Supports both names and email addresses as input
 * Requirement: check-others-availability 2.1-2.6, 4.1-4.3
 */
export const findCommonAvailabilityTool = defineTool(
  'find_common_availability',
  'Find common free time slots among multiple people. Accepts names (resolved via directory search) or email addresses. Returns time slots where ALL specified people are available.',
  z.object({
    participants: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe('Array of participant names or email addresses (1-20 people). Names will be resolved via directory search.'),
    startTime: z
      .string()
      .describe('Start time in ISO 8601 format (e.g., 2025-01-15T09:00:00+09:00)'),
    endTime: z
      .string()
      .describe('End time in ISO 8601 format (e.g., 2025-01-15T18:00:00+09:00)'),
    minDurationMinutes: z
      .number()
      .min(1)
      .optional()
      .describe('Minimum duration in minutes for each slot (default: 30)'),
    includeMyCalendar: z
      .boolean()
      .optional()
      .describe('Whether to include your own calendar in the search (default: true)'),
  })
);

/**
 * All people availability tools
 */
export const availabilityTools = [
  checkPeopleAvailabilityTool,
  findCommonAvailabilityTool,
] as const;
