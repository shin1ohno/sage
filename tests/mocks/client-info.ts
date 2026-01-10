/**
 * Platform Detection Mocks
 *
 * Reusable mock data for platform detection tests.
 * Provides ClientInfo, ClientCapabilities, and DetectedPlatform mocks
 * for various platform scenarios.
 */

import type {
  ClientCapabilities,
  DetectedPlatform,
  Platform,
} from '../../src/types/platform.js';

// ============================================================================
// Local Type Definitions
// ============================================================================

/**
 * Client information (for testing purposes)
 */
export interface ClientInfo {
  name: string;
  version: string;
}

// ============================================================================
// Client Info Mocks
// ============================================================================

/**
 * iOS client info mock
 * Represents Claude iOS app client
 */
export const iOSClientInfo: ClientInfo = {
  name: 'claude-ios',
  version: '1.0.0',
};

/**
 * iPadOS client info mock
 * Represents Claude iPadOS app client
 */
export const iPadOSClientInfo: ClientInfo = {
  name: 'claude-ipados',
  version: '1.0.0',
};

/**
 * macOS client info mock
 * Represents Claude Desktop on macOS
 */
export const macOSClientInfo: ClientInfo = {
  name: 'claude-desktop-macos',
  version: '1.0.0',
};

/**
 * Windows client info mock
 * Represents Claude Desktop on Windows
 */
export const windowsClientInfo: ClientInfo = {
  name: 'claude-desktop-windows',
  version: '1.0.0',
};

/**
 * Web client info mock
 * Represents Claude Web client
 */
export const webClientInfo: ClientInfo = {
  name: 'claude-web',
  version: '1.0.0',
};

/**
 * Unknown client info mock
 * Represents an unknown or unrecognized client
 */
export const unknownClientInfo: ClientInfo = {
  name: 'unknown-client',
  version: '1.0.0',
};

// ============================================================================
// Capabilities Mocks
// ============================================================================

/**
 * Capabilities with Sampling support
 * Indicates the client supports MCP Sampling capability
 */
export const samplingCapabilities: ClientCapabilities = {
  sampling: {},
};

/**
 * Capabilities without Sampling support
 * Empty capabilities object - no Sampling support
 */
export const noSamplingCapabilities: ClientCapabilities = {};

/**
 * Full capabilities mock
 * Includes sampling, roots, and experimental capabilities
 */
export const fullCapabilities: ClientCapabilities = {
  sampling: {},
  roots: {
    listChanged: true,
  },
  experimental: {},
};

// ============================================================================
// Detected Platform Mocks
// ============================================================================

/**
 * iOS detected platform mock
 * Complete DetectedPlatform for iOS with Sampling support
 */
export const iosDetectedPlatform: DetectedPlatform = {
  platform: 'ios',
  clientName: 'claude-ios',
  clientVersion: '1.0.0',
  supportsSampling: true,
};

/**
 * iPadOS detected platform mock
 * Complete DetectedPlatform for iPadOS with Sampling support
 */
export const ipadosDetectedPlatform: DetectedPlatform = {
  platform: 'ipados',
  clientName: 'claude-ipados',
  clientVersion: '1.0.0',
  supportsSampling: true,
};

/**
 * macOS detected platform mock
 * Complete DetectedPlatform for macOS (desktop)
 */
export const macosDetectedPlatform: DetectedPlatform = {
  platform: 'macos',
  clientName: 'claude-desktop-macos',
  clientVersion: '1.0.0',
  supportsSampling: true,
};

/**
 * Desktop detected platform mock (generic)
 * Complete DetectedPlatform for generic desktop
 */
export const desktopDetectedPlatform: DetectedPlatform = {
  platform: 'desktop',
  clientName: 'claude-desktop',
  clientVersion: '1.0.0',
  supportsSampling: true,
};

/**
 * Web detected platform mock
 * Complete DetectedPlatform for web (no Sampling support)
 */
