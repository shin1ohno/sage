/**
 * Session Manager for Streamable HTTP Transport
 * Requirement: FR-3 (Session Management)
 *
 * Manages session lifecycle for MCP Streamable HTTP Transport protocol.
 */

import { randomUUID } from 'crypto';
import type {
  StreamableSession,
  BufferedEvent,
  SessionManager,
} from '../types/streamable-http.js';

/**
 * Session Manager Options
 */
export interface SessionManagerOptions {
  /** Session timeout in milliseconds */
  sessionTimeout?: number;

  /** Event buffer retention in milliseconds */
  eventBufferRetention?: number;

  /** Maximum sessions per server */
  maxSessions?: number;

  /** Maximum buffer events per session */
  maxBufferEventsPerSession?: number;
}

/**
 * Default options for SessionManager
 */
const DEFAULT_OPTIONS: Required<SessionManagerOptions> = {
  sessionTimeout: 3600000,        // 1 hour
  eventBufferRetention: 300000,   // 5 minutes
  maxSessions: 1000,
  maxBufferEventsPerSession: 1000,
};

/**
 * Session Manager Implementation
 */
export class SessionManagerImpl implements SessionManager {
  private sessions: Map<string, StreamableSession> = new Map();
  private options: Required<SessionManagerOptions>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: SessionManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Create new session
   * Requirement: FR-3 (AC-3.1)
   */
  createSession(userId?: string): StreamableSession {
    // Enforce session limit
    if (this.sessions.size >= this.options.maxSessions) {
      // Clean up expired sessions first
      this.cleanupExpiredSessions();

      // If still at limit, reject
      if (this.sessions.size >= this.options.maxSessions) {
        throw new Error('Maximum session limit reached');
      }
    }

    const now = Date.now();
    const session: StreamableSession = {
      id: randomUUID(),
      userId,
      createdAt: now,
      lastActivityAt: now,
      activeStreams: new Set(),
      eventBuffer: new Map(),
      initialized: false,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get existing session
   * Requirement: FR-3 (AC-3.2)
   */
  getSession(sessionId: string): StreamableSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    // Check if session is expired
    const now = Date.now();
    if (now - session.lastActivityAt > this.options.sessionTimeout) {
      this.deleteSession(sessionId);
      return undefined;
    }

    return session;
  }

  /**
   * Update session activity timestamp
   */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /**
   * Delete session
   * Requirement: FR-3 (AC-3.5)
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Clear event buffer
    session.eventBuffer.clear();
    session.activeStreams.clear();

    return this.sessions.delete(sessionId);
  }

  /**
   * Add event to session buffer for resumability
   * Requirement: FR-5 (AC-5.1, AC-5.2)
   */
  bufferEvent(sessionId: string, event: BufferedEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Enforce buffer limit per session
    if (session.eventBuffer.size >= this.options.maxBufferEventsPerSession) {
      // Remove oldest events
      const sortedEvents = Array.from(session.eventBuffer.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      // Remove oldest 10%
      const toRemove = Math.ceil(sortedEvents.length * 0.1);
      for (let i = 0; i < toRemove; i++) {
        session.eventBuffer.delete(sortedEvents[i][0]);
      }
    }

    session.eventBuffer.set(event.id, event);
    this.cleanupExpiredEvents(session);
  }

  /**
   * Get events after specified event ID for resumability
   * Requirement: FR-5 (AC-5.1, AC-5.2, AC-5.3)
   */
  getEventsAfter(sessionId: string, lastEventId: string): BufferedEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    // Find the last event
    const lastEvent = session.eventBuffer.get(lastEventId);
    if (!lastEvent) {
      // Event not found, start fresh
      return [];
    }

    // Get events after the specified event ID (same stream only)
    // Requirement: FR-5 (AC-5.3) - Do not replay from different streams
    const events = Array.from(session.eventBuffer.values())
      .filter(e =>
        e.timestamp > lastEvent.timestamp &&
        e.streamId === lastEvent.streamId
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    return events;
  }

  /**
   * Cleanup expired sessions
   * Requirement: NFR-1, NFR-3
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > this.options.sessionTimeout) {
        this.deleteSession(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get active session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Start periodic cleanup timer
   */
  startCleanupTimer(intervalMs: number = 60000): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, intervalMs);
  }

  /**
   * Stop periodic cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cleanup expired events from session buffer
   */
  private cleanupExpiredEvents(session: StreamableSession): void {
    const cutoff = Date.now() - this.options.eventBufferRetention;

    for (const [eventId, event] of session.eventBuffer.entries()) {
      if (event.timestamp < cutoff) {
        session.eventBuffer.delete(eventId);
      }
    }
  }
}

/**
 * Create session manager
 * Factory function for creating session manager instances
 */
export function createSessionManager(
  options: SessionManagerOptions = {}
): SessionManager {
  return new SessionManagerImpl(options);
}

// Re-export SessionManager type for external use
export type { SessionManager } from '../types/streamable-http.js';
