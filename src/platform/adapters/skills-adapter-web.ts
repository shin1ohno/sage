/**
 * Skills Adapter for Web
 * 🔮 将来対応予定: Claude Skills APIが一般公開された時点で実装
 *
 * 現時点では、Claude Skills APIの詳細な仕様が公開されていません。
 * このアダプターは将来のAPI公開に備えたプレースホルダーです。
 *
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
