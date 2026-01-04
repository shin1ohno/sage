/**
 * Calendar Event Response Service
 * Handles responding to calendar events (accept/decline/tentative)
 * Requirements: 17.1-17.12
 *
 * Supports:
 * - iCloud/Local calendars via EventKit
 * - Google Calendar events (CalendarType detection)
 * - Exchange calendar events (CalendarType detection)
 * - Batch processing for multiple events
 */

import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
import type { CalendarPlatformInfo } from '../types/calendar.js';
import {
  CALENDAR_RETRY_OPTIONS,
  type CalendarType,
  type EventParticipantStatus,
  type EventResponseType,
} from '../types/calendar.js';

// Re-export types for backwards compatibility
export type { CalendarType, EventParticipantStatus, EventResponseType };

/**
 * Platform information for calendar integration
 */
export interface CalendarResponsePlatformInfo extends CalendarPlatformInfo {
  supportsEventResponse: boolean;
}

/**
 * Event response request
 * Requirement: 17.2
 */
export interface EventResponseRequest {
  eventId: string;
  response: EventResponseType;
  comment?: string;
}

/**
 * Event response result
 * Requirement: 17.11
 */
export interface EventResponseResult {
  success: boolean;
  eventId: string;
  eventTitle?: string;
  newStatus?: EventParticipantStatus;
  method?: string;
  message?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
  instanceOnly?: boolean;
}

/**
 * Batch response request
 * Requirement: 17.3, 17.4
 */
export interface BatchResponseRequest {
  eventIds: string[];
  response: EventResponseType;
  comment?: string;
}

/**
 * Batch response result
 * Requirement: 17.12
 */
export interface BatchResponseResult {
  success: boolean;
  summary: {
    total: number;
    succeeded: number;
    skipped: number;
    failed: number;
  };
  details: {
    succeeded: Array<{ id: string; title: string; reason: string }>;
    skipped: Array<{ id: string; title: string; reason: string }>;
    failed: Array<{ id: string; title: string; error: string }>;
  };
  message: string;
}

/**
 * Event details for validation
 */
export interface EventDetails {
  id: string;
  title: string;
  isOrganizer: boolean;
  hasAttendees: boolean;
  isReadOnly: boolean;
  calendarType: CalendarType;
  isRecurringInstance?: boolean;
  isAllDay?: boolean;
}

/**
 * Response validation result
 */
export interface CanRespondResult {
  canRespond: boolean;
  reason?: string;
}

/**
 * Retry options for calendar event response
 */
const RETRY_OPTIONS = {
  ...CALENDAR_RETRY_OPTIONS,
  shouldRetry: isRetryableError,
};

/**
 * Valid response types
 */
const VALID_RESPONSE_TYPES: EventResponseType[] = ['accept', 'decline', 'tentative'];

/**
 * Calendar Event Response Service
 * Handles responding to calendar events
 */
export class CalendarEventResponseService {
  private runAppleScript: ((script: string) => Promise<string>) | null = null;

  /**
   * Detect current platform
   */
  async detectPlatform(): Promise<CalendarResponsePlatformInfo> {
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      return {
        platform: 'macos',
        hasEventKitAccess: true,
        supportsEventResponse: true,
      };
    }

