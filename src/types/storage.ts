/**
 * Configuration storage type definitions
 *
 * Provides interfaces for platform-specific configuration storage mechanisms.
 */

/**
 * Configuration storage interface
 *
 * Different platforms use different storage mechanisms:
 * - desktop_mcp: File-based storage (~/.sage/config.json)
 * - remote_mcp: Session/cloud storage
 */
export interface ConfigStorage {
  /**
   * Load configuration from storage
   */
  load(): Promise<Record<string, unknown> | null>;

  /**
   * Save configuration to storage
   */
  save(config: Record<string, unknown>): Promise<void>;

  /**
   * Check if configuration exists
   */
  exists(): Promise<boolean>;

  /**
   * Delete configuration
   */
  delete(): Promise<void>;
}

/**
 * Platform type enumeration
 *
 * Used by storage factory to determine the appropriate storage mechanism:
 * - desktop_mcp: Local file-based storage
 * - remote_mcp: Cloud/session-based storage
 */
export type PlatformType = 'desktop_mcp' | 'remote_mcp';
