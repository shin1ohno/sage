/**
 * Google Calendar API Type Definitions
 * Requirement: 1, 2, 3, 4, 5, 6
 * Design: .claude/specs/google-calendar-api/design.md (Data Models section)
 */

import { describeRecurrence } from '../utils/recurrence-validator.js';

// ============================================================
// Event Type Discriminated Union
// ============================================================

/**
 * Google Calendar Event Type
 * Represents all 6 event types supported by Google Calendar API v3
 * Requirement: 6.2
 */
export type GoogleCalendarEventType =
  | 'default'
  | 'outOfOffice'
  | 'focusTime'
  | 'workingLocation'
  | 'birthday'
  | 'fromGmail';

/**
 * Auto Decline Mode for Out of Office and Focus Time events
 * Requirement: 1, 2
 */
export type AutoDeclineMode =
  | 'declineNone'
  | 'declineAllConflictingInvitations'
  | 'declineOnlyNewConflictingInvitations';

/**
 * Recurrence Scope for update/delete operations on recurring events
 * - 'thisEvent': Apply to only this single instance
 * - 'thisAndFuture': Apply to this instance and all future instances
 * - 'allEvents': Apply to all instances in the series
 */
export type RecurrenceScope = 'thisEvent' | 'thisAndFuture' | 'allEvents';

/**
 * Out of Office Properties
 * Used for vacation blocks and automatic decline functionality
 * Requirement: 1
 */
export interface OutOfOfficeProperties {
  autoDeclineMode: AutoDeclineMode;
  declineMessage?: string;
}

/**
 * Focus Time Properties
 * Used for deep work time blocks with Google Chat integration
 * Requirement: 2
 */
export interface FocusTimeProperties {
  autoDeclineMode: AutoDeclineMode;
  declineMessage?: string;
  chatStatus?: 'available' | 'doNotDisturb';
}

/**
 * Working Location Properties
 * Records remote/office/custom location information
 * Requirement: 3
 */
export interface WorkingLocationProperties {
  type: 'homeOffice' | 'officeLocation' | 'customLocation';
  homeOffice?: boolean;
  customLocation?: {
    label: string;
  };
  officeLocation?: {
    buildingId?: string;
    floorId?: string;
    floorSectionId?: string;
    deskId?: string;
    label?: string;
  };
}

/**
 * Birthday Properties
 * Manages birthdays, anniversaries, and other recurring personal events
 * Requirement: 4
 */
export interface BirthdayProperties {
  type: 'birthday' | 'anniversary' | 'custom' | 'other' | 'self';
  customTypeName?: string;
  /** People API resource name (read-only) */
  readonly contact?: string;
}

/**
 * Event Type Specific Properties (discriminated union)
 * Combines eventType with corresponding properties for type-safe handling
 * Requirement: 6.3
 */
export type EventTypeSpecificProperties =
  | { eventType: 'default'; properties?: never }
  | { eventType: 'outOfOffice'; properties: OutOfOfficeProperties }
  | { eventType: 'focusTime'; properties: FocusTimeProperties }
  | { eventType: 'workingLocation'; properties: WorkingLocationProperties }
  | { eventType: 'birthday'; properties: BirthdayProperties }
  | { eventType: 'fromGmail'; properties?: never };

/**
 * Google Calendar Event (internal representation from Google Calendar API)
 * Supports all 6 event types: default, outOfOffice, focusTime, workingLocation, birthday, fromGmail
 * Requirement: 2, 6
 */
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string; // ISO 8601 (with time)
    date?: string; // YYYY-MM-DD (all-day)
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  recurringEventId?: string;
  /** RFC 5545 recurrence rules (e.g., ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]) */
  recurrence?: string[];
  iCalUID: string; // Used for deduplication
  status?: 'confirmed' | 'tentative' | 'cancelled';
  organizer?: {
    email: string;
    displayName?: string;
  };
  /**
   * Event type from Google Calendar API
   * Defaults to 'default' if not specified
   * Requirement: 6.2
   */
  eventType?: GoogleCalendarEventType;
  /**
   * Properties for out of office events (vacation, leave)
   * Only present when eventType is 'outOfOffice'
   * Requirement: 1
   */
  outOfOfficeProperties?: OutOfOfficeProperties;
  /**
   * Properties for focus time events (deep work blocks)
   * Only present when eventType is 'focusTime'
   * Requirement: 2
   */
  focusTimeProperties?: FocusTimeProperties;
  /**
   * Properties for working location events
   * Only present when eventType is 'workingLocation'
   * Requirement: 3
   */
  workingLocationProperties?: WorkingLocationProperties;
  /**
   * Properties for birthday/anniversary events
   * Only present when eventType is 'birthday'
   * Requirement: 4
   */
  birthdayProperties?: BirthdayProperties;
}

