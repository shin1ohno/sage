/**
 * Platform Adapter Factory
 * Creates appropriate platform adapter based on detected environment
 * Requirements: 7.3, 7.4, 7.5
 */

import type { PlatformAdapter, PlatformType } from './types.js';
import { PlatformDetector } from './detector.js';
import { MCPAdapter } from './adapters/mcp-adapter.js';
import { SkillsAdapteriOS } from './adapters/skills-adapter-ios.js';
import { SkillsAdapterWeb } from './adapters/skills-adapter-web.js';

/**
 * Factory for creating platform-specific adapters
 */
export class PlatformAdapterFactory {
  /**
   * Create adapter based on detected platform
   * Automatically detects the current platform and creates the appropriate adapter
   */
  static async create(): Promise<PlatformAdapter> {
    const platformInfo = await PlatformDetector.detect();
    return this.createForPlatform(platformInfo.type);
  }

  /**
   * Create adapter for a specific platform type
   * Useful for testing or when platform type is already known
   */
  static createForPlatform(platformType: PlatformType): PlatformAdapter {
    switch (platformType) {
      case 'desktop_mcp':
        return new MCPAdapter();

      case 'ios_skills':
        return new SkillsAdapteriOS('ios_skills');

      case 'ipados_skills':
        return new SkillsAdapteriOS('ipados_skills');

      case 'web_skills':
        return new SkillsAdapterWeb();

      default:
        throw new Error(`Unsupported platform type: ${platformType}`);
    }
  }
}
