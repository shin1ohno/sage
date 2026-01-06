/**
 * authenticate_google Tool Handler Tests
 * Requirements: FR-1 (authenticate_google MCP Tool)
 */

import { handleAuthenticateGoogle } from '../../../../src/tools/oauth/authenticate-google.js';
import { OAuthCallbackServer } from '../../../../src/oauth/oauth-callback-server.js';
import { GoogleOAuthHandler } from '../../../../src/oauth/google-oauth-handler.js';
import { PendingGoogleAuthStore } from '../../../../src/oauth/pending-google-auth-store.js';
import * as browserOpener from '../../../../src/utils/browser-opener.js';

// Mock dependencies
jest.mock('../../../../src/oauth/oauth-callback-server.js');
jest.mock('../../../../src/oauth/google-oauth-handler.js');
jest.mock('../../../../src/oauth/pending-google-auth-store.js');
jest.mock('../../../../src/utils/browser-opener.js');
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth?remote=true'),
      })),
    },
  },
}));

const MockOAuthCallbackServer = OAuthCallbackServer as jest.MockedClass<typeof OAuthCallbackServer>;
const MockGoogleOAuthHandler = GoogleOAuthHandler as jest.MockedClass<typeof GoogleOAuthHandler>;
const MockPendingGoogleAuthStore = PendingGoogleAuthStore as jest.MockedClass<typeof PendingGoogleAuthStore>;
const mockOpenBrowser = browserOpener.openBrowser as jest.MockedFunction<
  typeof browserOpener.openBrowser
>;

