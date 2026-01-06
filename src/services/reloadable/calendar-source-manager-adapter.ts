/**
 * Reloadable Service Adapter for CalendarSourceManager
 *
 * Wraps CalendarSourceManager to support hot-reload functionality.
 * Reinitializes the service when calendar or integrations config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { CalendarSourceManager } from '../../integrations/calendar-source-manager.js';
import { CalendarService } from '../../integrations/calendar-service.js';
import { GoogleCalendarService } from '../../integrations/google-calendar-service.js';
import { GoogleOAuthHandler } from '../../oauth/google-oauth-handler.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('CalendarSourceManagerAdapter');

/**
 * Factory function type for creating CalendarSourceManager
 */
export type CalendarSourceManagerFactory = (config: UserConfig) => CalendarSourceManager;

/**
 * Create GoogleCalendarService if Google Calendar integration is enabled and configured
 */
function createGoogleCalendarServiceIfEnabled(config: UserConfig): GoogleCalendarService | undefined {
  // Check if Google Calendar is enabled via integrations config
  if (!config.integrations.googleCalendar.enabled) {
    return undefined;
  }

  // Get OAuth credentials from environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn('Google OAuth credentials not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)');
    return undefined;
  }

  const oauthConfig = {
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  };

  try {
    const oauthHandler = new GoogleOAuthHandler(oauthConfig);
    return new GoogleCalendarService(oauthHandler);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create GoogleCalendarService - OAuth not configured');
    return undefined;
  }
}

/**
 * Default factory that creates CalendarSourceManager with CalendarService and GoogleCalendarService
 */
export function createCalendarSourceManager(config: UserConfig): CalendarSourceManager {
  const calendarService = new CalendarService();
  const googleCalendarService = createGoogleCalendarServiceIfEnabled(config);

  return new CalendarSourceManager({
    calendarService,
    googleCalendarService,
    config,
  });
}

/**
 * Reloadable adapter for CalendarSourceManager
 */
export class CalendarSourceManagerAdapter implements ReloadableService {
  readonly name = 'CalendarSourceManager';
  readonly dependsOnSections: readonly string[] = ['integrations', 'calendar'];

  private instance: CalendarSourceManager | null = null;
  private factory: CalendarSourceManagerFactory;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: CalendarSourceManagerFactory | CalendarSourceManager) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createCalendarSourceManager;
    }
  }

  /**
   * Get the current CalendarSourceManager instance
   */
  getInstance(): CalendarSourceManager | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * CalendarSourceManager does not have explicit cleanup needs
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down CalendarSourceManager');
    // CalendarSourceManager has no explicit cleanup
    // Just clear the reference
    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing CalendarSourceManager with new config');

    try {
      this.instance = this.factory(config);
      logger.info('CalendarSourceManager reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize CalendarSourceManager');
      throw error;
    }
  }
}
