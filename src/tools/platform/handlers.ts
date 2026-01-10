/**
 * Platform Tool Handlers
 *
 * Business logic for platform-related MCP tools.
 * Provides platform information and available integrations to users.
 *
 * Requirements: 7.1-7.7 (platform-adaptive-integration)
 */

import type { UserConfig } from '../../types/index.js';
import type {
  DetectedPlatform,
  PlatformInfo,
  CalendarIntegrations,
  RemindersIntegrations,
} from '../../types/platform.js';
import { PlatformDetector } from '../../platform/detector.js';
import { createToolResponse } from '../registry.js';

/**
 * Platform context containing shared state
 */
export interface PlatformToolsContext {
  getPlatformInfo: () => DetectedPlatform | null;
  getConfig: () => UserConfig | null;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Format calendar integrations for user-friendly display
 *
 * @param integrations Calendar integration status
 * @param platform Detected platform
 * @param googleAuthenticated Whether Google OAuth is configured
 * @returns Array of integration descriptions
 */
function formatCalendarIntegrations(
  integrations: CalendarIntegrations,
  platform: DetectedPlatform['platform'],
  googleAuthenticated: boolean
): string[] {
  const result: string[] = [];

  // Google Calendar
  if (integrations.google) {
    result.push('Google Calendar (MCP)');
  } else if (!googleAuthenticated) {
    result.push('Google Calendar: Not authenticated (run authenticate_google)');
  }

  // EventKit (macOS only)
  if (integrations.eventkit) {
    result.push('EventKit (MCP)');
  } else if (platform === 'macos' || platform === 'desktop') {
    result.push('EventKit: Available (macOS)');
  }

  // Native calendar (iOS/iPadOS only)
  if (integrations.native) {
    result.push('Apple Calendar (native)');
  }

  return result;
}

/**
 * Format reminders integrations for user-friendly display
 *
 * @param integrations Reminders integration status
 * @param platform Detected platform
 * @returns Array of integration descriptions
 */
function formatRemindersIntegrations(
  integrations: RemindersIntegrations,
  platform: DetectedPlatform['platform']
): string[] {
  const result: string[] = [];

  // AppleScript (macOS only)
  if (integrations.applescript) {
    result.push('Apple Reminders (MCP via AppleScript)');
  }

  // Native reminders (iOS/iPadOS only)
  if (integrations.native) {
    result.push('Apple Reminders (native)');
  }

  // Web platform warning
  if (platform === 'web') {
    result.push('Reminders not supported on web platform');
  }

  return result;
}

/**
 * Build warnings array based on platform capabilities
 *
 * @param platform Detected platform info
 * @param config User configuration
 * @returns Array of warning messages
 */
function buildWarnings(
  platform: DetectedPlatform,
  config: UserConfig | null
): string[] {
  const warnings: string[] = [];

  // Sampling not supported warning (Requirement 7.5)
  if (!platform.supportsSampling) {
    warnings.push(
      'Platform-adaptive integration unavailable: Your Claude client does not support Sampling.'
    );
  }

  // Unknown platform warning
  if (platform.platform === 'unknown') {
    warnings.push(
      `Unknown platform detected (client: ${platform.clientName}). Using limited integrations.`
    );
  }

  // Google Calendar not authenticated (Requirement 7.7)
  const googleEnabled = config?.integrations?.googleCalendar?.enabled ?? false;
  if (!googleEnabled) {
    warnings.push(
      'Google Calendar: Not authenticated (run authenticate_google)'
    );
  }

  return warnings;
}

/**
 * Get platform-specific integration summary
 *
 * @param platform Detected platform type
 * @returns Summary string for the platform
 */
function getPlatformSummary(platform: DetectedPlatform['platform']): string {
  switch (platform) {
    case 'ios':
    case 'ipados':
      return 'iOS/iPadOS: Google Calendar (MCP), Apple Calendar (native), Apple Reminders (native)';
    case 'macos':
    case 'desktop':
      return 'macOS: EventKit (MCP), Google Calendar (MCP), Apple Reminders (MCP)';
    case 'web':
      return 'Web: Google Calendar (MCP only)';
    case 'unknown':
    default:
      return 'Unknown platform: Limited integrations available';
  }
}

// ============================================================
// Handler Functions
// ============================================================

/**
 * get_platform_info handler
 *
 * Returns detected platform information and available integrations.
 * Requirements: 7.1-7.7
 *
 * @param args Empty object (no arguments required)
 * @param context Platform tools context
 * @returns Tool response with platform info
 *
 * Response includes:
 * - platform: Detected platform type (ios, ipados, macos, desktop, web, unknown)
 * - clientName: MCP client application name
 * - clientVersion: MCP client version
 * - supportsSampling: Whether Sampling is available
 * - availableIntegrations: Calendar and reminders integration status
 * - integrationSummary: Human-readable integration summary
 * - warnings: Array of warning messages
 */
export async function handleGetPlatformInfo(
  _args: Record<string, never>,
  context: PlatformToolsContext
) {
  const platform = context.getPlatformInfo();
  const config = context.getConfig();

  // Platform not detected error
  if (!platform) {
    return createToolResponse({
      error: true,
      message:
        'Platform not detected. Please reconnect to sage MCP server. ' +
        'Platform detection occurs during MCP initialization.',
      suggestion: 'Try restarting your Claude client and reconnecting to sage.',
    });
  }

  // Get available integrations for this platform
  const availableIntegrations = PlatformDetector.getAvailableIntegrations(
    platform.platform,
    config ?? undefined
  );

  // Check if Google is authenticated
  const googleAuthenticated =
    config?.integrations?.googleCalendar?.enabled ?? false;

  // Build formatted integration lists for display
  const calendarIntegrationList = formatCalendarIntegrations(
    availableIntegrations.calendar,
    platform.platform,
    googleAuthenticated
  );

  const remindersIntegrationList = formatRemindersIntegrations(
    availableIntegrations.reminders,
    platform.platform
  );

  // Build warnings
  const warnings = buildWarnings(platform, config);

  // Build the platform info response
  const platformInfo: PlatformInfo = {
    platform: platform.platform,
    clientName: platform.clientName,
    clientVersion: platform.clientVersion,
    supportsSampling: platform.supportsSampling,
    availableIntegrations,
  };

  return createToolResponse({
    // Core platform info
    platform: platformInfo.platform,
    clientName: platformInfo.clientName,
    clientVersion: platformInfo.clientVersion,
    supportsSampling: platformInfo.supportsSampling,

    // Structured integration status
    availableIntegrations: platformInfo.availableIntegrations,

    // Human-readable integration lists
    calendarIntegrations: calendarIntegrationList,
    remindersIntegrations: remindersIntegrationList,

    // Platform summary (Requirements 7.2, 7.3, 7.4)
    integrationSummary: getPlatformSummary(platform.platform),

    // Warnings (Requirements 7.5, 7.7)
    warnings: warnings.length > 0 ? warnings : undefined,

    // Message for user
    message:
      warnings.length > 0
        ? `Platform detected: ${platform.platform}. There are ${warnings.length} warning(s) to review.`
        : `Platform detected: ${platform.platform}. All integrations are available.`,
  });
}
