/**
 * Slack Service
 *
 * Handles Slack messaging integration for pipeline notifications.
 * Depends on SlackOAuthHandler for authentication.
 */

import type { SlackOAuthHandler } from '../oauth/slack-oauth-handler.js';

export class SlackService {
  private oauthHandler: SlackOAuthHandler;

  constructor(oauthHandler: SlackOAuthHandler) {
    this.oauthHandler = oauthHandler;
  }

  getOAuthHandler(): SlackOAuthHandler {
    return this.oauthHandler;
  }
}
