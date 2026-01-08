/**
 * Calendar Source Manager
 * Requirements: 9, 11
 * Design: .claude/specs/google-calendar-api/design.md (CalendarSourceManager section)
 *
 * Manages multiple calendar sources (EventKit, Google Calendar) with automatic
 * source selection, fallback handling, and unified MCP tool interface.
 */

import { CalendarService } from './calendar-service.js';
import type { CalendarEvent, AvailableSlot } from './calendar-service.js';
import { GoogleCalendarService } from './google-calendar-service.js';
import type { CreateEventRequest } from './google-calendar-service.js';
import type { UserConfig } from '../types/config.js';
import type { SyncResult, SyncStatus, GoogleCalendarEventType, CalendarEvent as GoogleCalendarEventExtended, RecurrenceScope } from '../types/google-calendar-types.js';
import type { TimeSlot, WorkingLocationInfo } from '../types/task.js';
import { calendarLogger } from '../utils/logger.js';

/**
 * Preferred working location type for slot filtering
 * Requirement: 3.7 (Working Location Aware Scheduling)
 */
export type PreferredWorkingLocation = 'homeOffice' | 'officeLocation' | 'any';

/**
 * Request interface for finding available slots
 * Requirement: 7, 3.7 (Working Location Aware Scheduling)
 */
export interface FindSlotsRequest {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  minDurationMinutes?: number; // Minimum slot duration (default: 25)
  maxDurationMinutes?: number; // Maximum slot duration (default: 480 = 8 hours)
  workingHours?: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
  /**
   * Preferred working location for slot prioritization
   * 'homeOffice' - prioritize slots on home office days
   * 'officeLocation' - prioritize slots on office days
   * 'any' - no preference (return all slots)
   * Requirement: 3.7
   */
  preferredWorkingLocation?: PreferredWorkingLocation;
  /**
   * Whether to respect event type blocking behavior
   * When true (default), outOfOffice and focusTime events block time slots
   * When false, only default events (meetings) block time slots
   * Requirement: 7.5
   */
  respectBlockingEventTypes?: boolean;
}

/**
 * Options for CalendarSourceManager constructor
 */
export interface CalendarSourceManagerOptions {
  calendarService?: CalendarService;
  googleCalendarService?: GoogleCalendarService;
  config?: UserConfig;
}

/**
 * Calendar Source Manager
 *
 * Manages multiple calendar sources (EventKit, Google Calendar) with:
 * - Automatic source detection and selection
 * - Unified event operations across sources
 * - Fallback handling for source failures
 * - Event deduplication across sources
 */
export class CalendarSourceManager {
  private calendarService?: CalendarService;
  private googleCalendarService?: GoogleCalendarService;
  private config?: UserConfig;

  /**
   * Constructor
   *
   * @param options - Optional services and config
   */
  constructor(options?: CalendarSourceManagerOptions) {
    this.calendarService = options?.calendarService;
    this.googleCalendarService = options?.googleCalendarService;
    this.config = options?.config;
  }

  /**
   * Detect available calendar sources
   * Requirement: 9 (Platform detection and source availability)
   *
   * Uses detectPlatform() pattern from CalendarService to determine which
   * calendar sources are available on the current platform.
   *
   * @returns Object indicating which sources are available
   */
  async detectAvailableSources(): Promise<{
    eventkit: boolean;
    google: boolean;
  }> {
    const result = {
      eventkit: false,
      google: false,
    };

    // Check EventKit availability (macOS only)
    if (this.calendarService) {
      try {
        const platform = await this.calendarService.detectPlatform();
        result.eventkit = platform.platform === 'macos';
      } catch {
        result.eventkit = false;
      }
    } else {
      // No CalendarService instance, check platform directly
      if (typeof process !== 'undefined' && process.platform === 'darwin') {
        result.eventkit = true;
      }
    }

    // Check Google Calendar availability (OAuth configured)
    if (this.googleCalendarService) {
      try {
        result.google = await this.googleCalendarService.isAvailable();
      } catch {
        result.google = false;
      }
    }

    return result;
  }

  /**
   * Enable a calendar source
   * Requirement: 11 (Calendar source management)
   *
   * Updates config to enable the specified source and validates that
   * at least one source remains enabled.
   *
   * @param source - Calendar source to enable ('eventkit' | 'google')
   * @throws Error if config is not available
   */
  async enableSource(source: 'eventkit' | 'google'): Promise<void> {
    if (!this.config) {
      throw new Error('Config not available. Cannot enable source.');
    }

    // Ensure calendar.sources exists
    if (!this.config.calendar.sources) {
      this.config.calendar.sources = {
        eventkit: { enabled: false },
        google: {
          enabled: false,
          defaultCalendar: 'primary',
          excludedCalendars: [],
          syncInterval: 300,
          enableNotifications: true,
        },
      };
    }

    // Enable the specified source
    if (source === 'eventkit') {
      this.config.calendar.sources.eventkit.enabled = true;
    } else if (source === 'google') {
      this.config.calendar.sources.google.enabled = true;
    }

    // Note: Config persistence is handled by caller (ConfigManager.save())
  }

