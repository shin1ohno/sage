/**
 * Platform Tool Handlers
 *
 * Business logic for platform-related MCP tools.
 * Provides platform information and available integrations to users.
 *
 * Requirements: 7.1-7.7 (platform-adaptive-integration)
 */

import type { UserConfig } from '../../types/index.js';
import type { ClientInfo } from '../../types/sampling.js';
import { createToolResponse } from '../registry.js';

/**
 * Platform context containing shared state
 */
export interface PlatformToolsContext {
  getClientInfo: () => ClientInfo | null;
  getConfig: () => UserConfig | null;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Check if running on macOS (server-side)
 */
function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Build available integrations based on server environment and config
 *
 * @param config User configuration
 * @returns Object describing available integrations
 */
function getAvailableIntegrations(config: UserConfig | null) {
  const macOS = isMacOS();
  const googleEnabled = config?.integrations?.googleCalendar?.enabled ?? false;

  return {
    calendar: {
      eventkit: macOS,
      google: googleEnabled,
      native: false, // Native calendar access requires Sampling
    },
    reminders: {
      applescript: macOS,
      native: false, // Native reminders access requires Sampling
    },
  };
}

/**
 * Format calendar integrations for user-friendly display
 *
 * @param integrations Calendar integration status
 * @param supportsSampling Whether client supports Sampling
 * @returns Array of integration descriptions
 */
function formatCalendarIntegrations(
  integrations: { eventkit: boolean; google: boolean; native: boolean },
  supportsSampling: boolean
): string[] {
  const result: string[] = [];

  // Google Calendar
  if (integrations.google) {
    result.push('Google Calendar (MCP)');
  } else {
    result.push('Google Calendar: Not authenticated (run authenticate_google)');
  }

  // EventKit (macOS only)
  if (integrations.eventkit) {
    result.push('EventKit (MCP)');
  }

  // Native calendar (requires Sampling)
  if (supportsSampling) {
    result.push('Apple Calendar (native via Sampling)');
  }

  return result;
}

/**
 * Format reminders integrations for user-friendly display
 *
 * @param integrations Reminders integration status
 * @param supportsSampling Whether client supports Sampling
 * @returns Array of integration descriptions
 */
function formatRemindersIntegrations(
  integrations: { applescript: boolean; native: boolean },
  supportsSampling: boolean
): string[] {
  const result: string[] = [];

  // AppleScript (macOS only)
  if (integrations.applescript) {
    result.push('Apple Reminders (MCP via AppleScript)');
  }

  // Native reminders (requires Sampling)
  if (supportsSampling) {
    result.push('Apple Reminders (native via Sampling)');
  }

  if (!integrations.applescript && !supportsSampling) {
    result.push('Reminders: Not available on this platform');
  }

  return result;
}

/**
 * Build warnings array based on client capabilities
 *
 * @param clientInfo Client information
 * @param config User configuration
 * @returns Array of warning messages
 */
function buildWarnings(
  clientInfo: ClientInfo,
  config: UserConfig | null
): string[] {
  const warnings: string[] = [];

  // Sampling not supported warning (Requirement 7.5)
  if (!clientInfo.supportsSampling) {
    warnings.push(
      'Native integration unavailable: Your Claude client does not support Sampling. ' +
      'Using MCP-only integrations.'
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
 * Get integration summary based on capabilities
 *
 * @param supportsSampling Whether client supports Sampling
 * @param isMac Whether server is running on macOS
 * @returns Summary string
 */
function getIntegrationSummary(supportsSampling: boolean, isMac: boolean): string {
  if (supportsSampling) {
    return 'Full integration: Google Calendar (MCP), Apple Calendar (native), Apple Reminders (native)';
  }

  if (isMac) {
    return 'macOS MCP: EventKit (MCP), Google Calendar (MCP), Apple Reminders (MCP)';
  }

  return 'MCP only: Google Calendar (MCP)';
}

// ============================================================
// Handler Functions
// ============================================================

/**
 * get_platform_info handler
 *
 * Returns client information and available integrations.
 * Requirements: 7.1-7.7
 *
 * @param _args Empty object (no arguments required)
 * @param context Platform tools context
 * @returns Tool response with platform info
 *
 * Response includes:
 * - clientName: MCP client application name
 * - clientVersion: MCP client version
 * - supportsSampling: Whether Sampling is available
 * - serverEnvironment: Server-side environment info
 * - availableIntegrations: Calendar and reminders integration status
 * - integrationSummary: Human-readable integration summary
 * - warnings: Array of warning messages
 */
export async function handleGetPlatformInfo(
  _args: Record<string, never>,
  context: PlatformToolsContext
) {
  const clientInfo = context.getClientInfo();
  const config = context.getConfig();

  // Client not detected error
  if (!clientInfo) {
    return createToolResponse({
      error: true,
      message:
        'Client not detected. Please reconnect to sage MCP server. ' +
        'Client detection occurs during MCP initialization.',
      suggestion: 'Try restarting your Claude client and reconnecting to sage.',
    });
  }

  // Get available integrations for this environment
  const availableIntegrations = getAvailableIntegrations(config);

  // Update native access based on Sampling support
  if (clientInfo.supportsSampling) {
    availableIntegrations.calendar.native = true;
    availableIntegrations.reminders.native = true;
  }

  // Build formatted integration lists for display
  const calendarIntegrationList = formatCalendarIntegrations(
    availableIntegrations.calendar,
    clientInfo.supportsSampling
  );

  const remindersIntegrationList = formatRemindersIntegrations(
    availableIntegrations.reminders,
    clientInfo.supportsSampling
  );

  // Build warnings
  const warnings = buildWarnings(clientInfo, config);

  return createToolResponse({
    // Client info
    clientName: clientInfo.clientName,
    clientVersion: clientInfo.clientVersion,
    supportsSampling: clientInfo.supportsSampling,

    // Server environment
    serverEnvironment: {
      platform: process.platform,
      isMacOS: isMacOS(),
    },

    // Structured integration status
    availableIntegrations,

    // Human-readable integration lists
    calendarIntegrations: calendarIntegrationList,
    remindersIntegrations: remindersIntegrationList,

    // Integration summary (Requirements 7.2, 7.3, 7.4)
    integrationSummary: getIntegrationSummary(clientInfo.supportsSampling, isMacOS()),

    // Warnings (Requirements 7.5, 7.7)
    warnings: warnings.length > 0 ? warnings : undefined,

    // Message for user
    message:
      warnings.length > 0
        ? `Client: ${clientInfo.clientName ?? 'Unknown'}. There are ${warnings.length} warning(s) to review.`
        : `Client: ${clientInfo.clientName ?? 'Unknown'}. All integrations are available.`,
  });
}
