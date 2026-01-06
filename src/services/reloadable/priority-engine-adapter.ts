/**
 * Reloadable Service Adapter for PriorityEngine
 *
 * Wraps PriorityEngine to support hot-reload functionality.
 * Reinitializes the service when priorityRules config changes.
 *
 * Note: PriorityEngine is a stateless class with static methods,
 * so shutdown/reinitialize are essentially no-ops. The adapter
 * maintains a config reference that can be updated.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig, PriorityRules, TeamConfig } from '../../types/config.js';
import { PriorityEngine } from '../../utils/priority.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PriorityEngineAdapter');

/**
 * PriorityEngine wrapper that holds config reference
 *
 * Since PriorityEngine uses static methods, this wrapper provides
 * instance methods that use the stored config.
 */
export class PriorityEngineWrapper {
  private priorityRules: PriorityRules;
  private teamConfig?: TeamConfig;

  constructor(config: UserConfig) {
    this.priorityRules = config.priorityRules;
    this.teamConfig = config.team;
  }

  /**
   * Get the current priority rules
   */
  getPriorityRules(): PriorityRules {
    return this.priorityRules;
  }

  /**
   * Get the team config
   */
  getTeamConfig(): TeamConfig | undefined {
    return this.teamConfig;
  }

  /**
   * Access to the underlying static PriorityEngine class
   */
  get engine(): typeof PriorityEngine {
    return PriorityEngine;
  }
}

/**
 * Factory function type for creating PriorityEngineWrapper
 */
export type PriorityEngineFactory = (config: UserConfig) => PriorityEngineWrapper;

/**
 * Default factory that creates PriorityEngineWrapper from UserConfig
 */
export function createPriorityEngine(config: UserConfig): PriorityEngineWrapper {
  return new PriorityEngineWrapper(config);
}

/**
 * Reloadable adapter for PriorityEngine
 */
export class PriorityEngineAdapter implements ReloadableService {
  readonly name = 'PriorityEngine';
  readonly dependsOnSections: readonly string[] = ['priorityRules'];

  private instance: PriorityEngineWrapper | null = null;
  private factory: PriorityEngineFactory;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: PriorityEngineFactory | PriorityEngineWrapper) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createPriorityEngine;
    }
  }

  /**
   * Get the current PriorityEngineWrapper instance
   */
  getInstance(): PriorityEngineWrapper | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * PriorityEngine is stateless, so this is a no-op
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down PriorityEngine (no-op for stateless engine)');
    // PriorityEngine is stateless, no cleanup needed
    // Just clear the reference
    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   * Updates the config reference for the wrapper
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing PriorityEngine with new config');

    try {
      this.instance = this.factory(config);
      logger.info('PriorityEngine reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize PriorityEngine');
      throw error;
    }
  }
}
