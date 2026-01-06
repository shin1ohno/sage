/**
 * Configuration File Watcher
 * Watches user config and remote config files for changes
 * and emits events with debouncing support.
 */

import { EventEmitter } from 'events';
import { watch, constants, promises as fsPromises, type FSWatcher } from 'fs';
import type { ConfigWatcherOptions, ConfigWatcherEvents } from '../types/hot-reload.js';
import { ConfigLoader } from './loader.js';
import { DEFAULT_REMOTE_CONFIG_PATH } from '../cli/remote-config-loader.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('config-watcher');

/**
 * Default debounce delay in milliseconds
 */
const DEFAULT_DEBOUNCE_MS = 500;

/**
 * ConfigWatcher watches configuration files for changes
 * and emits debounced 'change' events.
 */
export class ConfigWatcher extends EventEmitter {
  private readonly debounceMs: number;
  private readonly configPaths: string[];
  private watchers: Map<string, FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private watching: boolean = false;

  constructor(options: ConfigWatcherOptions = {}) {
    super();
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.configPaths = options.configPaths ?? [
      ConfigLoader.getConfigPath(),
      DEFAULT_REMOTE_CONFIG_PATH,
    ];

    logger.debug({ debounceMs: this.debounceMs, configPaths: this.configPaths }, 'ConfigWatcher initialized');
  }

  /**
   * Start watching all configuration files
   */
  async start(): Promise<void> {
    if (this.watching) {
      logger.warn('ConfigWatcher is already watching');
      return;
    }

    logger.info({ paths: this.configPaths }, 'Starting config file watcher');

    for (const configPath of this.configPaths) {
      await this.watchFile(configPath);
    }

    this.watching = true;
  }

  /**
   * Stop watching all configuration files
   */
  stop(): void {
    if (!this.watching) {
      logger.warn('ConfigWatcher is not watching');
      return;
    }

    logger.info('Stopping config file watcher');

    // Clear all debounce timers
    Array.from(this.debounceTimers.values()).forEach((timer) => {
      clearTimeout(timer);
    });
    this.debounceTimers.clear();

    // Close all file watchers
    Array.from(this.watchers.entries()).forEach(([watchPath, watcher]) => {
      logger.debug({ path: watchPath }, 'Closing watcher');
      watcher.close();
    });
    this.watchers.clear();

    this.watching = false;
  }

  /**
   * Check if the watcher is currently active
   */
  isWatching(): boolean {
    return this.watching;
  }

  /**
   * Get the list of watched paths
   */
  getWatchedPaths(): string[] {
    return [...this.configPaths];
  }

  /**
   * Watch a single file for changes
   */
  private async watchFile(filePath: string): Promise<void> {
    try {
      // Check if file exists before watching
      const fileExists = await this.fileExists(filePath);
      if (!fileExists) {
        logger.warn({ path: filePath }, 'Config file does not exist, will watch for creation');
        // Watch the parent directory for file creation
        await this.watchForFileCreation(filePath);
        return;
      }

      const watcher = watch(filePath, (_eventType, _filename) => {
        this.handleFileChange(filePath, _eventType);
      });

      watcher.on('error', (error) => {
        this.handleWatchError(filePath, error);
      });

      this.watchers.set(filePath, watcher);
      logger.debug({ path: filePath }, 'Started watching config file');
    } catch (error) {
      this.handleWatchError(filePath, error as Error);
    }
  }

  /**
   * Watch for file creation when the file doesn't exist
   */
  private async watchForFileCreation(filePath: string): Promise<void> {
    const parentDir = this.getParentDirectory(filePath);
    const fileName = this.getFileName(filePath);

    try {
      // Check if parent directory exists
      const parentExists = await this.fileExists(parentDir);
      if (!parentExists) {
        logger.warn({ path: parentDir }, 'Parent directory does not exist, cannot watch for file creation');
        return;
      }

      const watcher = watch(parentDir, async (eventType, detectedFileName) => {
        if (detectedFileName === fileName && eventType === 'rename') {
          const fileNowExists = await this.fileExists(filePath);
          if (fileNowExists) {
            logger.info({ path: filePath }, 'Config file created, starting to watch');
            // Close directory watcher and start file watcher
            watcher.close();
            this.watchers.delete(parentDir + ':' + fileName);
            await this.watchFile(filePath);
            // Emit change event for the newly created file
            this.emitDebouncedChange(filePath);
          }
        }
      });

      watcher.on('error', (error) => {
        logger.error({ path: parentDir, error: error.message }, 'Error watching parent directory');
      });

      this.watchers.set(parentDir + ':' + fileName, watcher);
      logger.debug({ path: parentDir, fileName }, 'Watching parent directory for file creation');
    } catch (error) {
      logger.error({ path: parentDir, error: (error as Error).message }, 'Failed to watch parent directory');
    }
  }

  /**
   * Handle file change events
   */
  private handleFileChange(filePath: string, eventType: string): void {
    logger.debug({ path: filePath, eventType }, 'File change detected');

    if (eventType === 'rename') {
      // File may have been deleted
      this.handlePotentialDeletion(filePath);
      return;
    }

    // Debounce the change event
    this.emitDebouncedChange(filePath);
  }

  /**
   * Handle potential file deletion
   */
  private async handlePotentialDeletion(filePath: string): Promise<void> {
    const fileExists = await this.fileExists(filePath);

    if (!fileExists) {
      logger.warn({ path: filePath }, 'Config file was deleted, continuing with current config');
      // Close the current watcher
      const watcher = this.watchers.get(filePath);
      if (watcher) {
        watcher.close();
        this.watchers.delete(filePath);
      }
      // Start watching for file recreation
      await this.watchForFileCreation(filePath);
    } else {
      // File was recreated or renamed back
      logger.info({ path: filePath }, 'Config file recreated');
      this.emitDebouncedChange(filePath);
    }
  }

  /**
   * Emit debounced change event
   */
  private emitDebouncedChange(filePath: string): void {
    // Clear existing timer for this path
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      logger.info({ path: filePath }, 'Emitting config change event');
      this.emit('change', filePath);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Handle watch errors
   */
  private handleWatchError(filePath: string, error: Error): void {
    logger.error({ path: filePath, error: error.message }, 'Error watching config file');
    this.emit('error', error);
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get parent directory of a file path
   */
  private getParentDirectory(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash > 0 ? filePath.substring(0, lastSlash) : '/';
  }

  /**
   * Get file name from a file path
   */
  private getFileName(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
  }

  /**
   * Type-safe event emitter methods
   */
  override on<K extends keyof ConfigWatcherEvents>(
    event: K,
    listener: ConfigWatcherEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override off<K extends keyof ConfigWatcherEvents>(
    event: K,
    listener: ConfigWatcherEvents[K]
  ): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof ConfigWatcherEvents>(
    event: K,
    ...args: Parameters<ConfigWatcherEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
