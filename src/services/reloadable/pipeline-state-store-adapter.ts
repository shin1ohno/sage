/**
 * Reloadable Service Adapter for PipelineStateStore
 *
 * Wraps PipelineStateStore to support hot-reload functionality.
 * Reinitializes the service when meetingIntelligence config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { PipelineStateStore } from '../pipeline-state-store.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PipelineStateStoreAdapter');

/**
 * Factory function type for creating PipelineStateStore
 */
export type PipelineStateStoreFactory = (config: UserConfig) => PipelineStateStore;

/**
 * Default factory that creates PipelineStateStore
 */
export function createPipelineStateStore(_config: UserConfig): PipelineStateStore {
  return new PipelineStateStore();
}

/**
 * Reloadable adapter for PipelineStateStore
 */
export class PipelineStateStoreAdapter implements ReloadableService {
  readonly name = 'PipelineStateStore';
  readonly dependsOnSections: readonly string[] = ['meetingIntelligence'];

  private instance: PipelineStateStore | null = null;
  private factory: PipelineStateStoreFactory;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: PipelineStateStoreFactory | PipelineStateStore) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createPipelineStateStore;
    }
  }

  /**
   * Get the current PipelineStateStore instance
   */
  getInstance(): PipelineStateStore | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * Flushes pending state before clearing
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down PipelineStateStore');

    if (this.instance) {
      try {
        await this.instance.flush();
        logger.debug('PipelineStateStore flushed successfully');
      } catch (error) {
        logger.warn({ err: error }, 'Error flushing PipelineStateStore');
      }
    }

    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   * Creates a new store and loads persisted state from disk
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing PipelineStateStore with new config');

    try {
      this.instance = this.factory(config);
      await this.instance.load();
      logger.info('PipelineStateStore reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize PipelineStateStore');
      throw error;
    }
  }
}
