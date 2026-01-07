/**
 * Directory People Tool Definitions
 *
 * Shared definitions for directory people search tools used in both
 * stdio mode (index.ts) and remote mode (mcp-handler.ts).
 */

import { z } from 'zod';
import { defineTool } from './types.js';

/**
 * search_directory_people tool
 * Requirement: directory-people-search 1
 */
export const searchDirectoryPeopleTool = defineTool(
  'search_directory_people',
  'Search for people in the organization directory by name or email. Returns matching users with their display names, email addresses, and organization info.',
  z.object({
    query: z
      .string()
      .min(1)
      .describe('Search query (name or email prefix)'),
    pageSize: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results (default: 20, max: 50)'),
  })
);

/**
 * All directory-related tools
 */
export const directoryTools = [
  searchDirectoryPeopleTool,
] as const;
