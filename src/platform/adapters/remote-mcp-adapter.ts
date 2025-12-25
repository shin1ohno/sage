/**
 * Remote MCP Adapter
 * Platform adapter for Remote MCP environment (iOS/iPadOS/Web clients)
 * Requirements: 7.1, 7.4
 *
 * Remote MCP clients connect via the Remote MCP Server
 */

import type { PlatformAdapter, PlatformInfo, FeatureSet } from '../types.js';
import { PlatformDetector } from '../detector.js';

/**
 * Adapter for Remote MCP environment
 * Used for iOS/iPadOS/Web clients connecting via Remote MCP Server
 */
export class RemoteMCPAdapter implements PlatformAdapter {
  private platformInfo: PlatformInfo;
  private featureSet: FeatureSet;

  constructor() {
    this.platformInfo = {
      type: 'remote_mcp',
      version: '1.0.0',
      capabilities: PlatformDetector.getCapabilities('remote_mcp'),
      integrations: PlatformDetector.getIntegrations('remote_mcp'),
    };
    this.featureSet = PlatformDetector.getFeatureSet('remote_mcp');
  }

  /**
   * Get platform information
   */
  getPlatformInfo(): PlatformInfo {
    return this.platformInfo;
  }

  /**
   * Get available features on this platform
   */
  getAvailableFeatures(): FeatureSet {
    return this.featureSet;
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    // Remote MCP adapter initialization
    // In the future, this could:
    // - Establish connection to Remote MCP Server
    // - Load cloud configuration
    // - Setup authentication
  }

  /**
   * Check if a specific capability is available
   */
  isCapabilityAvailable(capability: string): boolean {
    return PlatformDetector.isCapabilityAvailable('remote_mcp', capability);
  }
}
