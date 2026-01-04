/**
 * Service Container
 *
 * Manages service lifecycle and provides type-safe access to services.
 * Services are lazily initialized on first access after config is loaded.
 */

import type { UserConfig } from '../types/index.js';

/**
 * Service initialization status
 */
export type ServiceStatus = 'uninitialized' | 'initializing' | 'ready' | 'error';

/**
 * Service container state
 *
 * Tracks which services have been initialized and their current status.
 */
export interface ServiceContainerState {
  status: ServiceStatus;
  config: UserConfig | null;
  error?: Error;
}

/**
 * Creates a service getter that lazily initializes the service
 *
 * @param initializer - Function that creates the service instance
 * @returns Getter function that returns the service or null if not initialized
 *
 * @example
 * const getCalendarService = createLazyService(() => new CalendarService());
 * // Later, when needed:
 * const service = getCalendarService();
 */
export function createLazyService<T>(
  initializer: () => T
): () => T | null {
  let instance: T | null = null;
  let initialized = false;

  return () => {
    if (!initialized) {
      try {
        instance = initializer();
        initialized = true;
      } catch (error) {
        console.error('Failed to initialize service:', error);
        return null;
      }
    }
    return instance;
  };
}

/**
 * Creates a service getter that requires config
 *
 * @param initializer - Function that creates the service with config
 * @returns Getter function that accepts config and returns the service
 *
 * @example
 * const getReminderManager = createConfiguredService(
 *   (config) => new ReminderManager({ ... })
 * );
 * // Later, when config is available:
 * const manager = getReminderManager(userConfig);
 */
export function createConfiguredService<T>(
  initializer: (config: UserConfig) => T
): (config: UserConfig) => T | null {
  let instance: T | null = null;
  let initializedWithConfig: UserConfig | null = null;

  return (config: UserConfig) => {
    // Re-initialize if config changed
    if (!instance || initializedWithConfig !== config) {
      try {
        instance = initializer(config);
        initializedWithConfig = config;
      } catch (error) {
        console.error('Failed to initialize configured service:', error);
        return null;
      }
    }
    return instance;
  };
}

/**
 * Resets a lazy service to uninitialized state
 *
 * Useful for testing or when config changes require service re-initialization.
 *
 * @param resetter - Function that resets the service state
 */
export function resetLazyService(resetter: () => void): void {
  resetter();
}
