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
 * Default factory that creates SlackService.
 * Credentials are resolved with priority: environment variables > config.json.
 */
export function createSlackService(config: UserConfig): SlackService {
  const clientId = process.env.SLACK_CLIENT_ID || config.integrations?.slack?.clientId;
  const clientSecret = process.env.SLACK_CLIENT_SECRET || config.integrations?.slack?.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error('Slack integration not configured: missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET');
  }
  const redirectUri = process.env.SLACK_REDIRECT_URI
    || config.integrations?.slack?.redirectUri
    || 'http://localhost:54321/oauth/slack/callback';
  const oauthHandler = new SlackOAuthHandler({
    clientId,
    clientSecret,
    redirectUri,
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

  constructor(factoryOrInstance: SlackServiceFactory | SlackService) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createSlackService;
    }
  }

  getInstance(): SlackService | null {
    return this.instance;
  }

  async shutdown(): Promise<void> {
    logger.debug('Shutting down SlackService');
    this.instance = null;
  }

  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing SlackService with new config');

    try {
      this.instance = this.factory(config);
      logger.info('SlackService reinitialized successfully');
    } catch (error) {
      // Slack is optional — don't throw, just warn and set null
      logger.warn({ err: error }, 'SlackService not configured, skipping initialization');
      this.instance = null;
    }
  }
}
