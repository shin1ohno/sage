/**
 * Persistent Refresh Token Store
 * Requirements: 21.6, 26.3, 26.8
 *
 * Extends InMemoryRefreshTokenStore with encrypted filesystem persistence.
 * Maintains same interface but survives server restarts.
 */

import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import {
  RefreshTokenStore,
  RefreshTokenStoreConfig,
  GenerateRefreshTokenOptions,
  RefreshTokenValidationResult,
} from './refresh-token-store.js';
import { RefreshToken } from './types.js';
import { EncryptionService } from './encryption-service.js';
import { oauthLogger } from '../utils/logger.js';

/**
 * Storage format for refresh tokens
 */
interface RefreshTokenStorage {
  version: number; // For future migrations
  tokens: RefreshToken[];
}

/**
 * Persistent Refresh Token Store Implementation
 *
 * Provides encrypted filesystem persistence for refresh tokens
 * while maintaining in-memory cache for fast access.
 */
export class PersistentRefreshTokenStore implements RefreshTokenStore {
  private tokens: Map<string, RefreshToken> = new Map();
  private config: RefreshTokenStoreConfig;
  private encryptionService: EncryptionService;
  private storagePath: string;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private saveDebounceMs = 1000; // Batch saves within 1 second

  constructor(
    config: RefreshTokenStoreConfig,
    encryptionService: EncryptionService,
    storagePath?: string
  ) {
    this.config = config;
    this.encryptionService = encryptionService;
    this.storagePath = storagePath || join(homedir(), '.sage', 'oauth_refresh_tokens.enc');
  }

  /**
   * Load tokens from encrypted file
   */
  async loadFromStorage(): Promise<void> {
    const data = await this.encryptionService.decryptFromFile(this.storagePath);
    if (!data) {
      oauthLogger.info('No existing refresh tokens found, starting fresh');
      return;
    }

    try {
      const storage: RefreshTokenStorage = JSON.parse(data);

      // Load tokens and filter expired ones
      const now = Date.now();
      let loadedCount = 0;
      let expiredCount = 0;

      for (const token of storage.tokens) {
        if (now < token.expires_at) {
          this.tokens.set(token.token, token);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }

      oauthLogger.info({ loadedCount, expiredCount }, 'Loaded refresh tokens');
    } catch (error) {
      oauthLogger.error({ err: error }, 'Failed to parse refresh token storage, starting fresh');
    }
  }

  /**
   * Save tokens to encrypted file immediately
   */
  async saveToStorage(): Promise<void> {
    const storage: RefreshTokenStorage = {
      version: 1,
      tokens: Array.from(this.tokens.values()),
    };

    const data = JSON.stringify(storage, null, 2);
    await this.encryptionService.encryptToFile(data, this.storagePath);
  }

  /**
   * Schedule save operation with debouncing
   *
   * Batches multiple writes within 1 second to reduce I/O operations.
   */
  private scheduleSave(): void {
    // Clear existing timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Schedule save after debounce period
    this.saveDebounceTimer = setTimeout(async () => {
      try {
        await this.saveToStorage();
      } catch (error) {
        oauthLogger.error({ err: error }, 'Failed to save refresh tokens');
      }
    }, this.saveDebounceMs);
  }

  /**
   * Generate new refresh token
   */
  async generateToken(options: GenerateRefreshTokenOptions): Promise<string> {
    // Generate secure random token
    const token = randomBytes(32).toString('base64url');

    const now = Date.now();
    const expiresAt = now + this.config.expirySeconds * 1000;

    const tokenData: RefreshToken = {
      token,
      client_id: options.clientId,
      user_id: options.userId,
      scope: options.scope,
      created_at: now,
      expires_at: expiresAt,
      rotated: false,
    };

    this.tokens.set(token, tokenData);

    // Schedule debounced save
    this.scheduleSave();

    return token;
  }

  /**
   * Validate refresh token
   */
  async validateToken(token: string, clientId: string): Promise<RefreshTokenValidationResult> {
    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      return { valid: false, error: 'invalid_grant' };
    }

    // Check if token has been rotated
    if (tokenData.rotated) {
      return { valid: false, error: 'invalid_grant' };
    }

    // Check if token has expired
    if (Date.now() > tokenData.expires_at) {
      this.tokens.delete(token);
      this.scheduleSave();
      return { valid: false, error: 'invalid_grant' };
    }

    // Verify client_id matches
    if (tokenData.client_id !== clientId) {
      return { valid: false, error: 'invalid_grant' };
    }

    return { valid: true, tokenData };
  }

  /**
   * Rotate refresh token
   */
  async rotateToken(token: string, clientId: string): Promise<string | null> {
    const validationResult = await this.validateToken(token, clientId);

    if (!validationResult.valid || !validationResult.tokenData) {
      return null;
    }

    // Mark old token as rotated (Requirement 26.8)
    const oldTokenData = this.tokens.get(token)!;
    oldTokenData.rotated = true;

    // Generate new token with same scope
    const newToken = await this.generateToken({
      clientId: validationResult.tokenData.client_id,
      userId: validationResult.tokenData.user_id,
      scope: validationResult.tokenData.scope,
    });

    // scheduleSave is already called in generateToken
    return newToken;
  }

  /**
   * Revoke refresh token
   */
  async revokeToken(token: string): Promise<void> {
    this.tokens.delete(token);
    this.scheduleSave();
  }

  /**
   * Revoke all tokens for client
   */
  async revokeAllForClient(clientId: string): Promise<void> {
    for (const [token, data] of this.tokens.entries()) {
      if (data.client_id === clientId) {
        this.tokens.delete(token);
      }
    }
    this.scheduleSave();
  }

  /**
   * Clean up expired and rotated tokens
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, data] of this.tokens.entries()) {
      if (data.expires_at < now || data.rotated) {
        this.tokens.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.scheduleSave();
    }

    return cleanedCount;
  }

  /**
   * Flush pending saves (call on server shutdown)
   *
   * Ensures all pending changes are written to disk before server shutdown.
   */
  async flush(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    await this.saveToStorage();
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): {
    count: number;
    expiredCount: number;
    rotatedCount: number;
  } {
    const now = Date.now();
    let expiredCount = 0;
    let rotatedCount = 0;

    for (const token of this.tokens.values()) {
      if (token.expires_at < now) {
        expiredCount++;
      }
      if (token.rotated) {
        rotatedCount++;
      }
    }

    return {
      count: this.tokens.size,
      expiredCount,
      rotatedCount,
    };
  }
}
