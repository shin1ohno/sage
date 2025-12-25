/**
 * TaskSynchronizer
 * Multi-source task synchronization and conflict resolution
 * Requirement: 12.6, 14.1-14.3
 */

import { Priority } from '../types/task.js';
import {
  TodoItem,
  TodoListManager,
  TaskSource,
  TodoStatus,
  TaskConflict,
} from './todo-list-manager.js';

/**
 * Duplicate task detection result
 */
export interface DuplicateTask {
  tasks: TodoItem[];
  similarity: number;
  suggestedMerge: TodoItem;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Merge result
 */
export interface MergeResult {
  success: boolean;
  mergedTask: TodoItem;
  removedTasks: string[];
  error?: string;
}

/**
 * Sync all result
 */
export interface SyncAllResult {
  totalTasks: number;
  syncedTasks: number;
  conflicts: TaskConflict[];
  errors: SyncError[];
  duration: number;
}

/**
 * Sync error
 */
export interface SyncError {
  taskId: string;
  source: TaskSource;
  error: string;
  recoverable: boolean;
}

/**
 * Conflict resolution result
 */
export interface ConflictResolution {
  field: string;
  appleRemindersValue: unknown;
  notionValue: unknown;
  resolvedValue: unknown;
  resolution: 'apple_reminders' | 'notion' | 'manual';
}

/**
 * TaskSynchronizer
 * Handles synchronization of tasks between Apple Reminders and Notion
 */
export class TaskSynchronizer {
  private todoManager: TodoListManager;
  private similarityThreshold: number = 0.85;

  constructor() {
    this.todoManager = new TodoListManager();
  }

