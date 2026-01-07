/**
 * Directory Tools Module
 *
 * Exports directory-related tool handlers for reuse between
 * index.ts (stdio transport) and mcp-handler.ts (HTTP transport).
 *
 * Requirements: directory-people-search 1.1
 */

export type {
  DirectoryToolsContext,
  SearchDirectoryPeopleInput,
} from './handlers.js';

export {
  handleSearchDirectoryPeople,
} from './handlers.js';