describe('handleAuthenticateGoogle', () => {
  const mockContext = {
    getGoogleOAuthHandler: jest.fn(),
    createGoogleOAuthHandler: jest.fn(),
  };

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variable Checks', () => {
    it('should return error when GOOGLE_CLIENT_ID is not set', async () => {
      delete process.env.GOOGLE_CLIENT_ID;

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Google OAuth設定が見つかりません');
      expect(result.error).toContain('GOOGLE_CLIENT_ID');
    });

    it('should return error when GOOGLE_CLIENT_SECRET is not set', async () => {
      delete process.env.GOOGLE_CLIENT_SECRET;

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Google OAuth設定が見つかりません');
      expect(result.error).toContain('GOOGLE_CLIENT_SECRET');
    });
  });

  describe('Existing Tokens Check', () => {
    it('should return early if valid tokens exist', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000, // 1 hour from now
        scope: ['calendar'],
      };

      MockGoogleOAuthHandler.prototype.getTokens = jest.fn().mockResolvedValue(mockTokens);
      MockGoogleOAuthHandler.prototype.validateToken = jest.fn().mockResolvedValue(true);

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(true);
      expect(result.alreadyAuthenticated).toBe(true);
      expect(result.message).toContain('既に');
    });

    it('should re-authenticate when force=true', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: ['calendar'],
      };

      MockGoogleOAuthHandler.prototype.getTokens = jest.fn().mockResolvedValue(mockTokens);
      MockGoogleOAuthHandler.prototype.validateToken = jest.fn().mockResolvedValue(true);
      MockGoogleOAuthHandler.prototype.getAuthorizationUrl = jest
        .fn()
        .mockResolvedValue('https://auth.url');

      MockOAuthCallbackServer.prototype.start = jest.fn().mockResolvedValue({
        port: 3000,
        callbackUrl: 'http://127.0.0.1:3000/oauth/callback',
      });
      MockOAuthCallbackServer.prototype.waitForCallback = jest.fn().mockResolvedValue({
        success: true,
        code: 'test-code',
      });
      MockOAuthCallbackServer.prototype.shutdown = jest.fn().mockResolvedValue(undefined);

      MockGoogleOAuthHandler.prototype.exchangeCodeForTokens = jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: ['calendar'],
      });
      MockGoogleOAuthHandler.prototype.storeTokens = jest.fn().mockResolvedValue(undefined);

      mockOpenBrowser.mockResolvedValue({ success: true });

      const result = await handleAuthenticateGoogle({ force: true, timeout: 300 }, mockContext);

      expect(result.success).toBe(true);
      expect(result.alreadyAuthenticated).toBeUndefined();
    });

    it('should refresh expired tokens', async () => {
      const expiredTokens = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000, // Expired
        scope: ['calendar'],
      };

      const refreshedTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: ['calendar'],
      };

      MockGoogleOAuthHandler.prototype.getTokens = jest.fn().mockResolvedValue(expiredTokens);
      MockGoogleOAuthHandler.prototype.validateToken = jest.fn().mockResolvedValue(false);
      MockGoogleOAuthHandler.prototype.refreshAccessToken = jest
        .fn()
        .mockResolvedValue(refreshedTokens);
      MockGoogleOAuthHandler.prototype.storeTokens = jest.fn().mockResolvedValue(undefined);

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(true);
      expect(result.alreadyAuthenticated).toBe(true);
      expect(result.message).toContain('トークンを更新しました');
    });
  });

  describe('Full OAuth Flow', () => {
    beforeEach(() => {
      MockGoogleOAuthHandler.prototype.getTokens = jest.fn().mockResolvedValue(null);
    });

    it('should complete full OAuth flow successfully', async () => {
      MockOAuthCallbackServer.prototype.start = jest.fn().mockResolvedValue({
        port: 3000,
        callbackUrl: 'http://127.0.0.1:3000/oauth/callback',
      });
      MockOAuthCallbackServer.prototype.waitForCallback = jest.fn().mockResolvedValue({
        success: true,
        code: 'auth-code-123',
      });
      MockOAuthCallbackServer.prototype.shutdown = jest.fn().mockResolvedValue(undefined);

      MockGoogleOAuthHandler.prototype.getAuthorizationUrl = jest
        .fn()
        .mockResolvedValue('https://accounts.google.com/oauth?...');

      MockGoogleOAuthHandler.prototype.exchangeCodeForTokens = jest.fn().mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresAt: Date.now() + 3600000,
        scope: ['calendar'],
      });

      MockGoogleOAuthHandler.prototype.storeTokens = jest.fn().mockResolvedValue(undefined);

      mockOpenBrowser.mockResolvedValue({ success: true });

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('認証が完了しました');
      expect(MockOAuthCallbackServer.prototype.shutdown).toHaveBeenCalled();
    });

    it('should return URL when browser fails to open', async () => {
      MockOAuthCallbackServer.prototype.start = jest.fn().mockResolvedValue({
        port: 3000,
        callbackUrl: 'http://127.0.0.1:3000/oauth/callback',
      });
      MockOAuthCallbackServer.prototype.shutdown = jest.fn().mockResolvedValue(undefined);

      MockGoogleOAuthHandler.prototype.getAuthorizationUrl = jest
        .fn()
        .mockResolvedValue('https://accounts.google.com/oauth?...');

      mockOpenBrowser.mockResolvedValue({
        success: false,
        error: 'xdg-open not found',
      });

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.authorizationUrl).toBeDefined();
      expect(result.message).toContain('手動でブラウザに貼り付けて');
    });

    it('should handle callback error', async () => {
      MockOAuthCallbackServer.prototype.start = jest.fn().mockResolvedValue({
        port: 3000,
        callbackUrl: 'http://127.0.0.1:3000/oauth/callback',
      });
      MockOAuthCallbackServer.prototype.waitForCallback = jest.fn().mockResolvedValue({
        success: false,
        error: 'access_denied',
        errorDescription: 'User denied access',
      });
      MockOAuthCallbackServer.prototype.shutdown = jest.fn().mockResolvedValue(undefined);

      MockGoogleOAuthHandler.prototype.getAuthorizationUrl = jest
        .fn()
        .mockResolvedValue('https://accounts.google.com/oauth?...');

      mockOpenBrowser.mockResolvedValue({ success: true });

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('access_denied');
    });

    it('should cleanup server on error', async () => {
      MockOAuthCallbackServer.prototype.start = jest.fn().mockResolvedValue({
        port: 3000,
        callbackUrl: 'http://127.0.0.1:3000/oauth/callback',
      });
      MockOAuthCallbackServer.prototype.shutdown = jest.fn().mockResolvedValue(undefined);

      MockGoogleOAuthHandler.prototype.getAuthorizationUrl = jest
        .fn()
        .mockRejectedValue(new Error('Failed to generate URL'));

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(false);
      expect(MockOAuthCallbackServer.prototype.shutdown).toHaveBeenCalled();
    });
  });

  describe('Server Startup Errors', () => {
    it('should handle server startup failure', async () => {
      MockGoogleOAuthHandler.prototype.getTokens = jest.fn().mockResolvedValue(null);
      MockOAuthCallbackServer.prototype.start = jest
        .fn()
        .mockRejectedValue(new Error('Port 3000 in use'));

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('コールバックサーバーの起動に失敗');
    });
  });

  describe('Remote Mode (T-8)', () => {
    beforeEach(() => {
      MockGoogleOAuthHandler.prototype.getTokens = jest.fn().mockResolvedValue(null);

      // Setup PendingGoogleAuthStore mock
      MockPendingGoogleAuthStore.prototype.initialize = jest.fn().mockResolvedValue(undefined);
      MockPendingGoogleAuthStore.prototype.create = jest.fn().mockReturnValue({
        state: 'test-state-uuid',
        codeVerifier: 'test-code-verifier',
        codeChallenge: 'test-code-challenge',
      });
      MockPendingGoogleAuthStore.prototype.getSessionTimeoutSeconds = jest.fn().mockReturnValue(600);
    });

    it('should use local mode when GOOGLE_REDIRECT_URI contains localhost', async () => {
      process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/oauth/callback';

      MockOAuthCallbackServer.prototype.start = jest.fn().mockResolvedValue({
        port: 3000,
        callbackUrl: 'http://127.0.0.1:3000/oauth/callback',
      });
      MockOAuthCallbackServer.prototype.waitForCallback = jest.fn().mockResolvedValue({
        success: true,
        code: 'auth-code',
      });
      MockOAuthCallbackServer.prototype.shutdown = jest.fn().mockResolvedValue(undefined);

      MockGoogleOAuthHandler.prototype.getAuthorizationUrl = jest
        .fn()
        .mockResolvedValue('https://accounts.google.com/oauth?...');
      MockGoogleOAuthHandler.prototype.exchangeCodeForTokens = jest.fn().mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        scope: ['calendar'],
      });
      MockGoogleOAuthHandler.prototype.storeTokens = jest.fn().mockResolvedValue(undefined);

      mockOpenBrowser.mockResolvedValue({ success: true });

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      // Local mode should use OAuthCallbackServer
      expect(MockOAuthCallbackServer.prototype.start).toHaveBeenCalled();
      expect(result.pendingAuth).toBeUndefined();
    });

    it('should use local mode when GOOGLE_REDIRECT_URI contains 127.0.0.1', async () => {
      process.env.GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3000/oauth/callback';

      MockOAuthCallbackServer.prototype.start = jest.fn().mockResolvedValue({
        port: 3000,
        callbackUrl: 'http://127.0.0.1:3000/oauth/callback',
      });
      MockOAuthCallbackServer.prototype.waitForCallback = jest.fn().mockResolvedValue({
        success: true,
        code: 'auth-code',
      });
      MockOAuthCallbackServer.prototype.shutdown = jest.fn().mockResolvedValue(undefined);

      MockGoogleOAuthHandler.prototype.getAuthorizationUrl = jest
        .fn()
        .mockResolvedValue('https://accounts.google.com/oauth?...');
      MockGoogleOAuthHandler.prototype.exchangeCodeForTokens = jest.fn().mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        scope: ['calendar'],
      });
      MockGoogleOAuthHandler.prototype.storeTokens = jest.fn().mockResolvedValue(undefined);

      mockOpenBrowser.mockResolvedValue({ success: true });

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      expect(MockOAuthCallbackServer.prototype.start).toHaveBeenCalled();
      expect(result.pendingAuth).toBeUndefined();
    });

    it('should use remote mode when GOOGLE_REDIRECT_URI is a server URL', async () => {
      process.env.GOOGLE_REDIRECT_URI = 'https://mcp.example.com/oauth/google/callback';

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      // Remote mode should not start local server
      expect(MockOAuthCallbackServer.prototype.start).not.toHaveBeenCalled();
      // Should return authorization URL for user to open manually
      expect(result.success).toBe(true);
      expect(result.pendingAuth).toBe(true);
      expect(result.authorizationUrl).toBeDefined();
      expect(result.state).toBe('test-state-uuid');
      expect(result.expiresIn).toBe(600);
      expect(result.message).toContain('URLをブラウザで開いて');
    });

    it('should create pending session in remote mode', async () => {
      process.env.GOOGLE_REDIRECT_URI = 'https://mcp.example.com/oauth/google/callback';

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      // Verify remote mode returns expected fields
      expect(result.pendingAuth).toBe(true);
      expect(result.state).toBeDefined();
    });

    it('should return expiresIn in remote mode', async () => {
      process.env.GOOGLE_REDIRECT_URI = 'https://mcp.example.com/oauth/google/callback';

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      // expiresIn should be a positive number
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should still check existing tokens in remote mode', async () => {
      process.env.GOOGLE_REDIRECT_URI = 'https://mcp.example.com/oauth/google/callback';

      const mockTokens = {
        accessToken: 'existing-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: ['calendar'],
      };

      MockGoogleOAuthHandler.prototype.getTokens = jest.fn().mockResolvedValue(mockTokens);
      MockGoogleOAuthHandler.prototype.validateToken = jest.fn().mockResolvedValue(true);

      const result = await handleAuthenticateGoogle({ force: false, timeout: 300 }, mockContext);

      // Should return early with existing tokens even in remote mode
      expect(result.success).toBe(true);
      expect(result.alreadyAuthenticated).toBe(true);
      expect(result.pendingAuth).toBeUndefined();
    });
  });
});
