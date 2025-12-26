/**
 * Secret Authentication Unit Tests
 * Requirements: 15.4, 15.5, 15.6
 *
 * TDD: RED phase - Writing tests before implementation
 */

import {
  SecretAuthenticator,
  createSecretAuthenticator,
} from '../../src/cli/secret-auth.js';

describe('Secret Authentication', () => {
  const validSecret = 'test-secret-key-at-least-32-characters-long';
  const shortSecret = 'short-secret';
  const expiresIn = '24h';

  describe('createSecretAuthenticator', () => {
    it('should create an authenticator with valid secret', () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn,
      });

      expect(auth).toBeDefined();
      expect(auth.authenticate).toBeDefined();
      expect(auth.verifyToken).toBeDefined();
    });

    it('should throw error when secret is too short', () => {
      expect(() =>
        createSecretAuthenticator({
          secret: shortSecret,
          expiresIn,
        })
      ).toThrow('Secret must be at least 32 characters');
    });

    it('should throw error when secret is empty', () => {
      expect(() =>
        createSecretAuthenticator({
          secret: '',
          expiresIn,
        })
      ).toThrow('Secret must be at least 32 characters');
    });
  });

  describe('authenticate', () => {
    let auth: SecretAuthenticator;

    beforeEach(() => {
      auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn,
      });
    });

    it('should return JWT token when secret is valid', async () => {
      const result = await auth.authenticate(validSecret);

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
      expect(result.expiresIn).toBe(86400); // 24h in seconds
    });

    it('should return error when secret is invalid', async () => {
      const result = await auth.authenticate('wrong-secret');

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.error).toBe('Invalid secret');
    });

    it('should return error when secret is empty', async () => {
      const result = await auth.authenticate('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid secret');
    });

    it('should generate different tokens for each authentication', async () => {
      const result1 = await auth.authenticate(validSecret);
      const result2 = await auth.authenticate(validSecret);

      expect(result1.token).toBeDefined();
      expect(result2.token).toBeDefined();
      // Tokens should be different (different iat/exp)
      expect(result1.token).not.toBe(result2.token);
    });

    it('should support custom expiresIn values', async () => {
      const customAuth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '1h',
      });

      const result = await customAuth.authenticate(validSecret);

      expect(result.success).toBe(true);
      expect(result.expiresIn).toBe(3600); // 1h in seconds
    });

    it('should support expiresIn in days', async () => {
      const customAuth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '7d',
      });

      const result = await customAuth.authenticate(validSecret);

      expect(result.success).toBe(true);
      expect(result.expiresIn).toBe(604800); // 7d in seconds
    });

    it('should support expiresIn in minutes', async () => {
      const customAuth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '30m',
      });

      const result = await customAuth.authenticate(validSecret);

      expect(result.success).toBe(true);
      expect(result.expiresIn).toBe(1800); // 30m in seconds
    });
  });

  describe('verifyToken', () => {
    let auth: SecretAuthenticator;

    beforeEach(() => {
      auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn,
      });
    });

    it('should verify a valid token', async () => {
      const authResult = await auth.authenticate(validSecret);
      expect(authResult.token).toBeDefined();

      const verifyResult = await auth.verifyToken(authResult.token!);

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.error).toBeUndefined();
    });

    it('should reject an invalid token', async () => {
      const verifyResult = await auth.verifyToken('invalid.token.here');

      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toBeDefined();
    });

    it('should reject a token signed with different secret', async () => {
      const otherAuth = createSecretAuthenticator({
        secret: 'another-secret-key-at-least-32-chars',
        expiresIn,
      });

      const authResult = await otherAuth.authenticate('another-secret-key-at-least-32-chars');
      expect(authResult.token).toBeDefined();

      // Try to verify with different authenticator
      const verifyResult = await auth.verifyToken(authResult.token!);

      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toContain('invalid');
    });

    it('should reject an empty token', async () => {
      const verifyResult = await auth.verifyToken('');

      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toBeDefined();
    });

    it('should reject a malformed token', async () => {
      const verifyResult = await auth.verifyToken('not-a-jwt');

      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toBeDefined();
    });
  });

  describe('parseExpiresIn', () => {
    it('should parse hours correctly', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '24h',
      });
      const result = await auth.authenticate(validSecret);
      expect(result.expiresIn).toBe(86400);
    });

    it('should parse days correctly', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '7d',
      });
      const result = await auth.authenticate(validSecret);
      expect(result.expiresIn).toBe(604800);
    });

    it('should parse minutes correctly', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '30m',
      });
      const result = await auth.authenticate(validSecret);
      expect(result.expiresIn).toBe(1800);
    });

    it('should parse seconds correctly', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '3600s',
      });
      const result = await auth.authenticate(validSecret);
      expect(result.expiresIn).toBe(3600);
    });

    it('should parse weeks correctly', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: '1w',
      });
      const result = await auth.authenticate(validSecret);
      expect(result.expiresIn).toBe(604800);
    });

    it('should default to 24h for invalid format', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn: 'invalid',
      });
      const result = await auth.authenticate(validSecret);
      expect(result.expiresIn).toBe(86400); // Default to 24h
    });
  });

  describe('TokenResponse interface', () => {
    it('should have all required fields on success', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn,
      });
      const result = await auth.authenticate(validSecret);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresIn');
    });

    it('should have error field on failure', async () => {
      const auth = createSecretAuthenticator({
        secret: validSecret,
        expiresIn,
      });
      const result = await auth.authenticate('wrong-secret');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result.success).toBe(false);
    });
  });
});
