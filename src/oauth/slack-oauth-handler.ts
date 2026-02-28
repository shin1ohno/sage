/**
 * Slack OAuth Handler
 *
 * Handles OAuth 2.0 flow for Slack API integration.
 * Uses standard OAuth 2.0 (no PKCE) with encrypted token storage.
 */

import { EncryptionService } from './encryption-service.js';
import { join } from 'path';
import { homedir } from 'os';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('slack-oauth');

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_REVOKE_URL = 'https://slack.com/api/auth.revoke';

const SLACK_SCOPES = 'chat:write,channels:history,channels:read,groups:history,groups:read,im:write,users:read';

export interface SlackTokens {
  accessToken: string;
  teamId: string;
  authedUserId: string;
  botUserId: string;
  scope: string;
  expiresAt?: number;
}

export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class SlackOAuthHandler {
  private readonly config: SlackOAuthConfig;
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

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.encryptionService.initialize();
      this.initialized = true;
    }
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: SLACK_SCOPES,
      redirect_uri: this.config.redirectUri,
      state,
    });

    return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<SlackTokens> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
    });

    const response = await fetch(SLACK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await response.json() as {
      ok: boolean;
      error?: string;
      access_token?: string;
      team?: { id?: string };
      authed_user?: { id?: string };
      bot_user_id?: string;
      scope?: string;
    };

    if (!data.ok) {
      throw new Error(`Slack token exchange failed: ${data.error || 'Unknown error'}`);
    }

    if (!data.access_token) {
      throw new Error('Slack token exchange failed: no access_token in response');
    }

    if (!data.team?.id) {
      throw new Error('Slack token exchange failed: no team.id in response');
    }

    if (!data.authed_user?.id) {
      throw new Error('Slack token exchange failed: no authed_user.id in response');
    }

    if (!data.bot_user_id) {
      throw new Error('Slack token exchange failed: no bot_user_id in response');
    }

    if (!data.scope) {
      throw new Error('Slack token exchange failed: no scope in response');
    }

    const tokens: SlackTokens = {
      accessToken: data.access_token,
      teamId: data.team.id,
      authedUserId: data.authed_user.id,
      botUserId: data.bot_user_id,
      scope: data.scope,
    };

    logger.info({ teamId: tokens.teamId }, 'Slack token exchange successful');
    return tokens;
  }

  async getStoredTokens(): Promise<SlackTokens | null> {
    try {
      await this.ensureInitialized();

      const tokensJson = await this.encryptionService.decryptFromFile(this.tokensStoragePath);
      if (tokensJson === null) {
        return null;
      }

      return JSON.parse(tokensJson) as SlackTokens;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get stored Slack tokens');
      throw new Error(
        `Failed to get Slack tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async storeTokens(tokens: SlackTokens): Promise<void> {
    try {
      await this.ensureInitialized();

      const tokensJson = JSON.stringify(tokens);
      await this.encryptionService.encryptToFile(tokensJson, this.tokensStoragePath);

      logger.info('Slack tokens stored successfully');
    } catch (error) {
      throw new Error(
        `Failed to store Slack tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch(SLACK_REVOKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        logger.warn({ error: data.error }, 'Slack token revocation returned error');
      }

      // Delete local token file
      const fs = await import('fs/promises');
      try {
        await fs.unlink(this.tokensStoragePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      logger.info('Slack token revoked and local tokens deleted');
    } catch (error) {
      throw new Error(
        `Failed to revoke Slack token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
