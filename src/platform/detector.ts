/**
 * Platform Detector
 * Detects the running platform and provides capability information
 * Requirements: 7.1, 7.2, 7.3
 *
 * 実装:
 * - desktop_mcp: macOS, Claude Desktop/Code（AppleScript統合）
 * - remote_mcp: iOS/iPadOS/Web（Remote MCPサーバー経由）
 */

import type { PlatformType, PlatformInfo, PlatformCapability, FeatureSet } from './types.js';
import { CAPABILITY_NAMES, INTEGRATION_NAMES } from './types.js';

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
}
