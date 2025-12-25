/**
 * Priority Engine
 * Determines task priority based on rules and conditions
 * Requirements: 2.1-2.5
 */

import type { Task, Priority, PriorityRules, PriorityCondition, TeamConfig } from '../types/index.js';

// Urgent keywords for P0
const URGENT_KEYWORDS = [
  'urgent',
  'emergency',
  'critical',
  'asap',
  'immediately',
  '緊急',
  '至急',
  '今すぐ',
  'ブロッカー',
  'blocker',
  'blocking',
  '障害',
  'incident',
  'outage',
];

// Important keywords for P1
const IMPORTANT_KEYWORDS = [
  'important',
  'high priority',
  '重要',
  '優先',
  'deadline',
  '期限',
  '締め切り',
  'due soon',
];

interface PriorityResult {
  priority: Priority;
  reason: string;
  conditions: string[];
}

export class PriorityEngine {
  /**
   * Determine the priority of a task
   * Requirement: 2.1, 2.2, 2.5
   */
  static determinePriority(
    task: Task,
    rules: PriorityRules,
    teamConfig?: TeamConfig
  ): PriorityResult {
    // Check P0 conditions
    const p0Match = this.evaluateConditions(task, rules.p0Conditions, teamConfig);
    if (p0Match.matched) {
      return {
        priority: 'P0',
        reason: this.buildReason('P0', p0Match.reasons),
        conditions: p0Match.reasons,
      };
    }

    // Check P1 conditions
    const p1Match = this.evaluateConditions(task, rules.p1Conditions, teamConfig);
    if (p1Match.matched) {
      return {
        priority: 'P1',
        reason: this.buildReason('P1', p1Match.reasons),
        conditions: p1Match.reasons,
      };
    }

    // Check P2 conditions
    const p2Match = this.evaluateConditions(task, rules.p2Conditions, teamConfig);
    if (p2Match.matched) {
      return {
        priority: 'P2',
        reason: this.buildReason('P2', p2Match.reasons),
        conditions: p2Match.reasons,
      };
    }

    // Default priority
    return {
      priority: rules.defaultPriority,
      reason: `デフォルト優先度 (${rules.defaultPriority})`,
      conditions: [],
    };
  }

  /**
   * Evaluate a set of conditions against a task
   * Requirement: 2.2, 2.3, 2.4
   */
  static evaluateConditions(
    task: Task,
    conditions: PriorityCondition[],
    teamConfig?: TeamConfig
  ): { matched: boolean; reasons: string[] } {
    const reasons: string[] = [];

    for (const condition of conditions) {
      if (this.evaluateSingleCondition(task, condition, teamConfig)) {
        reasons.push(condition.description);
      }
    }

    return {
      matched: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Evaluate a single condition
   */
  private static evaluateSingleCondition(
    task: Task,
    condition: PriorityCondition,
    teamConfig?: TeamConfig
  ): boolean {
    const text = `${task.title} ${task.description ?? ''}`.toLowerCase();

    switch (condition.type) {
      case 'deadline':
        return this.evaluateDeadlineCondition(task, condition);

      case 'keyword':
        return this.evaluateKeywordCondition(text, condition);

      case 'stakeholder':
        return this.evaluateStakeholderCondition(text, condition, teamConfig);

      case 'blocking':
        return this.evaluateBlockingCondition(text);

      case 'custom':
        return this.evaluateCustomCondition(text, condition);

      default:
        return false;
    }
  }

  /**
   * Evaluate deadline-based conditions
   * Requirement: 2.3
   */
  private static evaluateDeadlineCondition(task: Task, condition: PriorityCondition): boolean {
    if (!task.deadline) return false;

    const deadline = new Date(task.deadline);
    const now = new Date();
    const diffMs = deadline.getTime() - now.getTime();

    let thresholdMs: number;
    const value = condition.value as number;

    switch (condition.unit) {
      case 'hours':
        thresholdMs = value * 60 * 60 * 1000;
        break;
      case 'days':
        thresholdMs = value * 24 * 60 * 60 * 1000;
        break;
      case 'weeks':
        thresholdMs = value * 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        thresholdMs = value * 60 * 60 * 1000; // Default to hours
    }

    switch (condition.operator) {
      case '<':
        // Include overdue tasks (diffMs <= 0) as well as tasks due within threshold
        return diffMs <= thresholdMs;
      case '>':
        return diffMs > thresholdMs;
      case '=':
        return Math.abs(diffMs - thresholdMs) < 60 * 60 * 1000; // Within 1 hour
      default:
        return false;
    }
  }

  /**
   * Evaluate keyword-based conditions
   * Requirement: 2.3
   */
  private static evaluateKeywordCondition(text: string, condition: PriorityCondition): boolean {
    const keywords = Array.isArray(condition.value) ? condition.value : [condition.value as string];

    switch (condition.operator) {
      case 'contains':
        return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
      case 'matches':
        return keywords.some((keyword) => {
          const regex = new RegExp(keyword, 'i');
          return regex.test(text);
        });
      default:
        return false;
    }
  }

  /**
   * Evaluate stakeholder-based conditions
   * Requirement: 2.4
   */
  private static evaluateStakeholderCondition(
    text: string,
    condition: PriorityCondition,
    teamConfig?: TeamConfig
  ): boolean {
    const value = condition.value as string;

    if (value === 'manager') {
      const managerKeywords = [
        'manager',
        'マネージャー',
        '上司',
        'boss',
        '部長',
        '課長',
        '係長',
        '主任',
        '社長',
        '取締役',
        'director',
        'lead',
        'リーダー',
      ];

      // Add configured manager keywords if available
      if (teamConfig?.manager) {
        managerKeywords.push(teamConfig.manager.name.toLowerCase());
        managerKeywords.push(...teamConfig.manager.keywords.map((k) => k.toLowerCase()));
      }

      return managerKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
    }

    if (value === 'lead' && teamConfig?.frequentCollaborators) {
      const leads = teamConfig.frequentCollaborators.filter((c) => c.role === 'lead');
      return leads.some((lead) =>
        lead.keywords.some((keyword) => text.includes(keyword.toLowerCase()))
      );
    }

    return false;
  }

  /**
   * Evaluate blocking task conditions
   */
  private static evaluateBlockingCondition(text: string): boolean {
    const blockingKeywords = [
      'blocking',
      'blocker',
      'blocks',
      'ブロック',
      'ブロッカー',
      '障害',
      'dependency',
      '依存',
    ];
    return blockingKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  /**
   * Evaluate custom conditions
   */
  private static evaluateCustomCondition(text: string, condition: PriorityCondition): boolean {
    const value = condition.value as string;

    switch (condition.operator) {
      case 'contains':
        return text.includes(value.toLowerCase());
      case 'matches':
        const regex = new RegExp(value, 'i');
        return regex.test(text);
      default:
        return false;
    }
  }

  /**
   * Quick check for urgent keywords without full rules
   */
  static hasUrgentKeywords(text: string): boolean {
    const lowerText = text.toLowerCase();
    return URGENT_KEYWORDS.some((keyword) => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Quick check for important keywords without full rules
   */
  static hasImportantKeywords(text: string): boolean {
    const lowerText = text.toLowerCase();
    return IMPORTANT_KEYWORDS.some((keyword) => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Build a human-readable reason string
   * Note: This is only called when conditions are matched
   */
  private static buildReason(priority: Priority, conditions: string[]): string {
    if (conditions.length === 1) {
      return `${conditions[0]}のため${priority}に設定`;
    }

    return `${conditions.join('、')}のため${priority}に設定`;
  }
}
