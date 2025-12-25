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
   */
  private buildFetchRemindersScript(listName?: string): string {
    const targetList = listName ? `list "${listName}"` : 'default list';

    return `
tell application "Reminders"
  set reminderList to {}
  set targetList to ${targetList}

  repeat with r in reminders of targetList
    set reminderInfo to {id of r, name of r, body of r, completed of r, due date of r, creation date of r, modification date of r, priority of r}
    set end of reminderList to reminderInfo
  end repeat

  return reminderList
end tell`;
  }

  /**
   * Parse AppleScript result into reminder objects
   */
  private parseRemindersResult(result: string): ReminderFromAppleScript[] {
    if (!result || result.trim() === '' || result.trim() === '{}') {
      return [];
    }

    try {
      // AppleScript returns a list of lists
      // Format: {{id, name, notes, completed, dueDate, creationDate, modificationDate, priority}, ...}
      const reminders: ReminderFromAppleScript[] = [];

      // Basic parsing - AppleScript result format varies
      // This is a simplified parser that handles common formats
      const cleanResult = result.trim();

      // If result looks like a structured list
      if (cleanResult.startsWith('{{') || cleanResult.startsWith('{')) {
        // Split by reminder entries (rough approximation)
        const entries = cleanResult
          .replace(/^\{+|\}+$/g, '')
          .split(/\},\s*\{/);

        for (const entry of entries) {
          const parts = entry.split(',').map((p) => p.trim());
          if (parts.length >= 2) {
            reminders.push({
              id: parts[0]?.replace(/"/g, '') || '',
              title: parts[1]?.replace(/"/g, '') || 'Untitled',
              notes: parts[2]?.replace(/"/g, '') || undefined,
              completed: parts[3]?.toLowerCase() === 'true',
              dueDate: this.parseAppleScriptDate(parts[4]),
              creationDate: this.parseAppleScriptDate(parts[5]),
              modificationDate: this.parseAppleScriptDate(parts[6]),
              priority: parseInt(parts[7] || '0', 10) || undefined,
            });
          }
        }
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
