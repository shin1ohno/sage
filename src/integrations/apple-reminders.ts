/**
 * Apple Reminders Service
 * macOS AppleScript integration for Apple Reminders
 * Requirements: 9.1-9.6
 *
 * 現行実装: macOS AppleScript経由
 * 将来対応予定: iOS/iPadOS ネイティブ統合（Claude Skills APIがデバイスAPIへのアクセスを提供した時点）
 */

import { retryWithBackoff, isRetryableError } from '../utils/retry.js';

// Declare window for browser environment detection
declare const window: any;

/**
 * Default retry options for Apple Reminders operations
 */
const RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelay: 500,
  maxDelay: 5000,
  shouldRetry: isRetryableError,
};

/**
 * Platform information for Reminders integration
 */
export interface RemindersPlatformInfo {
  platform: 'ios' | 'ipados' | 'macos' | 'web' | 'unknown';
  hasNativeIntegration: boolean;
  supportsAppleScript: boolean;
  recommendedMethod: 'native' | 'applescript' | 'fallback';
}

/**
 * Reminder request
 */
export interface ReminderRequest {
  title: string;
  notes?: string;
  dueDate?: string;
  list?: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Reminder creation result
 */
export interface ReminderResult {
  success: boolean;
  method: 'native' | 'applescript' | 'fallback';
  reminderId?: string;
  reminderUrl?: string;
  error?: string;
  fallbackText?: string;
  platformInfo?: RemindersPlatformInfo;
}

/**
 * Apple Reminders Service
 * Provides platform-adaptive integration with Apple Reminders
 */
export class AppleRemindersService {
  private runAppleScript: ((script: string) => Promise<string>) | null = null;

  constructor() {
    // Lazy load run-applescript only when needed
  }

  /**
   * Detect the current platform
   * Requirement: 9.2, 9.3
   */
  async detectPlatform(): Promise<RemindersPlatformInfo> {
    // Check for macOS (Node.js environment)
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      return {
        platform: 'macos',
        hasNativeIntegration: false,
        supportsAppleScript: true,
        recommendedMethod: 'applescript',
      };
    }

    // Check for iOS/iPadOS (Skills environment)
    if (typeof window !== 'undefined') {
      const userAgent = (window as any).navigator?.userAgent || '';

      if (userAgent.includes('iPhone')) {
        return {
          platform: 'ios',
          hasNativeIntegration: true,
          supportsAppleScript: false,
          recommendedMethod: 'native',
        };
      }

      if (userAgent.includes('iPad')) {
        return {
          platform: 'ipados',
          hasNativeIntegration: true,
          supportsAppleScript: false,
          recommendedMethod: 'native',
        };
      }

      // Web browser
      return {
        platform: 'web',
        hasNativeIntegration: false,
        supportsAppleScript: false,
        recommendedMethod: 'fallback',
      };
    }

    return {
      platform: 'unknown',
      hasNativeIntegration: false,
      supportsAppleScript: false,
      recommendedMethod: 'fallback',
    };
  }

  /**
   * Check if Reminders integration is available
   */
  async isAvailable(): Promise<boolean> {
    const platform = await this.detectPlatform();
    return platform.supportsAppleScript || platform.hasNativeIntegration;
  }

  /**
   * Create a reminder
   * Requirement: 9.1, 9.4, 9.5
   */
  async createReminder(request: ReminderRequest): Promise<ReminderResult> {
    const platform = await this.detectPlatform();

    switch (platform.recommendedMethod) {
      case 'native':
        return this.createNativeReminder(request, platform);

      case 'applescript':
        return this.createAppleScriptReminder(request, platform);

      case 'fallback':
      default:
        return this.createFallbackReminder(request, platform);
    }
  }

  /**
   * Create reminder via native iOS/iPadOS API
   * 🔮 将来対応予定: Claude Skills APIがデバイスAPIへのアクセスを提供した時点で実装
   * 現時点では window.claude?.reminders API は存在しません
   * Requirement: 9.2
   */
  private async createNativeReminder(
    _request: ReminderRequest,
    platform: RemindersPlatformInfo
  ): Promise<ReminderResult> {
    // 🔮 将来対応予定: ネイティブ統合
    // 現時点では、iOS/iPadOSでの実行時はフォールバックにリダイレクト
    return {
      success: false,
      method: 'native',
      error:
        'ネイティブReminders統合は将来対応予定です。現在はmacOS AppleScriptのみサポートしています。',
      platformInfo: platform,
      fallbackText: this.generateFallbackText(_request),
    };
  }

