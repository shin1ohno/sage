/**
 * IntegrationStrategyManager
 *
 * Manages platform-specific integration strategies for calendar and reminder operations.
 * Uses the Strategy Pattern to determine the optimal integration approach based on
 * the detected platform (iOS/iPad/macOS/web).
 *
 * This component is responsible for:
 * 1. Determining which integration strategy to use for each platform
 * 2. Building Sampling messages that instruct Claude on how to execute operations
 * 3. Sanitizing user input before including in Sampling messages
 *
 * @see requirements.md 3.1-3.3 (Calendar Strategy)
 * @see requirements.md 4.1-4.3 (Reminder Strategy)
 * @see design.md Component 3: Integration Strategy Manager
 */

import type { DetectedPlatform } from '../types/platform.js';

/**
 * Describes the integration strategy for a specific operation
 *
 * @example Calendar strategy for iOS:
 * ```typescript
 * {
 *   useSampling: true,
 *   samplingMessage: "Please fetch events from native iOS Calendar...",
 *   mcpToolsToCall: ['list_calendar_events'],
 *   nativeIntegrations: ['ios-calendar']
 * }
 * ```
 *
 * @example Calendar strategy for macOS:
 * ```typescript
 * {
 *   useSampling: false,
 *   mcpToolsToCall: ['list_calendar_events'],
 *   nativeIntegrations: []
 * }
 * ```
 */
export interface IntegrationStrategy {
  /**
   * Whether to use MCP Sampling for this operation.
   * If true, Claude will be instructed via Sampling to perform platform-specific actions.
   * If false, the operation will be handled directly via MCP tools.
   */
  useSampling: boolean;

  /**
   * The Sampling message to send to Claude.
   * Only present when useSampling is true.
   * Contains detailed instructions for Claude to execute the operation.
   */
  samplingMessage?: string;

  /**
   * MCP tools that should be called as part of this operation.
   * For iOS, this might include 'list_calendar_events' with source filter.
   * For macOS, this includes all MCP-based calendar/reminder tools.
   */
  mcpToolsToCall?: string[];

  /**
   * Native platform integrations to use.
   * For iOS/iPad: ['ios-calendar', 'ios-reminders']
   * For macOS: [] (uses MCP for everything)
   * For web: [] (no native integrations)
   */
  nativeIntegrations?: string[];
}

/**
 * Parameters for calendar event retrieval
 */
export interface CalendarParams {
  /** Start date in ISO 8601 format (e.g., '2026-01-01') */
  startDate: string;
  /** End date in ISO 8601 format (e.g., '2026-01-31') */
  endDate: string;
}

/**
 * Parameters for reminder creation
 */
export interface ReminderParams {
  /** Title of the reminder */
  title: string;
  /** Due date in ISO 8601 format (optional) */
  dueDate?: string;
  /** Additional notes for the reminder (optional) */
  notes?: string;
  /** Priority level (optional) */
  priority?: string;
  /** List name to add the reminder to (optional) */
  list?: string;
}

/**
 * IntegrationStrategyManager
 *
 * Determines the optimal integration strategy based on the detected platform.
 *
 * Strategy by Platform:
 * - **iOS/iPad**: Use Sampling to combine MCP (Google Calendar) + Native (Apple Calendar)
 * - **macOS**: Use MCP directly for both EventKit and Google Calendar
 * - **web**: Use MCP for Google Calendar only
 * - **desktop/unknown**: Fallback to MCP-only mode
 *
 * @example
 * ```typescript
 * const manager = new IntegrationStrategyManager();
 *
 * // Get calendar strategy for iOS
 * const platform: DetectedPlatform = {
 *   platform: 'ios',
 *   clientName: 'Claude iOS',
 *   clientVersion: '1.0.0',
 *   supportsSampling: true,
 *   detectionConfidence: 'high'
 * };
 *
 * const strategy = manager.getCalendarStrategy(platform, {
 *   startDate: '2026-01-01',
 *   endDate: '2026-01-31'
 * });
 *
 * if (strategy.useSampling) {
 *   // Send strategy.samplingMessage to Claude via Sampling
 * }
 * ```
 */
