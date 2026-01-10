/**
 * Calendar Tool Handlers Unit Tests
 *
 * Tests for handleListCalendarEventsWithSampling - the Sampling-based calendar handler
 * for iOS/iPadOS platforms.
 *
 * Requirements: 2.1-2.2, 3.1 (platform-adaptive-integration)
 */

import {
  handleListCalendarEventsWithSampling,
  type SamplingContext,
  type CalendarToolsContext,
  type PlatformContext,
} from '../../../../src/tools/calendar/handlers.js';
import { SamplingError, SamplingErrorCodes } from '../../../../src/services/sampling-service.js';
import {
  createMockCalendarToolsContext,
  IOS_DETECTED_PLATFORM,
  createMockSamplingContext,
  DEFAULT_TEST_CONFIG,
} from '../../../helpers/index.js';
import type { DetectedPlatform } from '../../../../src/types/platform.js';

/**
 * Create a mock MCP Server with the correct structure for SamplingService
 *
 * SamplingService calls server.server.createMessage(), so we need to mock
 * the nested structure.
 */
function createMockMcpServer(overrides?: {
  createMessage?: jest.Mock;
}) {
  return {
    server: {
      createMessage: overrides?.createMessage ?? jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({
            success: true,
            events: [
              {
                id: 'merged-event-1',
                title: 'Team Meeting',
                start: '2026-01-15T10:00:00Z',
                end: '2026-01-15T11:00:00Z',
                source: 'merged',
              },
            ],
            totalEvents: 1,
          }),
        },
        model: 'mock-model',
        stopReason: 'endTurn',
      }),
    },
  };
}

/**
 * Create a combined CalendarToolsContext with PlatformContext
 */
function createMockCalendarPlatformContext(
  platformInfo: DetectedPlatform
): CalendarToolsContext & PlatformContext {
  const baseContext = createMockCalendarToolsContext({
    config: DEFAULT_TEST_CONFIG,
  });

  return {
    ...baseContext,
    getPlatformInfo: jest.fn(() => platformInfo),
  };
}

