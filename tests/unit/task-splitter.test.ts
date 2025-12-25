/**
 * Task Splitter Unit Tests
 * Requirements: 11.1-11.6
 */

import { TaskSplitter } from '../../src/utils/task-splitter.js';
import type { Task } from '../../src/types/index.js';

describe('TaskSplitter', () => {
  describe('splitTasks', () => {
    it('should split bullet point list into separate tasks', () => {
      const input = `
- Review PR #123
- Fix bug in login
- Update documentation
      `.trim();

      const result = TaskSplitter.splitTasks(input);

      expect(result.splitTasks).toHaveLength(3);
      expect(result.splitTasks[0].title).toContain('Review PR');
      expect(result.splitTasks[1].title).toContain('Fix bug');
      expect(result.splitTasks[2].title).toContain('Update documentation');
    });

    it('should split numbered list into separate tasks', () => {
      const input = `
1. First task
2. Second task
3. Third task
      `.trim();

      const result = TaskSplitter.splitTasks(input);

      expect(result.splitTasks).toHaveLength(3);
    });

    it('should split Japanese conjunction-separated tasks', () => {
      const input = 'メールを確認するそしてレポートを書くまた会議の準備をする';

      const result = TaskSplitter.splitTasks(input);

      expect(result.splitTasks.length).toBeGreaterThan(1);
    });

    it('should not split a simple single task', () => {
      const input = 'Review the pull request';

      const result = TaskSplitter.splitTasks(input);

      expect(result.splitTasks).toHaveLength(1);
      expect(result.splitReason).toContain('シンプル');
    });

    it('should provide recommended order', () => {
      const input = `
- Task A
- Task B
- Task C
      `.trim();

      const result = TaskSplitter.splitTasks(input);

      expect(result.recommendedOrder).toHaveLength(3);
      expect(result.recommendedOrder).toEqual([0, 1, 2]);
    });

    it('should detect dependencies between tasks', () => {
      const input = `
- Task A
- Task B (depends on Task A)
      `.trim();

      const result = TaskSplitter.splitTasks(input);

      expect(result.dependencies.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeComplexity', () => {
    it('should identify simple tasks', () => {
      const task: Task = { title: 'Check email' };
      const result = TaskSplitter.analyzeComplexity(task);

      expect(result.isComplex).toBe(false);
      expect(result.complexity).toBe('simple');
    });

    it('should identify medium complexity tasks', () => {
      const task: Task = { title: 'Fix the login bug' };
      const result = TaskSplitter.analyzeComplexity(task);

      expect(result.complexity).toBe('medium');
    });

    it('should identify complex tasks and suggest splits', () => {
      const task: Task = { title: 'Refactor the entire authentication module' };
      const result = TaskSplitter.analyzeComplexity(task);

      expect(result.isComplex).toBe(true);
      expect(result.complexity).toBe('complex');
      expect(result.suggestedSplits).toBeDefined();
      expect(result.suggestedSplits!.length).toBeGreaterThan(1);
    });

    it('should identify project-level tasks', () => {
      const task: Task = { title: 'Build a new microservice architecture' };
      const result = TaskSplitter.analyzeComplexity(task);

      expect(result.isComplex).toBe(true);
      expect(result.complexity).toBe('project');
      expect(result.suggestedSplits).toBeDefined();
    });

    it('should provide reasoning for complexity analysis', () => {
      const task: Task = { title: 'Design new API' };
      const result = TaskSplitter.analyzeComplexity(task);

      expect(result.reasoning).toBeTruthy();
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should recognize Japanese complexity keywords', () => {
      const projectTask: Task = { title: '新しいシステムを構築する' };
      const projectResult = TaskSplitter.analyzeComplexity(projectTask);
      expect(projectResult.complexity).toBe('project');

      const complexTask: Task = { title: 'コードをリファクタリングする' };
      const complexResult = TaskSplitter.analyzeComplexity(complexTask);
      expect(complexResult.complexity).toBe('complex');
    });
  });
});