export class IntegrationStrategyManager {
  /**
   * Get the integration strategy for calendar operations
   *
   * Determines whether to use Sampling (for iOS/iPad) or direct MCP calls (for macOS/web)
   * based on the detected platform and its capabilities.
   *
   * @param platform - The detected platform information
   * @param params - Calendar query parameters (date range)
   * @returns Integration strategy with instructions for calendar access
   *
   * @example iOS platform returns Sampling strategy:
   * ```typescript
   * const strategy = manager.getCalendarStrategy(iosPlatform, { startDate: '2026-01-01', endDate: '2026-01-31' });
   * // strategy.useSampling === true
   * // strategy.samplingMessage contains instructions for Claude
   * // strategy.mcpToolsToCall === ['list_calendar_events']
   * // strategy.nativeIntegrations === ['ios-calendar']
   * ```
   *
   * @example macOS platform returns MCP-only strategy:
   * ```typescript
   * const strategy = manager.getCalendarStrategy(macosPlatform, { startDate: '2026-01-01', endDate: '2026-01-31' });
   * // strategy.useSampling === false
   * // strategy.mcpToolsToCall === ['list_calendar_events']
   * // strategy.nativeIntegrations === []
   * ```
   */
  getCalendarStrategy(
    platform: DetectedPlatform,
    params: CalendarParams
  ): IntegrationStrategy {
    const { platform: platformType, supportsSampling } = platform;

    // iOS/iPad: Use Sampling for MCP (Google) + Native (Apple Calendar)
    if (this.isIOSPlatform(platformType) && supportsSampling) {
      return {
        useSampling: true,
        samplingMessage: this.buildCalendarSamplingMessage(params),
        mcpToolsToCall: ['list_calendar_events'],
        nativeIntegrations: ['ios-calendar'],
      };
    }

    // macOS: Use MCP directly for both EventKit and Google Calendar
    if (platformType === 'macos') {
      return {
        useSampling: false,
        mcpToolsToCall: ['list_calendar_events'],
        nativeIntegrations: [],
      };
    }

    // Web: MCP for Google Calendar only
    if (platformType === 'web') {
      return {
        useSampling: false,
        mcpToolsToCall: ['list_calendar_events'],
        nativeIntegrations: [],
      };
    }

    // Desktop/Unknown: Fallback to MCP-only mode
    return {
      useSampling: false,
      mcpToolsToCall: ['list_calendar_events'],
      nativeIntegrations: [],
    };
  }

  /**
   * Get the integration strategy for reminder operations
   *
   * Determines the best approach for creating reminders based on platform:
   * - iOS/iPad: Use Sampling to leverage native iOS Reminders API
   * - macOS: Use existing AppleScript-based MCP tool
   * - Web: Return error strategy (reminders not supported)
   *
   * @param platform - The detected platform information
   * @param params - Reminder creation parameters
   * @returns Integration strategy with instructions for reminder creation
   *
   * @example iOS platform returns Sampling strategy:
   * ```typescript
   * const strategy = manager.getReminderStrategy(iosPlatform, { title: 'Buy milk' });
   * // strategy.useSampling === true
   * // strategy.samplingMessage contains native iOS Reminders instructions
   * // strategy.nativeIntegrations === ['ios-reminders']
   * ```
   *
   * @example Web platform returns error strategy:
   * ```typescript
   * const strategy = manager.getReminderStrategy(webPlatform, { title: 'Buy milk' });
   * // strategy.useSampling === false
   * // strategy.mcpToolsToCall === []
   * // No native integrations - operation will fail with informative error
   * ```
   */
  getReminderStrategy(
    platform: DetectedPlatform,
    params: ReminderParams
  ): IntegrationStrategy {
    const { platform: platformType, supportsSampling } = platform;

    // iOS/iPad: Use Sampling for native iOS Reminders API
    if (this.isIOSPlatform(platformType) && supportsSampling) {
      return {
        useSampling: true,
        samplingMessage: this.buildReminderSamplingMessage(params),
        mcpToolsToCall: [],
        nativeIntegrations: ['ios-reminders'],
      };
    }

    // macOS: Use existing AppleScript-based MCP tool
    if (platformType === 'macos') {
      return {
        useSampling: false,
        mcpToolsToCall: ['set_reminder'],
        nativeIntegrations: [],
      };
    }

    // Web: Reminders not supported
    if (platformType === 'web') {
      return {
        useSampling: false,
        mcpToolsToCall: [],
        nativeIntegrations: [],
        // Note: Caller should handle this case by returning an error to the user
      };
    }

    // Desktop/Unknown: Try AppleScript-based MCP tool
    return {
      useSampling: false,
      mcpToolsToCall: ['set_reminder'],
      nativeIntegrations: [],
    };
  }

