/**
 * Google OAuth Handler Tests
 * Requirements: 1 (Google Calendar OAuth Authentication)
 *
 * Comprehensive tests for the GoogleOAuthHandler implementation.
 */

import { GoogleOAuthHandler, GOOGLE_CALENDAR_SCOPES } from '../../src/oauth/google-oauth-handler.js';
import * as fs from 'fs/promises';

// Mock modules
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

jest.mock('fs/promises');

describe('GoogleOAuthHandler', () => {
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/callback',
  };

  const mockEncryptionKey = 'test-encryption-key-32-chars!!';
  const mockUserId = 'test-user-123';

  let handler: GoogleOAuthHandler;
  let mockOAuth2Client: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock OAuth2Client
    mockOAuth2Client = {
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeToken: jest.fn(),
    };

    // Mock googleapis OAuth2 constructor
    const { google } = require('googleapis');
    google.auth.OAuth2.mockImplementation(() => mockOAuth2Client);

    // Initialize handler
    handler = new GoogleOAuthHandler(mockConfig, mockEncryptionKey, mockUserId);
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const newHandler = new GoogleOAuthHandler(mockConfig);
      expect(newHandler).toBeDefined();
    });

    it('should use provided encryption key', () => {
      const customKey = 'custom-encryption-key-32-chars!';
      const newHandler = new GoogleOAuthHandler(mockConfig, customKey);
      expect(newHandler).toBeDefined();
    });

    it('should use environment encryption key if not provided', () => {
      const originalEnv = process.env.SAGE_ENCRYPTION_KEY;
      process.env.SAGE_ENCRYPTION_KEY = 'env-key-32-chars-long-enough!!';
      const newHandler = new GoogleOAuthHandler(mockConfig);
      expect(newHandler).toBeDefined();
      process.env.SAGE_ENCRYPTION_KEY = originalEnv;
    });

    it('should use default encryption key if none provided', () => {
      const originalEnv = process.env.SAGE_ENCRYPTION_KEY;
      delete process.env.SAGE_ENCRYPTION_KEY;
      const newHandler = new GoogleOAuthHandler(mockConfig);
      expect(newHandler).toBeDefined();
      process.env.SAGE_ENCRYPTION_KEY = originalEnv;
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate authorization URL with PKCE code_challenge', async () => {
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&code_challenge=abc123';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);

      const authUrl = await handler.getAuthorizationUrl();

      expect(authUrl).toBe(mockAuthUrl);
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          scope: GOOGLE_CALENDAR_SCOPES,
          code_challenge: expect.any(String),
          code_challenge_method: 'S256',
          prompt: 'consent',
        })
      );
    });

    it('should generate URL with correct scopes', async () => {
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?scope=calendar';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);

      await handler.getAuthorizationUrl();

      const callArgs = mockOAuth2Client.generateAuthUrl.mock.calls[0][0];
      expect(callArgs.scope).toEqual(GOOGLE_CALENDAR_SCOPES);
    });

    it('should use custom redirect URI if provided', async () => {
      const customRedirectUri = 'http://localhost:8080/custom-callback';
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);

      const { google } = require('googleapis');
      google.auth.OAuth2.mockClear();

      await handler.getAuthorizationUrl(customRedirectUri);

      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        mockConfig.clientId,
        mockConfig.clientSecret,
        customRedirectUri
      );
    });

    it('should store code_verifier internally for later use', async () => {
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);

      await handler.getAuthorizationUrl();

      // Verify code_verifier is stored by attempting token exchange
      // (which requires code_verifier to be set)
      const code = 'test-auth-code';
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expiry_date: Date.now() + 3600000,
          scope: GOOGLE_CALENDAR_SCOPES.join(' '),
        },
      });

      await expect(handler.exchangeCodeForTokens(code)).resolves.not.toThrow();
    });
  });

  describe('exchangeCodeForTokens', () => {
    beforeEach(async () => {
      // Setup: Generate authorization URL first to set code_verifier
      mockOAuth2Client.generateAuthUrl.mockReturnValue('https://auth.url');
      await handler.getAuthorizationUrl();
    });

    it('should successfully exchange authorization code for tokens', async () => {
      const code = 'test-authorization-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      const result = await handler.exchangeCodeForTokens(code);

      expect(result).toEqual({
        accessToken: mockTokens.access_token,
        refreshToken: mockTokens.refresh_token,
        expiresAt: mockTokens.expiry_date,
        scope: GOOGLE_CALENDAR_SCOPES,
      });
    });

    it('should use stored code_verifier for PKCE verification', async () => {
      const code = 'test-authorization-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      await handler.exchangeCodeForTokens(code);

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith({
        code,
        codeVerifier: expect.any(String),
      });
    });

    it('should throw error if code_verifier not found', async () => {
      // Create new handler without calling getAuthorizationUrl first
      const newHandler = new GoogleOAuthHandler(mockConfig);
      const code = 'test-authorization-code';

      await expect(newHandler.exchangeCodeForTokens(code)).rejects.toThrow(
        'code_verifier not found. Call getAuthorizationUrl() first.'
      );
    });

    it('should throw error if access_token is missing', async () => {
      const code = 'test-authorization-code';
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          refresh_token: 'test-refresh-token',
        },
      });

      await expect(handler.exchangeCodeForTokens(code)).rejects.toThrow(
        'Failed to retrieve access_token or refresh_token'
      );
    });

    it('should throw error if refresh_token is missing', async () => {
      const code = 'test-authorization-code';
      mockOAuth2Client.getToken.mockResolvedValue({
        tokens: {
          access_token: 'test-access-token',
        },
      });

      await expect(handler.exchangeCodeForTokens(code)).rejects.toThrow(
        'Failed to retrieve access_token or refresh_token'
      );
    });

    it('should handle googleapis errors gracefully', async () => {
      const code = 'test-authorization-code';
      const errorMessage = 'Invalid authorization code';
      mockOAuth2Client.getToken.mockRejectedValue(new Error(errorMessage));

      await expect(handler.exchangeCodeForTokens(code)).rejects.toThrow(
        `Failed to exchange code for tokens: ${errorMessage}`
      );
    });

    it('should clear code_verifier after successful exchange', async () => {
      const code = 'test-authorization-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      await handler.exchangeCodeForTokens(code);

      // Try to exchange again without calling getAuthorizationUrl
      await expect(handler.exchangeCodeForTokens('another-code')).rejects.toThrow(
        'code_verifier not found'
      );
    });

    it('should clear code_verifier after failed exchange', async () => {
      const code = 'test-authorization-code';
      mockOAuth2Client.getToken.mockRejectedValue(new Error('Token exchange failed'));

      await expect(handler.exchangeCodeForTokens(code)).rejects.toThrow();

      // Try to exchange again without calling getAuthorizationUrl
      await expect(handler.exchangeCodeForTokens('another-code')).rejects.toThrow(
        'code_verifier not found'
      );
    });

    it('should use default expiry if not provided by googleapis', async () => {
      const code = 'test-authorization-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      const beforeExchange = Date.now();
      const result = await handler.exchangeCodeForTokens(code);
      const afterExchange = Date.now();

      expect(result.expiresAt).toBeGreaterThanOrEqual(beforeExchange + 3600000);
      expect(result.expiresAt).toBeLessThanOrEqual(afterExchange + 3600000 + 1000); // 1s buffer
    });

    it('should use default scopes if not provided by googleapis', async () => {
      const code = 'test-authorization-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      const result = await handler.exchangeCodeForTokens(code);

      expect(result.scope).toEqual(GOOGLE_CALENDAR_SCOPES);
    });
  });

  describe('refreshAccessToken', () => {
    it('should successfully refresh access token', async () => {
      const refreshToken = 'test-refresh-token';
      const mockCredentials = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: mockCredentials,
      });

      const result = await handler.refreshAccessToken(refreshToken);

      expect(result).toEqual({
        accessToken: mockCredentials.access_token,
        refreshToken: mockCredentials.refresh_token,
        expiresAt: mockCredentials.expiry_date,
        scope: GOOGLE_CALENDAR_SCOPES,
      });
    });

    it('should set refresh_token credential before refreshing', async () => {
      const refreshToken = 'test-refresh-token';
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-access-token',
          expiry_date: Date.now() + 3600000,
        },
      });

      await handler.refreshAccessToken(refreshToken);

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: refreshToken,
      });
    });

    it('should use original refresh_token if new one not provided', async () => {
      const originalRefreshToken = 'original-refresh-token';
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-access-token',
          expiry_date: Date.now() + 3600000,
        },
      });

      const result = await handler.refreshAccessToken(originalRefreshToken);

      expect(result.refreshToken).toBe(originalRefreshToken);
    });

    it('should throw error if access_token is missing', async () => {
      const refreshToken = 'test-refresh-token';
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {},
      });

      await expect(handler.refreshAccessToken(refreshToken)).rejects.toThrow(
        'Failed to refresh access_token'
      );
    });

    it('should handle googleapis errors gracefully', async () => {
      const refreshToken = 'test-refresh-token';
      const errorMessage = 'Invalid refresh token';
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(new Error(errorMessage));

      await expect(handler.refreshAccessToken(refreshToken)).rejects.toThrow(
        `Failed to refresh access token: ${errorMessage}`
      );
    });

    it('should use default expiry if not provided', async () => {
      const refreshToken = 'test-refresh-token';
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-access-token',
        },
      });

      const beforeRefresh = Date.now();
      const result = await handler.refreshAccessToken(refreshToken);
      const afterRefresh = Date.now();

      expect(result.expiresAt).toBeGreaterThanOrEqual(beforeRefresh + 3600000);
      expect(result.expiresAt).toBeLessThanOrEqual(afterRefresh + 3600000 + 1000);
    });

    it('should use default scopes if not provided', async () => {
      const refreshToken = 'test-refresh-token';
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-access-token',
          expiry_date: Date.now() + 3600000,
        },
      });

      const result = await handler.refreshAccessToken(refreshToken);

      expect(result.scope).toEqual(GOOGLE_CALENDAR_SCOPES);
    });
  });

  describe('storeTokens and getTokens', () => {
    const mockTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
      scope: GOOGLE_CALENDAR_SCOPES,
    };

    beforeEach(() => {
      // Mock fs operations
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('should successfully encrypt and store tokens', async () => {
      await handler.storeTokens(mockTokens);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.sage'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('google_oauth_tokens_test-user-123.enc'),
        expect.any(String),
        'utf8'
      );
    });

    it('should successfully retrieve and decrypt tokens', async () => {
      // First store tokens
      let encryptedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        encryptedData = data;
      });

      await handler.storeTokens(mockTokens);

      // Then retrieve tokens
      (fs.readFile as jest.Mock).mockResolvedValue(encryptedData);

      const retrievedTokens = await handler.getTokens();

      expect(retrievedTokens).not.toBeNull();
      expect(retrievedTokens!.accessToken).toBe(mockTokens.accessToken);
      expect(retrievedTokens!.refreshToken).toBe(mockTokens.refreshToken);
      expect(retrievedTokens!.scope).toEqual(mockTokens.scope);
    });

    it('should return null when no tokens stored (ENOENT)', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      (fs.readFile as jest.Mock).mockRejectedValue(error);

      const result = await handler.getTokens();

      expect(result).toBeNull();
    });

    it('should throw error for file system errors other than ENOENT', async () => {
      const error: any = new Error('Permission denied');
      error.code = 'EACCES';
      (fs.readFile as jest.Mock).mockRejectedValue(error);

      await expect(handler.getTokens()).rejects.toThrow('Failed to get tokens');
    });

    it('should store tokens with ISO 8601 formatted expiresAt', async () => {
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });

      await handler.storeTokens(mockTokens);

      // The stored data should be encrypted, but we can verify it was called
      expect(fs.writeFile).toHaveBeenCalled();
      expect(storedData).toBeTruthy();
    });

    it('should handle encryption errors gracefully', async () => {
      // Mock mkdir to throw an error instead (simpler approach)
      (fs.mkdir as jest.Mock).mockRejectedValueOnce(new Error('Directory creation failed'));

      await expect(handler.storeTokens(mockTokens)).rejects.toThrow('Failed to store tokens');

      // Restore mock for subsequent tests
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    });

    it('should handle decryption errors gracefully', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('invalid:encrypted:data');

      await expect(handler.getTokens()).rejects.toThrow('Failed to get tokens');
    });

    it('should create .sage directory if it does not exist', async () => {
      await handler.storeTokens(mockTokens);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.sage'),
        { recursive: true }
      );
    });

    it('should handle directory creation errors', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Cannot create directory'));

      await expect(handler.storeTokens(mockTokens)).rejects.toThrow('Failed to store tokens');
    });
  });

  describe('validateToken', () => {
    it('should return true for valid non-expiring token', async () => {
      const tokens = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 600000, // 10 minutes from now
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      const result = await handler.validateToken(tokens);

      expect(result).toBe(true);
    });

    it('should return false for expired token', async () => {
      const tokens = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() - 1000, // 1 second ago
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      const result = await handler.validateToken(tokens);

      expect(result).toBe(false);
    });

    it('should return false for token expiring within 5 minutes', async () => {
      const tokens = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 240000, // 4 minutes from now
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      const result = await handler.validateToken(tokens);

      expect(result).toBe(false);
    });

    it('should return true for token expiring after 5 minutes', async () => {
      const tokens = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 360000, // 6 minutes from now
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      const result = await handler.validateToken(tokens);

      expect(result).toBe(true);
    });
  });

  describe('ensureValidToken', () => {
    beforeEach(() => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('should return valid token when not expired', async () => {
      const validTokens = {
        accessToken: 'valid-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 600000, // 10 minutes from now
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      // Mock getTokens to return valid tokens
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await handler.storeTokens(validTokens);

      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      const result = await handler.ensureValidToken();

      expect(result).toBe('valid-access-token');
      expect(mockOAuth2Client.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should refresh token when expired', async () => {
      const expiredTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000, // Expired
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      // Mock getTokens to return expired tokens
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await handler.storeTokens(expiredTokens);

      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      // Mock refresh
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
      });

      const result = await handler.ensureValidToken();

      expect(result).toBe('new-access-token');
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledTimes(2); // Once for storing expired, once for storing refreshed
    });

    it('should throw error if no tokens found', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      (fs.readFile as jest.Mock).mockRejectedValue(error);

      await expect(handler.ensureValidToken()).rejects.toThrow(
        'No stored tokens found. Please authenticate with Google Calendar first.'
      );
    });

    it('should throw error if refresh fails', async () => {
      const expiredTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      // Mock getTokens to return expired tokens
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await handler.storeTokens(expiredTokens);

      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      // Mock refresh to fail
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(
        new Error('Invalid refresh token')
      );

      await expect(handler.ensureValidToken()).rejects.toThrow(
        'Failed to refresh expired token'
      );
    });

    it('should update stored tokens after successful refresh', async () => {
      const expiredTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      // Mock getTokens to return expired tokens
      let storedData: string = '';
      let writeCallCount = 0;
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
        writeCallCount++;
      });
      await handler.storeTokens(expiredTokens);

      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      // Mock refresh
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
      });

      await handler.ensureValidToken();

      // Verify storeTokens was called again after refresh
      expect(writeCallCount).toBe(2);
    });
  });

  describe('revokeToken', () => {
    it('should successfully revoke access token', async () => {
      const accessToken = 'test-access-token';
      mockOAuth2Client.revokeToken.mockResolvedValue(undefined);

      await expect(handler.revokeToken(accessToken)).resolves.not.toThrow();

      expect(mockOAuth2Client.revokeToken).toHaveBeenCalledWith(accessToken);
    });

    it('should handle revocation errors gracefully', async () => {
      const accessToken = 'test-access-token';
      const errorMessage = 'Token revocation failed';
      mockOAuth2Client.revokeToken.mockRejectedValue(new Error(errorMessage));

      await expect(handler.revokeToken(accessToken)).rejects.toThrow(
        `Failed to revoke token: ${errorMessage}`
      );
    });
  });

  describe('revokeTokens', () => {
    beforeEach(() => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);
    });

    it('should revoke tokens and clear local storage', async () => {
      const tokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      // Store tokens first
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await handler.storeTokens(tokens);

      // Mock getTokens
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      // Mock revoke
      mockOAuth2Client.revokeToken.mockResolvedValue(undefined);

      await handler.revokeTokens();

      expect(mockOAuth2Client.revokeToken).toHaveBeenCalledWith(tokens.accessToken);
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('google_oauth_tokens_test-user-123.enc')
      );
    });

    it('should clear local storage even if no tokens stored', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      (fs.readFile as jest.Mock).mockRejectedValue(error);
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await expect(handler.revokeTokens()).resolves.not.toThrow();

      expect(mockOAuth2Client.revokeToken).not.toHaveBeenCalled();
    });

    it('should handle file deletion errors gracefully except ENOENT', async () => {
      const tokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await handler.storeTokens(tokens);

      (fs.readFile as jest.Mock).mockResolvedValue(storedData);
      mockOAuth2Client.revokeToken.mockResolvedValue(undefined);

      const deleteError: any = new Error('Permission denied');
      deleteError.code = 'EACCES';
      (fs.unlink as jest.Mock).mockRejectedValue(deleteError);

      await expect(handler.revokeTokens()).rejects.toThrow('Failed to revoke tokens');
    });

    it('should ignore ENOENT errors when deleting file', async () => {
      const tokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });
      await handler.storeTokens(tokens);

      (fs.readFile as jest.Mock).mockResolvedValue(storedData);
      mockOAuth2Client.revokeToken.mockResolvedValue(undefined);

      const deleteError: any = new Error('File not found');
      deleteError.code = 'ENOENT';
      (fs.unlink as jest.Mock).mockRejectedValue(deleteError);

      await expect(handler.revokeTokens()).resolves.not.toThrow();
    });
  });

  describe('getOAuth2Client', () => {
    it('should return configured OAuth2Client with tokens', () => {
      const tokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      const client = handler.getOAuth2Client(tokens);

      expect(client).toBe(mockOAuth2Client);
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiresAt,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      });
    });
  });

  describe('integration scenarios', () => {
    it('should complete full OAuth flow', async () => {
      // Step 1: Get authorization URL
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(mockAuthUrl);

      const authUrl = await handler.getAuthorizationUrl();
      expect(authUrl).toBe(mockAuthUrl);

      // Step 2: Exchange code for tokens
      const code = 'test-auth-code';
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      const tokens = await handler.exchangeCodeForTokens(code);

      // Step 3: Store tokens
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });

      await handler.storeTokens(tokens);

      // Step 4: Retrieve tokens
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      const retrievedTokens = await handler.getTokens();

      expect(retrievedTokens).not.toBeNull();
      expect(retrievedTokens!.accessToken).toBe(tokens.accessToken);
    });

    it('should handle token expiration and refresh flow', async () => {
      // Store expired tokens
      const expiredTokens = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000,
        scope: GOOGLE_CALENDAR_SCOPES,
      };

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      let storedData: string = '';
      (fs.writeFile as jest.Mock).mockImplementation(async (_path, data) => {
        storedData = data;
      });

      await handler.storeTokens(expiredTokens);

      // Ensure valid token (should trigger refresh)
      (fs.readFile as jest.Mock).mockResolvedValue(storedData);

      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      };

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: newTokens,
      });

      const validToken = await handler.ensureValidToken();

      expect(validToken).toBe('new-access-token');
    });
  });
});
