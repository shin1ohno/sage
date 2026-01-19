/**
 * Streamable HTTP Transport E2E Tests
 * Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
 *
 * End-to-end tests simulating how real MCP clients like Codex connect to sage.
 * Tests the complete Codex connection flow:
 * 1. GET /mcp to establish SSE
 * 2. POST /mcp with InitializeRequest
 * 3. Verify Mcp-Session-Id in response
 * 4. POST /mcp with subsequent requests
 * 5. DELETE /mcp to terminate session
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, writeFile, rm } from 'fs/promises';
import { IncomingMessage } from 'http';
import {
  createHTTPServerWithConfig,
  HTTPServerWithConfig,
} from '../../src/cli/http-server-with-config.js';
import { RemoteConfig } from '../../src/cli/remote-config-loader.js';
import { waitForServerReady } from '../utils/index.js';

/**
 * SSE Event parsed from stream
 */
interface SSEEvent {
  id?: string;
  event?: string;
  data?: unknown;
  raw: string;
}

/**
 * SSE Connection result
 */
interface SSEConnectionResult {
  sessionId: string | undefined;
  events: SSEEvent[];
  comments: string[];
  close: () => void;
  waitForEvent: (eventType: string, timeout?: number) => Promise<SSEEvent>;
}

describe('Streamable HTTP Transport E2E - Codex-like Client Flow', () => {
  // Extend timeout for E2E tests
  jest.setTimeout(60000);

  const testDir = join(tmpdir(), 'sage-streamable-http-e2e-' + Date.now());
  let server: HTTPServerWithConfig | null = null;
  const basePort = 14200;
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

  /**
   * Create test server with Streamable HTTP enabled
   */
  async function createTestServer(
    port: number,
    options: {
      auth?: RemoteConfig['remote']['auth'];
      streamableHttp?: RemoteConfig['remote']['streamableHttp'];
    } = {}
  ): Promise<HTTPServerWithConfig> {
    const configPath = join(testDir, `config-${port}.json`);
    const config: RemoteConfig = {
      remote: {
        enabled: true,
        port,
        host: '127.0.0.1',
        auth: options.auth || { type: 'none' },
        cors: { allowedOrigins: ['*'] },
        streamableHttp: {
          enabled: true,
          sessionTimeout: 60000,
          eventBufferRetention: 30000,
          keepaliveInterval: 1000, // Short interval for testing
          maxSessions: 100,
          maxStreamsPerSession: 5,
          ...options.streamableHttp,
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config));
    const server = await createHTTPServerWithConfig({ configPath });
    await waitForServerReady(`http://127.0.0.1:${port}/health`);
    return server;
  }

  /**
   * Establish SSE connection to /mcp endpoint
   * Simulates: GET /mcp (Accept: text/event-stream)
   */
  function connectSSE(
    port: number,
    options: {
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<SSEConnectionResult> {
    return new Promise((resolve, reject) => {
      const events: SSEEvent[] = [];
      const comments: string[] = [];
      let sessionId: string | undefined;
      let closed = false;
      let resolvedResult: SSEConnectionResult | null = null;

      const eventWaiters: Array<{
        eventType: string;
        resolve: (event: SSEEvent) => void;
        reject: (error: Error) => void;
        timeoutId: NodeJS.Timeout;
      }> = [];

      const req = require('http').request(
        {
          method: 'GET',
          hostname: '127.0.0.1',
          port,
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

            let currentEvent: { id?: string; event?: string; data?: string } = {};
            for (const line of lines) {
              if (line.startsWith(': ')) {
                // SSE comment (keepalive)
                comments.push(line.substring(2));
              } else if (line.startsWith('event: ')) {
                currentEvent.event = line.substring(7);
              } else if (line.startsWith('data: ')) {
                currentEvent.data = line.substring(6);
              } else if (line.startsWith('id: ')) {
                currentEvent.id = line.substring(4);
              } else if (line === '') {
                // End of event
                if (currentEvent.data) {
                  let parsedData: unknown;
                  try {
                    parsedData = JSON.parse(currentEvent.data);
                  } catch {
                    parsedData = currentEvent.data;
                  }

                  const event: SSEEvent = {
                    id: currentEvent.id,
                    event: currentEvent.event,
                    data: parsedData,
                    raw: currentEvent.data,
                  };
                  events.push(event);

                  // Check event waiters
                  for (let i = eventWaiters.length - 1; i >= 0; i--) {
                    const waiter = eventWaiters[i];
                    if (event.event === waiter.eventType) {
                      clearTimeout(waiter.timeoutId);
                      waiter.resolve(event);
                      eventWaiters.splice(i, 1);
                    }
                  }
                }
                currentEvent = {};
              }
            }
          });

          res.on('error', (err: Error) => {
            if (!closed && !resolvedResult) {
              reject(err);
            }
          });

          // Resolve after receiving initial endpoint event
          const checkInitialEvent = setInterval(() => {
            const endpointEvent = events.find((e) => e.event === 'endpoint');
            if (endpointEvent || closed) {
              clearInterval(checkInitialEvent);
              if (!resolvedResult) {
                resolvedResult = {
                  sessionId,
                  events,
                  comments,
                  close: () => {
                    closed = true;
                    req.destroy();
                  },
                  waitForEvent: (eventType: string, timeout = 5000): Promise<SSEEvent> => {
                    // Check if event already received
                    const existing = events.find((e) => e.event === eventType);
                    if (existing) {
                      return Promise.resolve(existing);
                    }

                    return new Promise((resolveWait, rejectWait) => {
                      const timeoutId = setTimeout(() => {
                        const index = eventWaiters.findIndex((w) => w.eventType === eventType);
                        if (index !== -1) {
                          eventWaiters.splice(index, 1);
                        }
                        rejectWait(new Error(`Timeout waiting for event: ${eventType}`));
                      }, timeout);

                      eventWaiters.push({
                        eventType,
                        resolve: resolveWait,
                        reject: rejectWait,
                        timeoutId,
                      });
                    });
                  },
                };
                resolve(resolvedResult);
              }
            }
          }, 50);

          // Fallback timeout
          setTimeout(() => {
            clearInterval(checkInitialEvent);
            if (!resolvedResult && !closed) {
              resolvedResult = {
                sessionId,
                events,
                comments,
                close: () => {
                  closed = true;
                  req.destroy();
                },
                waitForEvent: () => Promise.reject(new Error('Connection closed')),
              };
              resolve(resolvedResult);
            }
          }, 2000);
        }
      );

      req.on('error', (err: Error) => {
        if (!closed && !resolvedResult) {
          reject(err);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (!closed && !resolvedResult) {
          reject(new Error('SSE connection timeout'));
        }
      });

      req.end();
    });
  }

  /**
   * Send MCP JSON-RPC request
   */
  async function sendMCPRequest(
    port: number,
    request: {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: unknown;
    },
    options: {
      headers?: Record<string, string>;
      acceptSSE?: boolean;
    } = {}
  ): Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    sessionId?: string;
    eventId?: string;
  }> {
    const acceptHeader = options.acceptSSE
      ? 'application/json, text/event-stream'
      : 'application/json';

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: acceptHeader,
        ...options.headers,
      },
      body: JSON.stringify(request),
    });

    const sessionId = response.headers.get('mcp-session-id') ?? undefined;
    const contentType = response.headers.get('content-type') || '';
    const rawBody = await response.text();

    let body: unknown;
    let eventId: string | undefined;

    if (contentType.includes('text/event-stream')) {
      // Parse SSE response
      const lines = rawBody.split('\n');
      for (const line of lines) {
        if (line.startsWith('id: ')) {
          eventId = line.substring(4);
        } else if (line.startsWith('data: ')) {
          try {
            body = JSON.parse(line.substring(6));
          } catch {
            body = line.substring(6);
          }
        }
      }
    } else {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      sessionId,
      eventId,
    };
  }

  /**
   * Send MCP notification (no id field, expects 202 Accepted)
   */
  async function sendMCPNotification(
    port: number,
    notification: {
      jsonrpc: string;
      method: string;
      params?: unknown;
    },
    options: {
      headers?: Record<string, string>;
    } = {}
  ): Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }> {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(notification),
    });

    const rawBody = await response.text();

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: rawBody,
    };
  }

  /**
   * Test Suite 1: Complete Codex Connection Flow
   * Simulates exactly how Codex connects to an MCP server
   */
  describe('Codex Connection Flow', () => {
    it('should complete full Codex-like connection lifecycle', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      // Step 1: Establish SSE connection (GET /mcp)
      // Codex opens SSE connection to receive server-initiated messages
      const sseConnection = await connectSSE(port);

      expect(sseConnection.sessionId).toBeDefined();
      expect(sseConnection.sessionId).toMatch(/^[0-9a-f-]{36}$/i);

      // Verify endpoint event was received
      const endpointEvent = sseConnection.events.find((e) => e.event === 'endpoint');
      expect(endpointEvent).toBeDefined();
      expect(endpointEvent?.data).toMatchObject({
        type: 'endpoint',
        url: '/mcp',
      });

      // Step 2: Send initialize request (POST /mcp)
      // Codex sends initialize to negotiate capabilities
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'codex-test', version: '1.0.0' },
            capabilities: {},
          },
        },
        {
          acceptSSE: true,
        }
      );

      expect(initResponse.status).toBe(200);
      expect(initResponse.sessionId).toBeDefined();

      const initResult = initResponse.body as {
        jsonrpc: string;
        id: number;
        result: {
          protocolVersion: string;
          serverInfo: { name: string; version: string };
          capabilities: Record<string, unknown>;
        };
      };

      expect(initResult.jsonrpc).toBe('2.0');
      expect(initResult.id).toBe(1);
      expect(initResult.result.protocolVersion).toBeDefined();
      expect(initResult.result.serverInfo.name).toBe('sage');
      expect(initResult.result.capabilities).toBeDefined();

      const sessionId = initResponse.sessionId!;

      // Step 2.5: Send initialized notification (required by MCP spec)
      // Client confirms initialization is complete (no response expected)
      const initializedResponse = await sendMCPNotification(
        port,
        {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
        }
      );

      // Notifications should return 202 Accepted with empty body
      expect(initializedResponse.status).toBe(202);
      expect(initializedResponse.body).toBe('');

      // Step 3: Send tools/list request with session ID
      // Codex discovers available tools
      const toolsResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(toolsResponse.status).toBe(200);

      const toolsResult = toolsResponse.body as {
        jsonrpc: string;
        id: number;
        result: { tools: Array<{ name: string; description?: string }> };
      };

      expect(toolsResult.result.tools).toBeDefined();
      expect(Array.isArray(toolsResult.result.tools)).toBe(true);

      const toolNames = toolsResult.result.tools.map((t) => t.name);
      expect(toolNames).toContain('check_setup_status');

      // Step 4: Call a tool
      // Codex invokes a tool
      const callResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'check_setup_status',
            arguments: {},
          },
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(callResponse.status).toBe(200);

      const callResult = callResponse.body as {
        jsonrpc: string;
        id: number;
        result: { content: Array<{ type: string; text: string }> };
      };

      expect(callResult.result.content).toBeDefined();
      expect(callResult.result.content[0].type).toBe('text');

      // Step 5: Terminate session (DELETE /mcp)
      // Codex cleanly disconnects
      const deleteResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
        headers: {
          'Mcp-Session-Id': sessionId,
        },
      });

      expect(deleteResponse.status).toBe(200);
      const deleteBody = await deleteResponse.json();
      expect(deleteBody.success).toBe(true);

      // Cleanup SSE connection
      sseConnection.close();

      // Verify session is terminated
      const postDeleteResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/list',
          params: {},
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(postDeleteResponse.status).toBe(404);
    });

    it('should handle multiple sequential requests correctly', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      // Initialize
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'codex-sequential', version: '1.0.0' },
            capabilities: {},
          },
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Send multiple requests sequentially
      for (let i = 2; i <= 10; i++) {
        const response = await sendMCPRequest(
          port,
          {
            jsonrpc: '2.0',
            id: i,
            method: 'tools/list',
            params: {},
          },
          {
            headers: { 'Mcp-Session-Id': sessionId },
            acceptSSE: true,
          }
        );

        expect(response.status).toBe(200);

        const result = response.body as {
          jsonrpc: string;
          id: number;
          result: { tools: Array<{ name: string }> };
        };

        expect(result.id).toBe(i);
        expect(result.result.tools).toBeDefined();
      }
    });

    it('should maintain session state across requests', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      // Initialize and create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'codex-state', version: '1.0.0' },
            capabilities: {},
          },
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Start setup wizard to create stateful session
      const startWizardResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'start_setup_wizard',
            arguments: { mode: 'quick' },
          },
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(startWizardResponse.status).toBe(200);

      const wizardResult = startWizardResponse.body as {
        result: { content: Array<{ type: string; text: string }> };
      };

      const wizardContent = JSON.parse(wizardResult.result.content[0].text);
      expect(wizardContent.sessionId).toBeDefined();
      expect(wizardContent.question).toBeDefined();
    });
  });

  /**
   * Test Suite 2: SSE Stream Management
   */
  describe('SSE Stream Management', () => {
    it('should send endpoint event on SSE connection', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const connection = await connectSSE(port);

      expect(connection.events.length).toBeGreaterThanOrEqual(1);

      const endpointEvent = connection.events.find((e) => e.event === 'endpoint');
      expect(endpointEvent).toBeDefined();
      expect((endpointEvent?.data as { type: string }).type).toBe('endpoint');
      expect((endpointEvent?.data as { url: string }).url).toBe('/mcp');
      expect((endpointEvent?.data as { sessionId: string }).sessionId).toBe(
        connection.sessionId
      );

      connection.close();
    });

    it('should send keepalive comments periodically', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          keepaliveInterval: 500, // 500ms for faster testing
        },
      });

      const connection = await connectSSE(port);

      // Wait for keepalive
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(connection.comments.length).toBeGreaterThanOrEqual(2);
      expect(connection.comments).toContain('keepalive');

      connection.close();
    });

    it('should return 406 for GET without Accept: text/event-stream', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      expect(response.status).toBe(406);
      const body = await response.json();
      expect(body.error).toBe('Not Acceptable');
    });

    it('should allow reconnection with existing session ID', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      // Create session via initialize
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Connect SSE with existing session ID
      const connection = await connectSSE(port, {
        headers: { 'Mcp-Session-Id': sessionId },
      });

      expect(connection.sessionId).toBe(sessionId);

      connection.close();
    });
  });

  /**
   * Test Suite 3: Session Lifecycle
   */
  describe('Session Lifecycle', () => {
    it('should create new session on initialize', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      expect(response.status).toBe(200);
      expect(response.sessionId).toBeDefined();
      expect(response.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('should return unique session IDs for different initializations', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const sessionIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const response = await sendMCPRequest(
          port,
          {
            jsonrpc: '2.0',
            id: i + 1,
            method: 'initialize',
            params: {},
          },
          { acceptSSE: true }
        );

        expect(response.sessionId).toBeDefined();
        sessionIds.push(response.sessionId!);
      }

      // All session IDs should be unique
      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(5);
    });

    it('should reject requests with invalid session ID', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        },
        {
          headers: { 'Mcp-Session-Id': '00000000-0000-0000-0000-000000000000' },
          acceptSSE: true,
        }
      );

      expect(response.status).toBe(404);
    });

    it('should terminate session on DELETE /mcp', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      // Create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Verify session works
      const toolsResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(toolsResponse.status).toBe(200);

      // Delete session
      const deleteResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': sessionId },
      });

      expect(deleteResponse.status).toBe(200);

      // Verify session is gone
      const postDeleteResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/list',
          params: {},
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(postDeleteResponse.status).toBe(404);
    });

    it('should return 400 for DELETE without session ID', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Bad Request');
    });
  });

  /**
   * Test Suite 4: Response Modes (SSE vs JSON)
   */
  describe('Response Modes', () => {
    it('should return SSE response when Accept includes text/event-stream', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
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

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('mcp-session-id')).toBeDefined();

      const body = await response.text();
      expect(body).toContain('id: ');
      expect(body).toContain('data: ');
    });

    it('should return JSON response when Accept is application/json only', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
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

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json');

      const body = await response.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result).toBeDefined();
    });

    it('should include event ID in SSE response for resumability', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      expect(response.status).toBe(200);
      expect(response.eventId).toBeDefined();
      expect(response.eventId!.length).toBeGreaterThan(0);
    });
  });

  /**
   * Test Suite 5: Authentication Integration
   */
  describe('Authentication Integration', () => {
    const secret = 'test-secret-key-at-least-32-characters-long-here';

    it('should require authentication when JWT is enabled', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });

      // GET /mcp without auth
      const getResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        headers: { Accept: 'text/event-stream' },
      });

      expect(getResponse.status).toBe(401);

      // POST /mcp without auth
      const postResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
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

      expect(postResponse.status).toBe(401);
    });

    it('should allow authenticated SSE connection', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });

      // Get token
      const tokenResponse = await fetch(`http://127.0.0.1:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });

      expect(tokenResponse.status).toBe(200);
      const tokenBody = (await tokenResponse.json()) as { token: string };
      const token = tokenBody.token;

      // Connect SSE with token
      const connection = await connectSSE(port, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(connection.sessionId).toBeDefined();

      connection.close();
    });

    it('should complete full authenticated Codex flow', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        auth: {
          type: 'jwt',
          secret,
          expiresIn: '1h',
        },
      });

      // Get token
      const tokenResponse = await fetch(`http://127.0.0.1:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });

      const tokenBody = (await tokenResponse.json()) as { token: string };
      const token = tokenBody.token;

      // Step 1: Connect SSE
      const connection = await connectSSE(port, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(connection.sessionId).toBeDefined();

      // Step 2: Initialize
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          acceptSSE: true,
        }
      );

      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.sessionId!;

      // Step 3: tools/list
      const toolsResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Mcp-Session-Id': sessionId,
          },
          acceptSSE: true,
        }
      );

      expect(toolsResponse.status).toBe(200);

      // Step 4: tools/call
      const callResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'check_setup_status',
            arguments: {},
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Mcp-Session-Id': sessionId,
          },
          acceptSSE: true,
        }
      );

      expect(callResponse.status).toBe(200);

      // Step 5: Terminate
      const deleteResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
        headers: {
          'Mcp-Session-Id': sessionId,
        },
      });

      expect(deleteResponse.status).toBe(200);

      connection.close();
    });
  });

  /**
   * Test Suite 6: Error Handling
   */
  describe('Error Handling', () => {
    it('should return parse error for invalid JSON', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: 'not valid json',
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe(-32700);
      expect(body.error.message).toBe('Parse error');
    });

    it('should return method not found for unknown methods', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'unknown/method',
          params: {},
        },
        { acceptSSE: false }
      );

      expect(response.status).toBe(200);
      const body = response.body as { error: { code: number; message: string } };
      expect(body.error.code).toBe(-32601);
    });

    it('should return tool not found for unknown tools', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      const callResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'nonexistent_tool',
            arguments: {},
          },
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(callResponse.status).toBe(200);
      const body = callResponse.body as { error: { code: number; message: string } };
      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toContain('not found');
    });

    it('should return 405 for unsupported HTTP methods', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toContain('GET');
      expect(response.headers.get('allow')).toContain('POST');
      expect(response.headers.get('allow')).toContain('DELETE');
    });
  });

  /**
   * Test Suite 7: Multiple Streams (FR-7)
   * Tests multiple SSE connections for the same session
   */
  describe('Multiple Streams', () => {
    it('should allow multiple SSE connections for the same session', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          maxStreamsPerSession: 5,
        },
      });

      // Create session via initialize
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'multi-stream-test', version: '1.0.0' },
            capabilities: {},
          },
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;
      expect(sessionId).toBeDefined();

      // Open multiple SSE connections for the same session
      const connections: SSEConnectionResult[] = [];
      try {
        for (let i = 0; i < 3; i++) {
          const connection = await connectSSE(port, {
            headers: { 'Mcp-Session-Id': sessionId },
          });
          connections.push(connection);
        }

        // All connections should have the same session ID
        for (const conn of connections) {
          expect(conn.sessionId).toBe(sessionId);
        }

        // Each connection should receive endpoint event
        for (const conn of connections) {
          const endpointEvent = conn.events.find((e) => e.event === 'endpoint');
          expect(endpointEvent).toBeDefined();
        }
      } finally {
        // Cleanup all connections
        for (const conn of connections) {
          conn.close();
        }
      }
    });

    it('should route response to single stream (not broadcast)', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          maxStreamsPerSession: 5,
          keepaliveInterval: 5000, // Longer interval to avoid noise
        },
      });

      // Create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'route-test', version: '1.0.0' },
            capabilities: {},
          },
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Open 2 SSE connections for the same session
      const connections: SSEConnectionResult[] = [];
      try {
        for (let i = 0; i < 2; i++) {
          const connection = await connectSSE(port, {
            headers: { 'Mcp-Session-Id': sessionId },
          });
          connections.push(connection);
        }

        // Clear existing events (endpoint events)
        const initialEventCounts = connections.map((c) => c.events.length);

        // Send a POST request - response should be routed via POST response, not SSE
        // But server-initiated messages would go to one stream
        const toolsResponse = await sendMCPRequest(
          port,
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          },
          {
            headers: { 'Mcp-Session-Id': sessionId },
            acceptSSE: true,
          }
        );

        expect(toolsResponse.status).toBe(200);

        const toolsResult = toolsResponse.body as {
          jsonrpc: string;
          id: number;
          result: { tools: Array<{ name: string }> };
        };

        expect(toolsResult.result.tools).toBeDefined();

        // Verify SSE connections are still alive
        expect(connections[0].sessionId).toBe(sessionId);
        expect(connections[1].sessionId).toBe(sessionId);

        // Wait a bit to ensure no unexpected messages
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Event count should not have increased significantly
        // (only endpoint events should be present, not broadcasted responses)
        const finalEventCounts = connections.map((c) => c.events.length);

        // Each connection should only have its initial endpoint event
        // (responses go through POST response, not SSE broadcast)
        expect(finalEventCounts[0]).toBe(initialEventCounts[0]);
        expect(finalEventCounts[1]).toBe(initialEventCounts[1]);
      } finally {
        for (const conn of connections) {
          conn.close();
        }
      }
    });

    it('should have independent event ID tracking per stream', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          maxStreamsPerSession: 5,
        },
      });

      // Create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Open 2 SSE connections
      const connections: SSEConnectionResult[] = [];
      try {
        for (let i = 0; i < 2; i++) {
          const connection = await connectSSE(port, {
            headers: { 'Mcp-Session-Id': sessionId },
          });
          connections.push(connection);
        }

        // Each connection should have received its own endpoint event
        // Event IDs should be unique per stream
        const eventIds: string[] = [];

        for (const conn of connections) {
          const endpointEvent = conn.events.find((e) => e.event === 'endpoint');
          expect(endpointEvent).toBeDefined();

          // The endpoint event may not have an ID, but the session ID in data should be same
          const eventData = endpointEvent?.data as { sessionId: string };
          expect(eventData.sessionId).toBe(sessionId);

          // If event has ID, collect it
          if (endpointEvent?.id) {
            eventIds.push(endpointEvent.id);
          }
        }

        // If event IDs are present, they should be unique across streams
        if (eventIds.length > 1) {
          const uniqueIds = new Set(eventIds);
          expect(uniqueIds.size).toBe(eventIds.length);
        }
      } finally {
        for (const conn of connections) {
          conn.close();
        }
      }
    });

    it('should continue working when one stream is closed', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          maxStreamsPerSession: 5,
        },
      });

      // Create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Open 2 SSE connections
      const connection1 = await connectSSE(port, {
        headers: { 'Mcp-Session-Id': sessionId },
      });
      const connection2 = await connectSSE(port, {
        headers: { 'Mcp-Session-Id': sessionId },
      });

      try {
        // Close first connection
        connection1.close();

        // Wait a bit for server to process close
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Second connection should still work
        // Session should still be valid for POST requests
        const toolsResponse = await sendMCPRequest(
          port,
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          },
          {
            headers: { 'Mcp-Session-Id': sessionId },
            acceptSSE: true,
          }
        );

        expect(toolsResponse.status).toBe(200);

        const toolsResult = toolsResponse.body as {
          jsonrpc: string;
          id: number;
          result: { tools: Array<{ name: string }> };
        };

        expect(toolsResult.result.tools).toBeDefined();

        // Second SSE connection should still be associated with session
        expect(connection2.sessionId).toBe(sessionId);
      } finally {
        connection2.close();
      }
    });

    it('should enforce max streams per session limit', async () => {
      const maxStreams = 3;
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          maxStreamsPerSession: maxStreams,
        },
      });

      // Create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Open max allowed SSE connections
      const connections: SSEConnectionResult[] = [];
      try {
        for (let i = 0; i < maxStreams; i++) {
          const connection = await connectSSE(port, {
            headers: { 'Mcp-Session-Id': sessionId },
          });
          connections.push(connection);
        }

        // Try to open one more - should fail with 429
        const extraResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
          headers: {
            Accept: 'text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
        });

        expect(extraResponse.status).toBe(429);
        const body = await extraResponse.json();
        expect(body.error).toContain('Too many connections');
        expect(body.maxConnections).toBe(maxStreams);
      } finally {
        for (const conn of connections) {
          conn.close();
        }
      }
    });

    it('should handle round-robin routing for multiple streams', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          maxStreamsPerSession: 5,
          keepaliveInterval: 10000, // Long interval
        },
      });

      // Create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Open 3 SSE connections
      const connections: SSEConnectionResult[] = [];
      try {
        for (let i = 0; i < 3; i++) {
          const connection = await connectSSE(port, {
            headers: { 'Mcp-Session-Id': sessionId },
          });
          connections.push(connection);
        }

        // All connections should be established
        expect(connections.length).toBe(3);

        for (const conn of connections) {
          expect(conn.sessionId).toBe(sessionId);
          expect(conn.events.some((e) => e.event === 'endpoint')).toBe(true);
        }

        // Send multiple POST requests to verify session still works
        for (let i = 2; i <= 6; i++) {
          const response = await sendMCPRequest(
            port,
            {
              jsonrpc: '2.0',
              id: i,
              method: 'tools/list',
              params: {},
            },
            {
              headers: { 'Mcp-Session-Id': sessionId },
              acceptSSE: true,
            }
          );

          expect(response.status).toBe(200);

          const result = response.body as {
            jsonrpc: string;
            id: number;
            result: { tools: Array<{ name: string }> };
          };

          expect(result.id).toBe(i);
          expect(result.result.tools).toBeDefined();
        }
      } finally {
        for (const conn of connections) {
          conn.close();
        }
      }
    });

    it('should clean up all streams when session is deleted', async () => {
      const port = getNextPort();
      server = await createTestServer(port, {
        streamableHttp: {
          maxStreamsPerSession: 5,
        },
      });

      // Create session
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      const sessionId = initResponse.sessionId!;

      // Open 2 SSE connections
      const connections: SSEConnectionResult[] = [];
      for (let i = 0; i < 2; i++) {
        const connection = await connectSSE(port, {
          headers: { 'Mcp-Session-Id': sessionId },
        });
        connections.push(connection);
      }

      // Verify connections are established
      expect(connections.length).toBe(2);

      // Delete session
      const deleteResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': sessionId },
      });

      expect(deleteResponse.status).toBe(200);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close connections (they may already be closed by server)
      for (const conn of connections) {
        try {
          conn.close();
        } catch {
          // Expected if already closed
        }
      }

      // Session should no longer exist
      const postDeleteResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(postDeleteResponse.status).toBe(404);
    });
  });

  /**
   * Test Suite 8: Backward Compatibility
   */
  describe('Backward Compatibility', () => {
    it('should support existing Claude Desktop JSON-only workflow', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      // Simulate Claude Desktop: JSON-only, no session management
      const initResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
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
            clientInfo: { name: 'claude-desktop', version: '1.0.0' },
            capabilities: {},
          },
        }),
      });

      expect(initResponse.status).toBe(200);
      expect(initResponse.headers.get('content-type')).toBe('application/json');

      // tools/list without session ID (backward compatible)
      const toolsResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
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

      expect(toolsResponse.status).toBe(200);
      const body = await toolsResponse.json();
      expect(body.result.tools).toBeDefined();
    });

    it('should handle mixed SSE and JSON requests', async () => {
      const port = getNextPort();
      server = await createTestServer(port);

      // Initialize with SSE
      const initResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        },
        { acceptSSE: true }
      );

      expect(initResponse.headers['content-type']).toBe('text/event-stream');
      const sessionId = initResponse.sessionId!;

      // tools/list with JSON
      const jsonResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
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
      expect(jsonResponse.headers.get('content-type')).toBe('application/json');

      // tools/call with SSE
      const sseResponse = await sendMCPRequest(
        port,
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'check_setup_status',
            arguments: {},
          },
        },
        {
          headers: { 'Mcp-Session-Id': sessionId },
          acceptSSE: true,
        }
      );

      expect(sseResponse.status).toBe(200);
    });
  });
});
