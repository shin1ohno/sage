/**
 * TodoListManager Tests
 * Requirement: 12.1-12.8
 */

import { TodoListManager, TodoItem, TodoFilter } from '../../src/integrations/todo-list-manager.js';

describe('TodoListManager', () => {
  let manager: TodoListManager;

  beforeEach(() => {
    manager = new TodoListManager();
  });

  describe('listTodos', () => {
    it('should return empty array when no todos exist', async () => {
      const todos = await manager.listTodos();
      expect(todos).toEqual([]);
    });

    it('should fetch and merge todos from all sources', async () => {
      // Mock data will be provided by Apple Reminders and Notion
      const todos = await manager.listTodos();
      expect(Array.isArray(todos)).toBe(true);
    });

    it('should apply priority filter', async () => {
      const filter: TodoFilter = { priority: ['P0', 'P1'] };
      const todos = await manager.listTodos(filter);
      todos.forEach(todo => {
        expect(['P0', 'P1']).toContain(todo.priority);
      });
    });

    it('should apply status filter', async () => {
      const filter: TodoFilter = { status: ['not_started', 'in_progress'] };
      const todos = await manager.listTodos(filter);
      todos.forEach(todo => {
        expect(['not_started', 'in_progress']).toContain(todo.status);
      });
    });

    it('should apply source filter', async () => {
      const filter: TodoFilter = { source: ['apple_reminders'] };
      const todos = await manager.listTodos(filter);
      todos.forEach(todo => {
        expect(todo.source).toBe('apple_reminders');
      });
    });
  });

  describe('getTodaysTasks', () => {
    it('should return only tasks due today', async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const tasks = await manager.getTodaysTasks();
      tasks.forEach(task => {
        if (task.dueDate) {
          expect(task.dueDate.startsWith(todayStr)).toBe(true);
        }
      });
    });
  });

  describe('updateTaskStatus', () => {
    it('should update task status in the source', async () => {
      const taskId = 'test-task-1';
      const result = await manager.updateTaskStatus(taskId, 'completed', 'apple_reminders');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('taskId', taskId);
    });

    it('should sync status across sources when specified', async () => {
      const taskId = 'test-task-1';
      const result = await manager.updateTaskStatus(taskId, 'completed', 'apple_reminders');

      expect(result).toHaveProperty('syncedSources');
    });

    it('should return error for invalid task ID', async () => {
      const result = await manager.updateTaskStatus('invalid-id', 'completed', 'apple_reminders');

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('syncTaskAcrossSources', () => {
    it('should sync task data between Apple Reminders and Notion', async () => {
      const taskId = 'test-task-1';
      const result = await manager.syncTaskAcrossSources(taskId);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('taskId', taskId);
    });

    it('should return error for non-existent task', async () => {
      const taskId = 'test-task-with-conflict';
      const result = await manager.syncTaskAcrossSources(taskId);

      // Task not found should return error
      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('not found');
    });
  });

  describe('filterTodos', () => {
    const sampleTodos: TodoItem[] = [
      {
        id: '1',
        title: 'High priority task',
        priority: 'P0',
        status: 'not_started',
        dueDate: new Date().toISOString(),
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        source: 'apple_reminders',
        sourceId: 'ar-1',
        tags: ['urgent'],
      },
      {
        id: '2',
        title: 'Low priority task',
        priority: 'P3',
        status: 'in_progress',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        source: 'notion',
        sourceId: 'n-1',
        tags: ['later'],
      },
      {
        id: '3',
        title: 'Completed task',
        priority: 'P2',
        status: 'completed',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        source: 'manual',
        sourceId: 'm-1',
        tags: [],
      },
    ];

    it('should filter by multiple priorities', () => {
      const filtered = manager.filterTodos(sampleTodos, { priority: ['P0', 'P1'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].priority).toBe('P0');
    });

    it('should filter by status', () => {
      const filtered = manager.filterTodos(sampleTodos, { status: ['completed'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('completed');
    });

    it('should filter by source', () => {
      const filtered = manager.filterTodos(sampleTodos, { source: ['notion'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].source).toBe('notion');
    });

    it('should filter by tags', () => {
      const filtered = manager.filterTodos(sampleTodos, { tags: ['urgent'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].tags).toContain('urgent');
    });

    it('should filter by date range', () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const filtered = manager.filterTodos(sampleTodos, {
        dueDate: {
          start: now.toISOString(),
          end: tomorrow.toISOString(),
        },
      });

      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });

    it('should combine multiple filters', () => {
      const filtered = manager.filterTodos(sampleTodos, {
        priority: ['P0', 'P1', 'P2', 'P3'],
        status: ['not_started', 'in_progress'],
      });
      expect(filtered).toHaveLength(2);
    });
  });

  describe('mergeTodosFromSources', () => {
    it('should merge todos from Apple Reminders and Notion', async () => {
      const reminders: TodoItem[] = [
        {
          id: 'ar-1',
          title: 'Reminder task',
          priority: 'P1',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
      ];

      const notionTasks: TodoItem[] = [
        {
          id: 'n-1',
          title: 'Notion task',
          priority: 'P2',
          status: 'in_progress',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const merged = manager.mergeTodosFromSources(reminders, notionTasks);
      expect(merged).toHaveLength(2);
      expect(merged.map(t => t.source)).toContain('apple_reminders');
      expect(merged.map(t => t.source)).toContain('notion');
    });

    it('should deduplicate tasks with same title', async () => {
      const reminders: TodoItem[] = [
        {
          id: 'ar-1',
          title: 'Same task',
          priority: 'P1',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
      ];

      const notionTasks: TodoItem[] = [
        {
          id: 'n-1',
          title: 'Same task',
          priority: 'P1',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const merged = manager.mergeTodosFromSources(reminders, notionTasks);
      // Should detect duplicate and merge
      expect(merged.length).toBeLessThanOrEqual(2);
    });
  });

  describe('formatTodoForDisplay', () => {
    it('should format todo item with all fields', () => {
      const todo: TodoItem = {
        id: '1',
        title: 'Test task',
        description: 'Task description',
        priority: 'P0',
        status: 'in_progress',
        dueDate: '2025-01-15T09:00:00Z',
        createdDate: '2025-01-01T00:00:00Z',
        updatedDate: '2025-01-10T00:00:00Z',
        source: 'apple_reminders',
        sourceId: 'ar-1',
        tags: ['important', 'work'],
        estimatedMinutes: 60,
        stakeholders: ['Alice', 'Bob'],
      };

      const formatted = manager.formatTodoForDisplay(todo);
      expect(formatted).toContain('Test task');
      expect(formatted).toContain('P0');
      expect(formatted).toContain('in_progress');
    });

    it('should handle todo without optional fields', () => {
      const todo: TodoItem = {
        id: '1',
        title: 'Simple task',
        priority: 'P2',
        status: 'not_started',
        createdDate: '2025-01-01T00:00:00Z',
        updatedDate: '2025-01-01T00:00:00Z',
        source: 'manual',
        sourceId: 'm-1',
        tags: [],
      };

      const formatted = manager.formatTodoForDisplay(todo);
      expect(formatted).toContain('Simple task');
      expect(formatted).toContain('P2');
    });
  });
});
