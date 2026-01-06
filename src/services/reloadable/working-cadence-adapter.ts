/**
 * Reloadable Service Adapter for WorkingCadenceService
 *
 * Wraps WorkingCadenceService to support hot-reload functionality.
 * Reinitializes the service when calendar config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { WorkingCadenceService } from '../working-cadence.js';
import type { CalendarSourceManager } from '../../integrations/calendar-source-manager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('WorkingCadenceAdapter');

/**
 * Factory function type for creating WorkingCadenceService
 */
export type WorkingCadenceServiceFactory = (
  config: UserConfig,
  calendarSourceManager?: CalendarSourceManager
) => WorkingCadenceService;

/**
 * Default factory that creates WorkingCadenceService
 */
export function createWorkingCadenceService(
  _config: UserConfig,
  calendarSourceManager?: CalendarSourceManager
): WorkingCadenceService {
  return new WorkingCadenceService(calendarSourceManager);
}

/**
 * Reloadable adapter for WorkingCadenceService
 */
export class WorkingCadenceAdapter implements ReloadableService {
  readonly name = 'WorkingCadenceService';
  readonly dependsOnSections: readonly string[] = ['calendar'];

  private instance: WorkingCadenceService | null = null;
  private factory: WorkingCadenceServiceFactory;
  private calendarSourceManager?: CalendarSourceManager;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   * @param calendarSourceManager - Optional CalendarSourceManager for focusTime analysis
   */
  constructor(
    factoryOrInstance: WorkingCadenceServiceFactory | WorkingCadenceService,
    calendarSourceManager?: CalendarSourceManager
  ) {
    this.calendarSourceManager = calendarSourceManager;

    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createWorkingCadenceService;
    }
  }

  /**
   * Set the CalendarSourceManager for dependency injection
   */
  setCalendarSourceManager(manager: CalendarSourceManager): void {
    this.calendarSourceManager = manager;
  }

  /**
   * Get the current WorkingCadenceService instance
   */
  getInstance(): WorkingCadenceService | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * WorkingCadenceService does not have explicit cleanup needs
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down WorkingCadenceService');
    // WorkingCadenceService has no explicit cleanup
    // Just clear the reference
    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing WorkingCadenceService with new config');

    try {
      this.instance = this.factory(config, this.calendarSourceManager);
      logger.info('WorkingCadenceService reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize WorkingCadenceService');
      throw error;
    }
  }
}
