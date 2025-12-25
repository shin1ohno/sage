/**
 * Session Config Storage
 * Stores configuration in memory for Skills environments
 * Requirements: 1.1, 10.1
 */

import type { ConfigStorage } from '../../platform/types.js';

/**
 * Session-based configuration storage
 * Used for iOS/iPadOS and Web Skills environments
 * Note: iOS/iPadOS may sync to iCloud in future implementations
 */
export class SessionConfigStorage implements ConfigStorage {
  private config: Record<string, unknown> | null = null;

  /**
   * Load configuration from session
   */
  async load(): Promise<Record<string, unknown> | null> {
    return this.config;
  }

  /**
   * Save configuration to session
   */
  async save(config: Record<string, unknown>): Promise<void> {
    this.config = { ...config };
  }

  /**
   * Check if configuration exists in session
   */
  async exists(): Promise<boolean> {
    return this.config !== null;
  }

  /**
   * Delete configuration from session
   */
  async delete(): Promise<void> {
    this.config = null;
  }

  /**
   * Clear all session data
   */
  clear(): void {
    this.config = null;
  }
}
