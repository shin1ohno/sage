/**
 * Tool Registry
 *
 * Helper functions for tool response creation.
 * Re-exports from mcp-response.ts for convenience.
 */

// Re-export response utilities from mcp-response
// These are the primary utilities for tool handlers
export {
  createResponse as createToolResponse,
  createErrorResponse,
  createErrorFromCatch,
  createSuccessResponse,
  getErrorMessage,
} from '../utils/mcp-response.js';
