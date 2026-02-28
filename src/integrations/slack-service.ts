/**
 * Slack Service
 *
 * Provides Slack API integration for messaging, channel history,
 * and user lookup via the @slack/web-api WebClient.
 */

import { WebClient } from '@slack/web-api';
import type { Block } from '@slack/types';
import type { SlackOAuthHandler, SlackTokens } from '../oauth/slack-oauth-handler.js';
import type { SlackBlock } from '../utils/slack-blocks.js';
import { retryWithBackoff } from '../utils/retry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('slack');

export interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  threadTs?: string;
  replyCount?: number;
  replies?: SlackMessage[];
}

export interface SlackChannel {
  id: string;
  name: string;
  purpose?: string;
  numMembers?: number;
}

export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  email?: string;
}

export interface ChannelHistoryOptions {
  limit: number;
  includeThreads: boolean;
}

export class SlackTokenRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackTokenRevokedError';
  }
}

export class SlackService {
  private readonly oauthHandler: SlackOAuthHandler;
  private client: WebClient | null = null;
  private tokens: SlackTokens | null = null;

  constructor(oauthHandler: SlackOAuthHandler) {
    this.oauthHandler = oauthHandler;
  }

  private async ensureClient(): Promise<WebClient> {
    if (this.client) {
      return this.client;
    }

    const tokens = await this.oauthHandler.getStoredTokens();
    if (!tokens) {
      throw new Error('No Slack tokens found. Please authenticate with Slack first.');
    }

    this.tokens = tokens;
    this.client = new WebClient(tokens.accessToken);

    return this.client;
  }

  /**
   * Detect token revocation from Slack API errors
   */
  private handleApiError(error: unknown): never {
    const errorStr = String(error);
    if (
      errorStr.includes('token_revoked') ||
      errorStr.includes('invalid_auth') ||
      errorStr.includes('account_inactive')
    ) {
      this.client = null;
      throw new SlackTokenRevokedError(`Slack token revoked: ${errorStr}`);
    }
    throw error;
  }

  async sendDirectMessage(blocks: SlackBlock[]): Promise<void> {
    const client = await this.ensureClient();
    const channel = this.tokens!.authedUserId;

    await retryWithBackoff(
      async () => {
        try {
          await client.chat.postMessage({
            channel,
            blocks: blocks as Block[],
            text: '',
          });
        } catch (error) {
          this.handleApiError(error);
        }
      },
      { maxAttempts: 3, initialDelay: 1000 }
    );

    logger.debug({ channel }, 'Direct message sent');
  }

  async getChannelHistory(
    channelId: string,
    oldest: string,
    options: ChannelHistoryOptions,
  ): Promise<SlackMessage[]> {
    const client = await this.ensureClient();

    const result = await retryWithBackoff(
      async () => {
        try {
          return await client.conversations.history({
            channel: channelId,
            oldest,
            limit: options.limit,
          });
        } catch (error) {
          this.handleApiError(error);
        }
      },
      { maxAttempts: 3, initialDelay: 1000 }
    );

    const messages: SlackMessage[] = (result.messages || [])
      .filter((msg): msg is typeof msg & { ts: string } => Boolean(msg.ts))
      .map((msg) => ({
        ts: msg.ts,
        user: msg.user,
        text: msg.text,
        threadTs: msg.thread_ts,
        replyCount: msg.reply_count,
      }));

    if (options.includeThreads) {
      for (const msg of messages) {
        if (msg.replyCount && msg.replyCount > 0 && msg.ts) {
          try {
            msg.replies = await this.getThreadReplies(channelId, msg.ts);
          } catch (error) {
            // On 429 rate limit, stop fetching remaining threads
            if (String(error).includes('ratelimited') || String(error).includes('429')) {
              logger.warn({ channelId, ts: msg.ts }, 'Rate limited fetching thread replies, stopping');
              break;
            }
            throw error;
          }
        }
      }
    }

    return messages;
  }

  async getThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    const client = await this.ensureClient();

    const result = await retryWithBackoff(
      async () => {
        try {
          return await client.conversations.replies({
            channel: channelId,
            ts: threadTs,
          });
        } catch (error) {
          this.handleApiError(error);
        }
      },
      { maxAttempts: 3, initialDelay: 1000 }
    );

    return (result.messages || [])
      .filter((msg): msg is typeof msg & { ts: string } => Boolean(msg.ts))
      .map((msg) => ({
        ts: msg.ts,
        user: msg.user,
        text: msg.text,
        threadTs: msg.thread_ts,
      }));
  }

  async listBotChannels(): Promise<SlackChannel[]> {
    const client = await this.ensureClient();

    const result = await retryWithBackoff(
      async () => {
        try {
          return await client.conversations.list({
            types: 'public_channel,private_channel',
          });
        } catch (error) {
          this.handleApiError(error);
        }
      },
      { maxAttempts: 3, initialDelay: 1000 }
    );

    return (result.channels || [])
      .filter((ch): ch is typeof ch & { id: string; name: string } => Boolean(ch.id && ch.name))
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        purpose: ch.purpose?.value,
        numMembers: ch.num_members,
      }));
  }

  async lookupUser(email: string): Promise<SlackUser | null> {
    const client = await this.ensureClient();

    try {
      const result = await retryWithBackoff(
        async () => {
          try {
            return await client.users.lookupByEmail({ email });
          } catch (error) {
            this.handleApiError(error);
          }
        },
        { maxAttempts: 3, initialDelay: 1000 }
      );

      if (!result.user) {
        return null;
      }

      if (!result.user.id || !result.user.name) {
        return null;
      }

      return {
        id: result.user.id,
        name: result.user.name,
        realName: result.user.real_name,
        email: result.user.profile?.email,
      };
    } catch (error) {
      // users_not_found is expected for non-existent users
      if (String(error).includes('users_not_found')) {
        return null;
      }
      throw error;
    }
  }

}
