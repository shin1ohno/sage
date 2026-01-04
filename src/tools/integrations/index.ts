/**
 * Integration Tools Module
 *
 * Exports integration-related tool handlers for reuse between
 * index.ts (stdio transport) and mcp-handler.ts (HTTP transport).
 *
 * Requirements: 8.1-8.5, 10.1-10.6
 */

export type {
  IntegrationToolsContext,
  SyncToNotionInput,
  UpdateConfigInput,
} from './handlers.js';

export { handleSyncToNotion, handleUpdateConfig } from './handlers.js';
