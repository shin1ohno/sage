/**
 * Calendar Service Common Types
 *
 * Shared type definitions for calendar event services
 * (creator, deleter, response).
 */

/**
 * Supported platform types for calendar operations
 */
export type CalendarPlatform = 'macos' | 'ios' | 'ipados' | 'web' | 'unknown';

/**
 * Base platform info shared by all calendar services
 */
export interface CalendarPlatformInfo {
  platform: CalendarPlatform;
  hasEventKitAccess: boolean;
}

/**
 * Calendar type identifiers
 */
export type CalendarType = 'google' | 'icloud' | 'exchange' | 'local';

/**
 * Participant status in calendar events
 */
export type EventParticipantStatus =
  | 'accepted'
  | 'declined'
  | 'tentative'
  | 'pending'
  | 'unknown';

/**
 * Event response types
 */
export type EventResponseType = 'accept' | 'decline' | 'tentative';

/**
 * Default retry options for calendar operations
 *
 * Used by creator, deleter, and response services for
 * consistent retry behavior with AppleScript/EventKit.
 */
export const CALENDAR_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelay: 500,
  maxDelay: 5000,
} as const;

/**
 * Calendar source type for multi-calendar resource support
 */
export type CalendarSource = 'eventkit' | 'google';

/**
 * Calendar resource representing an individual calendar from any source
 * Requirement: multi-calendar-resources 1.3, 4.1
 */
export interface CalendarResource {
  /** Unique identifier for the calendar */
  id: string;
  /** Display name of the calendar */
  name: string;
  /** Source type (eventkit or google) */
  source: CalendarSource;
  /** Calendar color in hex format (e.g., "#4285f4") */
  color?: string;
  /** Whether this is the primary/default calendar */
  isPrimary?: boolean;
  /** Whether events can be created on this calendar */
  isWritable?: boolean;
  /** Access role for Google Calendar */
  accessRole?: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
}
