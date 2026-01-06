/**
 * Configuration Reload Service
 *
 * Orchestrates configuration hot-reload functionality.
 * Subscribes to ConfigWatcher events and coordinates service
 * re-initialization through ServiceRegistry.
 */

import type {
  ReloadResult,
  ConfigReloadServiceOptions,
  ConfigWatcher,
} from '../types/hot-reload.js';
import type { UserConfig } from '../types/config.js';
import { ConfigLoader } from './loader.js';
import { diffConfig, hasSignificantChanges } from './config-differ.js';
import type { ServiceRegistry } from '../services/service-registry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('config-reload-service');

/**
 * ConfigReloadService manages automatic configuration reloading
 *
 * Subscribes to file change events from ConfigWatcher, validates
 * new configuration, calculates differences, and coordinates
 * service re-initialization through ServiceRegistry.
 */
export class ConfigReloadService {
  private readonly watcher: ConfigWatcher;
  private readonly serviceRegistry: ServiceRegistry;
  private readonly enableAutoReload: boolean;
  private readonly onReloadCallback?: (result: ReloadResult) => void;

  private currentConfig: UserConfig | null = null;
  private lastReloadResult: ReloadResult | null = null;
  private isReloading: boolean = false;
  private pendingReload: Promise<ReloadResult> | null = null;
  private changeHandler: ((path: string) => void) | null = null;

  /**
   * Create a new ConfigReloadService
   *
   * @param watcher - ConfigWatcher instance to subscribe to
   * @param serviceRegistry - ServiceRegistry for coordinating service re-initialization
   * @param options - Optional configuration options
   */
  constructor(
    watcher: ConfigWatcher,
    serviceRegistry: ServiceRegistry,
    options: ConfigReloadServiceOptions = {}
  ) {
    this.watcher = watcher;
    this.serviceRegistry = serviceRegistry;
    this.enableAutoReload = options.enableAutoReload ?? true;
    this.onReloadCallback = options.onReload;

    logger.debug(
      { enableAutoReload: this.enableAutoReload },
      'ConfigReloadService initialized'
    );
  }

  /**
   * Start the reload service
   *
   * Loads initial configuration and subscribes to watcher events
   * if auto-reload is enabled.
   */
  async start(): Promise<void> {
    logger.info('Starting ConfigReloadService');

    // Load initial configuration
    try {
      this.currentConfig = await ConfigLoader.load();
      logger.debug('Initial configuration loaded');
    } catch (error) {
      logger.error(
        { err: error },
        'Failed to load initial configuration'
      );
      throw error;
    }

    // Subscribe to watcher events if auto-reload is enabled
    if (this.enableAutoReload) {
      this.changeHandler = this.handleConfigChange.bind(this);
      this.watcher.on('change', this.changeHandler);
      logger.info('Subscribed to config watcher change events');
    }
  }

  /**
   * Stop the reload service
   *
   * Unsubscribes from watcher events and stops the watcher.
   */
  stop(): void {
    logger.info('Stopping ConfigReloadService');

    // Unsubscribe from watcher events
    if (this.changeHandler) {
      this.watcher.off('change', this.changeHandler);
      this.changeHandler = null;
      logger.debug('Unsubscribed from config watcher change events');
    }

    // Stop the watcher
    this.watcher.stop();
    logger.info('ConfigReloadService stopped');
  }

  /**
   * Check if auto-reload is enabled
   */
  isAutoReloadEnabled(): boolean {
    return this.enableAutoReload;
  }

  /**
   * Get the result of the last reload operation
   */
  getLastReloadResult(): ReloadResult | null {
    return this.lastReloadResult;
  }

  /**
   * Get the current configuration
   */
  getCurrentConfig(): UserConfig | null {
    return this.currentConfig;
  }

  /**
   * Reload configuration manually or in response to file changes
   *
   * Implements reload lock mechanism to prevent concurrent reloads.
   * If a reload is already in progress, queues the request and returns
   * the same promise.
   *
   * @returns ReloadResult with details about the reload operation
   */
  async reload(): Promise<ReloadResult> {
    // If already reloading, queue and return pending promise
    if (this.isReloading && this.pendingReload) {
      logger.debug('Reload already in progress, queueing request');
      return this.pendingReload;
    }

    // Set reload lock
    this.isReloading = true;
    logger.info('Starting configuration reload');

    const startTime = Date.now();

    // Create and store the pending reload promise
    this.pendingReload = this.performReload(startTime);

    try {
      const result = await this.pendingReload;
      return result;
    } finally {
      // Release reload lock
      this.isReloading = false;
      this.pendingReload = null;
    }
  }

  /**
   * Perform the actual reload operation
   */
  private async performReload(startTime: number): Promise<ReloadResult> {
    try {
      // Load new configuration
      logger.debug('Loading new configuration from disk');
      const newConfig = await ConfigLoader.load();

      // Calculate diff if we have a previous config
      let changedSections: string[] = [];
      if (this.currentConfig) {
        const diff = diffConfig(this.currentConfig, newConfig);
        logger.debug(
          {
            changedSections: diff.changedSections,
            addedKeys: Object.keys(diff.addedKeys).length,
            removedKeys: diff.removedKeys.length,
            modifiedKeys: Object.keys(diff.modifiedKeys).length,
          },
          'Configuration diff calculated'
        );

        // Check if there are significant changes
        if (!hasSignificantChanges(diff)) {
          logger.info('No significant configuration changes detected');
          const result: ReloadResult = {
            success: true,
            changedSections: [],
            reinitializedServices: [],
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - startTime,
          };
          this.lastReloadResult = result;
          this.invokeCallback(result);
          return result;
        }

        changedSections = diff.changedSections;
      }

      // Re-initialize affected services
      logger.info(
        { changedSections },
        'Re-initializing services for changed sections'
      );

      const affectedServices = this.serviceRegistry.getServicesForSections(changedSections);
      const reinitializedServices = affectedServices.map((s) => s.name);

      await this.serviceRegistry.reinitializeForSections(changedSections, newConfig);

      // Update current config
      this.currentConfig = newConfig;

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          changedSections,
          reinitializedServices,
          durationMs,
        },
        'Configuration reload completed successfully'
      );

      const result: ReloadResult = {
        success: true,
        changedSections,
        reinitializedServices,
        timestamp: new Date().toISOString(),
        durationMs,
      };

      this.lastReloadResult = result;
      this.invokeCallback(result);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          err: error,
          durationMs,
        },
        'Configuration reload failed'
      );

      const result: ReloadResult = {
        success: false,
        changedSections: [],
        reinitializedServices: [],
        error: errorMessage,
        timestamp: new Date().toISOString(),
        durationMs,
      };

      this.lastReloadResult = result;
      this.invokeCallback(result);
      return result;
    }
  }

  /**
   * Handle config file change events from watcher
   */
  private handleConfigChange(path: string): void {
    logger.info({ path }, 'Config file change detected, triggering reload');
    this.reload().catch((error) => {
      logger.error(
        { err: error, path },
        'Failed to reload configuration after file change'
      );
    });
  }

  /**
   * Invoke the onReload callback if configured
   */
  private invokeCallback(result: ReloadResult): void {
    if (this.onReloadCallback) {
      try {
        this.onReloadCallback(result);
      } catch (error) {
        logger.error(
          { err: error },
          'Error in onReload callback'
        );
      }
    }
  }
}
