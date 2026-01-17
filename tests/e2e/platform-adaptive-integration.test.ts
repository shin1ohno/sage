/**
 * E2E Test: Platform-Adaptive Integration
 * Task: E2E tests for platform-adaptive integration
 * Requirements: platform-adaptive-integration (1.1-1.6, 2.1-2.3, 3.1-3.3, 4.1-4.3, 7.1-7.7)
 *
 * Tests complete platform-adaptive workflow:
 * 1. Client capability detection (Sampling support)
 * 2. Sampling-based integration when client supports it
 * 3. MCP-only integration when Sampling is not supported
 * 4. get_platform_info tool functionality
 *
 * Note: Tests use mocked MCP Server and Sampling responses for consistent CI/CD execution.
 */

import { detectClientInfo, type ClientInfo } from '../../src/types/sampling.js';
import { IntegrationStrategyManager } from '../../src/services/integration-strategy-manager.js';
import {
  SamplingError,
  SamplingErrorCodes,
} from '../../src/services/sampling-service.js';
import { handleGetPlatformInfo } from '../../src/tools/platform/handlers.js';
import {
  handleListCalendarEventsWithSampling,
  CalendarToolsContext,
  PlatformContext,
  SamplingContext,
} from '../../src/tools/calendar/handlers.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createMockPlatformToolsContext,
  createTestConfig,
  DEFAULT_DETECTED_PLATFORM,
  IOS_DETECTED_PLATFORM,
  WEB_DETECTED_PLATFORM,
} from '../helpers/index.js';

