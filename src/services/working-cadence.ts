/**
 * WorkingCadenceService
 *
 * Provides user's working rhythm information including:
 * - Working hours
 * - Deep work days and meeting-heavy days
 * - Deep work blocks
 * - Scheduling recommendations
 */

import { ConfigLoader } from '../config/loader.js';
import type { CalendarConfig, DeepWorkBlock, UserConfig } from '../types/config.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { CalendarSourceManager } from '../integrations/calendar-source-manager.js';

// Request/Response types
export interface GetWorkingCadenceRequest {
  /** Get info for a specific day of week */
  dayOfWeek?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  /** Get info for a specific date (ISO 8601 format, e.g., "2025-01-15") */
  date?: string;
}

export interface WorkingCadenceResult {
  success: boolean;
  error?: string;

  /** User information */
  user: {
    name: string;
    timezone: string;
  };

  /** Working hours */
  workingHours: {
    start: string;
    end: string;
    totalMinutes: number;
  };

  /** Weekly pattern */
  weeklyPattern: {
    deepWorkDays: string[];
    meetingHeavyDays: string[];
    normalDays: string[];
  };

  /** Deep work blocks with formatted times */
  deepWorkBlocks: DeepWorkBlockInfo[];

  /** Weekly review settings */
  weeklyReview?: {
    enabled: boolean;
    day: string;
    time: string;
    description: string;
  };

  /** Specific day information (when dayOfWeek or date is provided) */
  specificDay?: {
    date?: string;
    dayOfWeek: string;
    dayType: 'deep-work' | 'meeting-heavy' | 'normal';
    deepWorkBlocks: DeepWorkBlockInfo[];
    recommendations: string[];
  };

  /** Scheduling recommendations */
  recommendations: SchedulingRecommendation[];

  /** Generated summary message */
  summary: string;

  /** Focus time statistics from calendar events (optional) */
  focusTimeStats?: {
    /** Total focus time blocks by day of week */
    focusTimeBlocks: Array<{ day: string; duration: number }>;
    /** Days detected as deep work from focusTime events (>=4h) */
    detectedDeepWorkDays: string[];
    /** Whether deep work days were enhanced by focusTime analysis */
    enhanced: boolean;
  };
}

export interface DeepWorkBlockInfo {
  day: string;
  startHour: number;
  endHour: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
}

export interface SchedulingRecommendation {
  type: 'deep-work' | 'meeting' | 'quick-task' | 'review';
  recommendation: string;
  bestDays: string[];
  bestTimeSlots?: string[];
  reason: string;
}

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_MAP: Record<string, string> = {
  Monday: '月',
  Tuesday: '火',
  Wednesday: '水',
  Thursday: '木',
  Friday: '金',
  Saturday: '土',
  Sunday: '日',
};

export class WorkingCadenceService {
  private calendarSourceManager?: CalendarSourceManager;

  /**
   * Constructor
   * @param calendarSourceManager Optional CalendarSourceManager for focusTime analysis
   */
  constructor(calendarSourceManager?: CalendarSourceManager) {
    this.calendarSourceManager = calendarSourceManager;
  }

