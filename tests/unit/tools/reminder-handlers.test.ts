/**
 * Reminder Handlers Unit Tests
 *
 * Tests for reminder and todo-related tool handlers using dependency injection
 * via Context objects.
 */

import {
  handleSetReminder,
  handleListTodos,
} from '../../../src/tools/reminders/handlers.js';
import {
  createMockReminderTodoContext,
  createMockReminderManager,
  createMockTodoListManager,
  DEFAULT_TEST_CONFIG,
  SAMPLE_TODO_ITEM,
} from '../../helpers/index.js';

describe('Reminder Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSetReminder', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockReminderTodoContext({
        config: null,
      });

      const result = await handleSetReminder(ctx, {
        taskTitle: 'Test Task',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定されていません');
    });

    it('should create Apple Reminders reminder successfully', async () => {
      const mockReminderManager = createMockReminderManager({
        setReminder: jest.fn().mockResolvedValue({
          success: true,
          destination: 'apple_reminders',
          method: 'applescript',
          reminderId: 'reminder-123',
          reminderUrl: 'x-apple-reminderkit://reminder/123',
        }),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        reminderManager: mockReminderManager as unknown as any,
      });

      const result = await handleSetReminder(ctx, {
        taskTitle: 'Test Task',
        dueDate: '2025-01-10',
        priority: 'P1',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.destination).toBe('apple_reminders');
      expect(response.reminderId).toBe('reminder-123');
      expect(response.message).toContain('Apple Reminders');
    });

    it('should delegate to Notion when appropriate', async () => {
      const mockReminderManager = createMockReminderManager({
        setReminder: jest.fn().mockResolvedValue({
          success: true,
          destination: 'notion_mcp',
          method: 'delegate',
          delegateToNotion: true,
          notionRequest: {
            databaseId: 'test-database-id',
            title: 'Test Task',
            properties: {
              'Project Name': 'Test Task',
              Priority: 'P2',
            },
          },
        }),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        reminderManager: mockReminderManager as unknown as any,
      });

      const result = await handleSetReminder(ctx, {
        taskTitle: 'Test Task',
        priority: 'P2',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.delegateToNotion).toBe(true);
      expect(response.notionRequest).toBeDefined();
      expect(response.notionRequest.databaseId).toBe('test-database-id');
    });

    it('should call initializeServices when reminderManager is null', async () => {
      const mockReminderManager = createMockReminderManager({
        setReminder: jest.fn().mockResolvedValue({
          success: true,
          destination: 'apple_reminders',
          method: 'applescript',
          reminderId: 'reminder-123',
        }),
      });

      const initializeServicesMock = jest.fn();
      const getReminderManagerMock = jest.fn()
        .mockReturnValueOnce(null)
        .mockReturnValue(mockReminderManager);

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        getReminderManager: getReminderManagerMock,
        initializeServices: initializeServicesMock,
      });

      await handleSetReminder(ctx, { taskTitle: 'Test Task' });

      expect(initializeServicesMock).toHaveBeenCalledWith(DEFAULT_TEST_CONFIG);
    });

    it('should use config default list when list not provided', async () => {
      const mockReminderManager = createMockReminderManager();

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        reminderManager: mockReminderManager as unknown as any,
      });

      await handleSetReminder(ctx, {
        taskTitle: 'Test Task',
      });

      expect(mockReminderManager.setReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          list: DEFAULT_TEST_CONFIG.integrations.appleReminders.defaultList,
        })
      );
    });

    it('should return fallback text when reminder creation fails', async () => {
      const mockReminderManager = createMockReminderManager({
        setReminder: jest.fn().mockResolvedValue({
          success: false,
          destination: 'apple_reminders',
          error: 'Permission denied',
          fallbackText: 'タスク: Test Task\n期日: 2025-01-10',
        }),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        reminderManager: mockReminderManager as unknown as any,
      });

      const result = await handleSetReminder(ctx, {
        taskTitle: 'Test Task',
        dueDate: '2025-01-10',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.fallbackText).toBeDefined();
      expect(response.message).toContain('手動でコピー');
    });

    it('should handle errors gracefully', async () => {
      const mockReminderManager = createMockReminderManager({
        setReminder: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        reminderManager: mockReminderManager as unknown as any,
      });

      const result = await handleSetReminder(ctx, {
        taskTitle: 'Test Task',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('リマインダー設定に失敗しました');
    });
  });

  describe('handleListTodos', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockReminderTodoContext({
        config: null,
      });

      const result = await handleListTodos(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
    });

    it('should list todos successfully', async () => {
      const mockTodos = [
        { ...SAMPLE_TODO_ITEM, id: 'todo-1' },
        { ...SAMPLE_TODO_ITEM, id: 'todo-2', priority: 'P1' as const },
      ];

      const mockTodoManager = createMockTodoListManager({
        listTodos: jest.fn().mockResolvedValue(mockTodos),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      const result = await handleListTodos(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.totalCount).toBe(2);
      expect(response.todos).toHaveLength(2);
      expect(response.message).toContain('2件のタスクが見つかりました');
    });

    it('should call getTodaysTasks when todayOnly is true', async () => {
      const mockTodayTasks = [SAMPLE_TODO_ITEM];

      const mockTodoManager = createMockTodoListManager({
        getTodaysTasks: jest.fn().mockResolvedValue(mockTodayTasks),
        listTodos: jest.fn(),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      const result = await handleListTodos(ctx, { todayOnly: true });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(mockTodoManager.getTodaysTasks).toHaveBeenCalled();
      expect(mockTodoManager.listTodos).not.toHaveBeenCalled();
    });

    it('should filter by priority', async () => {
      const mockTodoManager = createMockTodoListManager({
        listTodos: jest.fn().mockResolvedValue([]),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      await handleListTodos(ctx, {
        priority: ['P0', 'P1'],
      });

      expect(mockTodoManager.listTodos).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: ['P0', 'P1'],
        })
      );
    });

    it('should filter by status and source', async () => {
      const mockTodoManager = createMockTodoListManager({
        listTodos: jest.fn().mockResolvedValue([]),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      await handleListTodos(ctx, {
        status: ['not_started', 'in_progress'],
        source: ['apple_reminders'],
      });

      expect(mockTodoManager.listTodos).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ['not_started', 'in_progress'],
          source: ['apple_reminders'],
        })
      );
    });

    it('should return no tasks message when empty', async () => {
      const mockTodoManager = createMockTodoListManager({
        listTodos: jest.fn().mockResolvedValue([]),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      const result = await handleListTodos(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.totalCount).toBe(0);
      expect(response.message).toContain('見つかりませんでした');
    });

    it('should call initializeServices when todoListManager is null', async () => {
      const mockTodoManager = createMockTodoListManager({
        listTodos: jest.fn().mockResolvedValue([]),
      });

      const initializeServicesMock = jest.fn();
      const getTodoListManagerMock = jest.fn()
        .mockReturnValueOnce(null)
        .mockReturnValue(mockTodoManager);

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        getTodoListManager: getTodoListManagerMock,
        initializeServices: initializeServicesMock,
      });

      await handleListTodos(ctx, {});

      expect(initializeServicesMock).toHaveBeenCalledWith(DEFAULT_TEST_CONFIG);
    });

    it('should handle errors gracefully', async () => {
      const mockTodoManager = createMockTodoListManager({
        listTodos: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const ctx = createMockReminderTodoContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      const result = await handleListTodos(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('TODOリストの取得に失敗しました');
    });
  });
});
