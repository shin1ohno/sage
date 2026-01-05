/**
 * Session Store
 * Requirements: 26 (Session Management)
 *
 * Manages user sessions for OAuth authentication flow.
 * Sessions track authenticated users during the consent process.
 */

import { randomBytes } from 'crypto';
import { UserSession } from './types.js';

/**
 * Session Store Interface
 */
export interface SessionStore {
  createSession(userId: string): UserSession;
  getSession(sessionId: string): UserSession | null;
  deleteSession(sessionId: string): void;
}

/**
 * In-memory Session Store Implementation
 */
export class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, UserSession> = new Map();
  private sessionExpiryMs = 24 * 60 * 60 * 1000; // 24 hours

  createSession(userId: string): UserSession {
    const sessionId = randomBytes(32).toString('hex');
    const now = Date.now();
    const session: UserSession = {
      sessionId,
      userId,
      createdAt: now,
      expiresAt: now + this.sessionExpiryMs,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

/**
 * Create a Session Store instance
 */
export function createSessionStore(): SessionStore {
  return new InMemorySessionStore();
}
