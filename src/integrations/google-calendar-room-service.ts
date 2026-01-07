/**
 * Google Calendar Room Service
 * Requirement: room-availability-search 1, 2
 *
 * Provides meeting room availability search using Google Calendar
 * Freebusy API and CalendarList API.
 */

import { GoogleCalendarService } from './google-calendar-service.js';
import type {
  RoomResource,
  RoomResourceFilter,
  RoomAvailabilityRequest,
  RoomAvailability,
  SingleRoomAvailability,
  BusyPeriod,
} from '../types/google-calendar-types.js';
import {
  RoomAvailabilityRequestSchema,
  CheckRoomAvailabilitySchema,
} from '../config/validation.js';
import { calendarLogger } from '../utils/logger.js';

/**
 * Google Calendar Room Service Class
 *
 * Manages meeting room availability search using Google Calendar APIs.
 * Uses CalendarList API to discover rooms and Freebusy API to check availability.
 *
 * Requirement: room-availability-search 1, 2
 */
export class GoogleCalendarRoomService {
  private googleCalendarService: GoogleCalendarService;

  /**
   * Constructor
   *
   * @param googleCalendarService - GoogleCalendarService instance for API access
   */
  constructor(googleCalendarService: GoogleCalendarService) {
    this.googleCalendarService = googleCalendarService;
  }

  /**
   * Search for available meeting rooms during a specific time period
   *
   * Fetches room resources from CalendarList API, queries availability
   * via Freebusy API, and returns rooms sorted by capacity match.
   *
   * Requirement: room-availability-search 1.1-1.10
   *
   * @param request - RoomAvailabilityRequest with time range and filters
   * @returns Array of RoomAvailability sorted by capacity match
   * @throws Error if validation fails or API request fails
   */
  async searchRoomAvailability(request: RoomAvailabilityRequest): Promise<RoomAvailability[]> {
    // Validate request
    const validationResult = RoomAvailabilityRequestSchema.safeParse(request);
    if (!validationResult.success) {
      throw new Error(`Invalid request: ${validationResult.error.message}`);
    }

    // Calculate endTime from durationMinutes if not specified
    const endTime = request.endTime || this.calculateEndTime(request.startTime, request.durationMinutes!);

    // Fetch room resources with filters
    const rooms = await this.fetchRoomResources({
      minCapacity: request.minCapacity,
      building: request.building,
      floor: request.floor,
      features: request.features,
    });

    if (rooms.length === 0) {
      return [];
    }

    // Query freebusy for all rooms
    const roomIds = rooms.map(room => room.id);
    const busyData = await this.queryFreebusy(roomIds, request.startTime, endTime);

    // Combine room data with availability
    const results: RoomAvailability[] = rooms.map(room => {
      const busyPeriods = busyData.get(room.id) || [];
      const isAvailable = this.isRoomAvailable(busyPeriods, request.startTime, endTime);

      return {
        room,
        isAvailable,
        busyPeriods,
      };
    });

    // Sort by capacity match, then by name
    return this.sortByCapacityMatch(results, request.minCapacity);
  }

  /**
   * Check availability of a specific meeting room
   *
   * Queries Freebusy API for a single room and returns detailed
   * availability information including busy periods.
   *
   * Requirement: room-availability-search 2.1-2.4
   *
   * @param roomId - Calendar ID of the room to check
   * @param startTime - Start time in ISO 8601 format
   * @param endTime - End time in ISO 8601 format
   * @returns SingleRoomAvailability with room info and busy periods
   * @throws Error if validation fails, room not found, or API request fails
   */
  async checkRoomAvailability(
    roomId: string,
    startTime: string,
    endTime: string
  ): Promise<SingleRoomAvailability> {
    // Validate request
    const validationResult = CheckRoomAvailabilitySchema.safeParse({
      roomId,
      startTime,
      endTime,
    });
    if (!validationResult.success) {
      throw new Error(`Invalid request: ${validationResult.error.message}`);
    }

    // Fetch room metadata
    const room = await this.fetchRoomById(roomId);
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    // Query freebusy for the specific room
    const busyData = await this.queryFreebusy([roomId], startTime, endTime);
    const busyPeriods = busyData.get(roomId) || [];
    const isAvailable = this.isRoomAvailable(busyPeriods, startTime, endTime);

    return {
      room,
      isAvailable,
      busyPeriods,
      requestedPeriod: {
        start: startTime,
        end: endTime,
      },
    };
  }

