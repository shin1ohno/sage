/**
 * SageCore Unit Tests
 * Requirements: 2.1, 2.2, 11.1, 7.3, 7.4
 */

import { SageCore } from '../../src/core/sage-core.js';
import { MCPAdapter } from '../../src/platform/adapters/mcp-adapter.js';
import { SkillsAdapteriOS } from '../../src/platform/adapters/skills-adapter-ios.js';
import { SkillsAdapterWeb } from '../../src/platform/adapters/skills-adapter-web.js';
import type { Task, UserConfig } from '../../src/types/index.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';

describe('SageCore', () => {
  const testConfig: UserConfig = {
    ...DEFAULT_CONFIG,
    user: {
      name: 'Test User',
      timezone: 'Asia/Tokyo',
    },
    team: {
      manager: {
        name: 'Manager San',
        role: 'manager',
        keywords: ['manager', 'マネージャー'],
      },
      frequentCollaborators: [],
      departments: ['Engineering'],
    },
  };

  describe('with MCPAdapter', () => {
    let core: SageCore;

    beforeEach(async () => {
      const adapter = new MCPAdapter();
      core = new SageCore(adapter);
      await core.initialize(testConfig);
    });

    it('should initialize with MCP adapter', () => {
      expect(core.getPlatformInfo().type).toBe('desktop_mcp');
    });

    it('should have all features available', () => {
      const features = core.getAvailableFeatures();
      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(true);
      expect(features.notionIntegration).toBe(true);
    });

    it('should analyze tasks', async () => {
      const tasks: Task[] = [
        { title: 'Review PR' },
        { title: 'Fix urgent bug' },
      ];

      const result = await core.analyzeTasks(tasks);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toHaveLength(2);
    });

    it('should analyze text input', async () => {
      const input = `
- Review PR #123
- Fix login bug
- Update documentation
      `.trim();

      const result = await core.analyzeFromText(input);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks.length).toBe(3);
    });

    it('should provide platform-specific recommendations', () => {
      const recommendations = core.getIntegrationRecommendations();

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          integration: 'notion',
          available: true,
          method: 'mcp',
        })
      );
      expect(recommendations).toContainEqual(
        expect.objectContaining({
          integration: 'reminders',
          available: true,
          method: 'applescript',
        })
      );
    });
  });

  describe('with SkillsAdapteriOS', () => {
    let core: SageCore;

    beforeEach(async () => {
      const adapter = new SkillsAdapteriOS();
      core = new SageCore(adapter);
      await core.initialize(testConfig);
    });

    it('should initialize with iOS Skills adapter', () => {
      expect(core.getPlatformInfo().type).toBe('ios_skills');
    });

    it('should have iOS-specific features available', () => {
      const features = core.getAvailableFeatures();
      expect(features.taskAnalysis).toBe(true);
      expect(features.appleReminders).toBe(true);
      expect(features.calendarIntegration).toBe(true);
      expect(features.notionIntegration).toBe(false);
    });

    it('should analyze tasks', async () => {
      const tasks: Task[] = [{ title: 'Test task' }];

      const result = await core.analyzeTasks(tasks);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toHaveLength(1);
    });

    it('should provide iOS-specific recommendations', () => {
      const recommendations = core.getIntegrationRecommendations();

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          integration: 'reminders',
          available: true,
          method: 'native',
        })
      );
      expect(recommendations).toContainEqual(
        expect.objectContaining({
          integration: 'notion',
          available: false,
          fallback: 'manual_copy',
        })
      );
    });
  });

  describe('with SkillsAdapterWeb', () => {
    let core: SageCore;

    beforeEach(async () => {
      const adapter = new SkillsAdapterWeb();
      core = new SageCore(adapter);
      await core.initialize(testConfig);
    });

    it('should initialize with Web Skills adapter', () => {
      expect(core.getPlatformInfo().type).toBe('web_skills');
    });

    it('should have limited features available', () => {
      const features = core.getAvailableFeatures();
      expect(features.taskAnalysis).toBe(true);
      expect(features.persistentConfig).toBe(false);
      expect(features.appleReminders).toBe(false);
      expect(features.notionIntegration).toBe(false);
    });

    it('should still analyze tasks', async () => {
      const tasks: Task[] = [{ title: 'Web task' }];

      const result = await core.analyzeTasks(tasks);

      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toHaveLength(1);
    });

    it('should provide web-specific recommendations with fallbacks', () => {
      const recommendations = core.getIntegrationRecommendations();

      expect(recommendations).toContainEqual(
        expect.objectContaining({
          integration: 'reminders',
          available: false,
          fallback: 'manual_copy',
        })
      );
    });
  });

  describe('common functionality', () => {
    let core: SageCore;

    beforeEach(async () => {
      const adapter = new MCPAdapter();
      core = new SageCore(adapter);
      await core.initialize(testConfig);
    });

    it('should get current config', () => {
      const config = core.getConfig();
      expect(config.user.name).toBe('Test User');
    });

    it('should update config', async () => {
      await core.updateConfig({ user: { name: 'New Name', timezone: 'UTC' } });
      const config = core.getConfig();
      expect(config.user.name).toBe('New Name');
    });

    it('should format analysis result', async () => {
      const tasks: Task[] = [{ title: 'Test task' }];
      const result = await core.analyzeTasks(tasks);
      const formatted = core.formatResult(result);

      expect(formatted).toContain('## タスク分析結果');
      expect(formatted).toContain('Test task');
    });

    it('should check if initialized', () => {
      expect(core.isInitialized()).toBe(true);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedCore = new SageCore(new MCPAdapter());

      await expect(uninitializedCore.analyzeTasks([{ title: 'test' }])).rejects.toThrow(
        'SageCore not initialized'
      );
    });
  });

  describe('task splitting', () => {
    let core: SageCore;

    beforeEach(async () => {
      const adapter = new MCPAdapter();
      core = new SageCore(adapter);
      await core.initialize(testConfig);
    });

    it('should split complex tasks', async () => {
      const input = 'Build new authentication system';
      const result = await core.analyzeFromText(input);

      // Complex task should be split into subtasks
      expect(result.splitInfo?.wasSplit).toBe(true);
      expect(result.analyzedTasks.length).toBeGreaterThan(1);
    });

    it('should not split simple tasks', async () => {
      const input = 'Review the document';
      const result = await core.analyzeFromText(input);

      expect(result.splitInfo?.wasSplit).toBe(false);
      expect(result.analyzedTasks).toHaveLength(1);
    });
  });

  describe('priority and estimation', () => {
    let core: SageCore;

    beforeEach(async () => {
      const adapter = new MCPAdapter();
      core = new SageCore(adapter);
      await core.initialize(testConfig);
    });

    it('should assign correct priority to urgent tasks', async () => {
      const tasks: Task[] = [{ title: 'Fix urgent production issue' }];
      const result = await core.analyzeTasks(tasks);

      expect(result.analyzedTasks[0].priority).toBe('P0');
    });

    it('should estimate time for tasks', async () => {
      const tasks: Task[] = [
        { title: 'Quick review' },
        { title: 'Design new architecture' },
      ];
      const result = await core.analyzeTasks(tasks);

      expect(result.analyzedTasks[0].estimatedMinutes).toBeLessThan(
        result.analyzedTasks[1].estimatedMinutes
      );
    });

    it('should extract stakeholders', async () => {
      const tasks: Task[] = [{ title: 'Meeting with @john about the project' }];
      const result = await core.analyzeTasks(tasks);

      expect(result.analyzedTasks[0].stakeholders).toContain('john');
    });
  });
});
