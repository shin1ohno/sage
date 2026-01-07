/**
 * Google Calendar Service - People Availability Tests
 * Requirements: check-others-availability 1, 2, 3
 *
 * Unit tests for checkPeopleAvailability and findCommonAvailability methods.
 */

import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(),
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

describe('GoogleCalendarService - People Availability', () => {
  let service: GoogleCalendarService;
  let mockCalendarClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock calendar client
    mockCalendarClient = {
      freebusy: {
        query: jest.fn(),
      },
      calendarList: {
        get: jest.fn(),
      },
    };

    // Create service instance with mocked client
    service = new GoogleCalendarService({} as any);
    (service as any).calendarClient = mockCalendarClient;
  });

  describe('checkPeopleAvailability', () => {
    const mockFreebusyResponse = (calendars: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: Array<{ reason: string }> }>) => ({
      data: { calendars },
    });

    it('should return availability for multiple people', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue(
        mockFreebusyResponse({
          'alice@example.com': {
            busy: [
              { start: '2025-01-15T10:00:00+09:00', end: '2025-01-15T11:00:00+09:00' },
            ],
          },
          'bob@example.com': {
            busy: [],
          },
        })
      );

      const result = await service.checkPeopleAvailability(
        ['alice@example.com', 'bob@example.com'],
        '2025-01-15T09:00:00+09:00',
        '2025-01-15T18:00:00+09:00'
      );

      expect(result.people).toHaveLength(2);
      expect(result.people[0].email).toBe('alice@example.com');
      expect(result.people[0].isAvailable).toBe(false);
      expect(result.people[0].busyPeriods).toHaveLength(1);
      expect(result.people[1].email).toBe('bob@example.com');
      expect(result.people[1].isAvailable).toBe(true);
      expect(result.people[1].busyPeriods).toHaveLength(0);
    });

    it('should handle permission denied errors gracefully', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue(
        mockFreebusyResponse({
          'alice@example.com': { busy: [] },
          'restricted@example.com': {
            errors: [{ reason: 'accessDenied' }],
          },
        })
      );

      const result = await service.checkPeopleAvailability(
        ['alice@example.com', 'restricted@example.com'],
        '2025-01-15T09:00:00+09:00',
        '2025-01-15T18:00:00+09:00'
      );

      expect(result.people).toHaveLength(2);
      expect(result.people[0].error).toBeUndefined();
      expect(result.people[1].error).toContain('アクセス権限');
    });

    it('should handle notFound errors', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue(
        mockFreebusyResponse({
          'nonexistent@example.com': {
            errors: [{ reason: 'notFound' }],
          },
        })
      );

      const result = await service.checkPeopleAvailability(
        ['nonexistent@example.com'],
        '2025-01-15T09:00:00+09:00',
        '2025-01-15T18:00:00+09:00'
      );

      expect(result.people[0].error).toContain('見つかりません');
    });

    it('should throw error when no emails provided', async () => {
      await expect(
        service.checkPeopleAvailability(
          [],
          '2025-01-15T09:00:00+09:00',
          '2025-01-15T18:00:00+09:00'
        )
      ).rejects.toThrow('At least one email address is required');
    });

    it('should throw error when more than 20 emails provided', async () => {
      const emails = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`);

      await expect(
        service.checkPeopleAvailability(
          emails,
          '2025-01-15T09:00:00+09:00',
          '2025-01-15T18:00:00+09:00'
        )
      ).rejects.toThrow('Maximum 20 email addresses allowed');
    });

    it('should handle missing calendar data', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'alice@example.com': { busy: [] },
            // bob@example.com is missing from response
          },
        },
      });

      const result = await service.checkPeopleAvailability(
        ['alice@example.com', 'bob@example.com'],
        '2025-01-15T09:00:00+09:00',
        '2025-01-15T18:00:00+09:00'
      );

      expect(result.people[1].error).toContain('取得できません');
    });
  });

  describe('findCommonAvailability', () => {
    it('should find common free slots when all people have overlapping availability', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'alice@example.com': {
              busy: [
                { start: '2025-01-15T10:00:00Z', end: '2025-01-15T11:00:00Z' },
              ],
            },
            'bob@example.com': {
              busy: [
                { start: '2025-01-15T14:00:00Z', end: '2025-01-15T15:00:00Z' },
              ],
            },
          },
        },
      });

      const result = await service.findCommonAvailability(
        ['alice@example.com', 'bob@example.com'],
        '2025-01-15T09:00:00Z',
        '2025-01-15T17:00:00Z',
        30
      );

      // Should have free slots: 09:00-10:00, 11:00-14:00, 15:00-17:00
      expect(result.commonSlots.length).toBeGreaterThan(0);
      expect(result.participants).toHaveLength(2);
    });

    it('should return empty slots when no common availability', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'alice@example.com': {
              busy: [
                { start: '2025-01-15T09:00:00Z', end: '2025-01-15T17:00:00Z' },
              ],
            },
          },
        },
      });

      const result = await service.findCommonAvailability(
        ['alice@example.com'],
        '2025-01-15T09:00:00Z',
        '2025-01-15T17:00:00Z',
        30
      );

      expect(result.commonSlots).toHaveLength(0);
    });

    it('should filter slots by minimum duration', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'alice@example.com': {
              busy: [
                { start: '2025-01-15T10:00:00Z', end: '2025-01-15T10:15:00Z' },
              ],
            },
          },
        },
      });

      const result = await service.findCommonAvailability(
        ['alice@example.com'],
        '2025-01-15T09:00:00Z',
        '2025-01-15T11:00:00Z',
        60 // Require 60 minute slots
      );

      // Only slots >= 60 minutes should be included
      expect(result.commonSlots.every(slot => slot.durationMinutes >= 60)).toBe(true);
    });

    it('should return entire range as free when no one is busy', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'alice@example.com': { busy: [] },
            'bob@example.com': { busy: [] },
          },
        },
      });

      const result = await service.findCommonAvailability(
        ['alice@example.com', 'bob@example.com'],
        '2025-01-15T09:00:00Z',
        '2025-01-15T17:00:00Z',
        30
      );

      expect(result.commonSlots).toHaveLength(1);
      expect(result.commonSlots[0].durationMinutes).toBe(480); // 8 hours
    });

    it('should handle overlapping busy periods from multiple people', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'alice@example.com': {
              busy: [
                { start: '2025-01-15T10:00:00Z', end: '2025-01-15T12:00:00Z' },
              ],
            },
            'bob@example.com': {
              busy: [
                { start: '2025-01-15T11:00:00Z', end: '2025-01-15T13:00:00Z' },
              ],
            },
          },
        },
      });

      const result = await service.findCommonAvailability(
        ['alice@example.com', 'bob@example.com'],
        '2025-01-15T09:00:00Z',
        '2025-01-15T17:00:00Z',
        30
      );

      // Combined busy: 10:00-13:00, so free: 09:00-10:00 and 13:00-17:00
      expect(result.commonSlots.length).toBe(2);
    });
  });

  describe('getPrimaryCalendarEmail', () => {
    it('should return primary calendar email', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValue({
        data: { id: 'user@example.com' },
      });

      const email = await service.getPrimaryCalendarEmail();

      expect(email).toBe('user@example.com');
      expect(mockCalendarClient.calendarList.get).toHaveBeenCalledWith({
        calendarId: 'primary',
      });
    });

    it('should return empty string when no id', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValue({
        data: {},
      });

      const email = await service.getPrimaryCalendarEmail();

      expect(email).toBe('');
    });
  });
});
