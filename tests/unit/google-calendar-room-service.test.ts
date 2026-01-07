/**
 * Google Calendar Room Service Tests
 * Requirements: room-availability-search 1, 2
 *
 * Unit tests for the GoogleCalendarRoomService implementation.
 */

import { GoogleCalendarRoomService } from '../../src/integrations/google-calendar-room-service.js';
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

describe('GoogleCalendarRoomService', () => {
  let service: GoogleCalendarRoomService;
  let mockGoogleCalendarService: jest.Mocked<GoogleCalendarService>;
  let mockCalendarClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock calendar client
    mockCalendarClient = {
      calendarList: {
        list: jest.fn(),
        get: jest.fn(),
      },
      freebusy: {
        query: jest.fn(),
      },
    };

    // Create mock GoogleCalendarService
    mockGoogleCalendarService = {
      getCalendarClient: jest.fn().mockResolvedValue(mockCalendarClient),
      authenticate: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockResolvedValue(true),
    } as any;

    // Create service instance
    service = new GoogleCalendarRoomService(mockGoogleCalendarService);
  });

  describe('searchRoomAvailability', () => {
    const mockRoomCalendars = [
      {
        id: 'room-a@resource.calendar.google.com',
        summary: 'Conference Room A (10人)',
        description: 'Capacity: 10\nBuilding: Main\nFloor: 3\nFeatures: projector, whiteboard',
      },
      {
        id: 'room-b@resource.calendar.google.com',
        summary: 'Meeting Room B',
        description: 'Capacity: 6\nBuilding: Main\nFloor: 2',
      },
      {
        id: 'room-c@resource.calendar.google.com',
        summary: 'Large Hall C',
        description: 'Capacity: 50\nBuilding: Annex\nFloor: 1\nFeatures: projector, microphone, stage',
      },
    ];

    beforeEach(() => {
      // Mock CalendarList.list to return room calendars
      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: {
          items: [
            { id: 'primary', summary: 'Personal Calendar' },
            ...mockRoomCalendars,
          ],
        },
      });

      // Mock Freebusy.query to return no busy periods by default
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room-a@resource.calendar.google.com': { busy: [] },
            'room-b@resource.calendar.google.com': { busy: [] },
            'room-c@resource.calendar.google.com': { busy: [] },
          },
        },
      });
    });

    test('should return all available rooms with endTime specified', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      });

      expect(result).toHaveLength(3);
      expect(result.every(r => r.isAvailable)).toBe(true);
      expect(mockCalendarClient.calendarList.list).toHaveBeenCalled();
      expect(mockCalendarClient.freebusy.query).toHaveBeenCalled();
    });

    test('should return all available rooms with durationMinutes specified', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      expect(result).toHaveLength(3);
      expect(result.every(r => r.isAvailable)).toBe(true);
    });

    test('should filter rooms by minCapacity', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        minCapacity: 10,
      });

      // Should return only rooms with capacity >= 10 (Room A and Large Hall C)
      expect(result.length).toBe(2);
      expect(result.some(r => r.room.name.includes('Room A'))).toBe(true);
      expect(result.some(r => r.room.name.includes('Hall C'))).toBe(true);
    });

    test('should filter rooms by building', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        building: 'Main',
      });

      // Should return only rooms in Main building (Room A and Room B)
      expect(result.length).toBe(2);
      expect(result.every(r => r.room.building === 'Main')).toBe(true);
    });

    test('should filter rooms by floor', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        floor: '3',
      });

      // Should return only rooms on floor 3 (Room A)
      expect(result.length).toBe(1);
      expect(result[0].room.floor).toBe('3');
    });

    test('should filter rooms by features', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        features: ['projector'],
      });

      // Should return only rooms with projector (Room A and Large Hall C)
      expect(result.length).toBe(2);
      expect(result.every(r => r.room.features?.includes('projector'))).toBe(true);
    });

    test('should mark rooms as unavailable when busy', async () => {
      // Mock Room A as busy during requested time
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room-a@resource.calendar.google.com': {
              busy: [{ start: '2025-01-15T09:00:00+09:00', end: '2025-01-15T10:30:00+09:00' }],
            },
            'room-b@resource.calendar.google.com': { busy: [] },
            'room-c@resource.calendar.google.com': { busy: [] },
          },
        },
      });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      });

      expect(result).toHaveLength(3);
      const roomA = result.find(r => r.room.id === 'room-a@resource.calendar.google.com');
      expect(roomA?.isAvailable).toBe(false);
      expect(roomA?.busyPeriods).toHaveLength(1);
    });

    test('should sort available rooms before unavailable rooms', async () => {
      // Mock Room A as busy
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room-a@resource.calendar.google.com': {
              busy: [{ start: '2025-01-15T10:00:00+09:00', end: '2025-01-15T11:00:00+09:00' }],
            },
            'room-b@resource.calendar.google.com': { busy: [] },
            'room-c@resource.calendar.google.com': { busy: [] },
          },
        },
      });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      });

      // Available rooms should come before unavailable rooms
      const availableIndex = result.findIndex(r => r.isAvailable);
      const unavailableIndex = result.findIndex(r => !r.isAvailable);
      expect(availableIndex).toBeLessThan(unavailableIndex);
    });

    test('should sort rooms by capacity match when minCapacity specified', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        minCapacity: 8,
      });

      // Room A (10人) should be first as it's closest to 8
      // Large Hall C (50人) should be second
      expect(result[0].room.capacity).toBe(10);
      expect(result[1].room.capacity).toBe(50);
    });

    test('should return empty array when no rooms match filters', async () => {
      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        minCapacity: 100, // No room has this capacity
      });

      expect(result).toHaveLength(0);
    });

    test('should throw error for invalid request', async () => {
      await expect(
        service.searchRoomAvailability({
          startTime: '2025-01-15T10:00:00+09:00',
          // Missing both endTime and durationMinutes
        })
      ).rejects.toThrow('Invalid request');
    });

    test('should handle pagination in calendarList', async () => {
      // Mock paginated response
      mockCalendarClient.calendarList.list
        .mockResolvedValueOnce({
          data: {
            items: [mockRoomCalendars[0]],
            nextPageToken: 'token1',
          },
        })
        .mockResolvedValueOnce({
          data: {
            items: [mockRoomCalendars[1], mockRoomCalendars[2]],
          },
        });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      expect(result).toHaveLength(3);
      expect(mockCalendarClient.calendarList.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkRoomAvailability', () => {
    const mockRoom = {
      id: 'room-a@resource.calendar.google.com',
      summary: 'Conference Room A',
      description: 'Capacity: 10\nBuilding: Main\nFloor: 3',
    };

    beforeEach(() => {
      mockCalendarClient.calendarList.get.mockResolvedValue({
        data: mockRoom,
      });

      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room-a@resource.calendar.google.com': { busy: [] },
          },
        },
      });
    });

    test('should return availability for specific room', async () => {
      const result = await service.checkRoomAvailability(
        'room-a@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.room.id).toBe('room-a@resource.calendar.google.com');
      expect(result.room.name).toBe('Conference Room A');
      expect(result.isAvailable).toBe(true);
      expect(result.busyPeriods).toHaveLength(0);
      expect(result.requestedPeriod).toEqual({
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
      });
    });

    test('should return busy periods when room is occupied', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room-a@resource.calendar.google.com': {
              busy: [
                { start: '2025-01-15T09:00:00+09:00', end: '2025-01-15T10:30:00+09:00' },
                { start: '2025-01-15T14:00:00+09:00', end: '2025-01-15T15:00:00+09:00' },
              ],
            },
          },
        },
      });

      const result = await service.checkRoomAvailability(
        'room-a@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.isAvailable).toBe(false);
      expect(result.busyPeriods).toHaveLength(2);
    });

    test('should throw error when room not found', async () => {
      mockCalendarClient.calendarList.get.mockRejectedValue(new Error('Not found'));

      await expect(
        service.checkRoomAvailability(
          'nonexistent@resource.calendar.google.com',
          '2025-01-15T10:00:00+09:00',
          '2025-01-15T11:00:00+09:00'
        )
      ).rejects.toThrow('Room not found');
    });

    test('should throw error when calendar is not a room resource', async () => {
      mockCalendarClient.calendarList.get.mockResolvedValue({
        data: {
          id: 'personal@gmail.com', // Not a room resource
          summary: 'Personal Calendar',
        },
      });

      await expect(
        service.checkRoomAvailability(
          'personal@gmail.com',
          '2025-01-15T10:00:00+09:00',
          '2025-01-15T11:00:00+09:00'
        )
      ).rejects.toThrow('Room not found');
    });

    test('should throw error for invalid request', async () => {
      await expect(
        service.checkRoomAvailability(
          'room-a@resource.calendar.google.com',
          '2025-01-15T12:00:00+09:00', // Start after end
          '2025-01-15T10:00:00+09:00'
        )
      ).rejects.toThrow('Invalid request');
    });
  });

  describe('sortByCapacityMatch', () => {
    // Access the private method through the public searchRoomAvailability
    // by controlling the mock responses

    test('should sort available rooms by capacity match then by name', async () => {
      const rooms = [
        {
          id: 'room-z@resource.calendar.google.com',
          summary: 'Z Room',
          description: 'Capacity: 10',
        },
        {
          id: 'room-a@resource.calendar.google.com',
          summary: 'A Room',
          description: 'Capacity: 10',
        },
        {
          id: 'room-b@resource.calendar.google.com',
          summary: 'B Room',
          description: 'Capacity: 8',
        },
      ];

      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: { items: rooms },
      });

      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room-z@resource.calendar.google.com': { busy: [] },
            'room-a@resource.calendar.google.com': { busy: [] },
            'room-b@resource.calendar.google.com': { busy: [] },
          },
        },
      });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        minCapacity: 8,
      });

      // All have same capacity distance from 8, so sort by name
      // B Room (8) -> distance 0
      // A Room (10) -> distance 2
      // Z Room (10) -> distance 2
      expect(result[0].room.name).toBe('B Room');
      // For same capacity distance, sort by name
      expect(result[1].room.name).toBe('A Room');
      expect(result[2].room.name).toBe('Z Room');
    });
  });

  describe('isRoomAvailable', () => {
    // Test through checkRoomAvailability

    test('should return true when no overlapping busy periods', async () => {
      const mockRoom = {
        id: 'room@resource.calendar.google.com',
        summary: 'Room',
        description: '',
      };

      mockCalendarClient.calendarList.get.mockResolvedValue({ data: mockRoom });
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room@resource.calendar.google.com': {
              busy: [
                { start: '2025-01-15T08:00:00+09:00', end: '2025-01-15T09:00:00+09:00' },
                { start: '2025-01-15T12:00:00+09:00', end: '2025-01-15T13:00:00+09:00' },
              ],
            },
          },
        },
      });

      const result = await service.checkRoomAvailability(
        'room@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.isAvailable).toBe(true);
    });

    test('should return false when busy period overlaps start', async () => {
      const mockRoom = {
        id: 'room@resource.calendar.google.com',
        summary: 'Room',
        description: '',
      };

      mockCalendarClient.calendarList.get.mockResolvedValue({ data: mockRoom });
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room@resource.calendar.google.com': {
              busy: [{ start: '2025-01-15T09:30:00+09:00', end: '2025-01-15T10:30:00+09:00' }],
            },
          },
        },
      });

      const result = await service.checkRoomAvailability(
        'room@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.isAvailable).toBe(false);
    });

    test('should return false when busy period overlaps end', async () => {
      const mockRoom = {
        id: 'room@resource.calendar.google.com',
        summary: 'Room',
        description: '',
      };

      mockCalendarClient.calendarList.get.mockResolvedValue({ data: mockRoom });
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room@resource.calendar.google.com': {
              busy: [{ start: '2025-01-15T10:30:00+09:00', end: '2025-01-15T11:30:00+09:00' }],
            },
          },
        },
      });

      const result = await service.checkRoomAvailability(
        'room@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.isAvailable).toBe(false);
    });

    test('should return false when busy period completely contains request', async () => {
      const mockRoom = {
        id: 'room@resource.calendar.google.com',
        summary: 'Room',
        description: '',
      };

      mockCalendarClient.calendarList.get.mockResolvedValue({ data: mockRoom });
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room@resource.calendar.google.com': {
              busy: [{ start: '2025-01-15T09:00:00+09:00', end: '2025-01-15T12:00:00+09:00' }],
            },
          },
        },
      });

      const result = await service.checkRoomAvailability(
        'room@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.isAvailable).toBe(false);
    });

    test('should return true when busy period is exactly before request', async () => {
      const mockRoom = {
        id: 'room@resource.calendar.google.com',
        summary: 'Room',
        description: '',
      };

      mockCalendarClient.calendarList.get.mockResolvedValue({ data: mockRoom });
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room@resource.calendar.google.com': {
              busy: [{ start: '2025-01-15T09:00:00+09:00', end: '2025-01-15T10:00:00+09:00' }],
            },
          },
        },
      });

      const result = await service.checkRoomAvailability(
        'room@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.isAvailable).toBe(true);
    });

    test('should return true when busy period is exactly after request', async () => {
      const mockRoom = {
        id: 'room@resource.calendar.google.com',
        summary: 'Room',
        description: '',
      };

      mockCalendarClient.calendarList.get.mockResolvedValue({ data: mockRoom });
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room@resource.calendar.google.com': {
              busy: [{ start: '2025-01-15T11:00:00+09:00', end: '2025-01-15T12:00:00+09:00' }],
            },
          },
        },
      });

      const result = await service.checkRoomAvailability(
        'room@resource.calendar.google.com',
        '2025-01-15T10:00:00+09:00',
        '2025-01-15T11:00:00+09:00'
      );

      expect(result.isAvailable).toBe(true);
    });
  });

  describe('parseRoomFromCalendar', () => {
    // Test through searchRoomAvailability by checking returned room metadata

    test('should parse capacity from description', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: {
          items: [{
            id: 'room@resource.calendar.google.com',
            summary: 'Test Room',
            description: 'Capacity: 15',
          }],
        },
      });

      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: { calendars: { 'room@resource.calendar.google.com': { busy: [] } } },
      });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      expect(result[0].room.capacity).toBe(15);
    });

    test('should parse capacity from summary (人)', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: {
          items: [{
            id: 'room@resource.calendar.google.com',
            summary: 'Test Room (20人)',
            description: '',
          }],
        },
      });

      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: { calendars: { 'room@resource.calendar.google.com': { busy: [] } } },
      });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      expect(result[0].room.capacity).toBe(20);
    });

    test('should parse building and floor from description', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: {
          items: [{
            id: 'room@resource.calendar.google.com',
            summary: 'Test Room',
            description: 'Building: HQ\nFloor: 5',
          }],
        },
      });

      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: { calendars: { 'room@resource.calendar.google.com': { busy: [] } } },
      });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      expect(result[0].room.building).toBe('HQ');
      expect(result[0].room.floor).toBe('5');
    });

    test('should parse features from description', async () => {
      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: {
          items: [{
            id: 'room@resource.calendar.google.com',
            summary: 'Test Room',
            description: 'Features: projector, whiteboard, video conferencing',
          }],
        },
      });

      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: { calendars: { 'room@resource.calendar.google.com': { busy: [] } } },
      });

      const result = await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      expect(result[0].room.features).toEqual(['projector', 'whiteboard', 'video conferencing']);
    });
  });

  describe('freebusy batching', () => {
    test('should batch freebusy requests for more than 50 rooms', async () => {
      // Create 60 mock rooms
      const mockRooms = Array.from({ length: 60 }, (_, i) => ({
        id: `room-${i}@resource.calendar.google.com`,
        summary: `Room ${i}`,
        description: '',
      }));

      mockCalendarClient.calendarList.list.mockResolvedValue({
        data: { items: mockRooms },
      });

      // Mock freebusy to track calls
      const calendarsResponse: Record<string, { busy: never[] }> = {};
      mockRooms.forEach(r => {
        calendarsResponse[r.id] = { busy: [] };
      });

      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: { calendars: calendarsResponse },
      });

      await service.searchRoomAvailability({
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      // Should make 2 freebusy calls (50 + 10)
      expect(mockCalendarClient.freebusy.query).toHaveBeenCalledTimes(2);
    });
  });
});