/**
 * OAuth tokens for Google Calendar API
 * Requirement: 1
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601 timestamp
  scope: string[];
}

/**
 * Calendar information from Google Calendar API
 * Requirement: 2
 */
export interface CalendarInfo {
  id: string;
  name: string;
  source: 'eventkit' | 'google';
  isPrimary: boolean;
  color?: string;
  accessRole?: 'owner' | 'writer' | 'reader';
}

/**
 * Sync result between EventKit and Google Calendar
 * Requirement: 8 (optional feature)
 */
export interface SyncResult {
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  conflicts: Array<{
    eventId: string;
    reason: string;
    resolution: 'skipped' | 'merged' | 'duplicated';
  }>;
  errors: Array<{
    source: 'eventkit' | 'google';
    error: string;
  }>;
  timestamp: string; // ISO 8601
}

/**
 * Sync status between calendar sources
 * Requirement: 8 (optional feature)
 */
export interface SyncStatus {
  lastSyncTime?: string; // ISO 8601
  nextSyncTime?: string; // ISO 8601
  isEnabled: boolean;
  sources: {
    eventkit: { available: boolean; lastError?: string };
    google: { available: boolean; lastError?: string };
  };
}

/**
 * Extended Calendar Event with additional fields for Google Calendar integration
 * Extends the base CalendarEvent from calendar-service.ts
 * Supports event types and type-specific properties for enhanced functionality
 * Requirement: 2, 3, 4, 5, 6
 */
export interface CalendarEvent {
  id: string; // UID (EventKit) or Event ID (Google)
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  isAllDay: boolean;
  source: 'eventkit' | 'google'; // Source identifier
  calendar?: string; // Calendar name/ID
  location?: string;
  description?: string;
  attendees?: string[]; // Email addresses
  status?: 'confirmed' | 'tentative' | 'cancelled';
  iCalUID?: string; // For deduplication
  /**
   * Event type for Google Calendar events
   * Defaults to 'default' for standard events
   * Requirement: 6.2
   */
  eventType?: GoogleCalendarEventType;
  /**
   * Type-specific properties combining eventType with corresponding properties
   * Enables type-safe access to event-specific data
   * Requirement: 6.3
   */
  typeSpecificProperties?: EventTypeSpecificProperties;
  /**
   * RFC 5545 recurrence rules (e.g., ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"])
   * Present on the master event of a recurring series
   * Requirement: recurring-calendar-events
   */
  recurrence?: string[];
  /**
   * ID of the master recurring event this instance belongs to
   * Present on individual instances of a recurring series
   * Requirement: recurring-calendar-events
   */
  recurringEventId?: string;
  /**
   * Human-readable description of the recurrence pattern
   * E.g., "Weekly on Monday, Wednesday, Friday"
   * Requirement: recurring-calendar-events
   */
  recurrenceDescription?: string;
}

/**
 * Detect event type from Google Calendar event
 * Checks eventType field first, then falls back to detecting from type-specific properties
 * Requirement: 6.2
 * @param googleEvent Google Calendar API event object
 * @returns GoogleCalendarEventType ('default' if not detected)
 */
export function detectEventType(googleEvent: GoogleCalendarEvent): GoogleCalendarEventType {
  // Primary: Check for explicit eventType field
  if (googleEvent.eventType) {
    return googleEvent.eventType;
  }

  // Fallback: Detect from type-specific properties
  if (googleEvent.outOfOfficeProperties) {
    return 'outOfOffice';
  }
  if (googleEvent.focusTimeProperties) {
    return 'focusTime';
  }
  if (googleEvent.workingLocationProperties) {
    return 'workingLocation';
  }
  if (googleEvent.birthdayProperties) {
    return 'birthday';
  }

  // Default to 'default' if no eventType detected
  return 'default';
}

