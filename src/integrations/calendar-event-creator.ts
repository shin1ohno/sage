/**
 * Calendar Event Creator Service
 * Handles creating calendar events via EventKit
 * Requirements: 18.1-18.11
 *
 * Supports:
 * - Event creation with title, dates, location, notes
 * - Custom calendar selection
 * - Alarm configuration
 * - All-day event detection
 */

import { retryWithBackoff, isRetryableError } from '../utils/retry.js';

/**
 * Platform information for calendar event creation
 */
export interface CalendarCreatorPlatformInfo {
  platform: 'macos' | 'ios' | 'ipados' | 'web' | 'unknown';
  hasEventKitAccess: boolean;
  supportsEventCreation: boolean;
}

/**
 * Request to create a calendar event
 * Requirement: 18.2, 18.3, 18.4
 */
export interface CreateCalendarEventRequest {
  /** Required: Event title */
  title: string;
  /** Required: ISO 8601 format start date/time */
  startDate: string;
  /** Required: ISO 8601 format end date/time */
  endDate: string;
  /** Optional: Location string */
  location?: string;
  /** Optional: Notes/description */
  notes?: string;
  /** Optional: Calendar name (uses default if not specified) */
  calendarName?: string;
  /** Optional: Override calendar's default alarms (e.g., ["-15m", "-1h"]). If omitted, calendar defaults apply. */
  alarms?: string[];
}

/**
 * Result of calendar event creation
 * Requirement: 18.10
 */
export interface CreateCalendarEventResult {
  success: boolean;
  eventId?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  calendarName?: string;
  isAllDay?: boolean;
  error?: string;
  message: string;
}

/**
 * Date/time components parsed from ISO 8601 string
 */
export interface DateTimeComponents {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Default retry options for calendar operations
 */
const RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelay: 500,
  maxDelay: 5000,
  shouldRetry: isRetryableError,
};

/**
 * Parse alarm string to seconds offset
 * Format: -[number][unit] where unit is m (minutes), h (hours), d (days), w (weeks)
 * Requirement: 18.4
 *
 * @param alarmStr - Alarm string (e.g., "-15m", "-1h", "-1d")
 * @returns Offset in seconds (negative) or null if invalid
 */
export function parseAlarmString(alarmStr: string): number | null {
  if (!alarmStr || typeof alarmStr !== 'string') {
    return null;
  }

  const match = alarmStr.match(/^-(\d+)([mhdw])$/);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm': // minutes
      return -value * 60;
    case 'h': // hours
      return -value * 60 * 60;
    case 'd': // days
      return -value * 24 * 60 * 60;
    case 'w': // weeks
      return -value * 7 * 24 * 60 * 60;
    default:
      return null;
  }
}

/**
 * Calendar Event Creator Service
 * Creates calendar events via EventKit on macOS
 */
export class CalendarEventCreatorService {
  private runAppleScript: ((script: string) => Promise<string>) | null = null;

  /**
   * Detect current platform
   */
  async detectPlatform(): Promise<CalendarCreatorPlatformInfo> {
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      return {
        platform: 'macos',
        hasEventKitAccess: true,
        supportsEventCreation: true,
      };
    }

