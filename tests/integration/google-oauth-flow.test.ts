/**
 * Google OAuth Flow Integration Tests
 * Requirements: FR-2, FR-4 (OAuth Callback Server + Token Exchange)
 */

import { OAuthCallbackServer } from '../../src/oauth/oauth-callback-server.js';
import { PendingGoogleAuthStore } from '../../src/oauth/pending-google-auth-store.js';
import { GoogleOAuthCallbackHandler } from '../../src/oauth/google-oauth-callback-handler.js';
import { GoogleOAuthHandler } from '../../src/oauth/google-oauth-handler.js';
import http, { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { URL } from 'url';

describe('Google OAuth Flow Integration', () => {
  let server: OAuthCallbackServer;

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.shutdown();
    }
  });

  describe('Callback Server Integration', () => {
    it('should capture callback and return result', async () => {
      server = new OAuthCallbackServer({ timeout: 10000, port: 4000 });
      const { port } = await server.start();

      // Start waiting for callback
      const callbackPromise = server.waitForCallback();

      // Simulate OAuth provider callback
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback?code=integration_test_code&state=test_state_123',
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => {
              expect(res.statusCode).toBe(200);
              expect(body).toContain('認証が完了しました');
              resolve();
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      // Verify callback result
      const result = await callbackPromise;
      expect(result.success).toBe(true);
      expect(result.code).toBe('integration_test_code');
      expect(result.state).toBe('test_state_123');
    });

    it('should handle error callback with proper HTML', async () => {
      server = new OAuthCallbackServer({ timeout: 10000, port: 4001 });
      const { port } = await server.start();

      const callbackPromise = server.waitForCallback();

      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback?error=access_denied&error_description=User%20cancelled',
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => {
              expect(res.statusCode).toBe(200);
              expect(body).toContain('認証に失敗しました');
              expect(body).toContain('access_denied');
              resolve();
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      const result = await callbackPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('access_denied');
      expect(result.errorDescription).toBe('User cancelled');
    });

    it('should shutdown after callback is processed', async () => {
      server = new OAuthCallbackServer({ timeout: 10000, port: 4002 });
      const { port } = await server.start();

      const callbackPromise = server.waitForCallback();

      // Send callback
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback?code=test',
            method: 'GET',
          },
          () => resolve()
        );
        req.end();
      });

      await callbackPromise;
      await server.shutdown();

      expect(server.isRunning()).toBe(false);
    });

    it('should handle multiple requests gracefully', async () => {
      server = new OAuthCallbackServer({ timeout: 10000, port: 4003 });
      const { port } = await server.start();

      const callbackPromise = server.waitForCallback();

      // First request (should be captured)
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback?code=first_code',
            method: 'GET',
          },
          () => resolve()
        );
        req.end();
      });

      const result = await callbackPromise;
      expect(result.code).toBe('first_code');

      // Second request (server should still respond)
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback?code=second_code',
            method: 'GET',
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            resolve();
          }
        );
        req.end();
      });
    });
  });

  describe('Port Management', () => {
    it('should release port after shutdown', async () => {
      server = new OAuthCallbackServer({ port: 4099 });
      await server.start();
      await server.shutdown();

      // Should be able to bind to the same port again
      const server2 = new OAuthCallbackServer({ port: 4099 });
      const { port } = await server2.start();
      expect(port).toBe(4099);
      await server2.shutdown();
    });
  });
});

// Mock googleapis for token exchange
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expiry_date: Date.now() + 3600000,
            scope: 'https://www.googleapis.com/auth/calendar',
          },
        }),
      })),
    },
  },
}));

/**
 * Remote OAuth Flow Integration Tests (T-10)
 * Requirements: remote-google-oauth spec
 *
 * Tests the full remote OAuth flow with:
 * - PendingGoogleAuthStore for session management
 * - GoogleOAuthCallbackHandler for callback processing
 * - Mock Google token endpoint
 */
