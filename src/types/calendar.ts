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
