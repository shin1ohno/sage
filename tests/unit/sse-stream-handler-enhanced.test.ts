/**
 * Enhanced SSE Stream Handler Unit Tests
 * Requirements: FR-4, FR-5, FR-7 (Streamable HTTP Transport)
 *
 * Tests the enhanced SSE stream handler functionality for Streamable HTTP Transport:
 * - Connection management with unique IDs
 * - Multiple connections per session
 * - Event ID generation for resumability
 * - Session routing with round-robin
 * - Connection limits per session
 */

import { IncomingMessage, ServerResponse } from 'http';
import {
  createSSEStreamHandler,
  SSEStreamHandler,
} from '../../src/cli/sse-stream-handler.js';

// Helper to create mock request
function createMockRequest(options: {
  sessionId?: string;
  lastEventId?: string;
  host?: string;
  url?: string;
} = {}): IncomingMessage {
  const {
    sessionId,
    lastEventId,
    host = 'localhost:3000',
    url = '/mcp',
  } = options;

  const headers: Record<string, string> = {
    host,
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  if (lastEventId) {
    headers['last-event-id'] = lastEventId;
  }

  const fullUrl = sessionId ? `${url}?session=${sessionId}` : url;

  return {
    headers,
    url: fullUrl,
    method: 'GET',
    on: jest.fn(),
  } as unknown as IncomingMessage;
}

// Helper to create mock response
function createMockResponse(): ServerResponse & {
  statusCode: number;
  writtenData: string[];
  headersWritten: Record<string, string | number>;
  ended: boolean;
} {
  const res = {
    statusCode: 200,
    writtenData: [] as string[],
    headersWritten: {} as Record<string, string | number>,
    ended: false,
    setHeader: jest.fn(),
    writeHead: jest.fn(function (
      this: { statusCode: number; headersWritten: Record<string, string | number> },
      code: number,
      headers?: Record<string, string>
    ) {
      this.statusCode = code;
      if (headers) {
        Object.assign(this.headersWritten, headers);
      }
    }),
    write: jest.fn(function (this: { writtenData: string[] }, data: string) {
      this.writtenData.push(data);
      return true;
    }),
    end: jest.fn(function (this: { ended: boolean; writtenData: string[] }, data?: string) {
      this.ended = true;
      if (data) {
        this.writtenData.push(data);
      }
    }),
    on: jest.fn(),
  } as unknown as ServerResponse & {
    statusCode: number;
    writtenData: string[];
    headersWritten: Record<string, string | number>;
    ended: boolean;
  };

  return res;
}

describe('SSEStreamHandler Enhanced Features', () => {
  let handler: SSEStreamHandler;

  beforeEach(() => {
    handler = createSSEStreamHandler({
      keepaliveInterval: 60000, // Long interval to avoid timer issues in tests
      maxConnectionsPerSession: 5,
    });
  });

  afterEach(() => {
    handler.cleanup();
  });

  describe('Connection Management', () => {
    describe('unique connection IDs', () => {
      it('should assign unique connection ID to each connection', async () => {
        const req1 = createMockRequest({ sessionId: 'session-1' });
        const res1 = createMockResponse();
        const req2 = createMockRequest({ sessionId: 'session-1' });
        const res2 = createMockResponse();

        await handler.handleSSERequest(req1, res1);
        await handler.handleSSERequest(req2, res2);

        const connections = handler.getConnectionsBySessionId('session-1');
        expect(connections.length).toBe(2);
        expect(connections[0].id).not.toBe(connections[1].id);
      });

      it('should generate UUID format connection IDs', async () => {
        const req = createMockRequest({ sessionId: 'session-uuid' });
        const res = createMockResponse();

        await handler.handleSSERequest(req, res);

        const connections = handler.getConnectionsBySessionId('session-uuid');
        expect(connections.length).toBe(1);

        // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(connections[0].id).toMatch(uuidRegex);
      });
    });

    describe('multiple connections per session', () => {
      it('should support multiple connections for same session', async () => {
        const sessionId = 'multi-conn-session';

        for (let i = 0; i < 3; i++) {
          const req = createMockRequest({ sessionId });
          const res = createMockResponse();
          await handler.handleSSERequest(req, res);
        }

        const connections = handler.getConnectionsBySessionId(sessionId);
        expect(connections.length).toBe(3);
        expect(handler.getActiveConnections()).toBe(3);
      });

      it('should track connections in sessionConnections map', async () => {
        const sessionId = 'tracked-session';
        const req = createMockRequest({ sessionId });
        const res = createMockResponse();

        await handler.handleSSERequest(req, res);

        expect(handler.hasSession(sessionId)).toBe(true);
        const connections = handler.getConnectionsBySessionId(sessionId);
        expect(connections.length).toBe(1);
        expect(connections[0].sessionId).toBe(sessionId);
      });

      it('should properly track connections across different sessions', async () => {
        // Create connections for session A
        for (let i = 0; i < 2; i++) {
          const req = createMockRequest({ sessionId: 'session-A' });
          const res = createMockResponse();
          await handler.handleSSERequest(req, res);
        }

        // Create connections for session B
        for (let i = 0; i < 3; i++) {
          const req = createMockRequest({ sessionId: 'session-B' });
          const res = createMockResponse();
          await handler.handleSSERequest(req, res);
        }

        expect(handler.getConnectionsBySessionId('session-A').length).toBe(2);
        expect(handler.getConnectionsBySessionId('session-B').length).toBe(3);
        expect(handler.getActiveConnections()).toBe(5);
      });
    });

    describe('connection removal', () => {
      it('should remove connection by ID', async () => {
        const req = createMockRequest({ sessionId: 'remove-test' });
        const res = createMockResponse();

        await handler.handleSSERequest(req, res);

        const connections = handler.getConnectionsBySessionId('remove-test');
        expect(connections.length).toBe(1);

        const connectionId = connections[0].id;
        handler.removeConnectionById(connectionId);

        expect(handler.getConnection(connectionId)).toBeUndefined();
        expect(handler.getConnectionsBySessionId('remove-test').length).toBe(0);
      });

      it('should clean up session mapping when last connection removed', async () => {
        const req = createMockRequest({ sessionId: 'cleanup-session' });
        const res = createMockResponse();

        await handler.handleSSERequest(req, res);

        const connections = handler.getConnectionsBySessionId('cleanup-session');
        handler.removeConnectionById(connections[0].id);

        expect(handler.hasSession('cleanup-session')).toBe(false);
      });
    });
  });

  describe('Event ID Generation (sendEventWithId)', () => {
    it('should return correct eventId format (connectionId-counter)', async () => {
      const req = createMockRequest({ sessionId: 'event-id-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      const connections = handler.getConnectionsBySessionId('event-id-session');
      const connectionId = connections[0].id;

      const result = handler.sendEventWithId('event-id-session', { test: 'data' });

      expect(result.sent).toBe(true);
      expect(result.eventId).toMatch(new RegExp(`^${connectionId}-\\d+$`));
    });

    it('should increment event counter for each event', async () => {
      const req = createMockRequest({ sessionId: 'counter-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      const result1 = handler.sendEventWithId('counter-session', { msg: 1 });
      const result2 = handler.sendEventWithId('counter-session', { msg: 2 });
      const result3 = handler.sendEventWithId('counter-session', { msg: 3 });

      // Extract counter numbers from event IDs
      const counter1 = parseInt(result1.eventId.split('-').pop()!, 10);
      const counter2 = parseInt(result2.eventId.split('-').pop()!, 10);
      const counter3 = parseInt(result3.eventId.split('-').pop()!, 10);

      expect(counter2).toBe(counter1 + 1);
      expect(counter3).toBe(counter2 + 1);
    });

    it('should record lastEventId on connection', async () => {
      const req = createMockRequest({ sessionId: 'last-event-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      const result = handler.sendEventWithId('last-event-session', { data: 'test' });

      const connections = handler.getConnectionsBySessionId('last-event-session');
      expect(connections[0].lastEventId).toBe(result.eventId);
    });

    it('should use provided eventId when specified', async () => {
      const req = createMockRequest({ sessionId: 'custom-id-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      const customEventId = 'custom-event-12345';
      const result = handler.sendEventWithId('custom-id-session', { data: 'test' }, customEventId);

      expect(result.sent).toBe(true);
      expect(result.eventId).toBe(customEventId);
    });

    it('should return sent: false for non-existent session', () => {
      const result = handler.sendEventWithId('non-existent-session', { data: 'test' });

      expect(result.sent).toBe(false);
      expect(result.eventId).toBe('');
    });

    it('should format event with id in SSE format', async () => {
      const req = createMockRequest({ sessionId: 'sse-format-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      // Clear initial endpoint event
      res.writtenData.length = 0;

      handler.sendEventWithId('sse-format-session', { message: 'hello' });

      // Should have format: id: <eventId>\ndata: <json>\n\n
      const lastWrite = res.writtenData[res.writtenData.length - 1];
      expect(lastWrite).toMatch(/^id: .+\ndata: .+\n\n$/);
    });
  });

  describe('Session Routing (sendToSession)', () => {
    it('should route to correct session', async () => {
      // Create session A
      const reqA = createMockRequest({ sessionId: 'route-session-A' });
      const resA = createMockResponse();
      await handler.handleSSERequest(reqA, resA);
      resA.writtenData.length = 0;

      // Create session B
      const reqB = createMockRequest({ sessionId: 'route-session-B' });
      const resB = createMockResponse();
      await handler.handleSSERequest(reqB, resB);
      resB.writtenData.length = 0;

      // Send to session A
      const resultA = handler.sendToSession('route-session-A', { target: 'A' });

      expect(resultA).toBe(true);
      expect(resA.writtenData.length).toBe(1);
      expect(resB.writtenData.length).toBe(0);
    });

    it('should use round-robin across multiple connections', async () => {
      const sessionId = 'round-robin-session';
      const responses: Array<ReturnType<typeof createMockResponse>> = [];

      // Create 3 connections for same session
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ sessionId });
        const res = createMockResponse();
        await handler.handleSSERequest(req, res);
        res.writtenData.length = 0; // Clear initial endpoint event
        responses.push(res);
      }

      // Send 6 messages - should distribute round-robin
      for (let i = 0; i < 6; i++) {
        handler.sendToSession(sessionId, { msgNum: i });
      }

      // Each connection should receive 2 messages (6 / 3 = 2)
      expect(responses[0].writtenData.length).toBe(2);
      expect(responses[1].writtenData.length).toBe(2);
      expect(responses[2].writtenData.length).toBe(2);
    });

    it('should return false for non-existent session', () => {
      const result = handler.sendToSession('non-existent-session', { data: 'test' });

      expect(result).toBe(false);
    });

    it('should return false for session with no connections', async () => {
      const req = createMockRequest({ sessionId: 'empty-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      const connections = handler.getConnectionsBySessionId('empty-session');
      handler.removeConnectionById(connections[0].id);

      const result = handler.sendToSession('empty-session', { data: 'test' });

      expect(result).toBe(false);
    });
  });

  describe('Connection Limits', () => {
    it('should return 429 when max connections per session exceeded', async () => {
      const sessionId = 'limited-session';
      const limitedHandler = createSSEStreamHandler({
        maxConnectionsPerSession: 2,
        keepaliveInterval: 60000,
      });

      try {
        // Create max connections
        for (let i = 0; i < 2; i++) {
          const req = createMockRequest({ sessionId });
          const res = createMockResponse();
          await limitedHandler.handleSSERequest(req, res);
        }

        // Try to create one more - should be rejected
        const req = createMockRequest({ sessionId });
        const res = createMockResponse();
        await limitedHandler.handleSSERequest(req, res);

        expect(res.statusCode).toBe(429);
        expect(res.ended).toBe(true);

        const responseBody = JSON.parse(res.writtenData[0]);
        expect(responseBody.error).toContain('Too many connections');
        expect(responseBody.maxConnections).toBe(2);
      } finally {
        limitedHandler.cleanup();
      }
    });

    it('should include Retry-After header when returning 429', async () => {
      const sessionId = 'retry-after-session';
      const limitedHandler = createSSEStreamHandler({
        maxConnectionsPerSession: 1,
        keepaliveInterval: 60000,
      });

      try {
        // Create max connection
        const req1 = createMockRequest({ sessionId });
        const res1 = createMockResponse();
        await limitedHandler.handleSSERequest(req1, res1);

        // Try to exceed limit
        const req2 = createMockRequest({ sessionId });
        const res2 = createMockResponse();
        await limitedHandler.handleSSERequest(req2, res2);

        expect(res2.statusCode).toBe(429);
        expect(res2.headersWritten['Retry-After']).toBe('60');
      } finally {
        limitedHandler.cleanup();
      }
    });

    it('should allow connections when under limit', async () => {
      const sessionId = 'under-limit-session';
      const limitedHandler = createSSEStreamHandler({
        maxConnectionsPerSession: 3,
        keepaliveInterval: 60000,
      });

      try {
        for (let i = 0; i < 3; i++) {
          const req = createMockRequest({ sessionId });
          const res = createMockResponse();
          await limitedHandler.handleSSERequest(req, res);

          expect(res.statusCode).toBe(200);
        }

        expect(limitedHandler.getConnectionsBySessionId(sessionId).length).toBe(3);
      } finally {
        limitedHandler.cleanup();
      }
    });

    it('should allow new connection after existing one is removed', async () => {
      const sessionId = 'recycle-session';
      const limitedHandler = createSSEStreamHandler({
        maxConnectionsPerSession: 1,
        keepaliveInterval: 60000,
      });

      try {
        // Create initial connection
        const req1 = createMockRequest({ sessionId });
        const res1 = createMockResponse();
        await limitedHandler.handleSSERequest(req1, res1);

        const connections = limitedHandler.getConnectionsBySessionId(sessionId);
        limitedHandler.removeConnectionById(connections[0].id);

        // Should allow new connection now
        const req2 = createMockRequest({ sessionId });
        const res2 = createMockResponse();
        await limitedHandler.handleSSERequest(req2, res2);

        expect(res2.statusCode).toBe(200);
        expect(limitedHandler.getConnectionsBySessionId(sessionId).length).toBe(1);
      } finally {
        limitedHandler.cleanup();
      }
    });
  });

  describe('getConnectionsBySessionId', () => {
    it('should return all connections for session', async () => {
      const sessionId = 'get-connections-session';

      for (let i = 0; i < 4; i++) {
        const req = createMockRequest({ sessionId });
        const res = createMockResponse();
        await handler.handleSSERequest(req, res);
      }

      const connections = handler.getConnectionsBySessionId(sessionId);

      expect(connections.length).toBe(4);
      connections.forEach((conn) => {
        expect(conn.sessionId).toBe(sessionId);
        expect(conn.id).toBeDefined();
      });
    });

    it('should return empty array for unknown session', () => {
      const connections = handler.getConnectionsBySessionId('unknown-session');

      expect(connections).toEqual([]);
    });

    it('should return empty array after all connections removed', async () => {
      const sessionId = 'all-removed-session';

      const req = createMockRequest({ sessionId });
      const res = createMockResponse();
      await handler.handleSSERequest(req, res);

      const connections = handler.getConnectionsBySessionId(sessionId);
      handler.removeConnectionById(connections[0].id);

      const remainingConnections = handler.getConnectionsBySessionId(sessionId);
      expect(remainingConnections).toEqual([]);
    });

    it('should not include removed connections', async () => {
      const sessionId = 'partial-remove-session';

      // Create 3 connections
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ sessionId });
        const res = createMockResponse();
        await handler.handleSSERequest(req, res);
      }

      const initialConnections = handler.getConnectionsBySessionId(sessionId);
      expect(initialConnections.length).toBe(3);

      // Remove one connection
      handler.removeConnectionById(initialConnections[1].id);

      const remainingConnections = handler.getConnectionsBySessionId(sessionId);
      expect(remainingConnections.length).toBe(2);
      expect(remainingConnections.find((c) => c.id === initialConnections[1].id)).toBeUndefined();
    });
  });

  describe('Last-Event-ID handling for resumability', () => {
    it('should initialize event counter from Last-Event-ID header', async () => {
      const sessionId = 'resume-session';
      const lastEventId = 'conn-id-42';
      const req = createMockRequest({ sessionId, lastEventId });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      const connections = handler.getConnectionsBySessionId(sessionId);
      expect(connections[0].lastEventId).toBe(lastEventId);
      // Event counter should be initialized from the last number in the ID
      expect(connections[0].eventCounter).toBe(42);
    });

    it('should start counter at 0 when no Last-Event-ID', async () => {
      const sessionId = 'fresh-session';
      const req = createMockRequest({ sessionId });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      const connections = handler.getConnectionsBySessionId(sessionId);
      expect(connections[0].eventCounter).toBe(0);
    });
  });

  describe('SSE Headers', () => {
    it('should set correct SSE headers on connection', async () => {
      const req = createMockRequest({ sessionId: 'headers-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headersWritten['Content-Type']).toBe('text/event-stream');
      expect(res.headersWritten['Cache-Control']).toBe('no-cache');
      expect(res.headersWritten['Connection']).toBe('keep-alive');
    });

    it('should include session ID in Mcp-Session-Id header', async () => {
      const sessionId = 'header-session-id';
      const req = createMockRequest({ sessionId });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      expect(res.headersWritten['Mcp-Session-Id']).toBe(sessionId);
    });

    it('should include CORS headers', async () => {
      const req = createMockRequest({ sessionId: 'cors-session' });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      expect(res.headersWritten['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headersWritten['Access-Control-Expose-Headers']).toBe('Mcp-Session-Id');
    });
  });

  describe('Endpoint event on connection', () => {
    it('should send endpoint event on new connection', async () => {
      const sessionId = 'endpoint-event-session';
      const req = createMockRequest({ sessionId });
      const res = createMockResponse();

      await handler.handleSSERequest(req, res);

      // First write should be the endpoint event
      expect(res.writtenData.length).toBeGreaterThan(0);
      const firstEvent = res.writtenData[0];
      expect(firstEvent).toContain('event: endpoint');
      expect(firstEvent).toContain(`"sessionId":"${sessionId}"`);
    });
  });

  describe('cleanup', () => {
    it('should remove all connections', async () => {
      // Create multiple sessions with multiple connections
      for (let s = 0; s < 3; s++) {
        for (let c = 0; c < 2; c++) {
          const req = createMockRequest({ sessionId: `session-${s}` });
          const res = createMockResponse();
          await handler.handleSSERequest(req, res);
        }
      }

      expect(handler.getActiveConnections()).toBe(6);

      handler.cleanup();

      expect(handler.getActiveConnections()).toBe(0);
      expect(handler.hasSession('session-0')).toBe(false);
      expect(handler.hasSession('session-1')).toBe(false);
      expect(handler.hasSession('session-2')).toBe(false);
    });
  });
});
