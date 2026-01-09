/**
 * Reminder & Todo Tool Handlers
 *
 * Business logic for reminder and todo-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: 2.3, 4.1, 5.1-5.6, 12.1-12.8
 */

import type { UserConfig, Priority } from '../../types/index.js';
import type { ReminderManager } from '../../integrations/reminder-manager.js';
import type { TodoListManager } from '../../integrations/todo-list-manager.js';
import type { DetectedPlatform } from '../../types/platform.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';
import {
  SamplingService,
  SamplingError,
} from '../../services/sampling-service.js';
import { IntegrationStrategyManager } from '../../services/integration-strategy-manager.js';

/**
 * Reminder/Todo context containing shared state and services
 */
export interface ReminderTodoContext {
  getConfig: () => UserConfig | null;
  getReminderManager: () => ReminderManager | null;
  getTodoListManager: () => TodoListManager | null;
  initializeServices: (config: UserConfig) => void;
}

// ============================================================
// Input Types
// ============================================================

export interface SetReminderInput {
  taskTitle: string;
  dueDate?: string;
  reminderType?:
    | '1_hour_before'
    | '3_hours_before'
    | '1_day_before'
    | '3_days_before'
    | '1_week_before';
  list?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  notes?: string;
}

export interface ListTodosInput {
  priority?: Array<'P0' | 'P1' | 'P2' | 'P3'>;
  status?: Array<'not_started' | 'in_progress' | 'completed' | 'cancelled'>;
  source?: Array<'apple_reminders' | 'notion' | 'manual'>;
  todayOnly?: boolean;
  tags?: string[];
}

// ============================================================
// Handler Functions
// ============================================================

/**
 * set_reminder handler
 *
 * Set a reminder for a task in Apple Reminders or Notion.
 * Requirement: 5.1-5.6
 */
export async function handleSetReminder(
  ctx: ReminderTodoContext,
  args: SetReminderInput
) {
  const { taskTitle, dueDate, reminderType, list, priority, notes } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let reminderManager = ctx.getReminderManager();
  if (!reminderManager) {
    ctx.initializeServices(config);
    reminderManager = ctx.getReminderManager();
  }

  try {
    const result = await reminderManager!.setReminder({
      taskTitle,
      targetDate: dueDate,
      reminderType,
      list: list ?? config.integrations.appleReminders.defaultList,
      priority: priority as Priority | undefined,
      notes,
    });

    if (result.success) {
      // Check if this is a delegation request for Notion
      if (result.delegateToNotion && result.notionRequest) {
        return createToolResponse({
          success: true,
          destination: 'notion_mcp',
          method: 'delegate',
          delegateToNotion: true,
          notionRequest: result.notionRequest,
          message: `Notionへの追加はClaude Codeが直接notion-create-pagesツールを使用してください。`,
          instruction: `notion-create-pagesツールを以下のパラメータで呼び出してください:
- parent: { "type": "data_source_id", "data_source_id": "${result.notionRequest.databaseId.replace(/-/g, '')}" }
- pages: [{ "properties": ${JSON.stringify(result.notionRequest.properties)} }]`,
        });
      }

      return createToolResponse({
        success: true,
        destination: result.destination,
        method: result.method,
        reminderId: result.reminderId,
        reminderUrl: result.reminderUrl ?? result.pageUrl,
        message:
          result.destination === 'apple_reminders'
            ? `Apple Remindersにリマインダーを作成しました: ${taskTitle}`
            : `Notionにタスクを作成しました: ${taskTitle}`,
      });
    }

    return createToolResponse({
      success: false,
      destination: result.destination,
      error: result.error,
      fallbackText: result.fallbackText,
      message: result.fallbackText
        ? '自動作成に失敗しました。以下のテキストを手動でコピーしてください。'
        : `リマインダー作成に失敗しました: ${result.error}`,
    });
  } catch (error) {
    return createErrorFromCatch('リマインダー設定に失敗しました', error);
  }
}

/**
 * list_todos handler
 *
 * List TODO items from Apple Reminders and Notion with optional filtering.
 * Requirement: 12.1, 12.2, 12.3, 12.4, 12.7, 12.8
 */
export async function handleListTodos(
  ctx: ReminderTodoContext,
  args: ListTodosInput
) {
  const { priority, status, source, todayOnly, tags } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let todoListManager = ctx.getTodoListManager();
  if (!todoListManager) {
    ctx.initializeServices(config);
    todoListManager = ctx.getTodoListManager();
  }

  try {
    let todos;

    if (todayOnly) {
      todos = await todoListManager!.getTodaysTasks();
    } else {
      todos = await todoListManager!.listTodos({
        priority: priority as Priority[] | undefined,
        status,
        source,
        tags,
      });
    }

    // Format todos for display
    const formattedTodos = todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      priority: todo.priority,
      status: todo.status,
      dueDate: todo.dueDate,
      source: todo.source,
      tags: todo.tags,
      estimatedMinutes: todo.estimatedMinutes,
      stakeholders: todo.stakeholders,
    }));

    return createToolResponse({
      success: true,
      totalCount: todos.length,
      todos: formattedTodos,
      message:
        todos.length > 0
          ? `${todos.length}件のタスクが見つかりました。`
          : 'タスクが見つかりませんでした。',
      filters: {
        priority,
        status,
        source,
        todayOnly,
        tags,
      },
    });
  } catch (error) {
    return createErrorFromCatch('TODOリストの取得に失敗しました', error);
  }
}

// ============================================================
// Platform-Adaptive Sampling Handlers
// ============================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Platform context for accessing platform information
 * Aligned with the pattern used in calendar handlers
 *
 * Requirements: 1.6 (platform-adaptive-integration)
 */
