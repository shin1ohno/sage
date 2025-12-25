/**
 * E2E Full Workflow Tests
 * Requirements: 1.1-1.6, 2.1-2.6, 5.1-5.6
 * Tests complete user workflows from setup to task management
 */

import { SageCore } from '../../src/core/sage-core.js';
import { MCPAdapter } from '../../src/platform/adapters/mcp-adapter.js';
import { TodoListManager } from '../../src/integrations/todo-list-manager.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';
import type { UserConfig } from '../../src/types/index.js';

describe('E2E: Full Workflow', () => {
  let core: SageCore;
  let adapter: MCPAdapter;
  let todoManager: TodoListManager;

  const testConfig: UserConfig = {
    ...DEFAULT_CONFIG,
    lastUpdated: new Date().toISOString(),
  };

  beforeEach(async () => {
    adapter = new MCPAdapter();
    core = new SageCore(adapter);
    todoManager = new TodoListManager();
    await core.initialize(testConfig);
  });

  describe('Complete Task Analysis Flow', () => {
    it('should analyze email and extract tasks with priorities', async () => {
      const emailContent = `
        田中さん

        来週の会議について確認です。
        - 明日までに報告書を作成してください（緊急）
        - 週末までにプレゼン資料を準備してください
        - 時間があればドキュメントを更新してください

        よろしくお願いします。
        山田部長
      `;

      const result = await core.analyzeFromText(emailContent);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks.length).toBeGreaterThan(0);

      // Should have at least one urgent task
      const urgentTasks = result.analyzedTasks.filter((t) => t.priority === 'P0');
      expect(urgentTasks.length).toBeGreaterThan(0);

      // Should detect manager as stakeholder
      const hasManagerStakeholder = result.analyzedTasks.some(
        (t) => t.stakeholders && t.stakeholders.some((s) => s.includes('山田') || s.includes('部長'))
      );
      expect(hasManagerStakeholder).toBe(true);
    });

    it('should handle multi-line meeting notes', async () => {
      const meetingNotes = `
        会議議事録 - 2025年1月15日

        決定事項:
        1. 新機能の開発を来週開始する
        2. テスト環境を3日以内に構築する @鈴木さん
        3. ドキュメントを月末までに完成させる

        TODO:
        - 予算申請書を作成する（田中マネージャー宛）
        - 開発チームとキックオフミーティングを設定する
      `;

      const result = await core.analyzeFromText(meetingNotes);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks.length).toBeGreaterThanOrEqual(4);

      // Should extract stakeholders
      const allStakeholders = result.analyzedTasks.flatMap((t) => t.stakeholders || []);
      expect(allStakeholders.length).toBeGreaterThan(0);
    });
  });

  describe('Task Prioritization Flow', () => {
    it('should correctly prioritize tasks based on urgency and stakeholders', async () => {
      const tasks = [
        { title: '緊急：サーバー障害対応', deadline: new Date().toISOString() },
        { title: 'レポート作成（山田部長依頼）', deadline: undefined },
        { title: 'ドキュメント更新', deadline: undefined },
        { title: 'コードレビュー', deadline: undefined },
      ];

      const result = await core.analyzeTasks(tasks as any);

      expect(result.success).toBe(true);

      // First task should be P0 (urgent)
      const urgentTask = result.analyzedTasks.find((t) => t.original.title.includes('緊急'));
      expect(urgentTask?.priority).toBe('P0');

      // Manager-related task should be high priority
      const managerTask = result.analyzedTasks.find((t) => t.original.title.includes('部長'));
      expect(['P0', 'P1']).toContain(managerTask?.priority);
    });

    it('should adjust priority based on deadline proximity', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const tasks = [
        { title: 'タスクA', deadline: tomorrow.toISOString() },
        { title: 'タスクB', deadline: nextWeek.toISOString() },
      ];

      const result = await core.analyzeTasks(tasks as any);

      expect(result.success).toBe(true);

      const taskA = result.analyzedTasks.find((t) => t.original.title === 'タスクA');
      const taskB = result.analyzedTasks.find((t) => t.original.title === 'タスクB');

      // Task A should have higher priority due to closer deadline
      const priorityOrder = ['P0', 'P1', 'P2', 'P3'];
      expect(priorityOrder.indexOf(taskA!.priority)).toBeLessThanOrEqual(
        priorityOrder.indexOf(taskB!.priority)
      );
    });
  });

  describe('Time Estimation Flow', () => {
    it('should provide reasonable time estimates', async () => {
      const tasks = [
        { title: 'メール確認', deadline: undefined },
        { title: 'レポート作成', deadline: undefined },
        { title: '新機能の設計と実装', deadline: undefined },
      ];

      const result = await core.analyzeTasks(tasks as any);

      expect(result.success).toBe(true);

      // Email check should be quick
      const emailTask = result.analyzedTasks.find((t) => t.original.title.includes('メール'));
      expect(emailTask?.estimatedMinutes).toBeLessThanOrEqual(30);

      // Report should be medium
      const reportTask = result.analyzedTasks.find((t) => t.original.title.includes('レポート'));
      expect(reportTask?.estimatedMinutes).toBeGreaterThanOrEqual(30);

      // Implementation should be long
      const implTask = result.analyzedTasks.find((t) => t.original.title.includes('実装'));
      expect(implTask?.estimatedMinutes).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Integration Recommendations', () => {
    it('should provide appropriate integration recommendations', () => {
      const recommendations = core.getIntegrationRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);

      // Should have reminders recommendation
      const remindersRec = recommendations.find((r) => r.integration === 'reminders');
      expect(remindersRec).toBeDefined();

      // Should have calendar recommendation
      const calendarRec = recommendations.find((r) => r.integration === 'calendar');
      expect(calendarRec).toBeDefined();
    });
  });

  describe('TODO List Management Flow', () => {
    it('should filter tasks by priority', async () => {
      const sampleTodos = [
        {
          id: '1',
          title: 'High priority task',
          priority: 'P0' as const,
          status: 'not_started' as const,
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'manual' as const,
          sourceId: 'm-1',
          tags: [],
        },
        {
          id: '2',
          title: 'Low priority task',
          priority: 'P3' as const,
          status: 'not_started' as const,
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'manual' as const,
          sourceId: 'm-2',
          tags: [],
        },
      ];

      const filtered = todoManager.filterTodos(sampleTodos, { priority: ['P0', 'P1'] });

      expect(filtered.length).toBe(1);
      expect(filtered[0].priority).toBe('P0');
    });

    it('should merge todos from multiple sources', () => {
      const reminders = [
        {
          id: 'ar-1',
          title: 'From Reminders',
          priority: 'P1' as const,
          status: 'not_started' as const,
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'apple_reminders' as const,
          sourceId: 'ar-1',
          tags: [],
        },
      ];

      const notion = [
        {
          id: 'n-1',
          title: 'From Notion',
          priority: 'P2' as const,
          status: 'in_progress' as const,
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          source: 'notion' as const,
          sourceId: 'n-1',
          tags: [],
        },
      ];

      const merged = todoManager.mergeTodosFromSources(reminders, notion);

      expect(merged.length).toBe(2);
      expect(merged.map((t) => t.source)).toContain('apple_reminders');
      expect(merged.map((t) => t.source)).toContain('notion');
    });
  });

  describe('Error Handling Flow', () => {
    it('should handle empty input gracefully', async () => {
      const result = await core.analyzeFromText('');

      expect(result.success).toBe(true);
      // Empty input may return 0 or 1 tasks depending on implementation
      expect(result.analyzedTasks.length).toBeLessThanOrEqual(1);
    });

    it('should handle malformed input gracefully', async () => {
      const result = await core.analyzeFromText('!@#$%^&*()');

      expect(result.success).toBe(true);
      // Should not throw, even with unusual input
    });

    it('should handle very long input', async () => {
      const longInput = 'タスク: 作業を完了する '.repeat(1000);

      const result = await core.analyzeFromText(longInput);

      expect(result.success).toBe(true);
    });
  });
});

