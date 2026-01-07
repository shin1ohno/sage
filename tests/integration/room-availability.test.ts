/**
 * Room Availability Integration Tests
 * Requirements: room-availability-search 1, 2, 3
 *
 * Integration tests for room availability MCP tools.
 * Tests end-to-end flow from MCP tool invocation to Google Calendar API.
 */

import { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import {
  handleSearchRoomAvailability,
  handleCheckRoomAvailability,
  handleCreateCalendarEvent,
  type CalendarToolsContext,
} from '../../src/tools/calendar/handlers.js';

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(),
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

describe('Room Availability Integration', () => {
  let mockCalendarClient: any;
  let mockGoogleCalendarService: jest.Mocked<GoogleCalendarService>;
  let mockCalendarSourceManager: any;
  let mockContext: CalendarToolsContext;

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
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock calendar client
    mockCalendarClient = {
      calendarList: {
        list: jest.fn().mockResolvedValue({
          data: { items: mockRoomCalendars },
        }),
        get: jest.fn().mockResolvedValue({
          data: mockRoomCalendars[0],
        }),
      },
      freebusy: {
        query: jest.fn().mockResolvedValue({
          data: {
            calendars: {
              'room-a@resource.calendar.google.com': { busy: [] },
              'room-b@resource.calendar.google.com': { busy: [] },
            },
          },
        }),
      },
      events: {
        insert: jest.fn().mockResolvedValue({
          data: {
            id: 'new-event-123',
            summary: 'Test Meeting',
            start: { dateTime: '2025-01-15T10:00:00+09:00' },
            end: { dateTime: '2025-01-15T11:00:00+09:00' },
          },
        }),
      },
    };

    // Create mock GoogleCalendarService
    mockGoogleCalendarService = {
      getCalendarClient: jest.fn().mockResolvedValue(mockCalendarClient),
      authenticate: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockResolvedValue(true),
      createEvent: jest.fn().mockResolvedValue({
        id: 'new-event-123',
        title: 'Test Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        source: 'google',
      }),
    } as any;

    // Create mock CalendarSourceManager
    mockCalendarSourceManager = {
      getEnabledSources: jest.fn().mockReturnValue(['google']),
      createEvent: jest.fn().mockResolvedValue({
        id: 'new-event-123',
        title: 'Test Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        source: 'google',
      }),
      getGoogleCalendarService: jest.fn().mockReturnValue(mockGoogleCalendarService),
    };

    // Create mock context
    mockContext = {
      getConfig: jest.fn().mockReturnValue({
        calendar: {
          workingHours: { start: '09:00', end: '18:00' },
          sources: {
            eventkit: { enabled: false },
            google: { enabled: true },
          },
        },
      }),
      getCalendarSourceManager: jest.fn().mockReturnValue(mockCalendarSourceManager),
      getGoogleCalendarService: jest.fn().mockReturnValue(mockGoogleCalendarService),
      getCalendarEventResponseService: jest.fn().mockReturnValue(null),
      getWorkingCadenceService: jest.fn().mockReturnValue(null),
      setWorkingCadenceService: jest.fn(),
      initializeServices: jest.fn(),
    };
  });

  describe('search_room_availability MCP tool', () => {
    test('should return available rooms through MCP handler', async () => {
      const result = await handleSearchRoomAvailability(mockContext, {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.rooms).toHaveLength(2);
      expect(responseData.rooms[0].isAvailable).toBe(true);
    });

    test('should filter rooms by capacity through MCP handler', async () => {
      const result = await handleSearchRoomAvailability(mockContext, {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        minCapacity: 8,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      // Only Room A with capacity 10 should match
      expect(responseData.rooms.length).toBe(1);
      expect(responseData.rooms[0].capacity).toBe(10);
    });

    test('should handle validation errors gracefully', async () => {
      const result = await handleSearchRoomAvailability(mockContext, {
        startTime: '2025-01-15T10:00:00+09:00',
        // Missing both endTime and durationMinutes - should trigger validation error
      });

      const responseData = JSON.parse(result.content[0].text);
      // Error responses return { error: true } without success field
      expect(responseData.error).toBe(true);
      expect(responseData.message).toBeDefined();
    });

    test('should require Google Calendar for room search', async () => {
      // Mock getGoogleCalendarService to return null (Google Calendar not configured)
      mockContext.getGoogleCalendarService = jest.fn().mockReturnValue(null);

      const result = await handleSearchRoomAvailability(mockContext, {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBe(true);
      expect(responseData.message).toContain('Google Calendar');
    });
  });

  describe('check_room_availability MCP tool', () => {
    test('should return room availability through MCP handler', async () => {
      const result = await handleCheckRoomAvailability(mockContext, {
        roomId: 'room-a@resource.calendar.google.com',
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.room.id).toBe('room-a@resource.calendar.google.com');
      expect(responseData.isAvailable).toBe(true);
    });

    test('should return busy periods when room is occupied', async () => {
      mockCalendarClient.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            'room-a@resource.calendar.google.com': {
              busy: [
                { start: '2025-01-15T09:00:00+09:00', end: '2025-01-15T10:30:00+09:00' },
              ],
            },
          },
        },
      });

      const result = await handleCheckRoomAvailability(mockContext, {
        roomId: 'room-a@resource.calendar.google.com',
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.isAvailable).toBe(false);
      expect(responseData.busyPeriods).toHaveLength(1);
    });

    test('should handle room not found error', async () => {
      mockCalendarClient.calendarList.get.mockRejectedValue(new Error('Room not found'));

      const result = await handleCheckRoomAvailability(mockContext, {
        roomId: 'nonexistent@resource.calendar.google.com',
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      });

      const responseData = JSON.parse(result.content[0].text);
      // Error responses return { error: true } without success field
      expect(responseData.error).toBe(true);
      expect(responseData.message).toBeDefined();
    });
  });

  describe('create_calendar_event with room booking', () => {
    test('should create event with room booking through MCP handler', async () => {
      const result = await handleCreateCalendarEvent(mockContext, {
        title: 'Team Meeting',
        startDate: '2025-01-15T10:00:00+09:00',
        endDate: '2025-01-15T11:00:00+09:00',
        roomId: 'room-a@resource.calendar.google.com',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.roomId).toBe('room-a@resource.calendar.google.com');
      expect(responseData.message).toContain('会議室');

      // Verify the room was added as attendee
      expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          attendees: ['room-a@resource.calendar.google.com'],
        }),
        'google'
      );
    });

    test('should require Google Calendar for room booking', async () => {
      mockCalendarSourceManager.getEnabledSources.mockReturnValue(['eventkit']);

      const result = await handleCreateCalendarEvent(mockContext, {
        title: 'Team Meeting',
        startDate: '2025-01-15T10:00:00+09:00',
        endDate: '2025-01-15T11:00:00+09:00',
        roomId: 'room-a@resource.calendar.google.com',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(false);
      expect(responseData.message).toContain('Google Calendar');
    });

    test('should create event without room booking when roomId not provided', async () => {
      const result = await handleCreateCalendarEvent(mockContext, {
        title: 'Regular Meeting',
        startDate: '2025-01-15T10:00:00+09:00',
        endDate: '2025-01-15T11:00:00+09:00',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.roomId).toBeUndefined();

      // Verify no attendees were added
      expect(mockCalendarSourceManager.createEvent).toHaveBeenCalledWith(
        expect.not.objectContaining({
          attendees: expect.anything(),
        }),
        undefined
      );
    });
  });

  describe('End-to-end room booking workflow', () => {
    test('should complete full workflow: search → check → book', async () => {
      // Step 1: Search for available rooms
      const searchResult = await handleSearchRoomAvailability(mockContext, {
        startTime: '2025-01-15T10:00:00+09:00',
        durationMinutes: 60,
        minCapacity: 8,
      });

      const searchData = JSON.parse(searchResult.content[0].text);
      expect(searchData.success).toBe(true);
      const selectedRoom = searchData.rooms[0];
      expect(selectedRoom.isAvailable).toBe(true);

      // Step 2: Check specific room availability
      const checkResult = await handleCheckRoomAvailability(mockContext, {
        roomId: selectedRoom.id, // Response flattens room properties
        startTime: '2025-01-15T10:00:00+09:00',
        endTime: '2025-01-15T11:00:00+09:00',
      });

      const checkData = JSON.parse(checkResult.content[0].text);
      expect(checkData.success).toBe(true);
      expect(checkData.isAvailable).toBe(true);

      // Step 3: Book the room
      const bookResult = await handleCreateCalendarEvent(mockContext, {
        title: 'Important Meeting',
        startDate: '2025-01-15T10:00:00+09:00',
        endDate: '2025-01-15T11:00:00+09:00',
        roomId: selectedRoom.id, // Response flattens room properties
      });

      const bookData = JSON.parse(bookResult.content[0].text);
      expect(bookData.success).toBe(true);
      expect(bookData.roomId).toBe(selectedRoom.id);
    });
  });
});
