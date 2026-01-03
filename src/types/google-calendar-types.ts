/**
 * Google Calendar API Type Definitions
 * Requirement: 1, 2, 3, 4, 5, 6
 * Design: .claude/specs/google-calendar-api/design.md (Data Models section)
 */

/**
 * Google Calendar Event (internal representation from Google Calendar API)
 * Requirement: 2
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
  iCalUID: string; // Used for deduplication
  status?: 'confirmed' | 'tentative' | 'cancelled';
  organizer?: {
    email: string;
    displayName?: string;
  };
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
}

/**
 * Convert Google Calendar Event to unified CalendarEvent format
 * Requirement: 2
 * @param googleEvent Google Calendar API event object
 * @returns Unified CalendarEvent object
 */
export function convertGoogleToCalendarEvent(googleEvent: GoogleCalendarEvent): CalendarEvent {
  return {
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
