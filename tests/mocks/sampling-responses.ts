/**
 * Sampling Response Mocks
 *
 * Provides reusable mock data for testing MCP Sampling functionality.
 * Includes successful responses, error types, and helper functions
 * for creating custom mock responses.
 *
 * @example
 * ```typescript
 * import {
 *   mockSamplingCalendarResponse,
 *   mockUserRejectionError,
 *   createMockSamplingResponse,
 * } from '../../mocks/sampling-responses';
 *
 * // Use predefined mock
 * expect(response).toEqual(mockSamplingCalendarResponse);
 *
 * // Create custom mock
 * const customResponse = createMockSamplingResponse('{"status":"ok"}');
 * ```
 */

import type { SamplingResponse } from '../../src/types/platform.js';
import { SamplingError, SamplingErrorCodes } from '../../src/services/sampling-service.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock SamplingResponse with text content
 *
 * @param text - The text content for the response
 * @param options - Optional overrides for model and stopReason
 * @returns A valid SamplingResponse object
 *
 * @example
 * ```typescript
 * const response = createMockSamplingResponse('{"success": true}');
 * const responseWithModel = createMockSamplingResponse('data', { model: 'claude-3-sonnet' });
 * ```
 */
export function createMockSamplingResponse(
  text: string,
  options?: {
    model?: string;
    stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | string;
  }
): SamplingResponse {
  return {
    content: {
      type: 'text' as const,
      text,
    },
    model: options?.model ?? 'claude-sonnet-4-20250514',
    stopReason: options?.stopReason ?? 'endTurn',
  };
}

/**
 * Create a mock SamplingError
 *
 * @param code - The error code (use SamplingErrorCodes constants)
 * @param message - Human-readable error message
 * @param isRetryable - Whether the error is retryable (default: false)
 * @returns A SamplingError instance
 *
 * @example
 * ```typescript
 * const error = createMockSamplingError(
 *   SamplingErrorCodes.USER_REJECTION,
 *   'User rejected the request'
 * );
 * expect(error.isUserRejection()).toBe(true);
 * ```
 */
export function createMockSamplingError(
  code: number,
  message: string,
  isRetryable: boolean = false
): SamplingError {
  return new SamplingError(message, code, isRetryable);
}

// ============================================================================
// Calendar Response Mocks
// ============================================================================

/**
 * Sample calendar events data for testing
 * Includes various event types from multiple sources
 */
export const sampleCalendarEventsData = {
  events: [
    {
      id: 'google-event-1',
      title: 'Team Standup Meeting',
      start: '2024-01-15T09:00:00+09:00',
      end: '2024-01-15T09:30:00+09:00',
      isAllDay: false,
      source: 'google' as const,
      calendarId: 'work@example.com',
      location: 'Conference Room A',
      description: 'Daily standup meeting',
    },
    {
      id: 'google-event-2',
      title: 'Lunch with Client',
      start: '2024-01-15T12:00:00+09:00',
      end: '2024-01-15T13:00:00+09:00',
      isAllDay: false,
      source: 'google' as const,
      calendarId: 'work@example.com',
      location: 'Tokyo Station',
    },
    {
      id: 'native-event-1',
      title: 'Annual Review',
      start: '2024-01-15T00:00:00+09:00',
      end: '2024-01-16T00:00:00+09:00',
      isAllDay: true,
      source: 'native' as const,
      calendarId: 'personal',
    },
    {
      id: 'google-recurring-1',
      title: 'Weekly 1:1 with Manager',
      start: '2024-01-15T14:00:00+09:00',
      end: '2024-01-15T14:30:00+09:00',
      isAllDay: false,
      source: 'google' as const,
      calendarId: 'work@example.com',
      recurrenceId: 'weekly-1on1-base',
      description: 'Weekly sync',
    },
    {
      id: 'native-event-2',
      title: 'Project Deadline',
      start: '2024-01-15T17:00:00+09:00',
      end: '2024-01-15T18:00:00+09:00',
      isAllDay: false,
      source: 'native' as const,
      calendarId: 'personal',
    },
  ],
  totalCount: 5,
  period: {
    start: '2024-01-15',
    end: '2024-01-16',
  },
};

/**
 * Mock Sampling response with calendar events
 *
 * Includes events from multiple sources (Google, native) with various types:
 * - Regular meetings
 * - All-day events
 * - Recurring events
 *
 * @example
 * ```typescript
 * mockMcpServer.server.createMessage.mockResolvedValue(mockSamplingCalendarResponse);
 * const events = await calendarService.fetchEventsViaSampling('2024-01-15', '2024-01-16');
 * expect(events.length).toBe(5);
 * ```
 */
export const mockSamplingCalendarResponse: SamplingResponse = createMockSamplingResponse(
  JSON.stringify(sampleCalendarEventsData)
);

// ============================================================================
// Reminder Response Mocks
// ============================================================================

/**
 * Sample reminder creation result data
 */
export const sampleReminderResultData = {
  success: true,
  reminderId: 'reminder-uuid-12345',
  method: 'native',
  platformInfo: {
    platform: 'ios',
    clientName: 'claude-ios',
    clientVersion: '1.0.0',
    supportsSampling: true,
    detectionConfidence: 'high',
  },
  reminderDetails: {
    title: 'Complete quarterly report',
    list: 'Work',
    dueDate: '2024-01-20T10:00:00+09:00',
    notes: 'Include Q4 metrics',
  },
};

