/**
 * Config Storage Factory
 * Creates appropriate storage based on platform
 * Requirements: 1.1, 1.5, 10.1
 */

import type { ConfigStorage, PlatformType } from '../../platform/types.js';
import { FileConfigStorage } from './file-storage.js';
import { SessionConfigStorage } from './session-storage.js';

/**
 * Storage type enumeration
 */
export type StorageType = 'file' | 'session' | 'icloud';

/**
 * Factory for creating platform-specific config storage
 */
export class ConfigStorageFactory {
  /**
   * Create storage based on platform type
   */
  static create(platformType: PlatformType): ConfigStorage {
    switch (platformType) {
      case 'desktop_mcp':
        return new FileConfigStorage();

      case 'ios_skills':
      case 'ipados_skills':
        // For now, use session storage
        // In future, could implement iCloud sync
        return new SessionConfigStorage();

      case 'web_skills':
        return new SessionConfigStorage();

      default:
        return new SessionConfigStorage();
    }
  }

  /**
   * Get storage type for a platform
   */
  static getStorageType(platformType: PlatformType): StorageType {
    switch (platformType) {
      case 'desktop_mcp':
        return 'file';

      case 'ios_skills':
      case 'ipados_skills':
        // iCloud sync planned for future
        return 'session';

      case 'web_skills':
      default:
        return 'session';
    }
  }

  /**
   * Check if storage is persistent across sessions
   */
  static isPersistent(platformType: PlatformType): boolean {
    switch (platformType) {
      case 'desktop_mcp':
        return true;

      case 'ios_skills':
      case 'ipados_skills':
        // iCloud sync makes it persistent
        return true;

      case 'web_skills':
      default:
        return false;
    }
  }

  /**
   * Get storage description for user display
   */
  static getStorageDescription(platformType: PlatformType): string {
    switch (platformType) {
      case 'desktop_mcp':
        return '設定は ~/.sage/config.json に永続保存されます';

      case 'ios_skills':
      case 'ipados_skills':
        return '設定はセッションに保存され、将来的にはiCloud同期が可能になります';

      case 'web_skills':
      default:
        return '設定はセッション終了時に消去されます。次回使用時に再設定が必要です';
    }
  }
}
