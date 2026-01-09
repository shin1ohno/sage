/**
 * Capability Detector
 * Detects client capabilities and provides integration availability information
 * Requirements: 7.1, 7.2, 7.3
 *
 * Simplified implementation:
 * - Focus on Sampling capability detection
 * - Determine available integrations based on capabilities and config
 */

import type { PlatformType, PlatformInfo, PlatformCapability, FeatureSet } from './types.js';
import { CAPABILITY_NAMES, INTEGRATION_NAMES } from './types.js';
import type {
  ClientCapabilities,
  ClientCapabilityInfo,
  DetectedPlatform,
  CalendarIntegrations,
  RemindersIntegrations,
} from '../types/platform.js';
import type { UserConfig } from '../types/config.js';

/**
 * Capability definitions for each platform
 */
const PLATFORM_CAPABILITIES: Record<PlatformType, PlatformCapability[]> = {
  desktop_mcp: [
    {
      name: CAPABILITY_NAMES.FILE_SYSTEM,
      available: true,
      requiresPermission: false,
      fallbackAvailable: false,
    },
    {
      name: CAPABILITY_NAMES.EXTERNAL_PROCESS,
      available: true,
      requiresPermission: false,
      fallbackAvailable: false,
    },
    {
      name: CAPABILITY_NAMES.MCP_INTEGRATION,
      available: true,
      requiresPermission: false,
      fallbackAvailable: false,
    },
  ],
  remote_mcp: [
    {
      name: CAPABILITY_NAMES.REMOTE_ACCESS,
      available: true,
      requiresPermission: true,
      fallbackAvailable: false,
    },
    {
      name: CAPABILITY_NAMES.CLOUD_STORAGE,
      available: true,
      requiresPermission: false,
      fallbackAvailable: false,
    },
  ],
};

/**
 * Integrations available on each platform
 */
const PLATFORM_INTEGRATIONS: Record<PlatformType, string[]> = {
  desktop_mcp: [INTEGRATION_NAMES.APPLESCRIPT, INTEGRATION_NAMES.NOTION_MCP],
  remote_mcp: [INTEGRATION_NAMES.REMOTE_MCP_SERVER],
};

/**
 * Feature sets for each platform
 */
const PLATFORM_FEATURES: Record<PlatformType, FeatureSet> = {
  desktop_mcp: {
    taskAnalysis: true,
    persistentConfig: true,
    appleReminders: true,
    calendarIntegration: true,
    notionIntegration: true,
    fileSystemAccess: true,
  },
  remote_mcp: {
    taskAnalysis: true,
    persistentConfig: true, // via cloud storage
    appleReminders: true, // via Remote MCP Server
    calendarIntegration: true, // via Remote MCP Server
    notionIntegration: true, // via Remote MCP Server
    fileSystemAccess: false,
  },
};

export class CapabilityDetector {
  private static readonly VERSION = '1.0.0';

  /**
   * Detect client capabilities
   *
   * Simplified capability detection focusing on Sampling support.
   * Requirements: 1.1-1.5 (platform-adaptive-integration)
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
      detectionConfidence: 0.5,
    };
  }

  /**
   * Detect the current platform (legacy method using environment variables)
   * Requirement: 7.1, 7.2
   */
  static async detect(): Promise<PlatformInfo> {
    // Check for MCP server environment (Node.js with MCP_SERVER env var)
    if (this.isMCPEnvironment()) {
      return {
        type: 'desktop_mcp',
        version: this.VERSION,
        capabilities: this.getCapabilities('desktop_mcp'),
        integrations: this.getIntegrations('desktop_mcp'),
      };
    }

    // Default to remote_mcp for non-MCP environments
    // These clients connect via Remote MCP Server
    return {
      type: 'remote_mcp',
      version: this.VERSION,
      capabilities: this.getCapabilities('remote_mcp'),
      integrations: this.getIntegrations('remote_mcp'),
    };
  }

  /**
   * Check if running in MCP server environment
   */
  private static isMCPEnvironment(): boolean {
    try {
      return (
        typeof process !== 'undefined' &&
        process.env !== undefined &&
        process.env.MCP_SERVER === 'true'
      );
    } catch {
      return false;
    }
  }

  /**
   * Get capabilities for a platform
   * Requirement: 7.3
   */
  static getCapabilities(platformType: PlatformType): PlatformCapability[] {
    return [...PLATFORM_CAPABILITIES[platformType]];
  }

  /**
   * Get integrations for a platform
   */
  static getIntegrations(platformType: PlatformType): string[] {
    return [...PLATFORM_INTEGRATIONS[platformType]];
  }

  /**
   * Get feature set for a platform
   * Requirement: 7.3, 7.4
   */
  static getFeatureSet(platformType: PlatformType): FeatureSet {
    return { ...PLATFORM_FEATURES[platformType] };
  }

  /**
   * Check if a specific capability is available on a platform
   */
  static isCapabilityAvailable(platformType: PlatformType, capabilityName: string): boolean {
    const capabilities = PLATFORM_CAPABILITIES[platformType];
    const capability = capabilities.find((c) => c.name === capabilityName);
    return capability?.available ?? false;
  }

  /**
   * Check if a capability requires permission
   */
  static requiresPermission(platformType: PlatformType, capabilityName: string): boolean {
    const capabilities = PLATFORM_CAPABILITIES[platformType];
    const capability = capabilities.find((c) => c.name === capabilityName);
    return capability?.requiresPermission ?? false;
  }

  /**
   * Check if a capability has a fallback available
   */
  static hasFallback(platformType: PlatformType, capabilityName: string): boolean {
    const capabilities = PLATFORM_CAPABILITIES[platformType];
    const capability = capabilities.find((c) => c.name === capabilityName);
    return capability?.fallbackAvailable ?? false;
  }

  /**
   * Get available integrations based on Sampling capability and configuration
   * Requirements: 7.2-7.4 (Platform-specific integrations)
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
