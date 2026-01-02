/**
 * Complete MCP over SSE (Streamable HTTP Transport) E2E Tests
 * Tests the full request/response flow using SSE for responses
 */

import { createHTTPServerWithConfig, HTTPServerWithConfig } from '../../src/cli/http-server-with-config.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Complete MCP over SSE', () => {
  let server: HTTPServerWithConfig;
  let configPath: string;
  let port: number;

  beforeAll(async () => {
    // Create temporary config file without auth
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-test-'));
    configPath = path.join(tmpDir, 'remote-config.json');

    port = 3400 + Math.floor(Math.random() * 100); // Random port to avoid conflicts

    const config = {
      remote: {
        enabled: true,
        port,
        host: '127.0.0.1',
        auth: {
          type: 'none' as const,
        },
        cors: {
          allowedOrigins: ['*'],
        },
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // Start server
    server = await createHTTPServerWithConfig({ configPath, port });
    await server.start();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    // Cleanup config file
    try {
      await fs.unlink(configPath);
    } catch {
      // Ignore
    }
  });

  const baseUrl = () => `http://127.0.0.1:${port}`;

  describe('Complete Request/Response Flow', () => {
    it('should handle GET /mcp to establish SSE, then POST /mcp with response via SSE', async () => {
      // Phase 1: Establish SSE connection
      const sseResponse = await fetch(`${baseUrl()}/mcp`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      expect(sseResponse.status).toBe(200);
      expect(sseResponse.headers.get('content-type')).toBe('text/event-stream');

      // Collect events from SSE stream
      const events: Array<{ event: string; data: any }> = [];
      let sessionId: string | null = null;

      // Parse SSE stream
      const reader = sseResponse.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Helper to read next event
      const readNextEvent = async (): Promise<void> => {
        if (!reader) throw new Error('No reader');

        const { done, value } = await reader.read();
        if (done) return;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events in buffer
        const lines = buffer.split('\n');
        let currentEvent: { event?: string; data?: string } = {};

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];

          if (line.startsWith('event:')) {
            currentEvent.event = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            currentEvent.data = line.substring(5).trim();
          } else if (line === '') {
            // End of event
            if (currentEvent.event && currentEvent.data) {
              const parsedData = JSON.parse(currentEvent.data);
              events.push({ event: currentEvent.event, data: parsedData });

              // Extract sessionId from endpoint event
              if (currentEvent.event === 'endpoint' && parsedData.sessionId) {
                sessionId = parsedData.sessionId;
              }
            }
            currentEvent = {};
          }
        }

        // Keep last incomplete line in buffer
        buffer = lines[lines.length - 1];
      };

      // Read endpoint event
      await readNextEvent();

      // Verify endpoint event received
      expect(events.length).toBe(1);
      expect(events[0].event).toBe('endpoint');
      expect(events[0].data).toMatchObject({
        type: 'endpoint',
        url: '/mcp',
      });
      expect(events[0].data.sessionId).toBeTruthy();
      expect(sessionId).toBeTruthy();

      // Phase 2: Send MCP request via POST
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const postResponse = await fetch(`${baseUrl()}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId!,
        },
        body: JSON.stringify(mcpRequest),
      });

      // Verify 202 Accepted response
      expect(postResponse.status).toBe(202);
      const ackBody = await postResponse.json();
      expect(ackBody).toMatchObject({
        accepted: true,
        id: 1,
      });

      // Phase 3: Read response from SSE stream
      await readNextEvent();

      // Verify MCP response received via SSE
      const responseEvent = events.find((e) => e.event === 'message');
      expect(responseEvent).toBeTruthy();
      expect(responseEvent!.data).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
      });
      expect(responseEvent!.data.result).toBeTruthy();

      // Cleanup
      await reader?.cancel();
    }, 10000); // Increase timeout for SSE operations

    it('should handle multiple requests on same session', async () => {
      // Establish SSE connection
      const sseResponse = await fetch(`${baseUrl()}/mcp`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      expect(sseResponse.status).toBe(200);

      const events: Array<{ event: string; data: any }> = [];
      let sessionId: string | null = null;

      const reader = sseResponse.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readNextEvent = async (): Promise<void> => {
        if (!reader) throw new Error('No reader');

        const { done, value } = await reader.read();
        if (done) return;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        let currentEvent: { event?: string; data?: string } = {};

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];

          if (line.startsWith('event:')) {
            currentEvent.event = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            currentEvent.data = line.substring(5).trim();
          } else if (line === '') {
            if (currentEvent.event && currentEvent.data) {
              const parsedData = JSON.parse(currentEvent.data);
              events.push({ event: currentEvent.event, data: parsedData });

              if (currentEvent.event === 'endpoint' && parsedData.sessionId) {
                sessionId = parsedData.sessionId;
              }
            }
            currentEvent = {};
          }
        }

        buffer = lines[lines.length - 1];
      };

      // Read endpoint event
      await readNextEvent();
      expect(sessionId).toBeTruthy();

      // Send first request
      const request1 = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response1 = await fetch(`${baseUrl()}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId!,
        },
        body: JSON.stringify(request1),
      });

      expect(response1.status).toBe(202);

      // Read first response
      await readNextEvent();

      // Send second request
      const request2 = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };

      const response2 = await fetch(`${baseUrl()}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId!,
        },
        body: JSON.stringify(request2),
      });

      expect(response2.status).toBe(202);

      // Read second response
      await readNextEvent();

      // Verify both responses received
      const messageEvents = events.filter((e) => e.event === 'message');
      expect(messageEvents.length).toBe(2);
      expect(messageEvents[0].data.id).toBe(1);
      expect(messageEvents[1].data.id).toBe(2);

      // Cleanup
      await reader?.cancel();
    }, 10000);

    it('should return 404 for invalid sessionId', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response = await fetch(`${baseUrl()}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': 'invalid-session-id',
        },
        body: JSON.stringify(mcpRequest),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toMatchObject({
        error: expect.stringMatching(/[Ss]ession/),
      });
    });

    it('should fall back to synchronous response for missing sessionId', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response = await fetch(`${baseUrl()}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mcpRequest),
      });

      // Should fall back to synchronous processing for backward compatibility
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        jsonrpc: string;
        id: number;
        result: { tools: Array<{ name: string; description: string }> };
      };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result).toBeDefined();
      expect(body.result.tools).toBeDefined();
      expect(Array.isArray(body.result.tools)).toBe(true);
      expect(body.result.tools.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should send JSON-RPC error via SSE for invalid method', async () => {
      // Establish SSE connection
      const sseResponse = await fetch(`${baseUrl()}/mcp`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      const events: Array<{ event: string; data: any }> = [];
      let sessionId: string | null = null;

      const reader = sseResponse.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readNextEvent = async (): Promise<void> => {
        if (!reader) throw new Error('No reader');

        const { done, value } = await reader.read();
        if (done) return;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        let currentEvent: { event?: string; data?: string } = {};

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];

          if (line.startsWith('event:')) {
            currentEvent.event = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            currentEvent.data = line.substring(5).trim();
          } else if (line === '') {
            if (currentEvent.event && currentEvent.data) {
              const parsedData = JSON.parse(currentEvent.data);
              events.push({ event: currentEvent.event, data: parsedData });

              if (currentEvent.event === 'endpoint' && parsedData.sessionId) {
                sessionId = parsedData.sessionId;
              }
            }
            currentEvent = {};
          }
        }

        buffer = lines[lines.length - 1];
      };

      await readNextEvent();
      expect(sessionId).toBeTruthy();

      // Send request with invalid method
      const invalidRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'invalid/method',
        params: {},
      };

      const postResponse = await fetch(`${baseUrl()}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId!,
        },
        body: JSON.stringify(invalidRequest),
      });

      expect(postResponse.status).toBe(202);

      // Read error response from SSE
      await readNextEvent();

      const errorEvent = events.find((e) => e.event === 'message');
      expect(errorEvent).toBeTruthy();
      expect(errorEvent!.data).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: expect.any(Number),
          message: expect.any(String),
        },
      });

      // Cleanup
      await reader?.cancel();
    }, 10000);
  });
});
