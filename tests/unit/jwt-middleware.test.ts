/**
 * JWT Authentication Middleware Unit Tests
 * Requirements: 15.7, 15.8
 *
 * TDD: RED phase - Writing tests before implementation
 */

import { IncomingMessage, ServerResponse } from 'http';
import { createJWTMiddleware, JWTMiddleware } from '../../src/cli/jwt-middleware.js';
import { createSecretAuthenticator } from '../../src/cli/secret-auth.js';

// Helper to create mock request
function createMockRequest(headers: Record<string, string> = {}): IncomingMessage {
  const req = {
    headers: {
      ...headers,
    },
    url: '/mcp',
    method: 'POST',
  } as IncomingMessage;
  return req;
}

// Helper to create mock response
function createMockResponse(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 200,
    body: '',
    setHeader: jest.fn(),
    end: jest.fn(function (this: { body: string }, data?: string) {
      this.body = data || '';
    }),
    writeHead: jest.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
    }),
  } as unknown as ServerResponse & { statusCode: number; body: string };
  return res;
}

describe('JWT Middleware', () => {
  const validSecret = 'test-secret-key-at-least-32-characters-long';
  const expiresIn = '24h';

  let authenticator: ReturnType<typeof createSecretAuthenticator>;
  let validToken: string;

  beforeAll(async () => {
    authenticator = createSecretAuthenticator({
      secret: validSecret,
      expiresIn,
    });
    const result = await authenticator.authenticate(validSecret);
    validToken = result.token!;
  });

  describe('createJWTMiddleware', () => {
    it('should create middleware with valid config', () => {
      const middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
      });

      expect(middleware).toBeDefined();
      expect(middleware.authenticate).toBeDefined();
      expect(middleware.generateToken).toBeDefined();
    });

    it('should throw error when secret is too short', () => {
      expect(() =>
        createJWTMiddleware({
          secret: 'short',
          expiresIn,
        })
      ).toThrow();
    });
  });

  describe('authenticate', () => {
    let middleware: JWTMiddleware;

    beforeEach(() => {
      middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
      });
    });

    it('should allow access with valid Bearer token', async () => {
      const req = createMockRequest({
        authorization: `Bearer ${validToken}`,
      });
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject access without Authorization header', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Missing');
      expect(res.statusCode).toBe(401);
    });

    it('should reject access with invalid token format', async () => {
      const req = createMockRequest({
        authorization: 'Bearer invalid-token',
      });
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it('should reject access with expired token', async () => {
      // Create a middleware with very short expiration
      const shortLivedMiddleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn: '1s',
      });

      const tokenResult = await shortLivedMiddleware.generateToken(validSecret);
      expect(tokenResult.success).toBe(true);

      // Wait for token to expire (2 seconds to be safe)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const req = createMockRequest({
        authorization: `Bearer ${tokenResult.token}`,
      });
      const res = createMockResponse();

      const result = await shortLivedMiddleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('expired');
      expect(res.statusCode).toBe(401);
    }, 10000); // Increase test timeout

    it('should reject access with wrong Authorization scheme', async () => {
      const req = createMockRequest({
        authorization: `Basic ${validToken}`,
      });
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain('Bearer');
      expect(res.statusCode).toBe(401);
    });

    it('should reject access with empty Bearer token', async () => {
      const req = createMockRequest({
        authorization: 'Bearer ',
      });
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it('should reject access with malformed Authorization header', async () => {
      const req = createMockRequest({
        authorization: 'BearerNoSpace',
      });
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(res.statusCode).toBe(401);
    });

    it('should be case-insensitive for Bearer scheme', async () => {
      const req = createMockRequest({
        authorization: `bearer ${validToken}`,
      });
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(true);
    });

    it('should handle token signed with different secret', async () => {
      const otherMiddleware = createJWTMiddleware({
        secret: 'another-secret-key-at-least-32-chars',
        expiresIn,
      });
      const otherToken = await otherMiddleware.generateToken(
        'another-secret-key-at-least-32-chars'
      );

      const req = createMockRequest({
        authorization: `Bearer ${otherToken.token}`,
      });
      const res = createMockResponse();

      // Try to authenticate with different middleware
      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('generateToken', () => {
    let middleware: JWTMiddleware;

    beforeEach(() => {
      middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
      });
    });

    it('should generate token with valid secret', async () => {
      const result = await middleware.generateToken(validSecret);

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(86400);
    });

    it('should reject invalid secret', async () => {
      const result = await middleware.generateToken('wrong-secret');

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.error).toContain('Invalid');
    });

    it('should generate unique tokens', async () => {
      const result1 = await middleware.generateToken(validSecret);
      const result2 = await middleware.generateToken(validSecret);

      expect(result1.token).not.toBe(result2.token);
    });
  });

  describe('skipPaths', () => {
    it('should skip authentication for configured paths', async () => {
      const middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
        skipPaths: ['/health', '/auth/token'],
      });

      const healthReq = createMockRequest({});
      (healthReq as { url: string }).url = '/health';
      const healthRes = createMockResponse();

      const healthResult = await middleware.authenticate(healthReq, healthRes);
      expect(healthResult.authenticated).toBe(true);
      expect(healthResult.skipped).toBe(true);

      const authReq = createMockRequest({});
      (authReq as { url: string }).url = '/auth/token';
      const authRes = createMockResponse();

      const authResult = await middleware.authenticate(authReq, authRes);
      expect(authResult.authenticated).toBe(true);
      expect(authResult.skipped).toBe(true);
    });

    it('should still require auth for non-skipped paths', async () => {
      const middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
        skipPaths: ['/health'],
      });

      const req = createMockRequest({});
      (req as { url: string }).url = '/mcp';
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result.authenticated).toBe(false);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('error response format', () => {
    it('should return JSON error response', async () => {
      const middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
      });

      const req = createMockRequest({});
      const res = createMockResponse();

      await middleware.authenticate(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res.body).toContain('error');
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
    });
  });

  describe('AuthResult interface', () => {
    it('should have all required fields on success', async () => {
      const middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
      });

      const req = createMockRequest({
        authorization: `Bearer ${validToken}`,
      });
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result).toHaveProperty('authenticated');
      expect(result.authenticated).toBe(true);
    });

    it('should have error field on failure', async () => {
      const middleware = createJWTMiddleware({
        secret: validSecret,
        expiresIn,
      });

      const req = createMockRequest({});
      const res = createMockResponse();

      const result = await middleware.authenticate(req, res);

      expect(result).toHaveProperty('authenticated');
      expect(result).toHaveProperty('error');
      expect(result.authenticated).toBe(false);
    });
  });
});
