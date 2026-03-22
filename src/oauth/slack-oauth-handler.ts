/**
 * Slack OAuth Handler
 *
 * Manages OAuth authentication flow for Slack integration.
 */

export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export class SlackOAuthHandler {
  private config: SlackOAuthConfig;

  constructor(config: SlackOAuthConfig) {
    this.config = config;
  }

  getConfig(): SlackOAuthConfig {
    return this.config;
  }
}
