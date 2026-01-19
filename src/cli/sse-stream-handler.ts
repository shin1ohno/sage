/**
 * SSE Stream Handler for Streamable HTTP Transport
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10
 * Enhanced for: FR-4, FR-5, FR-7 (Streamable HTTP Transport)
 *
 * Implements Server-Sent Events (SSE) streaming for the MCP Streamable HTTP protocol.
 * Handles GET /mcp requests by establishing SSE streams with keepalive support.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import type { SendEventResult } from '../types/streamable-http.js';

/**
 * Options for SSE stream handler
 */
export interface SSEStreamHandlerOptions {
  /** Keepalive interval in milliseconds (default: 30000) */
  keepaliveInterval?: number;
  /** Maximum connections per session (default: 5) */
  maxConnectionsPerSession?: number;
}

/**
 * Active SSE connection
 * Enhanced for Streamable HTTP Transport with event ID support
 * Requirement: FR-4 (AC-4.2, AC-4.3)
 */
interface SSEConnection {
  /** Unique connection ID */
  id: string;
  /** Session ID this connection belongs to */
  sessionId: string;
  /** HTTP response object */
  response: ServerResponse;
  /** Keepalive timer */
  keepaliveTimer: NodeJS.Timeout | null;
  /** Last sent event ID for resumability */
  lastEventId: string;
  /** Event counter for this stream */
  eventCounter: number;
}

/**
 * SSE Stream Handler interface
 */
export interface SSEStreamHandler {
  /**
   * Handle SSE request (GET /mcp)
   */
  handleSSERequest(req: IncomingMessage, res: ServerResponse): Promise<void>;

  /**
   * Send event to a specific session
   */
  sendEvent(eventType: string, data: unknown, sessionId?: string): void;

  /**
   * Send MCP JSON-RPC response to a specific session
   */
  sendResponseToSession(sessionId: string, response: unknown): boolean;

  /**
   * Send event with ID for resumability
   * Requirement: FR-4 (AC-4.2), FR-5
   */
  sendEventWithId(
    sessionId: string,
    data: unknown,
    eventId?: string
  ): SendEventResult;

  /**
   * Get connections by session ID
   * Requirement: FR-7 (AC-7.2)
   */
  getConnectionsBySessionId(sessionId: string): SSEConnection[];

  /**
   * Send to a specific session (routes to one stream)
   * Requirement: FR-7 (AC-7.2)
   */
  sendToSession(sessionId: string, message: unknown): boolean;

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean;

  /**
   * Broadcast event to all connected clients
   */
  broadcast(data: unknown): void;

  /**
   * Get number of active connections
   */
  getActiveConnections(): number;

  /**
   * Get connection by connection ID
   */
  getConnection(connectionId: string): SSEConnection | undefined;

  /**
   * Remove connection by connection ID
   */
  removeConnectionById(connectionId: string): void;

  /**
   * Cleanup all connections
   */
  cleanup(): void;
}

/**
 * Default keepalive interval (30 seconds)
 */
const DEFAULT_KEEPALIVE_INTERVAL = 30000;

/**
 * Default max connections per session
 */
const DEFAULT_MAX_CONNECTIONS_PER_SESSION = 5;

/**
 * SSE Stream Handler Implementation
 */
class SSEStreamHandlerImpl implements SSEStreamHandler {
  /** All connections indexed by connection ID */
  private connections: Map<string, SSEConnection> = new Map();
  /** Session to connection IDs mapping */
  private sessionConnections: Map<string, Set<string>> = new Map();
  /** Round-robin counter per session for routing */
  private sessionRouteIndex: Map<string, number> = new Map();
  private keepaliveInterval: number;
  private maxConnectionsPerSession: number;

  constructor(options: SSEStreamHandlerOptions = {}) {
    this.keepaliveInterval = options.keepaliveInterval ?? DEFAULT_KEEPALIVE_INTERVAL;
    this.maxConnectionsPerSession = options.maxConnectionsPerSession ?? DEFAULT_MAX_CONNECTIONS_PER_SESSION;
  }

  async handleSSERequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Extract session ID from query parameter or header or generate new one
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session') ||
                      req.headers['mcp-session-id'] as string ||
                      randomUUID();

    // Extract Last-Event-ID for resumability (FR-5)
    const lastEventId = req.headers['last-event-id'] as string || '';

