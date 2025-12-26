/**
 * OAuth Authorization Code Store
 * Requirements: 25.9, 25.10, 26.4
 *
 * Manages authorization code generation, storage, and validation.
 */

import { randomBytes } from 'crypto';
import { AuthorizationCode, CodeChallengeMethod } from './types.js';

/**
 * Configuration for Authorization Code Store
 */
export interface AuthorizationCodeStoreConfig {
  expirySeconds: number;
}

/**
 * Options for generating an authorization code
 */
export interface GenerateCodeOptions {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: CodeChallengeMethod;
  userId: string;
  resource?: string;
}

/**
 * Result of validating an authorization code
 */
export interface CodeValidationResult {
  valid: boolean;
  codeData?: AuthorizationCode;
  error?: string;
}

/**
 * Authorization Code Store Interface
 */
export interface AuthorizationCodeStore {
  generateCode(options: GenerateCodeOptions): Promise<string>;
  validateCode(code: string, clientId: string): Promise<CodeValidationResult>;
  consumeCode(code: string, clientId: string): Promise<CodeValidationResult>;
  revokeCode(code: string): Promise<void>;
  cleanup(): Promise<number>;
}

/**
 * In-memory Authorization Code Store Implementation
 */
class InMemoryAuthorizationCodeStore implements AuthorizationCodeStore {
  private codes: Map<string, AuthorizationCode> = new Map();
  private config: AuthorizationCodeStoreConfig;

  constructor(config: AuthorizationCodeStoreConfig) {
    this.config = config;
  }

  async generateCode(options: GenerateCodeOptions): Promise<string> {
    // Generate secure random code
    const code = randomBytes(32).toString('base64url');

    const now = Date.now();
    const expiresAt = now + this.config.expirySeconds * 1000;

    const codeData: AuthorizationCode = {
      code,
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      scope: options.scope,
      code_challenge: options.codeChallenge,
      code_challenge_method: options.codeChallengeMethod,
      resource: options.resource,
      user_id: options.userId,
      created_at: now,
      expires_at: expiresAt,
      used: false,
    };

    this.codes.set(code, codeData);

    return code;
  }

  async validateCode(code: string, clientId: string): Promise<CodeValidationResult> {
    const codeData = this.codes.get(code);

    if (!codeData) {
      return { valid: false, error: 'invalid_grant' };
    }

    // Check if code has been used
    if (codeData.used) {
      return { valid: false, error: 'invalid_grant' };
    }

    // Check if code has expired
    if (Date.now() > codeData.expires_at) {
      this.codes.delete(code);
      return { valid: false, error: 'invalid_grant' };
    }

    // Verify client_id matches
    if (codeData.client_id !== clientId) {
      return { valid: false, error: 'invalid_grant' };
    }

    return { valid: true, codeData };
  }

  async consumeCode(code: string, clientId: string): Promise<CodeValidationResult> {
    const validationResult = await this.validateCode(code, clientId);

    if (!validationResult.valid) {
      return validationResult;
    }

    // Mark code as used (Requirement 25.10: one-time use)
    const codeData = this.codes.get(code)!;
    codeData.used = true;

    return validationResult;
  }

  async revokeCode(code: string): Promise<void> {
    this.codes.delete(code);
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [code, data] of this.codes.entries()) {
      if (data.expires_at < now || data.used) {
        this.codes.delete(code);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

/**
 * Create an Authorization Code Store instance
 */
export function createAuthorizationCodeStore(
  config: AuthorizationCodeStoreConfig
): AuthorizationCodeStore {
  return new InMemoryAuthorizationCodeStore(config);
}
