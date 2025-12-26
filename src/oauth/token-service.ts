/**
 * OAuth Token Service
 * Requirements: 21.4, 21.5, 26.6, 26.7, 27.1-27.5
 *
 * Implements JWT access token generation and verification using RS256 signing.
 */

import { createSign, createVerify, generateKeyPairSync, randomUUID } from 'crypto';
import { AccessTokenClaims, TokenResponse, VerifyTokenResult } from './types.js';

/**
 * Token Service Configuration
 */
export interface TokenServiceConfig {
  issuer: string;
  privateKey: string;
  publicKey: string;
  accessTokenExpiry: string;
}

/**
 * Access Token Generation Options
 */
export interface GenerateAccessTokenOptions {
  clientId: string;
  userId: string;
  scope: string;
  audience: string;
}

/**
 * Token Service Interface
 */
export interface TokenService {
  generateAccessToken(options: GenerateAccessTokenOptions): Promise<TokenResponse>;
  verifyAccessToken(token: string, expectedAudience?: string): Promise<VerifyTokenResult>;
  extractTokenFromHeader(header: string | undefined): string | null;
}

/**
 * Parse duration string to seconds
 * Supports: s (seconds), m (minutes), h (hours), d (days), w (weeks)
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhdw])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
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
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Base64URL encode a string
 */
function base64UrlEncode(data: string | Buffer): string {
  const base64 = typeof data === 'string' ? Buffer.from(data).toString('base64') : data.toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode a string
 */
function base64UrlDecode(data: string): Buffer {
  // Add padding if needed
  const padding = 4 - (data.length % 4);
  const padded = padding < 4 ? data + '='.repeat(padding) : data;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/**
 * Create JWT token using RS256
 */
function createJWT(payload: Record<string, unknown>, privateKey: string): string {
  // Header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature input
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign using RS256
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey);

  // Encode signature
  const encodedSignature = base64UrlEncode(signature);

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Verify JWT token using RS256
 */
function verifyJWT(
  token: string,
  publicKey: string
): { valid: boolean; payload?: Record<string, unknown>; error?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format' };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    // Decode and verify header
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString());
    if (header.alg !== 'RS256') {
      return { valid: false, error: 'Invalid algorithm' };
    }

    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = base64UrlDecode(encodedSignature);

    const verify = createVerify('RSA-SHA256');
    verify.update(signatureInput);
    const isValid = verify.verify(publicKey, signature);

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString());

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Token verification failed' };
  }
}

/**
 * Token Service Implementation
 */
class TokenServiceImpl implements TokenService {
  private config: TokenServiceConfig;
  private expirySeconds: number;

  constructor(config: TokenServiceConfig) {
    this.config = config;
    this.expirySeconds = parseDuration(config.accessTokenExpiry);
  }

  async generateAccessToken(options: GenerateAccessTokenOptions): Promise<TokenResponse> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.expirySeconds;

    const claims: AccessTokenClaims = {
      iss: this.config.issuer,
      sub: options.userId,
      aud: options.audience,
      exp,
      iat: now,
      jti: randomUUID(),
      client_id: options.clientId,
      scope: options.scope,
    };

    const accessToken = createJWT(claims as unknown as Record<string, unknown>, this.config.privateKey);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.expirySeconds,
      scope: options.scope,
    };
  }

  async verifyAccessToken(token: string, expectedAudience?: string): Promise<VerifyTokenResult> {
    const result = verifyJWT(token, this.config.publicKey);

    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    const payload = result.payload as unknown as AccessTokenClaims;

    // Verify issuer
    if (payload.iss !== this.config.issuer) {
      return { valid: false, error: 'Invalid issuer' };
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    // Verify audience if specified
    if (expectedAudience && payload.aud !== expectedAudience) {
      return { valid: false, error: 'Invalid audience' };
    }

    return { valid: true, claims: payload };
  }

  extractTokenFromHeader(header: string | undefined): string | null {
    if (!header) {
      return null;
    }

    const parts = header.split(' ');
    if (parts.length !== 2) {
      return null;
    }

    if (parts[0].toLowerCase() !== 'bearer') {
      return null;
    }

    const token = parts[1];
    if (!token || token.trim() === '') {
      return null;
    }

    return token;
  }
}

/**
 * Create a Token Service instance
 */
export function createTokenService(config: TokenServiceConfig): TokenService {
  return new TokenServiceImpl(config);
}

/**
 * Generate RSA key pair for JWT signing
 * Requirement: RS256 signing
 */
export async function generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}