/**
 * Extract type-specific properties from Google Calendar event
 * Returns the appropriate properties object based on detected eventType
 * Requirement: 6.3
 * @param googleEvent Google Calendar API event object
 * @param eventType The detected event type
 * @returns EventTypeSpecificProperties or undefined for 'default' and 'fromGmail' types
 */
export function extractTypeSpecificProperties(
  googleEvent: GoogleCalendarEvent,
  eventType: GoogleCalendarEventType
): EventTypeSpecificProperties | undefined {
  switch (eventType) {
    case 'outOfOffice':
      if (googleEvent.outOfOfficeProperties) {
        return { eventType: 'outOfOffice', properties: googleEvent.outOfOfficeProperties };
      }
      return undefined;
    case 'focusTime':
      if (googleEvent.focusTimeProperties) {
        return { eventType: 'focusTime', properties: googleEvent.focusTimeProperties };
      }
      return undefined;
    case 'workingLocation':
      if (googleEvent.workingLocationProperties) {
        return { eventType: 'workingLocation', properties: googleEvent.workingLocationProperties };
      }
      return undefined;
    case 'birthday':
      if (googleEvent.birthdayProperties) {
        return { eventType: 'birthday', properties: googleEvent.birthdayProperties };
      }
      return undefined;
    case 'fromGmail':
      // fromGmail events have no type-specific properties
      return undefined;
    case 'default':
    default:
      // default events have no type-specific properties
      return undefined;
  }
}

/**
 * Convert Google Calendar Event to unified CalendarEvent format
 * Calls detectEventType() to determine eventType and extractTypeSpecificProperties() for type-specific data
 * Preserves all existing fields for backward compatibility
 * Requirement: 2, 6, 6.2, 6.3, 8.4, 9.3, recurring-calendar-events 6.1, 6.2, 6.3
 * @param googleEvent Google Calendar API event object
 * @returns Unified CalendarEvent object with eventType and typeSpecificProperties
 */
export function convertGoogleToCalendarEvent(googleEvent: GoogleCalendarEvent): CalendarEvent {
  // Detect event type using helper function
  const eventType = detectEventType(googleEvent);

  // Extract type-specific properties using helper function
  const typeSpecificProperties = extractTypeSpecificProperties(googleEvent, eventType);

  // Extract recurrence information
  // Requirement: recurring-calendar-events 6.1, 6.2, 6.3
  const recurrence = googleEvent.recurrence; // Array of RRULE strings from parent event
  const recurringEventId = googleEvent.recurringEventId; // ID of parent event for instances
  const recurrenceDescription =
    recurrence && recurrence.length > 0 ? describeRecurrence(recurrence) : undefined;

  return {
    // Existing fields (backward compatibility)
    id: googleEvent.id,
    title: googleEvent.summary,
    start: googleEvent.start.dateTime || googleEvent.start.date || '',
    end: googleEvent.end.dateTime || googleEvent.end.date || '',
    isAllDay: !!googleEvent.start.date,
    source: 'google',
    calendar: googleEvent.organizer?.email,
    location: googleEvent.location,
    description: googleEvent.description,
    attendees: googleEvent.attendees?.map((a) => a.email),
    status: googleEvent.status,
    iCalUID: googleEvent.iCalUID,
    // New fields for event type support
    eventType,
    typeSpecificProperties,
    // Recurrence information (Requirement: recurring-calendar-events 6)
    recurrence,
    recurringEventId,
    recurrenceDescription,
  };
}

/**
 * Check if two events are duplicates based on iCalUID or title+time matching
 * Requirement: 7 (deduplication)
 * @param event1 First calendar event
 * @param event2 Second calendar event
 * @returns true if events are duplicates
 */
export function areEventsDuplicate(event1: CalendarEvent, event2: CalendarEvent): boolean {
  // Method 1: iCalUID comparison (most reliable)
  if (event1.iCalUID && event2.iCalUID && event1.iCalUID === event2.iCalUID) {
    return true;
  }

  // Method 2: Title + start time + end time matching
  const titleMatch = event1.title.toLowerCase() === event2.title.toLowerCase();
  const startMatch = event1.start === event2.start;
  const endMatch = event1.end === event2.end;

  return titleMatch && startMatch && endMatch;
}

// ============================================================
// Room Availability Types
// ============================================================

/**
 * Meeting room resource from Google Workspace
 * Requirement: room-availability-search 1.9
 */
