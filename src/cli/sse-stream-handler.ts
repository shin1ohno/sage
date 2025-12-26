/**
 * SSE Stream Handler for Streamable HTTP Transport
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10
 *
 * Implements Server-Sent Events (SSE) streaming for the MCP Streamable HTTP protocol.
 * Handles GET /mcp requests by establishing SSE streams with keepalive support.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

/**
 * Options for SSE stream handler
 */
export interface SSEStreamHandlerOptions {
  /** Keepalive interval in milliseconds (default: 30000) */
  keepaliveInterval?: number;
}

/**
 * Active SSE connection
 */
interface SSEConnection {
  sessionId: string;
  response: ServerResponse;
  keepaliveTimer: NodeJS.Timeout | null;
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
   * Broadcast event to all connected clients
   */
  broadcast(data: unknown): void;

  /**
   * Get number of active connections
   */
  getActiveConnections(): number;

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
 * SSE Stream Handler Implementation
 */
class SSEStreamHandlerImpl implements SSEStreamHandler {
  private connections: Map<string, SSEConnection> = new Map();
  private keepaliveInterval: number;

  constructor(options: SSEStreamHandlerOptions = {}) {
    this.keepaliveInterval = options.keepaliveInterval ?? DEFAULT_KEEPALIVE_INTERVAL;
  }

  async handleSSERequest(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = randomUUID();

    // Set SSE headers
    // Requirement 20.2: Content-Type text/event-stream
    // Requirement 20.5: Cache-Control no-cache
    // Requirement 20.6: Connection keep-alive
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      // Requirement 20.4: CORS headers
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });

    // Create connection record
    const connection: SSEConnection = {
      sessionId,
      response: res,
      keepaliveTimer: null,
    };

    this.connections.set(sessionId, connection);

    // Requirement 20.1: Send endpoint event on connection
    this.sendEndpointEvent(connection);

    // Requirement 20.3: Start keepalive timer
    this.startKeepalive(connection);

    // Requirement 20.7: Handle client disconnect
    res.on('close', () => {
      this.removeConnection(sessionId);
    });

    res.on('error', () => {
      this.removeConnection(sessionId);
    });
  }

  sendEvent(eventType: string, data: unknown, sessionId?: string): void {
    const payload = this.formatSSEEvent(eventType, data);

    if (sessionId) {
      const connection = this.connections.get(sessionId);
      if (connection) {
        connection.response.write(payload);
      }
    } else {
      // Send to all connections
      for (const connection of this.connections.values()) {
        connection.response.write(payload);
      }
    }
  }

  broadcast(data: unknown): void {
    const payload = this.formatSSEEvent('message', data);

    for (const connection of this.connections.values()) {
      connection.response.write(payload);
    }
  }

  getActiveConnections(): number {
    return this.connections.size;
  }

  cleanup(): void {
    for (const [sessionId, connection] of this.connections.entries()) {
      if (connection.keepaliveTimer) {
        clearInterval(connection.keepaliveTimer);
      }
      this.connections.delete(sessionId);
    }
  }

  private sendEndpointEvent(connection: SSEConnection): void {
    const data = {
      type: 'endpoint',
      url: '/mcp',
      sessionId: connection.sessionId,
    };

    const payload = this.formatSSEEvent('endpoint', data);
    connection.response.write(payload);
  }

  private startKeepalive(connection: SSEConnection): void {
    connection.keepaliveTimer = setInterval(() => {
      // Requirement 20.3: Send keepalive comment every 30 seconds
      // SSE comment format: ": comment\n\n"
      connection.response.write(': keepalive\n\n');
    }, this.keepaliveInterval);
  }

  private removeConnection(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (connection) {
      if (connection.keepaliveTimer) {
        clearInterval(connection.keepaliveTimer);
      }
      this.connections.delete(sessionId);
    }
  }

  private formatSSEEvent(eventType: string, data: unknown): string {
    const jsonData = JSON.stringify(data);
    return `event: ${eventType}\ndata: ${jsonData}\n\n`;
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
