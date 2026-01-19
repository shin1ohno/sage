/**
 * Streamable HTTP Handler Tests
 * Requirements: FR-1, FR-2, FR-3, FR-6, FR-8
 *
 * Tests for the StreamableHTTPHandler that processes HTTP requests
 * for MCP Streamable HTTP Transport protocol.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import {
  StreamableHTTPHandler,
  StreamableHTTPHandlerImpl,
  createStreamableHTTPHandler,
} from '../../src/cli/streamable-http-handler.js';
import type { MCPHandler, MCPRequest, MCPResponse } from '../../src/cli/mcp-handler.js';
import type { SSEStreamHandler } from '../../src/cli/sse-stream-handler.js';
import type { SendEventResult } from '../../src/types/streamable-http.js';

// Mock IncomingMessage factory
function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method || 'GET';
  req.url = options.url || '/mcp';
  req.headers = options.headers || {};

  // Simulate body reading
  if (options.body) {
    const body = options.body;
    process.nextTick(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    process.nextTick(() => {
      req.emit('end');
    });
  }

  return req;
}

// Mock ServerResponse
interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  writeHead: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  on: jest.Mock;
}

function createMockResponse(): MockResponse & ServerResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    writeHead: jest.fn((code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) {
        Object.assign(res.headers, headers);
      }
      return res;
    }),
    write: jest.fn((data: string | Buffer) => {
      res.body += data.toString();
      return true;
    }),
    end: jest.fn((data?: string | Buffer) => {
      if (data) {
        res.body += data.toString();
      }
      res.ended = true;
    }),
    on: jest.fn(),
  };
  return res as MockResponse & ServerResponse;
}

// Mock MCP Handler
function createMockMCPHandler(): MCPHandler {
  return {
    handleRequest: jest.fn(async (request: MCPRequest): Promise<MCPResponse> => {
      if (request.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'sage', version: '1.0.0' },
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
        error: {
          code: -32601,
          message: 'Method not found',
        },
      };
    }),
    listTools: jest.fn(() => []),
    shutdown: jest.fn(async () => {}),
  };
}

// Mock SSE Stream Handler
function createMockSSEHandler(): SSEStreamHandler {
  const connections = new Map<string, unknown>();

  return {
    handleSSERequest: jest.fn(async () => {}),
    sendEvent: jest.fn(),
    sendResponseToSession: jest.fn(() => true),
    sendEventWithId: jest.fn((sessionId: string): SendEventResult => ({
      sent: true,
      eventId: `${sessionId}-${Date.now()}`,
    })),
    getConnectionsBySessionId: jest.fn(() => []),
    sendToSession: jest.fn(() => true),
    hasSession: jest.fn((sessionId: string) => connections.has(sessionId)),
    broadcast: jest.fn(),
    getActiveConnections: jest.fn(() => connections.size),
    getConnection: jest.fn(),
    removeConnectionById: jest.fn(),
    cleanup: jest.fn(),
  };
}

describe('StreamableHTTPHandler', () => {
  let mcpHandler: MCPHandler;
  let sseHandler: SSEStreamHandler;
  let handler: StreamableHTTPHandler;

  beforeEach(() => {
    mcpHandler = createMockMCPHandler();
    sseHandler = createMockSSEHandler();
    handler = createStreamableHTTPHandler(mcpHandler, sseHandler, {
      sessionTimeout: 3600000,
      eventBufferRetention: 300000,
    });
  });

  afterEach(() => {
    handler.cleanup();
  });

  describe('createStreamableHTTPHandler', () => {
    it('should create a handler instance', () => {
      expect(handler).toBeDefined();
      expect(typeof handler.handleGetRequest).toBe('function');
      expect(typeof handler.handlePostRequest).toBe('function');
      expect(typeof handler.handleDeleteRequest).toBe('function');
    });
  });

  describe('handleGetRequest', () => {
    it('should return 406 without Accept: text/event-stream header', async () => {
      // Requirement FR-1 (AC-1.3): Validate Accept header
      const req = createMockRequest({
        method: 'GET',
        url: '/mcp',
        headers: {
          accept: 'application/json',
        },
      });
      const res = createMockResponse();

      await handler.handleGetRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(406, { 'Content-Type': 'application/json' });
      expect(res.ended).toBe(true);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Not Acceptable');
      expect(body.message).toContain('text/event-stream');
    });

    it('should return 404 for invalid session ID', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/mcp',
        headers: {
          accept: 'text/event-stream',
          'mcp-session-id': 'non-existent-session-id',
        },
      });
      const res = createMockResponse();

      await handler.handleGetRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
      expect(res.ended).toBe(true);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Session not found');
    });

    it('should return 403 for session belonging to different user', async () => {
      // Requirement FR-6 (AC-6.3): Session bound to authenticated user

      // First, create a session via POST with initialize
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();

      // Create session as user1
      await handler.handlePostRequest(initReq, initRes, 'user1');

      expect(initRes.statusCode).toBe(200);
      const sessionId = initRes.headers['Mcp-Session-Id'];
      expect(sessionId).toBeDefined();

      // Now try to access with different user
      const req = createMockRequest({
        method: 'GET',
        url: '/mcp',
        headers: {
          accept: 'text/event-stream',
          'mcp-session-id': sessionId,
        },
      });
      const res = createMockResponse();

      await handler.handleGetRequest(req, res, 'user2');

      expect(res.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'application/json' });
      expect(res.ended).toBe(true);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('different user');
    });

    it('should delegate to SSE handler for valid requests', async () => {
      // First create a session
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();

      await handler.handlePostRequest(initReq, initRes);

      const sessionId = initRes.headers['Mcp-Session-Id'];
      expect(sessionId).toBeDefined();

      // Now make GET request with valid session
      const req = createMockRequest({
        method: 'GET',
        url: '/mcp',
        headers: {
          accept: 'text/event-stream',
          'mcp-session-id': sessionId,
        },
      });
      const res = createMockResponse();

      await handler.handleGetRequest(req, res);

      // Should delegate to SSE handler
      expect(sseHandler.handleSSERequest).toHaveBeenCalled();
    });

    it('should create a new session when no session ID provided', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/mcp',
        headers: {
          accept: 'text/event-stream',
        },
      });
      const res = createMockResponse();

      await handler.handleGetRequest(req, res);

      // Should create session and delegate to SSE handler
      expect(sseHandler.handleSSERequest).toHaveBeenCalled();
      expect(handler.getActiveSessionCount()).toBeGreaterThan(0);
    });
  });

  describe('handlePostRequest', () => {
    it('should return 400 for parse errors', async () => {
      // Requirement FR-2: Parse error handling
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: 'invalid json {{{',
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
      expect(res.ended).toBe(true);
      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error.code).toBe(-32700);
      expect(body.error.message).toContain('Parse error');
    });

    it('should allow SSE mode without session ID for backward compatibility', async () => {
      // FR-8: Session management is OPTIONAL per MCP spec for backward compatibility
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      // Should succeed with SSE response (session optional)
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
      }));
      expect(res.ended).toBe(true);
    });

    it('should create session on initialize request', async () => {
      // Requirement FR-3 (AC-3.1): Include session ID on initialize
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['Mcp-Session-Id']).toBeDefined();
      expect(res.headers['Mcp-Session-Id'].length).toBeGreaterThan(0);

      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result).toBeDefined();
      expect(body.result.protocolVersion).toBeDefined();
    });

    it('should return JSON for Accept: application/json (backward compatibility)', async () => {
      // Requirement FR-8 (AC-8.1): JSON response for backward compatibility
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.result).toBeDefined();
    });

    it('should return SSE for Accept: text/event-stream', async () => {
      // Requirement FR-2 (AC-2.1, AC-2.4): SSE response mode
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('text/event-stream');
      expect(res.headers['Cache-Control']).toBe('no-cache');
      expect(res.headers['Connection']).toBe('keep-alive');

      // Response should be in SSE format with event ID
      expect(res.body).toContain('id:');
      expect(res.body).toContain('data:');
    });

    it('should allow non-existent session ID for backward compatibility', async () => {
      // FR-8: Session management is OPTIONAL - proceed without session if not found
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'mcp-session-id': 'non-existent-session-id',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      // Should succeed even with non-existent session (backward compatibility)
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
      }));
    });

    it('should return 403 for session belonging to different user', async () => {
      // First create a session as user1
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();
      await handler.handlePostRequest(initReq, initRes, 'user1');

      const sessionId = initRes.headers['Mcp-Session-Id'];

      // Try to use session as user2
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'mcp-session-id': sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res, 'user2');

      expect(res.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'application/json' });
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('different user');
    });

    it('should process valid request with existing session', async () => {
      // First create a session
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();
      await handler.handlePostRequest(initReq, initRes);

      const sessionId = initRes.headers['Mcp-Session-Id'];

      // Make another request with existing session
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'mcp-session-id': sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      expect(res.statusCode).toBe(200);
      expect(mcpHandler.handleRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'tools/list',
        })
      );
    });
  });

  describe('handleDeleteRequest', () => {
    it('should return 400 without session ID', async () => {
      // Requirement FR-3 (AC-3.5): DELETE requires session ID
      const req = createMockRequest({
        method: 'DELETE',
        url: '/mcp',
        headers: {},
      });
      const res = createMockResponse();

      await handler.handleDeleteRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
      expect(res.ended).toBe(true);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toContain('Mcp-Session-Id');
    });

    it('should return 400 for invalid session ID format', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        url: '/mcp',
        headers: {
          'mcp-session-id': 'invalid-format-not-uuid',
        },
      });
      const res = createMockResponse();

      await handler.handleDeleteRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
      const body = JSON.parse(res.body);
      expect(body.message).toContain('Invalid session ID format');
    });

    it('should return 404 for non-existent session', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        url: '/mcp',
        headers: {
          'mcp-session-id': '550e8400-e29b-41d4-a716-446655440000',
        },
      });
      const res = createMockResponse();

      await handler.handleDeleteRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
      expect(res.ended).toBe(true);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Session not found');
    });

    it('should return 200 on successful deletion', async () => {
      // First create a session
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();

      await handler.handlePostRequest(initReq, initRes);
      const sessionId = initRes.headers['Mcp-Session-Id'];
      expect(sessionId).toBeDefined();

      // Verify session exists
      expect(handler.getSession(sessionId)).toBeDefined();

      // Delete session
      const req = createMockRequest({
        method: 'DELETE',
        url: '/mcp',
        headers: {
          'mcp-session-id': sessionId,
        },
      });
      const res = createMockResponse();

      await handler.handleDeleteRequest(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(res.ended).toBe(true);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('terminated');

      // Verify session no longer exists
      expect(handler.getSession(sessionId)).toBeUndefined();
    });
  });

  describe('Backward compatibility (FR-8)', () => {
    it('should allow requests without session for JSON-only clients', async () => {
      // Requirement FR-8 (AC-8.1, AC-8.2, AC-8.3): Backward compatibility
      // JSON-only clients (Accept: application/json without text/event-stream)
      // can send requests without session ID for backward compatibility

      // First, let's verify an initialize works without session
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();

      await handler.handlePostRequest(initReq, initRes);

      expect(initRes.statusCode).toBe(200);
      expect(initRes.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(initRes.body);
      expect(body.result).toBeDefined();
    });

    it('should allow JSON-only tools/list without valid session', async () => {
      // For backward compatibility, JSON-only clients can work without session
      // (though session is recommended for proper state management)
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'mcp-session-id': 'non-existent-session', // Invalid session but JSON mode
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      // Should process for backward compatibility (JSON-only mode)
      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('application/json');
    });

    it('should allow SSE mode with invalid session for backward compatibility', async () => {
      // FR-8: Session management is OPTIONAL - process even with invalid session
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'mcp-session-id': '550e8400-e29b-41d4-a716-446655440000',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });
      const res = createMockResponse();

      await handler.handlePostRequest(req, res);

      // Should succeed (backward compatibility)
      expect(res.statusCode).toBe(200);
    });
  });

  describe('sendToSession', () => {
    it('should return false for non-existent session', () => {
      const result = handler.sendToSession('non-existent', { test: 'message' });
      expect(result).toBe(false);
    });

    it('should delegate to SSE handler for existing session', async () => {
      // Create a session first
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();

      await handler.handlePostRequest(initReq, initRes);
      const sessionId = initRes.headers['Mcp-Session-Id'];

      // Mock the SSE handler to return success
      (sseHandler.sendEventWithId as jest.Mock).mockReturnValue({
        sent: true,
        eventId: `${sessionId}-1`,
      });

      const result = handler.sendToSession(sessionId, { test: 'message' });

      expect(result).toBe(true);
      expect(sseHandler.sendEventWithId).toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('should return undefined for non-existent session', () => {
      expect(handler.getSession('non-existent')).toBeUndefined();
    });

    it('should return session for existing session', async () => {
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();

      await handler.handlePostRequest(initReq, initRes);
      const sessionId = initRes.headers['Mcp-Session-Id'];

      const session = handler.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.initialized).toBe(true);
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return 0 initially', () => {
      expect(handler.getActiveSessionCount()).toBe(0);
    });

    it('should increase after creating sessions', async () => {
      const initReq = createMockRequest({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      });
      const initRes = createMockResponse();

      await handler.handlePostRequest(initReq, initRes);

      expect(handler.getActiveSessionCount()).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should call SSE handler cleanup', () => {
      handler.cleanup();
      expect(sseHandler.cleanup).toHaveBeenCalled();
    });
  });
});
