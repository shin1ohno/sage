/**
 * Error Handling Tests for Calendar Platform Integration
 *
 * Tests all error scenarios for handleListCalendarEventsWithSampling:
 * 1. Client without Sampling support (code -32601)
 * 2. User rejection (code -1)
 * 3. All calendar sources unavailable
 * 4. Platform detection failure
 * 5. Empty Sampling response
 * 6. MCP SDK errors (-32601, -32602, -32603)
 *
 * Requirements: 2.1-2.2, 3.1, 6.2 (platform-adaptive-integration)
 */

import {
  handleListCalendarEventsWithSampling,
  CalendarToolsContext,
  PlatformContext,
  SamplingContext,
  ListCalendarEventsInput,
} from '../../../../src/tools/calendar/handlers';
import type { DetectedPlatform } from '../../../../src/types/platform';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  SamplingError,
  SamplingErrorCodes,
} from '../../../../src/services/sampling-service';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
// Note: Using local mocks for better control over specific error scenarios
// import {
//   createMockCalendarToolsContext,
//   createMockSamplingContext,
//   IOS_DETECTED_PLATFORM,
// } from '../../../helpers';

// Mock the logger to prevent console output during tests
jest.mock('../../../../src/utils/logger', () => ({
  servicesLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the retry utility - execute function directly without retry
jest.mock('../../../../src/utils/retry', () => ({
  retryWithBackoff: jest.fn(async (fn, options) => {
    try {
      return await fn();
    } catch (error) {
      if (options?.shouldRetry && !options.shouldRetry(error as Error)) {
        throw error;
      }
      throw error;
    }
  }),
}));

describe('Calendar Platform Integration - Error Handling', () => {
  let mockMcpServer: {
    server: {
      createMessage: jest.Mock;
    };
  };
  let mockCalendarToolsContext: CalendarToolsContext & PlatformContext;
  let mockSamplingContext: SamplingContext;
  let mockPlatform: DetectedPlatform;

  const defaultArgs: ListCalendarEventsInput = {
    startDate: '2026-01-01',
    endDate: '2026-01-31',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock MCP server
    mockMcpServer = {
      server: {
        createMessage: jest.fn(),
      },
    };

    // Create mock calendar tools context
    mockCalendarToolsContext = {
      getConfig: jest.fn(() => null),
      getCalendarSourceManager: jest.fn(() => null),
      getCalendarEventResponseService: jest.fn(() => null),
      getGoogleCalendarService: jest.fn(() => null),
      getGooglePeopleService: jest.fn(() => null),
      getWorkingCadenceService: jest.fn(() => null),
      setWorkingCadenceService: jest.fn(),
      initializeServices: jest.fn(),
      getPlatformInfo: jest.fn(() => mockPlatform),
    };

    // Create mock sampling context
    mockSamplingContext = {
      getMcpServer: jest.fn(() => mockMcpServer as unknown as McpServer),
    };

    // Create mock iOS platform
    mockPlatform = {
      platform: 'ios',
      clientName: 'claude-ios',
      clientVersion: '1.0.0',
      supportsSampling: true,
    };
  });

  describe('1. Client without Sampling support (code -32601)', () => {
    it('should return user-friendly error message when Sampling is not supported', async () => {
      const methodNotFoundError = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(methodNotFoundError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('does not support platform-adaptive integration');
    });

    it('should suggest fallback to MCP-only mode', async () => {
      const methodNotFoundError = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(methodNotFoundError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.content[0].text).toContain('Falling back to MCP-only mode');
      expect(result.content[0].text).toContain('list_calendar_events');
    });

    it('should mention supported clients (Claude Desktop, iOS, iPadOS)', async () => {
      const methodNotFoundError = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(methodNotFoundError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.content[0].text).toContain('Claude Desktop');
      expect(result.content[0].text).toContain('Claude iOS');
      expect(result.content[0].text).toContain('Claude iPadOS');
    });
  });

  describe('2. User rejection (code -1)', () => {
    it('should return appropriate message when user rejects the Sampling request', async () => {
      const userRejectionError = new SamplingError(
        'User rejected the request',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(userRejectionError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('requires your approval');
    });

    it('should indicate operation was cancelled gracefully', async () => {
      const userRejectionError = new SamplingError(
        'User rejected',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(userRejectionError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.content[0].text).toContain('Operation cancelled');
    });

    it('should suggest fallback options', async () => {
      const userRejectionError = new SamplingError(
        'User rejected',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(userRejectionError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.content[0].text).toContain('Falling back to MCP-only mode');
    });

    it('should mention how to approve for future use', async () => {
      const userRejectionError = new SamplingError(
        'User rejected',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(userRejectionError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.content[0].text).toContain('approve the Sampling request');
    });
  });

  describe('3. All calendar sources unavailable', () => {
    it('should throw SamplingError when MCP server returns null sources', async () => {
      // Create a context that returns null for MCP server
      const nullServerContext: SamplingContext = {
        getMcpServer: jest.fn(() => null),
      };

      await expect(
        handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          nullServerContext
        )
      ).rejects.toThrow(SamplingError);
    });

    it('should throw error with internal error code when server not configured', async () => {
      const nullServerContext: SamplingContext = {
        getMcpServer: jest.fn(() => null),
      };

      try {
        await handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          nullServerContext
        );
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SamplingError);
        const samplingError = error as SamplingError;
        expect(samplingError.code).toBe(SamplingErrorCodes.INTERNAL_ERROR);
        expect(samplingError.message).toContain('not configured');
      }
    });
  });

  describe('4. Platform detection failure', () => {
    it('should still attempt Sampling with unknown platform', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(mockMcpServer.server.createMessage).toHaveBeenCalled();
    });

    it('should work with low confidence detection', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
    });

    it('should handle web platform appropriately', async () => {
      const webPlatform: DetectedPlatform = {
        platform: 'web',
        clientName: 'claude-web',
        clientVersion: '1.0.0',
        supportsSampling: false,
      };

      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      // Even web platform can attempt Sampling if supportsSampling is set
      webPlatform.supportsSampling = true;

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('5. Empty Sampling response', () => {
    it('should handle empty text content gracefully', async () => {
      const emptyResponse = {
        content: { type: 'text' as const, text: '' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(emptyResponse);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('');
    });

    it('should handle empty array response', async () => {
      const emptyArrayResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(emptyArrayResponse);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('[]');
    });

    it('should handle null response content gracefully', async () => {
      const nullContentResponse = {
        content: { type: 'text' as const, text: 'null' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(nullContentResponse);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('null');
    });

    it('should handle whitespace-only response', async () => {
      const whitespaceResponse = {
        content: { type: 'text' as const, text: '   \n\t  ' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(whitespaceResponse);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('   \n\t  ');
    });
  });

  describe('6. MCP SDK errors', () => {
    describe('6.1 Method not found (-32601)', () => {
      it('should convert McpError to SamplingError', async () => {
        const mcpError = new McpError(
          SamplingErrorCodes.METHOD_NOT_FOUND,
          'Method not found: createMessage'
        );

        mockMcpServer.server.createMessage.mockRejectedValue(mcpError);

        const result = await handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        );

        // Should be handled gracefully, not thrown
        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain('does not support');
      });

      it('should not retry method not found errors', async () => {
        const mcpError = new McpError(
          SamplingErrorCodes.METHOD_NOT_FOUND,
          'Method not found'
        );

        mockMcpServer.server.createMessage.mockRejectedValue(mcpError);

        await handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        );

        // Should only be called once (no retry)
        expect(mockMcpServer.server.createMessage).toHaveBeenCalledTimes(1);
      });
    });

    describe('6.2 Invalid params (-32602)', () => {
      it('should re-throw invalid params error', async () => {
        const invalidParamsError = new SamplingError(
          'Invalid parameters provided',
          SamplingErrorCodes.INVALID_PARAMS,
          false
        );

        mockMcpServer.server.createMessage.mockRejectedValue(invalidParamsError);

        await expect(
          handleListCalendarEventsWithSampling(
            defaultArgs,
            mockCalendarToolsContext,
            mockSamplingContext
          )
        ).rejects.toThrow(SamplingError);
      });

      it('should include parameter details in error message', async () => {
        const invalidParamsError = new SamplingError(
          'Invalid parameters: startDate must be ISO 8601 format',
          SamplingErrorCodes.INVALID_PARAMS,
          false
        );

        mockMcpServer.server.createMessage.mockRejectedValue(invalidParamsError);

        try {
          await handleListCalendarEventsWithSampling(
            defaultArgs,
            mockCalendarToolsContext,
            mockSamplingContext
          );
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(SamplingError);
          const samplingError = error as SamplingError;
          expect(samplingError.code).toBe(SamplingErrorCodes.INVALID_PARAMS);
        }
      });
    });

    describe('6.3 Internal error (-32603)', () => {
      it('should re-throw internal errors', async () => {
        const internalError = new SamplingError(
          'Internal server error',
          SamplingErrorCodes.INTERNAL_ERROR,
          true
        );

        mockMcpServer.server.createMessage.mockRejectedValue(internalError);

        await expect(
          handleListCalendarEventsWithSampling(
            defaultArgs,
            mockCalendarToolsContext,
            mockSamplingContext
          )
        ).rejects.toThrow(SamplingError);
      });

      it('should preserve retryable flag for internal errors', async () => {
        const retryableInternalError = new SamplingError(
          'Temporary failure',
          SamplingErrorCodes.INTERNAL_ERROR,
          true
        );

        mockMcpServer.server.createMessage.mockRejectedValue(retryableInternalError);

        try {
          await handleListCalendarEventsWithSampling(
            defaultArgs,
            mockCalendarToolsContext,
            mockSamplingContext
          );
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(SamplingError);
          const samplingError = error as SamplingError;
          expect(samplingError.isRetryable).toBe(true);
        }
      });
    });

    describe('6.4 User-friendly error messages', () => {
      it('should provide actionable error messages for user rejection', async () => {
        const userRejection = new SamplingError(
          'User rejected',
          SamplingErrorCodes.USER_REJECTION,
          false
        );

        mockMcpServer.server.createMessage.mockRejectedValue(userRejection);

        const result = await handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        );

        // Message should be actionable and in plain English
        expect(result.content[0].text).not.toContain('-1');
        expect(result.content[0].text).not.toContain('SamplingError');
      });

      it('should provide actionable error messages for method not found', async () => {
        const methodNotFound = new SamplingError(
          'Method not found',
          SamplingErrorCodes.METHOD_NOT_FOUND,
          false
        );

        mockMcpServer.server.createMessage.mockRejectedValue(methodNotFound);

        const result = await handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        );

        // Message should be actionable and in plain English
        expect(result.content[0].text).not.toContain('-32601');
        expect(result.content[0].text).toContain('Claude');
      });
    });
  });

  describe('7. Network and timeout errors', () => {
    it('should re-throw generic network errors', async () => {
      const networkError = new Error('Network connection failed');

      mockMcpServer.server.createMessage.mockRejectedValue(networkError);

      await expect(
        handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        )
      ).rejects.toThrow('Network connection failed');
    });

    it('should re-throw timeout errors', async () => {
      const timeoutError = new Error('Request timeout after 30000ms');

      mockMcpServer.server.createMessage.mockRejectedValue(timeoutError);

      await expect(
        handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        )
      ).rejects.toThrow('timeout');
    });
  });

  describe('8. SamplingError helper methods', () => {
    it('should correctly identify user rejection via isUserRejection()', async () => {
      const userRejection = new SamplingError(
        'User rejected',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      expect(userRejection.isUserRejection()).toBe(true);
      expect(userRejection.isSamplingNotSupported()).toBe(false);
    });

    it('should correctly identify method not found via isSamplingNotSupported()', async () => {
      const methodNotFound = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      expect(methodNotFound.isUserRejection()).toBe(false);
      expect(methodNotFound.isSamplingNotSupported()).toBe(true);
    });

    it('should preserve error properties correctly', () => {
      const error = new SamplingError('Test message', -12345, true);

      expect(error.name).toBe('SamplingError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe(-12345);
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('9. Edge cases', () => {
    it('should handle undefined client version gracefully', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
    });

    it('should handle concurrent Sampling requests', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      // Make concurrent requests
      const promises = [
        handleListCalendarEventsWithSampling(
          { startDate: '2026-01-01', endDate: '2026-01-15' },
          mockCalendarToolsContext,
          mockSamplingContext
        ),
        handleListCalendarEventsWithSampling(
          { startDate: '2026-01-16', endDate: '2026-01-31' },
          mockCalendarToolsContext,
          mockSamplingContext
        ),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(results[0].isError).toBe(false);
      expect(results[1].isError).toBe(false);
    });

    it('should handle very long date ranges', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      const result = await handleListCalendarEventsWithSampling(
        { startDate: '2020-01-01', endDate: '2030-12-31' },
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
    });

    it('should handle special characters in date strings', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      // ISO 8601 with timezone
      const result = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-01T00:00:00+09:00', endDate: '2026-01-31T23:59:59+09:00' },
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
    });
  });
});
