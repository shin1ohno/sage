/**
 * Calendar Service
 * macOS EventKit integration via AppleScriptObjC
 * Requirements: 6.1-6.9
 *
 * 現行実装: macOS EventKit経由（AppleScriptObjCを使用）
 * - EventKitは繰り返しイベントを個々の発生（occurrence）に自動展開
 * - Calendar.appのネイティブAppleScriptでは不可能な機能を提供
 * 将来対応予定: iOS/iPadOS ネイティブ統合（Claude Skills APIがデバイスAPIへのアクセスを提供した時点）
 */

import { retryWithBackoff, isRetryableError } from '../utils/retry.js';

// Declare window for browser environment detection
declare const window: any;

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
 * Calendar platform information
 */
export interface CalendarPlatformInfo {
  platform: 'ios' | 'ipados' | 'macos' | 'web' | 'unknown';
  availableMethods: CalendarMethod[];
  recommendedMethod: CalendarMethod;
  requiresPermission: boolean;
  hasNativeAccess: boolean;
}

export type CalendarMethod = 'native' | 'eventkit' | 'caldav' | 'ical_url' | 'manual_input' | 'outlook';

/**
 * Calendar event
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  source: string;
}

/**
 * Slot request
 */
export interface SlotRequest {
  taskDuration: number;
  preferredDays?: string[];
  avoidDays?: string[];
  startDate?: string;
  endDate?: string;
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
}

/**
 * Available slot
 */
export interface AvailableSlot {
  start: string;
  end: string;
  durationMinutes: number;
  suitability: 'excellent' | 'good' | 'acceptable';
  reason: string;
  conflicts: string[];
  dayType: 'deep-work' | 'meeting-heavy' | 'normal';
  source: CalendarMethod;
}

/**
 * Working hours configuration
 */
interface WorkingHours {
  start: string;
  end: string;
}

/**
 * Calendar configuration
 */
interface CalendarConfig {
  deepWorkDays: string[];
  meetingHeavyDays: string[];
}

/**
 * Calendar Service
 * Provides platform-adaptive calendar integration
 */
export class CalendarService {
  private runAppleScript: ((script: string) => Promise<string>) | null = null;

  /**
   * Detect the current platform
   * Requirement: 6.1
   */
  async detectPlatform(): Promise<CalendarPlatformInfo> {
    // Check for macOS (Node.js environment)
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      return {
        platform: 'macos',
        availableMethods: ['eventkit', 'caldav'],
        recommendedMethod: 'eventkit',
        requiresPermission: true,
        hasNativeAccess: true,
      };
    }

    // Check for iOS/iPadOS (Skills environment)
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator?.userAgent || '';

      if (userAgent.includes('iPhone')) {
        return {
          platform: 'ios',
          availableMethods: ['native'],
          recommendedMethod: 'native',
          requiresPermission: true,
          hasNativeAccess: true,
        };
      }

      if (userAgent.includes('iPad')) {
        return {
          platform: 'ipados',
          availableMethods: ['native'],
          recommendedMethod: 'native',
          requiresPermission: true,
          hasNativeAccess: true,
        };
      }

