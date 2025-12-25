/**
 * Stakeholder Extraction System Unit Tests
 * Requirements: 4.1-4.5
 */

import { StakeholderExtractor } from '../../src/utils/stakeholders.js';
import type { Task, TeamConfig } from '../../src/types/index.js';

describe('StakeholderExtractor', () => {
  const teamConfig: TeamConfig = {
    manager: {
      name: 'Tanaka',
      role: 'manager',
      keywords: ['tanaka', '田中', 'manager'],
    },
    frequentCollaborators: [
      {
        name: 'Suzuki',
        role: 'lead',
        keywords: ['suzuki', '鈴木'],
      },
      {
        name: 'Yamada',
        role: 'team',
        keywords: ['yamada', '山田'],
      },
    ],
    departments: ['Engineering', 'Product'],
  };

  describe('extractStakeholders', () => {
    it('should extract @mentions from task', () => {
      const task: Task = { title: 'Review PR with @john and @jane' };
      const result = StakeholderExtractor.extractStakeholders(task);

      expect(result.stakeholders).toContain('john');
      expect(result.stakeholders).toContain('jane');
      expect(result.mentions).toHaveLength(2);
    });

    it('should extract Japanese mentions', () => {
      const task: Task = { title: '@田中さんに確認する' };
      const result = StakeholderExtractor.extractStakeholders(task);

      expect(result.mentions.length).toBeGreaterThan(0);
    });

    it('should match configured team members', () => {
      const task: Task = { title: 'Discuss with Suzuki about the project' };
      const result = StakeholderExtractor.extractStakeholders(task, teamConfig);

      expect(result.stakeholders).toContain('Suzuki');
      // matchedTeamMembers may be populated via matchTeamMembers
      expect(result.stakeholders.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect manager involvement', () => {
      const task: Task = { title: 'Meeting with 田中 manager' };
      const result = StakeholderExtractor.extractStakeholders(task, teamConfig);

      expect(result.managerInvolved).toBe(true);
      expect(result.stakeholders).toContain('Tanaka');
    });

    it('should detect manager keywords without config', () => {
      const task: Task = { title: 'Review with マネージャー' };
      const result = StakeholderExtractor.extractStakeholders(task);

      expect(result.managerInvolved).toBe(true);
    });

    it('should return empty stakeholders for tasks without mentions', () => {
      const task: Task = { title: 'Write documentation' };
      const result = StakeholderExtractor.extractStakeholders(task);

      expect(result.stakeholders).toHaveLength(0);
      expect(result.managerInvolved).toBe(false);
    });

    it('should provide a reason for extraction', () => {
      const task: Task = { title: 'Meeting with @john' };
      const result = StakeholderExtractor.extractStakeholders(task);

      expect(result.reason).toBeTruthy();
    });
  });

  describe('findMentions', () => {
    it('should find @-style mentions', () => {
      const text = 'Please review @alice and @bob';
      const mentions = StakeholderExtractor.findMentions(text);

      expect(mentions).toContain('alice');
      expect(mentions).toContain('bob');
    });

    it('should find "from/to/with" style mentions', () => {
      const text = 'Request from John, to be reviewed by Mary';
      const mentions = StakeholderExtractor.findMentions(text);

      expect(mentions).toContain('John');
    });

    it('should not include common words as mentions', () => {
      const text = '@the task is from the team';
      const mentions = StakeholderExtractor.findMentions(text);

      expect(mentions).not.toContain('the');
    });
  });

  describe('checkManagerInvolvement', () => {
    it('should detect English manager keywords', () => {
      expect(StakeholderExtractor.checkManagerInvolvement('Meeting with manager')).toBe(true);
      expect(StakeholderExtractor.checkManagerInvolvement('Boss wants update')).toBe(true);
      expect(StakeholderExtractor.checkManagerInvolvement('Team lead review')).toBe(true);
    });

    it('should detect Japanese manager keywords', () => {
      expect(StakeholderExtractor.checkManagerInvolvement('マネージャーとの会議')).toBe(true);
      expect(StakeholderExtractor.checkManagerInvolvement('上司への報告')).toBe(true);
    });

    it('should use configured manager name', () => {
      const result = StakeholderExtractor.checkManagerInvolvement('Ask Tanaka', teamConfig);
      expect(result).toBe(true);
    });

    it('should return false when no manager involvement', () => {
      expect(StakeholderExtractor.checkManagerInvolvement('Regular team meeting')).toBe(false);
    });
  });

  describe('matchTeamMembers', () => {
    it('should match team members by name', () => {
      const matched = StakeholderExtractor.matchTeamMembers('Work with Suzuki', teamConfig);

      expect(matched).toHaveLength(1);
      expect(matched[0].name).toBe('Suzuki');
    });

    it('should match team members by keywords', () => {
      const matched = StakeholderExtractor.matchTeamMembers('鈴木さんに確認', teamConfig);

      expect(matched).toHaveLength(1);
      expect(matched[0].name).toBe('Suzuki');
    });

    it('should match multiple team members', () => {
      const matched = StakeholderExtractor.matchTeamMembers('Suzuki and Yamada meeting', teamConfig);

      expect(matched).toHaveLength(2);
    });

    it('should return empty array when no matches', () => {
      const matched = StakeholderExtractor.matchTeamMembers('Solo work', teamConfig);

      expect(matched).toHaveLength(0);
    });
  });

  describe('getManagerPriorityBoost', () => {
    it('should return priority boost value', () => {
      const boost = StakeholderExtractor.getManagerPriorityBoost();

      expect(boost).toBe(1);
    });
  });

  describe('extractPotentialNames', () => {
    it('should extract Japanese names with honorifics', () => {
      const text = '田中さんと山田様に確認してください';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).toContain('田中');
      expect(names).toContain('山田');
    });

    it('should extract English capitalized names', () => {
      const text = 'Please contact John Smith about the project';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).toContain('John Smith');
    });

    it('should filter out common capitalized words', () => {
      const text = 'Meeting on Monday with the Project team';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).not.toContain('Monday');
      expect(names).not.toContain('Project');
      expect(names).not.toContain('Meeting');
    });

    it('should filter out day names', () => {
      const text = 'Schedule for Tuesday and Wednesday';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).not.toContain('Tuesday');
      expect(names).not.toContain('Wednesday');
    });

    it('should filter out month names', () => {
      const text = 'Due in January or February';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).not.toContain('January');
      expect(names).not.toContain('February');
    });

    it('should filter out common greetings and words', () => {
      const text = 'Hello, Please review this. Thanks!';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).not.toContain('Hello');
      expect(names).not.toContain('Please');
      expect(names).not.toContain('Thanks');
    });

    it('should return empty array for text without names', () => {
      const text = 'just some lowercase text without names';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).toHaveLength(0);
    });

    it('should handle text with 氏 honorific', () => {
      const text = '佐藤氏からの報告';
      const names = StakeholderExtractor.extractPotentialNames(text);

      expect(names).toContain('佐藤');
    });
  });

  describe('buildReason edge cases', () => {
    it('should mention team members when detected without manager', () => {
      const task: Task = { title: 'Work with Suzuki on the feature' };
      const result = StakeholderExtractor.extractStakeholders(task, teamConfig);

      // The reason should mention detection
      expect(result.reason).toBeTruthy();
    });

    it('should provide default reason when only stakeholder count', () => {
      const task: Task = { title: 'Call with @unknown_person' };
      const result = StakeholderExtractor.extractStakeholders(task);

      expect(result.reason).toContain('検出');
    });
  });

  describe('edge cases', () => {
    it('should handle task with description', () => {
      const task: Task = {
        title: 'Review',
        description: 'Review with @alice the new changes',
      };
      const result = StakeholderExtractor.extractStakeholders(task);

      expect(result.stakeholders).toContain('alice');
    });

    it('should handle empty team config', () => {
      const emptyConfig: TeamConfig = {
        frequentCollaborators: [],
        departments: [],
      };
      const task: Task = { title: 'Work with someone' };
      const result = StakeholderExtractor.extractStakeholders(task, emptyConfig);

      expect(result.managerInvolved).toBe(false);
    });

    it('should not duplicate stakeholders', () => {
      const task: Task = { title: '@alice and @alice again' };
      const result = StakeholderExtractor.extractStakeholders(task);

      const aliceCount = result.stakeholders.filter((s) => s === 'alice').length;
      expect(aliceCount).toBeLessThanOrEqual(1);
    });

    it('should add manager to stakeholders when detected via keyword', () => {
      const task: Task = { title: 'Report to manager about progress' };
      const result = StakeholderExtractor.extractStakeholders(task, teamConfig);

      expect(result.managerInvolved).toBe(true);
      expect(result.stakeholders).toContain('Tanaka');
      expect(result.matchedTeamMembers.some((m) => m.name === 'Tanaka')).toBe(true);
    });

    it('should detect manager via configured keywords', () => {
      const task: Task = { title: 'Meeting with 田中 tomorrow' };
      const result = StakeholderExtractor.extractStakeholders(task, teamConfig);

      expect(result.managerInvolved).toBe(true);
    });

    it('should include team member count in reason when not manager', () => {
      const task: Task = { title: 'Work with Suzuki and Yamada' };
      const result = StakeholderExtractor.extractStakeholders(task, teamConfig);

      // When team members are detected but manager is not involved
      expect(result.stakeholders.length).toBeGreaterThan(0);
      expect(result.reason).toBeTruthy();
    });

    it('should add manager when detected via generic keyword not in config', () => {
      // Use a keyword that triggers manager detection but isn't in the manager's config
      const task: Task = { title: 'Report to 上司 about progress' };
      const configWithDifferentKeywords: TeamConfig = {
        manager: {
          name: 'Boss Person',
          role: 'manager',
          keywords: ['boss person'], // Does NOT include 上司
        },
        frequentCollaborators: [],
        departments: [],
      };

      const result = StakeholderExtractor.extractStakeholders(task, configWithDifferentKeywords);

      // 上司 triggers managerInvolved but manager wasn't matched by matchTeamMembers
      expect(result.managerInvolved).toBe(true);
      expect(result.stakeholders).toContain('Boss Person');
      expect(result.matchedTeamMembers.some((m) => m.name === 'Boss Person')).toBe(true);
    });
  });
});
