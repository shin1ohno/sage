/**
 * Streamable HTTP Transport Types
 * Requirements: FR-3, FR-4, FR-5
 *
 * Type definitions for MCP Streamable HTTP Transport protocol.
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
 */

/**
 * MCP capabilities negotiated during initialization
 */
export interface MCPCapabilities {
  /** Root listing capability */
  roots?: { listChanged?: boolean };
  /** Sampling capability */
  sampling?: object;
  /** Experimental capabilities */
  experimental?: Record<string, unknown>;
}

/**
 * Session for Streamable HTTP Transport
 * Maintains state across multiple requests from a client
 * Requirement: FR-3
 */
export interface StreamableSession {
  /** Cryptographically secure session ID (UUID v4) */
  id: string;

  /** User ID from authentication */
  userId?: string;

  /** Creation timestamp (milliseconds) */
  createdAt: number;

  /** Last activity timestamp (milliseconds) */
  lastActivityAt: number;

  /** Active SSE stream connection IDs for this session */
  activeStreams: Set<string>;

  /** Event buffer for resumability (event ID -> event data) */
  eventBuffer: Map<string, BufferedEvent>;

  /** MCP initialization state */
  initialized: boolean;

  /** MCP capabilities negotiated */
  capabilities?: MCPCapabilities;
}

/**
 * Buffered event for stream resumability
 * Requirement: FR-5
 */
export interface BufferedEvent {
  /** Unique event ID */
  id: string;

  /** Stream ID this event was sent to */
  streamId: string;

  /** Event data (JSON-RPC message) */
  data: unknown;

  /** Timestamp when event was buffered (milliseconds) */
  timestamp: number;
}

/**
 * Extended SSE Connection with event ID support
 * Requirement: FR-4
 */
export interface SSEConnectionExtended {
  /** Unique connection ID */
  id: string;

  /** Session ID this connection belongs to */
  sessionId: string;

  /** Last sent event ID */
  lastEventId: string;

  /** Event counter for this stream */
  eventCounter: number;
}

/**
 * Options for StreamableHTTPHandler
 */
export interface StreamableHTTPHandlerOptions {
  /** Session timeout in milliseconds (default: 1 hour = 3600000) */
  sessionTimeout?: number;

  /** Event buffer retention in milliseconds (default: 5 minutes = 300000) */
  eventBufferRetention?: number;

  /** Keepalive interval in milliseconds (default: 30 seconds = 30000) */
  keepaliveInterval?: number;

  /** Maximum sessions per server (default: 1000) */
  maxSessions?: number;

  /** Maximum SSE connections per session (default: 5) */
  maxStreamsPerSession?: number;
}

/**
 * Default options for Streamable HTTP handler
 */
export const STREAMABLE_HTTP_DEFAULTS: Required<StreamableHTTPHandlerOptions> = {
  sessionTimeout: 3600000,       // 1 hour
  eventBufferRetention: 300000,  // 5 minutes
  keepaliveInterval: 30000,      // 30 seconds
  maxSessions: 1000,
  maxStreamsPerSession: 5,
};

/**
 * Result of sending an event with ID
 */
export interface SendEventResult {
  /** Whether the event was sent successfully */
  sent: boolean;

  /** Event ID assigned to this event */
  eventId: string;
}

/**
 * Streamable HTTP error response
 */
export interface StreamableHTTPError {
  /** HTTP status code */
  status: number;

  /** Error message */
  message: string;

  /** JSON-RPC error (if applicable) */
  jsonrpc?: {
    jsonrpc: '2.0';
    error: {
      code: number;
      message: string;
      data?: unknown;
    };
  };
}

/**
 * Session manager interface
 */
export interface SessionManager {
  /**
   * Create new session
   * @param userId - Optional authenticated user ID
   */
  createSession(userId?: string): StreamableSession;

  /**
   * Get existing session
   * @param sessionId - Session ID to retrieve
   */
  getSession(sessionId: string): StreamableSession | undefined;

  /**
   * Update session activity timestamp
   * @param sessionId - Session ID to touch
   */
  touchSession(sessionId: string): void;

  /**
   * Delete session
   * @param sessionId - Session ID to delete
   * @returns true if session was deleted
   */
  deleteSession(sessionId: string): boolean;

  /**
   * Add event to session buffer for resumability
   * @param sessionId - Session ID
   * @param event - Event to buffer
   */
  bufferEvent(sessionId: string, event: BufferedEvent): void;

  /**
   * Get events after specified event ID for resumability
   * @param sessionId - Session ID
   * @param lastEventId - Last event ID received by client
   */
  getEventsAfter(sessionId: string, lastEventId: string): BufferedEvent[];

  /**
   * Cleanup expired sessions
   * @returns Number of sessions cleaned up
   */
  cleanupExpiredSessions(): number;

  /**
   * Get active session count
   */
  getSessionCount(): number;
}
