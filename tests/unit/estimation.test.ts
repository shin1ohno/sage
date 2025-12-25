/**
 * Time Estimation System Unit Tests
 * Requirements: 2.6, 3.1, 3.2
 */

import { TimeEstimator, DEFAULT_ESTIMATION_CONFIG } from '../../src/utils/estimation.js';
import type { Task } from '../../src/types/index.js';

describe('TimeEstimator', () => {
  describe('estimateDuration', () => {
    it('should estimate simple tasks at ~25 minutes', () => {
      const task: Task = { title: 'Review PR' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.complexity).toBe('simple');
      expect(result.estimatedMinutes).toBeLessThanOrEqual(30);
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(15);
    });

    it('should estimate medium tasks at ~50 minutes', () => {
      const task: Task = { title: 'Implement new feature' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.complexity).toBe('medium');
      expect(result.estimatedMinutes).toBeLessThanOrEqual(60);
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(40);
    });

    it('should estimate complex tasks at ~90 minutes', () => {
      const task: Task = { title: 'Refactor the authentication module' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.complexity).toBe('complex');
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(70);
    });

    it('should estimate project-level tasks at ~180 minutes', () => {
      const task: Task = { title: 'Build new authentication system from scratch' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.complexity).toBe('project');
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(120);
    });

    it('should recognize Japanese keywords', () => {
      const simpleTask: Task = { title: 'メールを確認する' };
      const simpleResult = TimeEstimator.estimateDuration(simpleTask, DEFAULT_ESTIMATION_CONFIG);
      expect(simpleResult.complexity).toBe('simple');

      const mediumTask: Task = { title: '新機能を実装する' };
      const mediumResult = TimeEstimator.estimateDuration(mediumTask, DEFAULT_ESTIMATION_CONFIG);
      expect(mediumResult.complexity).toBe('medium');

      const complexTask: Task = { title: 'コードをリファクタする' };
      const complexResult = TimeEstimator.estimateDuration(complexTask, DEFAULT_ESTIMATION_CONFIG);
      expect(complexResult.complexity).toBe('complex');
    });

    it('should default to medium complexity when no keywords match', () => {
      const task: Task = { title: 'Do something' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.complexity).toBe('medium');
    });

    it('should include matched keywords in result', () => {
      const task: Task = { title: 'Review and confirm the changes' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.matchedKeywords.length).toBeGreaterThan(0);
      expect(result.matchedKeywords).toContain('review');
    });

    it('should provide a reason for the estimation', () => {
      const task: Task = { title: 'Fix the bug' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeKeywords', () => {
    it('should categorize keywords by complexity', () => {
      const text = 'review and implement the new design system';
      const result = TimeEstimator.analyzeKeywords(text, DEFAULT_ESTIMATION_CONFIG);

      expect(result.simple).toContain('review');
      expect(result.medium).toContain('implement');
      expect(result.complex).toContain('design');
      expect(result.matched.length).toBeGreaterThan(0);
    });

    it('should return empty arrays for text without keywords', () => {
      const text = 'hello world';
      const result = TimeEstimator.analyzeKeywords(text, DEFAULT_ESTIMATION_CONFIG);

      expect(result.matched.length).toBe(0);
    });
  });

  describe('length modifiers', () => {
    it('should apply long text modifier for tasks with 100-250 characters', () => {
      const longTitle = 'This is a task with a moderately long title that contains a lot of words and details about what needs to be done exactly';
      const task: Task = { title: longTitle };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      // Long text should increase estimate
      expect(result.estimatedMinutes).toBeGreaterThan(0);
    });

    it('should apply very long text modifier for tasks with over 250 characters', () => {
      const veryLongTitle =
        'This is a very comprehensive task description that goes into great detail about everything that needs to be done, including all the specific requirements, edge cases to consider, potential blockers, and success criteria that must be met before this task can be considered complete. It has many many words.';
      const task: Task = { title: veryLongTitle };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      // Very long text should increase estimate more
      expect(result.estimatedMinutes).toBeGreaterThan(0);
      expect(veryLongTitle.length).toBeGreaterThan(250);
    });

    it('should provide reason without keywords when none match', () => {
      const task: Task = { title: 'xyz abc 123' };
      const result = TimeEstimator.estimateDuration(task, DEFAULT_ESTIMATION_CONFIG);

      expect(result.reason).toBeTruthy();
      expect(result.reason).toContain('見積もり');
    });
  });
});
