/**
 * Calendar Event Deleter Service
 * Handles deleting calendar events via EventKit
 * Requirements: 19.1-19.12
 *
 * Supports:
 * - Single event deletion by ID
 * - Batch event deletion
 * - Calendar-specific deletion
 * - UUID extraction from full IDs
 */

import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
import type { CalendarPlatformInfo } from '../types/calendar.js';
import { CALENDAR_RETRY_OPTIONS } from '../types/calendar.js';

/**
 * Platform information for calendar event deletion
 */
export interface CalendarDeleterPlatformInfo extends CalendarPlatformInfo {
  supportsEventDeletion: boolean;
}

/**
 * Request to delete a calendar event
 * Requirement: 19.2, 19.3
 */
export interface DeleteCalendarEventRequest {
  /** Required: Event ID (UUID or full ID with calendar prefix) */
  eventId: string;
  /** Optional: Calendar name (searches all calendars if not specified) */
  calendarName?: string;
}

/**
 * Request to delete multiple calendar events
 * Requirement: 19.10
 */
export interface DeleteCalendarEventsBatchRequest {
  /** Required: Array of event IDs */
  eventIds: string[];
  /** Optional: Calendar name (searches all calendars if not specified) */
  calendarName?: string;
}

/**
 * Result of calendar event deletion
 * Requirement: 19.7, 19.9
 */
export interface DeleteCalendarEventResult {
  success: boolean;
  eventId: string;
  title?: string;
  calendarName?: string;
  error?: string;
  message: string;
}

/**
 * Result of batch calendar event deletion
 * Requirement: 19.10, 19.11
 */
export interface DeleteCalendarEventsBatchResult {
  success: boolean;
  totalCount: number;
  successCount: number;
  failedCount: number;
  results: DeleteCalendarEventResult[];
  message: string;
}

/**
 * Retry options for calendar event deletion
 */
const RETRY_OPTIONS = {
  ...CALENDAR_RETRY_OPTIONS,
  shouldRetry: isRetryableError,
};

/**
 * Rate limit delay between batch operations (ms)
 */
const BATCH_DELAY_MS = 100;

/**
 * Extract UUID from event ID
 * Requirement: 19.4, 19.5
 *
 * @param eventId - Full event ID or UUID
 * @returns UUID part of the event ID
 */
export function extractEventUid(eventId: string): string {
  if (!eventId) {
    return '';
  }

  const trimmed = eventId.trim();
  if (!trimmed) {
    return '';
  }

  // If contains colon, extract the last part (UUID)
  const lastColonIndex = trimmed.lastIndexOf(':');
  if (lastColonIndex !== -1) {
    return trimmed.substring(lastColonIndex + 1);
  }

  return trimmed;
}

/**
 * Calendar Event Deleter Service
 * Deletes calendar events via EventKit on macOS
 */
export class CalendarEventDeleterService {
  private runAppleScript: ((script: string) => Promise<string>) | null = null;

  /**
   * Detect current platform
   */
  async detectPlatform(): Promise<CalendarDeleterPlatformInfo> {
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      return {
        platform: 'macos',
        hasEventKitAccess: true,
        supportsEventDeletion: true,
      };
    }

