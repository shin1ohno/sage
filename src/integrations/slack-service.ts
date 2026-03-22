/**
 * Slack Service
 * Requirements: R1.3, R1.4, R5.1, R5.2, R5.4, R6.5
 *
 * Provides Slack API client wrapping @slack/web-api WebClient.
 * Lazy-initializes WebClient on first API call using stored tokens.
 */

import { WebClient } from '@slack/web-api';
import { retryWithBackoff } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';
import type { SlackOAuthHandler, SlackTokens } from '../oauth/slack-oauth-handler.js';

const logger = createLogger('slack');

/**
 * Slack message representation
 */
export interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  threadTs?: string;
  replyCount?: number;
  replies?: SlackMessage[];
}

/**
 * Slack channel representation
 */
export interface SlackChannel {
  id: string;
  name: string;
  purpose?: string;
  numMembers?: number;
}

/**
 * Slack user representation
 */
export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  email?: string;
}

/**
 * Options for channel history retrieval
 */
export interface ChannelHistoryOptions {
  limit: number;
  includeThreads: boolean;
}

/**
 * Block Kit block type (generic for sendDirectMessage)
 */
export type SlackBlock = Record<string, unknown>;

/**
 * Error thrown when Slack token is revoked or invalid
 */
export class SlackTokenRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackTokenRevokedError';
    Object.setPrototypeOf(this, SlackTokenRevokedError.prototype);
  }
}

/**
 * Slack Service Class
 *
 * Wraps @slack/web-api WebClient with retry logic and
 * lazy initialization from stored OAuth tokens.
 */
export class SlackService {
  private oauthHandler: SlackOAuthHandler;
  private client: WebClient | null = null;
  private tokens: SlackTokens | null = null;
  private connected: boolean = false;

  constructor(oauthHandler: SlackOAuthHandler) {
    this.oauthHandler = oauthHandler;
  }

  /**
   * Ensure WebClient is initialized with valid tokens
   */
  private async ensureClient(): Promise<WebClient> {
    if (this.client) {
      return this.client;
    }

    const tokens = await this.oauthHandler.getStoredTokens();
    if (!tokens) {
      this.connected = false;
      throw new Error('No Slack tokens found. Please authenticate with Slack first.');
    }

    this.tokens = tokens;
    this.client = new WebClient(tokens.accessToken);
    this.connected = true;
    return this.client;
  }

