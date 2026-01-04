/**
 * MCP Tool Response Utilities
 *
 * Provides standardized response formatting for MCP tools.
 * Reduces boilerplate and ensures consistent response structure.
 */

/**
 * Formats data as JSON with consistent indentation
 */
function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Creates a standardized MCP tool response
 *
 * @param data - Response data to serialize
 * @returns MCP tool response object
 *
 * @example
 * return createResponse({ status: 'ok', items: [] });
 */
export function createResponse(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: formatJson(data),
      },
    ],
  };
}

/**
 * Creates an error response for MCP tools
 *
 * @param message - Error message to display
 * @param additionalData - Optional additional data to include
 * @returns MCP tool response with error flag
 *
 * @example
 * return createErrorResponse('Configuration not found');
 *
 * @example
 * return createErrorResponse('Validation failed', { field: 'email', code: 'INVALID' });
 */
export function createErrorResponse(
  message: string,
  additionalData?: Record<string, unknown>
) {
  return createResponse({
    error: true,
    message,
    ...additionalData,
  });
}

/**
 * Creates a success response for MCP tools
 *
 * @param data - Response data
 * @returns MCP tool response
 *
 * @example
 * return createSuccessResponse({ tasks: [], count: 0 });
 */
export function createSuccessResponse(data: Record<string, unknown>) {
  return createResponse(data);
}

/**
 * Extracts error message from unknown error type
 *
 * @param error - Error object or unknown value
 * @returns Error message string
 *
 * @example
 * catch (error) {
 *   return createErrorResponse(`Operation failed: ${getErrorMessage(error)}`);
 * }
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Creates an error response from a caught error
 *
 * Convenience function that combines getErrorMessage and createErrorResponse.
 *
 * @param prefix - Message prefix (e.g., "Failed to save config")
 * @param error - Caught error
 * @param additionalData - Optional additional data
 * @returns MCP tool response with error
 *
 * @example
 * catch (error) {
 *   return createErrorFromCatch('Failed to analyze task', error);
 * }
 */
export function createErrorFromCatch(
  prefix: string,
  error: unknown,
  additionalData?: Record<string, unknown>
) {
  const message = `${prefix}: ${getErrorMessage(error)}`;
  return createErrorResponse(message, additionalData);
}
