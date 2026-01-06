/**
 * Google OAuth Flow Integration Tests
 * Requirements: FR-2, FR-4 (OAuth Callback Server + Token Exchange)
 */

import { OAuthCallbackServer } from '../../src/oauth/oauth-callback-server.js';
import http from 'http';

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
