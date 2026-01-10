/**
 * Unit tests for handleListCalendarEventsWithSampling
 *
 * Tests the Sampling-based calendar event retrieval for iOS/iPadOS platforms.
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

// Mock the logger to prevent console output during tests
jest.mock('../../../../src/utils/logger', () => ({
  servicesLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the retry utility
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

describe('handleListCalendarEventsWithSampling', () => {
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
    // Reset mocks
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

  describe('successful Sampling request', () => {
    it('should return Claude response for successful Sampling request', async () => {
      const mockResponse = {
        content: {
          type: 'text' as const,
          text: JSON.stringify([
            {
              id: 'event1',
              title: 'Meeting',
              start: '2026-01-15T10:00:00Z',
              end: '2026-01-15T11:00:00Z',
              source: 'google',
            },
            {
              id: 'event2',
              title: 'Lunch',
              start: '2026-01-15T12:00:00Z',
              end: '2026-01-15T13:00:00Z',
              source: 'native-ios',
            },
          ]),
        },
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
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe(mockResponse.content.text);
    });

    it('should pass correct Sampling request parameters', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(mockMcpServer.server.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('2026-01-01'),
              }),
            }),
          ]),
          maxTokens: 4000,
          includeContext: 'thisServer',
        })
      );
    });

    it('should include date range in Sampling message', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      const args: ListCalendarEventsInput = {
        startDate: '2026-03-01',
        endDate: '2026-03-15',
      };

      await handleListCalendarEventsWithSampling(
        args,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(mockMcpServer.server.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                text: expect.stringMatching(/2026-03-01.*2026-03-15/s),
              }),
            }),
          ]),
        })
      );
    });
  });

  describe('user rejection handling', () => {
    it('should return fallback message on user rejection (code -1)', async () => {
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

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain(
        'Platform-adaptive integration requires your approval'
      );
      expect(result.content[0].text).toContain('Operation cancelled');
      expect(result.content[0].text).toContain('Falling back to MCP-only mode');
    });
  });

  describe('Sampling not supported handling', () => {
    it('should return fallback message when client does not support Sampling (code -32601)', async () => {
      const notSupportedError = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(notSupportedError);

      const result = await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain(
        'does not support platform-adaptive integration'
      );
      expect(result.content[0].text).toContain('Claude Desktop');
      expect(result.content[0].text).toContain('Claude iOS');
    });
  });

  describe('other error handling', () => {
    it('should re-throw non-Sampling errors', async () => {
      const genericError = new Error('Network failure');

      mockMcpServer.server.createMessage.mockRejectedValue(genericError);

      await expect(
        handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        )
      ).rejects.toThrow('Network failure');
    });

    it('should re-throw SamplingError with other codes', async () => {
      const otherError = new SamplingError(
        'Invalid params',
        SamplingErrorCodes.INVALID_PARAMS,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(otherError);

      await expect(
        handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          mockSamplingContext
        )
      ).rejects.toThrow(SamplingError);
    });
  });

  describe('platform-specific behavior', () => {
    it('should work with iPadOS platform', async () => {
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

      // Verify iOS/iPad message was sent
      expect(mockMcpServer.server.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                text: expect.stringContaining('iOS/iPad'),
              }),
            }),
          ]),
        })
      );
    });

    it('should include iOS-specific instructions for iOS platform', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(mockMcpServer.server.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                text: expect.stringContaining('iOS'),
              }),
            }),
          ]),
        })
      );
    });
  });

  describe('context handling', () => {
    it('should call getMcpServer from sampling context', async () => {
      const mockResponse = {
        content: { type: 'text' as const, text: '[]' },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      await handleListCalendarEventsWithSampling(
        defaultArgs,
        mockCalendarToolsContext,
        mockSamplingContext
      );

      expect(mockSamplingContext.getMcpServer).toHaveBeenCalled();
    });

    it('should handle null MCP server gracefully', async () => {
      const nullServerContext: SamplingContext = {
        getMcpServer: jest.fn(() => null),
      };

      // SamplingService should throw when server is null
      await expect(
        handleListCalendarEventsWithSampling(
          defaultArgs,
          mockCalendarToolsContext,
          nullServerContext
        )
      ).rejects.toThrow(SamplingError);
    });
  });
});
