/**
 * Platform Compatibility Tests
 * Requirements: 7.3, 7.4, 7.5
 * Tests for cross-platform functionality
 *
 * 実装:
 * - desktop_mcp: MCPAdapter
 * - remote_mcp: RemoteMCPAdapter
 */

import { SageCore } from '../../src/core/sage-core.js';
import { MCPAdapter } from '../../src/platform/adapters/mcp-adapter.js';
import { RemoteMCPAdapter } from '../../src/platform/adapters/remote-mcp-adapter.js';
import { UserConfig, DEFAULT_CONFIG } from '../../src/types/config.js';
import { HybridIntegrationManager, Platform } from '../../src/remote/hybrid-integration.js';

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

    it('should produce consistent task analysis across MCP adapter', async () => {
      const adapter = new MCPAdapter();
      const sage = new SageCore(adapter);
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText(testInput);

      expect(result.analyzedTasks.length).toBeGreaterThan(0);
      expect(result.analyzedTasks.some((t) => t.priority === 'P0')).toBe(true);
    });

    it('should produce consistent task analysis across Remote MCP adapter', async () => {
      const adapter = new RemoteMCPAdapter();
      const sage = new SageCore(adapter);
      await sage.initialize(testConfig);

      const result = await sage.analyzeFromText(testInput);

      expect(result.analyzedTasks.length).toBeGreaterThan(0);
      expect(result.analyzedTasks.some((t) => t.priority === 'P0')).toBe(true);
    });

    it('should produce identical priority rankings across all platforms', async () => {
      const mcpAdapter = new MCPAdapter();
      const remoteAdapter = new RemoteMCPAdapter();

      const sageMCP = new SageCore(mcpAdapter);
      const sageRemote = new SageCore(remoteAdapter);

      await Promise.all([sageMCP.initialize(testConfig), sageRemote.initialize(testConfig)]);

      const results = await Promise.all([
        sageMCP.analyzeFromText(testInput),
        sageRemote.analyzeFromText(testInput),
      ]);

      // All platforms should identify the same number of tasks
      const taskCounts = results.map((r) => r.analyzedTasks.length);
      expect(taskCounts[0]).toBe(taskCounts[1]);

      // All platforms should identify urgent task
      const hasUrgent = results.map((r) =>
        r.analyzedTasks.some((t) => t.original.title.includes('緊急'))
      );
      expect(hasUrgent.every((v) => v)).toBe(true);
    });
  });

  describe('Configuration Portability', () => {
    it('should handle timezone configuration consistently', async () => {
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

      // Config should be accessible
      expect(sageTokyo.getConfig().user.timezone).toBe('Asia/Tokyo');
      expect(sageNY.getConfig().user.timezone).toBe('America/New_York');
    });
  });

  describe('Feature Availability', () => {
    it('should report correct features for MCP adapter', () => {
      const adapter = new MCPAdapter();
      const features = adapter.getAvailableFeatures();

      expect(features.taskAnalysis).toBe(true);
      expect(features.appleReminders).toBe(true);
      expect(features.notionIntegration).toBe(true);
      expect(features.fileSystemAccess).toBe(true);
    });

    it('should report correct features for Remote MCP adapter', () => {
      const adapter = new RemoteMCPAdapter();
      const features = adapter.getAvailableFeatures();

      expect(features.taskAnalysis).toBe(true);
      expect(features.appleReminders).toBe(true); // via Remote MCP Server
      expect(features.calendarIntegration).toBe(true); // via Remote MCP Server
      expect(features.notionIntegration).toBe(true); // via Remote MCP Server
      expect(features.fileSystemAccess).toBe(false);
    });
  });

  describe('Hybrid Integration Compatibility', () => {
    let hybridManager: HybridIntegrationManager;

    beforeEach(() => {
      hybridManager = new HybridIntegrationManager();
    });

    it('should coordinate between macOS and iOS platforms', () => {
      const plan = hybridManager.planCoordination(['macos', 'ios']);

      expect(plan.platforms).toContain('macos');
      expect(plan.platforms).toContain('ios');
      expect(plan.syncStrategy).toBe('real-time');
    });

    it('should handle web-only configuration', () => {
      const plan = hybridManager.planCoordination(['web']);

      expect(plan.syncStrategy).toBe('manual');
    });

    it('should handle mixed native and web platforms', () => {
      const plan = hybridManager.planCoordination(['macos', 'ios', 'web']);

      expect(plan.syncStrategy).toBe('eventual');
      expect(plan.conflictResolution).toBe('last-write-wins');
    });

    const platforms: Platform[] = ['macos', 'ios', 'ipados', 'web'];

    platforms.forEach((platform) => {
      it(`should provide valid capabilities for ${platform}`, () => {
        const capabilities = hybridManager.detectCapabilities(platform);

        expect(capabilities.reminders).toBeDefined();
        expect(capabilities.calendar).toBeDefined();
        expect(capabilities.notion).toBeDefined();
      });
    });
  });

  describe('Japanese Language Support', () => {
    const japaneseInput = `
      山田部長からの依頼
      - 月曜日までに報告書を提出
      - 来週の定例会議の資料準備
      また、田中さんへのフォローアップも必要
    `;

    it('should correctly parse Japanese task separators on all platforms', async () => {
      const adapters = [new MCPAdapter(), new RemoteMCPAdapter()];

      for (const adapter of adapters) {
        const sage = new SageCore(adapter);
        await sage.initialize(testConfig);

        const result = await sage.analyzeFromText(japaneseInput);

        // Should detect multiple tasks from Japanese input
        expect(result.analyzedTasks.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should detect Japanese manager keywords consistently', async () => {
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

  describe('Error Handling Consistency', () => {
    it('should handle empty input consistently across platforms', async () => {
      const adapters = [new MCPAdapter(), new RemoteMCPAdapter()];

      for (const adapter of adapters) {
        const sage = new SageCore(adapter);
        await sage.initialize(testConfig);

        const result = await sage.analyzeFromText('');

        expect(result.success).toBe(true);
        expect(result.analyzedTasks).toHaveLength(0);
      }
    });

    it('should handle whitespace-only input consistently', async () => {
      const adapters = [new MCPAdapter(), new RemoteMCPAdapter()];

      for (const adapter of adapters) {
        const sage = new SageCore(adapter);
        await sage.initialize(testConfig);

        const result = await sage.analyzeFromText('   \n\t  ');

        expect(result.success).toBe(true);
        expect(result.analyzedTasks).toHaveLength(0);
      }
    });
  });
});
