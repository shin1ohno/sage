/**
 * OAuth Refresh Token Store
 * Requirements: 21.6, 26.3, 26.8
 *
 * Manages refresh token generation, storage, validation, and rotation.
 */

import { randomBytes } from 'crypto';
import { RefreshToken } from './types.js';

/**
 * Configuration for Refresh Token Store
 */
export interface RefreshTokenStoreConfig {
  expirySeconds: number;
}

/**
 * Options for generating a refresh token
 */
export interface GenerateRefreshTokenOptions {
  clientId: string;
  userId: string;
  scope: string;
}

/**
 * Result of validating a refresh token
 */
export interface RefreshTokenValidationResult {
  valid: boolean;
  tokenData?: RefreshToken;
  error?: string;
}

/**
 * Refresh Token Store Interface
 */
export interface RefreshTokenStore {
  generateToken(options: GenerateRefreshTokenOptions): Promise<string>;
  validateToken(token: string, clientId: string): Promise<RefreshTokenValidationResult>;
  rotateToken(token: string, clientId: string): Promise<string | null>;
  revokeToken(token: string): Promise<void>;
  revokeAllForClient(clientId: string): Promise<void>;
  cleanup(): Promise<number>;
}

/**
 * In-memory Refresh Token Store Implementation
 */
class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private tokens: Map<string, RefreshToken> = new Map();
  private config: RefreshTokenStoreConfig;

  constructor(config: RefreshTokenStoreConfig) {
    this.config = config;
  }

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

    return token;
  }

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
      return { valid: false, error: 'invalid_grant' };
    }

    // Verify client_id matches
    if (tokenData.client_id !== clientId) {
      return { valid: false, error: 'invalid_grant' };
    }

    return { valid: true, tokenData };
  }

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

    return newToken;
  }

  async revokeToken(token: string): Promise<void> {
    this.tokens.delete(token);
  }

  async revokeAllForClient(clientId: string): Promise<void> {
    for (const [token, data] of this.tokens.entries()) {
      if (data.client_id === clientId) {
        this.tokens.delete(token);
      }
    }
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, data] of this.tokens.entries()) {
      if (data.expires_at < now || data.rotated) {
        this.tokens.delete(token);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

/**
 * Create a Refresh Token Store instance
 */
export function createRefreshTokenStore(config: RefreshTokenStoreConfig): RefreshTokenStore {
  return new InMemoryRefreshTokenStore(config);
}