  /**
   * Create reminder via AppleScript (macOS)
   * Requirement: 9.3
   */
  private async createAppleScriptReminder(
    request: ReminderRequest,
    platform: RemindersPlatformInfo
  ): Promise<ReminderResult> {
    try {
      // Lazy load run-applescript
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildAppleScript(request);

      // Use retry with exponential backoff for AppleScript execution
      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`AppleScript retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return {
        success: true,
        method: 'applescript',
        reminderId: result || undefined,
        platformInfo: platform,
      };
    } catch (error) {
      return {
        success: false,
        method: 'applescript',
        error: `AppleScript エラー: ${(error as Error).message}`,
        platformInfo: platform,
      };
    }
  }

  /**
   * Create fallback reminder (manual copy)
   * Requirement: 9.6
   */
  private async createFallbackReminder(
    request: ReminderRequest,
    platform: RemindersPlatformInfo
  ): Promise<ReminderResult> {
    const fallbackText = this.generateFallbackText(request);

    return {
      success: false,
      method: 'fallback',
      error: 'Apple Reminders統合が利用できません。以下のテキストを手動でコピーしてください。',
      fallbackText,
      platformInfo: platform,
    };
  }

  /**
   * Build AppleScript for creating a reminder
   */
  buildAppleScript(request: ReminderRequest): string {
    const escapedTitle = this.escapeAppleScript(request.title);
    const escapedNotes = request.notes ? this.escapeAppleScript(request.notes) : '';
    const listName = request.list || 'Reminders';
    const priority = this.mapPriority(request.priority);

    let script = `
tell application "Reminders"
  set myList to list "${listName}"
  set newReminder to make new reminder at end of myList
  set name of newReminder to "${escapedTitle}"
`;

    if (request.notes) {
      script += `  set body of newReminder to "${escapedNotes}"\n`;
    }

    if (request.dueDate) {
      const date = new Date(request.dueDate);
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      script += `  set due date of newReminder to date "${dateStr} at ${timeStr}"\n`;
    }

    if (priority > 0) {
      script += `  set priority of newReminder to ${priority}\n`;
    }

    script += `  return id of newReminder
end tell`;

    return script;
  }

  /**
   * Generate fallback text for manual copying
   */
  generateFallbackText(request: ReminderRequest): string {
    let text = `📝 Apple Remindersに追加:\n\n`;
    text += `タイトル: ${request.title}\n`;

    if (request.notes) {
      text += `メモ: ${request.notes}\n`;
    }

    if (request.dueDate) {
      const date = new Date(request.dueDate);
      text += `期限: ${date.toLocaleString('ja-JP')}\n`;
    }

    if (request.priority) {
      const priorityMap = { high: '高', medium: '中', low: '低' };
      text += `優先度: ${priorityMap[request.priority]}\n`;
    }

    if (request.list) {
      text += `リスト: ${request.list}\n`;
    }

    return text;
  }

  /**
   * Map priority to Apple Reminders priority value
   * 0 = no priority, 1 = high, 5 = medium, 9 = low
   */
  mapPriority(priority?: 'low' | 'medium' | 'high'): number {
    switch (priority) {
      case 'high':
        return 1;
      case 'medium':
        return 5;
      case 'low':
        return 9;
      default:
        return 0;
    }
  }

  /**
   * Escape special characters for AppleScript
   */
  private escapeAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Fetched reminder from Apple Reminders
   */
  public reminderFromAppleScript: ReminderFromAppleScript[] = [];

  /**
   * Fetch reminders from Apple Reminders
   * Requirement: 12.1
   */
  async fetchReminders(listName?: string): Promise<ReminderFromAppleScript[]> {
    const platform = await this.detectPlatform();

    if (!platform.supportsAppleScript) {
      return [];
    }

    try {
      // Lazy load run-applescript
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildFetchRemindersScript(listName);

      const result = await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`AppleScript fetch retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      // Parse the AppleScript result
      return this.parseRemindersResult(result);
    } catch (error) {
      console.error('Failed to fetch reminders:', error);
      return [];
    }
  }

  /**
   * Build AppleScript for fetching reminders
   * Returns data in a parseable format with ||| as field delimiter and %%% as record delimiter
   */
  private buildFetchRemindersScript(listName?: string): string {
    const targetList = listName ? `list "${listName}"` : 'default list';

    return `
tell application "Reminders"
  set output to ""
  set targetList to ${targetList}
  set recordDelim to "%%%"
  set fieldDelim to "|||"

  repeat with r in reminders of targetList
    set reminderId to id of r
    set reminderName to name of r

    -- Handle body (notes) - may be missing value
    try
      set reminderBody to body of r
      if reminderBody is missing value then
        set reminderBody to ""
      end if
    on error
      set reminderBody to ""
    end try

    set reminderCompleted to completed of r

    -- Handle due date - may be missing value
    try
      set reminderDue to due date of r
      if reminderDue is missing value then
        set reminderDueStr to ""
      else
        set reminderDueStr to (reminderDue as string)
      end if
    on error
      set reminderDueStr to ""
    end try

    -- Handle creation date
    try
      set reminderCreated to (creation date of r as string)
    on error
      set reminderCreated to ""
    end try

    -- Handle modification date
    try
      set reminderModified to (modification date of r as string)
    on error
      set reminderModified to ""
    end try

    set reminderPriority to priority of r

    set reminderRecord to reminderId & fieldDelim & reminderName & fieldDelim & reminderBody & fieldDelim & reminderCompleted & fieldDelim & reminderDueStr & fieldDelim & reminderCreated & fieldDelim & reminderModified & fieldDelim & reminderPriority

    if output is "" then
      set output to reminderRecord
    else
      set output to output & recordDelim & reminderRecord
    end if
  end repeat

  return output
end tell`;
  }

