/**
 * Unit tests for calendar handler platform routing
 *
 * Tests that handleListCalendarEvents routes to the correct handler based on
 * client Sampling support:
 * - Client with Sampling support -> handleListCalendarEventsWithSampling
 * - Client without Sampling support -> handleListCalendarEvents (MCP-only path)
 *
 * Requirements: 2.1-2.2, 3.1, 6.2 (platform-adaptive-integration)
 */

import type { ClientInfo } from '../../../../src/types/sampling.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createMockCalendarToolsContext,
  DEFAULT_DETECTED_PLATFORM,
  IOS_DETECTED_PLATFORM,
  WEB_DETECTED_PLATFORM,
  UNKNOWN_DETECTED_PLATFORM,
} from '../../../helpers/index.js';

// Import the actual handlers to mock them
import * as calendarHandlers from '../../../../src/tools/calendar/handlers';

// Mock the logger to prevent console output during tests
jest.mock('../../../../src/utils/logger', () => ({
  mcpLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
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

describe('Calendar Handler Platform Routing', () => {
  // Spy on the handlers to track which one is called
  let handleListCalendarEventsSpy: jest.SpyInstance;
  let handleListCalendarEventsWithSamplingSpy: jest.SpyInstance;

  // Mock MCP server for Sampling tests
  let mockMcpServer: {
    server: {
      createMessage: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock MCP server
    mockMcpServer = {
      server: {
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text' as const,
            text: JSON.stringify([
              {
                id: 'event1',
                title: 'Test Event',
                start: '2026-01-15T10:00:00Z',
                end: '2026-01-15T11:00:00Z',
                source: 'merged',
              },
            ]),
          },
          model: 'claude-3-opus',
          stopReason: 'endTurn',
        }),
      },
    };
  });

  afterEach(() => {
    // Restore spies if they exist
    if (handleListCalendarEventsSpy) {
      handleListCalendarEventsSpy.mockRestore();
    }
    if (handleListCalendarEventsWithSamplingSpy) {
      handleListCalendarEventsWithSamplingSpy.mockRestore();
    }
  });

  /**
   * Helper function to simulate the routing logic from src/index.ts
   * This replicates the decision logic in the list_calendar_events tool registration
   *
   * The new routing logic is simplified:
   * - If supportsSampling is true -> use Sampling handler
   * - Otherwise -> use MCP-only handler
   */
  async function routeToHandler(
    args: { startDate: string; endDate: string; calendarId?: string },
    clientInfo: ClientInfo | null,
    getMcpServer: () => McpServer | null
  ) {
    const calendarContext = {
      ...createMockCalendarToolsContext(),
      getClientInfo: () => clientInfo,
    };

    const samplingContext = {
      getMcpServer,
    };

    // This replicates the simplified routing logic from src/index.ts
    // Only check supportsSampling - platform type is no longer considered
    if (clientInfo?.supportsSampling) {
      // Route to Sampling handler
      return calendarHandlers.handleListCalendarEventsWithSampling(
        args,
        calendarContext,
        samplingContext
      );
    }

    // Route to MCP-only handler
    return calendarHandlers.handleListCalendarEvents(calendarContext, args);
  }

  describe('Client with Sampling support', () => {
    it('should route to handleListCalendarEventsWithSampling when supportsSampling is true', async () => {
      handleListCalendarEventsWithSamplingSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEventsWithSampling')
        .mockResolvedValue({
          content: [{ type: 'text', text: '[]' }],
          isError: false,
        });

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        IOS_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsWithSamplingSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsWithSamplingSpy).toHaveBeenCalledWith(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        expect.objectContaining({
          getClientInfo: expect.any(Function),
        }),
        expect.objectContaining({
          getMcpServer: expect.any(Function),
        })
      );
    });

    it('should pass correct arguments to Sampling handler', async () => {
      handleListCalendarEventsWithSamplingSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEventsWithSampling')
        .mockResolvedValue({
          content: [{ type: 'text', text: '[]' }],
          isError: false,
        });

      const args = {
        startDate: '2026-03-01',
        endDate: '2026-03-15',
        calendarId: 'work-calendar',
      };

      await routeToHandler(
        args,
        IOS_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsWithSamplingSpy).toHaveBeenCalledWith(
        args,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should route to Sampling handler regardless of client name', async () => {
      handleListCalendarEventsWithSamplingSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEventsWithSampling')
        .mockResolvedValue({
          content: [{ type: 'text', text: '[]' }],
          isError: false,
        });

      // Any client with supportsSampling: true should use Sampling
      const customClient: ClientInfo = {
        clientName: 'custom-client',
        clientVersion: '2.0.0',
        supportsSampling: true,
      };

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        customClient,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsWithSamplingSpy).toHaveBeenCalled();
    });
  });

  describe('Client without Sampling support', () => {
    it('should route to handleListCalendarEvents for desktop clients', async () => {
      handleListCalendarEventsSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEvents')
        .mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ success: true, events: [] }) }],
        });

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        DEFAULT_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          getClientInfo: expect.any(Function),
        }),
        { startDate: '2026-01-01', endDate: '2026-01-31' }
      );
    });

    it('should route to handleListCalendarEvents for web clients', async () => {
      handleListCalendarEventsSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEvents')
        .mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ success: true, events: [] }) }],
        });

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        WEB_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
    });

    it('should route to handleListCalendarEvents for unknown clients', async () => {
      handleListCalendarEventsSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEvents')
        .mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ success: true, events: [] }) }],
        });

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        UNKNOWN_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
    });

    it('should route to handleListCalendarEvents when clientInfo is null', async () => {
      handleListCalendarEventsSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEvents')
        .mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ success: true, events: [] }) }],
        });

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        null,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
    });
  });

  describe('Routing decision edge cases', () => {
    it('should verify routing is based solely on supportsSampling', async () => {
      // Test various combinations to verify only supportsSampling matters
      const testCases: Array<{
        clientInfo: ClientInfo;
        shouldUseSampling: boolean;
        description: string;
      }> = [
        {
          clientInfo: { clientName: 'test-ios', supportsSampling: true },
          shouldUseSampling: true,
          description: 'iOS-like client with Sampling',
        },
        {
          clientInfo: { clientName: 'test-desktop', supportsSampling: true },
          shouldUseSampling: true,
          description: 'Desktop-like client with Sampling',
        },
        {
          clientInfo: { clientName: 'test-web', supportsSampling: true },
          shouldUseSampling: true,
          description: 'Web-like client with Sampling',
        },
        {
          clientInfo: { clientName: 'test-ios', supportsSampling: false },
          shouldUseSampling: false,
          description: 'iOS-like client without Sampling',
        },
        {
          clientInfo: { clientName: 'test-desktop', supportsSampling: false },
          shouldUseSampling: false,
          description: 'Desktop-like client without Sampling',
        },
        {
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          shouldUseSampling: false,
          description: 'Default desktop platform',
        },
        {
          clientInfo: WEB_DETECTED_PLATFORM,
          shouldUseSampling: false,
          description: 'Web platform',
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        handleListCalendarEventsSpy = jest
          .spyOn(calendarHandlers, 'handleListCalendarEvents')
          .mockResolvedValue({
            content: [{ type: 'text', text: JSON.stringify({ success: true, events: [] }) }],
          });

        handleListCalendarEventsWithSamplingSpy = jest
          .spyOn(calendarHandlers, 'handleListCalendarEventsWithSampling')
          .mockResolvedValue({
            content: [{ type: 'text', text: '[]' }],
            isError: false,
          });

        await routeToHandler(
          { startDate: '2026-01-01', endDate: '2026-01-31' },
          testCase.clientInfo,
          () => mockMcpServer as unknown as McpServer
        );

        if (testCase.shouldUseSampling) {
          expect(handleListCalendarEventsWithSamplingSpy).toHaveBeenCalled();
          expect(handleListCalendarEventsSpy).not.toHaveBeenCalled();
        } else {
          expect(handleListCalendarEventsSpy).toHaveBeenCalled();
          expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
        }

        // Restore mocks
        handleListCalendarEventsSpy.mockRestore();
        handleListCalendarEventsWithSamplingSpy.mockRestore();
      }
    });
  });
});
