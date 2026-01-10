/**
 * Capability Detector
 * Detects client capabilities and provides integration availability information
 *
 * Simplified implementation:
 * - Focus on Sampling capability detection
 * - Determine available integrations based on capabilities and config
 */

import type {
  ClientCapabilities,
  ClientCapabilityInfo,
  DetectedPlatform,
  CalendarIntegrations,
  RemindersIntegrations,
} from '../types/platform.js';
import type { UserConfig } from '../types/config.js';

export class CapabilityDetector {
  /**
   * Detect client capabilities
   *
   * Simplified capability detection focusing on Sampling support.
   *
   * @param capabilities - MCP client capabilities from initialize request
   * @returns Object with supportsSampling flag
   *
   * @example
   * ```typescript
   * const detected = CapabilityDetector.detectCapabilities({ sampling: {} });
   * // detected.supportsSampling === true
   * ```
   */
  static detectCapabilities(capabilities: ClientCapabilities): { supportsSampling: boolean } {
    return {
      supportsSampling: capabilities.sampling !== undefined,
    };
  }

  /**
   * Detect platform from capabilities (legacy method for backward compatibility)
   * @deprecated Use detectCapabilities instead
   *
   * @param capabilities - MCP client capabilities from initialize request
   * @returns Detected platform information
   */
  static detectPlatform(capabilities: ClientCapabilities): DetectedPlatform {
    const supportsSampling = capabilities.sampling !== undefined;

    // Simple platform detection based on available information
    // This is a best-effort approach since we don't have reliable platform indicators
    let platform: DetectedPlatform['platform'] = 'unknown';

    // Check if running on macOS
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      platform = 'macos';
    } else if (supportsSampling) {
      // If Sampling is supported and not macOS, likely iOS/iPadOS
      platform = 'ios'; // Default to iOS, tests can override
    }

    return {
      platform,
      supportsSampling,
      clientName: 'Unknown',
      clientVersion: undefined,
    };
  }

  /**
   * Get available integrations based on Sampling capability and configuration
   *
   * Simplified integration detection based on:
   * - Sampling support (indicates iOS/iPadOS client)
   * - EventKit availability (macOS process.platform check)
   * - Configuration settings (e.g., Google Calendar enabled)
   *
   * Integration availability rules:
   * - Sampling supported: Native calendar and reminders available
   * - macOS (EventKit available): EventKit and AppleScript available
   * - Always: Google Calendar if configured
   *
   * @param supportsSamplingOrPlatform - Whether client supports Sampling capability, or platform string (legacy)
   * @param config - User configuration to check enabled integrations
   * @returns Available integrations for calendar and reminders
   *
   * @example
   * ```typescript
   * const integrations = CapabilityDetector.getAvailableIntegrations(true, config);
   * // integrations.calendar.native === true (Sampling-enabled client)
   * // integrations.reminders.native === true (Sampling-enabled client)
   * ```
   */
  static getAvailableIntegrations(
    supportsSamplingOrPlatform: boolean | string,
    config?: UserConfig
  ): ClientCapabilityInfo['availableIntegrations'] {
    // Handle legacy API (string platform type)
    let supportsSampling: boolean;
    if (typeof supportsSamplingOrPlatform === 'string') {
      // Legacy: platform string ('ios', 'macos', etc.)
      supportsSampling = supportsSamplingOrPlatform === 'ios' || supportsSamplingOrPlatform === 'ipados';
    } else {
      // New API: boolean
      supportsSampling = supportsSamplingOrPlatform;
    }

    // Check if Google OAuth is configured
    const googleEnabled = config?.integrations?.googleCalendar?.enabled ?? false;

    // Check if running on macOS
    const isMacOS = typeof process !== 'undefined' && process.platform === 'darwin';

    // Determine calendar integrations
    const calendar: CalendarIntegrations = {
      google: googleEnabled,
      eventkit: isMacOS, // EventKit available on macOS only
      native: supportsSampling, // Native calendar available for Sampling-enabled clients
    };

    // Determine reminders integrations
    const reminders: RemindersIntegrations = {
      applescript: isMacOS, // AppleScript available on macOS only
      native: supportsSampling, // Native reminders available for Sampling-enabled clients
    };

    return {
      calendar,
      reminders,
    };
  }
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use CapabilityDetector instead
 */
export const PlatformDetector = CapabilityDetector;
