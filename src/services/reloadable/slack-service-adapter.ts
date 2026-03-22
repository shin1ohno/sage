/**
 * Reloadable Service Adapter for SlackService
 *
 * Wraps SlackService to support hot-reload functionality.
 * Reinitializes the service when integrations config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { SlackService } from '../../integrations/slack-service.js';
import { SlackOAuthHandler } from '../../oauth/slack-oauth-handler.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SlackServiceAdapter');

/**
 * Factory function type for creating SlackService
 */
export type SlackServiceFactory = (config: UserConfig) => SlackService;

/**
 * Default factory that creates SlackService from UserConfig
 */
export function createSlackService(config: UserConfig): SlackService {
  const slackConfig = config.integrations?.slack;
  if (!slackConfig?.clientId || !slackConfig?.clientSecret) {
    throw new Error('Slack integration not configured: missing clientId or clientSecret');
  }
  const oauthHandler = new SlackOAuthHandler({
    clientId: slackConfig.clientId,
    clientSecret: slackConfig.clientSecret,
    redirectUri: slackConfig.redirectUri || 'http://localhost:54321/oauth/slack/callback',
  });
  return new SlackService(oauthHandler);
}

/**
 * Reloadable adapter for SlackService
 */
export class SlackServiceAdapter implements ReloadableService {
  readonly name = 'SlackService';
  readonly dependsOnSections: readonly string[] = ['integrations'];

  private instance: SlackService | null = null;
  private factory: SlackServiceFactory;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: SlackServiceFactory | SlackService) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createSlackService;
    }
  }

  /**
   * Get the current SlackService instance
   */
  getInstance(): SlackService | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * SlackService does not have explicit cleanup needs
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down SlackService');
    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   * Slack is optional, so missing config sets instance to null without throwing
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing SlackService with new config');

    try {
      this.instance = this.factory(config);
      logger.info('SlackService reinitialized successfully');
    } catch (error) {
      logger.warn({ err: error }, 'Slack not configured, disabling SlackService');
      this.instance = null;
    }
  }
}
