/**
 * Calendar Service
 * Platform-adaptive calendar integration
 * Requirements: 6.1-6.9
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

export type CalendarMethod = 'native' | 'applescript' | 'caldav' | 'ical_url' | 'manual_input' | 'outlook';

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
        availableMethods: ['applescript', 'caldav'],
        recommendedMethod: 'applescript',
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

      case 'applescript':
        return this.fetchAppleScriptEvents(startDate, endDate);

      case 'manual_input':
      default:
        return [];
    }
  }

  /**
   * Fetch events via native iOS/iPadOS API
   * Requirement: 6.2
   */
  private async fetchNativeEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    try {
      const claudeCalendar = window.claude?.calendar;

      if (!claudeCalendar) {
        return [];
      }

      // Use retry with exponential backoff for native API calls
      const events = await retryWithBackoff(
        async () => {
          return await claudeCalendar.getEvents({
            startDate,
            endDate,
            includeAllDayEvents: false,
          });
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`Native Calendar retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return events.map((event: any) => ({
        id: event.id,
        title: event.title,
        start: event.startDate,
        end: event.endDate,
        isAllDay: event.isAllDay,
        source: 'native',
      }));
    } catch (error) {
      console.error('ネイティブカレンダー統合エラー:', error);
      return [];
    }
  }

  /**
   * Fetch events via AppleScript (macOS)
   * Requirement: 6.3
   */
  private async fetchAppleScriptEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    try {
      // Lazy load run-applescript
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildFetchEventsScript(startDate, endDate);

      // Use retry with exponential backoff for AppleScript execution
      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`AppleScript Calendar retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return this.parseAppleScriptResult(result);
    } catch (error) {
      console.error('AppleScript カレンダーエラー:', error);
      return [];
    }
  }

  /**
   * Build AppleScript for fetching events
   */
  private buildFetchEventsScript(startDate: string, endDate: string): string {
    return `
tell application "Calendar"
  set startDate to date "${startDate}"
  set endDate to date "${endDate}"
  set eventList to ""

  repeat with cal in calendars
    set calEvents to (every event of cal whose start date ≥ startDate and start date ≤ endDate)
    repeat with evt in calEvents
      set eventInfo to (summary of evt) & "|" & (start date of evt as string) & "|" & (end date of evt as string) & "|" & (uid of evt)
      set eventList to eventList & eventInfo & linefeed
    end repeat
  end repeat

  return eventList
end tell`;
  }

  /**
   * Parse AppleScript result into events
   */
  parseAppleScriptResult(output: string): CalendarEvent[] {
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
          isAllDay: false,
          source: 'applescript',
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
          source: 'applescript',
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
        source: 'applescript',
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
