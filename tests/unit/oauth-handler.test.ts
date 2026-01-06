/**
 * OAuth Handler Tests
 * Requirements: 22-31 (OAuth 2.1 HTTP Endpoints)
 *
 * Tests for OAuth HTTP handler including metadata endpoints, DCR, authorization, and token endpoints.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { OAuthHandler, OAuthHandlerConfig } from '../../src/oauth/oauth-handler.js';
import { OAuthServer } from '../../src/oauth/oauth-server.js';
import { OAuthClient, UserSession } from '../../src/oauth/types.js';

// Mock OAuthServer
jest.mock('../../src/oauth/oauth-server.js');

/**
 * Create a mock IncomingMessage
 */
function createMockRequest(options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.url = options.url || '/';
  req.method = options.method || 'GET';
  req.headers = options.headers || {};

  // Simulate body reading
  if (options.body !== undefined) {
    setImmediate(() => {
      req.emit('data', Buffer.from(options.body!));
      req.emit('end');
    });
  } else {
    setImmediate(() => {
      req.emit('end');
    });
  }

  return req;
}

/**
 * Create a mock ServerResponse
 */
function createMockResponse(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string | string[]>;
  _body: string;
} {
  const res = {
    _statusCode: 200,
    _headers: {} as Record<string, string | string[]>,
    _body: '',
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this._statusCode = statusCode;
      if (headers) {
        Object.assign(this._headers, headers);
      }
      return this;
    },
    setHeader(name: string, value: string | string[]) {
      this._headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return this._headers[name];
    },
    end(body?: string) {
      if (body) {
        this._body = body;
      }
    },
  } as ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string | string[]>;
    _body: string;
  };

  return res;
}

/**
 * Create a mock OAuthServer
 */