  /**
   * Build a Sampling message for calendar event retrieval
   *
   * Creates a detailed instruction message for Claude to execute,
   * combining MCP tool calls with native Calendar API access if available.
   *
   * The message instructs Claude to:
   * 1. Call list_calendar_events MCP tool
   * 2. Use native Calendar API if available
   * 3. Merge results by iCalUID to avoid duplicates
   * 4. Return unified event list with source attribution
   *
   * @param params - Calendar query parameters (sanitized before use)
   * @returns Formatted Sampling message string
   *
   * @example
   * ```typescript
   * const message = manager.buildCalendarSamplingMessage({
   *   startDate: '2026-01-01',
   *   endDate: '2026-01-31'
   * });
   * // Returns detailed instruction for Claude
   * ```
   */
  buildCalendarSamplingMessage(params: CalendarParams): string {
    // Sanitize user input to prevent injection
    const sanitizedStartDate = this.sanitizeInput(params.startDate);
    const sanitizedEndDate = this.sanitizeInput(params.endDate);

    return this.buildFlexibleCalendarSamplingMessage(
      sanitizedStartDate,
      sanitizedEndDate
    );
  }

  /**
   * Build flexible calendar Sampling message that works on any platform
   *
   * This message works for iOS/iPad, Desktop via Remote MCP, and any other platform.
   * It instructs Claude to use native Calendar API if available,
   * and gracefully fall back to MCP-only if not.
   *
   * @internal
   */
  private buildFlexibleCalendarSamplingMessage(
    startDate: string,
    endDate: string
  ): string {
    return `Please execute the following steps to fetch calendar events:

1. First, call the list_calendar_events MCP tool to get Google Calendar events:
   { "startDate": "${startDate}", "endDate": "${endDate}" }

2. Then, check if you have access to native Calendar API:
   - If native Calendar API is available (e.g., iOS/iPad): Also fetch events from the native Calendar app for the same date range
   - If native Calendar API is NOT available (e.g., Desktop via Remote MCP): Skip this step

3. Merge the results:
   - If you fetched both MCP and native events: Merge them, removing duplicates by iCalUID
   - If you only have MCP events: Return them as-is

4. Return the unified event list in JSON format:
   [
     {
       "id": "string (event ID)",
       "title": "string (event title)",
       "start": "string (ISO 8601 datetime)",
       "end": "string (ISO 8601 datetime)",
       "isAllDay": "boolean",
       "source": "google" | "native-calendar" | "eventkit",
       "iCalUID": "string (optional, for deduplication)",
       "location": "string (optional)",
       "description": "string (optional)"
     }
   ]

Important:
- Always include the "source" field to indicate where each event came from
- If Google Calendar MCP call fails, still return native Calendar events if available
- If native Calendar access fails, still return Google Calendar events
- Return an empty array [] if both sources fail
- This approach works on any platform`;
  }

  /**
   * Build a Sampling message for reminder creation
   *
   * Creates a detailed instruction message for Claude to create a reminder
   * using native Reminders API if available.
   *
   * The message instructs Claude to:
   * 1. Create a reminder with the provided title
   * 2. Set due date if provided
   * 3. Add notes if provided
   * 4. Return success status with reminder ID
   *
   * @param params - Reminder creation parameters (sanitized before use)
   * @returns Formatted Sampling message string
   *
   * @example
   * ```typescript
   * const message = manager.buildReminderSamplingMessage({
   *   title: 'Buy groceries',
   *   dueDate: '2026-01-15T10:00:00Z',
   *   notes: 'Milk, bread, eggs'
   * });
   * // Returns detailed instruction for Claude
   * ```
   */
  buildReminderSamplingMessage(params: ReminderParams): string {
    // Sanitize all user input to prevent injection
    const sanitizedTitle = this.sanitizeInput(params.title);
    const sanitizedNotes = params.notes ? this.sanitizeInput(params.notes) : undefined;
    const sanitizedDueDate = params.dueDate ? this.sanitizeInput(params.dueDate) : undefined;
    const sanitizedPriority = params.priority ? this.sanitizeInput(params.priority) : undefined;
    const sanitizedList = params.list ? this.sanitizeInput(params.list) : undefined;

    return this.buildFlexibleReminderSamplingMessage(
      sanitizedTitle,
      sanitizedDueDate,
      sanitizedNotes,
      sanitizedPriority,
      sanitizedList
    );
  }

