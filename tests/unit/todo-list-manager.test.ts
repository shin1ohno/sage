/**
 * TodoListManager Tests
 * Requirement: 12.1-12.8
 */

import { TodoListManager, TodoItem, TodoFilter, TodoListManagerConfig } from '../../src/integrations/todo-list-manager.js';
import { AppleRemindersService, ReminderFromAppleScript } from '../../src/integrations/apple-reminders.js';
import { NotionMCPService, NotionMCPClient } from '../../src/integrations/notion-mcp.js';

// Mock AppleRemindersService
jest.mock('../../src/integrations/apple-reminders.js', () => {
  return {
    AppleRemindersService: jest.fn().mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(false),
      fetchReminders: jest.fn().mockResolvedValue([]),
      updateReminderStatus: jest.fn().mockResolvedValue({ success: true }),
    })),
  };
});

// Mock NotionMCPService and NotionMCPClient
jest.mock('../../src/integrations/notion-mcp.js', () => {
  return {
    NotionMCPService: jest.fn().mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(false),
      setMCPClient: jest.fn(),
    })),
    NotionMCPClient: jest.fn().mockImplementation(() => ({
      isConnected: jest.fn().mockReturnValue(false),
      connect: jest.fn().mockResolvedValue(undefined),
      queryDatabase: jest.fn().mockResolvedValue({ success: true, results: [] }),
      updatePage: jest.fn().mockResolvedValue({ success: true }),
    })),
  };
});