      // Web browser
      return {
        platform: 'web',
        availableMethods: ['ical_url', 'manual_input', 'outlook'],
        recommendedMethod: 'manual_input',
        requiresPermission: false,
        hasNativeAccess: false,
      };
    }

    return {
      platform: 'unknown',
      availableMethods: ['manual_input'],
      recommendedMethod: 'manual_input',
      requiresPermission: false,
      hasNativeAccess: false,
    };
  }

  /**
   * Check if calendar integration is available
   */
  async isAvailable(): Promise<boolean> {
    const platform = await this.detectPlatform();
    return platform.hasNativeAccess;
  }

  /**
   * Fetch calendar events
   * Requirement: 6.2, 6.3, 6.4
   */
  async fetchEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const platform = await this.detectPlatform();

    switch (platform.recommendedMethod) {
      case 'native':
        return this.fetchNativeEvents(startDate, endDate);

      case 'eventkit':
        return this.fetchEventKitEvents(startDate, endDate);

      case 'manual_input':
      default:
        return [];
    }
  }

  /**
   * Fetch events via native iOS/iPadOS API
   * 🔮 将来対応予定: Claude Skills APIがデバイスAPIへのアクセスを提供した時点で実装
   * 現時点では window.claude?.calendar API は存在しません
   * Requirement: 6.2
   */
  private async fetchNativeEvents(_startDate: string, _endDate: string): Promise<CalendarEvent[]> {
    // 🔮 将来対応予定: ネイティブ統合
    // 現時点では、iOS/iPadOSでの実行時は空の配列を返す
    console.warn(
      'ネイティブCalendar統合は将来対応予定です。現在はmacOS AppleScriptのみサポートしています。'
    );
    return [];
  }

  /**
   * Fetch events via EventKit (macOS)
   * Uses AppleScriptObjC to access EventKit framework
   * Requirement: 6.3
   */
  private async fetchEventKitEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    try {
      // Lazy load run-applescript (used to execute AppleScriptObjC with EventKit)
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildEventKitScript(startDate, endDate);

      // Use retry with exponential backoff for EventKit execution
      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`EventKit Calendar retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return this.parseEventKitResult(result);
    } catch (error) {
      console.error('EventKit カレンダーエラー:', error);
      return [];
    }
  }

  /**
   * Parse ISO 8601 date string into components
   */
  private parseDateComponents(dateStr: string): { year: number; month: number; day: number } {
    const date = new Date(dateStr);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }

  /**
   * Build AppleScriptObjC script for fetching events using EventKit
   * Note: Uses EventKit framework to properly handle recurring events
   * EventKit expands recurring events into individual occurrences, unlike Calendar.app's native AppleScript
   */
  private buildEventKitScript(startDate: string, endDate: string): string {
    const start = this.parseDateComponents(startDate);
    const end = this.parseDateComponents(endDate);

    return `
use AppleScript version "2.7"
use framework "Foundation"
use framework "EventKit"
use scripting additions

-- Build start date
set startDate to current date
set year of startDate to ${start.year}
set month of startDate to ${start.month}
set day of startDate to ${start.day}
set hours of startDate to 0
set minutes of startDate to 0
set seconds of startDate to 0

-- Build end date (end of day)
set endDate to current date
set year of endDate to ${end.year}
set month of endDate to ${end.month}
set day of endDate to ${end.day}
set hours of endDate to 23
set minutes of endDate to 59
set seconds of endDate to 59

-- Create EventKit store
set theStore to current application's EKEventStore's alloc()'s init()

-- Request calendar access (synchronously wait for completion)
set accessGranted to false
theStore's requestFullAccessToEventsWithCompletion:(missing value)
delay 0.5

-- Convert AppleScript dates to NSDate
set startNSDate to current application's NSDate's dateWithTimeIntervalSince1970:((startDate - (date "Thursday, January 1, 1970 at 9:00:00")) / 1)
set endNSDate to current application's NSDate's dateWithTimeIntervalSince1970:((endDate - (date "Thursday, January 1, 1970 at 9:00:00")) / 1)

-- Create predicate for events in date range (all calendars)
set thePredicate to theStore's predicateForEventsWithStartDate:startNSDate endDate:endNSDate calendars:(missing value)

-- Fetch events (EventKit automatically expands recurring events into occurrences)
set theEvents to theStore's eventsMatchingPredicate:thePredicate

-- Build result string
set eventList to ""
repeat with anEvent in theEvents
  set eventTitle to (anEvent's title()) as text
  set eventStart to (anEvent's startDate()) as date
  set eventEnd to (anEvent's endDate()) as date
  set eventId to (anEvent's eventIdentifier()) as text
  set isAllDay to (anEvent's isAllDay()) as boolean

  set eventInfo to eventTitle & "|" & (eventStart as string) & "|" & (eventEnd as string) & "|" & eventId & "|" & (isAllDay as string)
  set eventList to eventList & eventInfo & linefeed
end repeat

return eventList`;
  }

  /**
   * Parse EventKit result into events
   * Format: title|start|end|id|isAllDay
   */
  parseEventKitResult(output: string): CalendarEvent[] {
    if (!output || output.trim() === '') {
      return [];
    }

    const events: CalendarEvent[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        events.push({
          id: parts[3],
          title: parts[0],
          start: parts[1],
          end: parts[2],
          isAllDay: parts.length >= 5 ? parts[4].toLowerCase() === 'true' : false,
          source: 'eventkit',
        });
      }
    }

    return events;
  }

  /**
   * Find available slots from events
   * Requirement: 6.4, 6.7
   */
  findAvailableSlotsFromEvents(
    events: CalendarEvent[],
    taskDuration: number,
    workingHours: WorkingHours,
    date: string
  ): AvailableSlot[] {
    const slots: AvailableSlot[] = [];
    const dateObj = new Date(date);

    // Parse working hours
    const [startHour, startMin] = workingHours.start.split(':').map(Number);
    const [endHour, endMin] = workingHours.end.split(':').map(Number);

    // Create working hours boundaries
    const workStart = new Date(dateObj);
    workStart.setHours(startHour, startMin, 0, 0);

    const workEnd = new Date(dateObj);
    workEnd.setHours(endHour, endMin, 0, 0);

    // Filter events for this day
    const dayEvents = events
      .filter((e) => !e.isAllDay)
      .map((e) => ({
        start: new Date(e.start),
        end: new Date(e.end),
        title: e.title,
      }))
      .filter((e) => e.start >= workStart && e.start < workEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    // If all-day event exists, no slots available
    if (events.some((e) => e.isAllDay)) {
      return [];
    }

    // Find gaps between events
    let currentTime = workStart;

    for (const event of dayEvents) {
      const gapMinutes = (event.start.getTime() - currentTime.getTime()) / (1000 * 60);

      if (gapMinutes >= taskDuration) {
        slots.push({
          start: currentTime.toISOString(),
          end: event.start.toISOString(),
          durationMinutes: gapMinutes,
          suitability: 'good',
          reason: `${Math.floor(gapMinutes)}分の空き時間`,
          conflicts: [],
          dayType: 'normal',
          source: 'eventkit',
        });
      }

      currentTime = event.end > currentTime ? event.end : currentTime;
    }

    // Check remaining time after last event
    const remainingMinutes = (workEnd.getTime() - currentTime.getTime()) / (1000 * 60);
    if (remainingMinutes >= taskDuration) {
      slots.push({
        start: currentTime.toISOString(),
        end: workEnd.toISOString(),
        durationMinutes: remainingMinutes,
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
   * Calculate slot suitability based on day type
   * Requirement: 6.5, 6.6, 6.8
   */
  calculateSuitability(
    slot: AvailableSlot,
    config: CalendarConfig
  ): AvailableSlot {
    const date = new Date(slot.start);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

    let suitability: 'excellent' | 'good' | 'acceptable' = 'good';
    let dayType: 'deep-work' | 'meeting-heavy' | 'normal' = 'normal';
    let reason = slot.reason;

    if (config.deepWorkDays.includes(dayName)) {
      suitability = 'excellent';
      dayType = 'deep-work';
      reason = `${dayName}は深い作業に最適な日です`;
    } else if (config.meetingHeavyDays.includes(dayName)) {
      suitability = 'acceptable';
      dayType = 'meeting-heavy';
      reason = `${dayName}は会議が多い日です`;
    }

    return {
      ...slot,
      suitability,
      dayType,
      reason,
    };
  }

  /**
   * Generate manual input prompt for web fallback
   * Requirement: 6.9
   */
  generateManualInputPrompt(startDate: string, endDate: string): string {
    return `📅 カレンダー情報を手動で入力してください

期間: ${startDate} 〜 ${endDate}

以下の形式で予定を教えてください:
- 予定名: 開始時間 - 終了時間

例:
- 会議: 10:00 - 11:00
- ランチ: 12:00 - 13:00

これにより、空き時間を計算して最適なタスク実行時間を提案します。`;
  }
}