    // Generate unique connection ID
    const connectionId = randomUUID();

    // Check connection limit per session
    const existingConnections = this.sessionConnections.get(sessionId);
    if (existingConnections && existingConnections.size >= this.maxConnectionsPerSession) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      });
      res.end(JSON.stringify({
        error: 'Too many connections for this session',
        maxConnections: this.maxConnectionsPerSession,
      }));
      return;
    }

    // Set SSE headers
    // Requirement 20.2: Content-Type text/event-stream
    // Requirement 20.5: Cache-Control no-cache
    // Requirement 20.6: Connection keep-alive
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Mcp-Session-Id': sessionId,
      // Requirement 20.4: CORS headers
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    });

    // Create connection record
    const connection: SSEConnection = {
      id: connectionId,
      sessionId,
      response: res,
      keepaliveTimer: null,
      lastEventId: lastEventId,
      eventCounter: lastEventId ? parseInt(lastEventId.split('-').pop() || '0', 10) : 0,
    };

    // Register connection
    this.connections.set(connectionId, connection);

    // Add to session mapping
    if (!this.sessionConnections.has(sessionId)) {
      this.sessionConnections.set(sessionId, new Set());
    }
    this.sessionConnections.get(sessionId)!.add(connectionId);

    // Requirement 20.1: Send endpoint event on connection
    this.sendEndpointEvent(connection);

    // Requirement 20.3: Start keepalive timer
    this.startKeepalive(connection);

    // Requirement 20.7: Handle client disconnect
    res.on('close', () => {
      this.removeConnectionById(connectionId);
    });

    res.on('error', () => {
      this.removeConnectionById(connectionId);
    });
  }

  sendEvent(eventType: string, data: unknown, sessionId?: string): void {
    const payload = this.formatSSEEvent(eventType, data);

    if (sessionId) {
      const connectionIds = this.sessionConnections.get(sessionId);
      if (connectionIds) {
        for (const connId of connectionIds) {
          const connection = this.connections.get(connId);
          if (connection) {
            try {
              connection.response.write(payload);
            } catch {
              this.removeConnectionById(connId);
            }
          }
        }
      }
    } else {
      // Send to all connections
      for (const connection of this.connections.values()) {
        try {
          connection.response.write(payload);
        } catch {
          this.removeConnectionById(connection.id);
        }
      }
    }
  }

  sendResponseToSession(sessionId: string, response: unknown): boolean {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds || connectionIds.size === 0) {
      return false;
    }

    // Send to first available connection
    for (const connId of connectionIds) {
      const connection = this.connections.get(connId);
      if (connection) {
        const payload = this.formatSSEEvent('message', response);
        try {
          connection.response.write(payload);
          return true;
        } catch {
          this.removeConnectionById(connId);
        }
      }
    }

    return false;
  }

  /**
   * Send event with ID for resumability
   * Requirement: FR-4 (AC-4.2), FR-5
   */
  sendEventWithId(
    sessionId: string,
    data: unknown,
    eventId?: string
  ): SendEventResult {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds || connectionIds.size === 0) {
      return { sent: false, eventId: '' };
    }

    // Get connection using round-robin
    const connection = this.getNextConnectionForSession(sessionId);
    if (!connection) {
      return { sent: false, eventId: '' };
    }

    // Generate or use provided event ID
    const finalEventId = eventId || this.generateEventId(connection);
    connection.lastEventId = finalEventId;

    // Format with event ID for resumability
    const payload = this.formatSSEEventWithId(finalEventId, data);

    try {
      connection.response.write(payload);
      return { sent: true, eventId: finalEventId };
    } catch {
      this.removeConnectionById(connection.id);
      return { sent: false, eventId: finalEventId };
    }
  }

  /**
   * Get connections by session ID
   * Requirement: FR-7 (AC-7.2)
   */
  getConnectionsBySessionId(sessionId: string): SSEConnection[] {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds) {
      return [];
    }

    const connections: SSEConnection[] = [];
    for (const connId of connectionIds) {
      const connection = this.connections.get(connId);
      if (connection) {
        connections.push(connection);
      }
    }
    return connections;
  }

  /**
   * Send to a specific session (routes to ONE stream)
   * Requirement: FR-7 (AC-7.2) - Each message is sent to only ONE connected stream
   */
  sendToSession(sessionId: string, message: unknown): boolean {
    const connection = this.getNextConnectionForSession(sessionId);
    if (!connection) {
      return false;
    }

    const eventId = this.generateEventId(connection);
    const payload = this.formatSSEEventWithId(eventId, message);

    try {
      connection.response.write(payload);
      connection.lastEventId = eventId;
      return true;
    } catch {
      this.removeConnectionById(connection.id);
      return false;
    }
  }

  hasSession(sessionId: string): boolean {
    const connectionIds = this.sessionConnections.get(sessionId);
    return connectionIds !== undefined && connectionIds.size > 0;
  }

  broadcast(data: unknown): void {
    const payload = this.formatSSEEvent('message', data);

    for (const connection of this.connections.values()) {
      try {
        connection.response.write(payload);
      } catch {
        this.removeConnectionById(connection.id);
      }
    }
  }

  getActiveConnections(): number {
    return this.connections.size;
  }

  getConnection(connectionId: string): SSEConnection | undefined {
    return this.connections.get(connectionId);
  }

  removeConnectionById(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      if (connection.keepaliveTimer) {
        clearInterval(connection.keepaliveTimer);
      }

      // Remove from session mapping
      const sessionConnections = this.sessionConnections.get(connection.sessionId);
      if (sessionConnections) {
        sessionConnections.delete(connectionId);
        if (sessionConnections.size === 0) {
          this.sessionConnections.delete(connection.sessionId);
          this.sessionRouteIndex.delete(connection.sessionId);
        }
      }

      this.connections.delete(connectionId);
    }
  }

  cleanup(): void {
    for (const connection of this.connections.values()) {
      if (connection.keepaliveTimer) {
        clearInterval(connection.keepaliveTimer);
      }
    }
    this.connections.clear();
    this.sessionConnections.clear();
    this.sessionRouteIndex.clear();
  }

  /**
   * Generate unique event ID for resumability
   * Requirement: FR-4 (AC-4.3)
   */
  private generateEventId(connection: SSEConnection): string {
    connection.eventCounter++;
    return `${connection.id}-${connection.eventCounter}`;
  }

  /**
   * Get next connection for session using round-robin
   * Requirement: FR-7 (AC-7.3)
   */
  private getNextConnectionForSession(sessionId: string): SSEConnection | undefined {
    const connectionIds = this.sessionConnections.get(sessionId);
    if (!connectionIds || connectionIds.size === 0) {
      return undefined;
    }

    const connArray = Array.from(connectionIds);
    const currentIndex = this.sessionRouteIndex.get(sessionId) || 0;
    const nextIndex = (currentIndex + 1) % connArray.length;
    this.sessionRouteIndex.set(sessionId, nextIndex);

    return this.connections.get(connArray[currentIndex]);
  }

  private sendEndpointEvent(connection: SSEConnection): void {
    const data = {
      type: 'endpoint',
      url: '/mcp',
      sessionId: connection.sessionId,
    };

    const payload = this.formatSSEEvent('endpoint', data);
    try {
      connection.response.write(payload);
    } catch {
      this.removeConnectionById(connection.id);
    }
  }

  private startKeepalive(connection: SSEConnection): void {
    connection.keepaliveTimer = setInterval(() => {
      // Requirement 20.3: Send keepalive comment every 30 seconds
      // Requirement FR-4 (AC-4.4): SSE comment format
      try {
        connection.response.write(': keepalive\n\n');
      } catch {
        this.removeConnectionById(connection.id);
      }
    }, this.keepaliveInterval);
  }

  private formatSSEEvent(eventType: string, data: unknown): string {
    const jsonData = JSON.stringify(data);
    return `event: ${eventType}\ndata: ${jsonData}\n\n`;
  }

  /**
   * Format SSE event with ID for resumability
   * Requirement: FR-4 (AC-4.2)
   */
  private formatSSEEventWithId(eventId: string, data: unknown): string {
    const jsonData = JSON.stringify(data);
    return `id: ${eventId}\ndata: ${jsonData}\n\n`;
  }
}

/**
 * Create SSE stream handler
 */
export function createSSEStreamHandler(
  options: SSEStreamHandlerOptions = {}
): SSEStreamHandler {
  return new SSEStreamHandlerImpl(options);
}
