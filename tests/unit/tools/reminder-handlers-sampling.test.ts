/**
 * Reminder Handlers Sampling Unit Tests
 *
 * Tests for handleSetReminderWithSampling - the Sampling-based reminder handler
 * for iOS/iPadOS platforms.
 *
 * Requirements: 2.3, 4.1
 */

import { handleSetReminderWithSampling, type SamplingContext } from '../../../src/tools/reminders/handlers.js';
import { SamplingError, SamplingErrorCodes } from '../../../src/services/sampling-service.js';
import {
  createMockReminderContextWithPlatform,
  createMockSamplingContext,
  IOS_DETECTED_PLATFORM,
} from '../../helpers/index.js';

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
          text: JSON.stringify({ success: true, reminderId: 'mock-reminder-id' }),
        },
        model: 'mock-model',
        stopReason: 'endTurn',
      }),
    },
  };
}

describe('handleSetReminderWithSampling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should return error when taskTitle is empty', async () => {
      const ctx = createMockReminderContextWithPlatform();
      const samplingCtx = createMockSamplingContext() as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: '' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('タスクタイトルは必須');
    });

    it('should return error when taskTitle is whitespace only', async () => {
      const ctx = createMockReminderContextWithPlatform();
      const samplingCtx = createMockSamplingContext() as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: '   ' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('タスクタイトルは必須');
    });
  });

  describe('MCP Server Availability', () => {
    it('should return error when MCP Server is not available', async () => {
      const ctx = createMockReminderContextWithPlatform();
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => null,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('MCPサーバーが利用できません');
    });
  });

  describe('Successful Sampling Request', () => {
    it('should create reminder successfully via Sampling on iOS', async () => {
      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: JSON.stringify({
              success: true,
              reminderId: 'ios-reminder-123',
            }),
          },
          model: 'claude-3-opus',
          stopReason: 'endTurn',
        }),
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        {
          taskTitle: 'Buy groceries',
          dueDate: '2026-01-15T10:00:00Z',
          notes: 'Milk, bread, eggs',
          priority: 'P1',
        },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.destination).toBe('native-ios-reminders');
      expect(response.method).toBe('sampling');
      expect(response.reminderId).toBe('ios-reminder-123');
      expect(response.message).toContain('iOSネイティブリマインダー');
      expect(response.platformUsed).toBe('ios');
    });

    it('should include all optional fields in Sampling request', async () => {
      const mockCreateMessage = jest.fn().mockResolvedValue({
        content: {
          type: 'text',
          text: JSON.stringify({ success: true, reminderId: 'test-id' }),
        },
        model: 'claude-3-opus',
      });

      const mockServer = createMockMcpServer({
        createMessage: mockCreateMessage,
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      await handleSetReminderWithSampling(
        {
          taskTitle: 'Test Task',
          dueDate: '2026-01-15T10:00:00Z',
          notes: 'Some notes',
          priority: 'P0',
          list: 'Work',
        },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );

      // Verify createMessage was called
      expect(mockCreateMessage).toHaveBeenCalled();

      // Verify the instruction message includes all fields
      const callArgs = mockCreateMessage.mock.calls[0][0];
      expect(callArgs.messages).toBeDefined();
      expect(callArgs.messages[0].content.text).toContain('Test Task');
    });
  });

  describe('Failed Sampling Responses', () => {
    it('should handle native API failure response', async () => {
      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Calendar access denied',
            }),
          },
          model: 'claude-3-opus',
        }),
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.destination).toBe('native-ios-reminders');
      expect(response.error).toBe('Calendar access denied');
      expect(response.message).toContain('リマインダー作成に失敗');
    });

    it('should handle non-JSON response as raw text', async () => {
      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: 'I created your reminder successfully!',
          },
          model: 'claude-3-opus',
        }),
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.message).toBe('I created your reminder successfully!');
      expect(response.note).toContain('not in expected JSON format');
    });
  });

  describe('Sampling Error Handling', () => {
    it('should handle user rejection error', async () => {
      const userRejectionError = new SamplingError(
        'User rejected the request',
        SamplingErrorCodes.USER_REJECTION,
        false
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(userRejectionError),
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toBe('user_rejection');
      expect(response.message).toContain('承認が必要');
      expect(response.userAction).toContain('approve');
    });

    it('should handle Sampling not supported error', async () => {
      const notSupportedError = new SamplingError(
        'Method not found',
        SamplingErrorCodes.METHOD_NOT_FOUND,
        false
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(notSupportedError),
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toBe('sampling_not_supported');
      expect(response.message).toContain('Samplingをサポートしていません');
    });

    it('should handle other Sampling errors', async () => {
      const otherError = new SamplingError(
        'Network timeout',
        SamplingErrorCodes.INTERNAL_ERROR,
        true
      );

      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(otherError),
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      // Error message includes retry information
      expect(response.error).toContain('Network timeout');
      expect(response.message).toContain('Samplingリクエストに失敗');
    });

    it('should handle generic errors', async () => {
      const mockServer = createMockMcpServer({
        createMessage: jest.fn().mockRejectedValue(new Error('Unexpected error')),
      });

      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      // Generic errors return the error message in `error` field (same as other Sampling errors)
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unexpected error');
      expect(response.message).toContain('Samplingリクエストに失敗');
    });
  });

  describe('Platform Information', () => {
    it('should include platform information in response', async () => {
      const mockServer = createMockMcpServer();
      const ctx = createMockReminderContextWithPlatform({
        platform: IOS_DETECTED_PLATFORM,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        IOS_DETECTED_PLATFORM
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.platformUsed).toBe('ios');
    });

    it('should work with iPadOS platform', async () => {
      const ipadosPlatform = {
        ...IOS_DETECTED_PLATFORM,
        platform: 'ipados' as const,
        clientName: 'claude-ipados',
      };

      const mockServer = createMockMcpServer();
      const ctx = createMockReminderContextWithPlatform({
        platform: ipadosPlatform,
      });
      const samplingCtx = createMockSamplingContext({
        getMcpServer: () => mockServer,
      }) as SamplingContext;

      const result = await handleSetReminderWithSampling(
        { taskTitle: 'Test Task' },
        ctx,
        samplingCtx,
        ipadosPlatform
      );
      const response = JSON.parse(result.content[0].text);

      expect(response.platformUsed).toBe('ipados');
    });
  });
});
