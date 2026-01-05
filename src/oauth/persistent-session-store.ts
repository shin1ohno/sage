/**
 * Persistent Session Store
 * Requirements: 26 (Session Management)
 *
 * Stores user sessions with encrypted filesystem persistence.
 * Implements automatic cleanup of expired sessions and session limits.
 */

import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { UserSession } from './types.js';
import { EncryptionService } from './encryption-service.js';
import { SessionStore } from './session-store.js';

/**
 * Session Storage Format
 */
interface SessionStorage {
  version: number; // For future migrations
  sessions: UserSession[];
}

/**
 * Persistent Session Store Implementation
 *
 * Extends SessionStore interface with encrypted filesystem persistence.
 * Maintains in-memory cache for fast access while persisting to disk.
 */
export class PersistentSessionStore implements SessionStore {
  private sessions: Map<string, UserSession> = new Map();
  private sessionExpiryMs = 24 * 60 * 60 * 1000; // 24 hours
  private maxSessions = 100; // Limit to prevent unbounded growth
  private encryptionService: EncryptionService;
  private storagePath: string;

  constructor(encryptionService: EncryptionService, storagePath?: string) {
    this.encryptionService = encryptionService;
    this.storagePath = storagePath || join(homedir(), '.sage', 'oauth_sessions.enc');
  }

  /**
   * Load sessions from encrypted file
   *
   * Filters out expired sessions during load.
   * Logs loaded and expired session counts.
   */
  async loadFromStorage(): Promise<void> {
    const data = await this.encryptionService.decryptFromFile(this.storagePath);
    if (!data) {
      console.log('[OAuth] No existing sessions found, starting fresh');
      return;
    }

    try {
      const storage: SessionStorage = JSON.parse(data);

      // Load sessions and filter expired ones
      const now = Date.now();
      let loadedCount = 0;
      let expiredCount = 0;

      for (const session of storage.sessions) {
        if (now < session.expiresAt) {
          this.sessions.set(session.sessionId, session);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }

      console.log(
        `[OAuth] Loaded ${loadedCount} sessions (${expiredCount} expired sessions cleaned up)`
      );
    } catch (error) {
      console.error('[OAuth] Failed to parse session storage, starting fresh:', error);
    }
  }

  /**
   * Save sessions to encrypted file
   *
   * Enforces session limit by keeping only most recent 100 sessions.
   */
  private async saveToStorage(): Promise<void> {
    // Enforce session limit by keeping only most recent sessions
    let sessions = Array.from(this.sessions.values());
    if (sessions.length > this.maxSessions) {
      sessions.sort((a, b) => b.createdAt - a.createdAt);
      sessions = sessions.slice(0, this.maxSessions);

      // Update map to reflect limit
      this.sessions.clear();
      for (const session of sessions) {
        this.sessions.set(session.sessionId, session);
      }
    }

    const storage: SessionStorage = {
      version: 1,
      sessions,
    };

    const data = JSON.stringify(storage, null, 2);
    await this.encryptionService.encryptToFile(data, this.storagePath);
  }

  /**
   * Create new session
   *
   * Saves asynchronously (fire and forget) to avoid blocking.
   */
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

    // Save asynchronously (don't wait)
    this.saveToStorage().catch((err) =>
      console.error('[OAuth] Failed to save session:', err)
    );

    return session;
  }

  /**
   * Get session by ID
   *
   * Checks expiry and removes expired sessions automatically.
   */
  getSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check expiry
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      this.saveToStorage().catch((err) =>
        console.error('[OAuth] Failed to save after session expiry:', err)
      );
      return null;
    }

    return session;
  }

  /**
   * Delete session
   *
   * Saves asynchronously after deletion.
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.saveToStorage().catch((err) =>
      console.error('[OAuth] Failed to save after session deletion:', err)
    );
  }

  /**
   * Flush pending saves
   *
   * Call on server shutdown to ensure all data is persisted.
   */
  async flush(): Promise<void> {
    await this.saveToStorage();
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): {
    count: number;
    expiredCount: number;
  } {
    const now = Date.now();
    let expiredCount = 0;

    for (const session of this.sessions.values()) {
      if (session.expiresAt < now) {
        expiredCount++;
      }
    }

    return {
      count: this.sessions.size,
      expiredCount,
    };
  }
}
