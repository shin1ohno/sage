/**
 * Task Handlers Unit Tests
 *
 * Tests for task-related tool handlers using dependency injection
 * via Context objects.
 */

import {
  handleAnalyzeTasks,
  handleUpdateTaskStatus,
  handleSyncTasks,
  handleDetectDuplicates,
} from '../../../src/tools/tasks/handlers.js';
import { TaskAnalyzer } from '../../../src/tools/analyze-tasks.js';
import {
  createMockTaskToolsContext,
  createMockTodoListManager,
  createMockTaskSynchronizer,
  DEFAULT_TEST_CONFIG,
  SAMPLE_TODO_ITEM,
} from '../../helpers/index.js';

// Mock TaskAnalyzer
jest.mock('../../../src/tools/analyze-tasks.js', () => ({
  TaskAnalyzer: {
    analyzeTasks: jest.fn(),
  },
}));

describe('Task Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleAnalyzeTasks', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockTaskToolsContext({
        config: null,
      });

      const result = await handleAnalyzeTasks(ctx, {
        tasks: [{ title: 'Test task' }],
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定されていません');
    });

    it('should analyze tasks and return results', async () => {
      const mockAnalysisResult = {
        summary: {
          totalTasks: 1,
          byPriority: { P0: 0, P1: 1, P2: 0, P3: 0 },
          totalEstimatedMinutes: 60,
        },
        analyzedTasks: [
          {
            original: { title: 'Important task', description: 'Desc' },
            priority: 'P1',
            estimatedMinutes: 60,
            stakeholders: ['Manager'],
            tags: ['urgent'],
            reasoning: 'High priority due to manager involvement',
            suggestedReminders: ['1_day_before'],
          },
        ],
      };

      (TaskAnalyzer.analyzeTasks as jest.Mock).mockResolvedValue(mockAnalysisResult);

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleAnalyzeTasks(ctx, {
        tasks: [{ title: 'Important task', description: 'Desc' }],
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(1);
      expect(response.tasks[0].priority).toBe('P1');
      expect(response.tasks[0].estimatedMinutes).toBe(60);
    });

    it('should handle analysis errors gracefully', async () => {
      (TaskAnalyzer.analyzeTasks as jest.Mock).mockRejectedValue(
        new Error('Analysis failed')
      );

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleAnalyzeTasks(ctx, {
        tasks: [{ title: 'Test task' }],
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('タスク分析に失敗しました');
    });
  });

  describe('handleUpdateTaskStatus', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockTaskToolsContext({
        config: null,
      });

      const result = await handleUpdateTaskStatus(ctx, {
        taskId: 'task-123',
        status: 'completed',
        source: 'manual',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
    });

    it('should update task status successfully', async () => {
      const mockTodoManager = createMockTodoListManager({
        updateTaskStatus: jest.fn().mockResolvedValue({
          success: true,
          taskId: 'task-123',
          updatedFields: ['status'],
          syncedSources: ['manual'],
        }),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      const result = await handleUpdateTaskStatus(ctx, {
        taskId: 'task-123',
        status: 'completed',
        source: 'manual',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.taskId).toBe('task-123');
      expect(response.newStatus).toBe('completed');
    });

    it('should call initializeServices when todoListManager is null', async () => {
      const mockTodoManager = createMockTodoListManager({
        updateTaskStatus: jest.fn().mockResolvedValue({
          success: true,
          taskId: 'task-123',
          updatedFields: ['status'],
          syncedSources: ['manual'],
        }),
      });

      const initializeServicesMock = jest.fn();
      const getTodoListManagerMock = jest.fn()
        .mockReturnValueOnce(null)
        .mockReturnValue(mockTodoManager);

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        getTodoListManager: getTodoListManagerMock,
        initializeServices: initializeServicesMock,
      });

      await handleUpdateTaskStatus(ctx, {
        taskId: 'task-123',
        status: 'completed',
        source: 'manual',
      });

      expect(initializeServicesMock).toHaveBeenCalledWith(DEFAULT_TEST_CONFIG);
    });

    it('should sync across sources when requested', async () => {
      const mockTodoManager = createMockTodoListManager({
        updateTaskStatus: jest.fn().mockResolvedValue({
          success: true,
          taskId: 'task-123',
          updatedFields: ['status'],
          syncedSources: ['apple_reminders'],
        }),
        syncTaskAcrossSources: jest.fn().mockResolvedValue({
          success: true,
          taskId: 'task-123',
          syncedSources: ['apple_reminders', 'notion'],
        }),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      const result = await handleUpdateTaskStatus(ctx, {
        taskId: 'task-123',
        status: 'completed',
        source: 'apple_reminders',
        syncAcrossSources: true,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.syncResult).toBeDefined();
      expect(mockTodoManager.syncTaskAcrossSources).toHaveBeenCalledWith('task-123');
    });

    it('should return error when update fails', async () => {
      const mockTodoManager = createMockTodoListManager({
        updateTaskStatus: jest.fn().mockResolvedValue({
          success: false,
          taskId: 'task-123',
          updatedFields: [],
          syncedSources: [],
          error: 'Task not found',
        }),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        todoListManager: mockTodoManager as unknown as any,
      });

      const result = await handleUpdateTaskStatus(ctx, {
        taskId: 'task-123',
        status: 'completed',
        source: 'manual',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Task not found');
    });
  });

  describe('handleSyncTasks', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockTaskToolsContext({
        config: null,
      });

      const result = await handleSyncTasks(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
    });

    it('should sync tasks successfully', async () => {
      const mockSynchronizer = createMockTaskSynchronizer({
        syncAllTasks: jest.fn().mockResolvedValue({
          totalTasks: 10,
          syncedTasks: 10,
          conflicts: [],
          errors: [],
          duration: 500,
        }),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        taskSynchronizer: mockSynchronizer as unknown as any,
      });

      const result = await handleSyncTasks(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.totalTasks).toBe(10);
      expect(response.syncedTasks).toBe(10);
      expect(response.message).toContain('10件のタスクを同期しました');
    });

    it('should report conflicts in the message', async () => {
      const mockSynchronizer = createMockTaskSynchronizer({
        syncAllTasks: jest.fn().mockResolvedValue({
          totalTasks: 10,
          syncedTasks: 8,
          conflicts: [
            {
              field: 'status',
              appleRemindersValue: 'completed',
              notionValue: 'in_progress',
              resolvedValue: 'completed',
              resolution: 'apple_reminders',
            },
            {
              field: 'priority',
              appleRemindersValue: 'P1',
              notionValue: 'P2',
              resolvedValue: 'P1',
              resolution: 'apple_reminders',
            },
          ],
          errors: [],
          duration: 500,
        }),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        taskSynchronizer: mockSynchronizer as unknown as any,
      });

      const result = await handleSyncTasks(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.conflicts).toHaveLength(2);
      expect(response.message).toContain('2件の競合');
    });
  });

  describe('handleDetectDuplicates', () => {
    it('should return error when config is null', async () => {
      const ctx = createMockTaskToolsContext({
        config: null,
      });

      const result = await handleDetectDuplicates(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
    });

    it('should detect duplicates successfully', async () => {
      const mockDuplicates = [
        {
          tasks: [
            { ...SAMPLE_TODO_ITEM, id: 'task-1', source: 'apple_reminders' as const },
            { ...SAMPLE_TODO_ITEM, id: 'task-2', source: 'notion' as const },
          ],
          similarity: 0.95,
          confidence: 'high' as const,
          suggestedMerge: { ...SAMPLE_TODO_ITEM, id: 'merged-task-1' },
        },
      ];

      const mockSynchronizer = createMockTaskSynchronizer({
        detectDuplicates: jest.fn().mockResolvedValue(mockDuplicates),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        taskSynchronizer: mockSynchronizer as unknown as any,
      });

      const result = await handleDetectDuplicates(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.duplicatesFound).toBe(1);
      expect(response.duplicates[0].similarity).toBe(95);
      expect(response.duplicates[0].confidence).toBe('high');
    });

    it('should return no duplicates message when none found', async () => {
      const mockSynchronizer = createMockTaskSynchronizer({
        detectDuplicates: jest.fn().mockResolvedValue([]),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        taskSynchronizer: mockSynchronizer as unknown as any,
      });

      const result = await handleDetectDuplicates(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.duplicatesFound).toBe(0);
      expect(response.message).toContain('見つかりませんでした');
    });

    it('should auto-merge high-confidence duplicates when requested', async () => {
      const mockDuplicates = [
        {
          tasks: [
            { ...SAMPLE_TODO_ITEM, id: 'task-1', source: 'apple_reminders' as const },
            { ...SAMPLE_TODO_ITEM, id: 'task-2', source: 'notion' as const },
          ],
          similarity: 0.98,
          confidence: 'high' as const,
          suggestedMerge: { ...SAMPLE_TODO_ITEM, id: 'merged-task-1' },
        },
      ];

      const mockMergeResult = {
        success: true,
        mergedTask: { ...SAMPLE_TODO_ITEM, id: 'merged-task-1' },
        removedTasks: ['task-2'],
      };

      const mockSynchronizer = createMockTaskSynchronizer({
        detectDuplicates: jest.fn().mockResolvedValue(mockDuplicates),
        mergeDuplicates: jest.fn().mockResolvedValue(mockMergeResult),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        taskSynchronizer: mockSynchronizer as unknown as any,
      });

      const result = await handleDetectDuplicates(ctx, { autoMerge: true });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.mergeResults).toBeDefined();
      expect(mockSynchronizer.mergeDuplicates).toHaveBeenCalled();
    });

    it('should not auto-merge when autoMerge is false', async () => {
      const mockDuplicates = [
        {
          tasks: [
            { ...SAMPLE_TODO_ITEM, id: 'task-1', source: 'apple_reminders' as const },
            { ...SAMPLE_TODO_ITEM, id: 'task-2', source: 'notion' as const },
          ],
          similarity: 0.98,
          confidence: 'high' as const,
          suggestedMerge: { ...SAMPLE_TODO_ITEM, id: 'merged-task-1' },
        },
      ];

      const mockSynchronizer = createMockTaskSynchronizer({
        detectDuplicates: jest.fn().mockResolvedValue(mockDuplicates),
        mergeDuplicates: jest.fn(),
      });

      const ctx = createMockTaskToolsContext({
        config: DEFAULT_TEST_CONFIG,
        taskSynchronizer: mockSynchronizer as unknown as any,
      });

      const result = await handleDetectDuplicates(ctx, { autoMerge: false });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.mergeResults).toBeUndefined();
      expect(mockSynchronizer.mergeDuplicates).not.toHaveBeenCalled();
    });
  });
});
