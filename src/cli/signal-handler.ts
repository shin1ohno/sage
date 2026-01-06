/**
 * Signal Handler for Hot Reload
 * Handles Unix signals for configuration reload and graceful shutdown.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('signal-handler');

/**
 * Interface for ConfigReloadService that signal handler depends on.
 * This is a minimal interface to avoid circular dependencies.
 */
export interface ConfigReloadServiceInterface {
  reload(): Promise<import('../types/hot-reload.js').ReloadResult>;
  stop(): void;
}

/**
 * Setup signal handlers for hot reload and graceful shutdown.
 *
 * - SIGHUP: Triggers configuration reload
 * - SIGTERM: Initiates graceful shutdown
 * - SIGINT: Initiates graceful shutdown
 *
 * @param configReloadService - Service that handles config reloading
 */
export function setupSignalHandlers(configReloadService: ConfigReloadServiceInterface): void {
  // Handle SIGHUP - reload configuration
  process.on('SIGHUP', async () => {
    logger.info('Received SIGHUP signal, reloading configuration');

    try {
      const result = await configReloadService.reload();

      if (result.success) {
        logger.info(
          {
            changedSections: result.changedSections,
            reinitializedServices: result.reinitializedServices,
            durationMs: result.durationMs,
          },
          'Configuration reload completed successfully'
        );
      } else {
        logger.error({ error: result.error }, 'Configuration reload failed');
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Configuration reload failed with exception'
      );
    }
  });

  // Handle SIGTERM - graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal, initiating graceful shutdown');
    configReloadService.stop();
    process.exit(0);
  });

  // Handle SIGINT - graceful shutdown (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('Received SIGINT signal, initiating graceful shutdown');
    configReloadService.stop();
    process.exit(0);
  });

  logger.debug('Signal handlers registered for SIGHUP, SIGTERM, and SIGINT');
}
