/**
 * Streamable HTTP Handler for MCP Streamable HTTP Transport
 * Requirements: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
 *
 * Main handler for Streamable HTTP Transport protocol.
 * Handles GET/POST/DELETE /mcp requests.
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
 */

import { IncomingMessage, ServerResponse } from 'http';
import type {
  StreamableHTTPHandlerOptions,
  StreamableSession,
  BufferedEvent,
} from '../types/streamable-http.js';
import type { MCPHandler, MCPRequest } from './mcp-handler.js';
import type { SSEStreamHandler } from './sse-stream-handler.js';
import { createSessionManager } from './session-manager.js';
import type { SessionManager } from '../types/streamable-http.js';
import { validateSessionId } from '../config/validation.js';

/**
 * Streamable HTTP Handler Interface
 */
export interface StreamableHTTPHandler {
  /**
   * Handle GET /mcp - Establish SSE stream
   * Requirement: FR-1
   */
  handleGetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    userId?: string
  ): Promise<void>;

  /**
   * Handle POST /mcp - Process JSON-RPC with optional SSE response
   * Requirement: FR-2, FR-8
   */
  handlePostRequest(
    req: IncomingMessage,
    res: ServerResponse,
    userId?: string
  ): Promise<void>;

  /**
   * Handle DELETE /mcp - Terminate session
   * Requirement: FR-3 (AC-3.5)
   */
  handleDeleteRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void>;

  /**
   * Send server-initiated message to session
   */
  sendToSession(sessionId: string, message: unknown): boolean;

  /**
   * Get session by ID
   */
  getSession(sessionId: string): StreamableSession | undefined;

  /**
   * Get active session count
   */
  getActiveSessionCount(): number;

  /**
   * Cleanup expired sessions and connections
   */
  cleanup(): void;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<StreamableHTTPHandlerOptions> = {
  sessionTimeout: 3600000,       // 1 hour
  eventBufferRetention: 300000,  // 5 minutes
  keepaliveInterval: 30000,      // 30 seconds
  maxSessions: 1000,
  maxStreamsPerSession: 5,
};

/**
 * Streamable HTTP Handler Implementation
 */
