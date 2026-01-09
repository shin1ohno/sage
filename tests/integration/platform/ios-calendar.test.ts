/**
 * iOS Platform Calendar Integration Tests
 *
 * Tests the complete iOS calendar integration flow using MCP Sampling.
 * On iOS/iPadOS, sage uses Sampling to request Claude to fetch calendar events
 * from both MCP (Google Calendar) and native iOS Calendar, then merge the results.
 *
 * Requirements: 2.1-2.2, 3.1, 6.2 (platform-adaptive-integration)
 */

import type { SamplingContext as CalendarSamplingContext } from '../../../src/tools/calendar/handlers.js';
import {
  handleListCalendarEventsWithSampling,
  type CalendarToolsContext,
  type PlatformContext,
} from '../../../src/tools/calendar/handlers.js';
import {
  createMockCalendarToolsContext,
  createMockSamplingContext,
  IOS_DETECTED_PLATFORM,
  DEFAULT_TEST_CONFIG,
} from '../../helpers/index.js';
import { SamplingError, SamplingErrorCodes } from '../../../src/services/sampling-service.js';
import { IntegrationStrategyManager } from '../../../src/services/integration-strategy-manager.js';

/**
 * Helper function to create a mock calendar context with platform support
 *
 * Creates a CalendarToolsContext with getPlatformInfo method added
 */
function createMockCalendarContextWithPlatform() {
  const baseContext = createMockCalendarToolsContext({
    config: DEFAULT_TEST_CONFIG,
  });

  // Add getPlatformInfo to make it compatible with PlatformContext
  const contextWithPlatform = baseContext as unknown as CalendarToolsContext & PlatformContext;
  contextWithPlatform.getPlatformInfo = jest.fn(() => IOS_DETECTED_PLATFORM);

  return contextWithPlatform;
}