    return {
      platform: 'unknown',
      hasEventKitAccess: false,
      supportsEventDeletion: false,
    };
  }

  /**
   * Check if EventKit is available for event deletion
   */
  async isEventKitAvailable(): Promise<boolean> {
    const platform = await this.detectPlatform();
    return platform.hasEventKitAccess;
  }

  /**
   * Validate delete event request
   * Requirement: 19.2
   */
  validateRequest(request: DeleteCalendarEventRequest): string | null {
    if (!request.eventId || request.eventId.trim() === '') {
      return '無効なイベントID: イベントIDが空です';
    }
    return null;
  }

  /**
   * Validate batch delete request
   * Requirement: 19.10
   */
  validateBatchRequest(request: DeleteCalendarEventsBatchRequest): string | null {
    if (!request.eventIds || request.eventIds.length === 0) {
      return '無効なリクエスト: イベントIDの配列が空です';
    }

    for (let i = 0; i < request.eventIds.length; i++) {
      if (!request.eventIds[i] || request.eventIds[i].trim() === '') {
        return `無効なイベントID: インデックス${i}のイベントIDが空です`;
      }
    }

    return null;
  }

  /**
   * Delete a calendar event
   * Requirement: 19.1
   */
  async deleteEvent(request: DeleteCalendarEventRequest): Promise<DeleteCalendarEventResult> {
    // Validate input
    const validationError = this.validateRequest(request);
    if (validationError) {
      return {
        success: false,
        eventId: request.eventId,
        error: validationError,
        message: 'イベントの削除に失敗しました',
      };
    }

    try {
      // Check platform availability
      const isAvailable = await this.isEventKitAvailable();
      if (!isAvailable) {
        return {
          success: false,
          eventId: request.eventId,
          error: 'カレンダー統合がこのプラットフォームで利用できません。macOSで実行してください。',
          message: 'イベントの削除に失敗しました',
        };
      }

      // Delete event via EventKit
      const result = await this.deleteEventViaEventKit(request);

      if (result.success) {
        result.message = this.generateSuccessMessage(result);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        eventId: request.eventId,
        error: `EventKitエラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'イベントの削除に失敗しました',
      };
    }
  }

  /**
   * Delete multiple calendar events
   * Requirement: 19.10
   */
  async deleteEventsBatch(request: DeleteCalendarEventsBatchRequest): Promise<DeleteCalendarEventsBatchResult> {
    // Validate input
    const validationError = this.validateBatchRequest(request);
    if (validationError) {
      return {
        success: false,
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        results: [],
        error: validationError,
        message: 'イベントの削除に失敗しました',
      } as DeleteCalendarEventsBatchResult & { error: string };
    }

    const results: DeleteCalendarEventResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Process each event sequentially with rate limiting
    for (let i = 0; i < request.eventIds.length; i++) {
      const eventId = request.eventIds[i];
      const result = await this.deleteEvent({
        eventId,
        calendarName: request.calendarName,
      });

      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Add delay between operations (except for the last one)
      if (i < request.eventIds.length - 1) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    const batchResult: DeleteCalendarEventsBatchResult = {
      success: successCount > 0 && failedCount === 0,
      totalCount: request.eventIds.length,
      successCount,
      failedCount,
      results,
      message: '',
    };

    batchResult.message = this.generateBatchSummaryMessage(batchResult);

    return batchResult;
  }

  /**
   * Build AppleScriptObjC script for deleting event via EventKit
   * Requirement: 19.6
   */
  buildDeleteEventScript(eventId: string, calendarName?: string): string {
    const uid = extractEventUid(eventId);
    const escapedUid = uid.replace(/"/g, '\\"');

    // Build calendar filter section
    let calendarFilterSection = '';
    if (calendarName) {
      const escapedCalendarName = calendarName.replace(/"/g, '\\"');
      calendarFilterSection = `
-- Filter by calendar name
set targetCalendarName to "${escapedCalendarName}"
set eventCalendarName to (theEvent's calendar()'s title()) as text
if eventCalendarName is not equal to targetCalendarName then
  return "ERROR:指定されたカレンダーにイベントが見つかりません: " & targetCalendarName
end if

-- Check if calendar allows modifications
set canModify to ((theEvent's calendar())'s allowsContentModifications()) as boolean
if not canModify then
  return "ERROR:読み取り専用カレンダーからは削除できません: " & eventCalendarName
end if`;
    } else {
      calendarFilterSection = `
-- Check if calendar allows modifications
set canModify to ((theEvent's calendar())'s allowsContentModifications()) as boolean
if not canModify then
  set calendarName to (theEvent's calendar()'s title()) as text
  return "ERROR:読み取り専用カレンダーからは削除できません: " & calendarName
end if`;
    }

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

-- Check access
set accessStatus to current application's EKEventStore's authorizationStatusForEntityType:0
if accessStatus is not 3 then
  return "ERROR:カレンダーへのアクセス権限がありません"
end if

-- Find event by identifier
set eventIdentifier to "${escapedUid}"
set theEvent to theStore's calendarItemWithIdentifier:eventIdentifier

if theEvent is missing value then
  return "ERROR:イベントが見つかりません: " & eventIdentifier
end if

-- Verify it's an event (not a reminder)
set eventClass to theEvent's |class|()
if eventClass is not (current application's EKEvent) then
  return "ERROR:指定されたIDはイベントではありません"
end if

${calendarFilterSection}

-- Get event details before deletion
set eventTitle to (theEvent's title()) as text
set calendarName to (theEvent's calendar()'s title()) as text

-- Delete the event
set deleteSuccess to theStore's removeEvent:theEvent span:0 |error|:(missing value)

if deleteSuccess then
  return "SUCCESS|" & eventIdentifier & "|" & eventTitle & "|" & calendarName
else
  return "ERROR:イベントの削除に失敗しました"
end if`;
  }

  /**
   * Delete event via EventKit
   * @internal
   */
  private async deleteEventViaEventKit(request: DeleteCalendarEventRequest): Promise<DeleteCalendarEventResult> {
    try {
      // Lazy load run-applescript
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const uid = extractEventUid(request.eventId);
      const script = this.buildDeleteEventScript(uid, request.calendarName);

      // Use retry with exponential backoff
      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`EventKit delete event retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return this.parseDeleteEventResult(result, request.eventId);
    } catch (error) {
      return {
        success: false,
        eventId: request.eventId,
        error: `EventKitエラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'イベントの削除に失敗しました',
      };
    }
  }

  /**
   * Parse delete event result
   * Requirement: 19.7
   */
  parseDeleteEventResult(result: string, eventId: string): DeleteCalendarEventResult {
    if (result.startsWith('ERROR:')) {
      return {
        success: false,
        eventId,
        error: result.replace('ERROR:', ''),
        message: 'イベントの削除に失敗しました',
      };
    }

    if (result.startsWith('SUCCESS|')) {
      const parts = result.split('|');
      const deletedEventId = parts[1] || eventId;
      const title = parts[2];
      const calendarName = parts[3];

      return {
        success: true,
        eventId: deletedEventId,
        title,
        calendarName,
        message: '',
      };
    }

    return {
      success: false,
      eventId,
      error: '予期しない応答形式',
      message: 'イベントの削除に失敗しました',
    };
  }

  /**
   * Generate success message for single deletion
   * Requirement: 19.9
   */
  generateSuccessMessage(result: DeleteCalendarEventResult): string {
    if (!result.success) {
      return 'イベントの削除に失敗しました';
    }

    if (result.calendarName) {
      return `イベント「${result.title}」を削除しました（カレンダー: ${result.calendarName}）`;
    }

    return `イベント「${result.title}」を削除しました`;
  }

  /**
   * Generate summary message for batch deletion
   * Requirement: 19.11
   */
  generateBatchSummaryMessage(result: DeleteCalendarEventsBatchResult): string {
    if (result.successCount === result.totalCount) {
      return `${result.totalCount}件のイベントを削除しました`;
    }

    if (result.successCount === 0) {
      return `イベントの削除に失敗しました（0件成功、${result.failedCount}件失敗）`;
    }

    return `${result.totalCount}件中${result.successCount}件のイベントを削除しました（${result.failedCount}件失敗）`;
  }

  /**
   * Delay helper for rate limiting
   * @internal
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