export class StreamableHTTPHandlerImpl implements StreamableHTTPHandler {
  private sessionManager: SessionManager;
  private sseHandler: SSEStreamHandler;
  private mcpHandler: MCPHandler;
  private options: Required<StreamableHTTPHandlerOptions>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    mcpHandler: MCPHandler,
    sseHandler: SSEStreamHandler,
    options: StreamableHTTPHandlerOptions = {}
  ) {
    this.mcpHandler = mcpHandler;
    this.sseHandler = sseHandler;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.sessionManager = createSessionManager({
      sessionTimeout: this.options.sessionTimeout,
      eventBufferRetention: this.options.eventBufferRetention,
      maxSessions: this.options.maxSessions,
    });

    // Start periodic cleanup
    this.startCleanupTimer();
  }

  /**
   * Handle GET /mcp - Establish SSE stream
   * Requirement: FR-1
   */
  async handleGetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    userId?: string
  ): Promise<void> {
    // Requirement FR-1 (AC-1.3): Validate Accept header
    const accept = req.headers.accept || '';
    if (!accept.includes('text/event-stream')) {
      res.writeHead(406, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Not Acceptable',
        message: 'Accept header must include text/event-stream',
      }));
      return;
    }

    // Extract or create session ID
    const existingSessionId = req.headers['mcp-session-id'] as string;
    let session: StreamableSession;

    if (existingSessionId) {
      // Validate existing session
      const existingSession = this.sessionManager.getSession(existingSessionId);
      if (!existingSession) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Not Found',
          message: 'Session not found or expired',
        }));
        return;
      }

      // Requirement FR-6 (AC-6.3): Session bound to authenticated user
      if (existingSession.userId && existingSession.userId !== userId) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Forbidden',
          message: 'Session belongs to different user',
        }));
        return;
      }

      session = existingSession;
    } else {
      // Create new session
      session = this.sessionManager.createSession(userId);
    }

    // Update session activity
    this.sessionManager.touchSession(session.id);

    // Handle Last-Event-ID for resumability (FR-5)
    const lastEventId = req.headers['last-event-id'] as string;
    if (lastEventId) {
      // Get and replay missed events
      const missedEvents = this.sessionManager.getEventsAfter(session.id, lastEventId);
      if (missedEvents.length > 0) {
        // Replay events after connection is established
        // This will be handled by SSE handler
      }
    }

    // Override session ID in request for SSE handler
    // Set Mcp-Session-Id header so SSE handler uses our session
    (req.headers as Record<string, string | string[] | undefined>)['mcp-session-id'] = session.id;

    // Delegate to SSE handler
    await this.sseHandler.handleSSERequest(req, res);
  }

  /**
   * Handle POST /mcp - Process JSON-RPC with optional SSE response
   * Requirement: FR-2, FR-8
   */
  async handlePostRequest(
    req: IncomingMessage,
    res: ServerResponse,
    userId?: string
  ): Promise<void> {
    // Read request body
    const body = await this.readBody(req);
    let mcpRequest: MCPRequest;

    try {
      mcpRequest = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
        id: null,
      }));
      return;
    }

    // Check Accept header for response mode
    const accept = req.headers.accept || '';
    const wantsSSE = accept.includes('text/event-stream');
    const isInitialize = mcpRequest.method === 'initialize';
    const isNotification = mcpRequest.id === undefined;

    // Get or validate session
    const sessionIdHeader = req.headers['mcp-session-id'] as string;

    // Requirement FR-8 (AC-8.1, AC-8.2, AC-8.3): Backward compatibility
    // For JSON-only clients (Accept: application/json without text/event-stream),
    // session management is optional to maintain backward compatibility
    const requiresSession = wantsSSE && !isInitialize;

    // Requirement FR-3 (AC-3.3): Session required for SSE mode after initialization
    if (requiresSession && !sessionIdHeader) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Mcp-Session-Id header required for SSE mode',
        },
        id: mcpRequest.id,
      }));
      return;
    }

    let session: StreamableSession | undefined;

    if (isInitialize) {
      // Create new session for initialize request
      session = this.sessionManager.createSession(userId);
    } else if (sessionIdHeader) {
      // Validate existing session
      session = this.sessionManager.getSession(sessionIdHeader);
      if (!session) {
        // For backward compatibility with JSON-only clients, allow requests
        // without valid session if they don't want SSE
        if (!wantsSSE) {
          // Process without session for backward compatibility
          session = undefined;
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Session not found or expired',
            },
            id: mcpRequest.id,
          }));
          return;
        }
      } else {
        // Requirement FR-6 (AC-6.3): Session bound to authenticated user
        if (session.userId && session.userId !== userId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Session belongs to different user',
            },
            id: mcpRequest.id,
          }));
          return;
        }
      }
    }

    // Update session activity
    if (session) {
      this.sessionManager.touchSession(session.id);
    }

    // Process MCP request
    const mcpResponse = await this.mcpHandler.handleRequest(mcpRequest);

    // Update session state after initialize
    if (isInitialize && session && mcpResponse && !('error' in mcpResponse)) {
      session.initialized = true;
      // Extract capabilities from initialize response
      const result = mcpResponse.result as { capabilities?: Record<string, unknown> } | undefined;
      if (result?.capabilities) {
        session.capabilities = result.capabilities;
      }
    }

    // Handle notifications (no response expected per MCP spec)
    // Notifications have no 'id' field and should return 202 Accepted
    if (isNotification) {
      const notificationHeaders: Record<string, string> = {
        'Content-Length': '0',
      };
      // Include session ID for initialize notification (rare but possible)
      if (session) {
        notificationHeaders['Mcp-Session-Id'] = session.id;
      }
      res.writeHead(202, notificationHeaders);
      res.end();
      return;
    }

    // Determine response headers
    const responseHeaders: Record<string, string> = {};

    // Requirement FR-3 (AC-3.1): Include session ID on initialize
    if (isInitialize && session) {
      responseHeaders['Mcp-Session-Id'] = session.id;
    }

    // Requirement FR-2 (AC-2.1, AC-2.4): Respond based on Accept header
    if (wantsSSE) {
      // SSE response mode
      responseHeaders['Content-Type'] = 'text/event-stream';
      responseHeaders['Cache-Control'] = 'no-cache';
      responseHeaders['Connection'] = 'keep-alive';
      res.writeHead(200, responseHeaders);

      // Generate event ID for resumability
      const eventId = `${session?.id || 'anon'}-${Date.now()}`;

      // Send response as SSE event with ID
      const ssePayload = `id: ${eventId}\ndata: ${JSON.stringify(mcpResponse)}\n\n`;
      res.write(ssePayload);

      // Buffer event for resumability if session exists
      if (session) {
        const bufferedEvent: BufferedEvent = {
          id: eventId,
          streamId: 'post',
          data: mcpResponse,
          timestamp: Date.now(),
        };
        this.sessionManager.bufferEvent(session.id, bufferedEvent);
      }

      // Close stream after response (single request-response)
      res.end();
    } else {
      // JSON response mode (backward compatible)
      responseHeaders['Content-Type'] = 'application/json';
      res.writeHead(200, responseHeaders);
      res.end(JSON.stringify(mcpResponse));
    }
  }

  /**
   * Handle DELETE /mcp - Terminate session
   * Requirement: FR-3 (AC-3.5)
   */
  async handleDeleteRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Bad Request',
        message: 'Mcp-Session-Id header required',
      }));
      return;
    }

    // Validate session ID format
    const validation = validateSessionId(sessionId);
    if (!validation.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Bad Request',
        message: 'Invalid session ID format',
      }));
      return;
    }

    // Check if session exists
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Not Found',
        message: 'Session not found or expired',
      }));
      return;
    }

    // Delete session
    const deleted = this.sessionManager.deleteSession(sessionId);

    if (deleted) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Session terminated',
      }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal Error',
        message: 'Failed to terminate session',
      }));
    }
  }

  /**
   * Send server-initiated message to session
   * Requirement: FR-7 (AC-7.2)
   */
  sendToSession(sessionId: string, message: unknown): boolean {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Update activity
    this.sessionManager.touchSession(sessionId);

    // Send via SSE handler
    const result = this.sseHandler.sendEventWithId(sessionId, message);

    // Buffer event for resumability
    if (result.sent && result.eventId) {
      const bufferedEvent: BufferedEvent = {
        id: result.eventId,
        streamId: sessionId,
        data: message,
        timestamp: Date.now(),
      };
      this.sessionManager.bufferEvent(sessionId, bufferedEvent);
    }

    return result.sent;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): StreamableSession | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessionManager.getSessionCount();
  }

  /**
   * Cleanup expired sessions and connections
   */
  cleanup(): void {
    this.sessionManager.cleanupExpiredSessions();
    this.sseHandler.cleanup();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Read request body as string
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
        // Limit body size to 10MB
        if (body.length > 10 * 1024 * 1024) {
          reject(new Error('Request body too large'));
        }
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    // Cleanup every minute
    this.cleanupTimer = setInterval(() => {
      this.sessionManager.cleanupExpiredSessions();
    }, 60000);
  }
}

/**
 * Create Streamable HTTP handler
 */
export function createStreamableHTTPHandler(
  mcpHandler: MCPHandler,
  sseHandler: SSEStreamHandler,
  options: StreamableHTTPHandlerOptions = {}
): StreamableHTTPHandler {
  return new StreamableHTTPHandlerImpl(mcpHandler, sseHandler, options);
}