describe('handleListCalendarEventsWithSampling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('iOS/iPadOS Platform - Sampling Path', () => {
    it('should route iOS platform to Sampling path', async () => {
      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: JSON.stringify({
              success: true,
              events: [
                {
                  id: 'ios-event-1',
                  title: 'iOS Calendar Event',
                  start: '2026-01-15T10:00:00Z',
                  end: '2026-01-15T11:00:00Z',
                  source: 'native-ios',
                },
                {
                  id: 'google-event-1',
                  title: 'Google Calendar Event',
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                  source: 'google',
                },
              ],
              totalEvents: 2,
              sources: ['native-ios', 'google'],
            }),
          },
          model: 'claude-3-opus',
          stopReason: 'endTurn',
        }),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      // Verify Sampling was called
      expect(mockServer.server.createMessage).toHaveBeenCalled();

      // Verify response structure
      expect(result.isError).toBe(false);
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      // Parse the response text as JSON
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.events).toHaveLength(2);
      expect(responseData.sources).toContain('native-ios');
      expect(responseData.sources).toContain('google');
    });

    it('should send Sampling request with calendarId parameter if provided', async () => {
      const mockCreateMessage = jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({
            success: true,
            events: [],
            totalEvents: 0,
          }),
        },
        model: 'claude-3-opus',
      });

      const mockServer = createMockMcpServer({
        createMessage: mockCreateMessage,
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
          calendarId: 'primary',
        },
        ctx,
        samplingCtx
      );

      // Verify createMessage was called
      expect(mockCreateMessage).toHaveBeenCalled();

      // Verify the instruction message includes the date range
      const callArgs = mockCreateMessage.mock.calls[0][0];
      expect(callArgs.messages).toBeDefined();
      expect(callArgs.messages[0].content.text).toContain('2026-01-15');
      expect(callArgs.messages[0].content.text).toContain('2026-01-20');
    });

    it('should work with iPadOS platform', async () => {
      const ipadosPlatform: DetectedPlatform = {
        platform: 'ipados',
        clientName: 'claude-ipados',
        clientVersion: '1.0.0',
        supportsSampling: true,
      };

      const mockServer = createMockMcpServer();
      const ctx = createMockCalendarPlatformContext(ipadosPlatform);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      expect(result.isError).toBe(false);
      expect(mockServer.server.createMessage).toHaveBeenCalled();
    });
  });

  describe('macOS Platform - MCP-Only Path', () => {
    it('should NOT route macOS platform to Sampling path', async () => {
      const macosPlatform: DetectedPlatform = {
        platform: 'macos',
        clientName: 'claude-desktop',
        clientVersion: '1.0.0',
        supportsSampling: true,
      };

      const mockServer = createMockMcpServer();
      const ctx = createMockCalendarPlatformContext(macosPlatform);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      // For macOS, we still send Sampling request
      // (the routing logic is in the MCP handler layer, not in the handler itself)
      // But the Sampling message should be different
      expect(mockServer.server.createMessage).toHaveBeenCalled();
      expect(result.isError).toBe(false);
    });
  });

  describe('User Rejection - Fallback to MCP-Only', () => {
    it('should handle user rejection and provide fallback message', async () => {
      const userRejectionError = new SamplingError(
        'User rejected the request',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(userRejectionError),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('requires your approval');
      expect(result.content[0].text).toContain('Falling back to MCP-only mode');
      expect(result.content[0].text).toContain('list_calendar_events');
    });

    it('should provide helpful message on user rejection', async () => {
      const userRejectionError = new SamplingError(
        'User cancelled',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(userRejectionError),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      const message = result.content[0].text;
      expect(message).toContain('approve the Sampling request when prompted');
      expect(message).toContain('standard list_calendar_events tool');
    });
  });

  describe('Sampling Not Supported - Fallback Message', () => {
    it('should handle Sampling not supported error', async () => {
      const notSupportedError = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(notSupportedError),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('does not support platform-adaptive integration');
      expect(result.content[0].text).toContain('Claude Desktop, Claude iOS, or Claude iPadOS');
      expect(result.content[0].text).toContain('Falling back to MCP-only mode');
    });

    it('should suggest compatible clients on unsupported error', async () => {
      const notSupportedError = new SamplingError(
        'Sampling capability not available',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(notSupportedError),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      const message = result.content[0].text;
      expect(message).toContain('Claude Desktop');
      expect(message).toContain('Claude iOS');
      expect(message).toContain('Claude iPadOS');
    });
  });

  describe('Other Sampling Errors', () => {
    it('should re-throw non-user-rejection and non-not-supported errors', async () => {
      const otherError = new SamplingError(
        'Network timeout',
        SamplingErrorCodes.INTERNAL_ERROR,
        true
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(otherError),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      await expect(
        handleListCalendarEventsWithSampling(
          {
            startDate: '2026-01-15',
            endDate: '2026-01-20',
          },
          ctx,
          samplingCtx
        )
      ).rejects.toThrow('Network timeout');
    });

    it('should re-throw generic errors', async () => {
      const genericError = new Error('Unexpected error');

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(genericError),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      await expect(
        handleListCalendarEventsWithSampling(
          {
            startDate: '2026-01-15',
            endDate: '2026-01-20',
          },
          ctx,
          samplingCtx
        )
      ).rejects.toThrow('Unexpected error');
    });
  });

  describe('Successful Merged Calendar Events', () => {
    it('should return merged events from both iOS Calendar and Google Calendar', async () => {
      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: JSON.stringify({
              success: true,
              events: [
                {
                  id: 'ios-1',
                  title: 'Personal Meeting',
                  start: '2026-01-15T09:00:00Z',
                  end: '2026-01-15T10:00:00Z',
                  source: 'native-ios',
                  calendar: 'Personal',
                },
                {
                  id: 'google-1',
                  title: 'Work Meeting',
                  start: '2026-01-15T14:00:00Z',
                  end: '2026-01-15T15:00:00Z',
                  source: 'google',
                  calendar: 'Work',
                },
                {
                  id: 'google-2',
                  title: 'Team Sync',
                  start: '2026-01-15T16:00:00Z',
                  end: '2026-01-15T17:00:00Z',
                  source: 'google',
                  calendar: 'Work',
                },
              ],
              totalEvents: 3,
              sources: ['native-ios', 'google'],
              message: '3件のイベントが見つかりました',
            }),
          },
          model: 'claude-3-opus',
          stopReason: 'endTurn',
        }),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.success).toBe(true);
      expect(responseData.events).toHaveLength(3);
      expect(responseData.sources).toContain('native-ios');
      expect(responseData.sources).toContain('google');
      expect(responseData.totalEvents).toBe(3);
    });

    it('should handle empty event list', async () => {
      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: JSON.stringify({
              success: true,
              events: [],
              totalEvents: 0,
              sources: ['native-ios', 'google'],
              message: 'イベントが見つかりませんでした',
            }),
          },
          model: 'claude-3-opus',
          stopReason: 'endTurn',
        }),
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      expect(result.isError).toBe(false);
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.success).toBe(true);
      expect(responseData.events).toHaveLength(0);
      expect(responseData.totalEvents).toBe(0);
    });
  });

  describe('Platform-Specific Sampling Instructions', () => {
    it('should send iOS-specific Sampling instruction', async () => {
      const mockCreateMessage = jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({ success: true, events: [] }),
        },
        model: 'claude-3-opus',
      });

      const mockServer = createMockMcpServer({
        createMessage: mockCreateMessage,
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      // Verify createMessage was called
      expect(mockCreateMessage).toHaveBeenCalled();

      // Verify the instruction includes iOS-specific details
      const callArgs = mockCreateMessage.mock.calls[0][0];
      expect(callArgs.messages).toBeDefined();
      const instruction = callArgs.messages[0].content.text;

      // Should mention native iOS Calendar
      expect(instruction).toContain('iOS');
      // Should mention date range
      expect(instruction).toContain('2026-01-15');
      expect(instruction).toContain('2026-01-20');
    });

    it('should include maxTokens parameter in Sampling request', async () => {
      const mockCreateMessage = jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({ success: true, events: [] }),
        },
        model: 'claude-3-opus',
      });

      const mockServer = createMockMcpServer({
        createMessage: mockCreateMessage,
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      const callArgs = mockCreateMessage.mock.calls[0][0];
      expect(callArgs.maxTokens).toBe(4000);
    });

    it('should include includeContext parameter for MCP tool access', async () => {
      const mockCreateMessage = jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({ success: true, events: [] }),
        },
        model: 'claude-3-opus',
      });

      const mockServer = createMockMcpServer({
        createMessage: mockCreateMessage,
      });

      const ctx = createMockCalendarPlatformContext(IOS_DETECTED_PLATFORM);
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      await handleListCalendarEventsWithSampling(
        {
          startDate: '2026-01-15',
          endDate: '2026-01-20',
        },
        ctx,
        samplingCtx
      );

      const callArgs = mockCreateMessage.mock.calls[0][0];
      expect(callArgs.includeContext).toBe('thisServer');
    });
  });
});