describe('iOS Platform Calendar Integration', () => {
  // Sample events from different sources
  const sampleGoogleEvents = [
    {
      id: 'google-event-1',
      title: 'Team Meeting',
      start: '2026-01-15T10:00:00+09:00',
      end: '2026-01-15T11:00:00+09:00',
      isAllDay: false,
      source: 'google',
      iCalUID: 'google-event-1@google.com',
    },
    {
      id: 'google-event-2',
      title: 'Project Review',
      start: '2026-01-16T14:00:00+09:00',
      end: '2026-01-16T15:00:00+09:00',
      isAllDay: false,
      source: 'google',
      iCalUID: 'google-event-2@google.com',
    },
  ];

  const sampleNativeEvents = [
    {
      id: 'native-event-1',
      title: 'Doctor Appointment',
      start: '2026-01-15T15:00:00+09:00',
      end: '2026-01-15T16:00:00+09:00',
      isAllDay: false,
      source: 'native-ios',
      iCalUID: 'native-event-1@icloud.com',
    },
    {
      id: 'native-event-2',
      title: 'Family Dinner',
      start: '2026-01-17T18:00:00+09:00',
      end: '2026-01-17T20:00:00+09:00',
      isAllDay: false,
      source: 'native-ios',
      iCalUID: 'native-event-2@icloud.com',
    },
  ];

  // Merged events (what Claude would return after merging)
  const mergedEvents = [...sampleGoogleEvents, ...sampleNativeEvents];

  describe('Complete Integration Flow', () => {
    it('should use Sampling to fetch and merge calendar events on iOS', async () => {
      // Create mock context with platform info
      const calendarContext = createMockCalendarContextWithPlatform();

      // Create mock Sampling context that returns merged events
      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: jest.fn().mockResolvedValue({
              content: {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  events: mergedEvents,
                  sources: ['google', 'native-ios'],
                  message: '4件のイベントが見つかりました（Google: 2件、iOS Calendar: 2件）',
                }),
              },
              model: 'claude-3-5-sonnet-20241022',
              stopReason: 'endTurn',
            }),
          },
        })),
      }) as CalendarSamplingContext;

      // Call the handler with Sampling
      const response = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      // Verify response structure
      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: expect.stringContaining('success'),
          },
        ],
        isError: false,
      });

      // Parse the response content
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.events).toHaveLength(4);
      expect(responseData.sources).toContain('google');
      expect(responseData.sources).toContain('native-ios');

      // Verify events from both sources are included
      const eventSources = responseData.events.map((e: { source: string }) => e.source);
      expect(eventSources.filter((s: string) => s === 'google')).toHaveLength(2);
      expect(eventSources.filter((s: string) => s === 'native-ios')).toHaveLength(2);
    });

    it('should send correct Sampling instruction message to Claude', async () => {
      // Track the message sent to createMessage
      let capturedMessage: string | undefined;

      const calendarContext = createMockCalendarContextWithPlatform();

      const mockCreateMessage = jest.fn().mockImplementation((params) => {
        // Capture the message from the Sampling request
        if (params.messages && params.messages.length > 0) {
          const firstMessage = params.messages[0];
          if (firstMessage.content && firstMessage.content.type === 'text') {
            capturedMessage = firstMessage.content.text;
          }
        }
        return Promise.resolve({
          content: {
            type: 'text',
            text: JSON.stringify({ success: true, events: [] }),
          },
          model: 'claude-3-5-sonnet-20241022',
          stopReason: 'endTurn',
        });
      });

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      // Verify createMessage was called
      expect(mockCreateMessage).toHaveBeenCalled();

      // Verify the Sampling message contains expected instructions
      expect(capturedMessage).toBeDefined();
      expect(capturedMessage).toContain('iOS');
      expect(capturedMessage).toContain('list_calendar_events');
      expect(capturedMessage).toContain('2026-01-15');
      expect(capturedMessage).toContain('2026-01-20');
      expect(capturedMessage).toContain('native');
      expect(capturedMessage).toContain('merge');
    });

    it('should verify Sampling request is sent with correct parameters', async () => {
      let capturedParams: Record<string, unknown> | undefined;

      const calendarContext = createMockCalendarContextWithPlatform();

      const mockCreateMessage = jest.fn().mockImplementation((params) => {
        capturedParams = params;
        return Promise.resolve({
          content: {
            type: 'text',
            text: JSON.stringify({ success: true, events: [] }),
          },
          model: 'claude-3-5-sonnet-20241022',
          stopReason: 'endTurn',
        });
      });

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      // Verify Sampling request parameters
      expect(capturedParams).toBeDefined();
      expect(capturedParams!.messages).toBeDefined();
      expect(capturedParams!.maxTokens).toBe(4000);
      expect(capturedParams!.includeContext).toBe('thisServer');
    });
  });

  describe('IntegrationStrategyManager', () => {
    const strategyManager = new IntegrationStrategyManager();

    it('should return Sampling strategy for iOS platform', () => {
      const strategy = strategyManager.getCalendarStrategy(IOS_DETECTED_PLATFORM, {
        startDate: '2026-01-15',
        endDate: '2026-01-20',
      });

      expect(strategy.useSampling).toBe(true);
      expect(strategy.samplingMessage).toBeDefined();
      expect(strategy.mcpToolsToCall).toContain('list_calendar_events');
      expect(strategy.nativeIntegrations).toContain('ios-calendar');
    });

    it('should build correct Sampling message for iOS calendar', () => {
      const message = strategyManager.buildCalendarSamplingMessage(IOS_DETECTED_PLATFORM, {
        startDate: '2026-01-15',
        endDate: '2026-01-20',
      });

      // Verify message contains all required instructions
      expect(message).toContain('iOS');
      expect(message).toContain('list_calendar_events');
      expect(message).toContain('"startDate": "2026-01-15"');
      expect(message).toContain('"endDate": "2026-01-20"');
      expect(message).toContain('native iOS Calendar API');
      expect(message).toContain('iCalUID');
      expect(message).toContain('merge');
      expect(message).toContain('"source"');
    });

    it('should build message for iPadOS platform as well', () => {
      const iPadOSPlatform = {
        ...IOS_DETECTED_PLATFORM,
        platform: 'ipados' as const,
        clientName: 'claude-ipados',
      };

      const strategy = strategyManager.getCalendarStrategy(iPadOSPlatform, {
        startDate: '2026-01-15',
        endDate: '2026-01-20',
      });

      expect(strategy.useSampling).toBe(true);
      expect(strategy.samplingMessage).toContain('iPadOS');
    });
  });

  describe('Error Handling', () => {
    it('should handle user rejection gracefully', async () => {
      const calendarContext = createMockCalendarContextWithPlatform();

      // Mock user rejection error
      const mockCreateMessage = jest.fn().mockRejectedValue(
        new SamplingError(
          'User rejected the Sampling request',
          SamplingErrorCodes.USER_REJECTION,
          false
        )
      );

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      const response = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      // Verify graceful handling of user rejection
      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('approval');
      expect(response.content[0].text).toContain('cancelled');
      expect(response.content[0].text).toContain('MCP-only mode');
    });

    it('should handle Sampling not supported error', async () => {
      const calendarContext = createMockCalendarContextWithPlatform();

      // Mock method not found error
      const mockCreateMessage = jest.fn().mockRejectedValue(
        new SamplingError(
          'Client does not support Sampling',
          SamplingErrorCodes.METHOD_NOT_FOUND,
          false
        )
      );

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      const response = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      // Verify graceful handling of unsupported Sampling
      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('does not support');
      expect(response.content[0].text).toContain('Claude Desktop');
      expect(response.content[0].text).toContain('MCP-only mode');
    });

    it('should propagate other errors', async () => {
      const calendarContext = createMockCalendarContextWithPlatform();

      // Mock a different error
      const mockCreateMessage = jest.fn().mockRejectedValue(
        new Error('Network connection failed')
      );

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      // Other errors should be thrown
      await expect(
        handleListCalendarEventsWithSampling(
          { startDate: '2026-01-15', endDate: '2026-01-20' },
          calendarContext,
          mockSamplingContext,
          IOS_DETECTED_PLATFORM
        )
      ).rejects.toThrow();
    });
  });

  describe('Response Format Verification', () => {
    it('should return events with proper source attribution', async () => {
      const calendarContext = createMockCalendarContextWithPlatform();

      // Create response with source-attributed events
      const eventsWithSources = [
        {
          id: 'google-1',
          title: 'Google Event',
          start: '2026-01-15T10:00:00+09:00',
          end: '2026-01-15T11:00:00+09:00',
          isAllDay: false,
          source: 'google',
          iCalUID: 'google-1@google.com',
        },
        {
          id: 'native-1',
          title: 'Native Event',
          start: '2026-01-15T14:00:00+09:00',
          end: '2026-01-15T15:00:00+09:00',
          isAllDay: false,
          source: 'native-ios',
          iCalUID: 'native-1@icloud.com',
        },
      ];

      const mockCreateMessage = jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({
            success: true,
            events: eventsWithSources,
            sources: ['google', 'native-ios'],
          }),
        },
        model: 'claude-3-5-sonnet-20241022',
        stopReason: 'endTurn',
      });

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      const response = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      const responseData = JSON.parse(response.content[0].text);

      // Verify each event has source attribution
      for (const event of responseData.events) {
        expect(event.source).toBeDefined();
        expect(['google', 'native-ios']).toContain(event.source);
      }
    });

    it('should handle empty event responses', async () => {
      const calendarContext = createMockCalendarContextWithPlatform();

      const mockCreateMessage = jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({
            success: true,
            events: [],
            sources: ['google', 'native-ios'],
            message: '指定した期間にイベントが見つかりませんでした。',
          }),
        },
        model: 'claude-3-5-sonnet-20241022',
        stopReason: 'endTurn',
      });

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      const response = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      const responseData = JSON.parse(response.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.events).toHaveLength(0);
    });
  });

  describe('Platform Detection Verification', () => {
    it('should correctly identify iOS platform for Sampling', () => {
      expect(IOS_DETECTED_PLATFORM.platform).toBe('ios');
      expect(IOS_DETECTED_PLATFORM.supportsSampling).toBe(true);
      expect(IOS_DETECTED_PLATFORM.detectionConfidence).toBe('high');
    });

    it('should use Sampling when platform supports it', async () => {
      const calendarContext = createMockCalendarContextWithPlatform();

      let createMessageCalled = false;
      const mockCreateMessage = jest.fn().mockImplementation(() => {
        createMessageCalled = true;
        return Promise.resolve({
          content: {
            type: 'text',
            text: JSON.stringify({ success: true, events: [] }),
          },
          model: 'claude-3-5-sonnet-20241022',
          stopReason: 'endTurn',
        });
      });

      const mockSamplingContext = createMockSamplingContext({
        getMcpServer: jest.fn(() => ({
          server: {
            createMessage: mockCreateMessage,
          },
        })),
      }) as CalendarSamplingContext;

      await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-15', endDate: '2026-01-20' },
        calendarContext,
        mockSamplingContext,
        IOS_DETECTED_PLATFORM
      );

      // Verify Sampling was used
      expect(createMessageCalled).toBe(true);
      expect(mockCreateMessage).toHaveBeenCalledTimes(1);
    });
  });
});
