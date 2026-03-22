/**
 * Slack OAuth Handler Tests
 * Requirements: R1.1, R1.2, R1.6
 */

import { SlackOAuthHandler, SLACK_OAUTH_SCOPES } from '../../src/oauth/slack-oauth-handler.js';

// Mock EncryptionService
const mockEncryptionService = {
  initialize: jest.fn().mockResolvedValue(undefined),
  encryptToFile: jest.fn().mockResolvedValue(undefined),
  decryptFromFile: jest.fn().mockResolvedValue(null),
  isInitialized: jest.fn().mockReturnValue(true),
};

jest.mock('../../src/oauth/encryption-service.js', () => ({
  EncryptionService: jest.fn().mockImplementation(() => mockEncryptionService),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SlackOAuthHandler', () => {
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/oauth/slack/callback',
  };

  let handler: SlackOAuthHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new SlackOAuthHandler(mockConfig, 'test-encryption-key');
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct Slack OAuth URL with required params', () => {
      const url = handler.getAuthorizationUrl('test-state-123');

      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain(`client_id=${mockConfig.clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(mockConfig.redirectUri)}`);
      expect(url).toContain('state=test-state-123');
      expect(url).toContain(`scope=${encodeURIComponent(SLACK_OAUTH_SCOPES)}`);
    });

    it('should NOT include PKCE parameters (code_challenge)', () => {
      const url = handler.getAuthorizationUrl('test-state');

      expect(url).not.toContain('code_challenge');
      expect(url).not.toContain('code_verifier');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should POST to correct Slack API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          access_token: 'xoxb-test-token',
          team: { id: 'T12345' },
          authed_user: { id: 'U12345' },
          bot_user_id: 'B12345',
          scope: 'chat:write,channels:history',
        }),
      });

      await handler.exchangeCodeForToken('test-code');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/oauth.v2.access',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      // Verify body contains required params
      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('code=test-code');
      expect(callBody).toContain(`client_id=${mockConfig.clientId}`);
      expect(callBody).toContain(`client_secret=${mockConfig.clientSecret}`);
    });

    it('should parse response into SlackTokens correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          access_token: 'xoxb-test-token',
          team: { id: 'T12345' },
          authed_user: { id: 'U12345' },
          bot_user_id: 'B12345',
          scope: 'chat:write,channels:history',
        }),
      });

      const tokens = await handler.exchangeCodeForToken('test-code');

      expect(tokens).toEqual({
        accessToken: 'xoxb-test-token',
        teamId: 'T12345',
        authedUserId: 'U12345',
        botUserId: 'B12345',
        scope: 'chat:write,channels:history',
      });
    });

    it('should throw error when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error: 'invalid_code',
        }),
      });

      await expect(handler.exchangeCodeForToken('bad-code'))
        .rejects.toThrow('Slack OAuth token exchange failed: invalid_code');
    });

    it('should throw error when HTTP request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(handler.exchangeCodeForToken('test-code'))
        .rejects.toThrow('Slack OAuth token exchange failed: HTTP 500');
    });
  });

  describe('getStoredTokens', () => {
    it('should return decrypted tokens', async () => {
      const storedTokens = {
        accessToken: 'xoxb-stored-token',
        teamId: 'T12345',
        authedUserId: 'U12345',
        botUserId: 'B12345',
        scope: 'chat:write',
      };

      mockEncryptionService.decryptFromFile.mockResolvedValueOnce(
        JSON.stringify(storedTokens)
      );

      const tokens = await handler.getStoredTokens();

      expect(tokens).toEqual(storedTokens);
      expect(mockEncryptionService.initialize).toHaveBeenCalled();
    });

    it('should return null when file does not exist', async () => {
      mockEncryptionService.decryptFromFile.mockResolvedValueOnce(null);

      const tokens = await handler.getStoredTokens();

      expect(tokens).toBeNull();
    });
  });

  describe('storeTokens', () => {
    it('should encrypt and store tokens', async () => {
      const tokens = {
        accessToken: 'xoxb-test-token',
        teamId: 'T12345',
        authedUserId: 'U12345',
        botUserId: 'B12345',
        scope: 'chat:write',
      };

      await handler.storeTokens(tokens);

      expect(mockEncryptionService.initialize).toHaveBeenCalled();
      expect(mockEncryptionService.encryptToFile).toHaveBeenCalledWith(
        JSON.stringify(tokens),
        expect.stringContaining('slack_tokens.enc')
      );
    });
  });

  describe('revokeToken', () => {
    it('should send revoke request to Slack API', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      // Mock fs/promises for file deletion
      jest.mock('fs/promises', () => ({
        unlink: jest.fn().mockResolvedValue(undefined),
      }));

      await handler.revokeToken('xoxb-test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/auth.revoke',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer xoxb-test-token',
          }),
        })
      );
    });
  });
});
