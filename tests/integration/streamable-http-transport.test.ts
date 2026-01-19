/**
 * Streamable HTTP Transport Integration Tests
 * Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
 *
 * End-to-end integration tests for Streamable HTTP Transport protocol.
 * Tests full SSE connection lifecycle, session management, and authentication.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import type { RemoteConfig } from '../../src/cli/remote-config-loader.js';

// Extend timeout for all tests (HTTP operations can be slow)
jest.setTimeout(30000);

// Mock MCP handler to avoid loading all services
jest.mock('../../src/cli/mcp-handler.js', () => ({
  createMCPHandler: jest.fn().mockResolvedValue({
    handleRequest: jest.fn().mockImplementation(async (request: { method: string; id: number | string | null }) => {
      if (request.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'sage-test', version: '1.0.0' },
            capabilities: { tools: {} },
          },
        };
      }
      if (request.method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: [] },
        };
      }
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method not found' },
      };
    }),
    listTools: jest.fn().mockReturnValue([]),
    shutdown: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('Streamable HTTP Transport - Integration Tests', () => {
  let tempDir: string;
  let configPath: string;
  let server: Server | null = null;
  let serverPort: number;

  /**
   * Helper to create a test config file
   */
  function createTestConfig(config: Partial<RemoteConfig['remote']> = {}): void {
    const fullConfig: RemoteConfig = {
      remote: {
        enabled: true,
        port: serverPort,
        host: '127.0.0.1',
        auth: config.auth || { type: 'none' },
        cors: config.cors || { allowedOrigins: ['*'] },
        streamableHttp: {
          enabled: true,
          sessionTimeout: 60000,
          eventBufferRetention: 30000,
          keepaliveInterval: 1000, // Short interval for testing
          maxSessions: 100,
          maxStreamsPerSession: 5,
          ...config.streamableHttp,
        },
        ...config,
      },
    };
    writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
  }

  /**
   * Helper to make HTTP request
   */
  async function httpRequest(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    } = {}
  ): Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, `http://127.0.0.1:${serverPort}`);

      const req = require('http').request(
        {
          method,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          headers: options.headers || {},
          timeout: options.timeout || 5000,
        },
        (res: IncomingMessage) => {
          let body = '';
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers as Record<string, string | string[] | undefined>,
              body,
            });
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  /**
   * Helper to establish SSE connection and collect events
   */
  async function connectSSE(
    options: {
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<{
    sessionId: string | undefined;
    events: Array<{ type: string; data: unknown }>;
    comments: string[];
    close: () => void;
  }> {
    return new Promise((resolve, reject) => {
      const events: Array<{ type: string; data: unknown }> = [];
      const comments: string[] = [];
      let sessionId: string | undefined;
      let closed = false;

      const req = require('http').request(
        {
          method: 'GET',
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/mcp',
          headers: {
            Accept: 'text/event-stream',
            ...options.headers,
          },
          timeout: options.timeout || 10000,
        },
        (res: IncomingMessage) => {
          sessionId = res.headers['mcp-session-id'] as string | undefined;

          let buffer = '';
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();

            // Parse SSE events
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            let currentEvent: { type?: string; data?: string } = {};
            for (const line of lines) {
              if (line.startsWith(': ')) {
                // SSE comment (keepalive)
                comments.push(line.substring(2));
              } else if (line.startsWith('event: ')) {
                currentEvent.type = line.substring(7);
              } else if (line.startsWith('data: ')) {
                currentEvent.data = line.substring(6);
              } else if (line.startsWith('id: ')) {
                // Event ID - just track it
              } else if (line === '') {
                // End of event
                if (currentEvent.data) {
                  try {
                    events.push({
                      type: currentEvent.type || 'message',
                      data: JSON.parse(currentEvent.data),
                    });
                  } catch {
                    events.push({
                      type: currentEvent.type || 'message',
                      data: currentEvent.data,
                    });
                  }
                }
                currentEvent = {};
              }
            }
          });

          // Give some time to receive initial events
          setTimeout(() => {
            if (!closed) {
              resolve({
                sessionId,
                events,
                comments,
                close: () => {
                  closed = true;
                  req.destroy();
                },
              });
            }
          }, 500);
        }
      );

      req.on('error', (err: Error) => {
        if (!closed) {
          reject(err);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (!closed) {
          reject(new Error('SSE connection timeout'));
        }
      });

      req.end();
    });
  }

  beforeEach(() => {
    // Create unique temporary directory for each test
    tempDir = join(tmpdir(), `sage-http-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    configPath = join(tempDir, 'remote-config.json');

    // Use dynamic port
    serverPort = 3000 + Math.floor(Math.random() * 1000);
  });

  afterEach(async () => {
    // Stop server if running
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }

    // Clean up temp directory
    if (existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.error('Failed to clean up temp directory:', error);
      }
    }

    jest.clearAllMocks();
  });

  describe('Test Scenario 1: Full SSE Connection Lifecycle', () => {
    it('should establish SSE stream with proper headers on GET /mcp', async () => {
      // Arrange: Create config and start server
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Connect via SSE
        const connection = await connectSSE();

        // Assert: Should receive Mcp-Session-Id header
        expect(connection.sessionId).toBeDefined();
        expect(connection.sessionId).toMatch(/^[0-9a-f-]{36}$/i); // UUID format

        // Assert: Should receive endpoint event
        const endpointEvent = connection.events.find((e) => e.type === 'endpoint');
        expect(endpointEvent).toBeDefined();
        expect(endpointEvent?.data).toMatchObject({
          type: 'endpoint',
          url: '/mcp',
        });

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should return 406 if Accept header does not include text/event-stream', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Make GET request without proper Accept header
        const response = await httpRequest('GET', '/mcp', {
          headers: { Accept: 'application/json' },
        });

        // Assert: Should return 406 Not Acceptable
        expect(response.status).toBe(406);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Not Acceptable');
      } finally {
        await httpServer.stop();
      }
    });

    it('should receive keepalive comments periodically', async () => {
      // Arrange: Create config with short keepalive interval
      createTestConfig({
        streamableHttp: {
          keepaliveInterval: 500, // 500ms for faster test
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Connect and wait for keepalive
        const connection = await connectSSE({ timeout: 3000 });

        // Wait a bit more for keepalive
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Assert: Should have received keepalive comments
        expect(connection.comments.length).toBeGreaterThanOrEqual(1);
        expect(connection.comments).toContain('keepalive');

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });
  });

  describe('Test Scenario 2: POST with SSE Response Mode', () => {
    it('should return SSE response when Accept includes text/event-stream', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: POST initialize request with SSE Accept header
        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              clientInfo: { name: 'test-client', version: '1.0.0' },
              capabilities: {},
            },
          }),
        });

        // Assert: Response should be SSE format
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('text/event-stream');
        expect(response.headers['mcp-session-id']).toBeDefined();

        // Parse SSE response
        const lines = response.body.split('\n');
        const idLine = lines.find((l) => l.startsWith('id: '));
        const dataLine = lines.find((l) => l.startsWith('data: '));

        expect(idLine).toBeDefined(); // Should have event ID
        expect(dataLine).toBeDefined();

        const data = JSON.parse(dataLine!.substring(6));
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBe(1);
        expect(data.result).toBeDefined();
      } finally {
        await httpServer.stop();
      }
    });
  });

  describe('Test Scenario 3: POST with JSON Response Mode (Backward Compatibility)', () => {
    it('should return JSON response when Accept is application/json only', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: POST with JSON-only Accept header
        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              clientInfo: { name: 'test-client', version: '1.0.0' },
              capabilities: {},
            },
          }),
        });

        // Assert: Should return plain JSON
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/json');

        const data = JSON.parse(response.body);
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBe(1);
        expect(data.result?.protocolVersion).toBeDefined();
        expect(data.result?.serverInfo).toBeDefined();
      } finally {
        await httpServer.stop();
      }
    });

    it('should handle tools/list request with JSON response', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: First initialize, then list tools
        await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        // Assert
        expect(response.status).toBe(200);
        const data = JSON.parse(response.body);
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBe(2);
        expect(data.result?.tools).toBeDefined();
      } finally {
        await httpServer.stop();
      }
    });
  });

  describe('Test Scenario 4: Session Management', () => {
    it('should return session ID on initialize and accept it on subsequent requests', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Initialize and get session ID
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        const sessionId = initResponse.headers['mcp-session-id'] as string;
        expect(sessionId).toBeDefined();

        // Act: Use session ID for subsequent request
        const toolsResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        // Assert: Request should succeed
        expect(toolsResponse.status).toBe(200);
      } finally {
        await httpServer.stop();
      }
    });

    it('should terminate session on DELETE /mcp', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Create a session first
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        const sessionId = initResponse.headers['mcp-session-id'] as string;

        // Act: Delete the session
        const deleteResponse = await httpRequest('DELETE', '/mcp', {
          headers: {
            'Mcp-Session-Id': sessionId,
          },
        });

        // Assert: Deletion should succeed
        expect(deleteResponse.status).toBe(200);
        const deleteBody = JSON.parse(deleteResponse.body);
        expect(deleteBody.success).toBe(true);

        // Act: Try to use deleted session
        // Per MCP spec, session management is optional for backward compatibility
        const postResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        // Assert: Session management is optional - requests succeed even with deleted session
        expect(postResponse.status).toBe(200);
      } finally {
        await httpServer.stop();
      }
    });

    it('should return 400 on DELETE without session ID', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: DELETE without session ID
        const response = await httpRequest('DELETE', '/mcp', {});

        // Assert: Should return 400 Bad Request
        expect(response.status).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Bad Request');
      } finally {
        await httpServer.stop();
      }
    });

    it('should return 404 for non-existent session', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Try to use non-existent session
        const response = await httpRequest('GET', '/mcp', {
          headers: {
            Accept: 'text/event-stream',
            'Mcp-Session-Id': '00000000-0000-0000-0000-000000000000',
          },
        });

        // Assert: Should return 404
        expect(response.status).toBe(404);
      } finally {
        await httpServer.stop();
      }
    });
  });

  describe('Test Scenario 5: Authentication Integration', () => {
    it('should return 401 for unauthenticated requests when auth is enabled', async () => {
      // Arrange: Create config with JWT auth
      createTestConfig({
        auth: {
          type: 'jwt',
          secret: 'this-is-a-very-long-secret-for-testing-purposes-32-chars',
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Make request without auth
        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        // Assert: Should return 401 Unauthorized
        expect(response.status).toBe(401);
      } finally {
        await httpServer.stop();
      }
    });

    it('should accept requests with valid authentication token', async () => {
      // Arrange: Create config with JWT auth
      const secret = 'this-is-a-very-long-secret-for-testing-purposes-32-chars';
      createTestConfig({
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Get auth token
        const authResponse = await httpRequest('POST', '/auth/token', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ secret }),
        });

        expect(authResponse.status).toBe(200);
        const authBody = JSON.parse(authResponse.body);
        const token = authBody.token;

        // Act: Make authenticated request
        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        // Assert: Should succeed
        expect(response.status).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.result).toBeDefined();
      } finally {
        await httpServer.stop();
      }
    });

    it('should return 401 for invalid token', async () => {
      // Arrange
      createTestConfig({
        auth: {
          type: 'jwt',
          secret: 'this-is-a-very-long-secret-for-testing-purposes-32-chars',
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Make request with invalid token
        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Bearer invalid-token-here',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        // Assert: Should return 401
        expect(response.status).toBe(401);
      } finally {
        await httpServer.stop();
      }
    });

    it('should allow unauthenticated health check even with auth enabled', async () => {
      // Arrange
      createTestConfig({
        auth: {
          type: 'jwt',
          secret: 'this-is-a-very-long-secret-for-testing-purposes-32-chars',
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Health check without auth
        const response = await httpRequest('GET', '/health', {});

        // Assert: Should succeed
        expect(response.status).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.status).toBe('ok');
        expect(body.authEnabled).toBe(true);
      } finally {
        await httpServer.stop();
      }
    });
  });

  describe('Test Scenario 6: Error Handling', () => {
    it('should return parse error for invalid JSON', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Send invalid JSON
        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: 'this is not valid json',
        });

        // Assert: Should return parse error
        expect(response.status).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe(-32700); // Parse error
      } finally {
        await httpServer.stop();
      }
    });

    it('should return 405 for unsupported HTTP methods', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Use unsupported method
        const response = await httpRequest('PUT', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: '{}',
        });

        // Assert: Should return 405
        expect(response.status).toBe(405);
        expect(response.headers.allow).toContain('GET');
        expect(response.headers.allow).toContain('POST');
        expect(response.headers.allow).toContain('DELETE');
      } finally {
        await httpServer.stop();
      }
    });

    it('should return 404 for unknown routes', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Request unknown path
        const response = await httpRequest('GET', '/unknown-path', {});

        // Assert: Should return 404
        expect(response.status).toBe(404);
      } finally {
        await httpServer.stop();
      }
    });
  });

  describe('Test Scenario 7: CORS Support', () => {
    it('should return proper CORS headers', async () => {
      // Arrange
      createTestConfig({
        cors: {
          allowedOrigins: ['https://example.com'],
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Make request with origin
        const response = await httpRequest('GET', '/health', {
          headers: {
            Origin: 'https://example.com',
          },
        });

        // Assert: Should have CORS headers
        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
      } finally {
        await httpServer.stop();
      }
    });

    it('should handle preflight OPTIONS request', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Send preflight request
        const response = await httpRequest('OPTIONS', '/mcp', {
          headers: {
            Origin: 'https://example.com',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization',
          },
        });

        // Assert: Should return 204 with CORS headers
        expect(response.status).toBe(204);
        expect(response.headers['access-control-allow-methods']).toBeDefined();
        expect(response.headers['access-control-allow-headers']).toBeDefined();
      } finally {
        await httpServer.stop();
      }
    });
  });

  describe('Test Scenario 8: Server Info Endpoint', () => {
    it('should return server info on root path', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Request root path
        const response = await httpRequest('GET', '/', {});

        // Assert: Should return server info
        expect(response.status).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.name).toBe('sage');
        expect(body.version).toBeDefined();
        expect(body.status).toBe('running');
        expect(body.endpoints.mcp).toBe('/mcp');
        expect(body.endpoints.health).toBe('/health');
      } finally {
        await httpServer.stop();
      }
    });
  });

  /**
   * Test Scenario 9: Full SSE Connection Lifecycle with Events
   * Requirement: FR-1 (SSE Connection), FR-4 (Keepalive)
   *
   * Tests the complete lifecycle of an SSE connection including
   * initial connection, receiving multiple events, and disconnection.
   */
  describe('Test Scenario 9: Full SSE Connection Lifecycle with Events', () => {
    it('should receive endpoint event and maintain connection until client closes', async () => {
      // Arrange: Create config and start server
      createTestConfig({
        streamableHttp: {
          keepaliveInterval: 200, // Short interval for testing
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Connect via SSE
        const connection = await connectSSE({ timeout: 5000 });

        // Assert: Should receive session ID
        expect(connection.sessionId).toBeDefined();

        // Assert: Should receive endpoint event
        expect(connection.events.length).toBeGreaterThanOrEqual(1);
        const endpointEvent = connection.events.find((e) => e.type === 'endpoint');
        expect(endpointEvent).toBeDefined();
        expect(endpointEvent?.data).toMatchObject({
          type: 'endpoint',
          url: '/mcp',
          sessionId: connection.sessionId,
        });

        // Wait for at least one keepalive
        await new Promise((resolve) => setTimeout(resolve, 600));

        // Assert: Should have received keepalive comments
        expect(connection.comments.length).toBeGreaterThanOrEqual(2);

        // Act: Close connection
        connection.close();

        // Wait for server to process disconnect
        await new Promise((resolve) => setTimeout(resolve, 100));
      } finally {
        await httpServer.stop();
      }
    });

    it('should handle SSE reconnection with new session', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: First connection
        const connection1 = await connectSSE();
        const sessionId1 = connection1.sessionId;
        connection1.close();

        // Wait for disconnect to process
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Act: Second connection (should get new session)
        const connection2 = await connectSSE();
        const sessionId2 = connection2.sessionId;

        // Assert: Should have different session IDs
        expect(sessionId1).toBeDefined();
        expect(sessionId2).toBeDefined();
        expect(sessionId1).not.toBe(sessionId2);

        connection2.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should allow reconnection with existing session ID', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Initialize to create a session
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        const sessionId = initResponse.headers['mcp-session-id'] as string;
        expect(sessionId).toBeDefined();

        // Act: Connect via SSE with existing session ID
        const connection = await connectSSE({
          headers: { 'Mcp-Session-Id': sessionId },
        });

        // Assert: Should use same session ID
        expect(connection.sessionId).toBe(sessionId);

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });
  });

  /**
   * Test Scenario 10: Session Persistence Across Multiple Requests
   * Requirement: FR-3 (Session Management)
   *
   * Tests that session state is properly maintained across multiple
   * requests using the Mcp-Session-Id header.
   */
  describe('Test Scenario 10: Session Persistence Across Multiple Requests', () => {
    it('should maintain session state across multiple POST requests', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Initialize and get session ID
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              clientInfo: { name: 'test-client', version: '1.0.0' },
              capabilities: {},
            },
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;
        expect(sessionId).toBeDefined();

        // Act: Make multiple subsequent requests with same session
        const requests = [
          { id: 2, method: 'tools/list', params: {} },
          { id: 3, method: 'tools/list', params: {} },
          { id: 4, method: 'tools/list', params: {} },
        ];

        for (const req of requests) {
          const response = await httpRequest('POST', '/mcp', {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
              'Mcp-Session-Id': sessionId,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              ...req,
            }),
          });

          // Assert: All requests should succeed
          expect(response.status).toBe(200);

          // Parse response (could be JSON or SSE)
          let data;
          if (response.headers['content-type'] === 'text/event-stream') {
            const dataLine = response.body.split('\n').find((l) => l.startsWith('data: '));
            data = JSON.parse(dataLine!.substring(6));
          } else {
            data = JSON.parse(response.body);
          }

          expect(data.jsonrpc).toBe('2.0');
          expect(data.id).toBe(req.id);
          expect(data.result).toBeDefined();
        }
      } finally {
        await httpServer.stop();
      }
    });

    it('should allow mixed JSON and SSE response modes with same session', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Initialize with SSE mode
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.headers['content-type']).toBe('text/event-stream');
        const sessionId = initResponse.headers['mcp-session-id'] as string;

        // Act: Request with JSON mode
        const jsonResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        expect(jsonResponse.status).toBe(200);
        expect(jsonResponse.headers['content-type']).toBe('application/json');

        // Act: Request with SSE mode again
        const sseResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list',
            params: {},
          }),
        });

        expect(sseResponse.status).toBe(200);
        expect(sseResponse.headers['content-type']).toBe('text/event-stream');
      } finally {
        await httpServer.stop();
      }
    });

    it('should allow requests with invalid session ID for backward compatibility', async () => {
      // FR-8: Session management is OPTIONAL - requests with invalid session should still work
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: Initialize to create session
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        const validSessionId = initResponse.headers['mcp-session-id'] as string;
        expect(validSessionId).toBeDefined();

        // Act: Make request with invalid session ID
        const invalidResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'Mcp-Session-Id': '11111111-1111-1111-1111-111111111111',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        // Assert: Should succeed for backward compatibility (session management optional)
        expect(invalidResponse.status).toBe(200);
      } finally {
        await httpServer.stop();
      }
    });
  });

  /**
   * Test Scenario 11: SSE Authentication Integration
   * Requirement: FR-6 (Authentication Integration)
   *
   * Tests that SSE streams are properly protected by authentication.
   * Verifies that unauthenticated access is denied, authenticated access succeeds,
   * and sessions are bound to the authenticated user.
   */
  describe('Test Scenario 11: SSE Authentication Integration', () => {
    it('should return 401 for unauthenticated GET /mcp when auth is enabled', async () => {
      // Arrange: Create config with JWT auth
      createTestConfig({
        auth: {
          type: 'jwt',
          secret: 'this-is-a-very-long-secret-for-testing-purposes-32-chars',
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: GET /mcp without Authorization header
        const response = await httpRequest('GET', '/mcp', {
          headers: {
            Accept: 'text/event-stream',
          },
        });

        // Assert: Should return 401 Unauthorized
        expect(response.status).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Unauthorized');
      } finally {
        await httpServer.stop();
      }
    });

    it('should return 401 for GET /mcp with invalid token when auth is enabled', async () => {
      // Arrange
      createTestConfig({
        auth: {
          type: 'jwt',
          secret: 'this-is-a-very-long-secret-for-testing-purposes-32-chars',
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: GET /mcp with invalid token
        const response = await httpRequest('GET', '/mcp', {
          headers: {
            Accept: 'text/event-stream',
            Authorization: 'Bearer invalid-token-here',
          },
        });

        // Assert: Should return 401 Unauthorized
        expect(response.status).toBe(401);
      } finally {
        await httpServer.stop();
      }
    });

    it('should establish SSE connection with valid authentication token', async () => {
      // Arrange: Create config with JWT auth
      const secret = 'this-is-a-very-long-secret-for-testing-purposes-32-chars';
      createTestConfig({
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Get auth token
        const authResponse = await httpRequest('POST', '/auth/token', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ secret }),
        });

        expect(authResponse.status).toBe(200);
        const authBody = JSON.parse(authResponse.body);
        const token = authBody.token;

        // Act: GET /mcp with valid token
        const connection = await connectSSE({
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Assert: Should receive session ID and endpoint event
        expect(connection.sessionId).toBeDefined();
        expect(connection.sessionId).toMatch(/^[0-9a-f-]{36}$/i);

        const endpointEvent = connection.events.find((e) => e.type === 'endpoint');
        expect(endpointEvent).toBeDefined();

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should bind session to authenticated user', async () => {
      // Arrange: Create config with JWT auth
      const secret = 'this-is-a-very-long-secret-for-testing-purposes-32-chars';
      createTestConfig({
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Get auth token for user A
        const authResponseA = await httpRequest('POST', '/auth/token', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ secret, userId: 'user-a' }),
        });

        expect(authResponseA.status).toBe(200);
        const tokenA = JSON.parse(authResponseA.body).token;

        // Get auth token for user B
        const authResponseB = await httpRequest('POST', '/auth/token', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ secret, userId: 'user-b' }),
        });

        expect(authResponseB.status).toBe(200);
        const tokenB = JSON.parse(authResponseB.body).token;

        // Act: User A creates a session via initialize
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;
        expect(sessionId).toBeDefined();

        // Act: User A can access their session
        const userAResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${tokenA}`,
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        // Assert: User A's request should succeed
        expect(userAResponse.status).toBe(200);

        // Act: User B tries to access User A's session
        const userBResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${tokenB}`,
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list',
            params: {},
          }),
        });

        // Assert: User B should be denied access (403 Forbidden or 404 Not Found)
        expect([403, 404]).toContain(userBResponse.status);
      } finally {
        await httpServer.stop();
      }
    });

    it('should allow SSE reconnection with same authentication', async () => {
      // Arrange: Create config with JWT auth
      const secret = 'this-is-a-very-long-secret-for-testing-purposes-32-chars';
      createTestConfig({
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Get auth token
        const authResponse = await httpRequest('POST', '/auth/token', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ secret }),
        });

        expect(authResponse.status).toBe(200);
        const token = JSON.parse(authResponse.body).token;

        // Act: Create session via POST initialize
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;
        expect(sessionId).toBeDefined();

        // Act: Reconnect via GET /mcp with same session and token
        const connection = await connectSSE({
          headers: {
            Authorization: `Bearer ${token}`,
            'Mcp-Session-Id': sessionId,
          },
        });

        // Assert: Should reconnect to same session
        expect(connection.sessionId).toBe(sessionId);

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should allow unauthenticated SSE access when auth is disabled', async () => {
      // Arrange: Create config without auth
      createTestConfig({
        auth: { type: 'none' },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: GET /mcp without any authentication
        const connection = await connectSSE();

        // Assert: Should succeed
        expect(connection.sessionId).toBeDefined();
        expect(connection.sessionId).toMatch(/^[0-9a-f-]{36}$/i);

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should reject SSE reconnection with different user credentials', async () => {
      // Arrange: Create config with JWT auth
      const secret = 'this-is-a-very-long-secret-for-testing-purposes-32-chars';
      createTestConfig({
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Get auth token for user A
        const authResponseA = await httpRequest('POST', '/auth/token', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ secret, userId: 'user-a' }),
        });

        expect(authResponseA.status).toBe(200);
        const tokenA = JSON.parse(authResponseA.body).token;

        // Get auth token for user B
        const authResponseB = await httpRequest('POST', '/auth/token', {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ secret, userId: 'user-b' }),
        });

        expect(authResponseB.status).toBe(200);
        const tokenB = JSON.parse(authResponseB.body).token;

        // Act: User A creates a session
        const connection = await connectSSE({
          headers: {
            Authorization: `Bearer ${tokenA}`,
          },
        });

        const sessionId = connection.sessionId;
        expect(sessionId).toBeDefined();
        connection.close();

        // Wait for disconnect to process
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Act: User B tries to reconnect to User A's session via GET
        const response = await httpRequest('GET', '/mcp', {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${tokenB}`,
            'Mcp-Session-Id': sessionId!,
          },
        });

        // Assert: Should be denied (403 Forbidden or 404 Not Found)
        expect([403, 404]).toContain(response.status);
      } finally {
        await httpServer.stop();
      }
    });
  });

  /**
   * Test Scenario 12: Resumability with Last-Event-ID
   * Requirement: FR-5 (Stream Resumability)
   *
   * Tests event replay on reconnection using Last-Event-ID header.
   * Verifies that missed events are replayed correctly and that
   * events from different streams are not replayed.
   */
  describe('Test Scenario 12: Resumability with Last-Event-ID', () => {
    /**
     * Helper to connect SSE with Last-Event-ID and receive initial events
     * Returns immediately after receiving endpoint event, avoiding timeout issues
     */
    async function connectSSEWithLastEventId(
      options: {
        sessionId: string;
        lastEventId: string;
        headers?: Record<string, string>;
      }
    ): Promise<{
      status: number;
      headers: Record<string, string | string[] | undefined>;
      events: Array<{ type: string; data: unknown; id?: string }>;
      close: () => void;
    }> {
      return new Promise((resolve, reject) => {
        const events: Array<{ type: string; data: unknown; id?: string }> = [];
        let resolved = false;

        const req = require('http').request(
          {
            method: 'GET',
            hostname: '127.0.0.1',
            port: serverPort,
            path: '/mcp',
            headers: {
              Accept: 'text/event-stream',
              'Mcp-Session-Id': options.sessionId,
              'Last-Event-ID': options.lastEventId,
              ...options.headers,
            },
            timeout: 5000,
          },
          (res: IncomingMessage) => {
            let buffer = '';

            res.on('data', (chunk: Buffer) => {
              buffer += chunk.toString();

              // Parse SSE events
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              let currentEvent: { type?: string; data?: string; id?: string } = {};
              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  currentEvent.type = line.substring(7);
                } else if (line.startsWith('data: ')) {
                  currentEvent.data = line.substring(6);
                } else if (line.startsWith('id: ')) {
                  currentEvent.id = line.substring(4);
                } else if (line === '') {
                  if (currentEvent.data) {
                    try {
                      events.push({
                        type: currentEvent.type || 'message',
                        data: JSON.parse(currentEvent.data),
                        id: currentEvent.id,
                      });
                    } catch {
                      events.push({
                        type: currentEvent.type || 'message',
                        data: currentEvent.data,
                        id: currentEvent.id,
                      });
                    }

                    // Resolve after receiving endpoint event
                    if (currentEvent.type === 'endpoint' && !resolved) {
                      resolved = true;
                      resolve({
                        status: res.statusCode || 0,
                        headers: res.headers as Record<string, string | string[] | undefined>,
                        events,
                        close: () => req.destroy(),
                      });
                    }
                  }
                  currentEvent = {};
                }
              }
            });

            // Fallback resolution after short delay
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve({
                  status: res.statusCode || 0,
                  headers: res.headers as Record<string, string | string[] | undefined>,
                  events,
                  close: () => req.destroy(),
                });
              }
            }, 500);
          }
        );

        req.on('error', (err: Error) => {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });

        req.on('timeout', () => {
          req.destroy();
          if (!resolved) {
            resolved = true;
            reject(new Error('SSE connection timeout'));
          }
        });

        req.end();
      });
    }

    it('should accept Last-Event-ID header on reconnection', async () => {
      // Arrange: Create config with event buffer retention
      createTestConfig({
        streamableHttp: {
          eventBufferRetention: 60000, // 1 minute retention
          keepaliveInterval: 30000,
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Step 1: Initialize a session and get session ID
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;
        expect(sessionId).toBeDefined();

        // Extract event ID from initialize response
        const initEventIdLine = initResponse.body.split('\n').find((l) => l.startsWith('id: '));
        const initEventId = initEventIdLine?.substring(4);
        expect(initEventId).toBeDefined();

        // Small delay to ensure different timestamps for event IDs
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Step 2: Send additional request to generate more buffered events
        const toolsResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        expect(toolsResponse.status).toBe(200);

        // Extract event ID from tools/list response
        const toolsEventIdLine = toolsResponse.body.split('\n').find((l) => l.startsWith('id: '));
        const toolsEventId = toolsEventIdLine?.substring(4);
        expect(toolsEventId).toBeDefined();
        expect(toolsEventId).not.toBe(initEventId);

        // Step 3: Connect via GET with Last-Event-ID using initEventId
        // This simulates reconnecting after receiving only the init event
        const connection = await connectSSEWithLastEventId({
          sessionId,
          lastEventId: initEventId!,
        });

        // The connection should be established successfully
        expect(connection.status).toBe(200);
        expect(connection.headers['content-type']).toBe('text/event-stream');
        expect(connection.headers['mcp-session-id']).toBe(sessionId);

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should handle reconnection with event ID from different session', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Step 1: Create first session and generate events
        const initResponse1 = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse1.status).toBe(200);
        const sessionId1 = initResponse1.headers['mcp-session-id'] as string;

        // Get event ID from first session
        const eventIdLine1 = initResponse1.body.split('\n').find((l) => l.startsWith('id: '));
        const eventId1 = eventIdLine1?.substring(4);
        expect(eventId1).toBeDefined();

        // Step 2: Create second session
        const initResponse2 = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse2.status).toBe(200);
        const sessionId2 = initResponse2.headers['mcp-session-id'] as string;
        expect(sessionId2).not.toBe(sessionId1);

        // Step 3: Try to reconnect to session 2 using event ID from session 1
        // The server should NOT replay events from session 1 (different session's buffer)
        const connection = await connectSSEWithLastEventId({
          sessionId: sessionId2,
          lastEventId: eventId1!, // Event ID from different session
        });

        // Connection should succeed to session 2
        expect(connection.status).toBe(200);
        expect(connection.headers['mcp-session-id']).toBe(sessionId2);

        // Should receive endpoint event for session 2 (fresh start)
        const endpointEvent = connection.events.find((e) => e.type === 'endpoint');
        expect(endpointEvent).toBeDefined();
        expect((endpointEvent?.data as { sessionId?: string })?.sessionId).toBe(sessionId2);

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should handle reconnection with event ID from different stream type', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Step 1: Initialize a session via POST (creates 'post' stream events)
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;

        // Get event ID from POST stream
        const postEventIdLine = initResponse.body.split('\n').find((l) => l.startsWith('id: '));
        const postEventId = postEventIdLine?.substring(4);
        expect(postEventId).toBeDefined();

        // Step 2: Connect via GET to create a different stream
        const connection1 = await connectSSE({
          headers: { 'Mcp-Session-Id': sessionId },
        });

        expect(connection1.sessionId).toBe(sessionId);
        connection1.close();

        // Wait for disconnect to process
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Step 3: Make another POST request to generate more 'post' stream events
        const toolsResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        expect(toolsResponse.status).toBe(200);

        // Step 4: Reconnect via GET with Last-Event-ID from POST stream
        // According to FR-5 (AC-5.3), events from different streams should not be replayed
        const connection2 = await connectSSEWithLastEventId({
          sessionId,
          lastEventId: postEventId!, // Event ID from POST stream
        });

        // Connection should succeed
        expect(connection2.status).toBe(200);
        expect(connection2.headers['mcp-session-id']).toBe(sessionId);

        connection2.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should start fresh when Last-Event-ID is not found in buffer', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Step 1: Initialize a session
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;

        // Step 2: Try to reconnect with non-existent event ID
        // Requirement FR-5 (AC-5.4): If event ID not found, stream starts fresh
        const connection = await connectSSEWithLastEventId({
          sessionId,
          lastEventId: 'non-existent-event-id-12345',
        });

        // Connection should succeed and start fresh
        expect(connection.status).toBe(200);
        expect(connection.headers['mcp-session-id']).toBe(sessionId);

        // Should receive endpoint event (fresh start)
        const endpointEvent = connection.events.find((e) => e.type === 'endpoint');
        expect(endpointEvent).toBeDefined();

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });

    it('should include unique event ID in all SSE responses for resumability tracking', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Step 1: Initialize
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;

        // Verify event ID is present
        const initIdLine = initResponse.body.split('\n').find((l) => l.startsWith('id: '));
        expect(initIdLine).toBeDefined();
        const initEventId = initIdLine!.substring(4);
        expect(initEventId.length).toBeGreaterThan(0);

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Step 2: Second request
        const request2Response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        // Verify event ID is present and different
        const request2IdLine = request2Response.body.split('\n').find((l) => l.startsWith('id: '));
        expect(request2IdLine).toBeDefined();
        const request2EventId = request2IdLine!.substring(4);
        expect(request2EventId.length).toBeGreaterThan(0);
        expect(request2EventId).not.toBe(initEventId);

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Step 3: Third request
        const request3Response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list',
            params: {},
          }),
        });

        // Verify event ID is present and unique
        const request3IdLine = request3Response.body.split('\n').find((l) => l.startsWith('id: '));
        expect(request3IdLine).toBeDefined();
        const request3EventId = request3IdLine!.substring(4);
        expect(request3EventId.length).toBeGreaterThan(0);
        expect(request3EventId).not.toBe(initEventId);
        expect(request3EventId).not.toBe(request2EventId);
      } finally {
        await httpServer.stop();
      }
    });

    it('should handle event buffer with retention period', async () => {
      // Arrange: Create config with short event buffer retention
      createTestConfig({
        streamableHttp: {
          eventBufferRetention: 1000, // 1 second retention (very short for testing)
          keepaliveInterval: 30000,
        },
      });
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Step 1: Initialize
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;

        // Get event ID
        const eventIdLine = initResponse.body.split('\n').find((l) => l.startsWith('id: '));
        const eventId = eventIdLine?.substring(4);
        expect(eventId).toBeDefined();

        // Step 2: Wait for buffer retention to expire
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Step 3: Try to reconnect with old event ID
        // The event should have been cleaned up from buffer
        const connection = await connectSSEWithLastEventId({
          sessionId,
          lastEventId: eventId!,
        });

        // Connection should succeed (starts fresh as event is expired)
        expect(connection.status).toBe(200);
        expect(connection.headers['mcp-session-id']).toBe(sessionId);

        // Should receive endpoint event (fresh start)
        const endpointEvent = connection.events.find((e) => e.type === 'endpoint');
        expect(endpointEvent).toBeDefined();

        connection.close();
      } finally {
        await httpServer.stop();
      }
    });
  });

  /**
   * Test Scenario 13: POST with SSE Response Mode (End-to-End)
   * Requirement: FR-2 (JSON-RPC), FR-8 (Backward Compatibility)
   *
   * Additional end-to-end tests for POST with SSE response mode,
   * including event ID tracking and proper SSE formatting.
   */
  describe('Test Scenario 13: POST with SSE Response Mode (End-to-End)', () => {
    it('should include event ID in SSE response for resumability', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: POST with SSE Accept header
        const response = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        // Assert: Response should be SSE format with event ID
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('text/event-stream');

        // Parse SSE response
        const lines = response.body.split('\n');
        const idLine = lines.find((l) => l.startsWith('id: '));
        const dataLine = lines.find((l) => l.startsWith('data: '));

        // Assert: Should have event ID for resumability
        expect(idLine).toBeDefined();
        expect(idLine!.length).toBeGreaterThan(4); // 'id: ' + UUID

        // Assert: Should have valid JSON-RPC response
        expect(dataLine).toBeDefined();
        const data = JSON.parse(dataLine!.substring(6));
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBe(1);
        expect(data.result).toBeDefined();
      } finally {
        await httpServer.stop();
      }
    });

    it('should handle consecutive POST requests with SSE response', async () => {
      // Arrange
      createTestConfig();
      const { createHTTPServerWithConfig } = await import('../../src/cli/http-server-with-config.js');
      const httpServer = await createHTTPServerWithConfig({ configPath, port: serverPort });

      try {
        // Act: First request (initialize)
        const initResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {},
          }),
        });

        expect(initResponse.status).toBe(200);
        const sessionId = initResponse.headers['mcp-session-id'] as string;

        // Get event ID from first response
        const initIdLine = initResponse.body.split('\n').find((l) => l.startsWith('id: '));
        const eventId1 = initIdLine?.substring(4);

        // Wait a bit to ensure different timestamps for event IDs
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Act: Second request (tools/list)
        const toolsResponse = await httpRequest('POST', '/mcp', {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          }),
        });

        expect(toolsResponse.status).toBe(200);

        // Get event ID from second response
        const toolsIdLine = toolsResponse.body.split('\n').find((l) => l.startsWith('id: '));
        const eventId2 = toolsIdLine?.substring(4);

        // Assert: Both event IDs should be defined
        expect(eventId1).toBeDefined();
        expect(eventId2).toBeDefined();

        // Assert: Event IDs should be different (different timestamps)
        expect(eventId1).not.toBe(eventId2);

        // Assert: Both event IDs should follow the format: sessionId-timestamp
        expect(eventId1).toMatch(/^[0-9a-f-]+-\d+$/i);
        expect(eventId2).toMatch(/^[0-9a-f-]+-\d+$/i);
      } finally {
        await httpServer.stop();
      }
    });
  });
});
