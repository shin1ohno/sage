/**
 * Tools Module
 *
 * Exports all tool-related types, utilities, and tool collections.
 *
 * ## Usage
 *
 * ```typescript
 * import { createToolResponse, createErrorFromCatch } from './tools/index.js';
 *
 * // In a tool handler:
 * return createToolResponse({ success: true, data: result });
 *
 * // Error handling:
 * catch (error) {
 *   return createErrorFromCatch('Operation failed', error);
 * }
 * ```
 */

// Types
export type {
  ToolResponse,
  ToolResponseContent,
  ToolCategory,
  ToolMetadata,
  ToolServices,
} from './types.js';

// Response utilities (re-exported from mcp-response)
export {
  createToolResponse,
  createErrorResponse,
  createErrorFromCatch,
  createSuccessResponse,
  getErrorMessage,
} from './registry.js';

// Existing analysis tools
export { TaskAnalyzer, type AnalysisResult } from './analyze-tasks.js';