    return {
      platform: 'unknown',
      hasEventKitAccess: false,
      supportsEventCreation: false,
    };
  }

  /**
   * Check if EventKit is available for event creation
   */
  async isEventKitAvailable(): Promise<boolean> {
    const platform = await this.detectPlatform();
    return platform.hasEventKitAccess;
  }

  /**
   * Create a calendar event
   * Requirement: 18.1
   */
  async createEvent(request: CreateCalendarEventRequest): Promise<CreateCalendarEventResult> {
    // Validate input
    const validationError = this.validateRequest(request);
    if (validationError) {
      return {
        success: false,
        error: validationError,
        message: 'イベントの作成に失敗しました',
      };
    }

    try {
      // Check platform availability
      const isAvailable = await this.isEventKitAvailable();
      if (!isAvailable) {
        return {
          success: false,
          error: 'カレンダー統合がこのプラットフォームで利用できません。macOSで実行してください。',
          message: 'イベントの作成に失敗しました',
        };
      }

      // Create event via EventKit
      const result = await this.createEventViaEventKit(request);

      if (result.success) {
        result.message = this.generateSuccessMessage(result);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `EventKitエラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'イベントの作成に失敗しました',
      };
    }
  }

  /**
   * Validate create event request
   * @internal
   */
  private validateRequest(request: CreateCalendarEventRequest): string | null {
    // Check title
    if (!request.title || request.title.trim() === '') {
      return '無効なタイトル: タイトルが空です';
    }

    // Check startDate format
    if (!this.isValidDateTime(request.startDate)) {
      return `無効な開始日時: ${request.startDate}。ISO 8601形式を使用してください。`;
    }

    // Check endDate format
    if (!this.isValidDateTime(request.endDate)) {
      return `無効な終了日時: ${request.endDate}。ISO 8601形式を使用してください。`;
    }

    // Check date range
    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    if (endDate < startDate) {
      return '終了日時は開始日時より後である必要があります。';
    }

    // Validate alarms if provided
    if (request.alarms) {
      for (const alarm of request.alarms) {
        if (parseAlarmString(alarm) === null) {
          return `無効なアラーム形式: ${alarm}。例: -15m, -1h, -1d`;
        }
      }
    }

    return null;
  }

  /**
   * Check if datetime string is valid
   * @internal
   */
  private isValidDateTime(dateStr: string): boolean {
    if (!dateStr) {
      return false;
    }
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }

  /**
   * Check if event is all-day based on start and end times
   * Requirement: 18.7
   */
  isAllDayEvent(startDate: string, endDate: string): boolean {
    // Check if both times are midnight in their specified timezone
    // Parse the time portion from the ISO string directly to avoid timezone conversion issues
    const startMidnight = this.isMidnightInOriginalTimezone(startDate);
    const endMidnight = this.isMidnightInOriginalTimezone(endDate);

    return startMidnight && endMidnight;
  }

  /**
   * Check if a date string represents midnight in its original timezone
   * This avoids issues with JavaScript Date converting to local timezone
   */
  private isMidnightInOriginalTimezone(dateStr: string): boolean {
    if (!dateStr) return false;

    // Date-only format (e.g., "2025-01-01") is always considered midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return true;
    }

    // Extract time portion from ISO 8601 string
    // Formats: "2025-01-01T00:00:00", "2025-01-01T00:00:00Z", "2025-01-01T00:00:00+09:00"
    const timeMatch = dateStr.match(/T(\d{2}):(\d{2}):(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = parseInt(timeMatch[3], 10);
      return hours === 0 && minutes === 0 && seconds === 0;
    }

    // Fallback: use Date object (less reliable across timezones)
    const date = new Date(dateStr);
    return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
  }

  /**
   * Parse date/time string to components
   * Parses the date string in its original timezone, not converting to local time
   */
  parseDateTimeComponents(dateStr: string): DateTimeComponents | null {
    if (!dateStr) {
      return null;
    }

    // Try to parse ISO 8601 format directly to preserve original timezone
    // Formats: "2025-01-01", "2025-01-01T10:00:00", "2025-01-01T10:00:00Z", "2025-01-01T10:00:00+09:00"

    // Date-only format: "2025-01-01"
    const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      return {
        year: parseInt(dateOnlyMatch[1], 10),
        month: parseInt(dateOnlyMatch[2], 10),
        day: parseInt(dateOnlyMatch[3], 10),
        hours: 0,
        minutes: 0,
        seconds: 0,
      };
    }

    // DateTime format: "2025-01-01T10:00:00" with optional timezone
    const dateTimeMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (dateTimeMatch) {
      return {
        year: parseInt(dateTimeMatch[1], 10),
        month: parseInt(dateTimeMatch[2], 10),
        day: parseInt(dateTimeMatch[3], 10),
        hours: parseInt(dateTimeMatch[4], 10),
        minutes: parseInt(dateTimeMatch[5], 10),
        seconds: parseInt(dateTimeMatch[6], 10),
      };
    }

    // Fallback: use Date object (less reliable across timezones)
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }

    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds(),
    };
  }

  /**
   * Build AppleScriptObjC script for creating event via EventKit
   * Requirement: 18.6
   */
  buildCreateEventScript(request: CreateCalendarEventRequest): string {
    const startComponents = this.parseDateTimeComponents(request.startDate);
    const endComponents = this.parseDateTimeComponents(request.endDate);

    if (!startComponents || !endComponents) {
      throw new Error('Invalid date components');
    }

    const isAllDay = this.isAllDayEvent(request.startDate, request.endDate);
    const escapedTitle = request.title.replace(/"/g, '\\"');
    const escapedLocation = request.location?.replace(/"/g, '\\"') || '';
    const escapedNotes = request.notes?.replace(/"/g, '\\"') || '';

    // Build alarms section
    let alarmsSection = '';
    if (request.alarms && request.alarms.length > 0) {
      const alarmOffsets = request.alarms
        .map(a => parseAlarmString(a))
        .filter((a): a is number => a !== null);

      if (alarmOffsets.length > 0) {
        alarmsSection = alarmOffsets
          .map(offset => `
set newAlarm to current application's EKAlarm's alarmWithRelativeOffset:${offset}
theEvent's addAlarm:newAlarm`)
          .join('\n');
      }
    }

    // Build calendar selection section
    let calendarSection = `
set targetCalendar to theStore's defaultCalendarForNewEvents()
if targetCalendar is missing value then
  return "ERROR:デフォルトカレンダーが設定されていません"
end if`;

    if (request.calendarName) {
      const escapedCalendarName = request.calendarName.replace(/"/g, '\\"');
      calendarSection = `
set targetCalendar to missing value
set allCalendars to theStore's calendarsForEntityType:0
repeat with aCal in allCalendars
  if ((aCal's title()) as text) is equal to "${escapedCalendarName}" then
    set targetCalendar to aCal
    exit repeat
  end if
end repeat

if targetCalendar is missing value then
  return "ERROR:指定されたカレンダーが見つかりません: ${escapedCalendarName}"
end if

set canModify to (targetCalendar's allowsContentModifications()) as boolean
if not canModify then
  return "ERROR:読み取り専用カレンダーには書き込めません: ${escapedCalendarName}"
end if`;
    }

    // Build location section
    let locationSection = '';
    if (request.location) {
      locationSection = `
theEvent's setLocation:"${escapedLocation}"`;
    }

    // Build notes section
    let notesSection = '';
    if (request.notes) {
      notesSection = `
theEvent's setNotes:"${escapedNotes}"`;
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

${calendarSection}

-- Build start date
set startDate to current date
set year of startDate to ${startComponents.year}
set month of startDate to ${startComponents.month}
set day of startDate to ${startComponents.day}
set hours of startDate to ${startComponents.hours}
set minutes of startDate to ${startComponents.minutes}
set seconds of startDate to ${startComponents.seconds}

-- Build end date
set endDate to current date
set year of endDate to ${endComponents.year}
set month of endDate to ${endComponents.month}
set day of endDate to ${endComponents.day}
set hours of endDate to ${endComponents.hours}
set minutes of endDate to ${endComponents.minutes}
set seconds of endDate to ${endComponents.seconds}

-- Convert AppleScript dates to NSDate
set startNSDate to current application's NSDate's dateWithTimeIntervalSince1970:((startDate - (date "Thursday, January 1, 1970 at 9:00:00")) / 1)
set endNSDate to current application's NSDate's dateWithTimeIntervalSince1970:((endDate - (date "Thursday, January 1, 1970 at 9:00:00")) / 1)

-- Create new event
set theEvent to current application's EKEvent's eventWithEventStore:theStore
theEvent's setTitle:"${escapedTitle}"
theEvent's setStartDate:startNSDate
theEvent's setEndDate:endNSDate
theEvent's setCalendar:targetCalendar
theEvent's setAllDay:${isAllDay}
${locationSection}
${notesSection}
${alarmsSection}

-- Save event
set saveSuccess to theStore's saveEvent:theEvent span:0 |error|:(missing value)

if saveSuccess then
  set eventId to (theEvent's eventIdentifier()) as text
  set calendarName to (targetCalendar's title()) as text
  return "SUCCESS|" & eventId & "|" & calendarName
else
  return "ERROR:イベントの保存に失敗しました"
end if`;
  }

  /**
   * Create event via EventKit
   * @internal
   */
  private async createEventViaEventKit(request: CreateCalendarEventRequest): Promise<CreateCalendarEventResult> {
    try {
      // Lazy load run-applescript
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildCreateEventScript(request);

      // Use retry with exponential backoff
      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`EventKit create event retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return this.parseCreateEventResult(result, request);
    } catch (error) {
      return {
        success: false,
        error: `EventKitエラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: 'イベントの作成に失敗しました',
      };
    }
  }

  /**
   * Parse create event result
   * @internal
   */
  private parseCreateEventResult(result: string, request: CreateCalendarEventRequest): CreateCalendarEventResult {
    if (result.startsWith('ERROR:')) {
      return {
        success: false,
        error: result.replace('ERROR:', ''),
        message: 'イベントの作成に失敗しました',
      };
    }

    if (result.startsWith('SUCCESS|')) {
      const parts = result.split('|');
      const eventId = parts[1];
      const calendarName = parts[2] || request.calendarName || 'Calendar';

      return {
        success: true,
        eventId,
        title: request.title,
        startDate: request.startDate,
        endDate: request.endDate,
        calendarName,
        isAllDay: this.isAllDayEvent(request.startDate, request.endDate),
        message: '',
      };
    }

    return {
      success: false,
      error: '予期しない応答形式',
      message: 'イベントの作成に失敗しました',
    };
  }

  /**
   * Generate success message
   * Requirement: 18.10
   */
  generateSuccessMessage(result: CreateCalendarEventResult): string {
    if (!result.success) {
      return 'イベントの作成に失敗しました';
    }

    if (result.isAllDay) {
      return `カレンダーに「${result.title}」を作成しました（${this.formatDateOnly(result.startDate)}〜${this.formatDateOnly(result.endDate)} 終日）`;
    }

    const startTime = this.formatTime(result.startDate);
    const endTime = this.formatTime(result.endDate);
    const dateStr = this.formatDateOnly(result.startDate);

    return `カレンダーに「${result.title}」を作成しました（${dateStr} ${startTime}-${endTime}）`;
  }

  /**
   * Format date string to YYYY-MM-DD
   * Parses ISO string directly to preserve original timezone
   * @internal
   */
  private formatDateOnly(dateStr?: string): string {
    if (!dateStr) return '';

    // Handle date-only format (YYYY-MM-DD)
    const dateOnlyMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }

    // Fallback to Date object
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Format time string to HH:mm
   * Parses ISO string directly to preserve original timezone
   * @internal
   */
  private formatTime(dateStr?: string): string {
    if (!dateStr) return '';

    // Extract time from ISO 8601 format (e.g., "2025-01-01T14:00:00+09:00")
    const timeMatch = dateStr.match(/T(\d{2}):(\d{2})/);
    if (timeMatch) {
      return `${timeMatch[1]}:${timeMatch[2]}`;
    }

    // Fallback to Date object
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return '';
    }

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }
}