export interface PlatformContext {
  getPlatformInfo: () => DetectedPlatform | null;
}

/**
 * Sampling context for MCP Server access
 * Used to send Sampling requests to the host application
 *
 * Requirements: 2.1-2.7 (platform-adaptive-integration)
 */
export interface SamplingContext {
  getMcpServer: () => McpServer | null;
}

/**
 * handleSetReminderWithSampling
 *
 * Creates a reminder using MCP Sampling to leverage the native iOS/iPadOS
 * Reminders API. This handler is specifically designed for platforms where
 * direct AppleScript access is not available (iOS, iPadOS).
 *
 * The function:
 * 1. Uses IntegrationStrategyManager to build platform-specific Sampling instructions
 * 2. Sends the Sampling request to Claude via SamplingService
 * 3. Returns Claude's response directly (success or error)
 *
 * Requirements: 2.3, 4.1
 * - WHEN set_reminder tool is called on iOS/iPad THEN system SHALL use Sampling
 *   to request Claude: "Create reminder using native iOS Reminders API with
 *   title, due date, and notes"
 *
 * @param args - Reminder creation arguments (title, dueDate, notes, etc.)
 * @param _context - Reminder context (not used in Sampling path but required for interface consistency)
 * @param samplingContext - Context providing access to MCP Server for Sampling requests
 * @param platform - Detected platform information
 * @returns Tool response with reminder creation result or error
 *
 * @example
 * ```typescript
 * const response = await handleSetReminderWithSampling(
 *   { taskTitle: 'Buy groceries', dueDate: '2026-01-15T10:00:00Z' },
 *   reminderContext,
 *   { getMcpServer: () => mcpServer },
 *   iosPlatform
 * );
 * ```
 */
export async function handleSetReminderWithSampling(
  args: SetReminderInput,
  _context: ReminderTodoContext & PlatformContext,
  samplingContext: SamplingContext,
  platform: DetectedPlatform
) {
  const { taskTitle, dueDate, notes, priority, list } = args;

  // Validate required fields
  if (!taskTitle || taskTitle.trim() === '') {
    return createToolResponse({
      error: true,
      message: 'タスクタイトルは必須です。',
    });
  }

  // Get MCP Server from context and create SamplingService
  const mcpServer = samplingContext.getMcpServer();
  if (!mcpServer) {
    return createToolResponse({
      error: true,
      message:
        'MCPサーバーが利用できません。プラットフォーム統合を使用できないため、別の方法をお試しください。',
    });
  }

  const samplingService = new SamplingService(mcpServer);

  // Build Sampling instruction message using IntegrationStrategyManager
  const strategyManager = new IntegrationStrategyManager();
  const instruction = strategyManager.buildReminderSamplingMessage({
    title: taskTitle,
    dueDate,
    notes,
    priority,
    list,
  });

  try {
    // Send Sampling request to Claude
    const response = await samplingService.sendSamplingRequest({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: instruction },
        },
      ],
      maxTokens: 1000,
      systemPrompt:
        'You are a helpful assistant executing native iOS/iPadOS Reminders API operations. Follow the instructions exactly and return JSON responses.',
    });

    // Parse Claude's response to determine success/failure
    const responseText = response.content.text;

    // Try to parse as JSON for structured response
    try {
      const parsedResponse = JSON.parse(responseText);

      if (parsedResponse.success) {
        return createToolResponse({
          success: true,
          destination: 'native-ios-reminders',
          method: 'sampling',
          reminderId: parsedResponse.reminderId,
          message: `iOSネイティブリマインダーを作成しました: ${taskTitle}`,
          platformUsed: platform.platform,
        });
      } else {
        return createToolResponse({
          success: false,
          destination: 'native-ios-reminders',
          method: 'sampling',
          error: parsedResponse.error || 'Unknown error from native API',
          message: `リマインダー作成に失敗しました: ${parsedResponse.error || 'Unknown error'}`,
          platformUsed: platform.platform,
        });
      }
    } catch {
      // If response is not valid JSON, return the raw response
      // This might happen if Claude provides a natural language response
      return createToolResponse({
        success: true,
        destination: 'native-ios-reminders',
        method: 'sampling',
        message: responseText,
        platformUsed: platform.platform,
        note: 'Response was not in expected JSON format, returning raw response',
      });
    }
  } catch (error) {
    // Handle SamplingError specifically
    if (error instanceof SamplingError) {
      // Check if user rejected the Sampling request
      if (error.isUserRejection()) {
        return createToolResponse({
          success: false,
          destination: 'native-ios-reminders',
          method: 'sampling',
          error: 'user_rejection',
          message:
            'リマインダー作成には承認が必要です。操作がキャンセルされました。',
          userAction: 'Please approve the Sampling request to create reminders.',
        });
      }

      // Check if Sampling is not supported
      if (error.isSamplingNotSupported()) {
        return createToolResponse({
          success: false,
          destination: 'native-ios-reminders',
          method: 'sampling',
          error: 'sampling_not_supported',
          message:
            'このClaudeクライアントはSamplingをサポートしていません。Claude Desktop、Claude iOS、またはClaude iPadOSをお使いください。',
        });
      }

      // Other Sampling errors
      return createToolResponse({
        success: false,
        destination: 'native-ios-reminders',
        method: 'sampling',
        error: error.message,
        message: `Samplingリクエストに失敗しました: ${error.message}`,
      });
    }

    // Handle other errors
    return createErrorFromCatch('リマインダー作成中にエラーが発生しました', error);
  }
}
