/**
 * Apple Reminders Service Unit Tests
 * Requirements: 9.1-9.6
 */

import { AppleRemindersService } from '../../src/integrations/apple-reminders.js';
import type { ReminderRequest } from '../../src/integrations/apple-reminders.js';

// Mock run-applescript
jest.mock('run-applescript', () => ({
  runAppleScript: jest.fn(),
}));

describe('AppleRemindersService', () => {
  let service: AppleRemindersService;

  beforeEach(() => {
    service = new AppleRemindersService();
    jest.clearAllMocks();
  });

  describe('detectPlatform', () => {
    it('should detect macOS platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const info = await service.detectPlatform();

      expect(info.platform).toBe('macos');
      expect(info.supportsAppleScript).toBe(true);
      expect(info.recommendedMethod).toBe('applescript');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should detect non-Apple platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const info = await service.detectPlatform();

      expect(info.platform).toBe('unknown');
      expect(info.supportsAppleScript).toBe(false);
      expect(info.recommendedMethod).toBe('fallback');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('isAvailable', () => {
    it('should return true on macOS', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const available = await service.isAvailable();
      expect(available).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should return false on non-Apple platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const available = await service.isAvailable();
      expect(available).toBe(false);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('createReminder', () => {
    const mockRequest: ReminderRequest = {
      title: 'Test Reminder',
      notes: 'Test notes',
      dueDate: '2025-01-15T10:00:00Z',
      list: 'Today',
      priority: 'high',
    };

    it('should create reminder via AppleScript on macOS', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const runAppleScriptModule = require('run-applescript');
      runAppleScriptModule.runAppleScript.mockResolvedValue('reminder-123');

      const result = await service.createReminder(mockRequest);

      expect(result.success).toBe(true);
      expect(result.method).toBe('applescript');
      expect(result.reminderId).toBe('reminder-123');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should return fallback result on non-Apple platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const result = await service.createReminder(mockRequest);

      expect(result.success).toBe(false);
      expect(result.method).toBe('fallback');
      expect(result.fallbackText).toBeDefined();
      expect(result.fallbackText).toContain('Test Reminder');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should handle AppleScript errors gracefully', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const runAppleScriptModule = require('run-applescript');
      runAppleScriptModule.runAppleScript.mockRejectedValue(new Error('AppleScript execution failed'));

      const result = await service.createReminder(mockRequest);

      expect(result.success).toBe(false);
      expect(result.method).toBe('applescript');
      expect(result.error).toContain('AppleScript');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should create reminder without optional fields', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const runAppleScriptModule = require('run-applescript');
      runAppleScriptModule.runAppleScript.mockResolvedValue('reminder-456');

      const minimalRequest: ReminderRequest = {
        title: 'Minimal Reminder',
      };

      const result = await service.createReminder(minimalRequest);

      expect(result.success).toBe(true);
      expect(result.reminderId).toBe('reminder-456');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('buildAppleScript', () => {
    it('should build correct AppleScript for full request', () => {
      const request: ReminderRequest = {
        title: 'Full Reminder',
        notes: 'With notes',
        dueDate: '2025-01-20T14:00:00Z',
        list: 'Work',
        priority: 'high',
      };

      const script = service.buildAppleScript(request);

      expect(script).toContain('tell application "Reminders"');
      expect(script).toContain('Full Reminder');
      expect(script).toContain('With notes');
      expect(script).toContain('Work');
    });

    it('should use default list when not specified', () => {
      const request: ReminderRequest = {
        title: 'No List Reminder',
      };

      const script = service.buildAppleScript(request);

      expect(script).toContain('Reminders'); // Default list
    });

    it('should escape special characters in title and notes', () => {
      const request: ReminderRequest = {
        title: 'Test "quoted" reminder',
        notes: 'Notes with "quotes" and \\backslash',
      };

      const script = service.buildAppleScript(request);

      // Should escape double quotes
      expect(script).toContain('\\"');
    });
  });

  describe('generateFallbackText', () => {
    it('should generate formatted text for manual copy', () => {
      const request: ReminderRequest = {
        title: 'Fallback Reminder',
        notes: 'Some notes',
        dueDate: '2025-01-25T09:00:00Z',
        priority: 'medium',
      };

      const text = service.generateFallbackText(request);

      expect(text).toContain('Fallback Reminder');
      expect(text).toContain('Some notes');
      expect(text).toContain('2025');
      expect(text).toContain('Apple Reminders');
    });

    it('should handle minimal request', () => {
      const request: ReminderRequest = {
        title: 'Simple Task',
      };

      const text = service.generateFallbackText(request);

      expect(text).toContain('Simple Task');
    });
  });

  describe('mapPriority', () => {
    it('should map high priority to 1', () => {
      expect(service.mapPriority('high')).toBe(1);
    });

    it('should map medium priority to 5', () => {
      expect(service.mapPriority('medium')).toBe(5);
    });

    it('should map low priority to 9', () => {
      expect(service.mapPriority('low')).toBe(9);
    });

    it('should default to 0 (no priority)', () => {
      expect(service.mapPriority(undefined)).toBe(0);
    });
  });
});