// Mock the logger to prevent console output during tests
jest.mock('../../src/utils/logger', () => ({
  servicesLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  mcpLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the retry utility
jest.mock('../../src/utils/retry', () => ({
  retryWithBackoff: jest.fn(async (fn) => fn()),
}));

describe('E2E: Platform-Adaptive Integration', () => {
  describe('Client Capability Detection', () => {
    describe('Sampling support detection (Requirement 1.2)', () => {
      it('should detect client with Sampling support', () => {
        const capabilities = {
          sampling: {},
        };

        const clientInfo = detectClientInfo(capabilities, {
          name: 'test-client',
          version: '1.0.0',
        });

        expect(clientInfo.supportsSampling).toBe(true);
        expect(clientInfo.clientName).toBe('test-client');
        expect(clientInfo.clientVersion).toBe('1.0.0');
      });

      it('should detect client without Sampling support', () => {
        const capabilities = {};

        const clientInfo = detectClientInfo(capabilities, {
          name: 'test-client',
          version: '1.0.0',
        });

        expect(clientInfo.supportsSampling).toBe(false);
      });
    });
  });

  describe('Integration Strategy Selection', () => {
    let strategyManager: IntegrationStrategyManager;

    beforeEach(() => {
      strategyManager = new IntegrationStrategyManager();
    });

    describe('Calendar Strategy (Requirement 3.1-3.3)', () => {
      it('should use Sampling for client with Sampling support', () => {
        const strategy = strategyManager.getCalendarStrategy(true, {
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        });

        expect(strategy.useSampling).toBe(true);
        expect(strategy.mcpToolsToCall).toContain('list_calendar_events');
      });

      it('should use MCP-only for client without Sampling support', () => {
        const strategy = strategyManager.getCalendarStrategy(false, {
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        });

        expect(strategy.useSampling).toBe(false);
        expect(strategy.mcpToolsToCall).toContain('list_calendar_events');
      });
    });

    describe('Reminder Strategy (Requirement 4.1-4.3)', () => {
      it('should use Sampling for client with Sampling support', () => {
        const strategy = strategyManager.getReminderStrategy(true, {
          title: 'Test Reminder',
          dueDate: '2026-01-15T10:00:00Z',
        });

        expect(strategy.useSampling).toBe(true);
      });

      it('should use MCP AppleScript for client without Sampling support', () => {
        const strategy = strategyManager.getReminderStrategy(false, {
          title: 'Test Reminder',
        });

        expect(strategy.useSampling).toBe(false);
        expect(strategy.mcpToolsToCall).toContain('set_reminder');
      });
    });
  });

  describe('Complete Calendar Workflow with Sampling', () => {
    let mockMcpServer: {
      server: {
        createMessage: jest.Mock;
      };
    };
    let mockCalendarToolsContext: CalendarToolsContext & PlatformContext;
    let mockSamplingContext: SamplingContext;

    beforeEach(() => {
      jest.clearAllMocks();

      // Create mock MCP server
      mockMcpServer = {
        server: {
          createMessage: jest.fn(),
        },
      };

      // Create mock calendar tools context with Sampling-capable client
      mockCalendarToolsContext = {
        getConfig: jest.fn(() => createTestConfig({
          integrations: {
            googleCalendar: { enabled: true },
          },
        })),
        getCalendarSourceManager: jest.fn(() => null),
        getCalendarEventResponseService: jest.fn(() => null),
        getGoogleCalendarService: jest.fn(() => null),
        getGooglePeopleService: jest.fn(() => null),
        getWorkingCadenceService: jest.fn(() => null),
        setWorkingCadenceService: jest.fn(),
        initializeServices: jest.fn(),
        getClientInfo: jest.fn(() => IOS_DETECTED_PLATFORM),
      };

      // Create mock sampling context
      mockSamplingContext = {
        getMcpServer: jest.fn(() => mockMcpServer as unknown as McpServer),
      };
    });

    it('should complete full calendar workflow with Sampling (Requirement 2.1)', async () => {
      // Mock successful Sampling response with merged events
      const mockResponse = {
        content: {
          type: 'text' as const,
          text: JSON.stringify([
            {
              id: 'google-event-1',
              title: 'Google Meeting',
              start: '2026-01-15T10:00:00Z',
              end: '2026-01-15T11:00:00Z',
              isAllDay: false,
              source: 'google',
            },
            {
              id: 'native-event-1',
              title: 'Native iOS Event',
              start: '2026-01-15T14:00:00Z',
              end: '2026-01-15T15:00:00Z',
              isAllDay: false,
              source: 'native-ios',
            },
          ]),
        },
        model: 'claude-3-opus',
        stopReason: 'endTurn',
      };

      mockMcpServer.server.createMessage.mockResolvedValue(mockResponse);

      // Execute the handler
      const result = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        mockCalendarToolsContext,
        mockSamplingContext
      );

      // Verify successful result
      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      // Verify events include both sources
      const events = JSON.parse(result.content[0].text);
      expect(events).toHaveLength(2);
      expect(events.some((e: any) => e.source === 'google')).toBe(true);
      expect(events.some((e: any) => e.source === 'native-ios')).toBe(true);
    });

    it('should handle user rejection gracefully (Requirement 2.2)', async () => {
      // Mock user rejection error
      const userRejectionError = new SamplingError(
        'User rejected',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(userRejectionError);

      // Execute the handler
      const result = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        mockCalendarToolsContext,
        mockSamplingContext
      );

      // Verify fallback message
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Platform-adaptive integration requires your approval');
      expect(result.content[0].text).toContain('Falling back to MCP-only mode');
    });

    it('should handle Sampling not supported gracefully (Requirement 2.3)', async () => {
      // Mock method not found error
      const notSupportedError = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      mockMcpServer.server.createMessage.mockRejectedValue(notSupportedError);

      // Execute the handler
      const result = await handleListCalendarEventsWithSampling(
        { startDate: '2026-01-01', endDate: '2026-01-31' },
        mockCalendarToolsContext,
        mockSamplingContext
      );

      // Verify informative message
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('does not support platform-adaptive integration');
    });
  });

  describe('get_platform_info Tool (Requirement 7.1-7.7)', () => {
    describe('Desktop client info (Requirement 7.3)', () => {
      it('should return complete client info with all integrations', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Client info
        expect(response.clientName).toBe('claude-desktop');
        expect(response.supportsSampling).toBe(false);

        // Server environment
        expect(response.serverEnvironment).toBeDefined();
        expect(response.serverEnvironment.platform).toBeDefined();

        // Available integrations
        expect(response.availableIntegrations.calendar.google).toBe(true);
      });
    });

    describe('Client with Sampling support (Requirement 7.2)', () => {
      it('should return client info with native integrations enabled', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: IOS_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Client info
        expect(response.supportsSampling).toBe(true);

        // Native integrations should be available when Sampling is supported
        expect(response.availableIntegrations.calendar.native).toBe(true);
        expect(response.availableIntegrations.reminders.native).toBe(true);
      });
    });

    describe('Client without Sampling support (Requirement 7.4)', () => {
      it('should return client info with limited integrations', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: WEB_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: true },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        // Client info
        expect(response.supportsSampling).toBe(false);

        // Native integrations not available
        expect(response.availableIntegrations.calendar.native).toBe(false);
        expect(response.availableIntegrations.reminders.native).toBe(false);

        // Sampling warning (Requirement 7.5)
        expect(response.warnings).toBeDefined();
        expect(response.warnings.some((w: string) =>
          w.includes('Native integration unavailable')
        )).toBe(true);
      });
    });

    describe('Google Calendar warnings (Requirement 7.7)', () => {
      it('should include warning when Google Calendar is not authenticated', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: DEFAULT_DETECTED_PLATFORM,
          config: createTestConfig({
            integrations: {
              googleCalendar: { enabled: false },
            },
          }),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        expect(response.availableIntegrations.calendar.google).toBe(false);
        expect(response.warnings).toContain(
          'Google Calendar: Not authenticated (run authenticate_google)'
        );
      });
    });

    describe('Client not detected', () => {
      it('should return error when client info is null', async () => {
        const ctx = createMockPlatformToolsContext({
          clientInfo: null,
          config: createTestConfig(),
        });

        const result = await handleGetPlatformInfo({}, ctx);
        const response = JSON.parse(result.content[0].text);

        expect(response.error).toBe(true);
        expect(response.message).toContain('Client not detected');
        expect(response.suggestion).toContain('reconnecting');
      });
    });
  });
});
