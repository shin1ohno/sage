/**
 * Slack Service Tests
 *
 * Tests for SlackService: lazy initialization, token revocation detection,
 * rate limit handling, and user lookup behavior.
 */

const mockChatPostMessage = jest.fn();
const mockConversationsHistory = jest.fn();
const mockConversationsReplies = jest.fn();
const mockConversationsList = jest.fn();
const mockUsersLookupByEmail = jest.fn();

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockChatPostMessage },
    conversations: {
      history: mockConversationsHistory,
      replies: mockConversationsReplies,
      list: mockConversationsList,
    },
    users: { lookupByEmail: mockUsersLookupByEmail },
  })),
}));

jest.mock('../../src/utils/retry.js', () => ({
  retryWithBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

import { SlackService, SlackTokenRevokedError } from '../../src/integrations/slack-service.js';

const mockOAuthHandler = {
  getStoredTokens: jest.fn(),
};

describe('SlackService', () => {
  let service: SlackService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOAuthHandler.getStoredTokens.mockResolvedValue({
      accessToken: 'xoxb-test-token',
      teamId: 'T001',
      authedUserId: 'U001',
      botUserId: 'B001',
      scope: 'chat:write,channels:history',
    });
    service = new SlackService(mockOAuthHandler as never);
  });

  describe('ensureClient (lazy initialization)', () => {
    it('should initialize client on first API call', async () => {
      mockChatPostMessage.mockResolvedValue({ ok: true });

      await service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'test' } }]);

      expect(mockOAuthHandler.getStoredTokens).toHaveBeenCalledTimes(1);
      expect(mockChatPostMessage).toHaveBeenCalled();
    });

    it('should throw when no tokens are stored', async () => {
      mockOAuthHandler.getStoredTokens.mockResolvedValue(null);

      await expect(
        service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'test' } }]),
      ).rejects.toThrow('No Slack tokens found');
    });

    it('should reuse client on subsequent calls', async () => {
      mockChatPostMessage.mockResolvedValue({ ok: true });

      await service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'first' } }]);
      await service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'second' } }]);

      // getStoredTokens should only be called once (client cached)
      expect(mockOAuthHandler.getStoredTokens).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleApiError (token revocation detection)', () => {
    it('should throw SlackTokenRevokedError on token_revoked', async () => {
      mockChatPostMessage.mockRejectedValue(new Error('token_revoked'));

      await expect(
        service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'test' } }]),
      ).rejects.toThrow(SlackTokenRevokedError);
    });

    it('should throw SlackTokenRevokedError on invalid_auth', async () => {
      mockChatPostMessage.mockRejectedValue(new Error('invalid_auth'));

      await expect(
        service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'test' } }]),
      ).rejects.toThrow(SlackTokenRevokedError);
    });

    it('should throw SlackTokenRevokedError on account_inactive', async () => {
      mockChatPostMessage.mockRejectedValue(new Error('account_inactive'));

      await expect(
        service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'test' } }]),
      ).rejects.toThrow(SlackTokenRevokedError);
    });

    it('should re-throw non-revocation errors as-is', async () => {
      const originalError = new Error('network_error');
      mockChatPostMessage.mockRejectedValue(originalError);

      await expect(
        service.sendDirectMessage([{ type: 'section', text: { type: 'mrkdwn', text: 'test' } }]),
      ).rejects.toThrow('network_error');
    });
  });

  describe('getChannelHistory', () => {
    it('should return messages from channel history', async () => {
      mockConversationsHistory.mockResolvedValue({
        messages: [
          { ts: '1234567890.123456', user: 'U001', text: 'Hello' },
          { ts: '1234567890.654321', user: 'U002', text: 'World' },
        ],
      });

      const messages = await service.getChannelHistory('C001', '1234567890', {
        limit: 10,
        includeThreads: false,
      });

      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('Hello');
    });

    it('should stop fetching thread replies on 429 rate limit', async () => {
      mockConversationsHistory.mockResolvedValue({
        messages: [
          { ts: '1', user: 'U001', text: 'Thread 1', reply_count: 2 },
          { ts: '2', user: 'U002', text: 'Thread 2', reply_count: 3 },
        ],
      });

      mockConversationsReplies
        .mockRejectedValueOnce(new Error('ratelimited'));

      const messages = await service.getChannelHistory('C001', '0', {
        limit: 10,
        includeThreads: true,
      });

      // First thread hit rate limit, second thread should not be fetched
      expect(messages).toHaveLength(2);
      expect(mockConversationsReplies).toHaveBeenCalledTimes(1);
    });
  });

  describe('lookupUser', () => {
    it('should return user on successful lookup', async () => {
      mockUsersLookupByEmail.mockResolvedValue({
        user: {
          id: 'U001',
          name: 'testuser',
          real_name: 'Test User',
          profile: { email: 'test@example.com' },
        },
      });

      const user = await service.lookupUser('test@example.com');

      expect(user).toEqual({
        id: 'U001',
        name: 'testuser',
        realName: 'Test User',
        email: 'test@example.com',
      });
    });

    it('should return null on users_not_found error', async () => {
      mockUsersLookupByEmail.mockRejectedValue(new Error('users_not_found'));

      const user = await service.lookupUser('nonexistent@example.com');

      expect(user).toBeNull();
    });

    it('should return null when user has no id', async () => {
      mockUsersLookupByEmail.mockResolvedValue({
        user: { name: 'noIdUser' },
      });

      const user = await service.lookupUser('test@example.com');

      expect(user).toBeNull();
    });

    it('should return null when result has no user', async () => {
      mockUsersLookupByEmail.mockResolvedValue({});

      const user = await service.lookupUser('test@example.com');

      expect(user).toBeNull();
    });
  });

  describe('listBotChannels', () => {
    it('should return filtered channel list', async () => {
      mockConversationsList.mockResolvedValue({
        channels: [
          { id: 'C001', name: 'general', purpose: { value: 'General chat' }, num_members: 50 },
          { id: 'C002', name: 'random' },
          { name: 'no-id-channel' }, // should be filtered out
        ],
      });

      const channels = await service.listBotChannels();

      expect(channels).toHaveLength(2);
      expect(channels[0].id).toBe('C001');
      expect(channels[0].purpose).toBe('General chat');
    });
  });
});
