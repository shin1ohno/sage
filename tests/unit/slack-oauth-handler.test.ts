/**
 * Slack OAuth Handler Tests
 *
 * Tests for the SlackOAuthHandler implementation.
 * Verifies OAuth 2.0 flow (no PKCE) with encrypted token storage.
 */

import { SlackOAuthHandler } from '../../src/oauth/slack-oauth-handler.js';
import type { SlackTokens, SlackOAuthConfig } from '../../src/oauth/slack-oauth-handler.js';

jest.mock('../../src/oauth/encryption-service.js', () => ({
  EncryptionService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    encryptToFile: jest.fn().mockResolvedValue(undefined),
    decryptFromFile: jest.fn().mockResolvedValue(null),
  })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SlackOAuthHandler', () => {
  const testConfig: SlackOAuthConfig = {
    clientId: 'test-id',
    clientSecret: 'test-secret',
    redirectUri: 'http://localhost:54321/oauth/slack/callback',
  };

  let handler: SlackOAuthHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new SlackOAuthHandler(testConfig);
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct Slack OAuth URL with client_id, scope, redirect_uri, state', () => {
      const state = 'random-state-value';
      const url = handler.getAuthorizationUrl(state);

      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe('https://slack.com/oauth/v2/authorize');
      expect(parsed.searchParams.get('client_id')).toBe('test-id');
      expect(parsed.searchParams.get('scope')).toBe(
        'chat:write,channels:history,channels:read,users:read',
      );
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'http://localhost:54321/oauth/slack/callback',
      );
      expect(parsed.searchParams.get('state')).toBe('random-state-value');
    });

    it('should NOT include code_challenge (no PKCE)', () => {
      const url = handler.getAuthorizationUrl('state');
      const parsed = new URL(url);

      expect(parsed.searchParams.has('code_challenge')).toBe(false);
      expect(parsed.searchParams.has('code_challenge_method')).toBe(false);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should POST to correct Slack API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({
          ok: true,
          access_token: 'xoxb-token',
          team: { id: 'T123' },
          authed_user: { id: 'U123' },
          bot_user_id: 'B123',
          scope: 'chat:write',
        }),
      });

      await handler.exchangeCodeForToken('auth-code');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/oauth.v2.access',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
    });

    it('should parse SlackTokens from response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({
          ok: true,
          access_token: 'xoxb-slack-token',
          team: { id: 'T-TEAM' },
          authed_user: { id: 'U-USER' },
          bot_user_id: 'B-BOT',
          scope: 'chat:write,channels:read',
        }),
      });

      const tokens = await handler.exchangeCodeForToken('auth-code');

      expect(tokens).toEqual({
        accessToken: 'xoxb-slack-token',
        teamId: 'T-TEAM',
        authedUserId: 'U-USER',
        botUserId: 'B-BOT',
        scope: 'chat:write,channels:read',
      });
    });

    it('should throw Error on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({
          ok: false,
          error: 'invalid_code',
        }),
      });

      await expect(handler.exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Slack token exchange failed: invalid_code',
      );
    });
  });

  describe('getStoredTokens', () => {
    it('should return null when no file exists', async () => {
      const result = await handler.getStoredTokens();
      expect(result).toBeNull();
    });

    it('should return parsed tokens when file exists', async () => {
      const storedTokens: SlackTokens = {
        accessToken: 'xoxb-stored',
        teamId: 'T-STORED',
        authedUserId: 'U-STORED',
        botUserId: 'B-STORED',
        scope: 'chat:write',
      };

      // Override decryptFromFile to return serialized tokens
      const { EncryptionService } = require('../../src/oauth/encryption-service.js');
      const mockInstance = EncryptionService.mock.results[0]?.value;
      if (mockInstance) {
        mockInstance.decryptFromFile.mockResolvedValueOnce(JSON.stringify(storedTokens));
      }

      // Create a new handler so it picks up the fresh mock behavior
      const freshHandler = new SlackOAuthHandler(testConfig);
      const freshMockInstance =
        EncryptionService.mock.results[EncryptionService.mock.results.length - 1].value;
      freshMockInstance.decryptFromFile.mockResolvedValueOnce(JSON.stringify(storedTokens));

      const result = await freshHandler.getStoredTokens();

      expect(result).toEqual(storedTokens);
    });
  });

  describe('storeTokens', () => {
    it('should call encryptToFile with serialized tokens', async () => {
      const tokens: SlackTokens = {
        accessToken: 'xoxb-new',
        teamId: 'T-NEW',
        authedUserId: 'U-NEW',
        botUserId: 'B-NEW',
        scope: 'chat:write',
      };

      await handler.storeTokens(tokens);

      const { EncryptionService } = require('../../src/oauth/encryption-service.js');
      const mockInstance =
        EncryptionService.mock.results[EncryptionService.mock.results.length - 1].value;

      expect(mockInstance.encryptToFile).toHaveBeenCalledWith(
        JSON.stringify(tokens),
        expect.stringContaining('slack_tokens.enc'),
      );
    });
  });

  describe('revokeToken', () => {
    it('should POST to Slack revoke API', async () => {
      mockFetch.mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({ ok: true }),
      });

      // Mock dynamic import of fs/promises for unlink
      jest.unstable_mockModule('fs/promises', () => ({
        unlink: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      }));

      await handler.revokeToken('xoxb-revoke-me');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/auth.revoke',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer xoxb-revoke-me',
          }),
        }),
      );
    });
  });
});