  /**
   * Get working cadence information
   */
  async getWorkingCadence(request?: GetWorkingCadenceRequest): Promise<WorkingCadenceResult> {
    let config: UserConfig;

    try {
      // Validate request parameters first
      if (request?.dayOfWeek && !VALID_DAYS.includes(request.dayOfWeek)) {
        return this.errorResult(`無効な曜日が指定されました: ${request.dayOfWeek}`);
      }

      if (request?.date && !this.isValidDate(request.date)) {
        return this.errorResult(`無効な日付形式です: ${request.date}`);
      }

      // Load config or use defaults
      if (await ConfigLoader.exists()) {
        config = await ConfigLoader.load();
      } else {
        config = ConfigLoader.getDefaultConfig();
      }
    } catch {
      config = ConfigLoader.getDefaultConfig();
    }

    // Calculate working hours
    const workingHours = this.calculateWorkingHours(config.calendar.workingHours);

    // Load calendar events and analyze focusTime (if CalendarSourceManager is available)
    let focusTimeStats: WorkingCadenceResult['focusTimeStats'];
    let enhancedDeepWorkDays = config.calendar.deepWorkDays;

    if (this.calendarSourceManager) {
      try {
        // Get events from the past 4 weeks for better weekly pattern analysis
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 28);
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 7); // Include next week for upcoming focusTime

        const events = await this.calendarSourceManager.getEvents(
          startDate.toISOString(),
          endDate.toISOString()
        );

        // Analyze focusTime events
        const { focusTimeBlocks } = this.analyzeFocusTimeEvents(events);

        // Enhance deep work detection with focusTime analysis
        const detectedDeepWorkDays = focusTimeBlocks
          .filter((block) => block.duration >= 240) // >=4 hours
          .map((block) => block.day);

        enhancedDeepWorkDays = this.enhanceDeepWorkDetection(
          config.calendar.deepWorkDays,
          focusTimeBlocks
        );

        // Check if any new days were detected from focusTime
        const enhanced = detectedDeepWorkDays.some(
          (day) => !config.calendar.deepWorkDays.includes(day)
        );

        focusTimeStats = {
          focusTimeBlocks,
          detectedDeepWorkDays,
          enhanced,
        };
      } catch (error) {
        // If calendar loading fails, continue without focusTime analysis
        console.error('Failed to load calendar events for focusTime analysis:', error);
      }
    }

    // Build weekly pattern with enhanced deep work days
    const enhancedCalendarConfig = {
      ...config.calendar,
      deepWorkDays: enhancedDeepWorkDays,
    };
    const weeklyPattern = this.buildWeeklyPattern(enhancedCalendarConfig);

    // Transform deep work blocks
    const deepWorkBlocks = this.transformDeepWorkBlocks(config.calendar.deepWorkBlocks);

    // Generate recommendations (with enhanced config for focusTime-aware recommendations)
    const recommendations = this.generateRecommendations(enhancedCalendarConfig, focusTimeStats);

    // Build specific day info if requested (using enhanced deep work days)
    let specificDay: WorkingCadenceResult['specificDay'];
    if (request?.dayOfWeek || request?.date) {
      const dayOfWeek = request.dayOfWeek || this.getDayOfWeek(request.date!);
      specificDay = this.buildSpecificDayInfo(
        dayOfWeek,
        request.date,
        enhancedCalendarConfig,
        deepWorkBlocks,
        focusTimeStats
      );
    }

    // Generate summary (with focusTime info if available)
    const summary = this.generateSummary(
      workingHours,
      weeklyPattern,
      config.reminders.weeklyReview,
      focusTimeStats
    );

    return {
      success: true,
      user: {
        name: config.user.name,
        timezone: config.user.timezone,
      },
      workingHours,
      weeklyPattern,
      deepWorkBlocks,
      weeklyReview: config.reminders.weeklyReview,
      specificDay,
      recommendations,
      summary,
      focusTimeStats,
    };
  }

  /**
   * Get the type of day (deep-work, meeting-heavy, or normal)
   */
  getDayType(
    dayOfWeek: string,
    calendarConfig: CalendarConfig
  ): 'deep-work' | 'meeting-heavy' | 'normal' {
    if (calendarConfig.deepWorkDays.includes(dayOfWeek)) {
      return 'deep-work';
    }
    if (calendarConfig.meetingHeavyDays.includes(dayOfWeek)) {
      return 'meeting-heavy';
    }
    return 'normal';
  }

  /**
   * Get day of week from ISO date string
   */
  getDayOfWeek(date: string): string {
    const d = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
  }

  /**
   * Generate scheduling recommendations based on calendar config
   * @param config Calendar configuration
   * @param focusTimeStats Optional focus time statistics for enhanced recommendations
   */
  generateRecommendations(
    config: CalendarConfig,
    focusTimeStats?: WorkingCadenceResult['focusTimeStats']
  ): SchedulingRecommendation[] {
    const recommendations: SchedulingRecommendation[] = [];

    if (config.deepWorkDays.length > 0) {
      let reason = 'これらの日はDeep Work日として設定されており、集中作業に適しています';

      // Enhance reason if days were detected from focusTime events
      if (focusTimeStats?.enhanced && focusTimeStats.detectedDeepWorkDays.length > 0) {
        const detectedDays = focusTimeStats.detectedDeepWorkDays.filter(
          (day) => !config.deepWorkDays.includes(day)
        );
        if (detectedDays.length > 0) {
          reason += ` (${this.formatDays(detectedDays)}はFocus Timeイベントから検出)`;
        }
      }

      recommendations.push({
        type: 'deep-work',
        recommendation: `複雑なタスクは${this.formatDays(config.deepWorkDays)}にスケジュールしてください`,
        bestDays: config.deepWorkDays,
        reason,
      });
    }

    if (config.meetingHeavyDays.length > 0) {
      recommendations.push({
        type: 'meeting',
        recommendation: `ミーティングは${this.formatDays(config.meetingHeavyDays)}に集中させることを推奨します`,
        bestDays: config.meetingHeavyDays,
        reason: 'これらの日はミーティング集中日として設定されています',
      });
    }

    // Quick task recommendation
    if (config.meetingHeavyDays.length > 0) {
      recommendations.push({
        type: 'quick-task',
        recommendation: `短時間タスクは${this.formatDays(config.meetingHeavyDays)}のミーティング合間に処理できます`,
        bestDays: config.meetingHeavyDays,
        reason: 'ミーティング日の合間は短いタスクに適しています',
      });
    }

    // Focus time recommendation if focusTime events exist
    if (focusTimeStats && focusTimeStats.focusTimeBlocks.length > 0) {
      const focusTimeDays = focusTimeStats.focusTimeBlocks.map((block) => block.day);
      const uniqueFocusTimeDays = [...new Set(focusTimeDays)];

      recommendations.push({
        type: 'deep-work',
        recommendation: `${this.formatDays(uniqueFocusTimeDays)}には既存のFocus Timeブロックがあります。この時間を活用してください`,
        bestDays: uniqueFocusTimeDays,
        reason: 'カレンダーにFocus Timeイベントが登録されています。集中作業に最適な時間です',
      });
    }

    return recommendations;
  }

  /**
   * Calculate working hours info from config
   */
  calculateWorkingHours(workingHours: { start: string; end: string }): {
    start: string;
    end: string;
    totalMinutes: number;
  } {
    const startMinutes = this.timeToMinutes(workingHours.start);
    const endMinutes = this.timeToMinutes(workingHours.end);
    const totalMinutes = Math.max(0, endMinutes - startMinutes);

    return {
      start: workingHours.start,
      end: workingHours.end,
      totalMinutes,
    };
  }

  /**
   * Transform deep work blocks to include formatted times and duration
   */
  transformDeepWorkBlocks(blocks: DeepWorkBlock[]): DeepWorkBlockInfo[] {
    return blocks.map((block) => ({
      day: block.day,
      startHour: block.startHour,
      endHour: block.endHour,
      startTime: this.formatHour(block.startHour),
      endTime: this.formatHour(block.endHour),
      durationMinutes: (block.endHour - block.startHour) * 60,
      description: block.description,
    }));
  }

  /**
   * Format array of English days to Japanese
   */
  formatDays(days: string[]): string {
    if (days.length === 0) return '';
    return days.map((d) => DAY_MAP[d] || d).join('・');
  }

  // Private helper methods

  private buildWeeklyPattern(config: CalendarConfig): {
    deepWorkDays: string[];
    meetingHeavyDays: string[];
    normalDays: string[];
  } {
    const normalDays = ALL_DAYS.filter(
      (day) => !config.deepWorkDays.includes(day) && !config.meetingHeavyDays.includes(day)
    );

    return {
      deepWorkDays: config.deepWorkDays,
      meetingHeavyDays: config.meetingHeavyDays,
      normalDays,
    };
  }

  private buildSpecificDayInfo(
    dayOfWeek: string,
    date: string | undefined,
    calendarConfig: CalendarConfig,
    allDeepWorkBlocks: DeepWorkBlockInfo[],
    focusTimeStats?: WorkingCadenceResult['focusTimeStats']
  ): WorkingCadenceResult['specificDay'] {
    const dayType = this.getDayType(dayOfWeek, calendarConfig);
    const dayBlocks = allDeepWorkBlocks.filter((block) => block.day === dayOfWeek);

    const recommendations: string[] = [];
    if (dayType === 'deep-work') {
      recommendations.push('この日は集中作業に適しています。複雑なタスクをスケジュールしてください。');
      if (dayBlocks.length > 0) {
        const times = dayBlocks.map((b) => `${b.startTime}-${b.endTime}`).join(', ');
        recommendations.push(`Deep Workブロック: ${times}`);
      }

      // Add focusTime info if detected from calendar events
      if (focusTimeStats?.detectedDeepWorkDays.includes(dayOfWeek)) {
        const focusTimeBlock = focusTimeStats.focusTimeBlocks.find((b) => b.day === dayOfWeek);
        if (focusTimeBlock) {
          const hours = Math.floor(focusTimeBlock.duration / 60);
          const minutes = Math.round(focusTimeBlock.duration % 60);
          const durationStr = minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
          recommendations.push(`Focus Timeイベント: 合計${durationStr}のFocus Timeが登録されています`);
        }
      }
    } else if (dayType === 'meeting-heavy') {
      recommendations.push(
        'この日はミーティングが多い日です。ミーティングの合間に短いタスクを処理してください。'
      );
    } else {
      recommendations.push('この日は特別な設定がありません。自由にスケジュールを組めます。');

      // Check if there are focusTime blocks on this day
      if (focusTimeStats) {
        const focusTimeBlock = focusTimeStats.focusTimeBlocks.find((b) => b.day === dayOfWeek);
        if (focusTimeBlock) {
          const hours = Math.floor(focusTimeBlock.duration / 60);
          const minutes = Math.round(focusTimeBlock.duration % 60);
          const durationStr = minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
          recommendations.push(`Focus Timeイベント: 合計${durationStr}のFocus Timeが登録されています`);
        }
      }
    }

    return {
      date,
      dayOfWeek,
      dayType,
      deepWorkBlocks: dayBlocks,
      recommendations,
    };
  }

  private generateSummary(
    workingHours: { start: string; end: string; totalMinutes: number },
    weeklyPattern: { deepWorkDays: string[]; meetingHeavyDays: string[] },
    weeklyReview?: { enabled: boolean; day: string; time: string },
    focusTimeStats?: WorkingCadenceResult['focusTimeStats']
  ): string {
    const lines: string[] = [];

    lines.push(`勤務時間: ${workingHours.start}-${workingHours.end} (${Math.floor(workingHours.totalMinutes / 60)}時間)`);

    if (weeklyPattern.deepWorkDays.length > 0) {
      let deepWorkLine = `Deep Work日: ${this.formatDays(weeklyPattern.deepWorkDays)}`;

      // Add indicator if days were enhanced by focusTime analysis
      if (focusTimeStats?.enhanced) {
        deepWorkLine += ' (Focus Time分析により強化)';
      }

      lines.push(deepWorkLine);
    }

    if (weeklyPattern.meetingHeavyDays.length > 0) {
      lines.push(`ミーティング集中日: ${this.formatDays(weeklyPattern.meetingHeavyDays)}`);
    }

    if (weeklyReview?.enabled) {
      lines.push(`週次レビュー: ${DAY_MAP[weeklyReview.day] || weeklyReview.day}曜 ${weeklyReview.time}`);
    }

    // Add focusTime summary if available
    if (focusTimeStats && focusTimeStats.focusTimeBlocks.length > 0) {
      const totalFocusMinutes = focusTimeStats.focusTimeBlocks.reduce(
        (sum, block) => sum + block.duration,
        0
      );
      const hours = Math.floor(totalFocusMinutes / 60);
      const minutes = Math.round(totalFocusMinutes % 60);
      const durationStr = minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
      lines.push(`Focus Time: 週合計${durationStr}`);
    }

    return lines.join('\n');
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private formatHour(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  private isValidDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }

  private errorResult(error: string): WorkingCadenceResult {
    return {
      success: false,
      error,
      user: { name: '', timezone: '' },
      workingHours: { start: '', end: '', totalMinutes: 0 },
      weeklyPattern: { deepWorkDays: [], meetingHeavyDays: [], normalDays: [] },
      deepWorkBlocks: [],
      recommendations: [],
      summary: '',
    };
  }

  /**
   * Analyze focus time events from calendar
   * Filters events with eventType='focusTime' and calculates total focus time per day
   * @param events Calendar events to analyze
   * @returns Object containing focus time blocks with day and duration
   */
  private analyzeFocusTimeEvents(
    events: CalendarEvent[]
  ): { focusTimeBlocks: Array<{ day: string; duration: number }> } {
    // Filter events with eventType='focusTime'
    const focusTimeEvents = events.filter((e) => e.eventType === 'focusTime');

    // Calculate total focus time per day
    const focusTimeByDay = new Map<string, number>();

    for (const event of focusTimeEvents) {
      const day = new Date(event.start).toLocaleDateString('en-US', { weekday: 'long' });
      const duration =
        (new Date(event.end).getTime() - new Date(event.start).getTime()) / (1000 * 60); // minutes
      focusTimeByDay.set(day, (focusTimeByDay.get(day) || 0) + duration);
    }

    // Return focus time statistics
    const focusTimeBlocks = Array.from(focusTimeByDay.entries()).map(([day, duration]) => ({
      day,
      duration,
    }));
    return { focusTimeBlocks };
  }

  /**
   * Enhance deep work detection by combining config settings with focus time analysis
   * Days with >=4h (240 minutes) of focusTime events are considered deep work days
   * @param configDeepWorkDays Deep work days from configuration
   * @param focusTimeBlocks Focus time blocks from calendar analysis
   * @returns Combined list of deep work days (unique values)
   */
  private enhanceDeepWorkDetection(
    configDeepWorkDays: string[],
    focusTimeBlocks: Array<{ day: string; duration: number }>
  ): string[] {
    // Days with >=4h (240 minutes) of focusTime events are considered deep work days
    const focusTimeDays = focusTimeBlocks
      .filter((block) => block.duration >= 240)
      .map((block) => block.day);

    // Combine config.deepWorkDays with focusTime analysis (remove duplicates)
    const allDeepWorkDays = new Set([...configDeepWorkDays, ...focusTimeDays]);
    return Array.from(allDeepWorkDays);
  }
}
