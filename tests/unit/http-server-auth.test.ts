/**
 * HTTP Server Authentication Integration Tests
 * Requirements: 15.1, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9
 *
 * TDD: RED phase - Writing tests before implementation
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, writeFile, rm } from 'fs/promises';
import {
  createHTTPServerWithConfig,
  HTTPServerWithConfig,
} from '../../src/cli/http-server-with-config.js';
import { RemoteConfig } from '../../src/cli/remote-config-loader.js';

describe('HTTP Server with Remote Config Integration', () => {
  const testDir = join(tmpdir(), 'sage-http-auth-test-' + Date.now());
  let server: HTTPServerWithConfig | null = null;

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
  });

  describe('createHTTPServerWithConfig', () => {
    it('should create server with config from file', async () => {
      const configPath = join(testDir, 'config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13100,
          host: '127.0.0.1',
          auth: {
            type: 'jwt',
            secret: 'test-secret-key-at-least-32-characters-long',
            expiresIn: '24h',
          },
          cors: {
            allowedOrigins: ['*'],
          },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });

      expect(server.isRunning()).toBe(true);
      expect(server.getPort()).toBe(13100);
      expect(server.getHost()).toBe('127.0.0.1');
      expect(server.isAuthEnabled()).toBe(true);
    });

    it('should use default port when config file not found', async () => {
      const nonExistentPath = join(testDir, 'nonexistent.json');

      server = await createHTTPServerWithConfig({
        configPath: nonExistentPath,
        port: 13101,
      });

      expect(server.isRunning()).toBe(true);
      expect(server.getPort()).toBe(13101);
    });

    it('should prioritize CLI options over config file', async () => {
      const configPath = join(testDir, 'config-override.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13102,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      // CLI options should override config file
      server = await createHTTPServerWithConfig({
        configPath,
        port: 13103,
        host: '0.0.0.0',
      });

      expect(server.getPort()).toBe(13103);
      expect(server.getHost()).toBe('0.0.0.0');
    });
  });

  describe('/auth/token endpoint with secret authentication', () => {
    const validSecret = 'test-secret-key-at-least-32-characters-long';

    beforeEach(async () => {
      const configPath = join(testDir, 'auth-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13104,
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
    });

    it('should return JWT token when secret is valid', async () => {
      const response = await fetch(`http://127.0.0.1:13104/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: validSecret }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { token: string; expiresIn: number };
      expect(body.token).toBeDefined();
      expect(body.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
      expect(body.expiresIn).toBe(3600); // 1h in seconds
    });

    it('should return 401 when secret is invalid', async () => {
      const response = await fetch(`http://127.0.0.1:13104/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'wrong-secret' }),
      });

      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain('Invalid');
    });

    it('should return 401 when secret is missing', async () => {
      const response = await fetch(`http://127.0.0.1:13104/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('/mcp endpoint with JWT authentication', () => {
    const validSecret = 'test-secret-key-at-least-32-characters-long';
    let validToken: string;

    beforeEach(async () => {
      const configPath = join(testDir, 'mcp-auth-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13105,
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

      // Get a valid token
      const tokenResponse = await fetch(`http://127.0.0.1:13105/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: validSecret }),
      });
      const tokenBody = (await tokenResponse.json()) as { token: string };
      validToken = tokenBody.token;
    });

    it('should allow access with valid Bearer token', async () => {
      const response = await fetch(`http://127.0.0.1:13105/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
          params: {},
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { jsonrpc: string; id: number; result: unknown };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
    });

    it('should reject access without Authorization header', async () => {
      const response = await fetch(`http://127.0.0.1:13105/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
          params: {},
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject access with invalid token', async () => {
      const response = await fetch(`http://127.0.0.1:13105/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
          params: {},
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('auth type none', () => {
    it('should allow access without authentication when auth type is none', async () => {
      const configPath = join(testDir, 'no-auth-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13106,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });

      const response = await fetch(`http://127.0.0.1:13106/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
          params: {},
        }),
      });

      expect(response.status).toBe(200);
    });

    it('should still allow /auth/token endpoint but return error', async () => {
      const configPath = join(testDir, 'no-auth-config2.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13107,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });

      const response = await fetch(`http://127.0.0.1:13107/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'any-secret' }),
      });

      // Should return an error since auth is disabled
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain('disabled');
    });
  });

  describe('CORS configuration', () => {
    it('should set CORS headers based on config', async () => {
      const configPath = join(testDir, 'cors-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13108,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: {
            allowedOrigins: ['https://example.com', 'https://test.com'],
          },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });

      const response = await fetch(`http://127.0.0.1:13108/health`, {
        method: 'GET',
        headers: {
          Origin: 'https://example.com',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    });

    it('should handle wildcard CORS origin', async () => {
      const configPath = join(testDir, 'cors-wildcard-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13109,
          host: '127.0.0.1',
          auth: { type: 'none' },
          cors: {
            allowedOrigins: ['*'],
          },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });

      const response = await fetch(`http://127.0.0.1:13109/health`, {
        method: 'GET',
        headers: {
          Origin: 'https://any-origin.com',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('/health endpoint', () => {
    it('should always be accessible without auth', async () => {
      const configPath = join(testDir, 'health-auth-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 13110,
          host: '127.0.0.1',
          auth: {
            type: 'jwt',
            secret: 'test-secret-key-at-least-32-characters-long',
            expiresIn: '1h',
          },
          cors: { allowedOrigins: ['*'] },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      server = await createHTTPServerWithConfig({ configPath });

      const response = await fetch(`http://127.0.0.1:13110/health`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe('ok');
    });
  });
});
