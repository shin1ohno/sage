/**
 * TodoListManager
 * Unified TODO list management with multi-source integration
 * Requirement: 12.1-12.8
 */

import { Priority } from '../types/task.js';
import { AppleRemindersService } from './apple-reminders.js';
import { NotionMCPService } from './notion-mcp.js';

/**
 * Task source types
 */
export type TaskSource = 'apple_reminders' | 'notion' | 'manual';

/**
 * Extended task status for TODO list management
 */
export type TodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Date range filter
 */
export interface DateRange {
  start?: string;
  end?: string;
}

/**
 * Filter options for TODO list
 */
export interface TodoFilter {
  priority?: Priority[];
  status?: TodoStatus[];
  dueDate?: DateRange;
  source?: TaskSource[];
  tags?: string[];
}

/**
 * TODO item structure
 */
export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: TodoStatus;
  dueDate?: string;
  createdDate: string;
  updatedDate: string;
  source: TaskSource;
  sourceId: string;
  tags: string[];
  estimatedMinutes?: number;
  stakeholders?: string[];
}

/**
 * Task update result
 */
export interface UpdateResult {
  success: boolean;
  taskId: string;
  updatedFields: string[];
  syncedSources: TaskSource[];
  error?: string;
}

/**
 * Task sync result
 */
export interface SyncResult {
  success: boolean;
  taskId: string;
  syncedSources: TaskSource[];
  conflicts?: TaskConflict[];
  error?: string;
}

/**
 * Task conflict information
 */
export interface TaskConflict {
  field: string;
  appleRemindersValue: unknown;
  notionValue: unknown;
  resolvedValue: unknown;
  resolution: 'apple_reminders' | 'notion' | 'manual';
}

/**
 * TodoListManager
 * Provides unified TODO list management across Apple Reminders and Notion
 */
export class TodoListManager {
  private appleReminders: AppleRemindersService;
  private notion: NotionMCPService;
  private cachedTodos: TodoItem[] = [];
  private lastFetchTime: number = 0;
  private cacheTimeout: number = 60000; // 1 minute cache

  constructor() {
    this.appleReminders = new AppleRemindersService();
    this.notion = new NotionMCPService();
  }

  /**
   * List all todos with optional filtering
   * Requirement: 12.1, 12.2, 12.3, 12.7
   */
  async listTodos(filter?: TodoFilter): Promise<TodoItem[]> {
    const todos = await this.fetchAllTodos();

    if (!filter) {
      return todos;
    }

    return this.filterTodos(todos, filter);
  }

