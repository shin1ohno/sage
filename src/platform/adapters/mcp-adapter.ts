/**
 * MCP Adapter
 * Platform adapter for Desktop/Code MCP environment
 * Requirements: 7.1, 7.4
 */

import type { PlatformAdapter, PlatformInfo, FeatureSet } from '../types.js';
import { PlatformDetector } from '../detector.js';

/**
 * Adapter for MCP (Model Context Protocol) server environment
 * Used in Claude Desktop and Claude Code
 */
export class MCPAdapter implements PlatformAdapter {
  private platformInfo: PlatformInfo;
  private featureSet: FeatureSet;

  constructor() {
    this.platformInfo = {
      type: 'desktop_mcp',
      version: '1.0.0',
      capabilities: PlatformDetector.getCapabilities('desktop_mcp'),
      nativeIntegrations: PlatformDetector.getNativeIntegrations('desktop_mcp'),
    };
    this.featureSet = PlatformDetector.getFeatureSet('desktop_mcp');
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
    // MCP adapter initialization
    // In the future, this could:
    // - Check AppleScript availability
    // - Verify Notion MCP connection
    // - Load persisted configuration
  }

  /**
   * Check if a specific capability is available
   */
  isCapabilityAvailable(capability: string): boolean {
    return PlatformDetector.isCapabilityAvailable('desktop_mcp', capability);
  }
}
