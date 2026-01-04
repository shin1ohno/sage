/**
 * Reminder Manager
 * Orchestrates reminder creation across Apple Reminders and Notion
 * Requirements: 5.1-5.6
 */

import { AppleRemindersService } from './apple-reminders.js';
import type { Priority } from '../types/index.js';

/**
 * Reminder configuration
 */
export interface ReminderConfig {
  appleRemindersThreshold: number; // Days threshold for Apple Reminders
  notionThreshold: number; // Days threshold for Notion
  defaultList: string;
  notionDatabaseId: string;
}

/**
 * Reminder request
 */
export interface ReminderRequest {
  taskTitle: string;
  reminderType?: string;
  targetDate?: string;
  list?: string;
  priority?: Priority;
  notes?: string;
  stakeholders?: string[];
  estimatedMinutes?: number;
}

/**
 * Notion request info for delegation to Claude Code
 */
export interface NotionDelegationRequest {
  databaseId: string;
  dataSourceId?: string;
  title: string;
  properties: Record<string, any>;
}

/**
 * Reminder result
 */
export interface ReminderResult {
  success: boolean;
  destination: 'apple_reminders' | 'notion_mcp';
  method?: 'native' | 'applescript' | 'mcp' | 'fallback' | 'delegate';
  reminderId?: string;
  reminderUrl?: string;
  pageUrl?: string;
  error?: string;
  fallbackText?: string;
  /** When true, Claude Code should use Notion MCP directly */
  delegateToNotion?: boolean;
  /** Request info for Notion MCP delegation */
  notionRequest?: NotionDelegationRequest;
}

/**
 * Reminder time
 */
export interface ReminderTime {
  type: string;
  time: string;
}

/**
 * Reminder Manager
 * Decides where to create reminders based on deadline
 * Note: Notion integration is delegated to Claude Code (MCP servers cannot call other MCP servers)
 */
export class ReminderManager {
  private config: ReminderConfig;
  private appleReminders: AppleRemindersService;

  constructor(config: ReminderConfig) {
    this.config = config;
    this.appleReminders = new AppleRemindersService();
  }

  /**
   * Determine destination based on deadline
   * Requirement: 5.2, 5.3, 5.4
   * Tasks without deadline are assumed to have infinite future deadline → Notion
   */
  determineDestination(deadline: string | undefined): 'apple' | 'notion' {
    // No deadline = infinite future = Notion (Requirement 5.4)
    if (!deadline) {
      return 'notion';
    }

    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays >= this.config.notionThreshold) {
      return 'notion';
    }

    return 'apple';
  }

  /**
   * Set a reminder
   * Requirement: 5.1, 5.4, 5.5
   */
  async setReminder(request: ReminderRequest): Promise<ReminderResult> {
    const destination = this.determineDestination(request.targetDate);

    if (destination === 'notion') {
      return this.createNotionEntry(request);
    }

    return this.createAppleReminder(request);
  }

  /**
   * Create Apple Reminder
   */
  private async createAppleReminder(request: ReminderRequest): Promise<ReminderResult> {
    const result = await this.appleReminders.createReminder({
      title: request.taskTitle,
      notes: request.notes,
      dueDate: request.targetDate,
      list: request.list || this.config.defaultList,
      priority: this.mapPriorityToApple(request.priority),
    });

    if (result.success) {
      return {
        success: true,
        destination: 'apple_reminders',
        method: result.method,
        reminderId: result.reminderId,
        reminderUrl: result.reminderUrl,
      };
    }

    return {
      success: false,
      destination: 'apple_reminders',
      method: result.method,
      error: result.error,
      fallbackText: result.fallbackText,
    };
  }

  /**
   * Create Notion entry
   * Delegates to Claude Code to use Notion MCP directly
   * sage cannot call other MCP servers, so we return delegation info
   */
  private async createNotionEntry(request: ReminderRequest): Promise<ReminderResult> {
    // Build properties in a format compatible with Notion MCP
    // Uses any due to dynamic Notion property schema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notionProperties: Record<string, any> = {
      'Project Name': request.taskTitle,
    };

    if (request.priority) {
      notionProperties['Priority'] = request.priority;
    }

    if (request.targetDate) {
      notionProperties['date:Target Date:start'] = request.targetDate;
      notionProperties['date:Target Date:is_datetime'] = 0;
    }

    notionProperties['Status'] = 'Planning';

    if (request.notes) {
      notionProperties['Key Milestones'] = request.notes;
    }

    // Return delegation info instead of trying to call Notion MCP directly
    // Claude Code will use this info to call notion-create-pages tool
    return {
      success: true,
      destination: 'notion_mcp',
      method: 'delegate',
      delegateToNotion: true,
      notionRequest: {
        databaseId: this.config.notionDatabaseId,
        title: request.taskTitle,
        properties: notionProperties,
      },
    };
  }

  /**
   * Calculate reminder times based on types
   * Requirement: 5.4
   */
  calculateReminderTimes(deadline: string, types: string[]): ReminderTime[] {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const times: ReminderTime[] = [];

    for (const type of types) {
      const reminderTime = this.calculateSingleReminderTime(deadlineDate, type);

      // Only include future reminder times
      if (reminderTime > now) {
        times.push({
          type,
          time: reminderTime.toISOString(),
        });
      }
    }

    return times;
  }

  /**
   * Calculate a single reminder time
   */
  private calculateSingleReminderTime(deadline: Date, type: string): Date {
    const reminderDate = new Date(deadline);

    switch (type) {
      case '1_hour_before':
        reminderDate.setHours(reminderDate.getHours() - 1);
        break;

      case '3_hours_before':
        reminderDate.setHours(reminderDate.getHours() - 3);
        break;

      case '1_day_before':
        reminderDate.setDate(reminderDate.getDate() - 1);
        break;

      case '3_days_before':
        reminderDate.setDate(reminderDate.getDate() - 3);
        break;

      case '1_week_before':
        reminderDate.setDate(reminderDate.getDate() - 7);
        break;

      default:
        // Default to 1 day before
        reminderDate.setDate(reminderDate.getDate() - 1);
    }

    return reminderDate;
  }

  /**
   * Map sage priority to Apple Reminders priority
   */
  mapPriorityToApple(priority: Priority | undefined): 'low' | 'medium' | 'high' {
    switch (priority) {
      case 'P0':
      case 'P1':
        return 'high';

      case 'P2':
        return 'medium';

      case 'P3':
        return 'low';

      default:
        return 'medium';
    }
  }
}