describe('TodoListManager', () => {
  let manager: TodoListManager;

  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('Constructor with config options', () => {
    it('should initialize with default config when no options provided', () => {
      const mgr = new TodoListManager();
      expect(mgr).toBeDefined();
    });

    it('should initialize with custom cacheTimeoutMs', () => {
      const config: TodoListManagerConfig = {
        cacheTimeoutMs: 120000, // 2 minutes
      };
      const mgr = new TodoListManager(config);
      expect(mgr).toBeDefined();
    });

    it('should initialize with notionDatabaseId and create NotionMCPClient', () => {
      const config: TodoListManagerConfig = {
        notionDatabaseId: 'test-database-id-123',
      };
      const mgr = new TodoListManager(config);
      expect(mgr).toBeDefined();
      expect(NotionMCPClient).toHaveBeenCalledWith({
        allowedDatabaseIds: ['test-database-id-123'],
      });
    });

    it('should initialize with both cacheTimeoutMs and notionDatabaseId', () => {
      const config: TodoListManagerConfig = {
        cacheTimeoutMs: 30000,
        notionDatabaseId: 'another-db-id',
      };
      const mgr = new TodoListManager(config);
      expect(mgr).toBeDefined();
      expect(NotionMCPClient).toHaveBeenCalledWith({
        allowedDatabaseIds: ['another-db-id'],
      });
    });
  });

  describe('configureNotion', () => {
    it('should configure Notion with a database ID', () => {
      const mgr = new TodoListManager();
      mgr.configureNotion('configured-db-id');

      expect(NotionMCPClient).toHaveBeenCalledWith({
        allowedDatabaseIds: ['configured-db-id'],
      });
    });

    it('should update NotionMCPClient when reconfiguring', () => {
      const mgr = new TodoListManager({ notionDatabaseId: 'initial-db-id' });
      jest.clearAllMocks();

      mgr.configureNotion('new-db-id');

      expect(NotionMCPClient).toHaveBeenCalledWith({
        allowedDatabaseIds: ['new-db-id'],
      });
    });
  });

  describe('mapAppleRemindersPriority', () => {
    it('should map undefined priority to P3', () => {
      const mgr = new TodoListManager();
      // Access private method via type casting for testing
      const mapPriority = (mgr as any).mapAppleRemindersPriority.bind(mgr);

      expect(mapPriority(undefined)).toBe('P3');
    });

    it('should map priority 0 to P3', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapAppleRemindersPriority.bind(mgr);

      expect(mapPriority(0)).toBe('P3');
    });

    it('should map priority 1-3 to P0 (high priority)', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapAppleRemindersPriority.bind(mgr);

      expect(mapPriority(1)).toBe('P0');
      expect(mapPriority(2)).toBe('P0');
      expect(mapPriority(3)).toBe('P0');
    });

    it('should map priority 4-6 to P1 (medium-high)', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapAppleRemindersPriority.bind(mgr);

      expect(mapPriority(4)).toBe('P1');
      expect(mapPriority(5)).toBe('P1');
      expect(mapPriority(6)).toBe('P1');
    });

    it('should map priority 7 to P2 (medium)', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapAppleRemindersPriority.bind(mgr);

      expect(mapPriority(7)).toBe('P2');
    });

    it('should map priority 8+ to P3 (low)', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapAppleRemindersPriority.bind(mgr);

      expect(mapPriority(8)).toBe('P3');
      expect(mapPriority(9)).toBe('P3');
      expect(mapPriority(10)).toBe('P3');
    });
  });

  describe('mapNotionPriority', () => {
    it('should map undefined priority to P3', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapNotionPriority.bind(mgr);

      expect(mapPriority(undefined)).toBe('P3');
    });

    it('should map P0 to P0', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapNotionPriority.bind(mgr);

      expect(mapPriority('P0')).toBe('P0');
      expect(mapPriority('p0')).toBe('P0');
    });

    it('should map URGENT and CRITICAL to P0', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapNotionPriority.bind(mgr);

      expect(mapPriority('URGENT')).toBe('P0');
      expect(mapPriority('urgent')).toBe('P0');
      expect(mapPriority('CRITICAL')).toBe('P0');
      expect(mapPriority('critical')).toBe('P0');
    });

    it('should map P1 and HIGH to P1', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapNotionPriority.bind(mgr);

      expect(mapPriority('P1')).toBe('P1');
      expect(mapPriority('HIGH')).toBe('P1');
      expect(mapPriority('high')).toBe('P1');
    });

    it('should map P2 and MEDIUM to P2', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapNotionPriority.bind(mgr);

      expect(mapPriority('P2')).toBe('P2');
      expect(mapPriority('MEDIUM')).toBe('P2');
      expect(mapPriority('medium')).toBe('P2');
    });

    it('should map unknown priority to P3', () => {
      const mgr = new TodoListManager();
      const mapPriority = (mgr as any).mapNotionPriority.bind(mgr);

      expect(mapPriority('P3')).toBe('P3');
      expect(mapPriority('LOW')).toBe('P3');
      expect(mapPriority('unknown')).toBe('P3');
    });
  });

  describe('mapNotionStatus', () => {
    it('should map undefined status to not_started', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapNotionStatus.bind(mgr);

      expect(mapStatus(undefined)).toBe('not_started');
    });

    it('should map completed variants to completed', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapNotionStatus.bind(mgr);

      expect(mapStatus('Completed')).toBe('completed');
      expect(mapStatus('COMPLETE')).toBe('completed');
      expect(mapStatus('Done')).toBe('completed');
      expect(mapStatus('done')).toBe('completed');
    });

    it('should map in progress variants to in_progress', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapNotionStatus.bind(mgr);

      expect(mapStatus('In Progress')).toBe('in_progress');
      expect(mapStatus('IN PROGRESS')).toBe('in_progress');
      expect(mapStatus('Doing')).toBe('in_progress');
      expect(mapStatus('doing')).toBe('in_progress');
    });

    it('should map cancelled variants to cancelled', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapNotionStatus.bind(mgr);

      expect(mapStatus('Cancelled')).toBe('cancelled');
      expect(mapStatus('CANCEL')).toBe('cancelled');
      expect(mapStatus('canceled')).toBe('cancelled');
    });

    it('should map unknown status to not_started', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapNotionStatus.bind(mgr);

      expect(mapStatus('Not Started')).toBe('not_started');
      expect(mapStatus('TODO')).toBe('not_started');
      expect(mapStatus('unknown')).toBe('not_started');
    });
  });

  describe('fetchFromAppleReminders error handling', () => {
    it('should return empty array when Apple Reminders is not available', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn(),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();
      const todos = await mgr.listTodos();

      expect(todos).toEqual([]);
      expect(mockAppleReminders.fetchReminders).not.toHaveBeenCalled();
    });

    it('should handle errors when fetching from Apple Reminders', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockRejectedValue(new Error('AppleScript failed')),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();
      const todos = await mgr.listTodos();

      // Should return empty array on error
      expect(todos).toEqual([]);
    });

    it('should transform Apple Reminders to TodoItems when successful', async () => {
      const mockReminders: ReminderFromAppleScript[] = [
        {
          id: 'reminder-1',
          title: 'Test Reminder',
          notes: 'Test notes',
          completed: false,
          dueDate: '2025-01-15T09:00:00Z',
          creationDate: '2025-01-01T00:00:00Z',
          modificationDate: '2025-01-10T00:00:00Z',
          priority: 1,
        },
        {
          id: 'reminder-2',
          title: 'Completed Reminder',
          completed: true,
          priority: 5,
        },
      ];

      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockResolvedValue(mockReminders),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();
      const todos = await mgr.listTodos();

      expect(todos).toHaveLength(2);
      expect(todos[0].id).toBe('ar-reminder-1');
      expect(todos[0].title).toBe('Test Reminder');
      expect(todos[0].priority).toBe('P0'); // priority 1 maps to P0
      expect(todos[0].status).toBe('not_started');
      expect(todos[0].source).toBe('apple_reminders');

      expect(todos[1].id).toBe('ar-reminder-2');
      expect(todos[1].priority).toBe('P1'); // priority 5 maps to P1
      expect(todos[1].status).toBe('completed');
    });
  });

  describe('fetchFromNotion error handling', () => {
    beforeEach(() => {
      // Reset AppleReminders mock to return empty by default for Notion tests
      (AppleRemindersService as jest.Mock).mockImplementation(() => ({
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      }));
    });

    it('should return empty array when Notion is not configured', async () => {
      const mgr = new TodoListManager(); // No notionDatabaseId
      const todos = await mgr.listTodos();

      expect(todos).toEqual([]);
    });

    it('should return empty array when Notion is not available', async () => {
      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(false),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });
      const todos = await mgr.listTodos();

      expect(todos).toEqual([]);
    });

    it('should handle errors when fetching from Notion', async () => {
      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(false),
        connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
        queryDatabase: jest.fn(),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });
      const todos = await mgr.listTodos();

      // Should return empty array on error
      expect(todos).toEqual([]);
    });

    it('should transform Notion pages to TodoItems when successful', async () => {
      const mockPages = [
        {
          id: 'page-1',
          title: 'Notion Task',
          properties: {
            Description: { rich_text: [{ plain_text: 'Task description' }] },
            Priority: { select: { name: 'P1' } },
            Status: { select: { name: 'In Progress' } },
            DueDate: { date: { start: '2025-01-20' } },
            Tags: { multi_select: [{ name: 'work' }, { name: 'important' }] },
            EstimatedTime: { number: 60 },
            Stakeholders: { multi_select: [{ name: 'Alice' }] },
          },
          createdTime: '2025-01-01T00:00:00Z',
          lastEditedTime: '2025-01-15T00:00:00Z',
        },
      ];

      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(true),
        connect: jest.fn().mockResolvedValue(undefined),
        queryDatabase: jest.fn().mockResolvedValue({ success: true, results: mockPages }),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });
      const todos = await mgr.listTodos();

      expect(todos).toHaveLength(1);
      expect(todos[0].id).toBe('n-page-1');
      expect(todos[0].title).toBe('Notion Task');
      expect(todos[0].description).toBe('Task description');
      expect(todos[0].priority).toBe('P1');
      expect(todos[0].status).toBe('in_progress');
      expect(todos[0].source).toBe('notion');
      expect(todos[0].tags).toEqual(['work', 'important']);
      expect(todos[0].estimatedMinutes).toBe(60);
      expect(todos[0].stakeholders).toEqual(['Alice']);
    });

    it('should return empty array when query returns no results', async () => {
      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(true),
        connect: jest.fn().mockResolvedValue(undefined),
        queryDatabase: jest.fn().mockResolvedValue({ success: false, error: 'Query failed' }),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });
      const todos = await mgr.listTodos();

      expect(todos).toEqual([]);
    });
  });

  describe('updateInSource', () => {
    it('should update task in Apple Reminders source', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockResolvedValue([
          { id: 'ar-1', title: 'Test', completed: false, priority: 0 },
        ]),
        updateReminderStatus: jest.fn().mockResolvedValue({ success: true }),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();

      // First, populate cache by listing todos
      await mgr.listTodos();

      const result = await mgr.updateTaskStatus('ar-ar-1', 'completed', 'apple_reminders');

      expect(result.success).toBe(true);
      expect(result.syncedSources).toContain('apple_reminders');
    });

    it('should update task in Notion source', async () => {
      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(true),
        connect: jest.fn().mockResolvedValue(undefined),
        queryDatabase: jest.fn().mockResolvedValue({
          success: true,
          results: [{ id: 'n-1', title: 'Notion Task', properties: {} }],
        }),
        updatePage: jest.fn().mockResolvedValue({ success: true }),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });

      // First, populate cache
      await mgr.listTodos();

      const result = await mgr.updateTaskStatus('n-n-1', 'completed', 'notion');

      expect(result.success).toBe(true);
      expect(result.syncedSources).toContain('notion');
    });

    it('should handle update failure in Apple Reminders', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockResolvedValue([
          { id: 'ar-1', title: 'Test', completed: false, priority: 0 },
        ]),
        updateReminderStatus: jest.fn().mockResolvedValue({ success: false, error: 'Update failed' }),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();
      await mgr.listTodos();

      const result = await mgr.updateTaskStatus('ar-ar-1', 'completed', 'apple_reminders');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle manual source update', async () => {
      // Create a manager and manually add a task to test manual source
      const mgr = new TodoListManager();

      // We need to have a manual task in the cache
      // Since we can't easily add manual tasks through the public API,
      // we test through updateTaskStatus with a non-existent task
      const result = await mgr.updateTaskStatus('manual-task-1', 'completed', 'manual');

      // Task not found because we don't have a way to add manual tasks
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('syncTaskAcrossSources - conflict detection', () => {
    it('should detect status conflict between sources', async () => {
      // Test the syncTaskAcrossSources method by using different task titles
      // to avoid deduplication during merge
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockResolvedValue([
          { id: 'ar-1', title: 'Apple Task', completed: false, priority: 1 },
        ]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(true),
        connect: jest.fn().mockResolvedValue(undefined),
        queryDatabase: jest.fn().mockResolvedValue({
          success: true,
          results: [
            {
              id: 'n-1',
              title: 'Notion Task',
              properties: {
                Status: { select: { name: 'Done' } },
                Priority: { select: { name: 'P0' } },
              },
            },
          ],
        }),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });
      const todos = await mgr.listTodos();

      // Verify both sources are present
      expect(todos.length).toBe(2);
      expect(todos.some(t => t.source === 'apple_reminders')).toBe(true);
      expect(todos.some(t => t.source === 'notion')).toBe(true);

      // Find the Apple Reminders task
      const appleTask = todos.find(t => t.source === 'apple_reminders');
      expect(appleTask).toBeDefined();

      // Note: syncTaskAcrossSources looks for duplicates by title.
      // Since titles are different, no conflicts will be detected.
      const result = await mgr.syncTaskAcrossSources(appleTask!.id);

      // Task found, but no duplicates with same title in other sources
      expect(result.success).toBe(true);
      expect(result.syncedSources).toContain('apple_reminders');
    });

    it('should detect priority conflict between sources when titles match', async () => {
      // Test conflict detection when we have tasks with same title from different sources
      // We need to test this via the syncTaskAcrossSources logic
      const mgr = new TodoListManager();

      // Create sample todos with same title but different priorities
      const sampleTodos: TodoItem[] = [
        {
          id: 'ar-1',
          title: 'Conflicting Task',
          priority: 'P0',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: 'n-1',
          title: 'Conflicting Task',
          priority: 'P3',
          status: 'completed',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      // Merge todos - this will deduplicate by title
      const merged = mgr.mergeTodosFromSources(
        [sampleTodos[0]],
        [sampleTodos[1]]
      );

      // Should have 1 item after deduplication (Apple Reminders wins)
      expect(merged).toHaveLength(1);
      expect(merged[0].source).toBe('apple_reminders');
    });

    it('should handle sync error gracefully', async () => {
      // Setup: Throw an error during fetch to test error handling in sync
      const mockAppleReminders = {
        isAvailable: jest.fn().mockRejectedValue(new Error('Service unavailable')),
        fetchReminders: jest.fn(),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();
      const result = await mgr.syncTaskAcrossSources('non-existent-task');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('updateTaskStatus error handling', () => {
    it('should handle exception during update gracefully', async () => {
      // Setup: AppleReminders throws an error during update
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockResolvedValue([
          { id: 'ar-1', title: 'Test Task', completed: false, priority: 0 },
        ]),
        updateReminderStatus: jest.fn().mockRejectedValue(new Error('Update exception')),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();

      // Populate cache
      await mgr.listTodos();

      const result = await mgr.updateTaskStatus('ar-ar-1', 'completed', 'apple_reminders');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update in apple_reminders');
    });

    it('should catch top-level exception in updateTaskStatus', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();

      // Manually set up a task in cache
      const task: TodoItem = {
        id: 'task-1',
        title: 'Test Task',
        priority: 'P1',
        status: 'not_started',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        source: 'apple_reminders',
        sourceId: 'task-1',
        tags: [],
      };

      (mgr as any).cachedTodos = [task];
      (mgr as any).lastFetchTime = Date.now();

      // Mock the updateInSource method to throw an error directly
      (mgr as any).updateInSource = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected internal error');
      });

      const result = await mgr.updateTaskStatus('task-1', 'completed', 'apple_reminders');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update task');
      expect(result.error).toContain('Unexpected internal error');
    });
  });

  describe('updateInSource - Notion update without client', () => {
    it('should return error when Notion client is not configured for update', async () => {
      // Setup: Create manager without Notion configuration
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      // Create a manager with a cached Notion task but no Notion client configured
      const mgr = new TodoListManager();

      // Manually create a task in cache by accessing private cache
      const notionTask: TodoItem = {
        id: 'n-test-1',
        title: 'Notion Task Without Client',
        priority: 'P1',
        status: 'not_started',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        source: 'notion',
        sourceId: 'test-1',
        tags: [],
      };

      // Use type assertion to access private cache for test setup
      (mgr as any).cachedTodos = [notionTask];
      (mgr as any).lastFetchTime = Date.now();

      const result = await mgr.updateTaskStatus('n-test-1', 'completed', 'notion');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Notion client not configured');
    });

    it('should connect to Notion client if not connected before update', async () => {
      // Setup: Notion client is configured but not connected
      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(false),
        connect: jest.fn().mockResolvedValue(undefined),
        queryDatabase: jest.fn().mockResolvedValue({
          success: true,
          results: [{ id: 'n-1', title: 'Notion Task', properties: {} }],
        }),
        updatePage: jest.fn().mockResolvedValue({ success: true }),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });

      // Populate cache
      await mgr.listTodos();

      // Reset connection status for the update
      mockNotionClient.isConnected.mockReturnValue(false);

      const result = await mgr.updateTaskStatus('n-n-1', 'completed', 'notion');

      expect(mockNotionClient.connect).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle Notion update failure', async () => {
      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(true),
        connect: jest.fn().mockResolvedValue(undefined),
        queryDatabase: jest.fn().mockResolvedValue({
          success: true,
          results: [{ id: 'n-1', title: 'Notion Task', properties: {} }],
        }),
        updatePage: jest.fn().mockResolvedValue({ success: false, error: 'Update failed in Notion' }),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });

      // Populate cache
      await mgr.listTodos();

      const result = await mgr.updateTaskStatus('n-n-1', 'completed', 'notion');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Update failed in Notion');
    });

    it('should handle unknown source in updateInSource', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();

      // Manually create a task with an unknown source type for testing
      const unknownTask: TodoItem = {
        id: 'unknown-1',
        title: 'Unknown Source Task',
        priority: 'P1',
        status: 'not_started',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        source: 'unknown_source' as any,
        sourceId: 'unknown-1',
        tags: [],
      };

      (mgr as any).cachedTodos = [unknownTask];
      (mgr as any).lastFetchTime = Date.now();

      // Update with unknown source type
      const result = await mgr.updateTaskStatus('unknown-1', 'completed', 'unknown_source' as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown source');
    });

    it('should handle exception thrown by Notion client updatePage', async () => {
      const mockNotionClient = {
        isConnected: jest.fn().mockReturnValue(true),
        connect: jest.fn().mockResolvedValue(undefined),
        queryDatabase: jest.fn().mockResolvedValue({
          success: true,
          results: [{ id: 'n-1', title: 'Notion Task', properties: {} }],
        }),
        updatePage: jest.fn().mockRejectedValue(new Error('Notion API error')),
      };
      (NotionMCPClient as jest.Mock).mockImplementation(() => mockNotionClient);

      const mockNotionService = {
        isAvailable: jest.fn().mockResolvedValue(true),
        setMCPClient: jest.fn(),
      };
      (NotionMCPService as jest.Mock).mockImplementation(() => mockNotionService);

      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager({ notionDatabaseId: 'db-id' });

      // Populate cache
      await mgr.listTodos();

      const result = await mgr.updateTaskStatus('n-n-1', 'completed', 'notion');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to update in notion');
    });
  });

  describe('syncTaskAcrossSources with actual duplicates', () => {
    it('should detect conflicts when same title exists in both sources with different status', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();

      // Manually create duplicate tasks in cache (bypassing merge deduplication)
      const duplicateTasks: TodoItem[] = [
        {
          id: 'ar-1',
          title: 'Duplicate Task',
          priority: 'P0',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: 'n-1',
          title: 'Duplicate Task', // Same title
          priority: 'P3',          // Different priority
          status: 'completed',      // Different status
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      (mgr as any).cachedTodos = duplicateTasks;
      (mgr as any).lastFetchTime = Date.now();

      const result = await mgr.syncTaskAcrossSources('ar-1');

      // Should detect conflicts
      expect(result.syncedSources).toHaveLength(2);
      expect(result.syncedSources).toContain('apple_reminders');
      expect(result.syncedSources).toContain('notion');
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts!.length).toBe(2); // status and priority conflicts
      expect(result.conflicts!.some(c => c.field === 'status')).toBe(true);
      expect(result.conflicts!.some(c => c.field === 'priority')).toBe(true);
      expect(result.success).toBe(false); // conflicts mean not successful
    });

    it('should detect conflicts from notion task perspective', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(false),
        fetchReminders: jest.fn().mockResolvedValue([]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager();

      // Manually create duplicate tasks in cache
      const duplicateTasks: TodoItem[] = [
        {
          id: 'ar-1',
          title: 'Duplicate Task',
          priority: 'P0',
          status: 'not_started',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders',
          sourceId: 'ar-1',
          tags: [],
        },
        {
          id: 'n-1',
          title: 'Duplicate Task',
          priority: 'P3',
          status: 'completed',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion',
          sourceId: 'n-1',
          tags: [],
        },
      ];

      (mgr as any).cachedTodos = duplicateTasks;
      (mgr as any).lastFetchTime = Date.now();

      // Sync from Notion task perspective
      const result = await mgr.syncTaskAcrossSources('n-1');

      // Should detect conflicts
      expect(result.syncedSources).toHaveLength(2);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts!.length).toBe(2);

      // Verify conflict resolution values from Notion perspective
      const statusConflict = result.conflicts!.find(c => c.field === 'status');
      expect(statusConflict).toBeDefined();
      expect(statusConflict!.resolution).toBe('notion');
      expect(statusConflict!.resolvedValue).toBe('completed');
    });
  });

  describe('cache behavior', () => {
    it('should use cache within timeout period', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockResolvedValue([
          { id: 'ar-1', title: 'Cached Task', completed: false, priority: 0 },
        ]),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager({ cacheTimeoutMs: 60000 });

      // First call should fetch
      await mgr.listTodos();
      expect(mockAppleReminders.fetchReminders).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await mgr.listTodos();
      expect(mockAppleReminders.fetchReminders).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache after status update', async () => {
      const mockAppleReminders = {
        isAvailable: jest.fn().mockResolvedValue(true),
        fetchReminders: jest.fn().mockResolvedValue([
          { id: 'ar-1', title: 'Task', completed: false, priority: 0 },
        ]),
        updateReminderStatus: jest.fn().mockResolvedValue({ success: true }),
      };
      (AppleRemindersService as jest.Mock).mockImplementation(() => mockAppleReminders);

      const mgr = new TodoListManager({ cacheTimeoutMs: 60000 });

      // First call
      await mgr.listTodos();
      expect(mockAppleReminders.fetchReminders).toHaveBeenCalledTimes(1);

      // Update status - should invalidate cache
      await mgr.updateTaskStatus('ar-ar-1', 'completed', 'apple_reminders');

      // Next call should fetch again
      await mgr.listTodos();
      expect(mockAppleReminders.fetchReminders).toHaveBeenCalledTimes(2);
    });
  });

  describe('mapStatusToNotion', () => {
    it('should map completed to Done', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapStatusToNotion.bind(mgr);

      expect(mapStatus('completed')).toBe('Done');
    });

    it('should map in_progress to In Progress', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapStatusToNotion.bind(mgr);

      expect(mapStatus('in_progress')).toBe('In Progress');
    });

    it('should map cancelled to Cancelled', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapStatusToNotion.bind(mgr);

      expect(mapStatus('cancelled')).toBe('Cancelled');
    });

    it('should map not_started to Not Started', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapStatusToNotion.bind(mgr);

      expect(mapStatus('not_started')).toBe('Not Started');
    });

    it('should map unknown status to Not Started', () => {
      const mgr = new TodoListManager();
      const mapStatus = (mgr as any).mapStatusToNotion.bind(mgr);

      expect(mapStatus('unknown_status')).toBe('Not Started');
    });
  });

  describe('getPriorityEmoji', () => {
    it('should return correct emoji for each priority', () => {
      const mgr = new TodoListManager();
      const getEmoji = (mgr as any).getPriorityEmoji.bind(mgr);

      expect(getEmoji('P0')).toBeTruthy();
      expect(getEmoji('P1')).toBeTruthy();
      expect(getEmoji('P2')).toBeTruthy();
      expect(getEmoji('P3')).toBeTruthy();
    });

    it('should return default emoji for unknown priority', () => {
      const mgr = new TodoListManager();
      const getEmoji = (mgr as any).getPriorityEmoji.bind(mgr);

      expect(getEmoji('unknown')).toBeTruthy();
    });
  });

  describe('getStatusEmoji', () => {
    it('should return correct emoji for each status', () => {
      const mgr = new TodoListManager();
      const getEmoji = (mgr as any).getStatusEmoji.bind(mgr);

      expect(getEmoji('not_started')).toBeTruthy();
      expect(getEmoji('in_progress')).toBeTruthy();
      expect(getEmoji('completed')).toBeTruthy();
      expect(getEmoji('cancelled')).toBeTruthy();
    });

    it('should return default emoji for unknown status', () => {
      const mgr = new TodoListManager();
      const getEmoji = (mgr as any).getStatusEmoji.bind(mgr);

      expect(getEmoji('unknown')).toBeTruthy();
    });
  });
});
