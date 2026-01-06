/**
 * Reloadable Service Adapter for NotionMCPService
 *
 * Wraps NotionMCPService to support hot-reload functionality.
 * Reinitializes the service when integrations config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { NotionMCPService, NotionMCPClient } from '../../integrations/notion-mcp.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('NotionServiceAdapter');

/**
 * Factory function type for creating NotionMCPService
 */
export type NotionMCPServiceFactory = (config: UserConfig) => NotionMCPService;

/**
 * Default factory that creates NotionMCPService from UserConfig
 */
export function createNotionMCPService(config: UserConfig): NotionMCPService {
  const service = new NotionMCPService();

  // Configure MCP client if Notion is enabled and database ID is set
  if (config.integrations.notion.enabled && config.integrations.notion.databaseId) {
    const client = new NotionMCPClient({
      allowedDatabaseIds: [config.integrations.notion.databaseId],
    });
    service.setMCPClient(client);
  }

  return service;
}

/**
 * Reloadable adapter for NotionMCPService
 */
export class NotionServiceAdapter implements ReloadableService {
  readonly name = 'NotionMCPService';
  readonly dependsOnSections: readonly string[] = ['integrations'];

  private instance: NotionMCPService | null = null;
  private factory: NotionMCPServiceFactory;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: NotionMCPServiceFactory | NotionMCPService) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createNotionMCPService;
    }
  }

  /**
   * Get the current NotionMCPService instance
   */
  getInstance(): NotionMCPService | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * Disconnects MCP client if connected
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down NotionMCPService');

    if (this.instance) {
      const client = this.instance.getMCPClient();
      if (client && client.isConnected()) {
        try {
          await client.disconnect();
          logger.debug('NotionMCPClient disconnected');
        } catch (error) {
          logger.warn({ err: error }, 'Error disconnecting NotionMCPClient');
        }
      }
    }

    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing NotionMCPService with new config');

    try {
      this.instance = this.factory(config);
      logger.info('NotionMCPService reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize NotionMCPService');
      throw error;
    }
  }
}