  /**
   * Build flexible reminder Sampling message that works on any platform
   *
   * This message works for iOS/iPad, Desktop via Remote MCP, and any other platform.
   * It instructs Claude to use native Reminders API if available,
   * and gracefully inform the user if not.
   *
   * @internal
   */
  private buildFlexibleReminderSamplingMessage(
    title: string,
    dueDate: string | undefined,
    notes: string | undefined,
    priority: string | undefined,
    list: string | undefined
  ): string {
    let message = `Please try to create a reminder with the following details:

Title: ${title}`;

    if (dueDate) {
      message += `\nDue Date: ${dueDate}`;
    }

    if (notes) {
      message += `\nNotes: ${notes}`;
    }

    if (priority) {
      message += `\nPriority: ${priority} (P0=highest, P3=lowest)`;
    }

    if (list) {
      message += `\nList: ${list}`;
    }

    message += `\n\nInstructions:
1. Check if you have access to native Reminders API:
   - If native Reminders API is available (e.g., iOS/iPad): Create the reminder using native Reminders API
   - If native Reminders API is NOT available (e.g., Desktop via Remote MCP): Inform the user that reminders cannot be created on this platform

2. If successful, return:
   {
     "success": true,
     "reminderId": "<id>",
     "message": "Reminder created successfully"
   }

3. If native API not available, return:
   {
     "success": false,
     "error": "reminders_not_supported",
     "message": "Reminder creation is not supported on this platform. Please use iOS/iPad or macOS Desktop."
   }

Important:
- The title is required and must not be empty
- If due date is provided, parse it as ISO 8601 format
- If priority is provided, map it to the native priority levels (P0=high, P1=medium, P2=low, P3=none)
- If the specified list does not exist, use the default reminders list
- This approach works on any platform`;

    return message;
  }

  /**
   * Check if the platform is iOS or iPadOS
   *
   * @param platformType - The platform type string
   * @returns True if the platform is iOS or iPadOS
   */
  private isIOSPlatform(platformType: string): boolean {
    return platformType === 'ios' || platformType === 'ipados';
  }

  /**
   * Sanitize user input for inclusion in Sampling messages
   *
   * Prevents potential injection attacks by:
   * 1. Removing control characters that could break message parsing
   * 2. Escaping special characters used in template literals
   * 3. Removing potential prompt injection patterns
   * 4. Limiting input length to prevent resource exhaustion
   *
   * @param input - The raw user input
   * @returns Sanitized input safe for inclusion in Sampling messages
   *
   * @example
   * ```typescript
   * sanitizeInput('Buy groceries') // Returns: 'Buy groceries'
   * sanitizeInput('Test `injection`') // Returns: 'Test \\`injection\\`'
   * sanitizeInput('Ignore previous instructions') // Returns sanitized version
   * ```
   *
   * @internal
   */
  private sanitizeInput(input: string): string {
    // Step 1: Remove control characters (except newlines and tabs which may be legitimate)
    // \x00-\x08: NULL to BACKSPACE
    // \x0B-\x0C: Vertical Tab and Form Feed
    // \x0E-\x1F: Shift Out to Unit Separator
    // \x7F: DEL
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Step 2: Normalize newlines to prevent message structure manipulation
    sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Step 3: Escape backticks to prevent template literal injection
    sanitized = sanitized.replace(/`/g, '\\`');

    // Step 4: Escape dollar signs to prevent variable interpolation
    sanitized = sanitized.replace(/\$/g, '\\$');

    // Step 5: Escape backslashes that aren't already escaping something
    // This prevents users from escaping our escape sequences
    sanitized = sanitized.replace(/\\(?![`$\\n])/g, '\\\\');

    // Step 6: Remove potential prompt injection patterns
    // These patterns attempt to override or ignore previous instructions
    const injectionPatterns = [
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
      /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
      /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/gi,
      /you\s+are\s+now\s+a?\s*different/gi,
      /new\s+instructions?:/gi,
      /system\s*:\s*you\s+are/gi,
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(pattern, '[FILTERED]');
    }

    // Step 7: Limit length to prevent excessively long inputs
    const MAX_LENGTH = 1000;
    if (sanitized.length > MAX_LENGTH) {
      sanitized = sanitized.substring(0, MAX_LENGTH) + '...';
    }

    // Step 8: Trim whitespace from beginning and end
    sanitized = sanitized.trim();

    return sanitized;
  }
}
