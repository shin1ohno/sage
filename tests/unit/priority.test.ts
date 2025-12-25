/**
 * Priority Engine Unit Tests
 * Requirements: 2.1-2.5
 */

import { PriorityEngine } from '../../src/utils/priority.js';
import type { Task, PriorityRules, TeamConfig } from '../../src/types/index.js';

describe('PriorityEngine', () => {
  const defaultRules: PriorityRules = {
    p0Conditions: [
      {
        type: 'deadline',
        operator: '<',
        value: 24,
        unit: 'hours',
        description: 'Due within 24 hours',
      },
      {
        type: 'keyword',
        operator: 'contains',
        value: ['urgent', 'emergency', '緊急', '至急'],
        description: 'Contains urgent keywords',
      },
    ],
    p1Conditions: [
      {
        type: 'deadline',
        operator: '<',
        value: 3,
        unit: 'days',
        description: 'Due within 3 days',
      },
      {
        type: 'stakeholder',
        operator: 'contains',
        value: 'manager',
        description: 'Involves manager',
      },
    ],
    p2Conditions: [
      {
        type: 'deadline',
        operator: '<',
        value: 7,
        unit: 'days',
        description: 'Due within a week',
      },
    ],
    defaultPriority: 'P3',
  };

  const teamConfig: TeamConfig = {
    manager: {
      name: 'John Manager',
      role: 'manager',
      keywords: ['john', 'manager'],
    },
    frequentCollaborators: [],
    departments: [],
  };

  describe('determinePriority', () => {
    it('should return P0 for tasks with urgent keywords', () => {
      const task: Task = { title: 'Fix urgent production bug' };
      const result = PriorityEngine.determinePriority(task, defaultRules);

      expect(result.priority).toBe('P0');
      expect(result.reason).toContain('P0');
    });

    it('should return P0 for tasks with Japanese urgent keywords', () => {
      const task: Task = { title: '緊急: サーバー障害対応' };
      const result = PriorityEngine.determinePriority(task, defaultRules);

      expect(result.priority).toBe('P0');
    });

    it('should return P0 for tasks due within 24 hours', () => {
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 12);

      const task: Task = {
        title: 'Submit report',
        deadline: tomorrow.toISOString(),
      };
      const result = PriorityEngine.determinePriority(task, defaultRules);

      expect(result.priority).toBe('P0');
      expect(result.conditions).toContain('Due within 24 hours');
    });

    it('should return P1 for tasks involving manager', () => {
      const task: Task = { title: 'Review with manager John' };
      const result = PriorityEngine.determinePriority(task, defaultRules, teamConfig);

      expect(result.priority).toBe('P1');
    });

    it('should return P1 for tasks due within 3 days', () => {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 2);

      const task: Task = {
        title: 'Complete feature',
        deadline: threeDaysFromNow.toISOString(),
      };
      const result = PriorityEngine.determinePriority(task, defaultRules);

      expect(result.priority).toBe('P1');
    });

    it('should return P2 for tasks due within a week', () => {
      const fiveDaysFromNow = new Date();
      fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

      const task: Task = {
        title: 'Write documentation',
        deadline: fiveDaysFromNow.toISOString(),
      };
      const result = PriorityEngine.determinePriority(task, defaultRules);

      expect(result.priority).toBe('P2');
    });

    it('should return default priority P3 for regular tasks', () => {
      const task: Task = { title: 'Review code changes' };
      const result = PriorityEngine.determinePriority(task, defaultRules);

      expect(result.priority).toBe('P3');
      expect(result.reason).toContain('P3');
    });

    it('should return P3 for tasks with far future deadline', () => {
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

      const task: Task = {
        title: 'Plan next quarter',
        deadline: twoWeeksFromNow.toISOString(),
      };
      const result = PriorityEngine.determinePriority(task, defaultRules);

      expect(result.priority).toBe('P3');
    });
  });

  describe('hasUrgentKeywords', () => {
    it('should detect English urgent keywords', () => {
      expect(PriorityEngine.hasUrgentKeywords('This is urgent!')).toBe(true);
      expect(PriorityEngine.hasUrgentKeywords('Emergency fix needed')).toBe(true);
      expect(PriorityEngine.hasUrgentKeywords('Critical bug')).toBe(true);
    });

    it('should detect Japanese urgent keywords', () => {
      expect(PriorityEngine.hasUrgentKeywords('緊急対応が必要')).toBe(true);
      expect(PriorityEngine.hasUrgentKeywords('至急確認してください')).toBe(true);
    });

    it('should return false for normal text', () => {
      expect(PriorityEngine.hasUrgentKeywords('Regular task')).toBe(false);
      expect(PriorityEngine.hasUrgentKeywords('通常のタスク')).toBe(false);
    });
  });

  describe('hasImportantKeywords', () => {
    it('should detect important keywords', () => {
      expect(PriorityEngine.hasImportantKeywords('This is important')).toBe(true);
      expect(PriorityEngine.hasImportantKeywords('High priority task')).toBe(true);
      expect(PriorityEngine.hasImportantKeywords('重要な会議')).toBe(true);
    });

    it('should return false for normal text', () => {
      expect(PriorityEngine.hasImportantKeywords('Regular meeting')).toBe(false);
    });
  });

  describe('evaluateConditions - edge cases', () => {
    it('should handle blocking condition type', () => {
      const task: Task = { title: 'This is a blocker issue' };
      const rulesWithBlocking: PriorityRules = {
        ...defaultRules,
        p0Conditions: [
          {
            type: 'blocking',
            operator: 'contains',
            value: 'blocker',
            description: 'Blocking issue',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithBlocking);
      expect(result.priority).toBe('P0');
    });

    it('should handle custom condition type with contains operator', () => {
      const task: Task = { title: 'Special custom-tag task' };
      const rulesWithCustom: PriorityRules = {
        ...defaultRules,
        p0Conditions: [
          {
            type: 'custom',
            operator: 'contains',
            value: 'custom-tag',
            description: 'Custom tag detected',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithCustom);
      expect(result.priority).toBe('P0');
    });

    it('should handle custom condition type with matches operator', () => {
      const task: Task = { title: 'Task REF-123 needs attention' };
      const rulesWithCustom: PriorityRules = {
        ...defaultRules,
        p0Conditions: [
          {
            type: 'custom',
            operator: 'matches',
            value: 'REF-\\d+',
            description: 'Reference ID pattern',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithCustom);
      expect(result.priority).toBe('P0');
    });

    it('should handle weeks unit in deadline condition', () => {
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 10);

      const task: Task = {
        title: 'Long term task',
        deadline: twoWeeksFromNow.toISOString(),
      };

      const rulesWithWeeks: PriorityRules = {
        ...defaultRules,
        p1Conditions: [
          {
            type: 'deadline',
            operator: '<',
            value: 2,
            unit: 'weeks',
            description: 'Due within 2 weeks',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithWeeks);
      expect(result.priority).toBe('P1');
    });

    it('should handle > operator in deadline condition', () => {
      const farFuture = new Date();
      farFuture.setDate(farFuture.getDate() + 30);

      const task: Task = {
        title: 'Far future task',
        deadline: farFuture.toISOString(),
      };

      const rulesWithGreaterThan: PriorityRules = {
        ...defaultRules,
        p2Conditions: [
          {
            type: 'deadline',
            operator: '>',
            value: 14,
            unit: 'days',
            description: 'Due after 2 weeks',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithGreaterThan);
      expect(result.priority).toBe('P2');
    });

    it('should handle = operator in deadline condition', () => {
      const exactTime = new Date();
      exactTime.setDate(exactTime.getDate() + 7);

      const task: Task = {
        title: 'Exact deadline task',
        deadline: exactTime.toISOString(),
      };

      const rulesWithEquals: PriorityRules = {
        ...defaultRules,
        p1Conditions: [
          {
            type: 'deadline',
            operator: '=',
            value: 7,
            unit: 'days',
            description: 'Due exactly in 7 days',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithEquals);
      expect(result.priority).toBe('P1');
    });

    it('should handle keyword condition with matches operator', () => {
      const task: Task = { title: 'TICKET-456 needs review' };
      const rulesWithMatches: PriorityRules = {
        ...defaultRules,
        p0Conditions: [
          {
            type: 'keyword',
            operator: 'matches',
            value: ['TICKET-\\d+'],
            description: 'Ticket pattern',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithMatches);
      expect(result.priority).toBe('P0');
    });

    it('should handle lead role in stakeholder condition', () => {
      const task: Task = { title: 'Review with Lead Person' };
      const teamConfigWithLead: TeamConfig = {
        manager: undefined,
        frequentCollaborators: [
          {
            name: 'Lead Person',
            role: 'lead',
            keywords: ['lead person', 'team lead'],
          },
        ],
        departments: [],
      };

      const rulesWithLead: PriorityRules = {
        ...defaultRules,
        p1Conditions: [
          {
            type: 'stakeholder',
            operator: 'contains',
            value: 'lead',
            description: 'Involves lead',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithLead, teamConfigWithLead);
      expect(result.priority).toBe('P1');
    });

    it('should return false for unknown condition type', () => {
      const task: Task = { title: 'Normal task' };
      const rulesWithUnknown: PriorityRules = {
        ...defaultRules,
        p0Conditions: [
          {
            type: 'unknown' as any,
            operator: 'contains',
            value: 'test',
            description: 'Unknown type',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithUnknown);
      expect(result.priority).toBe('P3'); // Falls back to default
    });

    it('should return false for unknown deadline operator', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task: Task = {
        title: 'Task',
        deadline: tomorrow.toISOString(),
      };

      const rulesWithUnknownOp: PriorityRules = {
        p0Conditions: [
          {
            type: 'deadline',
            operator: '!=' as any,
            value: 1,
            unit: 'days',
            description: 'Unknown operator',
          },
        ],
        p1Conditions: [],
        p2Conditions: [],
        defaultPriority: 'P3',
      };

      const result = PriorityEngine.determinePriority(task, rulesWithUnknownOp);
      expect(result.priority).toBe('P3');
    });

    it('should return false for unknown keyword operator', () => {
      const task: Task = { title: 'Normal task' };
      const rulesWithUnknownOp: PriorityRules = {
        ...defaultRules,
        p0Conditions: [
          {
            type: 'keyword',
            operator: '!=' as any,
            value: ['test'],
            description: 'Unknown operator',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithUnknownOp);
      expect(result.priority).toBe('P3');
    });

    it('should handle default unit in deadline condition', () => {
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 20);

      const task: Task = {
        title: 'Soon task',
        deadline: tomorrow.toISOString(),
      };

      const rulesWithNoUnit: PriorityRules = {
        ...defaultRules,
        p0Conditions: [
          {
            type: 'deadline',
            operator: '<',
            value: 24,
            // No unit specified - should default to hours
            description: 'Due within 24 hours',
          },
        ],
      };

      const result = PriorityEngine.determinePriority(task, rulesWithNoUnit);
      expect(result.priority).toBe('P0');
    });

    it('should return false for unknown operator in custom condition', () => {
      const task: Task = { title: 'Custom task with special-marker' };
      const rulesWithUnknownOp: PriorityRules = {
        p0Conditions: [
          {
            type: 'custom',
            operator: '!=' as any,
            value: 'special-marker',
            description: 'Unknown operator',
          },
        ],
        p1Conditions: [],
        p2Conditions: [],
        defaultPriority: 'P3',
      };

      const result = PriorityEngine.determinePriority(task, rulesWithUnknownOp);
      expect(result.priority).toBe('P3');
    });

    it('should provide default reason when no conditions match', () => {
      const task: Task = { title: 'Plain simple task' };
      const emptyRules: PriorityRules = {
        p0Conditions: [],
        p1Conditions: [],
        p2Conditions: [],
        defaultPriority: 'P3',
      };

      const result = PriorityEngine.determinePriority(task, emptyRules);
      expect(result.priority).toBe('P3');
      expect(result.reason).toContain('P3');
    });
  });
});