  /**
   * Disable a calendar source
   * Requirement: 11 (Calendar source management)
   *
   * Updates config to disable the specified source and validates that
   * at least one source remains enabled.
   *
   * @param source - Calendar source to disable ('eventkit' | 'google')
   * @throws Error if disabling would leave no sources enabled
   */
  async disableSource(source: 'eventkit' | 'google'): Promise<void> {
    if (!this.config) {
      throw new Error('Config not available. Cannot disable source.');
    }

    // Ensure calendar.sources exists
    if (!this.config.calendar.sources) {
      throw new Error('Calendar sources not configured.');
    }

    // Check if at least one source will remain enabled
    const sources = this.config.calendar.sources;
    const eventkitEnabled =
      source === 'eventkit' ? false : sources.eventkit.enabled;
    const googleEnabled = source === 'google' ? false : sources.google.enabled;

    if (!eventkitEnabled && !googleEnabled) {
      throw new Error(
        'Cannot disable source: at least one calendar source must be enabled.'
      );
    }

    // Disable the specified source
    if (source === 'eventkit') {
      this.config.calendar.sources.eventkit.enabled = false;
    } else if (source === 'google') {
      this.config.calendar.sources.google.enabled = false;
    }

    // Note: Config persistence is handled by caller (ConfigManager.save())
  }

  /**
   * Get enabled calendar sources
   * Requirement: 9 (Source configuration reading)
   *
   * Reads from config.calendar.sources to determine which sources are enabled.
   *
   * @returns Array of enabled source names
   */
  getEnabledSources(): ('eventkit' | 'google')[] {
    if (!this.config?.calendar?.sources) {
      // Default: EventKit on macOS, Google Calendar elsewhere
      const isMacOS =
        typeof process !== 'undefined' && process.platform === 'darwin';
      return isMacOS ? ['eventkit'] : ['google'];
    }

    const sources: ('eventkit' | 'google')[] = [];
    const calendarSources = this.config.calendar.sources;

    if (calendarSources.eventkit.enabled) {
      sources.push('eventkit');
    }

    if (calendarSources.google.enabled) {
      sources.push('google');
    }

    return sources;
  }