  /**
   * Fetch room resources from CalendarList API
   *
   * Queries calendars with freeBusyReader access and filters for
   * room resources based on naming patterns and metadata.
   * Room calendars are identified by @resource.calendar.google.com email suffix.
   *
   * @param filters - Optional filters for capacity, building, floor, features
   * @returns Array of RoomResource matching the filters
   */
  private async fetchRoomResources(filters?: RoomResourceFilter): Promise<RoomResource[]> {
    calendarLogger.info({ filters }, 'Fetching room resources');

    const client = await this.googleCalendarService.getCalendarClient();
    const rooms: RoomResource[] = [];

    // Fetch all calendars from CalendarList API
    let pageToken: string | undefined;
    do {
      const response = await client.calendarList.list({
        maxResults: 250,
        pageToken,
        showHidden: true,
      });

      const calendars = response.data.items || [];
      for (const calendar of calendars) {
        // Identify room resources by email pattern
        const email = calendar.id || '';
        if (!this.isRoomCalendar(email)) {
          continue;
        }

        const room = this.parseRoomFromCalendar(calendar);
        if (this.matchesFilters(room, filters)) {
          rooms.push(room);
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    calendarLogger.info({ count: rooms.length }, 'Found room resources');
    return rooms;
  }

  /**
   * Fetch a single room by ID
   *
   * @param roomId - Calendar ID of the room
   * @returns RoomResource or null if not found
   */
  private async fetchRoomById(roomId: string): Promise<RoomResource | null> {
    calendarLogger.info({ roomId }, 'Fetching room by ID');

    try {
      const client = await this.googleCalendarService.getCalendarClient();
      const response = await client.calendarList.get({
        calendarId: roomId,
      });

      const calendar = response.data;
      if (!calendar || !this.isRoomCalendar(calendar.id || '')) {
        return null;
      }

      return this.parseRoomFromCalendar(calendar);
    } catch (error) {
      // Calendar not found or access denied
      calendarLogger.warn({ roomId, error }, 'Failed to fetch room by ID');
      return null;
    }
  }

  /**
   * Query Freebusy API for room availability
   *
   * Batches requests in groups of 50 (API limit) and returns
   * busy periods for each room.
   *
   * @param roomIds - Array of room calendar IDs
   * @param startTime - Start time in ISO 8601 format
   * @param endTime - End time in ISO 8601 format
   * @returns Map of roomId to BusyPeriod array
   */
  private async queryFreebusy(
    roomIds: string[],
    startTime: string,
    endTime: string
  ): Promise<Map<string, BusyPeriod[]>> {
    calendarLogger.info({ roomCount: roomIds.length, startTime, endTime }, 'Querying freebusy');

    const result = new Map<string, BusyPeriod[]>();
    const client = await this.googleCalendarService.getCalendarClient();

    // Batch requests in groups of 50 (API limit)
    const BATCH_SIZE = 50;
    for (let i = 0; i < roomIds.length; i += BATCH_SIZE) {
      const batch = roomIds.slice(i, i + BATCH_SIZE);

      const response = await client.freebusy.query({
        requestBody: {
          timeMin: startTime,
          timeMax: endTime,
          items: batch.map(id => ({ id })),
        },
      });

      const calendars = response.data.calendars || {};
      for (const roomId of batch) {
        const calendarData = calendars[roomId];
        if (calendarData?.busy) {
          result.set(
            roomId,
            calendarData.busy.map(period => ({
              start: period.start || '',
              end: period.end || '',
            }))
          );
        } else {
          result.set(roomId, []);
        }
      }
    }

    return result;
  }

  /**
   * Check if a calendar ID represents a room resource
   *
   * @param calendarId - Calendar ID (email) to check
   * @returns True if calendar is a room resource
   */
  private isRoomCalendar(calendarId: string): boolean {
    // Google Workspace room calendars have @resource.calendar.google.com suffix
    return calendarId.includes('@resource.calendar.google.com');
  }

  /**
   * Parse room metadata from calendar entry
   *
   * Extracts room information from CalendarListEntry including
   * capacity, building, floor from summary and description.
   *
   * @param calendar - CalendarListEntry from Google Calendar API
   * @returns RoomResource with parsed metadata
   */
  private parseRoomFromCalendar(calendar: {
    id?: string | null;
    summary?: string | null;
    description?: string | null;
  }): RoomResource {
    const summary = calendar.summary || '';
    const description = calendar.description || '';

    // Parse capacity from description or summary (e.g., "Capacity: 10" or "10人")
    const capacityMatch = description.match(/capacity[:\s]*(\d+)/i) ||
                          summary.match(/\((\d+)人?\)/) ||
                          description.match(/(\d+)人/);
    const capacity = capacityMatch ? parseInt(capacityMatch[1], 10) : undefined;

    // Parse building from description (e.g., "Building: Main" or "Building A")
    const buildingMatch = description.match(/building[:\s]*([^\n,]+)/i);
    const building = buildingMatch ? buildingMatch[1].trim() : undefined;

    // Parse floor from description (e.g., "Floor: 3" or "3F")
    const floorMatch = description.match(/floor[:\s]*(\d+)/i) ||
                       description.match(/(\d+)[fF階]/);
    const floor = floorMatch ? floorMatch[1] : undefined;

    // Parse features from description (e.g., "Features: projector, whiteboard")
    const featuresMatch = description.match(/features?[:\s]*([^\n]+)/i);
    const features = featuresMatch
      ? featuresMatch[1].split(/[,、]/).map(f => f.trim()).filter(Boolean)
      : undefined;

    return {
      id: calendar.id || '',
      name: summary,
      email: calendar.id || '',
      capacity,
      building,
      floor,
      features,
      description: description || undefined,
    };
  }

  /**
   * Check if room matches filter criteria
   *
   * @param room - RoomResource to check
   * @param filters - Filter criteria
   * @returns True if room matches all specified filters
   */
  private matchesFilters(room: RoomResource, filters?: RoomResourceFilter): boolean {
    if (!filters) {
      return true;
    }

    // Check minimum capacity
    if (filters.minCapacity !== undefined) {
      if (room.capacity === undefined || room.capacity < filters.minCapacity) {
        return false;
      }
    }

    // Check building
    if (filters.building !== undefined) {
      if (!room.building || !room.building.toLowerCase().includes(filters.building.toLowerCase())) {
        return false;
      }
    }

    // Check floor
    if (filters.floor !== undefined) {
      if (room.floor !== filters.floor) {
        return false;
      }
    }

    // Check features (all requested features must be present)
    if (filters.features && filters.features.length > 0) {
      if (!room.features) {
        return false;
      }
      const roomFeatures = new Set(room.features.map(f => f.toLowerCase()));
      for (const feature of filters.features) {
        if (!roomFeatures.has(feature.toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Sort rooms by capacity match
   *
   * Sorts by |requiredCapacity - actualCapacity| ascending,
   * then by room name alphabetically.
   *
   * Requirement: room-availability-search 1.4
   *
   * @param rooms - Array of RoomAvailability to sort
   * @param requiredCapacity - Optional required capacity for sorting
   * @returns Sorted array of RoomAvailability
   */
  private sortByCapacityMatch(
    rooms: RoomAvailability[],
    requiredCapacity?: number
  ): RoomAvailability[] {
    return rooms.slice().sort((a, b) => {
      // First, sort available rooms before unavailable ones
      if (a.isAvailable !== b.isAvailable) {
        return a.isAvailable ? -1 : 1;
      }

      // If requiredCapacity is specified, sort by capacity match
      if (requiredCapacity !== undefined) {
        const capacityA = a.room.capacity ?? Infinity;
        const capacityB = b.room.capacity ?? Infinity;

        // Calculate distance from required capacity
        const diffA = Math.abs(capacityA - requiredCapacity);
        const diffB = Math.abs(capacityB - requiredCapacity);

        if (diffA !== diffB) {
          return diffA - diffB;
        }
      }

      // Finally, sort by room name alphabetically
      return a.room.name.localeCompare(b.room.name);
    });
  }

  /**
   * Calculate end time from start time and duration
   *
   * @param startTime - Start time in ISO 8601 format
   * @param durationMinutes - Duration in minutes
   * @returns End time in ISO 8601 format
   */
  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return end.toISOString();
  }

  /**
   * Check if room is available during the requested period
   *
   * @param busyPeriods - Array of busy periods for the room
   * @param startTime - Requested start time
   * @param endTime - Requested end time
   * @returns True if room has no overlapping busy periods
   */
  private isRoomAvailable(
    busyPeriods: BusyPeriod[],
    startTime: string,
    endTime: string
  ): boolean {
    const requestStart = new Date(startTime).getTime();
    const requestEnd = new Date(endTime).getTime();

    for (const busy of busyPeriods) {
      const busyStart = new Date(busy.start).getTime();
      const busyEnd = new Date(busy.end).getTime();

      // Check for overlap
      if (requestStart < busyEnd && requestEnd > busyStart) {
        return false;
      }
    }

    return true;
  }
}