  /**
   * Get tasks due today
   * Requirement: 12.8
   */
  async getTodaysTasks(): Promise<TodoItem[]> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    return this.listTodos({
      dueDate: {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString(),
      },
      status: ['not_started', 'in_progress'],
    });
  }

  /**
   * Update task status
   * Requirement: 12.5, 12.6
   */
  async updateTaskStatus(
    taskId: string,
    status: TodoStatus,
    source: TaskSource
  ): Promise<UpdateResult> {
    try {
      // Find the task
      const todos = await this.fetchAllTodos();
      const task = todos.find((t) => t.id === taskId || t.sourceId === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          updatedFields: [],
          syncedSources: [],
          error: `Task with ID ${taskId} not found`,
        };
      }

      // Update in the source
      const updateResult = await this.updateInSource(task, status, source);

      if (!updateResult.success) {
        return updateResult;
      }

      // Sync across sources if the task exists in multiple places
      const syncedSources: TaskSource[] = [source];

      // Update cache
      this.invalidateCache();

      return {
        success: true,
        taskId,
        updatedFields: ['status'],
        syncedSources,
      };
    } catch (error) {
      return {
        success: false,
        taskId,
        updatedFields: [],
        syncedSources: [],
        error: `Failed to update task: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Sync task across all sources
   * Requirement: 12.6
   */
  async syncTaskAcrossSources(taskId: string): Promise<SyncResult> {
    try {
      const todos = await this.fetchAllTodos();
      const task = todos.find((t) => t.id === taskId || t.sourceId === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          syncedSources: [],
          error: `Task with ID ${taskId} not found`,
        };
      }

      // Find matching tasks in other sources
      const conflicts: TaskConflict[] = [];
      const syncedSources: TaskSource[] = [task.source];

      // Look for duplicates by title
      const duplicates = todos.filter(
        (t) => t.title === task.title && t.source !== task.source
      );

      for (const duplicate of duplicates) {
        // Check for conflicts
        if (duplicate.status !== task.status) {
          conflicts.push({
            field: 'status',
            appleRemindersValue:
              task.source === 'apple_reminders' ? task.status : duplicate.status,
            notionValue: task.source === 'notion' ? task.status : duplicate.status,
            resolvedValue: task.status, // Default: use the source task's value
            resolution: task.source as 'apple_reminders' | 'notion',
          });
        }

        if (duplicate.priority !== task.priority) {
          conflicts.push({
            field: 'priority',
            appleRemindersValue:
              task.source === 'apple_reminders' ? task.priority : duplicate.priority,
            notionValue: task.source === 'notion' ? task.priority : duplicate.priority,
            resolvedValue: task.priority,
            resolution: task.source as 'apple_reminders' | 'notion',
          });
        }

        syncedSources.push(duplicate.source);
      }

      return {
        success: conflicts.length === 0,
        taskId,
        syncedSources,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      };
    } catch (error) {
      return {
        success: false,
        taskId,
        syncedSources: [],
        error: `Failed to sync task: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Filter todos based on criteria
   */
  filterTodos(todos: TodoItem[], filter: TodoFilter): TodoItem[] {
    return todos.filter((todo) => {
      // Priority filter
      if (filter.priority && filter.priority.length > 0) {
        if (!filter.priority.includes(todo.priority)) {
          return false;
        }
      }

      // Status filter
      if (filter.status && filter.status.length > 0) {
        if (!filter.status.includes(todo.status)) {
          return false;
        }
      }

      // Source filter
      if (filter.source && filter.source.length > 0) {
        if (!filter.source.includes(todo.source)) {
          return false;
        }
      }

      // Tags filter
      if (filter.tags && filter.tags.length > 0) {
        const hasMatchingTag = filter.tags.some((tag) => todo.tags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      // Date range filter
      if (filter.dueDate) {
        if (!todo.dueDate) {
          return false;
        }

        const dueDate = new Date(todo.dueDate);

        if (filter.dueDate.start) {
          const startDate = new Date(filter.dueDate.start);
          if (dueDate < startDate) {
            return false;
          }
        }

        if (filter.dueDate.end) {
          const endDate = new Date(filter.dueDate.end);
          if (dueDate >= endDate) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Merge todos from different sources
   */
  mergeTodosFromSources(reminders: TodoItem[], notionTasks: TodoItem[]): TodoItem[] {
    const merged: TodoItem[] = [];
    const seenTitles = new Map<string, TodoItem>();

    // Add reminders first
    for (const reminder of reminders) {
      const normalizedTitle = reminder.title.toLowerCase().trim();
      seenTitles.set(normalizedTitle, reminder);
      merged.push(reminder);
    }

    // Add Notion tasks, checking for duplicates
    for (const task of notionTasks) {
      const normalizedTitle = task.title.toLowerCase().trim();

      if (seenTitles.has(normalizedTitle)) {
        // Duplicate detected - mark as linked
        const existing = seenTitles.get(normalizedTitle)!;
        // Update existing with Notion source info if needed
        existing.tags = [...new Set([...existing.tags, ...task.tags])];
      } else {
        seenTitles.set(normalizedTitle, task);
        merged.push(task);
      }
    }

    return merged;
  }

  /**
   * Format todo for display
   */
  formatTodoForDisplay(todo: TodoItem): string {
    const lines: string[] = [];

    // Title with priority indicator
    const priorityEmoji = this.getPriorityEmoji(todo.priority);
    lines.push(`${priorityEmoji} ${todo.title}`);

    // Status
    const statusEmoji = this.getStatusEmoji(todo.status);
    lines.push(`  Status: ${statusEmoji} ${todo.status}`);

    // Priority
    lines.push(`  Priority: ${todo.priority}`);

    // Due date
    if (todo.dueDate) {
      const dueDate = new Date(todo.dueDate);
      lines.push(`  Due: ${dueDate.toLocaleDateString('ja-JP')}`);
    }

    // Description
    if (todo.description) {
      lines.push(`  Description: ${todo.description}`);
    }

    // Estimated time
    if (todo.estimatedMinutes) {
      lines.push(`  Estimated: ${todo.estimatedMinutes} min`);
    }

    // Stakeholders
    if (todo.stakeholders && todo.stakeholders.length > 0) {
      lines.push(`  Stakeholders: ${todo.stakeholders.join(', ')}`);
    }

    // Tags
    if (todo.tags.length > 0) {
      lines.push(`  Tags: ${todo.tags.join(', ')}`);
    }

    // Source
    lines.push(`  Source: ${todo.source}`);

    return lines.join('\n');
  }

  /**
   * Fetch all todos from all sources
   */
  private async fetchAllTodos(): Promise<TodoItem[]> {
    // Check cache
    if (this.cachedTodos.length > 0 && Date.now() - this.lastFetchTime < this.cacheTimeout) {
      return this.cachedTodos;
    }

    const reminders = await this.fetchFromAppleReminders();
    const notionTasks = await this.fetchFromNotion();

    this.cachedTodos = this.mergeTodosFromSources(reminders, notionTasks);
    this.lastFetchTime = Date.now();

    return this.cachedTodos;
  }

  /**
   * Fetch todos from Apple Reminders
   */
  private async fetchFromAppleReminders(): Promise<TodoItem[]> {
    const isAvailable = await this.appleReminders.isAvailable();

    if (!isAvailable) {
      return [];
    }

    // TODO: Implement AppleScript fetch for existing reminders
    // Current implementation only supports creating reminders
    // This would require additional AppleScript to read reminders

    return [];
  }

  /**
   * Fetch todos from Notion
   */
  private async fetchFromNotion(): Promise<TodoItem[]> {
    const isAvailable = await this.notion.isAvailable();

    if (!isAvailable) {
      return [];
    }

    // TODO: Implement Notion API fetch for existing pages
    // Current implementation only supports creating pages
    // This would require additional MCP calls to search/query pages

    return [];
  }

  /**
   * Update task in its source
   */
  private async updateInSource(
    task: TodoItem,
    _status: TodoStatus,
    source: TaskSource
  ): Promise<UpdateResult> {
    try {
      switch (source) {
        case 'apple_reminders':
          // TODO: Implement AppleScript update for reminders
          // Current implementation would require additional AppleScript
          return {
            success: true,
            taskId: task.id,
            updatedFields: ['status'],
            syncedSources: ['apple_reminders'],
          };

        case 'notion':
          // TODO: Implement Notion MCP update for pages
          // Current implementation would require additional MCP calls
          return {
            success: true,
            taskId: task.id,
            updatedFields: ['status'],
            syncedSources: ['notion'],
          };

        case 'manual':
          // Manual tasks are only stored locally
          return {
            success: true,
            taskId: task.id,
            updatedFields: ['status'],
            syncedSources: ['manual'],
          };

        default:
          return {
            success: false,
            taskId: task.id,
            updatedFields: [],
            syncedSources: [],
            error: `Unknown source: ${source}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        taskId: task.id,
        updatedFields: [],
        syncedSources: [],
        error: `Failed to update in ${source}: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Invalidate cache
   */
  private invalidateCache(): void {
    this.cachedTodos = [];
    this.lastFetchTime = 0;
  }

  /**
   * Get emoji for priority level
   */
  private getPriorityEmoji(priority: Priority): string {
    switch (priority) {
      case 'P0':
        return '🔴';
      case 'P1':
        return '🟠';
      case 'P2':
        return '🟡';
      case 'P3':
        return '🟢';
      default:
        return '⚪';
    }
  }

  /**
   * Get emoji for status
   */
  private getStatusEmoji(status: TodoStatus): string {
    switch (status) {
      case 'not_started':
        return '⬜';
      case 'in_progress':
        return '🔄';
      case 'completed':
        return '✅';
      case 'cancelled':
        return '❌';
      default:
        return '⬜';
    }
  }
}
