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

    // Build weekly pattern
    const weeklyPattern = this.buildWeeklyPattern(config.calendar);

    // Transform deep work blocks
    const deepWorkBlocks = this.transformDeepWorkBlocks(config.calendar.deepWorkBlocks);

    // Generate recommendations
    const recommendations = this.generateRecommendations(config.calendar);

    // Build specific day info if requested
    let specificDay: WorkingCadenceResult['specificDay'];
    if (request?.dayOfWeek || request?.date) {
      const dayOfWeek = request.dayOfWeek || this.getDayOfWeek(request.date!);
      specificDay = this.buildSpecificDayInfo(
        dayOfWeek,
        request.date,
        config.calendar,
        deepWorkBlocks
      );
    }

    // Generate summary
    const summary = this.generateSummary(
      workingHours,
      weeklyPattern,
      config.reminders.weeklyReview
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
   */
  generateRecommendations(config: CalendarConfig): SchedulingRecommendation[] {
    const recommendations: SchedulingRecommendation[] = [];

    if (config.deepWorkDays.length > 0) {
      recommendations.push({
        type: 'deep-work',
        recommendation: `複雑なタスクは${this.formatDays(config.deepWorkDays)}にスケジュールしてください`,
        bestDays: config.deepWorkDays,
        reason: 'これらの日はDeep Work日として設定されており、集中作業に適しています',
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
    allDeepWorkBlocks: DeepWorkBlockInfo[]
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
    } else if (dayType === 'meeting-heavy') {
      recommendations.push(
        'この日はミーティングが多い日です。ミーティングの合間に短いタスクを処理してください。'
      );
    } else {
      recommendations.push('この日は特別な設定がありません。自由にスケジュールを組めます。');
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
    weeklyReview?: { enabled: boolean; day: string; time: string }
  ): string {
    const lines: string[] = [];

    lines.push(`勤務時間: ${workingHours.start}-${workingHours.end} (${Math.floor(workingHours.totalMinutes / 60)}時間)`);

    if (weeklyPattern.deepWorkDays.length > 0) {
      lines.push(`Deep Work日: ${this.formatDays(weeklyPattern.deepWorkDays)}`);
    }

    if (weeklyPattern.meetingHeavyDays.length > 0) {
      lines.push(`ミーティング集中日: ${this.formatDays(weeklyPattern.meetingHeavyDays)}`);
    }

    if (weeklyReview?.enabled) {
      lines.push(`週次レビュー: ${DAY_MAP[weeklyReview.day] || weeklyReview.day}曜 ${weeklyReview.time}`);
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
}
