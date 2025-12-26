/**
 * MCP over HTTP E2E Tests
 * Requirements: 13.1, 13.4, 13.5
 *
 * Tests that MCP tools work correctly when accessed over HTTP.
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, writeFile, rm } from 'fs/promises';
import {
  createHTTPServerWithConfig,
  HTTPServerWithConfig,
} from '../../src/cli/http-server-with-config.js';
import { RemoteConfig } from '../../src/cli/remote-config-loader.js';

describe('MCP over HTTP E2E', () => {
  const testDir = join(tmpdir(), 'sage-mcp-http-test-' + Date.now());
  let server: HTTPServerWithConfig | null = null;
  const basePort = 14000;
  let portCounter = 0;

  function getNextPort(): number {
    return basePort + portCounter++;
  }

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

  async function createServer(port: number): Promise<HTTPServerWithConfig> {
    const configPath = join(testDir, `config-${port}.json`);
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
    return createHTTPServerWithConfig({ configPath });
  }

  describe('tools/list', () => {
    it('should return list of all sage tools', async () => {
      const port = getNextPort();
      server = await createServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        result: { tools: Array<{ name: string; description: string }> };
      };

      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result.tools).toBeDefined();
      expect(Array.isArray(body.result.tools)).toBe(true);

      const toolNames = body.result.tools.map((t) => t.name);
      expect(toolNames).toContain('check_setup_status');
      expect(toolNames).toContain('analyze_tasks');
      expect(toolNames).toContain('set_reminder');
      expect(toolNames).toContain('list_todos');
    });
  });

  describe('tools/call - check_setup_status', () => {
    it('should return setup status', async () => {
      const port = getNextPort();
      server = await createServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'check_setup_status',
            arguments: {},
          },
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        result: { content: Array<{ type: string; text: string }> };
      };

      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(2);
      expect(body.result.content).toBeDefined();
      expect(body.result.content[0].type).toBe('text');

      const content = JSON.parse(body.result.content[0].text);
      // Should indicate setup is not complete (no config file in test env)
      expect(content.setupComplete).toBeDefined();
    });
  });

  describe('tools/call - start_setup_wizard', () => {
    it('should start setup wizard and return first question', async () => {
      const port = getNextPort();
      server = await createServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'start_setup_wizard',
            arguments: { mode: 'quick' },
          },
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        result: { content: Array<{ type: string; text: string }> };
      };

      const content = JSON.parse(body.result.content[0].text);
      expect(content.sessionId).toBeDefined();
      expect(content.question).toBeDefined();
      expect(content.question.id).toBeDefined();
      expect(content.question.text).toBeDefined();
    });
  });

  describe('tools/call - error handling', () => {
    it('should return error for unknown tool', async () => {
      const port = getNextPort();
      server = await createServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'nonexistent_tool',
            arguments: {},
          },
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        error: { code: number; message: string };
      };

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toContain('not found');
    });

    it('should return error for missing tool name', async () => {
      const port = getNextPort();
      server = await createServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {},
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        error: { code: number; message: string };
      };

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32602);
    });
  });

  describe('initialize', () => {
    it('should handle initialize request', async () => {
      const port = getNextPort();
      server = await createServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 6,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        result: {
          protocolVersion: string;
          serverInfo: { name: string; version: string };
          capabilities: Record<string, unknown>;
        };
      };

      expect(body.result.protocolVersion).toBeDefined();
      expect(body.result.serverInfo.name).toBe('sage');
      expect(body.result.capabilities).toBeDefined();
    });
  });

  describe('with JWT authentication', () => {
    const validSecret = 'test-secret-key-at-least-32-characters-long';

    async function createAuthServer(port: number): Promise<HTTPServerWithConfig> {
      const configPath = join(testDir, `auth-config-${port}.json`);
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
          cors: { allowedOrigins: ['*'] },
        },
      };
      await writeFile(configPath, JSON.stringify(config));
      return createHTTPServerWithConfig({ configPath });
    }

    it('should require authentication for tools/list', async () => {
      const port = getNextPort();
      server = await createAuthServer(port);

      // Request without token should fail
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should allow authenticated requests', async () => {
      const port = getNextPort();
      server = await createAuthServer(port);

      // Get token first
      const tokenResponse = await fetch(`http://127.0.0.1:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: validSecret }),
      });

      expect(tokenResponse.status).toBe(200);
      const tokenBody = (await tokenResponse.json()) as { token: string };

      // Use token to make request
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenBody.token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        result: { tools: Array<{ name: string }> };
      };

      expect(body.result.tools).toBeDefined();
    });
  });
});
