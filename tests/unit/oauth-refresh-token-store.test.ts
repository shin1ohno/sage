/**
 * OAuth Refresh Token Store Tests
 * Requirements: 21.6, 26.3, 26.8
 *
 * Tests for refresh token generation, storage, and rotation.
 */

import {
  createRefreshTokenStore,
  RefreshTokenStore,
} from '../../src/oauth/refresh-token-store.js';

describe('OAuth Refresh Token Store', () => {
  let tokenStore: RefreshTokenStore;

  beforeEach(() => {
    tokenStore = createRefreshTokenStore({
      expirySeconds: 30 * 24 * 60 * 60, // 30 days
    });
  });

  describe('generateToken', () => {
    it('should generate a valid refresh token', async () => {
      const token = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read mcp:write',
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate unique tokens', async () => {
      const token1 = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      const token2 = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const token = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      const result = await tokenStore.validateToken(token, 'test_client');

      expect(result.valid).toBe(true);
      expect(result.tokenData).toBeDefined();
      expect(result.tokenData?.client_id).toBe('test_client');
      expect(result.tokenData?.user_id).toBe('user_123');
      expect(result.tokenData?.scope).toBe('mcp:read');
    });

    it('should reject invalid token', async () => {
      const result = await tokenStore.validateToken('invalid_token', 'test_client');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });

    it('should reject token with wrong client_id', async () => {
      const token = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      const result = await tokenStore.validateToken(token, 'wrong_client');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });
  });

  describe('rotateToken (Requirement 26.8)', () => {
    it('should rotate token and return new token', async () => {
      const originalToken = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      const newToken = await tokenStore.rotateToken(originalToken, 'test_client');

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(originalToken);
    });

    it('should invalidate old token after rotation', async () => {
      const originalToken = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      await tokenStore.rotateToken(originalToken, 'test_client');

      // Old token should no longer be valid
      const result = await tokenStore.validateToken(originalToken, 'test_client');

      expect(result.valid).toBe(false);
    });

    it('should preserve scope during rotation', async () => {
      const originalToken = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read mcp:write',
      });

      const newToken = await tokenStore.rotateToken(originalToken, 'test_client');
      const result = await tokenStore.validateToken(newToken!, 'test_client');

      expect(result.valid).toBe(true);
      expect(result.tokenData?.scope).toBe('mcp:read mcp:write');
    });

    it('should fail rotation for invalid token', async () => {
      const newToken = await tokenStore.rotateToken('invalid_token', 'test_client');

      expect(newToken).toBeNull();
    });
  });

  describe('revokeToken', () => {
    it('should revoke a token', async () => {
      const token = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      await tokenStore.revokeToken(token);

      const result = await tokenStore.validateToken(token, 'test_client');

      expect(result.valid).toBe(false);
    });
  });

  describe('revokeAllForClient', () => {
    it('should revoke all tokens for a client', async () => {
      const token1 = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      const token2 = await tokenStore.generateToken({
        clientId: 'test_client',
        userId: 'user_456',
        scope: 'mcp:read',
      });

      const token3 = await tokenStore.generateToken({
        clientId: 'other_client',
        userId: 'user_789',
        scope: 'mcp:read',
      });

      await tokenStore.revokeAllForClient('test_client');

      // Tokens for test_client should be invalid
      expect((await tokenStore.validateToken(token1, 'test_client')).valid).toBe(false);
      expect((await tokenStore.validateToken(token2, 'test_client')).valid).toBe(false);

      // Token for other_client should still be valid
      expect((await tokenStore.validateToken(token3, 'other_client')).valid).toBe(true);
    });
  });

  describe('token expiry', () => {
    it('should reject expired token', async () => {
      // Create store with very short expiry
      const shortLivedStore = createRefreshTokenStore({
        expirySeconds: 1, // 1 second
      });

      const token = await shortLivedStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const result = await shortLivedStore.validateToken(token, 'test_client');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });
  });

  describe('cleanup', () => {
    it('should clean up expired and rotated tokens', async () => {
      const shortLivedStore = createRefreshTokenStore({
        expirySeconds: 1,
      });

      // Generate and rotate some tokens
      const token1 = await shortLivedStore.generateToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
      });

      await shortLivedStore.rotateToken(token1, 'test_client');

      // Wait for tokens to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Cleanup
      const cleanedCount = await shortLivedStore.cleanup();

      expect(cleanedCount).toBeGreaterThanOrEqual(2);
    });
  });
});
