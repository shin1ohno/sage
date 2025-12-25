/**
 * Apple Reminders Service
 * Platform-adaptive Apple Reminders integration
 * Requirements: 9.1-9.6
 */

// Declare window for browser environment detection
declare const window: any;

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
   * Requirement: 9.2
   */
  private async createNativeReminder(
    request: ReminderRequest,
    platform: RemindersPlatformInfo
  ): Promise<ReminderResult> {
    try {
      // This would use window.claude?.reminders?.create() in Skills environment
      const claudeReminders = (window as any).claude?.reminders;

      if (!claudeReminders) {
        return {
          success: false,
          method: 'native',
          error: 'ネイティブReminders APIが利用できません',
          platformInfo: platform,
        };
      }

      const result = await claudeReminders.create({
        title: request.title,
        notes: request.notes,
        dueDate: request.dueDate,
        list: request.list || 'Reminders',
        priority: this.mapPriority(request.priority),
      });

      return {
        success: true,
        method: 'native',
        reminderId: result.id,
        reminderUrl: result.url,
        platformInfo: platform,
      };
    } catch (error) {
      return {
        success: false,
        method: 'native',
        error: `ネイティブ統合エラー: ${(error as Error).message}`,
        platformInfo: platform,
      };
    }
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
      const result = await this.runAppleScript(script);

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
}
