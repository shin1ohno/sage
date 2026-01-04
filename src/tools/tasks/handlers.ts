/**
 * Task Tool Handlers
 *
 * Business logic for task-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: 2.1-2.6, 3.1-3.2, 4.1-4.5, 12.5, 12.6
 */

import { TaskAnalyzer } from '../analyze-tasks.js';
import type { UserConfig } from '../../types/index.js';
import type { TodoListManager } from '../../integrations/todo-list-manager.js';
import type { TaskSynchronizer } from '../../integrations/task-synchronizer.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';

/**
 * Task context containing shared state and services
 */
export interface TaskToolsContext {
  getConfig: () => UserConfig | null;
  getTodoListManager: () => TodoListManager | null;
  getTaskSynchronizer: () => TaskSynchronizer | null;
  initializeServices: (config: UserConfig) => void;
}

/**
 * Input type for analyze_tasks
 */
export interface AnalyzeTasksInput {
  tasks: Array<{
    title: string;
    description?: string;
    deadline?: string;
  }>;
}

/**
 * Input type for update_task_status
 */
export interface UpdateTaskStatusInput {
  taskId: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'cancelled';
  source: 'apple_reminders' | 'notion' | 'manual';
  syncAcrossSources?: boolean;
}

/**
 * Input type for detect_duplicates
 */
export interface DetectDuplicatesInput {
  autoMerge?: boolean;
}

/**
 * analyze_tasks handler
 *
 * Analyzes tasks and provides prioritization, time estimation, and stakeholder identification.
 * Requirement: 2.1-2.6, 3.1-3.2, 4.1-4.5
 */
export async function handleAnalyzeTasks(
  ctx: TaskToolsContext,
  args: AnalyzeTasksInput
) {
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  try {
    const result = await TaskAnalyzer.analyzeTasks(args.tasks, config);

    return createToolResponse({
      success: true,
      summary: result.summary,
      tasks: result.analyzedTasks.map((t) => ({
        title: t.original.title,
        description: t.original.description,
        deadline: t.original.deadline,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        stakeholders: t.stakeholders,
        tags: t.tags,
        reasoning: t.reasoning,
        suggestedReminders: t.suggestedReminders,
      })),
    });
  } catch (error) {
    return createErrorFromCatch('タスク分析に失敗しました', error);
  }
}

/**
 * update_task_status handler
 *
 * Updates the status of a task in Apple Reminders or Notion.
 * Requirement: 12.5, 12.6
 */
export async function handleUpdateTaskStatus(
  ctx: TaskToolsContext,
  args: UpdateTaskStatusInput
) {
  const { taskId, status, source, syncAcrossSources } = args;
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
    const result = await todoListManager!.updateTaskStatus(taskId, status, source);

    if (!result.success) {
      return createToolResponse({
        success: false,
        taskId,
        error: result.error,
        message: `タスクステータスの更新に失敗しました: ${result.error}`,
      });
    }

    // Optionally sync across sources
    let syncResult;
    if (syncAcrossSources) {
      syncResult = await todoListManager!.syncTaskAcrossSources(taskId);
    }

    return createToolResponse({
      success: true,
      taskId,
      newStatus: status,
      updatedFields: result.updatedFields,
      syncedSources: result.syncedSources,
      syncResult: syncAcrossSources ? syncResult : undefined,
      message: `タスクのステータスを「${status}」に更新しました。`,
    });
  } catch (error) {
    return createErrorFromCatch('タスクステータスの更新に失敗しました', error);
  }
}

/**
 * sync_tasks handler
 *
 * Synchronizes tasks between Apple Reminders and Notion.
 * Requirement: 12.6
 */
export async function handleSyncTasks(ctx: TaskToolsContext) {
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let taskSynchronizer = ctx.getTaskSynchronizer();
  if (!taskSynchronizer) {
    ctx.initializeServices(config);
    taskSynchronizer = ctx.getTaskSynchronizer();
  }

  try {
    const result = await taskSynchronizer!.syncAllTasks();

    return createToolResponse({
      success: true,
      totalTasks: result.totalTasks,
      syncedTasks: result.syncedTasks,
      conflicts: result.conflicts,
      errors: result.errors,
      durationMs: result.duration,
      message:
        result.conflicts.length > 0
          ? `${result.syncedTasks}件のタスクを同期しました。${result.conflicts.length}件の競合が検出されました。`
          : `${result.syncedTasks}件のタスクを同期しました。`,
    });
  } catch (error) {
    return createErrorFromCatch('タスク同期に失敗しました', error);
  }
}

/**
 * detect_duplicates handler
 *
 * Detects duplicate tasks between Apple Reminders and Notion.
 * Requirement: 12.5
 */
export async function handleDetectDuplicates(
  ctx: TaskToolsContext,
  args: DetectDuplicatesInput
) {
  const { autoMerge } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let taskSynchronizer = ctx.getTaskSynchronizer();
  if (!taskSynchronizer) {
    ctx.initializeServices(config);
    taskSynchronizer = ctx.getTaskSynchronizer();
  }

  try {
    const duplicates = await taskSynchronizer!.detectDuplicates();

    // Format duplicates for display
    const formattedDuplicates = duplicates.map((d) => ({
      tasks: d.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        source: t.source,
        status: t.status,
        priority: t.priority,
      })),
      similarity: Math.round(d.similarity * 100),
      confidence: d.confidence,
      suggestedMerge: {
        title: d.suggestedMerge.title,
        priority: d.suggestedMerge.priority,
        status: d.suggestedMerge.status,
        tags: d.suggestedMerge.tags,
      },
    }));

    // Auto-merge high-confidence duplicates if requested
    let mergeResults;
    if (autoMerge) {
      const highConfidenceDuplicates = duplicates.filter(
        (d) => d.confidence === 'high'
      );
      if (highConfidenceDuplicates.length > 0) {
        mergeResults =
          await taskSynchronizer!.mergeDuplicates(highConfidenceDuplicates);
      }
    }

    return createToolResponse({
      success: true,
      duplicatesFound: duplicates.length,
      duplicates: formattedDuplicates,
      mergeResults: autoMerge ? mergeResults : undefined,
      message:
        duplicates.length > 0
          ? `${duplicates.length}件の重複タスクが検出されました。`
          : '重複タスクは見つかりませんでした。',
    });
  } catch (error) {
    return createErrorFromCatch('重複検出に失敗しました', error);
  }
}