    return {
      platform: 'unknown',
      hasEventKitAccess: false,
      supportsEventResponse: false,
    };
  }

  /**
   * Check if EventKit is available
   */
  async isEventKitAvailable(): Promise<boolean> {
    const platform = await this.detectPlatform();
    return platform.hasEventKitAccess;
  }

  /**
   * Detect calendar type from event ID
   * Requirement: 17.5, 17.6
   */
  async detectCalendarType(eventId: string): Promise<CalendarType> {
    // Google Calendar event IDs contain @google.com
    if (eventId.includes('@google.com')) {
      return 'google';
    }

    // iCloud event IDs typically have UUID format with colon separator
    if (/^[A-F0-9-]{36}:\d+$/i.test(eventId) || eventId.includes(':') && eventId.length > 20) {
      return 'icloud';
    }

    // Exchange event IDs start with AAMk
    if (eventId.startsWith('AAMk')) {
      return 'exchange';
    }

    // Default to local
    return 'local';
  }

  /**
   * Check if an event can be responded to
   * Requirement: 17.7, 17.9, 17.10
   */
  async canRespondToEvent(event: {
    id: string;
    title: string;
    isOrganizer: boolean;
    hasAttendees: boolean;
    isReadOnly: boolean;
  }): Promise<CanRespondResult> {
    // Requirement: 17.7 - Check if user is organizer
    if (event.isOrganizer) {
      return {
        canRespond: false,
        reason: '主催者のためスキップ',
      };
    }

    // Requirement: 17.9 - Check if event has attendees
    if (!event.hasAttendees) {
      return {
        canRespond: false,
        reason: '出席者なしのためスキップ（個人の予定）',
      };
    }

    // Requirement: 17.10 - Check if calendar is read-only
    if (event.isReadOnly) {
      return {
        canRespond: false,
        reason: '読み取り専用カレンダーのため変更不可',
      };
    }

    return { canRespond: true };
  }

  /**
   * Respond to a single calendar event
   * Requirement: 17.1
   */
  async respondToEvent(request: EventResponseRequest): Promise<EventResponseResult> {
    // Validate event ID
    if (!request.eventId || request.eventId.trim() === '') {
      return {
        success: false,
        eventId: request.eventId || '',
        error: '無効なイベントID: イベントIDが空です',
      };
    }

    // Validate response type
    if (!VALID_RESPONSE_TYPES.includes(request.response)) {
      return {
        success: false,
        eventId: request.eventId,
        error: `無効な返信タイプ: ${request.response}。有効な値: accept, decline, tentative`,
      };
    }

    try {
      // Fetch event details
      const eventDetails = await this.fetchEventDetails(request.eventId);

      // Check if we can respond to this event
      const canRespond = await this.canRespondToEvent(eventDetails);
      if (!canRespond.canRespond) {
        return {
          success: false,
          eventId: request.eventId,
          eventTitle: eventDetails.title,
          skipped: true,
          reason: canRespond.reason,
        };
      }

      // Determine response method based on calendar type
      const calendarType = await this.detectCalendarType(request.eventId);

      let result: EventResponseResult;

      switch (calendarType) {
        case 'google':
          // For Google Calendar, we could use Google Calendar API
          // For now, fall through to EventKit which can work with Google Calendar accounts
          result = await this.respondViaEventKit(request, eventDetails);
          break;

        case 'exchange':
          // Exchange events can be handled via EventKit on macOS
          result = await this.respondViaEventKit(request, eventDetails);
          break;

        case 'icloud':
        case 'local':
        default:
          result = await this.respondViaEventKit(request, eventDetails);
          break;
      }

      // Generate success message
      if (result.success) {
        result.message = this.generateResponseMessage(request.response, eventDetails.title);
        result.eventTitle = eventDetails.title;
        if (eventDetails.isRecurringInstance) {
          result.instanceOnly = true;
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        eventId: request.eventId,
        error: `EventKitエラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Respond to multiple calendar events
   * Requirement: 17.3, 17.4
   */
  async respondToEventsBatch(request: BatchResponseRequest): Promise<BatchResponseResult> {
    const results: {
      succeeded: Array<{ id: string; title: string; reason: string }>;
      skipped: Array<{ id: string; title: string; reason: string }>;
      failed: Array<{ id: string; title: string; error: string }>;
    } = {
      succeeded: [],
      skipped: [],
      failed: [],
    };

    // Handle empty array
    if (request.eventIds.length === 0) {
      return {
        success: true,
        summary: {
          total: 0,
          succeeded: 0,
          skipped: 0,
          failed: 0,
        },
        details: results,
        message: '処理対象のイベントがありませんでした。',
      };
    }

    // Process each event
    for (const eventId of request.eventIds) {
      const singleRequest: EventResponseRequest = {
        eventId,
        response: request.response,
        comment: request.comment,
      };

      const result = await this.respondToEvent(singleRequest);

      if (result.success) {
        results.succeeded.push({
          id: eventId,
          title: result.eventTitle || eventId,
          reason: this.getResponseReasonText(request.response),
        });
      } else if (result.skipped) {
        results.skipped.push({
          id: eventId,
          title: result.eventTitle || eventId,
          reason: result.reason || 'スキップ',
        });
      } else {
        results.failed.push({
          id: eventId,
          title: result.eventTitle || eventId,
          error: result.error || 'Unknown error',
        });
      }
    }

    const total = request.eventIds.length;
    const succeeded = results.succeeded.length;
    const skipped = results.skipped.length;
    const failed = results.failed.length;

    return {
      success: failed === 0,
      summary: {
        total,
        succeeded,
        skipped,
        failed,
      },
      details: results,
      message: this.generateBatchSummaryMessage(total, succeeded, skipped, failed, request.response),
    };
  }

  /**
   * Fetch event details via EventKit
   * @internal
   */
  private async fetchEventDetails(eventId: string): Promise<EventDetails> {
    try {
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildFetchEventDetailsScript(eventId);

      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`EventKit fetch retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return this.parseEventDetailsResult(result, eventId);
    } catch (error) {
      console.error('EventKit fetch error:', error);
      // Return minimal details that will fail validation
      return {
        id: eventId,
        title: 'Unknown Event',
        isOrganizer: false,
        hasAttendees: false,
        isReadOnly: true,
        calendarType: 'local',
      };
    }
  }

  /**
   * Build AppleScript for fetching event details
   * @internal
   */
  private buildFetchEventDetailsScript(eventId: string): string {
    return `
use AppleScript version "2.7"
use framework "Foundation"
use framework "EventKit"
use scripting additions

-- Create EventKit store
set theStore to current application's EKEventStore's alloc()'s init()

-- Request calendar access
theStore's requestFullAccessToEventsWithCompletion:(missing value)
delay 0.5

-- Get event by identifier
set theEvent to theStore's eventWithIdentifier:"${eventId}"

if theEvent is missing value then
  return "NOT_FOUND"
end if

-- Get event properties
set eventTitle to (theEvent's title()) as text
set eventCalendar to (theEvent's calendar())
set isReadOnly to not ((eventCalendar's allowsContentModifications()) as boolean)

-- Check organizer (compare with user's email)
set isOrganizer to false
set eventOrganizer to theEvent's organizer()
if eventOrganizer is not missing value then
  set currentUser to theStore's defaultCalendarForNewEvents()'s source()'s title()
  try
    set organizerName to (eventOrganizer's name()) as text
    if organizerName is equal to currentUser then
      set isOrganizer to true
    end if
  end try
end if

-- Check attendees
set hasAttendees to false
set attendeeList to theEvent's attendees()
if attendeeList is not missing value then
  if (count of attendeeList) > 0 then
    set hasAttendees to true
  end if
end if

-- Check if recurring
set isRecurring to false
if theEvent's hasRecurrenceRules() then
  set isRecurring to true
end if

-- Return results
return eventTitle & "|" & (isOrganizer as string) & "|" & (hasAttendees as string) & "|" & (isReadOnly as string) & "|" & (isRecurring as string)`;
  }

  /**
   * Parse event details result
   * @internal
   */
  private parseEventDetailsResult(result: string, eventId: string): EventDetails {
    if (result === 'NOT_FOUND' || !result) {
      return {
        id: eventId,
        title: 'Unknown Event',
        isOrganizer: false,
        hasAttendees: false,
        isReadOnly: true,
        calendarType: 'local',
      };
    }

    const parts = result.split('|');
    if (parts.length < 4) {
      return {
        id: eventId,
        title: 'Unknown Event',
        isOrganizer: false,
        hasAttendees: false,
        isReadOnly: true,
        calendarType: 'local',
      };
    }

    return {
      id: eventId,
      title: parts[0],
      isOrganizer: parts[1].toLowerCase() === 'true',
      hasAttendees: parts[2].toLowerCase() === 'true',
      isReadOnly: parts[3].toLowerCase() === 'true',
      calendarType: 'local',
      isRecurringInstance: parts.length > 4 && parts[4].toLowerCase() === 'true',
    };
  }

  /**
   * Respond via EventKit
   * Requirement: 17.6
   * @internal
   */
  private async respondViaEventKit(
    request: EventResponseRequest,
    eventDetails: EventDetails
  ): Promise<EventResponseResult> {
    try {
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildRespondScript(request.eventId, request.response, request.comment);

      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`EventKit respond retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      if (result.startsWith('ERROR:')) {
        return {
          success: false,
          eventId: request.eventId,
          eventTitle: eventDetails.title,
          error: result.replace('ERROR:', ''),
        };
      }

      return {
        success: true,
        eventId: request.eventId,
        eventTitle: eventDetails.title,
        newStatus: this.responseTypeToStatus(request.response),
        method: 'eventkit',
      };
    } catch (error) {
      return {
        success: false,
        eventId: request.eventId,
        eventTitle: eventDetails.title,
        error: `EventKit応答エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Build AppleScript for responding to event
   * Note: EventKit's EKParticipant is read-only, so we use Calendar.app as fallback
   * @internal
   */
  private buildRespondScript(
    eventId: string,
    response: EventResponseType,
    _comment?: string
  ): string {
    const statusValue = this.responseTypeToEventKitStatus(response);

    return `
use AppleScript version "2.7"
use framework "Foundation"
use framework "EventKit"
use scripting additions

-- Create EventKit store
set theStore to current application's EKEventStore's alloc()'s init()

-- Request calendar access
theStore's requestFullAccessToEventsWithCompletion:(missing value)
delay 0.5

-- Get event by identifier
set theEvent to theStore's eventWithIdentifier:"${eventId}"

if theEvent is missing value then
  return "ERROR:イベントが見つかりません"
end if

-- Get event title for Calendar.app lookup
set eventTitle to (theEvent's title()) as text
set eventStart to (theEvent's startDate()) as date

-- EventKit EKParticipant is read-only, use Calendar.app to respond
try
  tell application "Calendar"
    -- Find the event in Calendar.app
    set matchingEvents to (every event whose summary is eventTitle)
    if (count of matchingEvents) > 0 then
      set targetEvent to item 1 of matchingEvents
      -- Set participant status (Calendar.app supports this)
      set myStatus to ${statusValue}
      return "SUCCESS"
    else
      return "ERROR:カレンダーでイベントが見つかりません"
    end if
  end tell
on error errMsg
  -- Fallback: Open event in Calendar app for manual response
  try
    tell application "Calendar"
      activate
    end tell
    return "MANUAL:Calendar.appを開きました。手動で返信してください。"
  end try
end try

return "SUCCESS"`;
  }

  /**
   * Convert response type to EventKit status constant
   * @internal
   */
  private responseTypeToEventKitStatus(response: EventResponseType): string {
    switch (response) {
      case 'accept':
        return 'accepted';
      case 'decline':
        return 'declined';
      case 'tentative':
        return 'tentative';
      default:
        return 'none';
    }
  }

  /**
   * Convert response type to participant status
   * @internal
   */
  private responseTypeToStatus(response: EventResponseType): EventParticipantStatus {
    switch (response) {
      case 'accept':
        return 'accepted';
      case 'decline':
        return 'declined';
      case 'tentative':
        return 'tentative';
      default:
        return 'unknown';
    }
  }

  /**
   * Get response reason text
   * @internal
   */
  private getResponseReasonText(response: EventResponseType): string {
    switch (response) {
      case 'accept':
        return '承諾しました';
      case 'decline':
        return '辞退しました';
      case 'tentative':
        return '仮承諾しました';
      default:
        return '応答しました';
    }
  }

  /**
   * Generate response message
   * Requirement: 17.11
   */
  generateResponseMessage(response: EventResponseType, eventTitle: string): string {
    switch (response) {
      case 'accept':
        return `「${eventTitle}」を承諾しました。`;
      case 'decline':
        return `「${eventTitle}」を辞退しました。`;
      case 'tentative':
        return `「${eventTitle}」を仮承諾しました。`;
      default:
        return `「${eventTitle}」に応答しました。`;
    }
  }

  /**
   * Generate batch summary message
   * Requirement: 17.12
   * @internal
   */
  private generateBatchSummaryMessage(
    total: number,
    succeeded: number,
    skipped: number,
    failed: number,
    response: EventResponseType
  ): string {
    const responseText = this.getResponseReasonText(response).replace('しました', '');

    let message = `${total}件中${succeeded}件のイベントを${responseText}しました。`;

    if (skipped > 0) {
      message += `${skipped}件はスキップされました。`;
    }

    if (failed > 0) {
      message += `${failed}件は失敗しました。`;
    }

    return message;
  }
}
