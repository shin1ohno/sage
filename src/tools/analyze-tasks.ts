/**
 * Task Analysis Integration
 * Combines all analysis components into a unified tool
 * Requirements: 2.1-2.6, 3.1-3.2, 4.1-4.5
 */

import type {
  Task,
  AnalyzedTask,
  UserConfig,
  Priority,
  Reminder,
  AnalysisReasoning,
} from '../types/index.js';
import { TaskSplitter } from '../utils/task-splitter.js';
import { PriorityEngine } from '../utils/priority.js';
import { TimeEstimator } from '../utils/estimation.js';
import { StakeholderExtractor } from '../utils/stakeholders.js';

export interface AnalysisResult {
  success: boolean;
  originalInput?: string;
  analyzedTasks: AnalyzedTask[];
  splitInfo?: {
    wasSplit: boolean;
    splitReason: string;
    recommendedOrder: number[];
  };
  summary: {
    totalTasks: number;
    p0Count: number;
    p1Count: number;
    p2Count: number;
    p3Count: number;
    totalEstimatedMinutes: number;
    uniqueStakeholders: string[];
  };
}

export class TaskAnalyzer {
  /**
   * Analyze a list of tasks
   * Requirement: 2.1, 2.5, 2.6
   */
  static async analyzeTasks(tasks: Task[], config: UserConfig): Promise<AnalysisResult> {
    const analyzedTasks: AnalyzedTask[] = [];

    for (const task of tasks) {
      const analyzed = this.analyzeTask(task, config);
      analyzedTasks.push(analyzed);
    }

    // Sort by priority
    analyzedTasks.sort((a, b) => {
      const priorityOrder: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return {
      success: true,
      analyzedTasks,
      summary: this.buildSummary(analyzedTasks),
    };
  }

  /**
   * Analyze a single task
   */
  static analyzeTask(task: Task, config: UserConfig): AnalyzedTask {
    // Determine priority
    const priorityResult = PriorityEngine.determinePriority(
      task,
      config.priorityRules,
      config.team
    );

    // Estimate duration
    const estimationResult = TimeEstimator.estimateDuration(task, config.estimation);

    // Extract stakeholders
    const stakeholderResult = StakeholderExtractor.extractStakeholders(task, config.team);

    // Adjust priority if manager is involved
    let finalPriority = priorityResult.priority;
    if (stakeholderResult.managerInvolved && finalPriority !== 'P0') {
      const priorityOrder: Priority[] = ['P0', 'P1', 'P2', 'P3'];
      const currentIndex = priorityOrder.indexOf(finalPriority);
      if (currentIndex > 0) {
        finalPriority = priorityOrder[currentIndex - 1];
      }
    }

    // Generate suggested reminders
    const suggestedReminders = this.generateReminders(task, config);

    // Build tags
    const tags = this.generateTags(task, estimationResult.complexity, stakeholderResult.managerInvolved);

    // Build reasoning
    const reasoning: AnalysisReasoning = {
      priorityReason: priorityResult.reason,
      estimationReason: estimationResult.reason,
      stakeholderReason: stakeholderResult.reason,
    };

    return {
      original: task,
      priority: finalPriority,
      estimatedMinutes: estimationResult.estimatedMinutes,
      stakeholders: stakeholderResult.stakeholders,
      suggestedReminders,
      reasoning,
      tags,
    };
  }

  /**
   * Analyze from raw text input (with splitting)
   */
  static async analyzeFromText(input: string, config: UserConfig): Promise<AnalysisResult> {
    // First, split the input into tasks
    const splitResult = TaskSplitter.splitTasks(input);

    // Analyze each task
    const analyzed = await this.analyzeTasks(splitResult.splitTasks, config);

    return {
      ...analyzed,
      originalInput: input,
      splitInfo: {
        wasSplit: splitResult.splitTasks.length > 1,
        splitReason: splitResult.splitReason,
        recommendedOrder: splitResult.recommendedOrder,
      },
    };
  }

  /**
   * Generate reminder suggestions based on task and deadline
   */
  private static generateReminders(task: Task, config: UserConfig): Reminder[] {
    const reminders: Reminder[] = [];

    if (!task.deadline) {
      return reminders;
    }

    const deadline = new Date(task.deadline);
    const now = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Default reminder types from config
    for (const reminderType of config.reminders.defaultTypes) {
      const reminderTime = this.calculateReminderTime(deadline, reminderType);
      if (reminderTime > now) {
        reminders.push({
          type: reminderType,
          time: reminderTime.toISOString(),
          message: `${task.title}の期限が近づいています`,
        });
      }
    }

    // Add urgency-based reminders
    if (daysUntilDeadline <= 1) {
      reminders.push({
        type: 'urgent',
        time: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes from now
        message: `【緊急】${task.title}の期限は本日です`,
      });
    }

    return reminders;
  }

  /**
   * Calculate reminder time based on type
   */
  private static calculateReminderTime(deadline: Date, reminderType: string): Date {
    const time = new Date(deadline);

    switch (reminderType) {
      case '1_hour_before':
        time.setHours(time.getHours() - 1);
        break;
      case '3_hours_before':
        time.setHours(time.getHours() - 3);
        break;
      case '1_day_before':
        time.setDate(time.getDate() - 1);
        break;
      case '3_days_before':
        time.setDate(time.getDate() - 3);
        break;
      case '1_week_before':
        time.setDate(time.getDate() - 7);
        break;
      default:
        time.setDate(time.getDate() - 1); // Default to 1 day before
    }

    return time;
  }

  /**
   * Generate tags for the task
   */
  private static generateTags(
    task: Task,
    complexity: 'simple' | 'medium' | 'complex' | 'project',
    managerInvolved: boolean
  ): string[] {
    const tags: string[] = [];

    // Add complexity tag
    tags.push(complexity);

    // Add manager tag if involved
    if (managerInvolved) {
      tags.push('manager-involved');
    }

    // Add deadline tag if present
    if (task.deadline) {
      const deadline = new Date(task.deadline);
      const now = new Date();
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysUntil <= 1) {
        tags.push('due-today');
      } else if (daysUntil <= 3) {
        tags.push('due-soon');
      } else if (daysUntil <= 7) {
        tags.push('due-this-week');
      }
    }

    // Add existing tags from task
    if (task.tags) {
      tags.push(...task.tags.filter((t) => !tags.includes(t)));
    }

    return tags;
  }

  /**
   * Build summary statistics
   */
  private static buildSummary(analyzedTasks: AnalyzedTask[]): AnalysisResult['summary'] {
    const allStakeholders = new Set<string>();
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let p3Count = 0;
    let totalMinutes = 0;

    for (const task of analyzedTasks) {
      switch (task.priority) {
        case 'P0':
          p0Count++;
          break;
        case 'P1':
          p1Count++;
          break;
        case 'P2':
          p2Count++;
          break;
        case 'P3':
          p3Count++;
          break;
      }

      totalMinutes += task.estimatedMinutes;

      for (const stakeholder of task.stakeholders) {
        allStakeholders.add(stakeholder);
      }
    }

    return {
      totalTasks: analyzedTasks.length,
      p0Count,
      p1Count,
      p2Count,
      p3Count,
      totalEstimatedMinutes: totalMinutes,
      uniqueStakeholders: Array.from(allStakeholders),
    };
  }

  /**
   * Format analysis result for display
   */
  static formatResult(result: AnalysisResult): string {
    const lines: string[] = [];

    lines.push('## タスク分析結果\n');

    // Summary
    lines.push('### サマリー');
    lines.push(`- 総タスク数: ${result.summary.totalTasks}`);
    lines.push(
      `- 優先度内訳: P0=${result.summary.p0Count}, P1=${result.summary.p1Count}, P2=${result.summary.p2Count}, P3=${result.summary.p3Count}`
    );
    lines.push(
      `- 総見積もり時間: ${Math.floor(result.summary.totalEstimatedMinutes / 60)}時間${result.summary.totalEstimatedMinutes % 60}分`
    );
    if (result.summary.uniqueStakeholders.length > 0) {
      lines.push(`- 関係者: ${result.summary.uniqueStakeholders.join(', ')}`);
    }
    lines.push('');

    // Split info
    if (result.splitInfo?.wasSplit) {
      lines.push(`> ${result.splitInfo.splitReason}`);
      lines.push('');
    }

    // Tasks
    lines.push('### タスク詳細\n');
    for (let i = 0; i < result.analyzedTasks.length; i++) {
      const task = result.analyzedTasks[i];
      lines.push(`#### ${i + 1}. ${task.original.title}`);
      lines.push(`- **優先度**: ${task.priority}`);
      lines.push(`- **見積もり**: ${task.estimatedMinutes}分`);
      lines.push(`- **理由**: ${task.reasoning.priorityReason}`);
      if (task.stakeholders.length > 0) {
        lines.push(`- **関係者**: ${task.stakeholders.join(', ')}`);
      }
      if (task.tags.length > 0) {
        lines.push(`- **タグ**: ${task.tags.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
