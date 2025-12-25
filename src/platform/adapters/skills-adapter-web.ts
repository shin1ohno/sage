/**
 * Skills Adapter for Web
 * Platform adapter for Claude Skills on Web with limited features
 * Requirements: 7.3, 7.4
 */

import type { PlatformAdapter, PlatformInfo, FeatureSet } from '../types.js';
import { PlatformDetector } from '../detector.js';

/**
 * Adapter for Claude Skills on Web
 * Provides basic task analysis with session-only storage
 */
export class SkillsAdapterWeb implements PlatformAdapter {
  private platformInfo: PlatformInfo;
  private featureSet: FeatureSet;

  constructor() {
    this.platformInfo = {
      type: 'web_skills',
      version: '1.0.0',
      capabilities: PlatformDetector.getCapabilities('web_skills'),
      nativeIntegrations: PlatformDetector.getNativeIntegrations('web_skills'),
    };
    this.featureSet = PlatformDetector.getFeatureSet('web_skills');
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
    // Web Skills adapter initialization
    // This is a limited environment with:
    // - Session-only storage
    // - No native integrations
    // - Manual copy/paste for reminders
  }

  /**
   * Check if a specific capability is available
   */
  isCapabilityAvailable(capability: string): boolean {
    return PlatformDetector.isCapabilityAvailable('web_skills', capability);
  }
}
