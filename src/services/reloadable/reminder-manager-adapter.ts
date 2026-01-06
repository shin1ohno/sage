/**
 * Reloadable Service Adapter for ReminderManager
 *
 * Wraps ReminderManager to support hot-reload functionality.
 * Reinitializes the service when integrations or reminders config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { ReminderManager, ReminderConfig } from '../../integrations/reminder-manager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ReminderManagerAdapter');

/**
 * Factory function type for creating ReminderManager
 */
export type ReminderManagerFactory = (config: UserConfig) => ReminderManager;

/**
 * Extract ReminderConfig from UserConfig
 */
function extractReminderConfig(config: UserConfig): ReminderConfig {
  return {
    appleRemindersThreshold: config.integrations.appleReminders.threshold,
    notionThreshold: config.integrations.notion.threshold,
    defaultList: config.integrations.appleReminders.defaultList,
    notionDatabaseId: config.integrations.notion.databaseId,
  };
}

/**
 * Default factory that creates ReminderManager from UserConfig
 */
export function createReminderManager(config: UserConfig): ReminderManager {
  const reminderConfig = extractReminderConfig(config);
  return new ReminderManager(reminderConfig);
}

/**
 * Reloadable adapter for ReminderManager
 */
export class ReminderManagerAdapter implements ReloadableService {
  readonly name = 'ReminderManager';
  readonly dependsOnSections: readonly string[] = ['integrations', 'reminders'];

  private instance: ReminderManager | null = null;
  private factory: ReminderManagerFactory;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: ReminderManagerFactory | ReminderManager) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createReminderManager;
    }
  }

  /**
   * Get the current ReminderManager instance
   */
  getInstance(): ReminderManager | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * ReminderManager does not have explicit cleanup needs
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down ReminderManager');
    // ReminderManager has no explicit cleanup
    // Just clear the reference
    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing ReminderManager with new config');

    try {
      this.instance = this.factory(config);
      logger.info('ReminderManager reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize ReminderManager');
      throw error;
    }
  }
}