  /**
   * Check if a Slack API error indicates a revoked/invalid token
   */
  private isAuthError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data: { error?: string } }).data;
      return data.error === 'token_revoked' || data.error === 'invalid_auth';
    }
    if (error instanceof Error) {
      return error.message.includes('token_revoked') || error.message.includes('invalid_auth');
    }
    return false;
  }

  /**
   * Handle auth errors by marking as disconnected
   */
  private handleAuthError(error: unknown): never {
    this.connected = false;
    this.client = null;
    throw new SlackTokenRevokedError(
      `Slack token is invalid or revoked: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  /**
   * Send a direct message to the authenticated user using Block Kit
   *
   * @param blocks - Block Kit blocks to send
   */
  async sendDirectMessage(blocks: SlackBlock[]): Promise<void> {
    await retryWithBackoff(async () => {
      try {
        const client = await this.ensureClient();
        await client.chat.postMessage({
          channel: this.tokens!.authedUserId,
          blocks: blocks as Parameters<WebClient['chat']['postMessage']>[0] extends { blocks?: infer B } ? B : never,
          text: 'Sage notification',
        });
      } catch (error) {
        if (this.isAuthError(error)) {
          this.handleAuthError(error);
        }
        throw error;
      }
    }, { maxAttempts: 3, shouldRetry: (err) => !this.isAuthError(err) });
  }

  /**
   * Get channel message history
   *
   * @param channelId - Channel ID
   * @param oldest - Oldest message timestamp (unix ts as string)
   * @param options - History options
   * @returns Array of messages
   */
  async getChannelHistory(
    channelId: string,
    oldest: string,
    options: ChannelHistoryOptions
  ): Promise<SlackMessage[]> {
    const messages = await retryWithBackoff(async () => {
      try {
        const client = await this.ensureClient();
        const result = await client.conversations.history({
          channel: channelId,
          oldest,
          limit: options.limit,
        });

        return (result.messages || []).map((msg) => ({
          ts: msg.ts || '',
          user: msg.user,
          text: msg.text,
          threadTs: msg.thread_ts,
          replyCount: msg.reply_count,
        }));
      } catch (error) {
        if (this.isAuthError(error)) {
          this.handleAuthError(error);
        }
        throw error;
      }
    }, { maxAttempts: 3, shouldRetry: (err) => !this.isAuthError(err) }) as SlackMessage[];

    if (options.includeThreads) {
      for (const msg of messages) {
        if (msg.replyCount && msg.replyCount > 0 && msg.ts) {
          try {
            msg.replies = await this.getThreadReplies(channelId, msg.ts);
          } catch (error) {
            // Rate-limit adaptive: stop fetching threads on 429
            if (this.isRateLimitError(error)) {
              logger.warn({ channelId, threadTs: msg.ts }, 'Rate limited during thread fetch, stopping thread retrieval');
              break;
            }
            throw error;
          }
        }
      }
    }

    return messages;
  }

  /**
   * Get thread replies
   *
   * @param channelId - Channel ID
   * @param threadTs - Thread timestamp
   * @returns Array of reply messages
   */
  async getThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    return await retryWithBackoff(async () => {
      try {
        const client = await this.ensureClient();
        const result = await client.conversations.replies({
          channel: channelId,
          ts: threadTs,
        });

        return (result.messages || []).map((msg) => ({
          ts: msg.ts || '',
          user: msg.user,
          text: msg.text,
          threadTs: msg.thread_ts,
        }));
      } catch (error) {
        if (this.isAuthError(error)) {
          this.handleAuthError(error);
        }
        // Propagate rate limit errors for getChannelHistory to catch
        if (this.isRateLimitError(error)) {
          throw error;
        }
        throw error;
      }
    }, { maxAttempts: 3, shouldRetry: (err) => !this.isAuthError(err) && !this.isRateLimitError(err) });
  }

  /**
   * List channels the bot has joined
   *
   * @returns Array of channels
   */
  async listBotChannels(): Promise<SlackChannel[]> {
    return await retryWithBackoff(async () => {
      try {
        const client = await this.ensureClient();
        const result = await client.conversations.list({
          types: 'public_channel,private_channel',
        });

        return (result.channels || []).map((ch) => ({
          id: ch.id || '',
          name: ch.name || '',
          purpose: ch.purpose?.value,
          numMembers: ch.num_members,
        }));
      } catch (error) {
        if (this.isAuthError(error)) {
          this.handleAuthError(error);
        }
        throw error;
      }
    }, { maxAttempts: 3, shouldRetry: (err) => !this.isAuthError(err) });
  }

  /**
   * Look up a Slack user by email address
   *
   * @param email - Email address
   * @returns Slack user or null if not found
   */
  async lookupUser(email: string): Promise<SlackUser | null> {
    return await retryWithBackoff(async () => {
      try {
        const client = await this.ensureClient();
        const result = await client.users.lookupByEmail({ email });

        if (!result.user) {
          return null;
        }

        return {
          id: result.user.id || '',
          name: result.user.name || '',
          realName: result.user.real_name,
          email: result.user.profile?.email,
        };
      } catch (error) {
        if (this.isAuthError(error)) {
          this.handleAuthError(error);
        }
        // users_not_found is not an error — just means no match
        if (error && typeof error === 'object' && 'data' in error) {
          const data = (error as { data: { error?: string } }).data;
          if (data.error === 'users_not_found') {
            return null;
          }
        }
        throw error;
      }
    }, { maxAttempts: 3, shouldRetry: (err) => !this.isAuthError(err) });
  }

  /**
   * Check if the service is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if an error is a rate limit (429) error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data: { error?: string } }).data;
      return data.error === 'ratelimited';
    }
    if (error instanceof Error) {
      return error.message.includes('ratelimited') || error.message.includes('rate_limited');
    }
    return false;
  }
}