export const webDetectedPlatform: DetectedPlatform = {
  platform: 'web',
  clientName: 'claude-web',
  clientVersion: '1.0.0',
  supportsSampling: false,
};

/**
 * Unknown detected platform mock
 * Complete DetectedPlatform for unknown platforms
 */
export const unknownDetectedPlatform: DetectedPlatform = {
  platform: 'unknown',
  clientName: 'unknown-client',
  clientVersion: '1.0.0',
  supportsSampling: false,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Options for creating a custom DetectedPlatform
 */
export interface CreateMockDetectedPlatformOptions {
  /** Client application name (overrides default for platform) */
  clientName?: string;
  /** Client version string */
  clientVersion?: string;
  /** Whether the client supports MCP Sampling */
  supportsSampling?: boolean;
}

/**
 * Default values for each platform type
 */
const platformDefaults: Record<
  Platform,
  {
    clientName: string;
    supportsSampling: boolean;
  }
> = {
  ios: {
    clientName: 'claude-ios',
    supportsSampling: true,
  },
  ipados: {
    clientName: 'claude-ipados',
    supportsSampling: true,
  },
  macos: {
    clientName: 'claude-desktop-macos',
    supportsSampling: true,
  },
  desktop: {
    clientName: 'claude-desktop',
    supportsSampling: true,
  },
  web: {
    clientName: 'claude-web',
    supportsSampling: false,
  },
  unknown: {
    clientName: 'unknown-client',
    supportsSampling: false,
  },
};

/**
 * Create a customizable DetectedPlatform mock
 *
 * Use this function to create DetectedPlatform objects with custom configurations
 * that may not be covered by the pre-defined mocks.
 *
 * @param platform - The platform type to create
 * @param options - Optional overrides for the default values
 * @returns A DetectedPlatform object with the specified configuration
 *
 * @example
 * ```typescript
 * // Create iOS platform with custom client name
 * const customIOS = createMockDetectedPlatform('ios', {
 *   clientName: 'custom-ios-client',
 *   clientVersion: '2.0.0',
 * });
 *
 * // Create desktop platform without Sampling support
 * const noSamplingDesktop = createMockDetectedPlatform('desktop', {
 *   supportsSampling: false,
 * });
 *
 * // Create platform with medium confidence
 * const mediumConfidence = createMockDetectedPlatform('macos', {
 * });
 * ```
 */
export function createMockDetectedPlatform(
  platform: Platform,
  options?: CreateMockDetectedPlatformOptions
): DetectedPlatform {
  const defaults = platformDefaults[platform];

  return {
    platform,
    clientName: options?.clientName ?? defaults.clientName,
    clientVersion: options?.clientVersion ?? '1.0.0',
    supportsSampling: options?.supportsSampling ?? defaults.supportsSampling,
  };
}

/**
 * Create a ClientInfo mock with custom values
 *
 * @param name - Client application name
 * @param version - Client version string (defaults to '1.0.0')
 * @returns A ClientInfo object
 *
 * @example
 * ```typescript
 * const customClient = createMockClientInfo('my-custom-client', '2.5.0');
 * ```
 */
export function createMockClientInfo(name: string, version: string = '1.0.0'): ClientInfo {
  return { name, version };
}

/**
 * Create a ClientCapabilities mock with optional Sampling
 *
 * @param hasSampling - Whether to include Sampling capability
 * @param additionalCapabilities - Additional capabilities to include
 * @returns A ClientCapabilities object
 *
 * @example
 * ```typescript
 * const withSampling = createMockCapabilities(true);
 * const withRoots = createMockCapabilities(false, { roots: { listChanged: true } });
 * ```
 */
export function createMockCapabilities(
  hasSampling: boolean,
  additionalCapabilities?: Partial<ClientCapabilities>
): ClientCapabilities {
  const capabilities: ClientCapabilities = {};

  if (hasSampling) {
    capabilities.sampling = {};
  }

  if (additionalCapabilities) {
    Object.assign(capabilities, additionalCapabilities);
  }

  return capabilities;
}