  /**
   * Get events from enabled calendar sources
   * Requirement: 7, 10, 11 (Multi-source event retrieval with deduplication and fallback)
   *
   * Fetches events from all enabled sources with fallback handling and deduplication.
   * - Task 17a: Basic parallel fetching
   * - Task 17b: Deduplication and fallback logic
   *
   * Fallback behavior: If one source fails, continues with other sources.
   * Only throws if ALL sources fail.
   *
   * @param startDate - Start date (ISO 8601)
   * @param endDate - End date (ISO 8601)
   * @param calendarId - Optional calendar ID filter
   * @returns Array of deduplicated calendar events from all enabled sources
   */
  async getEvents(
    startDate: string,
    endDate: string,
    calendarId?: string
  ): Promise<CalendarEvent[]> {
    const enabledSources = this.getEnabledSources();

    // Check if at least one source is enabled
    if (enabledSources.length === 0) {
      throw new Error('No calendar sources are enabled');
    }

    const allEvents: CalendarEvent[] = [];
    const errors: Error[] = [];

    // Try EventKit with fallback handling
    if (enabledSources.includes('eventkit') && this.calendarService) {
      try {
        const eventkitResponse = await this.calendarService.listEvents({
          startDate,
          endDate,
          calendarName: calendarId,
        });
        allEvents.push(...eventkitResponse.events);
      } catch (error) {
        calendarLogger.error({ err: error }, 'EventKit failed');
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Try Google Calendar with fallback handling
    if (enabledSources.includes('google') && this.googleCalendarService) {
      try {
        const googleEvents = await this.googleCalendarService.listEvents({
          startDate,
          endDate,
          calendarId,
        });
        allEvents.push(...googleEvents);
      } catch (error) {
        calendarLogger.error({ err: error }, 'Google Calendar failed');
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // If all sources failed, throw error
    if (allEvents.length === 0 && errors.length > 0) {
      throw new Error(
        `All calendar sources failed: ${errors.map((e) => e.message).join(', ')}`
      );
    }

    // Deduplicate events across sources
    const uniqueEvents = this.deduplicateEvents(allEvents);

    return uniqueEvents;
  }

  /**
   * Check if two events are duplicates
   * Requirement: 10 (Event deduplication)
   *
   * Uses two methods to detect duplicates:
   * 1. iCalUID comparison (most reliable, RFC 5545 standard)
   * 2. Title + time matching (fallback for events without iCalUID)
   *
   * Note: iCalUID support will be added in Task 24. Until then, this uses
   * type assertions to access the optional iCalUID property.
   *
   * @param event1 - First event
   * @param event2 - Second event
   * @returns True if events are duplicates
   */
  private areEventsDuplicate(
    event1: CalendarEvent,
    event2: CalendarEvent
  ): boolean {
    // Method 1: iCalUID comparison (most reliable)
    // Note: iCalUID will be added to CalendarEvent interface in Task 24
    const iCalUID1 = (event1 as CalendarEvent & { iCalUID?: string }).iCalUID;
    const iCalUID2 = (event2 as CalendarEvent & { iCalUID?: string }).iCalUID;

    if (iCalUID1 && iCalUID2 && iCalUID1 === iCalUID2) {
      return true;
    }

    // Method 2: Title + time matching (fallback)
    const titleMatch =
      event1.title.toLowerCase() === event2.title.toLowerCase();
    const startMatch = event1.start === event2.start;
    const endMatch = event1.end === event2.end;

    return titleMatch && startMatch && endMatch;
  }

  /**
   * Deduplicate events array
   * Requirement: 10 (Event deduplication)
   *
   * Removes duplicate events keeping the first occurrence.
   * Uses areEventsDuplicate() for comparison.
   *
   * @param events - Array of events to deduplicate
   * @returns Array of unique events
   */
  private deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
    return events.filter((event, index) => {
      return !events
        .slice(0, index)
        .some((prevEvent) => this.areEventsDuplicate(event, prevEvent));
    });
  }

  /**
   * Filter events that block available time slots
   * Requirement: 7.5 (Event type blocking semantics)
   * Task 22: Implementation
   *
   * Determines which events should be considered as blocking time when
   * calculating available slots. Different event types have different
   * blocking semantics:
   *
   * Blocking event types (block time):
   * - default: Regular meetings and appointments
   * - outOfOffice: Vacation, leave, absence periods
   * - focusTime: Deep work time blocks
   *
   * Non-blocking event types (do NOT block time):
   * - workingLocation: Metadata only (where you're working from)
   * - birthday: All-day reminders (informational)
   * - fromGmail: Auto-generated informational events
   *
   * EventKit events (eventType=undefined) are treated as 'default' (blocking)
   * for backward compatibility.
   *
   * @param events - Array of events to filter
   * @param respectBlockingEventTypes - If true, respect event type semantics;
   *                                    if false, treat all non-birthday/fromGmail as blocking
   *                                    (backward compatible behavior)
   * @returns Array of events that block available time slots
   */
  private filterBlockingEvents(
    events: CalendarEvent[],
    respectBlockingEventTypes: boolean = true
  ): CalendarEvent[] {
    if (!respectBlockingEventTypes) {
      // Backward compatible: treat all non-birthday, non-fromGmail as blocking
      return events.filter((e) => {
        const eventType = (e as CalendarEvent & { eventType?: GoogleCalendarEventType }).eventType;
        return eventType !== 'birthday' && eventType !== 'fromGmail';
      });
    }

    // Respect event type blocking semantics:
    // - default: blocks time (meetings, appointments)
    // - outOfOffice: blocks time (vacation, absence)
    // - focusTime: blocks time (deep work)
    // - workingLocation: does NOT block time (metadata only)
    // - birthday: does NOT block time (all-day reminder)
    // - fromGmail: does NOT block time (informational)

    const blockingTypes: GoogleCalendarEventType[] = ['default', 'outOfOffice', 'focusTime'];
    return events.filter((e) => {
      const eventType = (e as CalendarEvent & { eventType?: GoogleCalendarEventType }).eventType || 'default';
      return blockingTypes.includes(eventType);
    });
  }

  /**
   * Annotate time slots with working location information
   * Requirement: 3.7 (Working location context)
   * Task 23: Implementation
   *
   * Matches time slots to working location events by date and extracts
   * location type and label from typeSpecificProperties. Uses timezone-aware
   * date comparison (normalizing to YYYY-MM-DD format via toISOString).
   *
   * Working location events are all-day events that indicate where the user
   * is working from on that day (homeOffice, officeLocation, or customLocation).
   *
   * @param slots - Array of time slots to annotate
   * @param workingLocationEvents - Array of working location calendar events
   * @returns Array of time slots with workingLocation field populated
   */
  private annotateWithWorkingLocation(
    slots: TimeSlot[],
    workingLocationEvents: CalendarEvent[]
  ): TimeSlot[] {
    return slots.map((slot) => {
      // Timezone-aware date comparison: normalize to YYYY-MM-DD
      const slotDateNormalized = new Date(slot.start).toISOString().split('T')[0];

      // Find workingLocation event that matches this date
      const locationEvent = workingLocationEvents.find((e) => {
        const eventDateNormalized = new Date(e.start).toISOString().split('T')[0];
        return eventDateNormalized === slotDateNormalized;
      });

      if (locationEvent) {
        // Extract working location info from typeSpecificProperties
        const extendedEvent = locationEvent as unknown as GoogleCalendarEventExtended;
        if (extendedEvent.typeSpecificProperties?.eventType === 'workingLocation') {
          const props = extendedEvent.typeSpecificProperties.properties;
          const workingLocation: WorkingLocationInfo = {
            type: props.type,
            label: props.customLocation?.label || props.officeLocation?.label,
          };
          return {
            ...slot,
            workingLocation,
          };
        }
      }

      // Default to unknown if no working location event found for this date
      return {
        ...slot,
        workingLocation: { type: 'unknown' },
      };
    });
  }

  /**
   * Filter and prioritize time slots by working location preference
   * Requirement: 3.7 (Working location preference)
   * Task 24: Implementation
   *
   * Sorts time slots to prioritize those matching the preferred working location.
   * Matching slots appear first, followed by non-matching slots.
   *
   * If preferredLocation is 'any' or undefined, all slots are returned unchanged.
   *
   * @param slots - Array of time slots with workingLocation field
   * @param preferredLocation - Preferred location type ('homeOffice', 'officeLocation', or 'any')
   * @returns Array of time slots sorted by location preference (matching first)
   */
  private filterByLocationPreference(
    slots: TimeSlot[],
    preferredLocation?: 'homeOffice' | 'officeLocation' | 'any'
  ): TimeSlot[] {
    // No filtering if preferredLocation is 'any' or undefined
    if (!preferredLocation || preferredLocation === 'any') {
      return slots;
    }

    // Prioritize slots matching preferred location
    const matchingSlots = slots.filter(
      (s) => s.workingLocation?.type === preferredLocation
    );
    const otherSlots = slots.filter(
      (s) => s.workingLocation?.type !== preferredLocation
    );

    return [...matchingSlots, ...otherSlots];
  }

  /**
   * Create event in preferred calendar source
   * Requirement: 3, 10, 11 (Multi-source event creation with routing and fallback)
   * Requirement: 1.4 (Recurrence validation - Google Calendar only)
   *
   * Creates an event in the specified source with fallback handling:
   * 1. If preferredSource is specified, try that source first
   * 2. If preferred source fails or not specified, try other enabled sources
   * 3. Throws error if all sources fail
   *
   * Note: EventKit does not support event creation in current implementation,
   * so only Google Calendar is supported for event creation.
   *
   * Recurrence handling (Requirement 1.4):
   * - Recurring events are only supported via Google Calendar
   * - If recurrence is specified and Google Calendar is not available, returns error
   * - EventKit does not support recurring event creation
   *
   * @param request - Event creation request
   * @param preferredSource - Preferred source ('eventkit' | 'google')
   * @returns Created calendar event
   * @throws Error if all sources fail or no sources are enabled
   */
  async createEvent(
    request: CreateEventRequest,
    preferredSource?: 'eventkit' | 'google'
  ): Promise<CalendarEvent> {
    const enabledSources = this.getEnabledSources();

    // Check if any sources are enabled
    if (enabledSources.length === 0) {
      throw new Error('No calendar sources enabled. Please enable at least one source.');
    }

    // Requirement 1.4: Validate recurrence - only supported by Google Calendar
    if (request.recurrence && request.recurrence.length > 0) {
      // Check if Google Calendar service is available
      if (!this.googleCalendarService) {
        throw new Error(
          '繰り返しイベントの作成には Google Calendar が必要です。\n' +
          'Google Calendar の設定を行ってください。\n\n' +
          'Recurring events require Google Calendar.\n' +
          'Please set up Google Calendar integration first.'
        );
      }

      // Check if Google Calendar is available (authenticated)
      const isGoogleAvailable = await this.googleCalendarService.isAvailable();
      if (!isGoogleAvailable) {
        throw new Error(
          '繰り返しイベントの作成には Google Calendar 認証が必要です。\n' +
          'Google Calendar の認証を完了してください。\n\n' +
          'Recurring events require Google Calendar authentication.\n' +
          'Please complete Google Calendar authentication first.'
        );
      }

      // Force Google Calendar for recurring events (ignore preferredSource)
      calendarLogger.info('Recurrence detected - forcing Google Calendar source');
      preferredSource = 'google';
    }

    // Determine source order to try
    let sourcesToTry: ('eventkit' | 'google')[];
    if (preferredSource && enabledSources.includes(preferredSource)) {
      // Try preferred source first, then other enabled sources
      sourcesToTry = [
        preferredSource,
        ...enabledSources.filter((s) => s !== preferredSource),
      ];
    } else {
      // Try all enabled sources in order
      sourcesToTry = enabledSources;
    }

    const errors: Array<{ source: string; error: Error }> = [];

    // Try each source in order
    for (const source of sourcesToTry) {
      try {
        if (source === 'eventkit' && this.calendarService) {
          // Note: EventKit (CalendarService) does not support createEvent in current implementation
          // Skip EventKit and continue to next source
          throw new Error('EventKit does not support event creation in current implementation');
        }

        if (source === 'google' && this.googleCalendarService) {
          // Try Google Calendar
          const event = await this.googleCalendarService.createEvent(request);
          return event;
        }

        // Source is enabled but service is not available
        throw new Error(`${source} service is not available (not initialized)`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ source, error: err });
        calendarLogger.error({ err, source }, `Failed to create event in ${source}`);
      }
    }

    // All sources failed
    const errorMessages = errors
      .map((e) => `${e.source}: ${e.error.message}`)
      .join('; ');
    throw new Error(
      `Failed to create event in all sources. Errors: ${errorMessages}`
    );
  }

  /**
   * Delete event from calendar source
   * Requirement: 5, 10, 11 (Multi-source event deletion with routing and error handling)
   *
   * Deletes an event from the specified source, or attempts deletion
   * from all sources if source is not specified.
   *
   * If source specified:
   * - Deletes from that source only
   * - Throws error if source is not enabled or service not available
   *
   * If source not specified:
   * - Attempts to delete from ALL enabled sources
   * - Event may exist in both EventKit and Google Calendar (duplicate)
   * - Uses Promise.allSettled() to try all sources
   * - 404 errors (event not found) do not cause failure
   * - Only throws if ALL attempts fail with non-404 errors
   *
   * @param eventId - Event ID to delete
   * @param source - Optional source ('eventkit' | 'google')
   * @param scope - Optional recurrence scope ('thisEvent', 'thisAndFuture', 'allEvents')
   * @throws Error if source specified and not available, or all sources fail with non-404 errors
   */
  async deleteEvent(
    eventId: string,
    source?: 'eventkit' | 'google',
    scope?: RecurrenceScope
  ): Promise<void> {
    const enabledSources = this.getEnabledSources();

    // If source specified, delete from that source only
    if (source) {
      if (!enabledSources.includes(source)) {
        throw new Error(`Source ${source} is not enabled`);
      }

      if (source === 'eventkit' && this.calendarService) {
        // Note: EventKit (CalendarService) does not support deleteEvent in current implementation
        throw new Error(
          'EventKit does not support event deletion in current implementation'
        );
      }

      if (source === 'google' && this.googleCalendarService) {
        await this.googleCalendarService.deleteEvent(eventId, undefined, scope);
        return;
      }

      throw new Error(`Service for ${source} is not available`);
    }

    // No source specified - try all enabled sources
    const promises: Promise<void | { source: string; error: Error }>[] = [];

    if (enabledSources.includes('eventkit') && this.calendarService) {
      // Note: EventKit does not support deleteEvent yet - skip silently
      promises.push(Promise.resolve());
    }

    if (enabledSources.includes('google') && this.googleCalendarService) {
      promises.push(
        this.googleCalendarService
          .deleteEvent(eventId, undefined, scope)
          .catch((error: Error) => ({ source: 'google', error }))
      );
    }

    // If no promises to execute, nothing to delete
    if (promises.length === 0) {
      throw new Error('No calendar sources available for deletion');
    }

    const results = await Promise.allSettled(promises);

    // Check if at least one deletion succeeded or got 404
    let hasSuccess = false;
    const errors: Array<{ source: string; error: Error }> = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        // Check if fulfilled value is an error object or void
        const value = result.value;
        if (value && typeof value === 'object' && 'error' in value) {
          // This is an error from .catch()
          const errorResult = value as { source: string; error: Error };
          const message = errorResult.error.message.toLowerCase();
          if (message.includes('not found') || message.includes('404')) {
            // 404 is OK - event already deleted
            hasSuccess = true;
          } else {
            // Other error - collect it
            errors.push(errorResult);
          }
        } else {
          // Successful deletion
          hasSuccess = true;
        }
      }
    }

    // If no success and we have errors, throw
    if (!hasSuccess && errors.length > 0) {
      const errorMessages = errors
        .map((e) => `${e.source}: ${e.error.message}`)
        .join('; ');
      throw new Error(`Failed to delete event from all sources. Errors: ${errorMessages}`);
    }
  }