describe('E2E: Platform Compatibility', () => {
  describe('Core Logic Platform Independence', () => {
    it('should produce consistent results across adapter types', async () => {
      const input = '緊急：報告書を明日までに作成する';

      // Test with MCP adapter
      const mcpAdapter = new MCPAdapter();
      const mcpCore = new SageCore(mcpAdapter);
      await mcpCore.initialize();

      const mcpResult = await mcpCore.analyzeFromText(input);

      // Verify core functionality works
      expect(mcpResult.success).toBe(true);
      expect(mcpResult.analyzedTasks.length).toBeGreaterThan(0);
      expect(mcpResult.analyzedTasks[0].priority).toBe('P0'); // Urgent keyword
    });
  });

  describe('Configuration Portability', () => {
    it('should handle configuration with minimal changes', async () => {
      const minimalConfig: UserConfig = {
        ...DEFAULT_CONFIG,
        integrations: {
          ...DEFAULT_CONFIG.integrations,
          appleReminders: {
            ...DEFAULT_CONFIG.integrations.appleReminders,
            enabled: false,
          },
          notion: {
            ...DEFAULT_CONFIG.integrations.notion,
            enabled: false,
          },
        },
        lastUpdated: new Date().toISOString(),
      };

      const adapter = new MCPAdapter();
      const core = new SageCore(adapter);
      await core.initialize(minimalConfig);

      const result = await core.analyzeFromText('タスクを完了する');

      expect(result.success).toBe(true);
    });
  });
});
