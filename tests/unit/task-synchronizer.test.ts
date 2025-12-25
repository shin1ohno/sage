/**
 * TaskSynchronizer Tests
 * Requirement: 12.6, 14.1-14.3
 */

import {
  TaskSynchronizer,
  DuplicateTask,
} from '../../src/integrations/task-synchronizer.js';
import { TodoItem } from '../../src/integrations/todo-list-manager.js';

describe('TaskSynchronizer', () => {
  let synchronizer: TaskSynchronizer;

  beforeEach(() => {
    synchronizer = new TaskSynchronizer();
  });

  describe('syncAllTasks', () => {
    it('should return sync result with counts', async () => {
      const result = await synchronizer.syncAllTasks();

      expect(result).toHaveProperty('totalTasks');
      expect(result).toHaveProperty('syncedTasks');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration');
    });

    it('should report duration in milliseconds', async () => {
      const result = await synchronizer.syncAllTasks();

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectDuplicates', () => {
    it('should detect duplicate tasks by title', async () => {
      const tasks: TodoItem[] = [
        {
          id: '1',
          title: 'Buy groceries',
          priority: 'P2',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: '2',
          title: 'Buy groceries',
          priority: 'P2',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const duplicates = synchronizer.detectDuplicatesInList(tasks);

      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0].tasks).toHaveLength(2);
    });

    it('should not report unique tasks as duplicates', async () => {
      const tasks: TodoItem[] = [
        {
          id: '1',
          title: 'Task A',
          priority: 'P1',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: '2',
          title: 'Task B',
          priority: 'P2',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const duplicates = synchronizer.detectDuplicatesInList(tasks);

      expect(duplicates).toHaveLength(0);
    });

    it('should detect similar titles with fuzzy matching', async () => {
      const tasks: TodoItem[] = [
        {
          id: '1',
          title: 'Buy groceries for dinner',
          priority: 'P2',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: '2',
          title: 'Buy groceries for dinner!',
          priority: 'P2',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const duplicates = synchronizer.detectDuplicatesInList(tasks);

      expect(duplicates.length).toBeGreaterThan(0);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      const similarity = synchronizer.calculateSimilarity('Hello World', 'Hello World');
      expect(similarity).toBe(1.0);
    });

    it('should return high similarity for nearly identical strings', () => {
      const similarity = synchronizer.calculateSimilarity('Hello World', 'Hello World!');
      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should return low similarity for different strings', () => {
      const similarity = synchronizer.calculateSimilarity('Hello', 'Goodbye');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should be case insensitive', () => {
      const similarity = synchronizer.calculateSimilarity('HELLO WORLD', 'hello world');
      expect(similarity).toBe(1.0);
    });
  });

  describe('mergeDuplicates', () => {
    it('should merge duplicate tasks into one', async () => {
      const duplicate: DuplicateTask = {
        tasks: [
          {
            id: '1',
            title: 'Task',
            priority: 'P1',
            status: 'not_started',
            createdDate: '2025-01-01T00:00:00Z',
            updatedDate: '2025-01-10T00:00:00Z',
            source: 'apple_reminders',
            sourceId: 'ar-1',
            tags: ['urgent'],
          },
          {
            id: '2',
            title: 'Task',
            priority: 'P2',
            status: 'in_progress',
            createdDate: '2025-01-05T00:00:00Z',
            updatedDate: '2025-01-15T00:00:00Z',
            source: 'notion',
            sourceId: 'n-1',
            tags: ['work'],
          },
        ],
        similarity: 1.0,
        suggestedMerge: {
          id: 'merged-1',
          title: 'Task',
          priority: 'P1',
          status: 'in_progress',
          createdDate: '2025-01-01T00:00:00Z',
          updatedDate: '2025-01-15T00:00:00Z',
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: ['urgent', 'work'],
        },
        confidence: 'high',
      };

      const result = await synchronizer.mergeDuplicates([duplicate]);

      expect(result.success).toBe(true);
      expect(result.mergedTask).toBeDefined();
      expect(result.removedTasks).toHaveLength(1);
    });
  });

  describe('resolveConflicts', () => {
    it('should resolve conflicts using most recent update', async () => {
      const conflicts = [
        {
          field: 'status',
          appleRemindersValue: 'not_started',
          notionValue: 'in_progress',
          resolvedValue: undefined,
          resolution: 'apple_reminders' as const,
        },
      ];

      const resolved = await synchronizer.resolveConflicts(conflicts);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedValue).toBeDefined();
    });

    it('should handle priority conflicts', async () => {
      const conflicts = [
        {
          field: 'priority',
          appleRemindersValue: 'P0',
          notionValue: 'P2',
          resolvedValue: undefined,
          resolution: 'apple_reminders' as const,
        },
      ];

      const resolved = await synchronizer.resolveConflicts(conflicts);

      expect(resolved).toHaveLength(1);
    });
  });

  describe('createSuggestedMerge', () => {
    it('should create merge using highest priority', () => {
      const tasks: TodoItem[] = [
        {
          id: '1',
          title: 'Task',
          priority: 'P0',
          status: 'not_started',
          createdDate: '2025-01-01T00:00:00Z',
          updatedDate: '2025-01-01T00:00:00Z',
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: '2',
          title: 'Task',
          priority: 'P3',
          status: 'not_started',
          createdDate: '2025-01-01T00:00:00Z',
          updatedDate: '2025-01-01T00:00:00Z',
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const merged = synchronizer.createSuggestedMerge(tasks);

      expect(merged.priority).toBe('P0');
    });

    it('should combine tags from all tasks', () => {
      const tasks: TodoItem[] = [
        {
          id: '1',
          title: 'Task',
          priority: 'P2',
          status: 'not_started',
          createdDate: '2025-01-01T00:00:00Z',
          updatedDate: '2025-01-01T00:00:00Z',
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: ['urgent'],
        },
        {
          id: '2',
          title: 'Task',
          priority: 'P2',
          status: 'not_started',
          createdDate: '2025-01-01T00:00:00Z',
          updatedDate: '2025-01-01T00:00:00Z',
          source: 'notion',
          sourceId: 'n-1',
          tags: ['work'],
        },
      ];

      const merged = synchronizer.createSuggestedMerge(tasks);

      expect(merged.tags).toContain('urgent');
      expect(merged.tags).toContain('work');
    });

    it('should use latest status', () => {
      const tasks: TodoItem[] = [
        {
          id: '1',
          title: 'Task',
          priority: 'P2',
          status: 'not_started',
          createdDate: '2025-01-01T00:00:00Z',
          updatedDate: '2025-01-01T00:00:00Z',
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: '2',
          title: 'Task',
          priority: 'P2',
          status: 'in_progress',
          createdDate: '2025-01-01T00:00:00Z',
          updatedDate: '2025-01-10T00:00:00Z',
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const merged = synchronizer.createSuggestedMerge(tasks);

      expect(merged.status).toBe('in_progress');
    });
  });
});
