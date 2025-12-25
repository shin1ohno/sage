/**
 * Task Analyzer Unit Tests
 * Requirements: 2.1-2.6, 3.1-3.2, 4.1-4.5
 */

import { TaskAnalyzer } from '../../src/tools/analyze-tasks.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';
import type { Task, UserConfig } from '../../src/types/index.js';

describe('TaskAnalyzer', () => {
  const testConfig: UserConfig = {
    ...DEFAULT_CONFIG,
    user: {
      name: 'Test User',
      timezone: 'Asia/Tokyo',
    },
    team: {
      manager: {
        name: 'Manager San',
        role: 'manager',
        keywords: ['manager', 'マネージャー'],
      },
      frequentCollaborators: [
        {
          name: 'Collaborator',
          role: 'team',
          keywords: ['collaborator'],
        },
      ],
      departments: ['Engineering'],
    },
  };

  describe('analyzeTasks', () => {
    it('should analyze a list of tasks', async () => {
      const tasks: Task[] = [
        { title: 'Review PR' },
        { title: 'Fix urgent bug' },
        { title: 'Write documentation' },
      ];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toHaveLength(3);
    });

    it('should assign priority to each task', async () => {
      const tasks: Task[] = [
        { title: 'Fix urgent production issue' },
        { title: 'Regular code review' },
      ];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.analyzedTasks[0].priority).toBe('P0'); // urgent keyword
      expect(['P2', 'P3']).toContain(result.analyzedTasks[1].priority); // regular task
    });

    it('should estimate duration for each task', async () => {
      const tasks: Task[] = [
        { title: 'Quick review' },
        { title: 'Design new architecture' },
      ];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.analyzedTasks[0].estimatedMinutes).toBeLessThan(
        result.analyzedTasks[1].estimatedMinutes
      );
    });

    it('should extract stakeholders', async () => {
      const tasks: Task[] = [{ title: 'Meeting with @john about the project' }];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.analyzedTasks[0].stakeholders).toContain('john');
    });

    it('should boost priority when manager is involved', async () => {
      const tasks: Task[] = [{ title: 'Report to Manager San' }];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      // Manager involvement should boost priority
      expect(['P0', 'P1']).toContain(result.analyzedTasks[0].priority);
    });

    it('should sort tasks by priority', async () => {
      const tasks: Task[] = [
        { title: 'Low priority task' },
        { title: 'Urgent emergency fix' },
        { title: 'Medium priority implementation' },
      ];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      // First task should be highest priority
      const priorities = result.analyzedTasks.map((t) => t.priority);
      expect(priorities[0]).toBe('P0');
    });

    it('should provide reasoning for each analysis', async () => {
      const tasks: Task[] = [{ title: 'Fix the login bug' }];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.analyzedTasks[0].reasoning).toBeDefined();
      expect(result.analyzedTasks[0].reasoning.priorityReason).toBeTruthy();
      expect(result.analyzedTasks[0].reasoning.estimationReason).toBeTruthy();
      expect(result.analyzedTasks[0].reasoning.stakeholderReason).toBeTruthy();
    });

    it('should generate tags for tasks', async () => {
      const tasks: Task[] = [{ title: 'Simple check task' }];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.analyzedTasks[0].tags).toBeDefined();
      expect(Array.isArray(result.analyzedTasks[0].tags)).toBe(true);
    });
  });

  describe('analyzeTask (single)', () => {
    it('should analyze a single task', () => {
      const task: Task = { title: 'Review code changes' };

      const result = TaskAnalyzer.analyzeTask(task, testConfig);

      expect(result.original).toEqual(task);
      expect(result.priority).toBeDefined();
      expect(result.estimatedMinutes).toBeGreaterThan(0);
    });

    it('should handle task with deadline', () => {
      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

      const task: Task = {
        title: 'Submit report',
        deadline: twoDaysFromNow.toISOString(),
      };

      const result = TaskAnalyzer.analyzeTask(task, testConfig);

      expect(result.suggestedReminders.length).toBeGreaterThan(0);
      expect(result.tags).toContain('due-soon');
    });

    it('should mark tasks due today appropriately', () => {
      const today = new Date();
      today.setHours(today.getHours() + 6);

      const task: Task = {
        title: 'Urgent submission',
        deadline: today.toISOString(),
      };

      const result = TaskAnalyzer.analyzeTask(task, testConfig);

      expect(result.tags).toContain('due-today');
    });

    it('should tag manager-involved tasks', () => {
      const task: Task = { title: 'Present to マネージャー' };

      const result = TaskAnalyzer.analyzeTask(task, testConfig);

      expect(result.tags).toContain('manager-involved');
    });
  });

  describe('analyzeFromText', () => {
    it('should split and analyze text with multiple tasks', async () => {
      const input = `
- Review PR #123
- Fix login bug
- Update documentation
      `.trim();

      const result = await TaskAnalyzer.analyzeFromText(input, testConfig);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks.length).toBe(3);
      expect(result.splitInfo?.wasSplit).toBe(true);
    });

    it('should handle single task text', async () => {
      const input = 'Review the pull request';

      const result = await TaskAnalyzer.analyzeFromText(input, testConfig);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks.length).toBe(1);
      expect(result.splitInfo?.wasSplit).toBe(false);
    });

    it('should include original input in result', async () => {
      const input = 'Test task';

      const result = await TaskAnalyzer.analyzeFromText(input, testConfig);

      expect(result.originalInput).toBe(input);
    });
  });

  describe('summary', () => {
    it('should provide accurate summary statistics', async () => {
      const tasks: Task[] = [
        { title: 'Urgent fix' }, // P0
        { title: 'Review code' }, // P2/P3
        { title: 'Meeting with @alice' }, // has stakeholder
      ];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.summary.totalTasks).toBe(3);
      expect(result.summary.p0Count).toBeGreaterThanOrEqual(1);
      expect(result.summary.totalEstimatedMinutes).toBeGreaterThan(0);
    });

    it('should collect unique stakeholders', async () => {
      const tasks: Task[] = [
        { title: 'Meeting with @alice' },
        { title: 'Review with @bob and @alice' },
      ];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);

      expect(result.summary.uniqueStakeholders).toContain('alice');
      expect(result.summary.uniqueStakeholders).toContain('bob');
      // alice should only appear once
      const aliceCount = result.summary.uniqueStakeholders.filter((s) => s === 'alice').length;
      expect(aliceCount).toBe(1);
    });
  });

  describe('formatResult', () => {
    it('should format result as markdown', async () => {
      const tasks: Task[] = [{ title: 'Test task' }];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);
      const formatted = TaskAnalyzer.formatResult(result);

      expect(formatted).toContain('## タスク分析結果');
      expect(formatted).toContain('### サマリー');
      expect(formatted).toContain('### タスク詳細');
      expect(formatted).toContain('Test task');
    });

    it('should include priority and time estimates in formatted output', async () => {
      const tasks: Task[] = [{ title: 'Review PR' }];

      const result = await TaskAnalyzer.analyzeTasks(tasks, testConfig);
      const formatted = TaskAnalyzer.formatResult(result);

      expect(formatted).toContain('**優先度**');
      expect(formatted).toContain('**見積もり**');
      expect(formatted).toContain('分');
    });
  });
});
