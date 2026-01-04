/**
 * Task Tools Module
 *
 * Exports task-related tool handlers for reuse between
 * index.ts (stdio transport) and mcp-handler.ts (HTTP transport).
 *
 * Requirements: 2.1-2.6, 3.1-3.2, 4.1-4.5, 12.5, 12.6
 */

export type {
  TaskToolsContext,
  AnalyzeTasksInput,
  UpdateTaskStatusInput,
  DetectDuplicatesInput,
} from './handlers.js';

export {
  handleAnalyzeTasks,
  handleUpdateTaskStatus,
  handleSyncTasks,
  handleDetectDuplicates,
} from './handlers.js';
