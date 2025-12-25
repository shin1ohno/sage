/**
 * Platform Detector
 * Detects the running platform and provides capability information
 * Requirements: 7.1, 7.2, 7.3
 */

// Declare window for browser environment detection
declare const window: any;

import type {
  PlatformType,
  PlatformInfo,
  PlatformCapability,
  FeatureSet,
} from './types.js';
import { CAPABILITY_NAMES, INTEGRATION_NAMES } from './types.js';

/**
 * Capability definitions for each platform
 */
const PLATFORM_CAPABILITIES: Record<PlatformType, PlatformCapability[]> = {
  desktop_mcp: [
    { name: CAPABILITY_NAMES.FILE_SYSTEM, available: true, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.EXTERNAL_PROCESS, available: true, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.MCP_INTEGRATION, available: true, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.SESSION_STORAGE, available: true, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.NATIVE_REMINDERS, available: false, requiresPermission: false, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NATIVE_CALENDAR, available: false, requiresPermission: false, fallbackAvailable: true },
  ],
  ios_skills: [
    { name: CAPABILITY_NAMES.FILE_SYSTEM, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.EXTERNAL_PROCESS, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.MCP_INTEGRATION, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.SESSION_STORAGE, available: true, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.ICLOUD_SYNC, available: true, requiresPermission: false, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NATIVE_REMINDERS, available: true, requiresPermission: true, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NATIVE_CALENDAR, available: true, requiresPermission: true, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NOTION_CONNECTOR, available: true, requiresPermission: true, fallbackAvailable: true },
  ],
  ipados_skills: [
    { name: CAPABILITY_NAMES.FILE_SYSTEM, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.EXTERNAL_PROCESS, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.MCP_INTEGRATION, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.SESSION_STORAGE, available: true, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.ICLOUD_SYNC, available: true, requiresPermission: false, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NATIVE_REMINDERS, available: true, requiresPermission: true, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NATIVE_CALENDAR, available: true, requiresPermission: true, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NOTION_CONNECTOR, available: true, requiresPermission: true, fallbackAvailable: true },
  ],
  web_skills: [
    { name: CAPABILITY_NAMES.FILE_SYSTEM, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.EXTERNAL_PROCESS, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.MCP_INTEGRATION, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.SESSION_STORAGE, available: true, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.ICLOUD_SYNC, available: false, requiresPermission: false, fallbackAvailable: false },
    { name: CAPABILITY_NAMES.NATIVE_REMINDERS, available: false, requiresPermission: false, fallbackAvailable: true },
    { name: CAPABILITY_NAMES.NATIVE_CALENDAR, available: false, requiresPermission: false, fallbackAvailable: true },
  ],
};

/**
 * Native integrations available on each platform
 */
const PLATFORM_INTEGRATIONS: Record<PlatformType, string[]> = {
  desktop_mcp: [INTEGRATION_NAMES.APPLESCRIPT, INTEGRATION_NAMES.NOTION_MCP],
  ios_skills: [INTEGRATION_NAMES.REMINDERS, INTEGRATION_NAMES.CALENDAR, INTEGRATION_NAMES.NOTION_CONNECTOR],
  ipados_skills: [INTEGRATION_NAMES.REMINDERS, INTEGRATION_NAMES.CALENDAR, INTEGRATION_NAMES.NOTION_CONNECTOR],
  web_skills: [],
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
  ios_skills: {
    taskAnalysis: true,
    persistentConfig: true, // via iCloud
    appleReminders: true, // native
    calendarIntegration: true, // native
    notionIntegration: true, // via Notion Connector
    fileSystemAccess: false,
  },
  ipados_skills: {
    taskAnalysis: true,
    persistentConfig: true, // via iCloud
    appleReminders: true, // native
    calendarIntegration: true, // native
    notionIntegration: true, // via Notion Connector
    fileSystemAccess: false,
  },
  web_skills: {
    taskAnalysis: true,
    persistentConfig: false, // session only
    appleReminders: false, // manual copy
    calendarIntegration: false, // manual input
    notionIntegration: false,
    fileSystemAccess: false,
  },
};

export class PlatformDetector {
  private static readonly VERSION = '1.0.0';

  /**
   * Detect the current platform
   * Requirement: 7.1, 7.2
   */
  static async detect(): Promise<PlatformInfo> {
    // Check for MCP server environment (Node.js with MCP_SERVER env var)
    if (this.isMCPEnvironment()) {
      return {
        type: 'desktop_mcp',
        version: this.VERSION,
        capabilities: this.getCapabilities('desktop_mcp'),
        nativeIntegrations: this.getNativeIntegrations('desktop_mcp'),
      };
    }

    // Check for browser/Skills environment
    if (this.isSkillsEnvironment()) {
      const platformType = this.detectSkillsPlatformType();
      return {
        type: platformType,
        version: this.VERSION,
        capabilities: this.getCapabilities(platformType),
        nativeIntegrations: this.getNativeIntegrations(platformType),
      };
    }

    throw new Error('Unsupported platform: Unable to detect running environment');
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
   * Check if running in Claude Skills environment
   */
  private static isSkillsEnvironment(): boolean {
    try {
      return typeof window !== 'undefined' && (window as any).claude !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Detect specific Skills platform type (iOS, iPadOS, or Web)
   */
  private static detectSkillsPlatformType(): PlatformType {
    try {
      const userAgent = (window as any).navigator?.userAgent || (global as any).navigator?.userAgent || '';

      if (userAgent.includes('iPhone')) {
        return 'ios_skills';
      }

      if (userAgent.includes('iPad')) {
        return 'ipados_skills';
      }

      return 'web_skills';
    } catch {
      return 'web_skills';
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
   * Get native integrations for a platform
   */
  static getNativeIntegrations(platformType: PlatformType): string[] {
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
}
