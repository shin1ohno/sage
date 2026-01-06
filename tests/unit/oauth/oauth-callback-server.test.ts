/**
 * OAuth Callback Server Tests
 * Requirements: FR-2 (Local HTTP Callback Server)
 */

import { OAuthCallbackServer } from '../../../src/oauth/oauth-callback-server.js';
import http from 'http';

describe('OAuthCallbackServer', () => {
  let server: OAuthCallbackServer;

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.shutdown();
    }
  });

  describe('Server Lifecycle (Task 12)', () => {
    it('should start and bind to default port', async () => {
      server = new OAuthCallbackServer();
      const { port, callbackUrl } = await server.start();

      expect(port).toBeGreaterThanOrEqual(3000);
      expect(callbackUrl).toContain('http://127.0.0.1');
      expect(callbackUrl).toContain('/oauth/callback');
      expect(server.isRunning()).toBe(true);
    });

    it('should shutdown and release port', async () => {
      server = new OAuthCallbackServer();
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.shutdown();
      expect(server.isRunning()).toBe(false);
    });

    it('should throw if started twice', async () => {
      server = new OAuthCallbackServer();
      await server.start();

      await expect(server.start()).rejects.toThrow('Server is already running');
    });

    it('should only bind to localhost', async () => {
      server = new OAuthCallbackServer();
      const { callbackUrl } = await server.start();

      expect(callbackUrl).toContain('127.0.0.1');
    });

    it('should track server state', async () => {
      server = new OAuthCallbackServer();

      const stateBefore = server.getState();
      expect(stateBefore.isRunning).toBe(false);
      expect(stateBefore.port).toBeNull();

      await server.start();

      const stateAfter = server.getState();
      expect(stateAfter.isRunning).toBe(true);
      expect(stateAfter.port).toBeGreaterThanOrEqual(3000);
      expect(stateAfter.startedAt).not.toBeNull();
    });
  });

  describe('Callback Handling (Task 13)', () => {
    it('should capture successful callback with code', async () => {
      server = new OAuthCallbackServer({ timeout: 5000 });
      const { port } = await server.start();

      // Make callback request in background
      const callbackPromise = server.waitForCallback();

      // Simulate OAuth callback
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback?code=test_auth_code&state=test_state',
            method: 'GET',
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            resolve();
          }
        );
        req.end();
      });

      const result = await callbackPromise;

      expect(result.success).toBe(true);
      expect(result.code).toBe('test_auth_code');
      expect(result.state).toBe('test_state');
    });

    it('should capture error callback', async () => {
      server = new OAuthCallbackServer({ timeout: 5000 });
      const { port } = await server.start();

      const callbackPromise = server.waitForCallback();

      // Simulate error callback
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback?error=access_denied&error_description=User%20denied%20access',
            method: 'GET',
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            resolve();
          }
        );
        req.end();
      });

      const result = await callbackPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('access_denied');
      expect(result.errorDescription).toBe('User denied access');
    });

    it('should return 404 for non-callback paths', async () => {
      server = new OAuthCallbackServer();
      const { port } = await server.start();

      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/other-path',
            method: 'GET',
          },
          (res) => {
            expect(res.statusCode).toBe(404);
            resolve();
          }
        );
        req.end();
      });
    });

    it('should return error HTML for missing parameters', async () => {
      server = new OAuthCallbackServer({ timeout: 5000 });
      const { port } = await server.start();

      const callbackPromise = server.waitForCallback();

      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/oauth/callback',
            method: 'GET',
          },
          (res) => {
            expect(res.statusCode).toBe(400);
            resolve();
          }
        );
        req.end();
      });

      const result = await callbackPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_request');
    });
  });

  describe('Timeout and Port Fallback (Task 14)', () => {
    it('should timeout after specified duration', async () => {
      server = new OAuthCallbackServer({ timeout: 100 }); // 100ms timeout
      await server.start();

      await expect(server.waitForCallback()).rejects.toThrow(/timeout/i);
    });

    it('should fallback to next port if primary is in use', async () => {
      // Start first server on port 3000
      const server1 = new OAuthCallbackServer({ port: 3000 });
      const { port: port1 } = await server1.start();

      // Start second server - should fallback to 3001
      server = new OAuthCallbackServer({ port: 3000 });
      const { port: port2 } = await server.start();

      expect(port2).toBeGreaterThan(port1);

      await server1.shutdown();
    });

    it('should reject if no ports available', async () => {
      // Start servers on ports 3000-3010
      const servers: OAuthCallbackServer[] = [];
      try {
        for (let i = 0; i <= 10; i++) {
          const s = new OAuthCallbackServer({ port: 3000 + i });
          await s.start();
          servers.push(s);
        }

        // Now all ports should be used
        server = new OAuthCallbackServer({ port: 3000 });
        await expect(server.start()).rejects.toThrow(/Failed to bind/);
      } finally {
        // Clean up all servers
        for (const s of servers) {
          await s.shutdown();
        }
      }
    }, 30000);

    it('should reject waitForCallback if server not running', async () => {
      server = new OAuthCallbackServer();

      await expect(server.waitForCallback()).rejects.toThrow('Server is not running');
    });

    it('should auto-shutdown on timeout', async () => {
      server = new OAuthCallbackServer({ timeout: 100 });
      await server.start();

      try {
        await server.waitForCallback();
      } catch {
        // Expected timeout
      }

      // Wait a bit for shutdown to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(server.isRunning()).toBe(false);
    });
  });
});
