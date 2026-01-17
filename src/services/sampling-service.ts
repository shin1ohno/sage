/**
 * SamplingService
 *
 * Handles MCP Sampling requests to Claude client for platform-specific operations.
 * This service enables sage to request Claude to perform native platform integrations
 * (e.g., iOS Calendar, iOS Reminders) via the MCP Sampling protocol.
 *
 * Requirements: 2.1-2.7, 6.7
 * - Sampling requests to Claude client for platform-specific operations
 * - Error handling for user rejection (code -1)
 * - Error handling for method not found (code -32601)
 * - Validation of Claude's response
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type {
  SamplingRequest,
  SamplingResponse,
} from '../types/sampling.js';
import { servicesLogger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * MCP JSON-RPC error codes for Sampling operations
 */
export const SamplingErrorCodes = {
  /** User rejected the Sampling request */
  USER_REJECTION: -1,
  /** Method not found (client doesn't support Sampling) */
  METHOD_NOT_FOUND: -32601,
  /** Invalid params */
  INVALID_PARAMS: -32602,
  /** Internal error */
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Zod schema for validating SamplingTextContent
 */
const SamplingTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * Zod schema for validating SamplingResponse from Claude
 *
 * According to MCP Sampling protocol, the response contains:
 * - content: The generated content (text or image)
 * - model: The model that was used
 * - stopReason: Optional reason for stopping generation
 */
export const SamplingResponseSchema = z.object({
  content: SamplingTextContentSchema,
  model: z.string(),
  stopReason: z.enum(['endTurn', 'stopSequence', 'maxTokens']).optional().or(z.string().optional()),
});

/**
 * Custom error class for Sampling-related errors
 */
export class SamplingError extends Error {
  public readonly code: number;
  public readonly isRetryable: boolean;

  constructor(message: string, code: number, isRetryable: boolean = false) {
    super(message);
    this.name = 'SamplingError';
    this.code = code;
    this.isRetryable = isRetryable;
    Object.setPrototypeOf(this, SamplingError.prototype);
  }

  /**
   * Check if this is a user rejection error
   */
  isUserRejection(): boolean {
    return this.code === SamplingErrorCodes.USER_REJECTION;
  }

  /**
   * Check if this is a method not found error (Sampling not supported)
   */
  isSamplingNotSupported(): boolean {
    return this.code === SamplingErrorCodes.METHOD_NOT_FOUND;
  }
}

/**
 * SamplingService class
 *
 * Provides infrastructure for sending Sampling requests to Claude client
 * and validating responses. Uses the MCP Sampling protocol to enable
 * server-initiated LLM completions for platform-specific operations.
 *
 * @example
 * ```typescript
 * const samplingService = new SamplingService(mcpServer);
 * const response = await samplingService.sendSamplingRequest({
 *   messages: [{ role: 'user', content: { type: 'text', text: 'Fetch calendar events' } }],
 *   maxTokens: 1024,
 * });
 * ```
 */
export class SamplingService {
  private server: McpServer | null;

  /**
   * Create a new SamplingService instance
   *
   * @param server - MCP Server instance for sending Sampling requests
   *                 Can be null initially and set later via setServer()
   */
  constructor(server: McpServer | null = null) {
    this.server = server;
  }

  /**
   * Set or update the MCP Server instance
   *
   * @param server - MCP Server instance
   */
  setServer(server: McpServer): void {
    this.server = server;
  }

  /**
   * Check if the service has a valid MCP Server configured
   *
   * @returns True if server is configured
   */
  hasServer(): boolean {
    return this.server !== null;
  }

  /**
   * Send a Sampling request to Claude client
   *
   * This method sends a sampling/createMessage request to the MCP client,
   * allowing the server to leverage Claude's capabilities for platform-specific
   * operations (e.g., native iOS Calendar access).
   *
   * Uses exponential backoff retry for transient errors, but immediately
   * fails for user rejection or method not found errors.
   *
   * @param request - SamplingRequest with messages, systemPrompt, and maxTokens
   * @returns Promise resolving to SamplingResponse with Claude's generated content
   * @throws SamplingError if:
   *   - Server is not configured
   *   - User rejects the request (code -1)
   *   - Client doesn't support Sampling (code -32601)
   *   - Response validation fails
   *
   * Requirements: 2.5, 6.1-6.2, 6.7
   */
  async sendSamplingRequest(request: SamplingRequest): Promise<SamplingResponse> {
    // Validate server is configured
    if (!this.server) {
      throw new SamplingError(
        'MCP Server not configured for Sampling requests',
        SamplingErrorCodes.INTERNAL_ERROR,
        false
      );
    }

    servicesLogger.info(
      {
        messageCount: request.messages.length,
        maxTokens: request.maxTokens,
        hasSystemPrompt: !!request.systemPrompt,
      },
      'Sending Sampling request to Claude client'
    );

    try {
      // Build the sampling params from our SamplingRequest
      const samplingParams = this.buildSamplingParams(request);

      // Send the request with retry for transient errors
      const response = await retryWithBackoff(
        () => this.server!.server.createMessage(samplingParams),
        {
          maxAttempts: 2,
          initialDelay: 1000,
          maxDelay: 5000,
          shouldRetry: (error) => this.isRetryableError(error),
          onRetry: (error, attempt, nextDelay) => {
            servicesLogger.warn(
              { error: error.message, attempt, nextDelay },
              'Retrying Sampling request after transient error'
            );
          },
        }
      );

      // Transform MCP SDK response to our SamplingResponse type
      const samplingResponse = this.transformResponse(response);

      // Validate the response
      this.validateSamplingResponse(samplingResponse);

      servicesLogger.info(
        { model: samplingResponse.model, stopReason: samplingResponse.stopReason },
        'Sampling request completed successfully'
      );

      return samplingResponse;
    } catch (error) {
      // Handle and transform errors
      throw this.handleSamplingError(error);
    }
  }

  /**
   * Build MCP SDK sampling params from SamplingRequest
   *
   * @param request - Our SamplingRequest type
   * @returns MCP SDK CreateMessageRequestParams
   */
  private buildSamplingParams(request: SamplingRequest) {
    return {
      messages: request.messages,
      maxTokens: request.maxTokens,
      ...(request.systemPrompt && { systemPrompt: request.systemPrompt }),
      ...(request.includeContext && { includeContext: request.includeContext }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.stopSequences && { stopSequences: request.stopSequences }),
      ...(request.modelPreferences && { modelPreferences: request.modelPreferences }),
      ...(request.metadata && { metadata: request.metadata }),
    };
  }

  /**
   * Transform MCP SDK response to our SamplingResponse type
   *
   * @param response - MCP SDK CreateMessageResult
   * @returns SamplingResponse
   */
  private transformResponse(response: { content: unknown; model: string; stopReason?: string }): SamplingResponse {
    // Handle single content block (non-tool response)
    const content = response.content as { type: string; text?: string };

    if (content.type === 'text' && typeof content.text === 'string') {
      return {
        content: {
          type: 'text' as const,
          text: content.text,
        },
        model: response.model,
        stopReason: response.stopReason,
      };
    }

    // If content is not text, throw an error
    throw new SamplingError(
      `Unexpected content type: ${content.type}. Only text content is supported.`,
      SamplingErrorCodes.INTERNAL_ERROR,
      false
    );
  }

  /**
   * Determine if an error is retryable
   *
   * User rejection (code -1) and method not found (code -32601) are NOT retryable.
   * Network and transient errors ARE retryable.
   *
   * @param error - The error to check
   * @returns True if the error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Check if it's an MCP error with a code
    if (error instanceof McpError) {
      const code = error.code;

      // User rejection is NOT retryable
      if (code === SamplingErrorCodes.USER_REJECTION) {
        servicesLogger.info('User rejected the Sampling request, not retrying');
        return false;
      }

      // Method not found (Sampling not supported) is NOT retryable
      if (code === SamplingErrorCodes.METHOD_NOT_FOUND) {
        servicesLogger.info('Client does not support Sampling, not retrying');
        return false;
      }

      // Invalid params is NOT retryable
      if (code === SamplingErrorCodes.INVALID_PARAMS) {
        servicesLogger.info('Invalid params in Sampling request, not retrying');
        return false;
      }
    }

    // Check for SamplingError
    if (error instanceof SamplingError && !error.isRetryable) {
      return false;
    }

    // Network errors and other transient errors are retryable
    const message = error.message.toLowerCase();
    const transientPatterns = [
      /timeout/i,
      /network/i,
      /econnreset/i,
      /etimedout/i,
      /temporary/i,
      /unavailable/i,
    ];

    for (const pattern of transientPatterns) {
      if (pattern.test(message)) {
        return true;
      }
    }

    // Default: retry for unknown errors (be conservative)
    return true;
  }

  /**
   * Handle and transform errors from the MCP SDK call
   *
   * @param error - The caught error
   * @returns SamplingError with appropriate code and message
   */
  private handleSamplingError(error: unknown): SamplingError {
    // Already a SamplingError, pass through
    if (error instanceof SamplingError) {
      return error;
    }

    // Handle MCP SDK errors
    if (error instanceof McpError) {
      const code = error.code;

      if (code === SamplingErrorCodes.USER_REJECTION) {
        servicesLogger.warn('User rejected the Sampling request');
        return new SamplingError(
          'User rejected the Sampling request. Please approve the operation to continue.',
          SamplingErrorCodes.USER_REJECTION,
          false
        );
      }

      if (code === SamplingErrorCodes.METHOD_NOT_FOUND) {
        servicesLogger.warn('Client does not support Sampling capability');
        return new SamplingError(
          'Your Claude client does not support Sampling. Please use Claude Desktop, Claude iOS, or Claude iPadOS.',
          SamplingErrorCodes.METHOD_NOT_FOUND,
          false
        );
      }

      if (code === SamplingErrorCodes.INVALID_PARAMS) {
        servicesLogger.error({ error: error.message }, 'Invalid params in Sampling request');
        return new SamplingError(
          `Invalid Sampling request parameters: ${error.message}`,
          SamplingErrorCodes.INVALID_PARAMS,
          false
        );
      }

      // Other MCP errors
      servicesLogger.error(
        { code, message: error.message },
        'MCP error during Sampling request'
      );
      return new SamplingError(
        `Sampling request failed: ${error.message}`,
        code,
        true // Other MCP errors may be retryable
      );
    }

    // Handle generic errors
    if (error instanceof Error) {
      servicesLogger.error({ error: error.message }, 'Error during Sampling request');
      return new SamplingError(
        `Sampling request failed: ${error.message}`,
        SamplingErrorCodes.INTERNAL_ERROR,
        true
      );
    }

    // Handle unknown errors
    servicesLogger.error({ error }, 'Unknown error during Sampling request');
    return new SamplingError(
      'An unexpected error occurred during the Sampling request',
      SamplingErrorCodes.INTERNAL_ERROR,
      false
    );
  }

  /**
   * Validate a Sampling response using Zod schema
   *
   * Ensures the response from Claude matches the expected SamplingResponse
   * structure. Throws if validation fails.
   *
   * @param response - Response object to validate
   * @throws SamplingError if response doesn't match expected schema
   *
   * Requirements: 2.7, 6.7
   */
  validateSamplingResponse(response: unknown): asserts response is SamplingResponse {
    try {
      SamplingResponseSchema.parse(response);
    } catch (error) {
      servicesLogger.error(
        { response, error },
        'Sampling response validation failed'
      );

      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new SamplingError(
          `Invalid Sampling response: ${issues}`,
          SamplingErrorCodes.INTERNAL_ERROR,
          false
        );
      }

      throw new SamplingError(
        'Failed to validate Sampling response',
        SamplingErrorCodes.INTERNAL_ERROR,
        false
      );
    }
  }

  /**
   * Create a user-friendly error message for Sampling failures
   *
   * @param error - The error that occurred
   * @returns User-friendly error message
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof SamplingError) {
      if (error.isUserRejection()) {
        return 'Platform-adaptive integration requires user approval. Operation cancelled.';
      }
      if (error.isSamplingNotSupported()) {
        return 'Your Claude client does not support platform-adaptive integration. Please use Claude Desktop, Claude iOS, or Claude iPadOS.';
      }
      return error.message;
    }

    if (error instanceof Error) {
      return `Sampling request failed: ${error.message}`;
    }

    return 'An unknown error occurred during Sampling request';
  }
}
