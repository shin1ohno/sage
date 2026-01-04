/**
 * Reminder & Todo Tool Handlers
 *
 * Business logic for reminder and todo-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: 5.1-5.6, 12.1-12.8
 */

import type { UserConfig, Priority } from '../../types/index.js';
import type { ReminderManager } from '../../integrations/reminder-manager.js';
import type { TodoListManager } from '../../integrations/todo-list-manager.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';

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