export interface RoomResource {
  /** Calendar ID (e.g., "room-huddle-1@company.com") */
  id: string;
  /** Display name */
  name: string;
  /** Resource email address */
  email: string;
  /** Room capacity */
  capacity?: number;
  /** Room features (e.g., ["videoConference", "whiteboard"]) */
  features?: string[];
  /** Building name */
  building?: string;
  /** Floor identifier */
  floor?: string;
  /** Room description */
  description?: string;
}

/**
 * Filter options for room resource search
 * Requirement: room-availability-search 1.5, 1.6, 1.7, 1.8
 */
export interface RoomResourceFilter {
  /** Minimum required capacity */
  minCapacity?: number;
  /** Filter by building name */
  building?: string;
  /** Filter by floor */
  floor?: string;
  /** Required features (all must be present) */
  features?: string[];
}

/**
 * Request parameters for room availability search
 * Requirement: room-availability-search 1.1, 1.2
 */
export interface RoomAvailabilityRequest {
  /** Start time in ISO 8601 format (required) */
  startTime: string;
  /** End time in ISO 8601 format (optional if durationMinutes specified) */
  endTime?: string;
  /** Duration in minutes (optional if endTime specified) */
  durationMinutes?: number;
  /** Minimum required capacity */
  minCapacity?: number;
  /** Filter by building name */
  building?: string;
  /** Filter by floor */
  floor?: string;
  /** Required features */
  features?: string[];
}

/**
 * Busy period within a time range
 * Requirement: room-availability-search 1.9, 2.2
 */
export interface BusyPeriod {
  /** Start time in ISO 8601 format */
  start: string;
  /** End time in ISO 8601 format */
  end: string;
}

/**
 * Room availability result
 * Requirement: room-availability-search 1.9
 */
export interface RoomAvailability {
  /** Room resource information */
  room: RoomResource;
  /** True if completely free during requested period */
  isAvailable: boolean;
  /** Busy periods within the requested time range */
  busyPeriods: BusyPeriod[];
}

/**
 * Single room availability check result
 * Requirement: room-availability-search 2.1, 2.2, 2.3
 */
export interface SingleRoomAvailability {
  /** Room resource information */
  room: RoomResource;
  /** True if completely free during requested period */
  isAvailable: boolean;
  /** Busy periods within the requested time range */
  busyPeriods: BusyPeriod[];
  /** The requested time period */
  requestedPeriod: {
    start: string;
    end: string;
  };
}

// ============================================================
// People Availability Types
// Requirement: check-others-availability 1, 2, 3, 4
// ============================================================

/**
 * Individual person's availability status
 * Requirement: check-others-availability 1.1, 1.4, 1.5, 1.6
 */
export interface PersonAvailability {
  /** Email address of the person */
  email: string;
  /** Display name (if available) */
  displayName?: string;
  /** True if completely free during requested period */
  isAvailable: boolean;
  /** Busy periods within the requested time range */
  busyPeriods: BusyPeriod[];
  /** Error message if availability check failed for this person */
  error?: string;
}

/**
 * Result of checking multiple people's availability
 * Requirement: check-others-availability 1.1, 1.5
 */
export interface PeopleAvailabilityResult {
  /** Availability status for each person */
  people: PersonAvailability[];
  /** The requested time range */
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * A common free time slot shared by all participants
 * Requirement: check-others-availability 2.1, 2.3, 2.5
 */
export interface CommonFreeSlot {
  /** Start time in ISO 8601 format */
  start: string;
  /** End time in ISO 8601 format */
  end: string;
  /** Duration in minutes */
  durationMinutes: number;
}

/**
 * Resolved participant information after name lookup
 * Requirement: check-others-availability 4.1, 4.2, 4.3
 */
export interface ResolvedParticipant {
  /** Original query (name or email) */
  query: string;
  /** Resolved email address */
  email: string;
  /** Display name from directory */
  displayName?: string;
  /** Error message if resolution failed */
  error?: string;
}

/**
 * Result of finding common availability among multiple people
 * Requirement: check-others-availability 2.1-2.6
 */
export interface CommonAvailabilityResult {
  /** Common free time slots */
  commonSlots: CommonFreeSlot[];
  /** Resolved participant information */
  participants: ResolvedParticipant[];
  /** The requested time range */
  timeRange: {
    start: string;
    end: string;
  };
}
