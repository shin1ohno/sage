/**
 * Edge Case Tests
 * Requirements: All requirements - boundary and error condition testing
 */

import { TaskAnalyzer } from '../../src/tools/analyze-tasks.js';
import { PriorityEngine } from '../../src/utils/priority.js';
import { TimeEstimator } from '../../src/utils/estimation.js';
import { StakeholderExtractor } from '../../src/utils/stakeholders.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';
import type { UserConfig } from '../../src/types/index.js';

const defaultConfig: UserConfig = {
  ...DEFAULT_CONFIG,
  lastUpdated: new Date().toISOString(),
};

describe('Edge Cases: Input Handling', () => {
  describe('Empty and Null Inputs', () => {
    it('should handle empty string', async () => {
      const result = await TaskAnalyzer.analyzeFromText('', defaultConfig);
      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toEqual([]);
    });

    it('should handle whitespace-only input', async () => {
      const result = await TaskAnalyzer.analyzeFromText('   \n\t  ', defaultConfig);
      expect(result.success).toBe(true);
      expect(result.analyzedTasks).toEqual([]);
    });

    it('should handle single character input', async () => {
      const result = await TaskAnalyzer.analyzeFromText('a', defaultConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('Unicode and International Text', () => {
    it('should handle Japanese text correctly', async () => {
      const result = await TaskAnalyzer.analyzeFromText('日本語のタスクを完了する', defaultConfig);
      expect(result.success).toBe(true);
      expect(result.analyzedTasks.length).toBeGreaterThan(0);
    });

    it('should handle mixed Japanese and English', async () => {
      const result = await TaskAnalyzer.analyzeFromText(
        'TODO: Report作成 and レビュー',
        defaultConfig
      );
      expect(result.success).toBe(true);
    });

    it('should handle emoji in tasks', async () => {
      const result = await TaskAnalyzer.analyzeFromText('📝 タスクを完了する 🎉', defaultConfig);
      expect(result.success).toBe(true);
    });

    it('should handle special Unicode characters', async () => {
      const result = await TaskAnalyzer.analyzeFromText('タスク：「報告書」の作成（至急）', defaultConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('Long Text Handling', () => {
    it('should handle very long task titles', async () => {
      const longTitle = 'タスク: ' + 'あ'.repeat(1000);
      const result = await TaskAnalyzer.analyzeFromText(longTitle, defaultConfig);
      expect(result.success).toBe(true);
    });

    it('should handle many tasks', async () => {
      const manyTasks = Array.from({ length: 100 }, (_, i) => `- タスク${i + 1}`).join('\n');
      const result = await TaskAnalyzer.analyzeFromText(manyTasks, defaultConfig);
      expect(result.success).toBe(true);
      expect(result.analyzedTasks.length).toBeLessThanOrEqual(100);
    });

    it('should handle deeply nested bullet points', async () => {
      const nested = `
        - レベル1
          - レベル2
            - レベル3
              - レベル4
      `;
      const result = await TaskAnalyzer.analyzeFromText(nested, defaultConfig);
      expect(result.success).toBe(true);
    });
  });
});

describe('Edge Cases: Date and Time', () => {
  describe('Date Parsing', () => {
    it('should handle various date formats', async () => {
      const dates = [
        '2025-01-15',
        '2025/01/15',
        '1月15日',
        '明日',
        '今週金曜日',
        'January 15, 2025',
      ];

      for (const date of dates) {
        const result = await TaskAnalyzer.analyzeFromText(`タスク（期限: ${date}）`, defaultConfig);
        expect(result.success).toBe(true);
      }
    });

    it('should handle invalid dates gracefully', async () => {
      const result = await TaskAnalyzer.analyzeFromText(
        'タスク（期限: 2025-13-45）',
        defaultConfig
      );
      expect(result.success).toBe(true);
    });

    it('should handle past dates', async () => {
      const result = await TaskAnalyzer.analyzeFromText(
        'タスク（期限: 2020-01-01）',
        defaultConfig
      );
      expect(result.success).toBe(true);
    });

    it('should handle far future dates', async () => {
      const result = await TaskAnalyzer.analyzeFromText(
        'タスク（期限: 2099-12-31）',
        defaultConfig
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Timezone Handling', () => {
    it('should handle different timezones in config', async () => {
      const configs = [
        { ...defaultConfig, user: { ...defaultConfig.user, timezone: 'UTC' } },
        { ...defaultConfig, user: { ...defaultConfig.user, timezone: 'America/New_York' } },
        { ...defaultConfig, user: { ...defaultConfig.user, timezone: 'Europe/London' } },
      ];

      for (const config of configs) {
        const result = await TaskAnalyzer.analyzeFromText('明日までにタスク完了', config);
        expect(result.success).toBe(true);
      }
    });
  });
});

describe('Edge Cases: Priority Calculation', () => {
  describe('Keyword Boundaries', () => {
    it('should detect urgent keywords', () => {
      const task = { title: '緊急対応', description: '' };
      const result = PriorityEngine.determinePriority(
        task as any,
        defaultConfig.priorityRules,
        undefined
      );
      expect(result.priority).toBe('P0');
    });

    it('should handle case-insensitive English keywords', () => {
      const tasks = [
        { title: 'URGENT task', description: '' },
        { title: 'urgent task', description: '' },
        { title: 'Urgent task', description: '' },
      ];

      tasks.forEach((task) => {
        const result = PriorityEngine.determinePriority(
          task as any,
          defaultConfig.priorityRules,
          undefined
        );
        expect(result.priority).toBe('P0');
      });
    });
  });

  describe('Deadline-based Priority', () => {
    it('should handle deadline today', () => {
      const today = new Date().toISOString();
      const task = { title: 'タスク', description: '', deadline: today };
      const result = PriorityEngine.determinePriority(
        task as any,
        defaultConfig.priorityRules,
        undefined
      );
      expect(['P0', 'P1']).toContain(result.priority);
    });
  });
});

describe('Edge Cases: Time Estimation', () => {
  describe('Keyword Matching', () => {
    it('should handle no matching keywords', () => {
      const task = { title: 'xyz123', description: '' };
      const result = TimeEstimator.estimateDuration(task as any);
      expect(result.estimatedMinutes).toBeGreaterThan(0);
    });

    it('should handle conflicting keywords', () => {
      const task = { title: '簡単な実装', description: '' };
      const result = TimeEstimator.estimateDuration(task as any);
      expect(result.estimatedMinutes).toBeGreaterThan(0);
    });
  });

  describe('Estimate Bounds', () => {
    it('should never return negative estimates', () => {
      const tasks = [
        { title: '', description: '' },
        { title: 'x', description: '' },
        { title: '非常に複雑な作業', description: '' },
      ];

      tasks.forEach((task) => {
        const result = TimeEstimator.estimateDuration(task as any);
        expect(result.estimatedMinutes).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have reasonable upper bounds', () => {
      const task = { title: '非常に長い複雑なプロジェクト', description: '' };
      const result = TimeEstimator.estimateDuration(task as any);

      // Should not exceed a reasonable maximum (e.g., 8 hours)
      expect(result.estimatedMinutes).toBeLessThanOrEqual(480);
    });
  });
});

describe('Edge Cases: Stakeholder Extraction', () => {
  describe('Mention Patterns', () => {
    it('should handle @mentions and return valid structure', () => {
      const task = { title: '@tanaka report', description: '' };
      const result = StakeholderExtractor.extractStakeholders(task as any);
      // Should return valid stakeholder result structure
      expect(result).toHaveProperty('stakeholders');
      expect(result).toHaveProperty('managerInvolved');
      expect(Array.isArray(result.stakeholders)).toBe(true);
    });

    it('should handle multiple mentions in one line', () => {
      const task = { title: '@田中 @山田 @鈴木 に連絡', description: '' };
      const result = StakeholderExtractor.extractStakeholders(task as any);
      // Should not throw and return valid result
      expect(Array.isArray(result.stakeholders)).toBe(true);
    });

    it('should return consistent stakeholder arrays', () => {
      const task = { title: 'task description', description: '' };
      const result = StakeholderExtractor.extractStakeholders(task as any);
      const uniqueStakeholders = [...new Set(result.stakeholders)];
      // Should not have duplicates
      expect(uniqueStakeholders.length).toBe(result.stakeholders.length);
    });
  });

  describe('Title Detection', () => {
    it('should detect manager keywords', () => {
      const task = { title: 'マネージャーに報告', description: '' };
      const result = StakeholderExtractor.extractStakeholders(task as any);
      expect(result.managerInvolved).toBe(true);
    });
  });
});

describe('Edge Cases: Configuration', () => {
  describe('Missing Configuration', () => {
    it('should use defaults for empty priority conditions', async () => {
      const partialConfig = {
        ...defaultConfig,
        priorityRules: {
          ...defaultConfig.priorityRules,
          p0Conditions: [],
          p1Conditions: [],
        },
      };

      const result = await TaskAnalyzer.analyzeFromText('タスクを完了', partialConfig);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid Configuration', () => {
    it('should handle unusual priority conditions', async () => {
      const result = await TaskAnalyzer.analyzeFromText('タスク', defaultConfig);
      expect(result.success).toBe(true);
    });
  });
});

describe('Edge Cases: Error Recovery', () => {
  describe('Malformed Input Recovery', () => {
    it('should handle control characters', async () => {
      const input = 'タスク\x00\x01\x02完了';
      const result = await TaskAnalyzer.analyzeFromText(input, defaultConfig);
      expect(result.success).toBe(true);
    });

    it('should handle extremely long lines', async () => {
      const longLine = 'タスク: ' + 'a'.repeat(10000);
      const result = await TaskAnalyzer.analyzeFromText(longLine, defaultConfig);
      expect(result.success).toBe(true);
    });
  });
});
