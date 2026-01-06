/**
 * OAuth Token Service Tests
 * Requirements: 21.4, 21.5, 26.6, 26.7, 27.1-27.5
 *
 * Tests for JWT access token generation and verification.
 */

import {
  createTokenService,
  TokenService,
  generateKeyPair,
} from '../../src/oauth/token-service.js';

describe('OAuth Token Service', () => {
  let tokenService: TokenService;
  let keyPair: { privateKey: string; publicKey: string };

  beforeAll(async () => {
    keyPair = await generateKeyPair();
    tokenService = createTokenService({
      issuer: 'https://sage.example.com',
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      accessTokenExpiry: '1h',
    });
  });

  describe('generateKeyPair', () => {
    it('should generate valid RSA key pair', async () => {
      const keys = await generateKeyPair();

      expect(keys.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(keys.privateKey).toContain('-----END PRIVATE KEY-----');
      expect(keys.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keys.publicKey).toContain('-----END PUBLIC KEY-----');
    });

    it('should generate unique key pairs', async () => {
      const keys1 = await generateKeyPair();
      const keys2 = await generateKeyPair();

      expect(keys1.privateKey).not.toBe(keys2.privateKey);
      expect(keys1.publicKey).not.toBe(keys2.publicKey);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', async () => {
      const token = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read mcp:write',
        audience: 'https://sage.example.com',
      });

      expect(token.access_token).toBeDefined();
      expect(token.token_type).toBe('Bearer');
      expect(token.expires_in).toBe(3600); // 1 hour
    });

    it('should generate token with correct JWT structure', async () => {
      const token = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      // JWT should have 3 parts separated by dots
      const parts = token.access_token.split('.');
      expect(parts).toHaveLength(3);

      // Decode header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');
    });

    it('should include correct claims in the token', async () => {
      const token = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read mcp:write',
        audience: 'https://sage.example.com',
      });

      // Decode payload
      const parts = token.access_token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      expect(payload.iss).toBe('https://sage.example.com');
      expect(payload.sub).toBe('user_123');
      expect(payload.aud).toBe('https://sage.example.com');
      expect(payload.client_id).toBe('test_client');
      expect(payload.scope).toBe('mcp:read mcp:write');
      expect(payload.jti).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
      expect(payload.exp - payload.iat).toBe(3600);
    });

    it('should include scope in response when provided', async () => {
      const token = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read mcp:write',
        audience: 'https://sage.example.com',
      });

      expect(token.scope).toBe('mcp:read mcp:write');
    });

    it('should generate unique tokens for each call', async () => {
      const token1 = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      const token2 = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      expect(token1.access_token).not.toBe(token2.access_token);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid token', async () => {
      const token = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      const result = await tokenService.verifyAccessToken(token.access_token);

      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims?.sub).toBe('user_123');
      expect(result.claims?.client_id).toBe('test_client');
    });

    it('should reject invalid token', async () => {
      const result = await tokenService.verifyAccessToken('invalid.token.here');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject tampered token', async () => {
      const token = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      // Tamper with the payload
      const parts = token.access_token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      payload.scope = 'mcp:admin'; // Escalate privileges
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = parts.join('.');

      const result = await tokenService.verifyAccessToken(tamperedToken);

      expect(result.valid).toBe(false);
    });

    it('should reject token signed with different key', async () => {
      // Create token service with different keys
      const otherKeys = await generateKeyPair();
      const otherService = createTokenService({
        issuer: 'https://sage.example.com',
        privateKey: otherKeys.privateKey,
        publicKey: otherKeys.publicKey,
        accessTokenExpiry: '1h',
      });

      const token = await otherService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      // Verify with original service should fail
      const result = await tokenService.verifyAccessToken(token.access_token);

      expect(result.valid).toBe(false);
    });

    it('should verify audience claim', async () => {
      const token = await tokenService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      const result = await tokenService.verifyAccessToken(
        token.access_token,
        'https://different-audience.com'
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('audience');
    });
  });

  describe('token expiry', () => {
    it('should reject expired token', async () => {
      // Create service with very short expiry
      const shortLivedService = createTokenService({
        issuer: 'https://sage.example.com',
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        accessTokenExpiry: '1s', // 1 second
      });

      const token = await shortLivedService.generateAccessToken({
        clientId: 'test_client',
        userId: 'user_123',
        scope: 'mcp:read',
        audience: 'https://sage.example.com',
      });

      // Wait for token to expire (2 seconds: 1s expiry + 1s buffer for JWT second-granularity)
      // JWT exp is in seconds (Unix timestamp), so we need at least 2s to guarantee expiry
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await shortLivedService.verifyAccessToken(token.access_token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = tokenService.extractTokenFromHeader('Bearer abc123def456');
      expect(token).toBe('abc123def456');
    });

    it('should return null for missing header', () => {
      const token = tokenService.extractTokenFromHeader(undefined);
      expect(token).toBeNull();
    });

    it('should return null for non-Bearer scheme', () => {
      const token = tokenService.extractTokenFromHeader('Basic abc123');
      expect(token).toBeNull();
    });

    it('should return null for malformed header', () => {
      const token = tokenService.extractTokenFromHeader('Bearer');
      expect(token).toBeNull();
    });

    it('should be case-insensitive for Bearer scheme', () => {
      const token = tokenService.extractTokenFromHeader('bearer abc123');
      expect(token).toBe('abc123');
    });
  });
});
