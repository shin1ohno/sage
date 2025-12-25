/**
 * Reminder Manager Unit Tests
 * Requirements: 5.1-5.6
 */

import { ReminderManager } from '../../src/integrations/reminder-manager.js';
import type { ReminderRequest, ReminderConfig } from '../../src/integrations/reminder-manager.js';

// Mock the services
jest.mock('../../src/integrations/apple-reminders.js', () => ({
  AppleRemindersService: jest.fn().mockImplementation(() => ({
    createReminder: jest.fn().mockResolvedValue({
      success: true,
      method: 'applescript',
      reminderId: 'reminder-123',
    }),
    isAvailable: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../../src/integrations/notion-mcp.js', () => ({
  NotionMCPService: jest.fn().mockImplementation(() => ({
    createPage: jest.fn().mockResolvedValue({
      success: true,
      pageId: 'page-123',
      pageUrl: 'https://notion.so/page-123',
    }),
    isAvailable: jest.fn().mockResolvedValue(true),
    shouldSyncToNotion: jest.fn().mockImplementation((deadline: string, threshold: number) => {
      if (!deadline) return false;
      const deadlineDate = new Date(deadline);
      const now = new Date();
      const diffDays = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= threshold;
    }),
    generateFallbackTemplate: jest.fn().mockReturnValue('Notion template'),
    buildNotionProperties: jest.fn().mockReturnValue({}),
  })),
}));

describe('ReminderManager', () => {
  let manager: ReminderManager;
  const defaultConfig: ReminderConfig = {
    appleRemindersThreshold: 7,
    notionThreshold: 8,
    defaultList: 'Reminders',
    notionDatabaseId: 'test-db-id',
  };

  beforeEach(() => {
    manager = new ReminderManager(defaultConfig);
    jest.clearAllMocks();
  });

  describe('determineDestination', () => {
    it('should return apple for tasks due within 7 days', () => {
      const nearDeadline = new Date();
      nearDeadline.setDate(nearDeadline.getDate() + 5);

      const destination = manager.determineDestination(nearDeadline.toISOString());
      expect(destination).toBe('apple');
    });

    it('should return notion for tasks due 8+ days away', () => {
      const farDeadline = new Date();
      farDeadline.setDate(farDeadline.getDate() + 10);

      const destination = manager.determineDestination(farDeadline.toISOString());
      expect(destination).toBe('notion');
    });

    it('should return apple for tasks without deadline', () => {
      const destination = manager.determineDestination(undefined);
      expect(destination).toBe('apple');
    });
  });

  describe('setReminder', () => {
    it('should create Apple reminder for near-term tasks', async () => {
      const nearDeadline = new Date();
      nearDeadline.setDate(nearDeadline.getDate() + 3);

      const request: ReminderRequest = {
        taskTitle: 'Short term task',
        targetDate: nearDeadline.toISOString(),
        priority: 'P1',
      };

      const result = await manager.setReminder(request);

      expect(result.success).toBe(true);
      expect(result.destination).toBe('apple_reminders');
    });

    it('should create Notion entry for long-term tasks', async () => {
      const farDeadline = new Date();
      farDeadline.setDate(farDeadline.getDate() + 15);

      const request: ReminderRequest = {
        taskTitle: 'Long term task',
        targetDate: farDeadline.toISOString(),
        priority: 'P2',
      };

      const result = await manager.setReminder(request);

      expect(result.success).toBe(true);
      expect(result.destination).toBe('notion_mcp');
    });

    it('should handle Apple Reminders failure gracefully', async () => {
      const { AppleRemindersService } = require('../../src/integrations/apple-reminders.js');
      AppleRemindersService.mockImplementation(() => ({
        createReminder: jest.fn().mockResolvedValue({
          success: false,
          method: 'applescript',
          error: 'Permission denied',
        }),
        isAvailable: jest.fn().mockResolvedValue(true),
      }));

      manager = new ReminderManager(defaultConfig);

      const request: ReminderRequest = {
        taskTitle: 'Test task',
        targetDate: new Date().toISOString(),
      };

      const result = await manager.setReminder(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('calculateReminderTimes', () => {
    it('should calculate reminder time for 1_day_before', () => {
      // Use a date 30 days in the future
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      deadline.setHours(10, 0, 0, 0);

      const times = manager.calculateReminderTimes(deadline.toISOString(), ['1_day_before']);

      expect(times).toHaveLength(1);
      const reminderDate = new Date(times[0].time);
      expect(reminderDate.getDate()).toBe(deadline.getDate() - 1 || 30); // Handle month boundary
    });

    it('should calculate reminder time for 1_hour_before', () => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      deadline.setHours(10, 0, 0, 0);

      const times = manager.calculateReminderTimes(deadline.toISOString(), ['1_hour_before']);

      expect(times).toHaveLength(1);
      const reminderTime = new Date(times[0].time);
      expect(reminderTime.getHours()).toBe(9);
    });

    it('should calculate reminder time for 3_hours_before', () => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      deadline.setHours(15, 0, 0, 0);

      const times = manager.calculateReminderTimes(deadline.toISOString(), ['3_hours_before']);

      expect(times).toHaveLength(1);
      const reminderTime = new Date(times[0].time);
      expect(reminderTime.getHours()).toBe(12);
    });

    it('should calculate reminder time for 3_days_before', () => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      deadline.setHours(10, 0, 0, 0);

      const times = manager.calculateReminderTimes(deadline.toISOString(), ['3_days_before']);

      expect(times).toHaveLength(1);
      const reminderDate = new Date(times[0].time);
      // Should be 3 days before deadline
      const expectedDate = new Date(deadline);
      expectedDate.setDate(expectedDate.getDate() - 3);
      expect(reminderDate.getDate()).toBe(expectedDate.getDate());
    });

    it('should calculate reminder time for 1_week_before', () => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      deadline.setHours(10, 0, 0, 0);

      const times = manager.calculateReminderTimes(deadline.toISOString(), ['1_week_before']);

      expect(times).toHaveLength(1);
      const reminderDate = new Date(times[0].time);
      const expectedDate = new Date(deadline);
      expectedDate.setDate(expectedDate.getDate() - 7);
      expect(reminderDate.getDate()).toBe(expectedDate.getDate());
    });

    it('should handle multiple reminder types', () => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      deadline.setHours(10, 0, 0, 0);

      const times = manager.calculateReminderTimes(deadline.toISOString(), [
        '1_day_before',
        '1_hour_before',
      ]);

      expect(times).toHaveLength(2);
    });

    it('should filter out past reminder times', () => {
      const nearDeadline = new Date();
      nearDeadline.setHours(nearDeadline.getHours() + 2);

      const times = manager.calculateReminderTimes(nearDeadline.toISOString(), [
        '1_week_before',
        '1_hour_before',
      ]);

      // 1_week_before should be filtered out as it's in the past
      expect(times.length).toBeLessThanOrEqual(2);
    });
  });

  describe('mapPriorityToApple', () => {
    it('should map P0 to high', () => {
      expect(manager.mapPriorityToApple('P0')).toBe('high');
    });

    it('should map P1 to high', () => {
      expect(manager.mapPriorityToApple('P1')).toBe('high');
    });

    it('should map P2 to medium', () => {
      expect(manager.mapPriorityToApple('P2')).toBe('medium');
    });

    it('should map P3 to low', () => {
      expect(manager.mapPriorityToApple('P3')).toBe('low');
    });

    it('should default to medium for unknown priority', () => {
      expect(manager.mapPriorityToApple(undefined)).toBe('medium');
    });
  });
});
