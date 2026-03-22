/**
 * Slack Service Tests
 * Requirements: R1.3, R1.4, R5.1, R5.2, R5.4, R6.5
 */

import { SlackService, SlackTokenRevokedError } from '../../src/integrations/slack-service.js';
import type { SlackOAuthHandler, SlackTokens } from '../../src/oauth/slack-oauth-handler.js';

// Mock @slack/web-api
const mockPostMessage = jest.fn();
const mockConversationsHistory = jest.fn();
const mockConversationsReplies = jest.fn();
const mockConversationsList = jest.fn();
const mockUsersLookupByEmail = jest.fn();

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
    conversations: {
      history: mockConversationsHistory,
      replies: mockConversationsReplies,
      list: mockConversationsList,
    },
    users: { lookupByEmail: mockUsersLookupByEmail },
  })),
}));

// Mock retry - pass through immediately
jest.mock('../../src/utils/retry.js', () => ({
  retryWithBackoff: jest.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
}));

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('SlackService', () => {
  const mockTokens: SlackTokens = {
    accessToken: 'xoxb-test-token',
    teamId: 'T12345',
    authedUserId: 'U12345',
    botUserId: 'B12345',
    scope: 'chat:write,channels:history',
  };

  const mockOAuthHandler = {
    getStoredTokens: jest.fn().mockResolvedValue(mockTokens),
  } as unknown as SlackOAuthHandler;

  let service: SlackService;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockOAuthHandler.getStoredTokens as jest.Mock).mockResolvedValue(mockTokens);
    service = new SlackService(mockOAuthHandler);
  });

  describe('sendDirectMessage', () => {
    it('should call chat.postMessage with correct params', async () => {
      mockPostMessage.mockResolvedValueOnce({ ok: true });

      const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }];
      await service.sendDirectMessage(blocks);

      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: 'U12345',
        blocks,
        text: 'Sage notification',
      });
    });
  });

  describe('getChannelHistory', () => {
    it('should call conversations.history', async () => {
      mockConversationsHistory.mockResolvedValueOnce({
        messages: [
          { ts: '1234.5678', user: 'U1', text: 'hello', reply_count: 0 },
        ],
      });

      const messages = await service.getChannelHistory('C123', '1000.0000', {
        limit: 10,
        includeThreads: false,
      });

      expect(mockConversationsHistory).toHaveBeenCalledWith({
        channel: 'C123',
        oldest: '1000.0000',
        limit: 10,
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].ts).toBe('1234.5678');
    });

    it('should fetch thread replies when includeThreads is true', async () => {
      mockConversationsHistory.mockResolvedValueOnce({
        messages: [
          { ts: '1234.5678', user: 'U1', text: 'hello', reply_count: 2, thread_ts: '1234.5678' },
        ],
      });

      mockConversationsReplies.mockResolvedValueOnce({
        messages: [
          { ts: '1234.5679', user: 'U2', text: 'reply1', thread_ts: '1234.5678' },
          { ts: '1234.5680', user: 'U3', text: 'reply2', thread_ts: '1234.5678' },
        ],
      });

      const messages = await service.getChannelHistory('C123', '1000.0000', {
        limit: 10,
        includeThreads: true,
      });

      expect(messages[0].replies).toHaveLength(2);
    });

    it('should stop thread fetching on 429 rate limit error', async () => {
      mockConversationsHistory.mockResolvedValueOnce({
        messages: [
          { ts: '1234.5678', user: 'U1', text: 'msg1', reply_count: 1 },
          { ts: '1234.5679', user: 'U2', text: 'msg2', reply_count: 1 },
        ],
      });

      // First thread fetch succeeds
      mockConversationsReplies.mockResolvedValueOnce({
        messages: [{ ts: '1234.5680', user: 'U3', text: 'reply' }],
      });

      // Use retryWithBackoff mock that propagates
      const { retryWithBackoff } = await import('../../src/utils/retry.js');
      // For the second getThreadReplies call, simulate rate limit
      (retryWithBackoff as jest.Mock).mockImplementationOnce(async (fn: () => Promise<unknown>) => fn())  // getChannelHistory
        .mockImplementationOnce(async (fn: () => Promise<unknown>) => fn())  // first getThreadReplies
        .mockImplementationOnce(async () => {
          const err = new Error('ratelimited');
          (err as unknown as { data: { error: string } }).data = { error: 'ratelimited' };
          throw err;
        }); // second getThreadReplies

      // Recreate service to pick up new mock
      service = new SlackService(mockOAuthHandler);

      const messages = await service.getChannelHistory('C123', '1000.0000', {
        limit: 10,
        includeThreads: true,
      });

      // First message should have replies, second should not
      expect(messages).toHaveLength(2);
      expect(messages[0].replies).toHaveLength(1);
      expect(messages[1].replies).toBeUndefined();
    });
  });

  describe('getThreadReplies', () => {
    it('should call conversations.replies', async () => {
      mockConversationsReplies.mockResolvedValueOnce({
        messages: [
          { ts: '1234.5679', user: 'U2', text: 'reply', thread_ts: '1234.5678' },
        ],
      });

      const replies = await service.getThreadReplies('C123', '1234.5678');

      expect(mockConversationsReplies).toHaveBeenCalledWith({
        channel: 'C123',
        ts: '1234.5678',
      });
      expect(replies).toHaveLength(1);
    });
  });

  describe('listBotChannels', () => {
    it('should call conversations.list with correct types', async () => {
      mockConversationsList.mockResolvedValueOnce({
        channels: [
          { id: 'C123', name: 'general', purpose: { value: 'General chat' }, num_members: 50 },
        ],
      });

      const channels = await service.listBotChannels();

      expect(mockConversationsList).toHaveBeenCalledWith({
        types: 'public_channel,private_channel',
      });
      expect(channels).toHaveLength(1);
      expect(channels[0]).toEqual({
        id: 'C123',
        name: 'general',
        purpose: 'General chat',
        numMembers: 50,
      });
    });
  });

  describe('lookupUser', () => {
    it('should call users.lookupByEmail', async () => {
      mockUsersLookupByEmail.mockResolvedValueOnce({
        user: {
          id: 'U123',
          name: 'testuser',
          real_name: 'Test User',
          profile: { email: 'test@example.com' },
        },
      });

      const user = await service.lookupUser('test@example.com');

      expect(mockUsersLookupByEmail).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(user).toEqual({
        id: 'U123',
        name: 'testuser',
        realName: 'Test User',
        email: 'test@example.com',
      });
    });

    it('should return null when user is not found', async () => {
      const err = new Error('users_not_found');
      (err as unknown as { data: { error: string } }).data = { error: 'users_not_found' };
      mockUsersLookupByEmail.mockRejectedValueOnce(err);

      const user = await service.lookupUser('notfound@example.com');

      expect(user).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return true after successful API call', async () => {
      mockPostMessage.mockResolvedValueOnce({ ok: true });

      await service.sendDirectMessage([]);

      expect(service.isConnected()).toBe(true);
    });
  });

  describe('auth error handling', () => {
    it('should set connected to false on token_revoked error', async () => {
      // First call to init the client
      mockPostMessage.mockResolvedValueOnce({ ok: true });
      await service.sendDirectMessage([]);
      expect(service.isConnected()).toBe(true);

      // Second call with auth error
      const authErr = new Error('token_revoked');
      (authErr as unknown as { data: { error: string } }).data = { error: 'token_revoked' };
      mockPostMessage.mockRejectedValueOnce(authErr);

      await expect(service.sendDirectMessage([])).rejects.toThrow(SlackTokenRevokedError);
      expect(service.isConnected()).toBe(false);
    });
  });
});
