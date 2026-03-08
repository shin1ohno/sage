/**
 * Pending Google Auth Store
 * Requirements: FR-3 (Pending Auth Session Management)
 *
 * Manages pending Google OAuth authentication sessions for remote mode.
 * Sessions are stored encrypted and expire after a configurable timeout.
 */

import { randomUUID } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { EncryptionService } from './encryption-service.js';
import { oauthLogger } from '../utils/logger.js';

/**
 * Pending Google Auth Session
 */
export interface PendingGoogleAuth {
  state: string;           // UUID v4 for CSRF protection
  codeVerifier: string;    // PKCE code_verifier
  redirectUri: string;     // Callback URL used
  createdAt: number;       // Unix timestamp (ms)
  expiresAt: number;       // Unix timestamp (ms)
}

/**
 * Storage format for persistence
 */
interface PendingGoogleAuthStorage {
  version: 1;
  sessions: PendingGoogleAuth[];
}

/**
 * Result of creating a new pending auth session
 */
export interface CreatePendingAuthResult {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Default session timeout (10 minutes)
 */
const DEFAULT_SESSION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Cleanup interval (5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Pending Google Auth Store
 *
 * Manages pending OAuth sessions with encrypted persistence.
 */
export class PendingGoogleAuthStore {
  private sessions: Map<string, PendingGoogleAuth> = new Map();
  private readonly storagePath: string;
  private readonly encryptionService: EncryptionService;
  private readonly sessionTimeoutMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor(encryptionKey?: string) {
    this.storagePath = join(homedir(), '.sage', 'google_pending_auth.enc');
    this.encryptionService = new EncryptionService({
      encryptionKey: encryptionKey || process.env.SAGE_ENCRYPTION_KEY,
    });

    // Parse session timeout from environment or use default
    const timeoutEnv = process.env.GOOGLE_AUTH_SESSION_TIMEOUT;
    this.sessionTimeoutMs = timeoutEnv
      ? parseInt(timeoutEnv, 10) * 1000
      : DEFAULT_SESSION_TIMEOUT_MS;
  }

  /**
   * Initialize the store and start cleanup timer
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.encryptionService.initialize();
    await this.load();

    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    this.cleanupTimer.unref();

    this.initialized = true;
    oauthLogger.info('PendingGoogleAuthStore initialized');
  }

  /**
   * Create a new pending auth session
   *
   * @param redirectUri - The OAuth callback URL
   * @returns Session state, code_verifier, and code_challenge
   */
  create(redirectUri: string): CreatePendingAuthResult {
    const state = randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const now = Date.now();
    const session: PendingGoogleAuth = {
      state,
      codeVerifier,
      redirectUri,
      createdAt: now,
      expiresAt: now + this.sessionTimeoutMs,
    };

    this.sessions.set(state, session);

    // Persist asynchronously (don't block)
    this.persist().catch(err => {
      oauthLogger.error({ err }, 'Failed to persist pending auth session');
    });

    oauthLogger.info({ state }, 'Created pending auth session');

    return {
      state,
      codeVerifier,
      codeChallenge,
    };
  }

  /**
   * Find a session by state
   *
   * @param state - The session state (UUID)
   * @returns The session or null if not found/expired
   */
  findByState(state: string): PendingGoogleAuth | null {
    const session = this.sessions.get(state);

    if (!session) {
      return null;
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(state);
      oauthLogger.info({ state }, 'Session expired');
      return null;
    }

    return session;
  }

  /**
   * Remove a session by state
   *
   * @param state - The session state to remove
   */
  remove(state: string): void {
    const existed = this.sessions.delete(state);

    if (existed) {
      oauthLogger.info({ state }, 'Removed pending auth session');

      // Persist asynchronously
      this.persist().catch(err => {
        oauthLogger.error({ err }, 'Failed to persist after session removal');
      });
    }
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpired(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [state, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(state);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      oauthLogger.info({ removedCount }, 'Cleaned up expired sessions');

      // Persist asynchronously
      this.persist().catch(err => {
        oauthLogger.error({ err }, 'Failed to persist after cleanup');
      });
    }
  }

  /**
   * Get session timeout in seconds
   */
  getSessionTimeoutSeconds(): number {
    return Math.floor(this.sessionTimeoutMs / 1000);
  }

  /**
   * Persist sessions to encrypted file
   */
  async persist(): Promise<void> {
    try {
      const storage: PendingGoogleAuthStorage = {
        version: 1,
        sessions: Array.from(this.sessions.values()),
      };

      await this.encryptionService.encryptToFile(
        JSON.stringify(storage),
        this.storagePath
      );

      oauthLogger.debug({ sessionCount: this.sessions.size }, 'Persisted pending auth sessions');
    } catch (error) {
      oauthLogger.error({ err: error }, 'Failed to persist pending auth sessions');
      throw error;
    }
  }

  /**
   * Load sessions from encrypted file
   */
  async load(): Promise<void> {
    try {
      const data = await this.encryptionService.decryptFromFile(this.storagePath);

      if (data === null) {
        oauthLogger.debug('No existing pending auth sessions found');
        return;
      }

      const storage: PendingGoogleAuthStorage = JSON.parse(data);

      if (storage.version !== 1) {
        oauthLogger.warn({ version: storage.version }, 'Unknown storage version, ignoring');
        return;
      }

      // Load sessions and filter out expired ones
      const now = Date.now();
      for (const session of storage.sessions) {
        if (now < session.expiresAt) {
          this.sessions.set(session.state, session);
        }
      }

      oauthLogger.info({ sessionCount: this.sessions.size }, 'Loaded pending auth sessions');
    } catch (error) {
      oauthLogger.error({ err: error }, 'Failed to load pending auth sessions');
      // Don't throw - start with empty sessions
    }
  }

  /**
   * Shutdown the store and stop cleanup timer
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Final persist
    await this.persist();

    oauthLogger.info('PendingGoogleAuthStore shutdown');
  }

  /**
   * Get the number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}
