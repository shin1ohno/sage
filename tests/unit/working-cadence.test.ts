/**
 * WorkingCadenceService Tests
 * TDD: Tests written first, implementation follows
 */

import { WorkingCadenceService } from '../../src/services/working-cadence.js';
import { ConfigLoader } from '../../src/config/loader.js';
import type { UserConfig } from '../../src/types/config.js';

// Mock ConfigLoader
jest.mock('../../src/config/loader.js');
const MockedConfigLoader = ConfigLoader as jest.Mocked<typeof ConfigLoader>;

describe('WorkingCadenceService', () => {
  let service: WorkingCadenceService;

  const mockConfig: UserConfig = {
    version: '1.0.0',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastUpdated: '2025-01-01T00:00:00.000Z',
    user: {
      name: '田中太郎',
      email: 'tanaka@example.com',
      timezone: 'Asia/Tokyo',
      role: 'Engineer',
    },
    calendar: {
      workingHours: {
        start: '09:00',
        end: '18:00',
      },
      meetingHeavyDays: ['Tuesday', 'Thursday'],
      deepWorkDays: ['Monday', 'Wednesday', 'Friday'],
      deepWorkBlocks: [
        {
          day: 'Monday',
          startHour: 9,
          endHour: 12,
          description: '午前集中時間',
        },
        {
          day: 'Wednesday',
          startHour: 14,
          endHour: 17,
          description: '午後集中時間',
        },
      ],
      timeZone: 'Asia/Tokyo',
    },
    priorityRules: {
      p0Conditions: [],
      p1Conditions: [],
      p2Conditions: [],
      defaultPriority: 'P3',
    },
    estimation: {
      simpleTaskMinutes: 25,
      mediumTaskMinutes: 50,
      complexTaskMinutes: 90,
      projectTaskMinutes: 180,
      keywordMapping: {
        simple: [],
        medium: [],
        complex: [],
        project: [],
      },
    },
    reminders: {
      defaultTypes: ['1_day_before'],
      weeklyReview: {
        enabled: true,
        day: 'Friday',
        time: '17:00',
        description: '週次レビュー',
      },
      customRules: [],
    },
    team: {
      frequentCollaborators: [],
      departments: [],
    },
    integrations: {
      appleReminders: {
        enabled: true,
        threshold: 7,
        unit: 'days',
        defaultList: 'Reminders',
        lists: {},
      },
      notion: {
        enabled: false,
        threshold: 8,
        unit: 'days',
        databaseId: '',
      },
      googleCalendar: {
        enabled: false,
        defaultCalendar: 'primary',
        conflictDetection: true,
        lookAheadDays: 14,
      },
    },
    preferences: {
      language: 'ja',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    MockedConfigLoader.load.mockResolvedValue(mockConfig);
    MockedConfigLoader.exists.mockResolvedValue(true);
    service = new WorkingCadenceService();
  });

  describe('getWorkingCadence', () => {
    describe('without parameters', () => {
      it('should return user information', async () => {
        const result = await service.getWorkingCadence();

        expect(result.success).toBe(true);
        expect(result.user.name).toBe('田中太郎');
        expect(result.user.timezone).toBe('Asia/Tokyo');
      });

      it('should return working hours', async () => {
        const result = await service.getWorkingCadence();

        expect(result.workingHours.start).toBe('09:00');
        expect(result.workingHours.end).toBe('18:00');
        expect(result.workingHours.totalMinutes).toBe(540); // 9 hours = 540 minutes
      });

      it('should return weekly pattern', async () => {
        const result = await service.getWorkingCadence();

        expect(result.weeklyPattern.deepWorkDays).toEqual(['Monday', 'Wednesday', 'Friday']);
        expect(result.weeklyPattern.meetingHeavyDays).toEqual(['Tuesday', 'Thursday']);
        expect(result.weeklyPattern.normalDays).toEqual(['Saturday', 'Sunday']);
      });

      it('should return deep work blocks with formatted times', async () => {
        const result = await service.getWorkingCadence();

        expect(result.deepWorkBlocks).toHaveLength(2);
        expect(result.deepWorkBlocks[0]).toEqual({
          day: 'Monday',
          startHour: 9,
          endHour: 12,
          startTime: '09:00',
          endTime: '12:00',
          durationMinutes: 180,
          description: '午前集中時間',
        });
      });

      it('should return weekly review info when enabled', async () => {
        const result = await service.getWorkingCadence();

        expect(result.weeklyReview).toEqual({
          enabled: true,
          day: 'Friday',
          time: '17:00',
          description: '週次レビュー',
        });
      });

      it('should return recommendations', async () => {
        const result = await service.getWorkingCadence();

        expect(result.recommendations).toBeInstanceOf(Array);
        expect(result.recommendations.length).toBeGreaterThan(0);

        const deepWorkRec = result.recommendations.find((r) => r.type === 'deep-work');
        expect(deepWorkRec).toBeDefined();
        expect(deepWorkRec?.bestDays).toContain('Monday');
      });

      it('should return a summary message in Japanese', async () => {
        const result = await service.getWorkingCadence();

        expect(result.summary).toBeDefined();
        expect(result.summary).toContain('09:00');
        expect(result.summary).toContain('18:00');
      });
    });

    describe('with dayOfWeek parameter', () => {
      it('should return specific day info for a deep work day', async () => {
        const result = await service.getWorkingCadence({ dayOfWeek: 'Monday' });

        expect(result.specificDay).toBeDefined();
        expect(result.specificDay?.dayOfWeek).toBe('Monday');
        expect(result.specificDay?.dayType).toBe('deep-work');
        expect(result.specificDay?.deepWorkBlocks).toHaveLength(1);
        expect(result.specificDay?.recommendations).toBeInstanceOf(Array);
      });

      it('should return specific day info for a meeting-heavy day', async () => {
        const result = await service.getWorkingCadence({ dayOfWeek: 'Tuesday' });

        expect(result.specificDay).toBeDefined();
        expect(result.specificDay?.dayOfWeek).toBe('Tuesday');
        expect(result.specificDay?.dayType).toBe('meeting-heavy');
      });

      it('should return specific day info for a normal day', async () => {
        const result = await service.getWorkingCadence({ dayOfWeek: 'Saturday' });

        expect(result.specificDay).toBeDefined();
        expect(result.specificDay?.dayOfWeek).toBe('Saturday');
        expect(result.specificDay?.dayType).toBe('normal');
      });
    });

    describe('with date parameter', () => {
      it('should determine day of week from ISO date string', async () => {
        // 2025-01-13 is a Monday
        const result = await service.getWorkingCadence({ date: '2025-01-13' });

        expect(result.specificDay).toBeDefined();
        expect(result.specificDay?.date).toBe('2025-01-13');
        expect(result.specificDay?.dayOfWeek).toBe('Monday');
        expect(result.specificDay?.dayType).toBe('deep-work');
      });

      it('should handle Tuesday (2025-01-14)', async () => {
        const result = await service.getWorkingCadence({ date: '2025-01-14' });

        expect(result.specificDay?.dayOfWeek).toBe('Tuesday');
        expect(result.specificDay?.dayType).toBe('meeting-heavy');
      });
    });
  });

  describe('getDayType', () => {
    it('should return deep-work for deep work days', () => {
      expect(service.getDayType('Monday', mockConfig.calendar)).toBe('deep-work');
      expect(service.getDayType('Wednesday', mockConfig.calendar)).toBe('deep-work');
      expect(service.getDayType('Friday', mockConfig.calendar)).toBe('deep-work');
    });

    it('should return meeting-heavy for meeting heavy days', () => {
      expect(service.getDayType('Tuesday', mockConfig.calendar)).toBe('meeting-heavy');
      expect(service.getDayType('Thursday', mockConfig.calendar)).toBe('meeting-heavy');
    });

    it('should return normal for other days', () => {
      expect(service.getDayType('Saturday', mockConfig.calendar)).toBe('normal');
      expect(service.getDayType('Sunday', mockConfig.calendar)).toBe('normal');
    });
  });

  describe('getDayOfWeek', () => {
    it('should return correct day of week for ISO dates', () => {
      expect(service.getDayOfWeek('2025-01-13')).toBe('Monday');
      expect(service.getDayOfWeek('2025-01-14')).toBe('Tuesday');
      expect(service.getDayOfWeek('2025-01-15')).toBe('Wednesday');
      expect(service.getDayOfWeek('2025-01-16')).toBe('Thursday');
      expect(service.getDayOfWeek('2025-01-17')).toBe('Friday');
      expect(service.getDayOfWeek('2025-01-18')).toBe('Saturday');
      expect(service.getDayOfWeek('2025-01-19')).toBe('Sunday');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate deep work recommendation', () => {
      const recommendations = service.generateRecommendations(mockConfig.calendar);

      const deepWorkRec = recommendations.find((r) => r.type === 'deep-work');
      expect(deepWorkRec).toBeDefined();
      expect(deepWorkRec?.bestDays).toEqual(['Monday', 'Wednesday', 'Friday']);
      expect(deepWorkRec?.recommendation).toContain('月');
    });

    it('should generate meeting recommendation', () => {
      const recommendations = service.generateRecommendations(mockConfig.calendar);

      const meetingRec = recommendations.find((r) => r.type === 'meeting');
      expect(meetingRec).toBeDefined();
      expect(meetingRec?.bestDays).toEqual(['Tuesday', 'Thursday']);
      expect(meetingRec?.recommendation).toContain('火');
    });
  });

  describe('error handling', () => {
    it('should use default values when config file does not exist', async () => {
      MockedConfigLoader.exists.mockResolvedValue(false);
      MockedConfigLoader.load.mockRejectedValue(new Error('Configuration file not found'));
      MockedConfigLoader.getDefaultConfig.mockReturnValue({
        ...mockConfig,
        user: { name: '', timezone: 'Asia/Tokyo' },
      });

      const result = await service.getWorkingCadence();

      expect(result.success).toBe(true);
      expect(result.user.timezone).toBe('Asia/Tokyo');
    });

    it('should handle invalid date format', async () => {
      const result = await service.getWorkingCadence({ date: 'invalid-date' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('無効な日付形式');
    });

    it('should handle invalid day of week', async () => {
      const result = await service.getWorkingCadence({ dayOfWeek: 'Notaday' as never });

      expect(result.success).toBe(false);
      expect(result.error).toContain('無効な曜日');
    });
  });

  describe('working hours calculation', () => {
    it('should calculate total minutes correctly for standard hours', () => {
      const result = service.calculateWorkingHours({ start: '09:00', end: '18:00' });

      expect(result.start).toBe('09:00');
      expect(result.end).toBe('18:00');
      expect(result.totalMinutes).toBe(540);
    });

    it('should calculate total minutes for shorter hours', () => {
      const result = service.calculateWorkingHours({ start: '10:00', end: '16:00' });

      expect(result.totalMinutes).toBe(360);
    });

    it('should handle edge case with same start and end', () => {
      const result = service.calculateWorkingHours({ start: '09:00', end: '09:00' });

      expect(result.totalMinutes).toBe(0);
    });
  });

  describe('deep work blocks transformation', () => {
    it('should transform blocks with formatted times and duration', () => {
      const blocks = [
        { day: 'Monday', startHour: 9, endHour: 12, description: 'Morning' },
      ];

      const result = service.transformDeepWorkBlocks(blocks);

      expect(result[0]).toEqual({
        day: 'Monday',
        startHour: 9,
        endHour: 12,
        startTime: '09:00',
        endTime: '12:00',
        durationMinutes: 180,
        description: 'Morning',
      });
    });

    it('should format single digit hours with leading zero', () => {
      const blocks = [
        { day: 'Tuesday', startHour: 8, endHour: 9, description: 'Early' },
      ];

      const result = service.transformDeepWorkBlocks(blocks);

      expect(result[0].startTime).toBe('08:00');
      expect(result[0].endTime).toBe('09:00');
    });
  });

  describe('formatDays helper', () => {
    it('should convert English days to Japanese', () => {
      const result = service.formatDays(['Monday', 'Wednesday', 'Friday']);

      expect(result).toBe('月・水・金');
    });

    it('should handle single day', () => {
      const result = service.formatDays(['Tuesday']);

      expect(result).toBe('火');
    });

    it('should handle empty array', () => {
      const result = service.formatDays([]);

      expect(result).toBe('');
    });
  });
});
