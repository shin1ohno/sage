/**
 * Secret Authentication for Remote MCP Server
 * Requirements: 15.4, 15.5, 15.6
 *
 * Provides JWT-based authentication using a shared secret.
 */

import { createHmac, randomBytes } from 'crypto';

/**
 * Token response from authentication
 */
export interface TokenResponse {
  success: boolean;
  token?: string;
  expiresIn?: number; // seconds
  error?: string;
}

/**
 * Token verification result
 */
export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Secret authenticator configuration
 */
export interface SecretAuthConfig {
  secret: string;
  expiresIn: string;
}

/**
 * Secret authenticator interface
 */
export interface SecretAuthenticator {
  authenticate(providedSecret: string): Promise<TokenResponse>;
  verifyToken(token: string): Promise<VerifyResult>;
}

/**
 * Minimum secret length
 */
const MIN_SECRET_LENGTH = 32;

/**
 * Parse expiresIn string to seconds
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhdw])$/);
  if (!match) {
    return 86400; // Default to 24h
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    case 'w':
      return value * 604800;
    default:
      return 86400;
  }
}

/**
 * Base64url encode
 */
function base64urlEncode(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode
 */
function base64urlDecode(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Create JWT header
 */
function createHeader(): string {
  return base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
}

/**
 * Create JWT payload
 */
function createPayload(expiresInSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomBytes(16).toString('hex');

  return base64urlEncode(
    JSON.stringify({
      iat: now,
      exp: now + expiresInSeconds,
      jti,
    })
  );
}

/**
 * Create HMAC signature
 */
function createSignature(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return base64urlEncode(hmac.digest());
}

/**
 * Verify HMAC signature
 */
function verifySignature(data: string, signature: string, secret: string): boolean {
  const expectedSignature = createSignature(data, secret);
  return signature === expectedSignature;
}

/**
 * Create a secret authenticator
 */
export function createSecretAuthenticator(config: SecretAuthConfig): SecretAuthenticator {
  if (!config.secret || config.secret.length < MIN_SECRET_LENGTH) {
    throw new AuthError('Secret must be at least 32 characters');
  }

  const expiresInSeconds = parseExpiresIn(config.expiresIn);

  return {
    async authenticate(providedSecret: string): Promise<TokenResponse> {
      // Validate provided secret
      if (!providedSecret || providedSecret !== config.secret) {
        return {
          success: false,
          error: 'Invalid secret',
        };
      }

      // Generate JWT
      const header = createHeader();
      const payload = createPayload(expiresInSeconds);
      const signature = createSignature(`${header}.${payload}`, config.secret);
      const token = `${header}.${payload}.${signature}`;

      return {
        success: true,
        token,
        expiresIn: expiresInSeconds,
      };
    },

    async verifyToken(token: string): Promise<VerifyResult> {
      if (!token || !token.includes('.')) {
        return {
          valid: false,
          error: 'Invalid token format',
        };
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return {
          valid: false,
          error: 'Invalid token format',
        };
      }

      const [header, payload, signature] = parts;

      // Verify signature
      if (!verifySignature(`${header}.${payload}`, signature, config.secret)) {
        return {
          valid: false,
          error: 'Token signature invalid',
        };
      }

      // Parse and verify payload
      try {
        const payloadData = JSON.parse(base64urlDecode(payload));
        const now = Math.floor(Date.now() / 1000);

        if (payloadData.exp && payloadData.exp < now) {
          return {
            valid: false,
            error: 'Token expired',
          };
        }

        return { valid: true };
      } catch {
        return {
          valid: false,
          error: 'Invalid token payload',
        };
      }
    },
  };
}