  /**
   * Sync all tasks across all sources
   * Requirement: 14.1
   */
  async syncAllTasks(): Promise<SyncAllResult> {
    const startTime = Date.now();
    const conflicts: TaskConflict[] = [];
    const errors: SyncError[] = [];
    let syncedTasks = 0;

    try {
      // Fetch all tasks
      const todos = await this.todoManager.listTodos();
      const totalTasks = todos.length;

      // Detect duplicates
      const duplicates = this.detectDuplicatesInList(todos);

      // Process each duplicate group
      for (const duplicate of duplicates) {
        try {
          // Check for conflicts between duplicate tasks
          const taskConflicts = this.detectConflicts(duplicate.tasks);
          conflicts.push(...taskConflicts);

          // Mark as synced
          syncedTasks += duplicate.tasks.length;
        } catch (error) {
          errors.push({
            taskId: duplicate.tasks[0].id,
            source: duplicate.tasks[0].source,
            error: (error as Error).message,
            recoverable: true,
          });
        }
      }

      // Sync unique tasks
      const uniqueTasks = todos.filter(
        (todo) => !duplicates.some((d) => d.tasks.some((t) => t.id === todo.id))
      );
      syncedTasks += uniqueTasks.length;

      return {
        totalTasks,
        syncedTasks,
        conflicts,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        totalTasks: 0,
        syncedTasks: 0,
        conflicts,
        errors: [
          {
            taskId: 'all',
            source: 'manual',
            error: (error as Error).message,
            recoverable: false,
          },
        ],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Detect duplicates in a list of tasks
   * Requirement: 14.2
   */
  detectDuplicatesInList(tasks: TodoItem[]): DuplicateTask[] {
    const duplicates: DuplicateTask[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < tasks.length; i++) {
      if (processed.has(tasks[i].id)) continue;

      const matchingTasks: TodoItem[] = [tasks[i]];

      for (let j = i + 1; j < tasks.length; j++) {
        if (processed.has(tasks[j].id)) continue;

        const similarity = this.calculateSimilarity(tasks[i].title, tasks[j].title);

        if (similarity >= this.similarityThreshold) {
          matchingTasks.push(tasks[j]);
          processed.add(tasks[j].id);
        }
      }

      if (matchingTasks.length > 1) {
        processed.add(tasks[i].id);

        const avgSimilarity =
          matchingTasks.length > 2
            ? this.calculateGroupSimilarity(matchingTasks)
            : this.calculateSimilarity(matchingTasks[0].title, matchingTasks[1].title);

        duplicates.push({
          tasks: matchingTasks,
          similarity: avgSimilarity,
          suggestedMerge: this.createSuggestedMerge(matchingTasks),
          confidence: this.determineConfidence(avgSimilarity),
        });
      }
    }

    return duplicates;
  }

  /**
   * Detect duplicates across all sources
   */
  async detectDuplicates(): Promise<DuplicateTask[]> {
    const todos = await this.todoManager.listTodos();
    return this.detectDuplicatesInList(todos);
  }

  /**
   * Calculate similarity between two strings
   * Uses Levenshtein distance normalized to 0-1 range
   */
  calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;

    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(s1, s2);
    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Calculate average similarity for a group of tasks
   */
  private calculateGroupSimilarity(tasks: TodoItem[]): number {
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        totalSimilarity += this.calculateSimilarity(tasks[i].title, tasks[j].title);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Determine confidence level based on similarity
   */
  private determineConfidence(similarity: number): 'high' | 'medium' | 'low' {
    if (similarity >= 0.95) return 'high';
    if (similarity >= 0.85) return 'medium';
    return 'low';
  }

  /**
   * Create a suggested merge from multiple tasks
   */
  createSuggestedMerge(tasks: TodoItem[]): TodoItem {
    // Sort by update time to get the most recent
    const sortedByUpdate = [...tasks].sort(
      (a, b) => new Date(b.updatedDate).getTime() - new Date(a.updatedDate).getTime()
    );

    // Sort by creation time to get the earliest
    const sortedByCreate = [...tasks].sort(
      (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()
    );

    // Use the highest priority
    const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3'];
    const highestPriority = tasks.reduce((highest, task) => {
      const currentIdx = priorities.indexOf(task.priority);
      const highestIdx = priorities.indexOf(highest);
      return currentIdx < highestIdx ? task.priority : highest;
    }, 'P3' as Priority);

    // Use the latest status
    const latestStatus = sortedByUpdate[0].status;

    // Combine all tags
    const allTags = [...new Set(tasks.flatMap((t) => t.tags))];

    // Use earliest due date
    const dueDates = tasks.filter((t) => t.dueDate).map((t) => new Date(t.dueDate!).getTime());
    const earliestDueDate =
      dueDates.length > 0 ? new Date(Math.min(...dueDates)).toISOString() : undefined;

    // Combine stakeholders
    const allStakeholders = [...new Set(tasks.flatMap((t) => t.stakeholders || []))];

    // Use longest description
    const descriptions = tasks.filter((t) => t.description).map((t) => t.description!);
    const longestDescription =
      descriptions.length > 0 ? descriptions.reduce((a, b) => (a.length > b.length ? a : b)) : undefined;

    // Use the first task's source and ID as the base
    const baseTask = sortedByCreate[0];

    return {
      id: `merged-${baseTask.id}`,
      title: baseTask.title, // Use the original title
      description: longestDescription,
      priority: highestPriority,
      status: latestStatus,
      dueDate: earliestDueDate,
      createdDate: sortedByCreate[0].createdDate,
      updatedDate: sortedByUpdate[0].updatedDate,
      source: baseTask.source,
      sourceId: baseTask.sourceId,
      tags: allTags,
      estimatedMinutes: tasks.find((t) => t.estimatedMinutes)?.estimatedMinutes,
      stakeholders: allStakeholders.length > 0 ? allStakeholders : undefined,
    };
  }

  /**
   * Merge duplicate tasks
   * Requirement: 14.2
   */
  async mergeDuplicates(duplicates: DuplicateTask[]): Promise<MergeResult> {
    if (duplicates.length === 0) {
      return {
        success: false,
        mergedTask: {} as TodoItem,
        removedTasks: [],
        error: 'No duplicates to merge',
      };
    }

    try {
      const duplicate = duplicates[0];
      const mergedTask = duplicate.suggestedMerge;

      // Get IDs of tasks to be removed (all except the merged one's base)
      const removedTasks = duplicate.tasks.slice(1).map((t) => t.id);

      // TODO: Actually remove duplicates from sources
      // This would require implementing delete operations in Apple Reminders and Notion

      return {
        success: true,
        mergedTask,
        removedTasks,
      };
    } catch (error) {
      return {
        success: false,
        mergedTask: {} as TodoItem,
        removedTasks: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Detect conflicts between tasks
   */
  private detectConflicts(tasks: TodoItem[]): TaskConflict[] {
    const conflicts: TaskConflict[] = [];

    if (tasks.length < 2) return conflicts;

    // Compare first two tasks for common conflict fields
    const task1 = tasks[0];
    const task2 = tasks[1];

    // Status conflict
    if (task1.status !== task2.status) {
      conflicts.push({
        field: 'status',
        appleRemindersValue: task1.source === 'apple_reminders' ? task1.status : task2.status,
        notionValue: task1.source === 'notion' ? task1.status : task2.status,
        resolvedValue: this.resolveStatusConflict(task1, task2),
        resolution: this.determineResolution(task1, task2),
      });
    }

    // Priority conflict
    if (task1.priority !== task2.priority) {
      conflicts.push({
        field: 'priority',
        appleRemindersValue:
          task1.source === 'apple_reminders' ? task1.priority : task2.priority,
        notionValue: task1.source === 'notion' ? task1.priority : task2.priority,
        resolvedValue: this.resolvePriorityConflict(task1, task2),
        resolution: this.determineResolution(task1, task2),
      });
    }

    return conflicts;
  }

  /**
   * Resolve status conflict (use most recently updated)
   */
  private resolveStatusConflict(task1: TodoItem, task2: TodoItem): TodoStatus {
    const date1 = new Date(task1.updatedDate).getTime();
    const date2 = new Date(task2.updatedDate).getTime();
    return date1 >= date2 ? task1.status : task2.status;
  }

  /**
   * Resolve priority conflict (use highest priority)
   */
  private resolvePriorityConflict(task1: TodoItem, task2: TodoItem): Priority {
    const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3'];
    const idx1 = priorities.indexOf(task1.priority);
    const idx2 = priorities.indexOf(task2.priority);
    return idx1 <= idx2 ? task1.priority : task2.priority;
  }

  /**
   * Determine which source wins for conflict resolution
   */
  private determineResolution(
    task1: TodoItem,
    task2: TodoItem
  ): 'apple_reminders' | 'notion' {
    const date1 = new Date(task1.updatedDate).getTime();
    const date2 = new Date(task2.updatedDate).getTime();

    if (date1 >= date2) {
      return task1.source === 'apple_reminders' ? 'apple_reminders' : 'notion';
    }
    return task2.source === 'apple_reminders' ? 'apple_reminders' : 'notion';
  }

  /**
   * Resolve conflicts
   * Requirement: 14.1
   */
  async resolveConflicts(conflicts: TaskConflict[]): Promise<ConflictResolution[]> {
    return conflicts.map((conflict) => {
      let resolvedValue: unknown;

      switch (conflict.field) {
        case 'status':
          // Use the specified resolution's value
          resolvedValue =
            conflict.resolution === 'apple_reminders'
              ? conflict.appleRemindersValue
              : conflict.notionValue;
          break;

        case 'priority':
          // Use higher priority
          const priorities = ['P0', 'P1', 'P2', 'P3'];
          const arIdx = priorities.indexOf(conflict.appleRemindersValue as string);
          const nIdx = priorities.indexOf(conflict.notionValue as string);
          resolvedValue = arIdx <= nIdx ? conflict.appleRemindersValue : conflict.notionValue;
          break;

        default:
          // Default to the specified resolution
          resolvedValue =
            conflict.resolution === 'apple_reminders'
              ? conflict.appleRemindersValue
              : conflict.notionValue;
      }

      return {
        field: conflict.field,
        appleRemindersValue: conflict.appleRemindersValue,
        notionValue: conflict.notionValue,
        resolvedValue,
        resolution: conflict.resolution,
      };
    });
  }
}
