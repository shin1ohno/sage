/**
 * Calendar Service Unit Tests
 * Requirements: 6.1-6.9
 *
 * Tests for EventKit-based calendar integration on macOS
 */

import { CalendarService } from '../../src/integrations/calendar-service.js';
import type { CalendarEvent, AvailableSlot } from '../../src/integrations/calendar-service.js';

// Mock run-applescript (used to execute EventKit via AppleScriptObjC)
jest.mock('run-applescript', () => ({
  runAppleScript: jest.fn(),
}));

describe('CalendarService', () => {
  let service: CalendarService;

  beforeEach(() => {
    service = new CalendarService();
    jest.clearAllMocks();
  });

  describe('detectPlatform', () => {
    it('should detect macOS platform with EventKit method', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const info = await service.detectPlatform();

      expect(info.platform).toBe('macos');
      expect(info.recommendedMethod).toBe('eventkit');
      expect(info.availableMethods).toContain('eventkit');
      expect(info.hasNativeAccess).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should detect non-Apple platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const info = await service.detectPlatform();

      expect(info.platform).toBe('unknown');
      expect(info.recommendedMethod).toBe('manual_input');
      expect(info.hasNativeAccess).toBe(false);

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

  describe('fetchEvents', () => {
    it('should fetch events via EventKit on macOS', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const runAppleScriptModule = require('run-applescript');
      // EventKit format includes isAllDay field
      runAppleScriptModule.runAppleScript.mockResolvedValue(
        'Meeting|2025-01-15T10:00:00|2025-01-15T11:00:00|event-1|false\n' +
          'Lunch|2025-01-15T12:00:00|2025-01-15T13:00:00|event-2|false'
      );

      const events = await service.fetchEvents('2025-01-15', '2025-01-16');

      expect(events).toHaveLength(2);
      expect(events[0].title).toBe('Meeting');
      expect(events[0].source).toBe('eventkit');
      expect(events[0].isAllDay).toBe(false);
      expect(events[1].title).toBe('Lunch');
      expect(events[1].source).toBe('eventkit');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should correctly parse isAllDay field from EventKit', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const runAppleScriptModule = require('run-applescript');
      runAppleScriptModule.runAppleScript.mockResolvedValue(
        'Holiday|2025-01-15T00:00:00|2025-01-15T23:59:59|event-allday|true'
      );

      const events = await service.fetchEvents('2025-01-15', '2025-01-16');

      expect(events).toHaveLength(1);
      expect(events[0].isAllDay).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should return empty array on non-Apple platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const events = await service.fetchEvents('2025-01-15', '2025-01-16');

      expect(events).toHaveLength(0);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should handle EventKit errors gracefully', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      const runAppleScriptModule = require('run-applescript');
      runAppleScriptModule.runAppleScript.mockRejectedValue(new Error('Calendar access denied'));

      const events = await service.fetchEvents('2025-01-15', '2025-01-16');

      expect(events).toHaveLength(0);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('findAvailableSlots', () => {
    const mockEvents: CalendarEvent[] = [
      {
        id: 'event-1',
        title: 'Morning Meeting',
        start: '2025-01-15T09:00:00',
        end: '2025-01-15T10:00:00',
        isAllDay: false,
        source: 'eventkit',
      },
      {
        id: 'event-2',
        title: 'Lunch',
        start: '2025-01-15T12:00:00',
        end: '2025-01-15T13:00:00',
        isAllDay: false,
        source: 'eventkit',
      },
    ];

    it('should find available slots between events', () => {
      const workingHours = { start: '09:00', end: '18:00' };
      const slots = service.findAvailableSlotsFromEvents(mockEvents, 60, workingHours, '2025-01-15');

      // Should find slots: 10:00-12:00 and 13:00-18:00
      expect(slots.length).toBeGreaterThan(0);
      // Check that we found a slot after the first meeting (10:00)
      const firstSlot = slots[0];
      expect(firstSlot.durationMinutes).toBeGreaterThanOrEqual(60);
      expect(firstSlot.source).toBe('eventkit');
    });

    it('should respect task duration', () => {
      const workingHours = { start: '09:00', end: '18:00' };
      const slots = service.findAvailableSlotsFromEvents(mockEvents, 180, workingHours, '2025-01-15');

      // 3-hour slots are harder to find
      slots.forEach((slot) => {
        expect(slot.durationMinutes).toBeGreaterThanOrEqual(180);
        expect(slot.source).toBe('eventkit');
      });
    });

    it('should return empty array when no slots available', () => {
      const busyDay: CalendarEvent[] = [
        {
          id: 'all-day',
          title: 'All Day Event',
          start: '2025-01-15T00:00:00',
          end: '2025-01-15T23:59:59',
          isAllDay: true,
          source: 'eventkit',
        },
      ];

      const workingHours = { start: '09:00', end: '18:00' };
      const slots = service.findAvailableSlotsFromEvents(busyDay, 60, workingHours, '2025-01-15');

      expect(slots).toHaveLength(0);
    });
  });

  describe('calculateSuitability', () => {
    it('should mark deep work days as excellent', () => {
      const slot: AvailableSlot = {
        start: '2025-01-15T10:00:00',
        end: '2025-01-15T12:00:00',
        durationMinutes: 120,
        suitability: 'good',
        reason: '',
        conflicts: [],
        dayType: 'normal',
        source: 'eventkit',
      };

      const config = {
        deepWorkDays: ['Wednesday'],
        meetingHeavyDays: ['Monday', 'Friday'],
      };

      // January 15, 2025 is a Wednesday
      const suitability = service.calculateSuitability(slot, config);

      expect(suitability.suitability).toBe('excellent');
      expect(suitability.dayType).toBe('deep-work');
    });

    it('should mark meeting-heavy days as acceptable', () => {
      const slot: AvailableSlot = {
        start: '2025-01-13T10:00:00', // Monday
        end: '2025-01-13T12:00:00',
        durationMinutes: 120,
        suitability: 'good',
        reason: '',
        conflicts: [],
        dayType: 'normal',
        source: 'eventkit',
      };

      const config = {
        deepWorkDays: ['Wednesday'],
        meetingHeavyDays: ['Monday', 'Friday'],
      };

      const suitability = service.calculateSuitability(slot, config);

      expect(suitability.suitability).toBe('acceptable');
      expect(suitability.dayType).toBe('meeting-heavy');
    });
  });

  describe('parseEventKitResult', () => {
    it('should parse EventKit output correctly with isAllDay field', () => {
      const output = 'Meeting|2025-01-15T10:00:00|2025-01-15T11:00:00|event-1|false';
      const events = service.parseEventKitResult(output);

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Meeting');
      expect(events[0].id).toBe('event-1');
      expect(events[0].isAllDay).toBe(false);
      expect(events[0].source).toBe('eventkit');
    });

    it('should parse EventKit output with isAllDay true', () => {
      const output = 'Holiday|2025-01-15T00:00:00|2025-01-15T23:59:59|event-holiday|true';
      const events = service.parseEventKitResult(output);

      expect(events).toHaveLength(1);
      expect(events[0].isAllDay).toBe(true);
    });

    it('should handle legacy format without isAllDay field', () => {
      const output = 'Meeting|2025-01-15T10:00:00|2025-01-15T11:00:00|event-1';
      const events = service.parseEventKitResult(output);

      expect(events).toHaveLength(1);
      expect(events[0].isAllDay).toBe(false); // defaults to false
    });

    it('should handle empty output', () => {
      const events = service.parseEventKitResult('');
      expect(events).toHaveLength(0);
    });

    it('should handle malformed lines', () => {
      const output = 'Meeting|2025-01-15T10:00:00\nValid|2025-01-15T12:00:00|2025-01-15T13:00:00|event-2|false';
      const events = service.parseEventKitResult(output);

      // Should only parse valid lines
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Valid');
    });
  });

  describe('generateManualInputPrompt', () => {
    it('should generate user-friendly prompt', () => {
      const prompt = service.generateManualInputPrompt('2025-01-15', '2025-01-20');

      expect(prompt).toContain('カレンダー');
      expect(prompt).toContain('2025-01-15');
      expect(prompt).toContain('2025-01-20');
    });
  });
});
