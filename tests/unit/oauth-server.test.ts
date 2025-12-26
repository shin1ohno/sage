/**
 * OAuth Server Tests
 * Requirements: 21-31 (OAuth 2.1)
 *
 * Comprehensive tests for the OAuth 2.1 server implementation.
 */

import { createOAuthServer, OAuthServer } from '../../src/oauth/oauth-server.js';
import { generateCodeVerifier, generateCodeChallenge } from '../../src/oauth/pkce.js';
import { createHash } from 'crypto';

describe('OAuth Server', () => {
  let server: OAuthServer;

  beforeAll(async () => {
    server = await createOAuthServer({
      issuer: 'https://sage.example.com',
      accessTokenExpiry: '1h',
      refreshTokenExpiry: '30d',
      authorizationCodeExpiry: '10m',
      allowedRedirectUris: ['https://example.com/callback'],
      users: [
        {
          id: 'user_123',
          username: 'admin',
          passwordHash: createHash('sha256').update('password123').digest('hex'),
          createdAt: Date.now(),
        },
      ],
    });
  });

  describe('Protected Resource Metadata (Requirement 22)', () => {
    it('should return correct metadata', () => {
      const metadata = server.getProtectedResourceMetadata();

      expect(metadata.resource).toBe('https://sage.example.com');
      expect(metadata.authorization_servers).toContain('https://sage.example.com');
      expect(metadata.scopes_supported).toContain('mcp:read');
      expect(metadata.scopes_supported).toContain('mcp:write');
      expect(metadata.scopes_supported).toContain('mcp:admin');
      expect(metadata.bearer_methods_supported).toContain('header');
    });
  });

  describe('Authorization Server Metadata (Requirement 23)', () => {
    it('should return correct metadata', () => {
      const metadata = server.getAuthorizationServerMetadata();

      expect(metadata.issuer).toBe('https://sage.example.com');
      expect(metadata.authorization_endpoint).toBe('https://sage.example.com/oauth/authorize');
      expect(metadata.token_endpoint).toBe('https://sage.example.com/oauth/token');
      expect(metadata.registration_endpoint).toBe('https://sage.example.com/oauth/register');
      expect(metadata.response_types_supported).toContain('code');
      expect(metadata.grant_types_supported).toContain('authorization_code');
      expect(metadata.grant_types_supported).toContain('refresh_token');
      expect(metadata.code_challenge_methods_supported).toContain('S256');
      expect(metadata.token_endpoint_auth_methods_supported).toContain('none');
    });
  });

  describe('WWW-Authenticate Header (Requirement 22.4, 22.5)', () => {
    it('should return correct header format', () => {
      const header = server.getWWWAuthenticateHeader();

      expect(header).toContain('Bearer realm="sage"');
      expect(header).toContain('resource_metadata="https://sage.example.com/.well-known/oauth-protected-resource"');
    });
  });

  describe('Dynamic Client Registration (Requirement 24)', () => {
    it('should register a client with valid data', async () => {
      const result = await server.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      });

      expect(result.success).toBe(true);
      expect(result.client).toBeDefined();
      expect(result.client?.client_name).toBe('Test Client');
      expect(result.client?.client_id).toMatch(/^sage_/);
    });

    it('should register Claude with official callback URLs (Requirement 24.4)', async () => {
      const result = await server.registerClient({
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      });

      expect(result.success).toBe(true);
    });

    it('should reject missing client_name', async () => {
      const result = await server.registerClient({
        client_name: '',
        redirect_uris: ['https://example.com/callback'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_client_metadata');
    });

    it('should reject invalid redirect_uri', async () => {
      const result = await server.registerClient({
        client_name: 'Test',
        redirect_uris: ['http://insecure.com/callback'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_redirect_uri');
    });
  });

  describe('Authorization Request Validation (Requirement 25)', () => {
    let clientId: string;

    beforeAll(async () => {
      const result = await server.registerClient({
        client_name: 'Auth Test Client',
        redirect_uris: ['https://example.com/callback'],
      });
      clientId = result.client!.client_id;
    });

    it('should validate a correct authorization request', async () => {
      const codeChallenge = generateCodeChallenge(generateCodeVerifier());

      const result = await server.validateAuthorizationRequest({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      expect(result.valid).toBe(true);
      expect(result.client).toBeDefined();
    });

    it('should reject unsupported response_type', async () => {
      const result = await server.validateAuthorizationRequest({
        response_type: 'token' as any,
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe('unsupported_response_type');
    });

    it('should reject unknown client_id', async () => {
      const result = await server.validateAuthorizationRequest({
        response_type: 'code',
        client_id: 'unknown_client',
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe('invalid_client');
    });

    it('should reject mismatched redirect_uri', async () => {
      const result = await server.validateAuthorizationRequest({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://other.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe('invalid_request');
    });

    it('should require code_challenge', async () => {
      const result = await server.validateAuthorizationRequest({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: '',
        code_challenge_method: 'S256',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe('invalid_request');
    });

    it('should require state', async () => {
      const result = await server.validateAuthorizationRequest({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: '',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      });

      expect(result.valid).toBe(false);
      expect(result.error?.error).toBe('invalid_request');
    });
  });

  describe('Authorization Code Exchange (Requirement 26)', () => {
    let clientId: string;

    beforeAll(async () => {
      const result = await server.registerClient({
        client_name: 'Token Test Client',
        redirect_uris: ['https://example.com/callback'],
      });
      clientId = result.client!.client_id;
    });

    it('should exchange valid authorization code for tokens', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Complete authorization
      const code = await server.completeAuthorization({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read mcp:write',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }, 'user_123');

      // Exchange code for tokens
      const result = await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        codeVerifier
      );

      expect(result.success).toBe(true);
      expect(result.tokens?.access_token).toBeDefined();
      expect(result.tokens?.token_type).toBe('Bearer');
      expect(result.tokens?.expires_in).toBe(3600);
      expect(result.tokens?.refresh_token).toBeDefined();
      expect(result.tokens?.scope).toBe('mcp:read mcp:write');
    });

    it('should reject invalid code', async () => {
      const result = await server.exchangeAuthorizationCode(
        'invalid_code',
        clientId,
        'https://example.com/callback',
        'verifier'
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe('invalid_grant');
    });

    it('should reject wrong code_verifier (Requirement 26.4)', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const code = await server.completeAuthorization({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }, 'user_123');

      const result = await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        'wrong_verifier'
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe('invalid_grant');
    });

    it('should reject code reuse (Requirement 25.10)', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const code = await server.completeAuthorization({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }, 'user_123');

      // First use
      await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        codeVerifier
      );

      // Second use should fail
      const result = await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        codeVerifier
      );

      expect(result.success).toBe(false);
      expect(result.error?.error).toBe('invalid_grant');
    });
  });

  describe('Refresh Token Exchange (Requirement 26.3, 26.8)', () => {
    let clientId: string;

    beforeAll(async () => {
      const result = await server.registerClient({
        client_name: 'Refresh Test Client',
        redirect_uris: ['https://example.com/callback'],
      });
      clientId = result.client!.client_id;
    });

    it('should exchange refresh token for new tokens', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Get initial tokens
      const code = await server.completeAuthorization({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }, 'user_123');

      const tokenResult = await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        codeVerifier
      );

      // Exchange refresh token
      const result = await server.exchangeRefreshToken(
        tokenResult.tokens!.refresh_token!,
        clientId
      );

      expect(result.success).toBe(true);
      expect(result.tokens?.access_token).toBeDefined();
      expect(result.tokens?.refresh_token).toBeDefined();
      // New refresh token should be different (rotation)
      expect(result.tokens?.refresh_token).not.toBe(tokenResult.tokens?.refresh_token);
    });

    it('should reject reused refresh token after rotation', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const code = await server.completeAuthorization({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }, 'user_123');

      const tokenResult = await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        codeVerifier
      );

      const originalRefreshToken = tokenResult.tokens!.refresh_token!;

      // First rotation
      await server.exchangeRefreshToken(originalRefreshToken, clientId);

      // Try to use original token again
      const result = await server.exchangeRefreshToken(originalRefreshToken, clientId);

      expect(result.success).toBe(false);
    });
  });

  describe('Token Verification (Requirement 27)', () => {
    let clientId: string;

    beforeAll(async () => {
      const result = await server.registerClient({
        client_name: 'Verify Test Client',
        redirect_uris: ['https://example.com/callback'],
      });
      clientId = result.client!.client_id;
    });

    it('should verify valid access token', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const code = await server.completeAuthorization({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }, 'user_123');

      const tokenResult = await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        codeVerifier
      );

      const result = await server.verifyAccessToken(tokenResult.tokens!.access_token);

      expect(result.valid).toBe(true);
      expect(result.claims?.sub).toBe('user_123');
      expect(result.claims?.client_id).toBe(clientId);
      expect(result.claims?.scope).toBe('mcp:read');
    });

    it('should reject invalid token', async () => {
      const result = await server.verifyAccessToken('invalid.token.here');

      expect(result.valid).toBe(false);
    });
  });

  describe('User Authentication (Requirement 29)', () => {
    it('should authenticate valid user', async () => {
      const result = await server.authenticateUser('admin', 'password123');

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.userId).toBe('user_123');
    });

    it('should reject invalid username', async () => {
      const result = await server.authenticateUser('unknown', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject invalid password', async () => {
      const result = await server.authenticateUser('admin', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should rate limit login attempts (Requirement 29.5)', async () => {
      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await server.authenticateUser('ratelimit', 'wrong');
      }

      // 6th attempt should be rate limited
      const result = await server.authenticateUser('ratelimit', 'correct');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many');
    });
  });

  describe('Client Deletion (Requirement 24.8)', () => {
    it('should delete client and invalidate tokens', async () => {
      const regResult = await server.registerClient({
        client_name: 'Delete Test',
        redirect_uris: ['https://example.com/callback'],
      });
      const clientId = regResult.client!.client_id;

      // Get tokens
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const code = await server.completeAuthorization({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://example.com/callback',
        scope: 'mcp:read',
        state: 'xyz123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }, 'user_123');

      const tokenResult = await server.exchangeAuthorizationCode(
        code,
        clientId,
        'https://example.com/callback',
        codeVerifier
      );

      // Delete client
      const deleted = await server.deleteClient(clientId);
      expect(deleted).toBe(true);

      // Try to use refresh token
      const refreshResult = await server.exchangeRefreshToken(
        tokenResult.tokens!.refresh_token!,
        clientId
      );

      expect(refreshResult.success).toBe(false);
    });
  });

  describe('Scope handling', () => {
    it('should check scope inclusion', () => {
      expect(server.hasScope('mcp:read mcp:write', 'mcp:read')).toBe(true);
      expect(server.hasScope('mcp:read mcp:write', 'mcp:admin')).toBe(false);
    });

    it('should get scope descriptions', () => {
      const descriptions = server.getScopeDescriptions('mcp:read mcp:write');

      expect(descriptions).toHaveLength(2);
      expect(descriptions[0].scope).toBe('mcp:read');
      expect(descriptions[0].description).toBe('読み取り専用アクセス');
    });
  });
});
