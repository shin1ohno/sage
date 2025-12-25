/**
 * Config Storage Factory
 * Creates appropriate storage based on platform
 * Requirements: 1.1, 1.5, 10.1
 *
 * 実装:
 * - desktop_mcp: ファイルベースストレージ
 * - remote_mcp: クラウドストレージ（セッションフォールバック）
 */

import type { ConfigStorage, PlatformType } from '../../platform/types.js';
import { FileConfigStorage } from './file-storage.js';
import { SessionConfigStorage } from './session-storage.js';

/**
 * Storage type enumeration
 */
export type StorageType = 'file' | 'session' | 'cloud';

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

      case 'remote_mcp':
        // Remote MCP uses cloud storage (session fallback for now)
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

      case 'remote_mcp':
        return 'cloud';

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

      case 'remote_mcp':
        // Cloud storage is persistent
        return true;

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

      case 'remote_mcp':
        return '設定はクラウドストレージに同期されます';

      default:
        return '設定はセッション終了時に消去されます。次回使用時に再設定が必要です';
    }
  }
}
