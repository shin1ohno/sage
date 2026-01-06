/**
 * Remote MCP Authentication E2E Tests
 * Requirements: 15.1-15.10
 *
 * Tests the complete authentication flow:
 * 1. Load remote config from file
 * 2. Start server with JWT authentication
 * 3. Authenticate with secret to get JWT token
 * 4. Use JWT token to access /mcp endpoint
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, writeFile, rm } from 'fs/promises';
import { createHTTPServerWithConfig, HTTPServerWithConfig } from '../../src/cli/http-server-with-config.js';
import { RemoteConfig } from '../../src/cli/remote-config-loader.js';
import { waitForServerReady } from '../utils/index.js';

describe('Remote MCP Authentication E2E', () => {
  const testDir = join(tmpdir(), 'sage-remote-auth-e2e-' + Date.now());
  let server: HTTPServerWithConfig | null = null;

  // Safety net timeout (tests should complete much faster with event-based detection)
  jest.setTimeout(30000);

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  }, 15000);

  describe('Complete Authentication Flow', () => {
    const validSecret = 'e2e-test-secret-key-at-least-32-characters-long';
    const port = 14001;

    beforeEach(async () => {
      const configPath = join(testDir, 'e2e-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port,
          host: '127.0.0.1',
          auth: {
            type: 'jwt',
            secret: validSecret,
            expiresIn: '1h',
          },
          cors: {
            allowedOrigins: ['*'],
          },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });
      // Wait for server to be ready (event-based, not fixed timeout)
      await waitForServerReady(`http://127.0.0.1:${port}/health`);
    });

    it('should complete full authentication workflow', async () => {
      // Step 1: Verify server is running (already verified by waitForServerReady)
      expect(server!.isRunning()).toBe(true);
      expect(server!.isAuthEnabled()).toBe(true);

      // Step 2: Health check (no auth required)
      const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
      expect(healthResponse.status).toBe(200);
      const healthBody = await healthResponse.json() as { status: string; authEnabled: boolean };
      expect(healthBody.status).toBe('ok');
      expect(healthBody.authEnabled).toBe(true);

      // Step 3: Try to access /mcp without auth (should fail)
      const noAuthResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
        }),
      });
      expect(noAuthResponse.status).toBe(401);

      // Step 4: Authenticate with secret to get JWT token
      const tokenResponse = await fetch(`http://127.0.0.1:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: validSecret }),
      });
      expect(tokenResponse.status).toBe(200);
      const tokenBody = await tokenResponse.json() as { token: string; expiresIn: number };
      expect(tokenBody.token).toBeDefined();
      expect(tokenBody.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
      expect(tokenBody.expiresIn).toBe(3600);

      // Step 5: Access /mcp with valid JWT token (should succeed)
      const mcpResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenBody.token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      });
      expect(mcpResponse.status).toBe(200);
      const mcpBody = await mcpResponse.json() as { jsonrpc: string; id: number; result: unknown };
      expect(mcpBody.jsonrpc).toBe('2.0');
      expect(mcpBody.id).toBe(1);
    });

    it('should reject invalid secret and not issue token', async () => {
      // Try to get token with wrong secret
      const tokenResponse = await fetch(`http://127.0.0.1:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'wrong-secret' }),
      });
      expect(tokenResponse.status).toBe(401);
      const body = await tokenResponse.json() as { error: string };
      expect(body.error).toContain('Invalid');
    });

    it('should reject tampered tokens', async () => {
      // Get a valid token
      const tokenResponse = await fetch(`http://127.0.0.1:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: validSecret }),
      });
      const tokenBody = await tokenResponse.json() as { token: string };

      // Tamper with the token (modify a character)
      const tamperedToken = tokenBody.token.slice(0, -1) + 'X';

      // Try to use tampered token
      const mcpResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tamperedToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
        }),
      });
      expect(mcpResponse.status).toBe(401);
    });

    it('should handle multiple sequential authenticated requests', async () => {
      // Get token
      const tokenResponse = await fetch(`http://127.0.0.1:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: validSecret }),
      });
      const tokenBody = await tokenResponse.json() as { token: string };
      const token = tokenBody.token;

      // Make multiple requests with the same token
      for (let i = 1; i <= 5; i++) {
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i,
            method: `test-${i}`,
          }),
        });
        expect(response.status).toBe(200);
        const body = await response.json() as { id: number };
        expect(body.id).toBe(i);
      }
    });
  });

  describe('No Authentication Mode', () => {
    const port = 14002;

    beforeEach(async () => {
      const configPath = join(testDir, 'no-auth-e2e-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });
    });

    it('should allow unauthenticated access when auth is disabled', async () => {
      // Verify auth is disabled
      expect(server!.isAuthEnabled()).toBe(false);

      // Health check
      const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
      const healthBody = await healthResponse.json() as { authEnabled: boolean };
      expect(healthBody.authEnabled).toBe(false);

      // Access /mcp without auth (should work)
      const mcpResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
        }),
      });
      expect(mcpResponse.status).toBe(200);
    });
  });

  describe('CORS Handling', () => {
    const port = 14003;

    beforeEach(async () => {
      const configPath = join(testDir, 'cors-e2e-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: {
            allowedOrigins: ['https://allowed.example.com'],
          },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });
    });

    it('should return allowed origin in CORS headers', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: {
          'Origin': 'https://allowed.example.com',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example.com');
    });

    it('should handle preflight OPTIONS request', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://allowed.example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });

  describe('Config File Loading', () => {
    it('should use config from specified path', async () => {
      const configPath = join(testDir, 'custom-path-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 14004,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });

      expect(server.getPort()).toBe(14004);
      expect(server.getConfig().remote.port).toBe(14004);
    });

    it('should fall back to defaults when config file missing', async () => {
      const nonExistentPath = join(testDir, 'missing.json');

      server = await createHTTPServerWithConfig({
        configPath: nonExistentPath,
        port: 14005,
      });

      // Should use CLI option for port
      expect(server.getPort()).toBe(14005);
      // Should use default for auth
      expect(server.isAuthEnabled()).toBe(false);
    });
  });
});
