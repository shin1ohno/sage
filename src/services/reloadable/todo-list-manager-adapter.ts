/**
 * Reloadable Service Adapter for TodoListManager
 *
 * Wraps TodoListManager to support hot-reload functionality.
 * Reinitializes the service when integrations config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { TodoListManager, TodoListManagerConfig } from '../../integrations/todo-list-manager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TodoListManagerAdapter');

/**
 * Factory function type for creating TodoListManager
 */
export type TodoListManagerFactory = (config: UserConfig) => TodoListManager;

/**
 * Extract TodoListManagerConfig from UserConfig
 */
function extractTodoListManagerConfig(config: UserConfig): TodoListManagerConfig {
  return {
    notionDatabaseId: config.integrations.notion.enabled
      ? config.integrations.notion.databaseId
      : undefined,
    appleRemindersDefaultList: config.integrations.appleReminders.defaultList,
  };
}

/**
 * Default factory that creates TodoListManager from UserConfig
 */
export function createTodoListManager(config: UserConfig): TodoListManager {
  const todoConfig = extractTodoListManagerConfig(config);
  return new TodoListManager(todoConfig);
}

/**
 * Reloadable adapter for TodoListManager
 */
export class TodoListManagerAdapter implements ReloadableService {
  readonly name = 'TodoListManager';
  readonly dependsOnSections: readonly string[] = ['integrations'];

  private instance: TodoListManager | null = null;
  private factory: TodoListManagerFactory;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: TodoListManagerFactory | TodoListManager) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createTodoListManager;
    }
  }

  /**
   * Get the current TodoListManager instance
   */
  getInstance(): TodoListManager | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * TodoListManager does not have explicit cleanup needs
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down TodoListManager');
    // TodoListManager has no explicit cleanup (cache will be garbage collected)
    // Just clear the reference
    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing TodoListManager with new config');

    try {
      this.instance = this.factory(config);
      logger.info('TodoListManager reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize TodoListManager');
      throw error;
    }
  }
}