  /**
   * Parse AppleScript result into reminder objects
   * Format: record1%%%record2%%%...
   * Each record: id|||name|||body|||completed|||dueDate|||creationDate|||modificationDate|||priority
   */
  private parseRemindersResult(result: string): ReminderFromAppleScript[] {
    if (!result || result.trim() === '') {
      return [];
    }

    try {
      const RECORD_DELIMITER = '%%%';
      const FIELD_DELIMITER = '|||';
      const reminders: ReminderFromAppleScript[] = [];

      // Split by record delimiter
      const records = result.split(RECORD_DELIMITER);

      for (const record of records) {
        const trimmedRecord = record.trim();
        if (!trimmedRecord) continue;

        // Split by field delimiter
        const fields = trimmedRecord.split(FIELD_DELIMITER);

        if (fields.length < 2) continue; // At minimum need id and title

        const id = fields[0]?.trim() || '';
        const title = fields[1]?.trim() || 'Untitled';
        const notes = fields[2]?.trim() || undefined;
        const completedStr = fields[3]?.trim().toLowerCase() || 'false';
        const dueDateStr = fields[4]?.trim() || undefined;
        const creationDateStr = fields[5]?.trim() || undefined;
        const modificationDateStr = fields[6]?.trim() || undefined;
        const priorityStr = fields[7]?.trim() || '0';

        // Skip if no valid id
        if (!id) continue;

        reminders.push({
          id,
          title,
          notes: notes || undefined,
          completed: completedStr === 'true',
          dueDate: this.parseAppleScriptDate(dueDateStr),
          creationDate: this.parseAppleScriptDate(creationDateStr),
          modificationDate: this.parseAppleScriptDate(modificationDateStr),
          priority: parseInt(priorityStr, 10) || undefined,
        });
      }

      return reminders;
    } catch (error) {
      console.error('Failed to parse reminders result:', error);
      return [];
    }
  }

  /**
   * Parse AppleScript date string to ISO format
   */
  private parseAppleScriptDate(dateStr?: string): string | undefined {
    if (!dateStr || dateStr === 'missing value' || dateStr === '') {
      return undefined;
    }

    try {
      const date = new Date(dateStr.replace(/"/g, ''));
      if (isNaN(date.getTime())) {
        return undefined;
      }
      return date.toISOString();
    } catch {
      return undefined;
    }
  }

  /**
   * Update reminder status (mark as completed/incomplete)
   * Requirement: 12.5
   */
  async updateReminderStatus(
    reminderId: string,
    completed: boolean,
    listName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const platform = await this.detectPlatform();

    if (!platform.supportsAppleScript) {
      return {
        success: false,
        error: 'AppleScript is not supported on this platform',
      };
    }

    try {
      // Lazy load run-applescript
      if (!this.runAppleScript) {
        const module = await import('run-applescript');
        this.runAppleScript = module.runAppleScript;
      }

      const script = this.buildUpdateStatusScript(reminderId, completed, listName);

      await retryWithBackoff(
        async () => {
          return await this.runAppleScript!(script);
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (error, attempt) => {
            console.error(`AppleScript update retry attempt ${attempt}: ${error.message}`);
          },
        }
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update reminder: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Build AppleScript for updating reminder status
   */
  private buildUpdateStatusScript(reminderId: string, completed: boolean, listName?: string): string {
    const escapedId = this.escapeAppleScript(reminderId);
    const targetList = listName ? `list "${this.escapeAppleScript(listName)}"` : 'default list';

    return `
tell application "Reminders"
  set targetList to ${targetList}
  repeat with r in reminders of targetList
    if id of r is "${escapedId}" then
      set completed of r to ${completed}
      return "success"
    end if
  end repeat
  return "not found"
end tell`;
  }
}

/**
 * Reminder fetched from Apple Reminders
 */
export interface ReminderFromAppleScript {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  dueDate?: string;
  creationDate?: string;
  modificationDate?: string;
  priority?: number;
}
