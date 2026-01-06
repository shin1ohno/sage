/**
 * Hot Reload type definitions
 */

import type { UserConfig } from './config.js';

/**
 * Result of a configuration reload operation
 */
export interface ReloadResult {
  /** Whether the reload was successful */
  success: boolean;
  /** List of config sections that were changed */
  changedSections: string[];
  /** List of services that were re-initialized */
  reinitializedServices: string[];
  /** Error message if reload failed */
  error?: string;
  /** ISO 8601 timestamp of the reload */
  timestamp: string;
  /** Duration of the reload operation in milliseconds */
  durationMs: number;
}

/**
 * State of the config file watcher
 */
export interface WatcherState {
  /** Whether the watcher is currently active */
  isWatching: boolean;
  /** List of file paths being watched */
  watchedPaths: string[];
  /** ISO 8601 timestamp of last detected change */
  lastChangeDetected?: string;
  /** Number of errors encountered during watching */
  errorCount: number;
}

/**
 * Hot reload status for MCP tool responses
 */
export interface ReloadStatus {
  /** Whether auto-reload is enabled */
  autoReloadEnabled: boolean;
  /** Current state of the file watcher */
  watcherState: WatcherState;
  /** Result of the last reload operation */
  lastReloadResult: ReloadResult | null;
  /** Summary of current config */
  currentConfig: {
    lastUpdated: string;
    sections: string[];
  };
}

/**
 * Interface for services that can be reloaded without restart
 */
export interface ReloadableService {
  /** Unique name identifying this service */
  readonly name: string;
  /** Config sections this service depends on */
  readonly dependsOnSections: readonly string[];
  /**
   * Re-initialize the service with new configuration
   * @param config The new configuration to use
   */
  reinitialize(config: UserConfig): Promise<void>;
  /**
   * Gracefully shutdown the service before re-initialization
   */
  shutdown(): Promise<void>;
}

/**
 * Options for ConfigWatcher
 */
export interface ConfigWatcherOptions {
  /** Debounce delay in milliseconds (default: 500) */
  debounceMs?: number;
  /** Config file paths to watch (defaults to user and remote config paths) */
  configPaths?: string[];
}

/**
 * Options for ConfigReloadService
 */
export interface ConfigReloadServiceOptions {
  /** ConfigWatcher instance to use */
  watcher?: ConfigWatcher;
  /** Whether to enable automatic reload on file changes (default: true) */
  enableAutoReload?: boolean;
  /** Callback invoked after each reload attempt */
  onReload?: (result: ReloadResult) => void;
}

/**
 * Hot reload configuration from environment variables
 */
export interface HotReloadConfig {
  /** Whether hot reload is disabled */
  disabled: boolean;
  /** Debounce delay in milliseconds */
  debounceMs: number;
}

/**
 * Result of config diff operation
 */
export interface ConfigDiff {
  /** Top-level sections that have changed */
  changedSections: string[];
  /** Keys that were added */
  addedKeys: Record<string, unknown>;
  /** Keys that were removed */
  removedKeys: string[];
  /** Keys that were modified with old and new values */
  modifiedKeys: Record<string, { old: unknown; new: unknown }>;
}

/**
 * ConfigWatcher event types
 */
export interface ConfigWatcherEvents {
  change: (path: string) => void;
  error: (error: Error) => void;
}

/**
 * Abstract interface for ConfigWatcher (for type reference in options)
 */
export interface ConfigWatcher {
  start(): Promise<void>;
  stop(): void;
  isWatching(): boolean;
  on<K extends keyof ConfigWatcherEvents>(
    event: K,
    listener: ConfigWatcherEvents[K]
  ): this;
  off<K extends keyof ConfigWatcherEvents>(
    event: K,
    listener: ConfigWatcherEvents[K]
  ): this;
}
