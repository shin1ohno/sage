/**
 * OAuth Authorization Code Store Tests
 * Requirements: 25.9, 25.10, 26.4
 *
 * Tests for authorization code generation, storage, and validation.
 */

import {
  createAuthorizationCodeStore,
  AuthorizationCodeStore,
} from '../../src/oauth/code-store.js';

describe('OAuth Authorization Code Store', () => {
  let codeStore: AuthorizationCodeStore;

  beforeEach(() => {
    codeStore = createAuthorizationCodeStore({
      expirySeconds: 600, // 10 minutes
    });
  });

  describe('generateCode', () => {
    it('should generate a valid authorization code', async () => {
      const code = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
        resource: 'https://sage.example.com',
      });

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    it('should generate unique codes', async () => {
      const code1 = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      const code2 = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      expect(code1).not.toBe(code2);
    });
  });

  describe('validateCode', () => {
    it('should validate a valid code', async () => {
      const code = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      const result = await codeStore.validateCode(code, 'test_client');

      expect(result.valid).toBe(true);
      expect(result.codeData).toBeDefined();
      expect(result.codeData?.client_id).toBe('test_client');
      expect(result.codeData?.redirect_uri).toBe('https://example.com/callback');
      expect(result.codeData?.scope).toBe('mcp:read');
      expect(result.codeData?.code_challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });

    it('should reject invalid code', async () => {
      const result = await codeStore.validateCode('invalid_code', 'test_client');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });

    it('should reject code with wrong client_id', async () => {
      const code = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      const result = await codeStore.validateCode(code, 'wrong_client');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });
  });

  describe('consumeCode', () => {
    it('should consume a valid code', async () => {
      const code = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      const result = await codeStore.consumeCode(code, 'test_client');

      expect(result.valid).toBe(true);
      expect(result.codeData).toBeDefined();
    });

    it('should only allow code to be used once (Requirement 25.10)', async () => {
      const code = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      // First use should succeed
      const result1 = await codeStore.consumeCode(code, 'test_client');
      expect(result1.valid).toBe(true);

      // Second use should fail
      const result2 = await codeStore.consumeCode(code, 'test_client');
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('invalid_grant');
    });
  });

  describe('code expiry (Requirement 25.9)', () => {
    it('should reject expired code', async () => {
      // Create store with very short expiry
      const shortLivedStore = createAuthorizationCodeStore({
        expirySeconds: 1, // 1 second
      });

      const code = await shortLivedStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      // Wait for code to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const result = await shortLivedStore.validateCode(code, 'test_client');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_grant');
    });
  });

  describe('revokeCode', () => {
    it('should revoke a code', async () => {
      const code = await codeStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      await codeStore.revokeCode(code);

      const result = await codeStore.validateCode(code, 'test_client');

      expect(result.valid).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up expired codes', async () => {
      const shortLivedStore = createAuthorizationCodeStore({
        expirySeconds: 1,
      });

      // Generate multiple codes
      await shortLivedStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_123',
      });

      await shortLivedStore.generateCode({
        clientId: 'test_client',
        redirectUri: 'https://example.com/callback',
        scope: 'mcp:read',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        userId: 'user_456',
      });

      // Wait for codes to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Cleanup
      const cleanedCount = await shortLivedStore.cleanup();

      expect(cleanedCount).toBe(2);
    });
  });
});
