/**
 * ConfigDiffer utility tests
 */

import { describe, expect, test } from '@jest/globals';
import { diffConfig, hasSignificantChanges } from '../../src/config/config-differ.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';

/**
 * Create a deep copy of an object
 */
function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

describe('ConfigDiffer', () => {
  describe('diffConfig', () => {
    test('should return empty diff for identical configs', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toEqual([]);
      expect(diff.addedKeys).toEqual({});
      expect(diff.removedKeys).toEqual([]);
      expect(diff.modifiedKeys).toEqual({});
    });

    test('should detect changes in user section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.user.name = 'New Name';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('user');
      expect(diff.modifiedKeys['user.name']).toEqual({
        old: '',
        new: 'New Name',
      });
    });

    test('should detect changes in calendar section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.calendar.workingHours.start = '08:00';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('calendar');
      expect(diff.modifiedKeys['calendar.workingHours.start']).toEqual({
        old: '09:00',
        new: '08:00',
      });
    });

    test('should detect changes in priorityRules section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.priorityRules.defaultPriority = 'P2';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('priorityRules');
      expect(diff.modifiedKeys['priorityRules.defaultPriority']).toEqual({
        old: 'P3',
        new: 'P2',
      });
    });

    test('should detect changes in estimation section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.estimation.simpleTaskMinutes = 30;

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('estimation');
      expect(diff.modifiedKeys['estimation.simpleTaskMinutes']).toEqual({
        old: 25,
        new: 30,
      });
    });

    test('should detect changes in reminders section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.reminders.weeklyReview.enabled = false;

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('reminders');
      expect(diff.modifiedKeys['reminders.weeklyReview.enabled']).toEqual({
        old: true,
        new: false,
      });
    });

    test('should detect changes in team section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.team.departments = ['Engineering', 'Design'];

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('team');
      expect(diff.modifiedKeys['team.departments']).toEqual({
        old: [],
        new: ['Engineering', 'Design'],
      });
    });

    test('should detect changes in integrations section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.integrations.notion.enabled = true;

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('integrations');
      expect(diff.modifiedKeys['integrations.notion.enabled']).toEqual({
        old: false,
        new: true,
      });
    });

    test('should detect changes in preferences section', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.preferences.language = 'en';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('preferences');
      expect(diff.modifiedKeys['preferences.language']).toEqual({
        old: 'ja',
        new: 'en',
      });
    });

    test('should detect multiple changed sections', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.user.name = 'New Name';
      config2.preferences.language = 'en';
      config2.calendar.workingHours.end = '19:00';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('user');
      expect(diff.changedSections).toContain('preferences');
      expect(diff.changedSections).toContain('calendar');
      expect(diff.changedSections.length).toBe(3);
    });

    test('should detect added keys when new property is added', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      // Add a new property to user section
      (config2.user as unknown as Record<string, unknown>).newProperty = 'value';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('user');
      expect(diff.addedKeys['user.newProperty']).toBe('value');
    });

    test('should detect removed keys when property is removed', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      // Add a property to config1 that doesn't exist in config2
      (config1.user as unknown as Record<string, unknown>).extraProperty = 'value';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('user');
      expect(diff.removedKeys).toContain('user.extraProperty');
    });

    test('should detect version changes in modifiedKeys', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.version = '2.0.0';

      const diff = diffConfig(config1, config2);

      expect(diff.modifiedKeys['version']).toEqual({
        old: '1.0.0',
        new: '2.0.0',
      });
    });

    test('should handle array changes correctly', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.calendar.meetingHeavyDays = ['Monday', 'Wednesday'];

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('calendar');
      expect(diff.modifiedKeys['calendar.meetingHeavyDays']).toEqual({
        old: ['Tuesday', 'Thursday'],
        new: ['Monday', 'Wednesday'],
      });
    });

    test('should handle nested object changes correctly', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.integrations.appleReminders.threshold = 14;
      config2.integrations.appleReminders.defaultList = 'Work';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('integrations');
      expect(diff.modifiedKeys['integrations.appleReminders.threshold']).toEqual({
        old: 7,
        new: 14,
      });
      expect(diff.modifiedKeys['integrations.appleReminders.defaultList']).toEqual({
        old: 'Reminders',
        new: 'Work',
      });
    });

    test('should handle deeply nested changes', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);

      // Add a deep work block
      config2.calendar.deepWorkBlocks = [
        {
          day: 'Monday',
          startHour: 9,
          endHour: 12,
          description: 'Morning focus time',
        },
      ];

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('calendar');
      expect(diff.modifiedKeys['calendar.deepWorkBlocks']).toBeDefined();
    });
  });

  describe('hasSignificantChanges', () => {
    test('should return false for empty diff', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: [],
        modifiedKeys: {},
      };

      expect(hasSignificantChanges(diff)).toBe(false);
    });

    test('should return true when changedSections is not empty', () => {
      const diff = {
        changedSections: ['user'],
        addedKeys: {},
        removedKeys: [],
        modifiedKeys: {},
      };

      expect(hasSignificantChanges(diff)).toBe(true);
    });

    test('should return true when addedKeys has non-metadata keys', () => {
      const diff = {
        changedSections: [],
        addedKeys: { 'user.newProperty': 'value' },
        removedKeys: [],
        modifiedKeys: {},
      };

      expect(hasSignificantChanges(diff)).toBe(true);
    });

    test('should return true when removedKeys has non-metadata keys', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: ['user.oldProperty'],
        modifiedKeys: {},
      };

      expect(hasSignificantChanges(diff)).toBe(true);
    });

    test('should return true when modifiedKeys has non-metadata keys', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: [],
        modifiedKeys: { 'user.name': { old: 'old', new: 'new' } },
      };

      expect(hasSignificantChanges(diff)).toBe(true);
    });

    test('should return false when only version is changed', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: [],
        modifiedKeys: { version: { old: '1.0.0', new: '2.0.0' } },
      };

      expect(hasSignificantChanges(diff)).toBe(false);
    });

    test('should return false when only createdAt is changed', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: [],
        modifiedKeys: { createdAt: { old: '2024-01-01', new: '2024-01-02' } },
      };

      expect(hasSignificantChanges(diff)).toBe(false);
    });

    test('should return false when only lastUpdated is changed', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: [],
        modifiedKeys: { lastUpdated: { old: '2024-01-01', new: '2024-01-02' } },
      };

      expect(hasSignificantChanges(diff)).toBe(false);
    });

    test('should return false when only metadata keys are in addedKeys', () => {
      const diff = {
        changedSections: [],
        addedKeys: { version: '1.0.0' },
        removedKeys: [],
        modifiedKeys: {},
      };

      expect(hasSignificantChanges(diff)).toBe(false);
    });

    test('should return false when only metadata keys are in removedKeys', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: ['lastUpdated'],
        modifiedKeys: {},
      };

      expect(hasSignificantChanges(diff)).toBe(false);
    });

    test('should return true when metadata and non-metadata keys are changed', () => {
      const diff = {
        changedSections: [],
        addedKeys: {},
        removedKeys: [],
        modifiedKeys: {
          version: { old: '1.0.0', new: '2.0.0' },
          'user.name': { old: 'old', new: 'new' },
        },
      };

      expect(hasSignificantChanges(diff)).toBe(true);
    });

    test('should handle real-world diff from diffConfig', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.user.name = 'John Doe';

      const diff = diffConfig(config1, config2);

      expect(hasSignificantChanges(diff)).toBe(true);
    });

    test('should return false for identical configs through diffConfig', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);

      const diff = diffConfig(config1, config2);

      expect(hasSignificantChanges(diff)).toBe(false);
    });
  });

  describe('deep equality edge cases', () => {
    test('should handle null values correctly', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);

      // Set manager to null in one config
      config1.team.manager = {
        name: 'Manager',
        role: 'manager',
        keywords: ['urgent'],
      };
      config2.team.manager = undefined;

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('team');
    });

    test('should handle empty arrays vs non-empty arrays', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.team.departments = ['Engineering'];

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('team');
      expect(diff.modifiedKeys['team.departments']).toEqual({
        old: [],
        new: ['Engineering'],
      });
    });

    test('should handle empty objects vs populated objects', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.integrations.appleReminders.lists = { Work: 'work-list-id' };

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('integrations');
    });

    test('should handle boolean changes', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.integrations.appleReminders.enabled = false;

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('integrations');
      expect(diff.modifiedKeys['integrations.appleReminders.enabled']).toEqual({
        old: true,
        new: false,
      });
    });

    test('should handle number changes', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.estimation.mediumTaskMinutes = 60;

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('estimation');
      expect(diff.modifiedKeys['estimation.mediumTaskMinutes']).toEqual({
        old: 50,
        new: 60,
      });
    });

    test('should handle string changes', () => {
      const config1 = deepCopy(DEFAULT_CONFIG);
      const config2 = deepCopy(DEFAULT_CONFIG);
      config2.preferences.dateFormat = 'DD/MM/YYYY';

      const diff = diffConfig(config1, config2);

      expect(diff.changedSections).toContain('preferences');
      expect(diff.modifiedKeys['preferences.dateFormat']).toEqual({
        old: 'YYYY-MM-DD',
        new: 'DD/MM/YYYY',
      });
    });
  });
});