/**
 * Mock Sampling response for successful reminder creation
 *
 * Contains:
 * - success flag
 * - reminder ID
 * - platform info
 * - created reminder details
 *
 * @example
 * ```typescript
 * mockMcpServer.server.createMessage.mockResolvedValue(mockSamplingReminderResponse);
 * const result = await reminderService.createReminderViaSampling(request);
 * expect(result.success).toBe(true);
 * ```
 */
export const mockSamplingReminderResponse: SamplingResponse = createMockSamplingResponse(
  JSON.stringify(sampleReminderResultData)
);

/**
 * Sample failed reminder creation result
 */
export const sampleReminderFailedData = {
  success: false,
  error: 'Permission denied: Calendar access not granted',
  method: 'native',
  platformInfo: {
    platform: 'ios',
    clientName: 'claude-ios',
    clientVersion: '1.0.0',
    supportsSampling: true,
    detectionConfidence: 'high',
  },
};

/**
 * Mock Sampling response for failed reminder creation (permission denied)
 */
export const mockSamplingReminderFailedResponse: SamplingResponse = createMockSamplingResponse(
  JSON.stringify(sampleReminderFailedData)
);

// ============================================================================
// Error Mocks
// ============================================================================

/**
 * Mock error: User rejected the Sampling request
 *
 * Occurs when the user clicks "Deny" or cancels the Sampling prompt.
 * Error code: -1 (USER_REJECTION)
 * Not retryable - user must manually approve.
 *
 * @example
 * ```typescript
 * mockMcpServer.server.createMessage.mockRejectedValue(mockUserRejectionError);
 * await expect(service.sendSamplingRequest(request)).rejects.toThrow(mockUserRejectionError);
 * ```
 */
export const mockUserRejectionError: SamplingError = createMockSamplingError(
  SamplingErrorCodes.USER_REJECTION,
  'User rejected the Sampling request. Please approve the operation to continue.',
  false
);

/**
 * Mock error: Client doesn't support Sampling capability
 *
 * Occurs when the MCP client does not implement the Sampling protocol.
 * Error code: -32601 (METHOD_NOT_FOUND)
 * Not retryable - client limitation.
 *
 * @example
 * ```typescript
 * if (error.isSamplingNotSupported()) {
 *   return handleFallbackMethod();
 * }
 * ```
 */
export const mockMethodNotFoundError: SamplingError = createMockSamplingError(
  SamplingErrorCodes.METHOD_NOT_FOUND,
  'Your Claude client does not support Sampling. Please use Claude Desktop, Claude iOS, or Claude iPadOS.',
  false
);

/**
 * Mock error: Invalid parameters in Sampling request
 *
 * Occurs when the request parameters don't match the expected schema.
 * Error code: -32602 (INVALID_PARAMS)
 * Not retryable - programming error.
 *
 * @example
 * ```typescript
 * // Test validation error handling
 * mockMcpServer.server.createMessage.mockRejectedValue(mockInvalidParamsError);
 * ```
 */
export const mockInvalidParamsError: SamplingError = createMockSamplingError(
  SamplingErrorCodes.INVALID_PARAMS,
  'Invalid Sampling request parameters: messages array is required',
  false
);

/**
 * Mock error: Internal error during Sampling
 *
 * Occurs when an unexpected error happens during Sampling execution.
 * Error code: -32603 (INTERNAL_ERROR)
 * May be retryable depending on the cause.
 *
 * @example
 * ```typescript
 * // Test internal error handling with retry
 * mockMcpServer.server.createMessage
 *   .mockRejectedValueOnce(mockInternalError)
 *   .mockResolvedValueOnce(mockSamplingCalendarResponse);
 * ```
 */
export const mockInternalError: SamplingError = createMockSamplingError(
  SamplingErrorCodes.INTERNAL_ERROR,
  'An internal error occurred during the Sampling request',
  true // Internal errors may be retryable
);

/**
 * Mock error: Network/transient error (retryable)
 *
 * Simulates a temporary network issue that should be retried.
 */
export const mockNetworkError: SamplingError = createMockSamplingError(
  SamplingErrorCodes.INTERNAL_ERROR,
  'Network timeout: Connection to Claude client timed out',
  true
);

// ============================================================================
// Additional Response Mocks
// ============================================================================

/**
 * Mock Sampling response for empty calendar (no events)
 */
export const mockSamplingEmptyCalendarResponse: SamplingResponse = createMockSamplingResponse(
  JSON.stringify({
    events: [],
    totalCount: 0,
    period: {
      start: '2024-01-15',
      end: '2024-01-16',
    },
  })
);

/**
 * Mock Sampling response with maxTokens stop reason
 *
 * Useful for testing truncated response handling.
 */
export const mockSamplingTruncatedResponse: SamplingResponse = createMockSamplingResponse(
  JSON.stringify({
    events: sampleCalendarEventsData.events.slice(0, 2),
    totalCount: 2,
    truncated: true,
    message: 'Response was truncated due to token limit',
  }),
  { stopReason: 'maxTokens' }
);

/**
 * Mock Sampling response with plain text (non-JSON)
 *
 * Useful for testing text-based responses.
 */
export const mockSamplingTextResponse: SamplingResponse = createMockSamplingResponse(
  'The reminder has been successfully created in your Reminders app.',
  { model: 'claude-3-haiku' }
);

// ============================================================================
// Re-export error codes for convenience
// ============================================================================

export { SamplingErrorCodes };
