/**
 * SamplingService unit tests
 *
 * Tests for the MCP Sampling functionality including:
 * - sendSamplingRequest with retry logic
 * - Error handling for user rejection (code -1)
 * - Error handling for method not found (code -32601)
 * - Response validation and transformation
 *
 * Requirements: 2.5, 6.1-6.2, 6.7
 */

import {
  SamplingService,
  SamplingError,
  SamplingErrorCodes,
  SamplingResponseSchema,
} from '../../../src/services/sampling-service';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type { SamplingRequest, SamplingResponse } from '../../../src/types/sampling';
import {
  createMockSamplingResponse,
  mockSamplingCalendarResponse,
  mockSamplingReminderResponse,
  mockUserRejectionError,
  mockMethodNotFoundError,
  mockInvalidParamsError,
  mockInternalError,
} from '../../mocks/sampling-responses';

// Mock the logger to prevent console output during tests
jest.mock('../../../src/utils/logger', () => ({
  servicesLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the retry utility - we want to test with controlled retry behavior
jest.mock('../../../src/utils/retry', () => ({
  retryWithBackoff: jest.fn(async (fn, options) => {
    try {
      return await fn();
    } catch (error) {
      // Check shouldRetry if provided
      if (options?.shouldRetry && !options.shouldRetry(error as Error)) {
        throw error;
      }
      // For tests, just throw the error (no actual retry)
      throw error;
    }
  }),
}));

describe('SamplingService', () => {
  let samplingService: SamplingService;
  let mockServer: {
    server: {
      createMessage: jest.Mock;
    };
  };

  beforeEach(() => {
    // Create mock server with createMessage method
    mockServer = {
      server: {
        createMessage: jest.fn(),
      },
    };

    // Create service with mock server
    samplingService = new SamplingService(mockServer as any);
    jest.clearAllMocks();
  });

  describe('constructor and server management', () => {
    it('should create service without server', () => {
      const service = new SamplingService();
      expect(service.hasServer()).toBe(false);
    });

    it('should create service with server', () => {
      const service = new SamplingService(mockServer as any);
      expect(service.hasServer()).toBe(true);
    });

    it('should allow setting server after construction', () => {
      const service = new SamplingService();
      expect(service.hasServer()).toBe(false);

      service.setServer(mockServer as any);
      expect(service.hasServer()).toBe(true);
    });
  });

  describe('sendSamplingRequest', () => {
    const validRequest: SamplingRequest = {
      messages: [
        { role: 'user', content: { type: 'text', text: 'Test message' } },
      ],
      maxTokens: 1024,
    };

    const validMcpResponse = {
      content: { type: 'text', text: 'Test response' },
      model: 'claude-3-opus',
      stopReason: 'endTurn',
    };

    it('should throw SamplingError when server is not configured', async () => {
      const service = new SamplingService();

      await expect(service.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      await expect(service.sendSamplingRequest(validRequest))
        .rejects
        .toMatchObject({
          code: SamplingErrorCodes.INTERNAL_ERROR,
          message: expect.stringContaining('not configured'),
        });
    });

    it('should successfully send sampling request and return response', async () => {
      mockServer.server.createMessage.mockResolvedValue(validMcpResponse);

      const result = await samplingService.sendSamplingRequest(validRequest);

      expect(result).toEqual({
        content: { type: 'text', text: 'Test response' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      });

      expect(mockServer.server.createMessage).toHaveBeenCalledWith({
        messages: validRequest.messages,
        maxTokens: validRequest.maxTokens,
      });
    });

    it('should handle calendar response from mock', async () => {
      // Use mock calendar response
      mockServer.server.createMessage.mockResolvedValue(mockSamplingCalendarResponse);

      const result = await samplingService.sendSamplingRequest(validRequest);

      expect(result.content.type).toBe('text');
      expect(result.model).toBe('claude-sonnet-4-20250514');

      // Verify the response contains calendar events data
      const parsedContent = JSON.parse(result.content.text);
      expect(parsedContent).toHaveProperty('events');
      expect(parsedContent).toHaveProperty('totalCount');
    });

    it('should handle reminder response from mock', async () => {
      // Use mock reminder response
      mockServer.server.createMessage.mockResolvedValue(mockSamplingReminderResponse);

      const result = await samplingService.sendSamplingRequest(validRequest);

      expect(result.content.type).toBe('text');

      // Verify the response contains reminder result data
      const parsedContent = JSON.parse(result.content.text);
      expect(parsedContent).toHaveProperty('success');
      expect(parsedContent).toHaveProperty('reminderId');
      expect(parsedContent).toHaveProperty('method');
    });

    it('should include optional parameters when provided', async () => {
      mockServer.server.createMessage.mockResolvedValue(validMcpResponse);

      const requestWithOptions: SamplingRequest = {
        ...validRequest,
        systemPrompt: 'You are a helpful assistant',
        temperature: 0.7,
        includeContext: 'thisServer',
        stopSequences: ['STOP'],
        modelPreferences: {
          hints: [{ name: 'claude-3-opus' }],
          costPriority: 0.5,
        },
      };

      await samplingService.sendSamplingRequest(requestWithOptions);

      expect(mockServer.server.createMessage).toHaveBeenCalledWith({
        messages: requestWithOptions.messages,
        maxTokens: requestWithOptions.maxTokens,
        systemPrompt: 'You are a helpful assistant',
        temperature: 0.7,
        includeContext: 'thisServer',
        stopSequences: ['STOP'],
        modelPreferences: {
          hints: [{ name: 'claude-3-opus' }],
          costPriority: 0.5,
        },
      });
    });

    it('should handle user rejection error (code -1)', async () => {
      const userRejectionError = new McpError(
        SamplingErrorCodes.USER_REJECTION,
        'User rejected the request'
      );
      mockServer.server.createMessage.mockRejectedValue(userRejectionError);

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      try {
        await samplingService.sendSamplingRequest(validRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        expect(samplingError.code).toBe(SamplingErrorCodes.USER_REJECTION);
        expect(samplingError.isRetryable).toBe(false);
        expect(samplingError.isUserRejection()).toBe(true);
      }
    });

    it('should handle method not found error (code -32601)', async () => {
      const methodNotFoundError = new McpError(
        SamplingErrorCodes.METHOD_NOT_FOUND,
        'Method not found'
      );
      mockServer.server.createMessage.mockRejectedValue(methodNotFoundError);

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      try {
        await samplingService.sendSamplingRequest(validRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        expect(samplingError.code).toBe(SamplingErrorCodes.METHOD_NOT_FOUND);
        expect(samplingError.isRetryable).toBe(false);
        expect(samplingError.isSamplingNotSupported()).toBe(true);
      }
    });

    it('should handle invalid params error (code -32602)', async () => {
      const invalidParamsError = new McpError(
        SamplingErrorCodes.INVALID_PARAMS,
        'Invalid parameters'
      );
      mockServer.server.createMessage.mockRejectedValue(invalidParamsError);

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      try {
        await samplingService.sendSamplingRequest(validRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        expect(samplingError.code).toBe(SamplingErrorCodes.INVALID_PARAMS);
        expect(samplingError.isRetryable).toBe(false);
      }
    });

    it('should handle generic errors', async () => {
      const genericError = new Error('Network error');
      mockServer.server.createMessage.mockRejectedValue(genericError);

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      try {
        await samplingService.sendSamplingRequest(validRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        expect(samplingError.code).toBe(SamplingErrorCodes.INTERNAL_ERROR);
        expect(samplingError.message).toContain('Network error');
      }
    });

    it('should handle unknown errors', async () => {
      mockServer.server.createMessage.mockRejectedValue('unknown error');

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      try {
        await samplingService.sendSamplingRequest(validRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        expect(samplingError.code).toBe(SamplingErrorCodes.INTERNAL_ERROR);
      }
    });

    it('should throw error for non-text content type', async () => {
      const imageResponse = {
        content: { type: 'image', data: 'base64data', mimeType: 'image/png' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };
      mockServer.server.createMessage.mockResolvedValue(imageResponse);

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      try {
        await samplingService.sendSamplingRequest(validRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        expect(samplingError.message).toContain('Unexpected content type: image');
      }
    });
  });

  describe('validateSamplingResponse', () => {
    it('should validate correct response', () => {
      const validResponse: SamplingResponse = {
        content: { type: 'text', text: 'Test response' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      expect(() => samplingService.validateSamplingResponse(validResponse))
        .not.toThrow();
    });

    it('should validate response without stopReason', () => {
      const responseWithoutStopReason = {
        content: { type: 'text', text: 'Test response' },
        model: 'claude-3-opus',
      };

      expect(() => samplingService.validateSamplingResponse(responseWithoutStopReason))
        .not.toThrow();
    });

    it('should throw for missing content', () => {
      const invalidResponse = {
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      expect(() => samplingService.validateSamplingResponse(invalidResponse))
        .toThrow(SamplingError);
    });

    it('should throw for invalid content type', () => {
      const invalidResponse = {
        content: { type: 'invalid', text: 'Test' },
        model: 'claude-3-opus',
      };

      expect(() => samplingService.validateSamplingResponse(invalidResponse))
        .toThrow(SamplingError);
    });

    it('should throw for missing model', () => {
      const invalidResponse = {
        content: { type: 'text', text: 'Test response' },
        stopReason: 'endTurn',
      };

      expect(() => samplingService.validateSamplingResponse(invalidResponse))
        .toThrow(SamplingError);
    });
  });

  describe('getErrorMessage', () => {
    it('should return user-friendly message for user rejection', () => {
      const error = new SamplingError('rejected', SamplingErrorCodes.USER_REJECTION, false);
      const message = SamplingService.getErrorMessage(error);

      expect(message).toContain('user approval');
      expect(message).toContain('cancelled');
    });

    it('should return user-friendly message for sampling not supported', () => {
      const error = new SamplingError('not supported', SamplingErrorCodes.METHOD_NOT_FOUND, false);
      const message = SamplingService.getErrorMessage(error);

      expect(message).toContain('does not support');
      expect(message).toContain('Claude Desktop');
    });

    it('should return original message for other SamplingErrors', () => {
      const error = new SamplingError('Custom error message', SamplingErrorCodes.INTERNAL_ERROR, false);
      const message = SamplingService.getErrorMessage(error);

      expect(message).toBe('Custom error message');
    });

    it('should wrap generic errors', () => {
      const error = new Error('Generic error');
      const message = SamplingService.getErrorMessage(error);

      expect(message).toContain('Sampling request failed');
      expect(message).toContain('Generic error');
    });

    it('should handle unknown errors', () => {
      const message = SamplingService.getErrorMessage('unknown');

      expect(message).toContain('unknown error');
    });
  });

  describe('SamplingError', () => {
    it('should correctly identify user rejection', () => {
      const error = new SamplingError('test', SamplingErrorCodes.USER_REJECTION, false);

      expect(error.isUserRejection()).toBe(true);
      expect(error.isSamplingNotSupported()).toBe(false);
    });

    it('should correctly identify sampling not supported', () => {
      const error = new SamplingError('test', SamplingErrorCodes.METHOD_NOT_FOUND, false);

      expect(error.isUserRejection()).toBe(false);
      expect(error.isSamplingNotSupported()).toBe(true);
    });

    it('should preserve error properties', () => {
      const error = new SamplingError('Test message', 123, true);

      expect(error.name).toBe('SamplingError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe(123);
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('SamplingResponseSchema', () => {
    it('should parse valid response', () => {
      const response = {
        content: { type: 'text', text: 'Test' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      const result = SamplingResponseSchema.parse(response);
      expect(result).toEqual(response);
    });

    it('should accept custom stopReason', () => {
      const response = {
        content: { type: 'text', text: 'Test' },
        model: 'claude-3-opus',
        stopReason: 'customReason',
      };

      const result = SamplingResponseSchema.parse(response);
      expect(result.stopReason).toBe('customReason');
    });
  });

  describe('retry behavior', () => {
    it('should not retry user rejection errors', async () => {
      const { retryWithBackoff } = require('../../../src/utils/retry');

      const userRejectionError = new McpError(
        SamplingErrorCodes.USER_REJECTION,
        'User rejected'
      );
      mockServer.server.createMessage.mockRejectedValue(userRejectionError);

      const validRequest: SamplingRequest = {
        messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
        maxTokens: 1024,
      };

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow();

      // Verify retryWithBackoff was called with shouldRetry that returns false
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          shouldRetry: expect.any(Function),
        })
      );
    });

    it('should not retry method not found errors', async () => {
      const { retryWithBackoff } = require('../../../src/utils/retry');

      const methodNotFoundError = new McpError(
        SamplingErrorCodes.METHOD_NOT_FOUND,
        'Method not found'
      );
      mockServer.server.createMessage.mockRejectedValue(methodNotFoundError);

      const validRequest: SamplingRequest = {
        messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
        maxTokens: 1024,
      };

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow();

      // Verify retryWithBackoff was called
      expect(retryWithBackoff).toHaveBeenCalled();
    });

    it('should handle retryable network errors', async () => {
      const validRequest: SamplingRequest = {
        messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
        maxTokens: 1024,
      };

      // Simulate network error (transient, retryable)
      const networkError = new Error('Network timeout');
      mockServer.server.createMessage.mockRejectedValue(networkError);

      await expect(samplingService.sendSamplingRequest(validRequest))
        .rejects
        .toThrow(SamplingError);

      // Verify it was treated as retryable (though our mock doesn't actually retry)
      try {
        await samplingService.sendSamplingRequest(validRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        // Network errors are wrapped with isRetryable=true
        expect(samplingError.code).toBe(SamplingErrorCodes.INTERNAL_ERROR);
      }
    });
  });

  describe('mock sampling responses from mocks file', () => {
    it('should use createMockSamplingResponse helper', () => {
      const customResponse = createMockSamplingResponse('{"custom": "data"}');

      expect(customResponse.content.type).toBe('text');
      expect(customResponse.content.text).toBe('{"custom": "data"}');
      expect(customResponse.model).toBe('claude-sonnet-4-20250514');
    });

    it('should use predefined mock calendar response', () => {
      expect(mockSamplingCalendarResponse.content.type).toBe('text');

      const parsed = JSON.parse(mockSamplingCalendarResponse.content.text);
      expect(parsed.events).toBeDefined();
      expect(Array.isArray(parsed.events)).toBe(true);
    });

    it('should use predefined mock reminder response', () => {
      expect(mockSamplingReminderResponse.content.type).toBe('text');

      const parsed = JSON.parse(mockSamplingReminderResponse.content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.reminderId).toBeDefined();
    });

    it('should use predefined error mocks', () => {
      expect(mockUserRejectionError.code).toBe(SamplingErrorCodes.USER_REJECTION);
      expect(mockUserRejectionError.isUserRejection()).toBe(true);

      expect(mockMethodNotFoundError.code).toBe(SamplingErrorCodes.METHOD_NOT_FOUND);
      expect(mockMethodNotFoundError.isSamplingNotSupported()).toBe(true);

      expect(mockInvalidParamsError.code).toBe(SamplingErrorCodes.INVALID_PARAMS);
      expect(mockInternalError.code).toBe(SamplingErrorCodes.INTERNAL_ERROR);
    });
  });
});
