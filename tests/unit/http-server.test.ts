/**
 * HTTP Server Mode Unit Tests
 * Requirements: 14.1, 14.9, 14.10, 13.1
 *
 * TDD: RED phase - Writing tests before implementation
 */

import {
  createHTTPServer,
  HTTPServerConfig,
  HTTPServerInstance,
} from '../../src/cli/http-server.js';

describe('HTTP Server Mode', () => {
  let server: HTTPServerInstance | null = null;

  afterEach(async () => {
    // Cleanup server after each test
    if (server) {
      await server.stop();
      server = null;
    }
  });

  describe('createHTTPServer', () => {
    it('should create an HTTP server with default config', async () => {
      const config: HTTPServerConfig = {
        port: 3100,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      expect(server).toBeDefined();
      expect(server.isRunning()).toBe(true);
      expect(server.getPort()).toBe(3100);
    });

    it('should use custom port from config', async () => {
      const config: HTTPServerConfig = {
        port: 8888,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      expect(server.getPort()).toBe(8888);
    });

    it('should use custom host from config', async () => {
      const config: HTTPServerConfig = {
        port: 3101,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      expect(server.getHost()).toBe('127.0.0.1');
    });
  });

  describe('Health check endpoint', () => {
    it('should respond with 200 on /health endpoint', async () => {
      const config: HTTPServerConfig = {
        port: 3102,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3102/health');
      expect(response.status).toBe(200);

      const body = await response.json() as {
        status: string;
        version: string;
        uptime: number;
        timestamp: string;
      };
      expect(body.status).toBe('ok');
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('MCP endpoint', () => {
    it('should accept JSON-RPC requests on /mcp endpoint', async () => {
      const config: HTTPServerConfig = {
        port: 3103,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3103/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json() as { jsonrpc: string; id: number };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
    });

    it('should return error for invalid JSON', async () => {
      const config: HTTPServerConfig = {
        port: 3104,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3104/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      expect(response.status).toBe(400);

      const body = await response.json() as { error: { code: number; message: string } };
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32700);
    });

    it('should return error for invalid JSON-RPC request', async () => {
      const config: HTTPServerConfig = {
        port: 3105,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3105/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invalid: 'request' }),
      });

      expect(response.status).toBe(400);

      const body = await response.json() as { error: { code: number } };
      expect(body.error).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should accept requests with valid API key', async () => {
      const config: HTTPServerConfig = {
        port: 3106,
        host: '127.0.0.1',
        auth: {
          enabled: true,
          apiKeys: ['test-api-key'],
        },
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3106/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(200);
    });

    it('should reject requests with invalid API key', async () => {
      const config: HTTPServerConfig = {
        port: 3107,
        host: '127.0.0.1',
        auth: {
          enabled: true,
          apiKeys: ['valid-key'],
        },
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3107/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'invalid-key',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject requests without credentials when auth is enabled', async () => {
      const config: HTTPServerConfig = {
        port: 3108,
        host: '127.0.0.1',
        auth: {
          enabled: true,
          apiKeys: ['test-key'],
        },
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3108/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Auth token endpoint', () => {
    it('should generate token on /auth/token endpoint', async () => {
      const config: HTTPServerConfig = {
        port: 3109,
        host: '127.0.0.1',
        auth: {
          enabled: true,
          jwtSecret: 'test-secret',
          apiKeys: ['admin-key'],
        },
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3109/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'admin-key',
        },
        body: JSON.stringify({
          userId: 'test-user',
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json() as { token: string };
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
    });
  });

  describe('Server lifecycle', () => {
    it('should start and stop cleanly', async () => {
      const config: HTTPServerConfig = {
        port: 3110,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);
      server = null; // Prevent double cleanup
    });

    it('should return server info', async () => {
      const config: HTTPServerConfig = {
        port: 3111,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const info = server.getServerInfo();
      expect(info.port).toBe(3111);
      expect(info.host).toBe('127.0.0.1');
      expect(info.ssl).toBe(false);
      expect(info.authEnabled).toBe(false);
    });

    it('should not allow starting twice', async () => {
      const config: HTTPServerConfig = {
        port: 3112,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      // Starting again should be a no-op
      await server.start();
      expect(server.isRunning()).toBe(true);
    });
  });

  describe('CORS headers', () => {
    it('should include CORS headers in response', async () => {
      const config: HTTPServerConfig = {
        port: 3113,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3113/health');

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const config: HTTPServerConfig = {
        port: 3114,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3114/mcp', {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const config: HTTPServerConfig = {
        port: 3115,
        host: '127.0.0.1',
      };

      server = await createHTTPServer(config);

      const response = await fetch('http://127.0.0.1:3115/unknown');

      expect(response.status).toBe(404);
    });
  });
});

describe('HTTPServerConfig', () => {
  it('should accept minimal config', () => {
    const config: HTTPServerConfig = {
      port: 3000,
      host: '0.0.0.0',
    };

    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
  });

  it('should accept auth config', () => {
    const config: HTTPServerConfig = {
      port: 3000,
      host: '0.0.0.0',
      auth: {
        enabled: true,
        apiKeys: ['key1', 'key2'],
        jwtSecret: 'secret',
      },
    };

    expect(config.auth?.enabled).toBe(true);
    expect(config.auth?.apiKeys).toHaveLength(2);
  });

  it('should accept configPath', () => {
    const config: HTTPServerConfig = {
      port: 3000,
      host: '0.0.0.0',
      configPath: '/custom/config.json',
    };

    expect(config.configPath).toBe('/custom/config.json');
  });
});