  /**
   * Find available time slots considering all enabled sources
   * Requirement: 7 (Multi-source slot detection)
   * Requirement: 3.7 (Working Location Aware Scheduling)
   * Task 20a: Basic filtering implementation
   * Task 20b: Suitability calculation integration
   * Task 25: Working location filtering integration
   *
   * Fetches events from all enabled sources, merges and deduplicates,
   * then calculates available slots based on working hours and preferences.
   * Applies working location filtering and suitability scoring.
   *
   * @param request - Slot search request
   * @returns Array of available time slots sorted by suitability and location preference
   */
  async findAvailableSlots(
    request: FindSlotsRequest
  ): Promise<AvailableSlot[]> {
    // Step 1: Get all events from enabled sources (already merged/deduplicated by getEvents)
    const events = await this.getEvents(request.startDate, request.endDate);

    // Step 2: Filter blocking events based on respectBlockingEventTypes parameter
    // Default to true for backward compatibility with event type blocking semantics
    const respectBlockingEventTypes = request.respectBlockingEventTypes ?? true;
    const blockingEvents = this.filterBlockingEvents(events, respectBlockingEventTypes);

    // Step 3: Filter workingLocation events separately for annotation
    const workingLocationEvents = events.filter((e) => {
      const eventType = (e as CalendarEvent & { eventType?: GoogleCalendarEventType }).eventType;
      return eventType === 'workingLocation';
    });

    // Sort blocking events by start time
    const sortedBlockingEvents = blockingEvents.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    // Get working hours from config or use request.workingHours
    const workingHours = request.workingHours || this.getDefaultWorkingHours();

    // Get duration parameters
    const minDuration = request.minDurationMinutes || 25;
    const maxDuration = request.maxDurationMinutes || 480; // 8 hours

    // Step 4: Generate slots for each day in the date range based on blocking events
    const slots: AvailableSlot[] = [];
    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);

