/**
 * Unit tests for calendar handler platform routing
 *
 * Tests that handleListCalendarEvents routes to the correct handler based on
 * detected platform:
 * - iOS/iPadOS with Sampling support -> handleListCalendarEventsWithSampling
 * - macOS/web/unknown -> handleListCalendarEvents (MCP-only path)
 *
 * Requirements: 2.1-2.2, 3.1, 6.2 (platform-adaptive-integration)
 */

import type { DetectedPlatform } from '../../../../src/types/platform';
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
   */
  async function routeToHandler(
    args: { startDate: string; endDate: string; calendarId?: string },
    platformInfo: DetectedPlatform | null,
    getMcpServer: () => McpServer | null
  ) {
    const calendarContext = {
      ...createMockCalendarToolsContext(),
      getPlatformInfo: () => platformInfo,
    };

    const samplingContext = {
      getMcpServer,
    };

    // This replicates the routing logic from src/index.ts
    if (
      platformInfo?.supportsSampling &&
      (platformInfo.platform === 'ios' || platformInfo.platform === 'ipados')
    ) {
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

  describe('iOS platform routing', () => {
    it('should route to handleListCalendarEventsWithSampling for iOS with Sampling support', async () => {
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
          getPlatformInfo: expect.any(Function),
        }),
        expect.objectContaining({
          getMcpServer: expect.any(Function),
        })
      );
    });

    it('should pass correct arguments to Sampling handler for iOS', async () => {
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
  });

  describe('iPadOS platform routing', () => {
    const IPADOS_DETECTED_PLATFORM: DetectedPlatform = {
      platform: 'ipados',
      clientName: 'claude-ipados',
      clientVersion: '1.0.0',
      supportsSampling: true,
    };

    it('should route to handleListCalendarEventsWithSampling for iPadOS with Sampling support', async () => {
      handleListCalendarEventsWithSamplingSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEventsWithSampling')
        .mockResolvedValue({
          content: [{ type: 'text', text: '[]' }],
          isError: false,
        });

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        IPADOS_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsWithSamplingSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsWithSamplingSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should pass correct arguments to Sampling handler for iPadOS', async () => {
      handleListCalendarEventsWithSamplingSpy = jest
        .spyOn(calendarHandlers, 'handleListCalendarEventsWithSampling')
        .mockResolvedValue({
          content: [{ type: 'text', text: '[]' }],
          isError: false,
        });

      await routeToHandler(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        IPADOS_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      // Verify the correct number of arguments (3, not 4)
      const callArgs = handleListCalendarEventsWithSamplingSpy.mock.calls[0];
      expect(callArgs.length).toBe(3);
    });
  });

  describe('macOS platform routing', () => {
    it('should route to handleListCalendarEvents (MCP-only) for macOS', async () => {
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
    });

    it('should NOT call Sampling handler for macOS', async () => {
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
        DEFAULT_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
    });
  });

  describe('Web platform routing', () => {
    it('should route to handleListCalendarEvents (MCP-only) for web platform', async () => {
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

    it('should NOT call Sampling handler for web platform', async () => {
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
        WEB_DETECTED_PLATFORM,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
    });

    it('should use MCP-only path because web does not support Sampling', async () => {
      // Verify the platform doesn't support Sampling
      expect(WEB_DETECTED_PLATFORM.supportsSampling).toBe(false);

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
  });

  describe('Unknown platform routing', () => {
    it('should route to handleListCalendarEvents (MCP-only) for unknown platform', async () => {
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
  });

  describe('No Sampling support routing', () => {
    it('should route to MCP-only handler when iOS does NOT support Sampling', async () => {
      const iosWithoutSampling: DetectedPlatform = {
        ...IOS_DETECTED_PLATFORM,
        supportsSampling: false,
      };

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
        iosWithoutSampling,
        () => mockMcpServer as unknown as McpServer
      );

      // Should use MCP-only because supportsSampling is false
      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
    });

    it('should route to MCP-only handler when iPadOS does NOT support Sampling', async () => {
      const ipadosWithoutSampling: DetectedPlatform = {
        platform: 'ipados',
        clientName: 'claude-ipados',
        clientVersion: '1.0.0',
        supportsSampling: false,
      };

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
        ipadosWithoutSampling,
        () => mockMcpServer as unknown as McpServer
      );

      // Should use MCP-only because supportsSampling is false
      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
    });
  });

  describe('Null platform info handling', () => {
    it('should route to MCP-only handler when platform info is null', async () => {
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
        null,
        () => mockMcpServer as unknown as McpServer
      );

      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
    });
  });

  describe('Desktop platform routing', () => {
    it('should route to MCP-only handler for desktop platform (non-macOS)', async () => {
      const desktopPlatform: DetectedPlatform = {
        platform: 'desktop',
        clientName: 'claude-desktop-windows',
        clientVersion: '1.0.0',
        supportsSampling: true,
      };

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
        desktopPlatform,
        () => mockMcpServer as unknown as McpServer
      );

      // Desktop is not iOS/iPadOS, so should use MCP-only handler
      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
    });
  });

  describe('Routing decision edge cases', () => {
    it('should check both supportsSampling AND platform type for routing', async () => {
      // macOS with Sampling support should still use MCP-only
      // because it's not iOS/iPadOS
      const macosWithSampling: DetectedPlatform = {
        ...DEFAULT_DETECTED_PLATFORM,
        supportsSampling: true,
      };

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
        macosWithSampling,
        () => mockMcpServer as unknown as McpServer
      );

      // macOS should NOT use Sampling handler even with Sampling support
      // because platform-adaptive integration (Sampling for native calendar)
      // only makes sense on iOS/iPadOS where Claude can access native Calendar
      expect(handleListCalendarEventsSpy).toHaveBeenCalled();
      expect(handleListCalendarEventsWithSamplingSpy).not.toHaveBeenCalled();
    });

    it('should verify routing condition requires BOTH conditions', async () => {
      // Test the exact condition: supportsSampling && (ios || ipados)
      const testCases: Array<{
        platform: DetectedPlatform;
        shouldUseSampling: boolean;
        description: string;
      }> = [
        {
          platform: { ...IOS_DETECTED_PLATFORM, supportsSampling: true },
          shouldUseSampling: true,
          description: 'iOS with Sampling',
        },
        {
          platform: { ...IOS_DETECTED_PLATFORM, supportsSampling: false },
          shouldUseSampling: false,
          description: 'iOS without Sampling',
        },
        {
          platform: {
            platform: 'ipados',
            clientName: 'test',
            clientVersion: '1.0.0',
            supportsSampling: true,
          },
          shouldUseSampling: true,
          description: 'iPadOS with Sampling',
        },
        {
          platform: {
            platform: 'ipados',
            clientName: 'test',
            clientVersion: '1.0.0',
            supportsSampling: false,
          },
          shouldUseSampling: false,
          description: 'iPadOS without Sampling',
        },
        {
          platform: { ...DEFAULT_DETECTED_PLATFORM, supportsSampling: true },
          shouldUseSampling: false,
          description: 'macOS with Sampling',
        },
        {
          platform: WEB_DETECTED_PLATFORM,
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
          testCase.platform,
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