describe('Remote OAuth Flow Integration (T-10)', () => {
  let httpServer: Server;
  let pendingAuthStore: PendingGoogleAuthStore;
  let callbackHandler: GoogleOAuthCallbackHandler;
  let serverPort: number;

  // Mock Google OAuth handler
  const mockGoogleOAuthHandler = {
    storeTokens: jest.fn().mockResolvedValue(undefined),
  } as unknown as GoogleOAuthHandler;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create a real PendingGoogleAuthStore (in-memory, not persisted)
    pendingAuthStore = new PendingGoogleAuthStore('test-encryption-key-32chars!!');

    // Create callback handler with mocked Google OAuth handler
    callbackHandler = new GoogleOAuthCallbackHandler({
      pendingAuthStore,
      googleOAuthHandler: mockGoogleOAuthHandler,
    });

    // Create HTTP server with callback endpoint
    httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost`);

      if (url.pathname === '/oauth/google/callback' && req.method === 'GET') {
        await callbackHandler.handleCallback(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Start server on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const address = httpServer.address();
        serverPort = typeof address === 'object' ? address!.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    jest.clearAllMocks();
  });

  describe('Full Remote OAuth Flow', () => {
    it('should create pending session and process callback', async () => {
      const redirectUri = `http://127.0.0.1:${serverPort}/oauth/google/callback`;

      // Step 1: Create pending auth session (simulates authenticate_google in remote mode)
      const { state, codeVerifier, codeChallenge } = pendingAuthStore.create(redirectUri);

      expect(state).toBeDefined();
      // PKCE RFC 7636: code_verifier should be 43-128 characters
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeVerifier.length).toBeLessThanOrEqual(128);
      expect(codeChallenge).toBeDefined();

      // Verify session is stored
      const session = pendingAuthStore.findByState(state);
      expect(session).not.toBeNull();
      expect(session?.redirectUri).toBe(redirectUri);

      // Step 2: Simulate Google callback (would normally come from Google after user auth)
      // Note: We can't actually exchange with Google, but we can verify the callback handling
      const responsePromise = new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/oauth/google/callback?code=test_auth_code&state=${state}`,
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode!, body }));
          }
        );
        req.on('error', reject);
        req.end();
      });

      // With mocked GoogleOAuthHandler, the callback should succeed
      const response = await responsePromise;

      // Should get success HTML response
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('認証が完了しました');
      expect(response.body).toContain('sage');

      // Verify tokens were stored via GoogleOAuthHandler
      expect(mockGoogleOAuthHandler.storeTokens).toHaveBeenCalled();
    });

    it('should reject callback with unknown state', async () => {
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: '/oauth/google/callback?code=test_code&state=unknown_state',
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode!, body }));
          }
        );
        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('認証に失敗しました');
      expect(response.body).toContain('セッション');
    });

    it('should reject callback without state parameter', async () => {
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: '/oauth/google/callback?code=test_code',
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode!, body }));
          }
        );
        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('認証に失敗しました');
      expect(response.body).toContain('state');
    });

    it('should handle OAuth error from Google', async () => {
      const redirectUri = `http://127.0.0.1:${serverPort}/oauth/google/callback`;
      const { state } = pendingAuthStore.create(redirectUri);

      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/oauth/google/callback?error=access_denied&state=${state}`,
            method: 'GET',
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode!, body }));
          }
        );
        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('認証に失敗しました');
      expect(response.body).toContain('拒否');
    });

    it('should cleanup expired sessions', async () => {
      const redirectUri = `http://127.0.0.1:${serverPort}/oauth/google/callback`;

      // Create a session
      const { state } = pendingAuthStore.create(redirectUri);
      expect(pendingAuthStore.getSessionCount()).toBe(1);

      // Session should exist
      expect(pendingAuthStore.findByState(state)).not.toBeNull();

      // Cleanup shouldn't remove non-expired session
      pendingAuthStore.cleanupExpired();
      expect(pendingAuthStore.getSessionCount()).toBe(1);
    });

    it('should generate valid PKCE parameters', async () => {
      const redirectUri = `http://127.0.0.1:${serverPort}/oauth/google/callback`;

      const { codeVerifier, codeChallenge } = pendingAuthStore.create(redirectUri);

      // code_verifier should be 43-128 characters
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeVerifier.length).toBeLessThanOrEqual(128);

      // code_challenge should be base64url encoded SHA256 hash
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('Session State Management', () => {
    it('should allow multiple concurrent sessions', async () => {
      const redirectUri = `http://127.0.0.1:${serverPort}/oauth/google/callback`;

      const session1 = pendingAuthStore.create(redirectUri);
      const session2 = pendingAuthStore.create(redirectUri);
      const session3 = pendingAuthStore.create(redirectUri);

      expect(pendingAuthStore.getSessionCount()).toBe(3);

      // Each session should have unique state
      expect(session1.state).not.toBe(session2.state);
      expect(session2.state).not.toBe(session3.state);

      // All sessions should be findable
      expect(pendingAuthStore.findByState(session1.state)).not.toBeNull();
      expect(pendingAuthStore.findByState(session2.state)).not.toBeNull();
      expect(pendingAuthStore.findByState(session3.state)).not.toBeNull();
    });

    it('should remove session after retrieval for use', async () => {
      const redirectUri = `http://127.0.0.1:${serverPort}/oauth/google/callback`;
      const { state } = pendingAuthStore.create(redirectUri);

      expect(pendingAuthStore.getSessionCount()).toBe(1);

      // Remove session
      pendingAuthStore.remove(state);

      expect(pendingAuthStore.getSessionCount()).toBe(0);
      expect(pendingAuthStore.findByState(state)).toBeNull();
    });
  });
});
