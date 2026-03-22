/**
 * Slack OAuth Handler
 * Requirements: R1.1, R1.2, R1.6
 *
 * Handles OAuth 2.0 flow for Slack API integration.
 * Unlike Google OAuth, Slack does not use PKCE.
 */

import { EncryptionService } from '../google-oauth/encryption-service.js';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Slack OAuth Tokens
 */
export interface SlackTokens {
  accessToken: string;
  teamId: string;
  authedUserId: string;
  botUserId: string;
  scope: string;
  expiresAt?: number;
}

/**
 * Slack OAuth Configuration
 */
export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Required Slack OAuth scopes
 */
export const SLACK_OAUTH_SCOPES =
  'chat:write,channels:history,channels:read,groups:history,groups:read,im:write,users:read';

/**
 * Slack OAuth Handler Class
 *
 * Manages OAuth 2.0 authentication flow with Slack API.
 * No PKCE — Slack does not support it.
 */
export class SlackOAuthHandler {
  private config: SlackOAuthConfig;
  private readonly encryptionService: EncryptionService;
  private readonly tokensStoragePath: string;
  private initialized: boolean = false;

  constructor(config: SlackOAuthConfig, encryptionKey?: string) {
    this.config = config;
    this.encryptionService = new EncryptionService({
      encryptionKey: encryptionKey || process.env.SAGE_ENCRYPTION_KEY,
    });
    const sageDir = join(homedir(), '.sage');
    this.tokensStoragePath = join(sageDir, 'slack_tokens.enc');
  }

  /**
   * Initialize encryption service
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.encryptionService.initialize();
      this.initialized = true;
    }
  }

  /**
   * Generate Slack authorization URL
   *
   * @param state - CSRF protection state parameter
   * @returns Authorization URL for user to visit
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: SLACK_OAUTH_SCOPES,
      redirect_uri: this.config.redirectUri,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   *
   * @param code - Authorization code from OAuth callback
   * @returns Slack OAuth tokens
   * @throws Error if token exchange fails
   */
  async exchangeCodeForToken(code: string): Promise<SlackTokens> {
    const body = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    });

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Slack OAuth token exchange failed: HTTP ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;

    if (!data.ok) {
      throw new Error(`Slack OAuth token exchange failed: ${data.error as string}`);
    }

    const team = data.team as { id: string };
    const authedUser = data.authed_user as { id: string };

    return {
      accessToken: data.access_token as string,
      teamId: team.id,
      authedUserId: authedUser.id,
      botUserId: (data.bot_user_id as string) || '',
      scope: data.scope as string,
    };
  }

  /**
   * Get stored tokens with decryption
   *
   * @returns Slack OAuth tokens or null if not found
   */
  async getStoredTokens(): Promise<SlackTokens | null> {
    try {
      await this.ensureInitialized();

      const tokensJson = await this.encryptionService.decryptFromFile(this.tokensStoragePath);

      if (tokensJson === null) {
        return null;
      }

      return JSON.parse(tokensJson) as SlackTokens;
    } catch (error) {
      throw new Error(
        `Failed to get Slack tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Store tokens securely with encryption
   *
   * @param tokens - Slack OAuth tokens to store
   */
  async storeTokens(tokens: SlackTokens): Promise<void> {
    try {
      await this.ensureInitialized();

      const tokensJson = JSON.stringify(tokens);
      await this.encryptionService.encryptToFile(tokensJson, this.tokensStoragePath);
    } catch (error) {
      throw new Error(
        `Failed to store Slack tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Revoke token and clear local storage
   *
   * @param token - Access token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch('https://slack.com/api/auth.revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Slack token revocation failed: HTTP ${response.status}`);
      }

      // Clear local file
      const fs = await import('fs/promises');
      try {
        await fs.unlink(this.tokensStoragePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to revoke Slack token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