    // Iterate through each day in the range
    for (
      let currentDate = new Date(startDate);
      currentDate <= endDate;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const daySlots = this.findDaySlots(
        currentDate,
        sortedBlockingEvents,
        workingHours,
        minDuration,
        maxDuration
      );
      slots.push(...daySlots);
    }

    // Apply suitability scoring to all slots
    const slotsWithSuitability = this.calculateSuitabilityForSlots(slots);

    // Step 5: Annotate slots with working location context
    const annotatedSlots = this.annotateWithWorkingLocation(
      slotsWithSuitability,
      workingLocationEvents
    ) as AvailableSlot[];

    // Step 6: Filter and prioritize by working location preference
    const locationFilteredSlots = this.filterByLocationPreference(
      annotatedSlots,
      request.preferredWorkingLocation
    ) as AvailableSlot[];

    // Sort by suitability (excellent > good > acceptable)
    // Then by start time as secondary sort
    // Note: location preference has already been applied by filterByLocationPreference
    const sortedSlots = locationFilteredSlots.sort((a, b) => {
      const suitabilityOrder = {
        excellent: 0,
        good: 1,
        acceptable: 2,
      };
      const suitabilityDiff =
        suitabilityOrder[a.suitability] - suitabilityOrder[b.suitability];
      if (suitabilityDiff !== 0) {
        return suitabilityDiff;
      }
      // Secondary sort by start time
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    return sortedSlots;
  }

  /**
   * Get default working hours
   * Requirement: 7
   *
   * Returns working hours from config or default (09:00 - 18:00)
   *
   * @returns Working hours configuration
   */
  private getDefaultWorkingHours(): { start: string; end: string } {
    // Check if config has working hours defined
    if (
      this.config?.calendar?.sources?.google?.enableNotifications !== undefined
    ) {
      // Future: config.workingHours could be added here
      // For now, return default
    }

    return { start: '09:00', end: '18:00' };
  }

  /**
   * Calculate suitability for all slots
   * Requirement: 7 (Task 20b)
   *
   * Applies suitability scoring to slots based on:
   * - Day type (deep work vs meeting heavy) from config
   * - Time of day (morning slots preferred)
   * - Slot duration (longer slots better for deep work)
   *
   * @param slots - Array of slots to score
   * @returns Array of slots with suitability applied
   */
  private calculateSuitabilityForSlots(
    slots: AvailableSlot[]
  ): AvailableSlot[] {
    // Get working cadence config (deep work days, meeting heavy days)
    const deepWorkDays = this.config?.calendar?.deepWorkDays || [];
    const meetingHeavyDays = this.config?.calendar?.meetingHeavyDays || [];

    return slots.map((slot) => {
      const slotDate = new Date(slot.start);
      const dayName = slotDate.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = slotDate.getHours();

      let suitability: 'excellent' | 'good' | 'acceptable' = 'good';
      let dayType: 'deep-work' | 'meeting-heavy' | 'normal' = 'normal';
      let reason = slot.reason;

      // Determine day type and base suitability
      if (deepWorkDays.includes(dayName)) {
        dayType = 'deep-work';
        // Deep work days are excellent for focused work
        suitability = 'excellent';
        reason = `${dayName} is a deep work day - excellent for focused tasks`;
      } else if (meetingHeavyDays.includes(dayName)) {
        dayType = 'meeting-heavy';
        // Meeting heavy days are acceptable (not ideal but usable)
        suitability = 'acceptable';
        reason = `${dayName} is a meeting-heavy day - consider rescheduling for deep work`;
      } else {
        dayType = 'normal';
        // Normal days are good
        suitability = 'good';
      }

      // Adjust suitability based on time of day and duration
      // Morning slots (before 12:00) are generally better for deep work
      if (hour < 12 && slot.durationMinutes >= 60) {
        if (suitability === 'good') {
          suitability = 'excellent';
          reason = `Morning slot with ${slot.durationMinutes} minutes - ideal for deep work`;
        }
      }

      // Very short slots (<25 min) are less suitable
      if (slot.durationMinutes < 25) {
        if (suitability === 'excellent') {
          suitability = 'good';
        } else if (suitability === 'good') {
          suitability = 'acceptable';
        }
        reason = `Short slot (${slot.durationMinutes} minutes) - best for quick tasks`;
      }

      // Very long slots (>4 hours) on deep work days are excellent
      if (slot.durationMinutes > 240 && dayType === 'deep-work') {
        suitability = 'excellent';
        reason = `Extended ${slot.durationMinutes} minute slot on ${dayName} - perfect for deep work`;
      }

      return {
        ...slot,
        suitability,
        dayType,
        reason,
      };
    });
  }

  /**
   * Find available slots for a single day
   * Requirement: 7
   *
   * Calculates gaps between events within working hours for a specific day.
   *
   * @param date - Date to find slots for
   * @param events - All events (sorted by start time)
   * @param workingHours - Working hours configuration
   * @param minDuration - Minimum slot duration in minutes
   * @param maxDuration - Maximum slot duration in minutes
   * @returns Array of available slots for this day
   */
  private findDaySlots(
    date: Date,
    events: CalendarEvent[],
    workingHours: { start: string; end: string },
    minDuration: number,
    maxDuration: number
  ): AvailableSlot[] {
    const slots: AvailableSlot[] = [];

    // Parse working hours
    const [startHour, startMin] = workingHours.start.split(':').map(Number);
    const [endHour, endMin] = workingHours.end.split(':').map(Number);

    // Create working hours boundaries for this day
    const workStart = new Date(date);
    workStart.setHours(startHour, startMin, 0, 0);

    const workEnd = new Date(date);
    workEnd.setHours(endHour, endMin, 0, 0);

    // Filter events for this day (events that overlap with working hours)
    const dayEvents = events
      .filter((e) => {
        const eventStart = new Date(e.start);
        const eventEnd = new Date(e.end);

        // Event must overlap with this day's working hours
        return eventStart < workEnd && eventEnd > workStart;
      })
      .filter((e) => !e.isAllDay) // Exclude all-day events
      .map((e) => ({
        start: new Date(e.start),
        end: new Date(e.end),
        title: e.title,
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    // If all-day event exists, no slots available
    const hasAllDayEvent = events.some((e) => {
      const eventStart = new Date(e.start);
      const eventEnd = new Date(e.end);
      return e.isAllDay && eventStart <= workStart && eventEnd >= workEnd;
    });

    if (hasAllDayEvent) {
      return [];
    }

    // Find gaps between events
    let currentTime = workStart;

    for (const event of dayEvents) {
      // Calculate gap before this event
      const gapStart = currentTime;
      const gapEnd =
        event.start < workStart
          ? workStart
          : event.start > workEnd
            ? workEnd
            : event.start;

      const gapMinutes = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60);

      // Add slot if gap meets duration requirements
      if (gapMinutes >= minDuration && gapMinutes <= maxDuration) {
        slots.push({
          start: gapStart.toISOString(),
          end: gapEnd.toISOString(),
          durationMinutes: Math.floor(gapMinutes),
          // Note: suitability will be calculated in Task 20b
          suitability: 'good',
          reason: `${Math.floor(gapMinutes)}分の空き時間`,
          conflicts: [],
          dayType: 'normal',
          source: 'eventkit', // Source doesn't matter for merged slots
        });
      }

      // Move current time to end of event
      const eventEnd = event.end > workEnd ? workEnd : event.end;
      currentTime = eventEnd > currentTime ? eventEnd : currentTime;
    }

    // Check remaining time after last event
    const remainingMinutes =
      (workEnd.getTime() - currentTime.getTime()) / (1000 * 60);

    if (remainingMinutes >= minDuration && remainingMinutes <= maxDuration) {
      slots.push({
        start: currentTime.toISOString(),
        end: workEnd.toISOString(),
        durationMinutes: Math.floor(remainingMinutes),
        suitability: 'good',
        reason: `${Math.floor(remainingMinutes)}分の空き時間`,
        conflicts: [],
        dayType: 'normal',
        source: 'eventkit',
      });
    }

    return slots;
  }

  /**
   * Sync calendars between sources
   * Requirement: 8 (Calendar synchronization)
   *
   * Synchronizes events between EventKit and Google Calendar when both
   * sources are enabled. Handles conflicts and provides sync results.
   *
   * Note: This is a stub implementation. Full sync logic can be added later.
   * Currently, it validates that both sources are enabled and returns empty results.
   *
   * @returns Sync result with statistics and errors
   * @throws Error if both sources are not enabled
   */
  async syncCalendars(): Promise<SyncResult> {
    const enabledSources = this.getEnabledSources();

    // Check if both sources are enabled
    if (enabledSources.length < 2) {
      throw new Error('Both EventKit and Google Calendar must be enabled for sync');
    }

    // Verify that both specific sources are enabled
    const hasEventKit = enabledSources.includes('eventkit');
    const hasGoogle = enabledSources.includes('google');

    if (!hasEventKit || !hasGoogle) {
      throw new Error('Both EventKit and Google Calendar must be enabled for sync');
    }

    // For now, return empty result
    // Full sync implementation to be added in future
    return {
      success: true,
      eventsAdded: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      conflicts: [],
      errors: [],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get sync status between calendar sources
   * Requirement: 8 (Calendar synchronization)
   *
   * Returns the current sync status including last sync time,
   * next scheduled sync, and source availability.
   *
   * Note: This is a stub implementation. lastSyncTime tracking will be added
   * when full sync implementation is completed.
   *
   * @returns Sync status information
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const enabledSources = this.getEnabledSources();
    const isEnabled = enabledSources.length >= 2
      && enabledSources.includes('eventkit')
      && enabledSources.includes('google');

    // Check EventKit availability
    const eventkitAvailable = enabledSources.includes('eventkit') && !!this.calendarService;

    // Check Google Calendar availability
    const googleAvailable = enabledSources.includes('google') && !!this.googleCalendarService;

    // Calculate next sync time based on config sync interval (default: 300 seconds = 5 minutes)
    const syncInterval = this.config?.calendar?.sources?.google?.syncInterval || 300;
    const nextSyncTime = isEnabled
      ? new Date(Date.now() + syncInterval * 1000).toISOString()
      : undefined;

    return {
      isEnabled,
      lastSyncTime: undefined, // TODO: Store last sync time when full sync is implemented
      nextSyncTime,
      sources: {
        eventkit: { available: eventkitAvailable },
        google: { available: googleAvailable },
      },
    };
  }

  /**
   * Health check for calendar sources
   * Requirement: 10, 11 (Health check for both sources)
   * Task 22: Implementation
   *
   * Checks availability and health of all calendar sources by calling
   * their respective isAvailable() methods. Returns a status object
   * indicating which sources are currently healthy and available.
   *
   * This method never throws errors - it catches all failures and returns
   * false for sources that are unavailable or unhealthy.
   *
   * @returns Object indicating health status of each source
   */
  async healthCheck(): Promise<{ eventkit: boolean; google: boolean }> {
    const checks = await Promise.all([
      // EventKit health check
      (async () => {
        if (!this.calendarService) {
          return false;
        }
        try {
          return await this.calendarService.isAvailable();
        } catch (error) {
          calendarLogger.error({ err: error }, 'EventKit health check failed');
          return false;
        }
      })(),

      // Google Calendar health check
      (async () => {
        if (!this.googleCalendarService) {
          return false;
        }
        try {
          return await this.googleCalendarService.isAvailable();
        } catch (error) {
          calendarLogger.error({ err: error }, 'Google Calendar health check failed');
          return false;
        }
      })(),
    ]);

    return {
      eventkit: checks[0],
      google: checks[1],
    };
  }

  /**
   * Respond to a calendar event
   * Requirement: 6 (Event response/RSVP)
   *
   * Routes event response to the appropriate calendar source.
   * Supports EventKit (via CalendarEventResponseService) and Google Calendar.
   * If source is not specified, attempts to determine source by fetching
   * the event from all enabled sources.
   *
   * @param eventId - Event ID
   * @param response - Response type: 'accept', 'decline', or 'tentative'
   * @param source - Optional source routing ('eventkit' or 'google')
   * @param calendarId - Optional calendar ID (for Google Calendar)
   * @returns Success status and message
   * @throws Error if event not found or response fails
   */
  async respondToEvent(
    eventId: string,
    response: 'accept' | 'decline' | 'tentative',
    source?: 'eventkit' | 'google',
    calendarId?: string
  ): Promise<{ success: boolean; message: string; source?: string }> {
    const enabledSources = this.getEnabledSources();

    // If source specified, route to that source
    if (source) {
      if (!enabledSources.includes(source)) {
        throw new Error(`Calendar source '${source}' is not enabled`);
      }

      if (source === 'google') {
        if (!this.googleCalendarService) {
          throw new Error('Google Calendar service not initialized');
        }

        try {
          // Convert response type: 'accept' -> 'accepted', etc.
          const googleResponse = response === 'accept' ? 'accepted' :
                                 response === 'decline' ? 'declined' : 'tentative';
          await this.googleCalendarService.respondToEvent(
            eventId,
            googleResponse,
            calendarId
          );
          return {
            success: true,
            message: `Successfully responded '${response}' to Google Calendar event`,
            source: 'google',
          };
        } catch (error) {
          throw new Error(
            `Failed to respond to Google Calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      } else if (source === 'eventkit') {
        // EventKit response is handled via CalendarEventResponseService
        throw new Error(
          'EventKit event responses should be handled via CalendarEventResponseService directly'
        );
      }
    }

    // No source specified - try to find event in enabled sources
    // For now, prefer Google Calendar if enabled, as EventKit is typically
    // handled via CalendarEventResponseService
    if (enabledSources.includes('google') && this.googleCalendarService) {
      try {
        const googleResponse = response === 'accept' ? 'accepted' :
                               response === 'decline' ? 'declined' : 'tentative';
        await this.googleCalendarService.respondToEvent(
          eventId,
          googleResponse,
          calendarId
        );
        return {
          success: true,
          message: `Successfully responded '${response}' to Google Calendar event`,
          source: 'google',
        };
      } catch (error) {
        // If Google Calendar fails and EventKit is enabled, suggest trying EventKit
        if (enabledSources.includes('eventkit')) {
          throw new Error(
            `Event not found in Google Calendar. If this is an EventKit event, please use CalendarEventResponseService. Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
        throw error;
      }
    }

    // If only EventKit is enabled
    if (enabledSources.includes('eventkit')) {
      throw new Error(
        'EventKit event responses should be handled via CalendarEventResponseService directly'
      );
    }

    throw new Error('No calendar sources enabled');
  }
}
