/**
 * Platform Compatibility Tests
 * Requirements: 7.3, 7.4
 *
 * sage は macOS 専用で、AppleScript を使用して
 * Apple Reminders/Calendar と統合します。
 */

import { SageCore } from '../../src/core/sage-core.js';
import { MCPAdapter } from '../../src/platform/adapters/mcp-adapter.js';
import { UserConfig, DEFAULT_CONFIG } from '../../src/types/config.js';

describe('Platform Compatibility', () => {
  const testConfig: UserConfig = {
    ...DEFAULT_CONFIG,
    user: {
      name: 'Test User',
      timezone: 'Asia/Tokyo',
    },
  };

  describe('Core Logic Consistency', () => {
    const testInput = `
      今週中にレポートを作成する
      来週の会議の準備
      緊急: サーバー障害対応
    `;

    it('should produce consistent task analysis', async () => {
      const adapter = new MCPAdapter();
      const sage = new SageCore(adapter);
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText(testInput);

      expect(result.analyzedTasks.length).toBeGreaterThan(0);
      expect(result.analyzedTasks.some((t) => t.priority === 'P0')).toBe(true);
    });

    it('should identify urgent tasks correctly', async () => {
      const adapter = new MCPAdapter();
      const sage = new SageCore(adapter);
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText(testInput);

      const hasUrgent = result.analyzedTasks.some((t) => t.original.title.includes('緊急'));
      expect(hasUrgent).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should handle timezone configuration', async () => {
      const tokyoConfig: UserConfig = {
        ...DEFAULT_CONFIG,
        user: { name: 'Tokyo User', timezone: 'Asia/Tokyo' },
      };

      const nyConfig: UserConfig = {
        ...DEFAULT_CONFIG,
        user: { name: 'NY User', timezone: 'America/New_York' },
      };

      const sageTokyo = new SageCore(new MCPAdapter());
      const sageNY = new SageCore(new MCPAdapter());

      await sageTokyo.initialize(tokyoConfig);
      await sageNY.initialize(nyConfig);

      expect(sageTokyo.getConfig().user.timezone).toBe('Asia/Tokyo');
      expect(sageNY.getConfig().user.timezone).toBe('America/New_York');
    });
  });

  describe('Feature Availability', () => {
    it('should report correct features for macOS MCP adapter', () => {
      const adapter = new MCPAdapter();
      const features = adapter.getAvailableFeatures();

      expect(features.taskAnalysis).toBe(true);
      expect(features.appleReminders).toBe(true);
      expect(features.calendarIntegration).toBe(true);
      expect(features.notionIntegration).toBe(true);
      expect(features.fileSystemAccess).toBe(true);
      expect(features.persistentConfig).toBe(true);
    });
  });

  describe('Japanese Language Support', () => {
    const japaneseInput = `
      山田部長からの依頼
      - 月曜日までに報告書を提出
      - 来週の定例会議の資料準備
      また、田中さんへのフォローアップも必要
    `;

    it('should correctly parse Japanese task separators', async () => {
      const sage = new SageCore(new MCPAdapter());
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText(japaneseInput);

      // Should detect multiple tasks from Japanese input
      expect(result.analyzedTasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect Japanese manager keywords', async () => {
      const sage = new SageCore(new MCPAdapter());
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText(japaneseInput);

      // Should detect manager involvement
      const hasManagerTask = result.analyzedTasks.some(
        (t) => t.stakeholders && t.stakeholders.length > 0
      );
      expect(hasManagerTask).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty input gracefully', async () => {
      const sage = new SageCore(new MCPAdapter());
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText('');

      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toHaveLength(0);
    });

    it('should handle whitespace-only input', async () => {
      const sage = new SageCore(new MCPAdapter());
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText('   \n\t  ');

      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toHaveLength(0);
    });
  });
});