function createMockOAuthServer(): jest.Mocked<OAuthServer> {
  return {
    getProtectedResourceMetadata: jest.fn().mockReturnValue({
      resource: 'https://sage.example.com',
      authorization_servers: ['https://sage.example.com'],
      scopes_supported: ['mcp:read', 'mcp:write', 'mcp:admin'],
      bearer_methods_supported: ['header'],
    }),
    getAuthorizationServerMetadata: jest.fn().mockReturnValue({
      issuer: 'https://sage.example.com',
      authorization_endpoint: 'https://sage.example.com/oauth/authorize',
      token_endpoint: 'https://sage.example.com/oauth/token',
      registration_endpoint: 'https://sage.example.com/oauth/register',
      scopes_supported: ['mcp:read', 'mcp:write', 'mcp:admin'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
    }),
    registerClient: jest.fn(),
    getClient: jest.fn(),
    validateAuthorizationRequest: jest.fn(),
    validateSession: jest.fn(),
    storePendingAuthRequest: jest.fn(),
    getPendingAuthRequest: jest.fn(),
    completeAuthorization: jest.fn(),
    authenticateUser: jest.fn(),
    exchangeAuthorizationCode: jest.fn(),
    exchangeRefreshToken: jest.fn(),
    getScopeDescriptions: jest.fn().mockReturnValue([
      { scope: 'mcp:read', description: '読み取り専用アクセス' },
    ]),
    initialize: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OAuthServer>;
}

describe('OAuthHandler', () => {
  let handler: OAuthHandler;
  let mockServer: jest.Mocked<OAuthServer>;
  const config: OAuthHandlerConfig = {
    issuer: 'https://sage.example.com',
  };

  beforeEach(() => {
    mockServer = createMockOAuthServer();
    handler = new OAuthHandler(mockServer, config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create handler with server and config', () => {
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(OAuthHandler);
    });
  });

  describe('handleRequest routing', () => {
    it('should return false for unknown routes', async () => {
      const req = createMockRequest({ url: '/unknown', method: 'GET' });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(false);
    });

    it('should handle protected resource metadata endpoint', async () => {
      const req = createMockRequest({
        url: '/.well-known/oauth-protected-resource',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(mockServer.getProtectedResourceMetadata).toHaveBeenCalled();
      expect(res._statusCode).toBe(200);
      expect(res._headers['Content-Type']).toBe('application/json');
    });

    it('should handle authorization server metadata endpoint', async () => {
      const req = createMockRequest({
        url: '/.well-known/oauth-authorization-server',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(mockServer.getAuthorizationServerMetadata).toHaveBeenCalled();
      expect(res._statusCode).toBe(200);
    });
  });

  describe('client registration (POST /oauth/register)', () => {
    it('should register client successfully', async () => {
      const clientData = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      };

      const registeredClient: OAuthClient = {
        client_id: 'test_client_123',
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'none',
        client_id_issued_at: Date.now(),
      };

      mockServer.registerClient.mockResolvedValue({
        success: true,
        client: registeredClient,
      });

      const req = createMockRequest({
        url: '/oauth/register',
        method: 'POST',
        body: JSON.stringify(clientData),
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(mockServer.registerClient).toHaveBeenCalledWith(clientData);
      expect(res._statusCode).toBe(201);
      expect(JSON.parse(res._body)).toEqual(registeredClient);
    });

    it('should return error for invalid JSON body', async () => {
      const req = createMockRequest({
        url: '/oauth/register',
        method: 'POST',
        body: 'invalid json{',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toBe('invalid_client_metadata');
    });

    it('should return error when registration fails', async () => {
      mockServer.registerClient.mockResolvedValue({
        success: false,
        error: 'invalid_redirect_uri',
        errorDescription: 'Invalid redirect URI',
      });

      const req = createMockRequest({
        url: '/oauth/register',
        method: 'POST',
        body: JSON.stringify({
          client_name: 'Test',
          redirect_uris: ['invalid-uri'],
        }),
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toBe('invalid_redirect_uri');
    });
  });

  describe('authorization endpoint (GET /oauth/authorize)', () => {
    const validQuery = 'response_type=code&client_id=test_client&redirect_uri=https://example.com/callback&scope=mcp:read&state=abc123&code_challenge=ABCDEF123456&code_challenge_method=S256';

    it('should redirect to login when user is not authenticated', async () => {
      const mockClient: OAuthClient = {
        client_id: 'test_client',
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'none',
        client_id_issued_at: Date.now(),
      };

      mockServer.validateAuthorizationRequest.mockResolvedValue({
        valid: true,
        client: mockClient,
      });
      mockServer.validateSession.mockReturnValue(null);

      const req = createMockRequest({
        url: `/oauth/authorize?${validQuery}`,
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(302);
      expect(res._headers['Location']).toBe('https://sage.example.com/oauth/login');
    });

    it('should show consent page when user is authenticated', async () => {
      const mockClient: OAuthClient = {
        client_id: 'test_client',
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'none',
        client_id_issued_at: Date.now(),
      };

      const mockSession: UserSession = {
        sessionId: 'session_123',
        userId: 'user_123',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      mockServer.validateAuthorizationRequest.mockResolvedValue({
        valid: true,
        client: mockClient,
      });
      mockServer.validateSession.mockReturnValue(mockSession);

      const req = createMockRequest({
        url: `/oauth/authorize?${validQuery}`,
        method: 'GET',
        headers: { cookie: 'sage_session=session_123' },
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._body).toContain('認可リクエスト');
      expect(res._body).toContain('Test Client');
    });

    it('should redirect with error for invalid request', async () => {
      mockServer.validateAuthorizationRequest.mockResolvedValue({
        valid: false,
        error: {
          error: 'invalid_client',
          error_description: 'Unknown client',
        },
      });

      const req = createMockRequest({
        url: `/oauth/authorize?${validQuery}`,
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(302);
      expect(res._headers['Location']).toContain('error=invalid_client');
    });

    it('should show error page for corrupted request', async () => {
      const req = createMockRequest({
        url: '/oauth/authorize?response_type=code&client_id%20=test',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain('Corrupted request');
    });
  });

  describe('authorization submit (POST /oauth/authorize)', () => {
    it('should redirect with code when user approves', async () => {
      const mockSession: UserSession = {
        sessionId: 'session_123',
        userId: 'user_123',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      const pendingRequest = {
        request: {
          response_type: 'code' as const,
          client_id: 'test_client',
          redirect_uri: 'https://example.com/callback',
          scope: 'mcp:read',
          state: 'abc123',
          code_challenge: 'ABCDEF',
          code_challenge_method: 'S256' as const,
        },
        client: {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'] as const,
          grant_types: ['authorization_code'] as const,
          token_endpoint_auth_method: 'none' as const,
          client_id_issued_at: Date.now(),
        },
        createdAt: Date.now(),
      };

      mockServer.validateSession.mockReturnValue(mockSession);
      mockServer.getPendingAuthRequest.mockReturnValue(pendingRequest as any);
      mockServer.completeAuthorization.mockResolvedValue('auth_code_123');

      const req = createMockRequest({
        url: '/oauth/authorize',
        method: 'POST',
        headers: {
          cookie: 'sage_session=session_123; sage_auth_request=request_123',
        },
        body: 'approve=true',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(302);
      expect(res._headers['Location']).toContain('code=auth_code_123');
      expect(res._headers['Location']).toContain('state=abc123');
    });

    it('should redirect with access_denied when user denies', async () => {
      const mockSession: UserSession = {
        sessionId: 'session_123',
        userId: 'user_123',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      const pendingRequest = {
        request: {
          response_type: 'code' as const,
          client_id: 'test_client',
          redirect_uri: 'https://example.com/callback',
          scope: 'mcp:read',
          state: 'abc123',
          code_challenge: 'ABCDEF',
          code_challenge_method: 'S256' as const,
        },
        client: {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'] as const,
          grant_types: ['authorization_code'] as const,
          token_endpoint_auth_method: 'none' as const,
          client_id_issued_at: Date.now(),
        },
        createdAt: Date.now(),
      };

      mockServer.validateSession.mockReturnValue(mockSession);
      mockServer.getPendingAuthRequest.mockReturnValue(pendingRequest as any);

      const req = createMockRequest({
        url: '/oauth/authorize',
        method: 'POST',
        headers: {
          cookie: 'sage_session=session_123; sage_auth_request=request_123',
        },
        body: 'approve=false',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(302);
      expect(res._headers['Location']).toContain('error=access_denied');
    });

    it('should return error when auth request is expired', async () => {
      mockServer.getPendingAuthRequest.mockReturnValue(null);

      const req = createMockRequest({
        url: '/oauth/authorize',
        method: 'POST',
        headers: {
          cookie: 'sage_auth_request=expired_request',
        },
        body: 'approve=true',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain('expired');
    });
  });

  describe('login page (GET /oauth/login)', () => {
    it('should render login page', async () => {
      const req = createMockRequest({
        url: '/oauth/login',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._body).toContain('ログイン');
      expect(res._body).toContain('ユーザー名');
      expect(res._body).toContain('パスワード');
    });

    it('should display error message when provided', async () => {
      const req = createMockRequest({
        url: '/oauth/login?error=Invalid%20credentials',
        method: 'GET',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._body).toContain('Invalid credentials');
    });
  });

  describe('login submit (POST /oauth/login)', () => {
    it('should redirect to login with error on failed authentication', async () => {
      mockServer.authenticateUser.mockResolvedValue({
        success: false,
        error: 'Invalid username or password',
      });

      const req = createMockRequest({
        url: '/oauth/login',
        method: 'POST',
        body: 'username=testuser&password=wrongpass',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(302);
      expect(res._headers['Location']).toContain('/oauth/login?error=');
    });

    it('should set session cookie and show consent on successful login with pending request', async () => {
      const mockSession: UserSession = {
        sessionId: 'new_session_123',
        userId: 'user_123',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      const pendingRequest = {
        request: {
          response_type: 'code' as const,
          client_id: 'test_client',
          redirect_uri: 'https://example.com/callback',
          scope: 'mcp:read',
          state: 'abc123',
          code_challenge: 'ABCDEF',
          code_challenge_method: 'S256' as const,
        },
        client: {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'] as const,
          grant_types: ['authorization_code'] as const,
          token_endpoint_auth_method: 'none' as const,
          client_id_issued_at: Date.now(),
        },
        createdAt: Date.now(),
      };

      mockServer.authenticateUser.mockResolvedValue({
        success: true,
        session: mockSession,
      });
      mockServer.getPendingAuthRequest.mockReturnValue(pendingRequest as any);

      const req = createMockRequest({
        url: '/oauth/login',
        method: 'POST',
        headers: {
          cookie: 'sage_auth_request=request_123',
        },
        body: 'username=testuser&password=correctpass',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._headers['Set-Cookie']).toContain('sage_session=new_session_123');
      expect(res._body).toContain('認可リクエスト');
    });

    it('should redirect to issuer when no pending request', async () => {
      const mockSession: UserSession = {
        sessionId: 'new_session_123',
        userId: 'user_123',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };

      mockServer.authenticateUser.mockResolvedValue({
        success: true,
        session: mockSession,
      });
      mockServer.getPendingAuthRequest.mockReturnValue(null);

      const req = createMockRequest({
        url: '/oauth/login',
        method: 'POST',
        body: 'username=testuser&password=correctpass',
      });
      const res = createMockResponse();

      const handled = await handler.handleRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(302);
      expect(res._headers['Location']).toBe('https://sage.example.com');
    });
  });

  describe('token endpoint (POST /oauth/token)', () => {
    describe('authorization_code grant', () => {
      it('should exchange code for tokens successfully', async () => {
        const mockClient: OAuthClient = {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'],
          grant_types: ['authorization_code'],
          token_endpoint_auth_method: 'none',
          client_id_issued_at: Date.now(),
        };

        mockServer.getClient.mockResolvedValue(mockClient);
        mockServer.exchangeAuthorizationCode.mockResolvedValue({
          success: true,
          tokens: {
            access_token: 'access_token_123',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'refresh_token_123',
            scope: 'mcp:read',
          },
        });

        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=authorization_code&code=auth_code_123&client_id=test_client&redirect_uri=https://example.com/callback&code_verifier=verifier123',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(200);
        expect(res._headers['Cache-Control']).toBe('no-store');
        const body = JSON.parse(res._body);
        expect(body.access_token).toBe('access_token_123');
        expect(body.token_type).toBe('Bearer');
      });

      it('should return error for missing parameters', async () => {
        const mockClient: OAuthClient = {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'],
          grant_types: ['authorization_code'],
          token_endpoint_auth_method: 'none',
          client_id_issued_at: Date.now(),
        };

        mockServer.getClient.mockResolvedValue(mockClient);

        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=authorization_code&client_id=test_client',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(400);
        const body = JSON.parse(res._body);
        expect(body.error).toBe('invalid_request');
      });

      it('should return error for unknown client', async () => {
        mockServer.getClient.mockResolvedValue(null);

        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=authorization_code&code=auth_code_123&client_id=unknown_client&redirect_uri=https://example.com/callback&code_verifier=verifier123',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(401);
        const body = JSON.parse(res._body);
        expect(body.error).toBe('invalid_client');
      });

      it('should return error for invalid code', async () => {
        const mockClient: OAuthClient = {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'],
          grant_types: ['authorization_code'],
          token_endpoint_auth_method: 'none',
          client_id_issued_at: Date.now(),
        };

        mockServer.getClient.mockResolvedValue(mockClient);
        mockServer.exchangeAuthorizationCode.mockResolvedValue({
          success: false,
          error: {
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code',
          },
        });

        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=authorization_code&code=invalid_code&client_id=test_client&redirect_uri=https://example.com/callback&code_verifier=verifier123',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(400);
        const body = JSON.parse(res._body);
        expect(body.error).toBe('invalid_grant');
      });
    });

    describe('refresh_token grant', () => {
      it('should refresh tokens successfully', async () => {
        const mockClient: OAuthClient = {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'none',
          client_id_issued_at: Date.now(),
        };

        mockServer.getClient.mockResolvedValue(mockClient);
        mockServer.exchangeRefreshToken.mockResolvedValue({
          success: true,
          tokens: {
            access_token: 'new_access_token_123',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'new_refresh_token_123',
            scope: 'mcp:read',
          },
        });

        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=refresh_token&refresh_token=old_refresh_token&client_id=test_client',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(200);
        const body = JSON.parse(res._body);
        expect(body.access_token).toBe('new_access_token_123');
        expect(body.refresh_token).toBe('new_refresh_token_123');
      });

      it('should return error for missing refresh_token', async () => {
        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=refresh_token&client_id=test_client',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(400);
        const body = JSON.parse(res._body);
        expect(body.error).toBe('invalid_request');
      });

      it('should return error for unknown client', async () => {
        mockServer.getClient.mockResolvedValue(null);

        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=refresh_token&refresh_token=token123&client_id=unknown_client',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(401);
        const body = JSON.parse(res._body);
        expect(body.error).toBe('invalid_client');
      });

      it('should return error for invalid refresh_token', async () => {
        const mockClient: OAuthClient = {
          client_id: 'test_client',
          client_name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'none',
          client_id_issued_at: Date.now(),
        };

        mockServer.getClient.mockResolvedValue(mockClient);
        mockServer.exchangeRefreshToken.mockResolvedValue({
          success: false,
          error: {
            error: 'invalid_grant',
            error_description: 'Invalid or expired refresh token',
          },
        });

        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=refresh_token&refresh_token=invalid_token&client_id=test_client',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(400);
        const body = JSON.parse(res._body);
        expect(body.error).toBe('invalid_grant');
      });
    });

    describe('unsupported grant types', () => {
      it('should return error for unsupported grant_type', async () => {
        const req = createMockRequest({
          url: '/oauth/token',
          method: 'POST',
          body: 'grant_type=client_credentials&client_id=test_client',
        });
        const res = createMockResponse();

        const handled = await handler.handleRequest(req, res);

        expect(handled).toBe(true);
        expect(res._statusCode).toBe(400);
        const body = JSON.parse(res._body);
        expect(body.error).toBe('unsupported_grant_type');
      });
    });
  });

  describe('error handling', () => {
    it('should escape HTML in error messages', async () => {
      mockServer.validateAuthorizationRequest.mockResolvedValue({
        valid: false,
        error: {
          error: 'invalid_request',
          error_description: '<script>alert("xss")</script>',
        },
      });

      const req = createMockRequest({
        url: '/oauth/authorize?response_type=code&client_id=test',
        method: 'GET',
      });
      const res = createMockResponse();

      await handler.handleRequest(req, res);

      expect(res._body).not.toContain('<script>');
      expect(res._body).toContain('&lt;script&gt;');
    });
  });
});
