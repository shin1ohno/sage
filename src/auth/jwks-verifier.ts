/**
 * JWKS-based JWT Verifier
 *
 * Verifies JWT access tokens using public keys fetched from a JWKS endpoint.
 * Designed for use with Ory Hydra as the OAuth authorization server.
 */

import { createPublicKey, createVerify, KeyObject, JsonWebKey } from 'crypto';
import { cliLogger } from '../utils/logger.js';

interface JWKWithMetadata extends JsonWebKey {
  kid?: string;
  use?: string;
}

interface JWKS {
  keys: JWKWithMetadata[];
}

interface JWTHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

interface JWTPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;
  scope?: string;
  client_id?: string;
  [key: string]: unknown;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
  payload?: JWTPayload;
}

export interface JWKSVerifierOptions {
  /** JWKS endpoint URL */
  jwksUrl: string;
  /** Expected issuer (optional) */
  issuer?: string;
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes) */
  cacheTTL?: number;
}

/**
 * JWKS-based JWT verifier with key caching
 */
export class JWKSVerifier {
  private jwksUrl: string;
  private issuer?: string;
  private cacheTTL: number;
  private cachedKeys: Map<string, KeyObject> = new Map();
  private lastFetchTime: number = 0;
  private fetchPromise: Promise<void> | null = null;

  constructor(options: JWKSVerifierOptions) {
    this.jwksUrl = options.jwksUrl;
    this.issuer = options.issuer;
    this.cacheTTL = options.cacheTTL ?? 300000;
  }

  /**
   * Verify a JWT access token
   */
  async verify(token: string): Promise<VerifyResult> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid JWT format' };
      }

      const header = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString()
      ) as JWTHeader;
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString()
      ) as JWTPayload;

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token expired' };
      }

      // Check not-before
      if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token not yet valid' };
      }

      // Check issuer
      if (this.issuer && payload.iss !== this.issuer) {
        return { valid: false, error: `Invalid issuer: ${payload.iss}` };
      }

      // Get the signing key
      let key = await this.getKey(header.kid);
      if (!key) {
        // Force refresh and retry (key rotation)
        await this.fetchJWKS(true);
        key = await this.getKey(header.kid);
      }

      if (!key) {
        return { valid: false, error: 'No matching key found in JWKS' };
      }

      // Verify signature
      const signatureInput = `${parts[0]}.${parts[1]}`;
      const signature = Buffer.from(parts[2], 'base64url');

      const algorithm = this.getNodeAlgorithm(header.alg);
      if (!algorithm) {
        return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
      }

      const verifier = createVerify(algorithm);
      verifier.update(signatureInput);
      const isValid = verifier.verify(key, signature);

      if (!isValid) {
        return { valid: false, error: 'Invalid signature' };
      }

      return { valid: true, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      cliLogger.error({ err: error }, 'JWT verification failed');
      return { valid: false, error: message };
    }
  }

  private async getKey(kid?: string): Promise<KeyObject | null> {
    await this.ensureKeysLoaded();

    if (kid) {
      return this.cachedKeys.get(kid) ?? null;
    }

    // If no kid, return the first signing key
    for (const key of this.cachedKeys.values()) {
      return key;
    }
    return null;
  }

  private async ensureKeysLoaded(): Promise<void> {
    const now = Date.now();
    if (this.cachedKeys.size > 0 && now - this.lastFetchTime < this.cacheTTL) {
      return;
    }
    await this.fetchJWKS(false);
  }

  private async fetchJWKS(force: boolean): Promise<void> {
    if (!force && this.fetchPromise) {
      await this.fetchPromise;
      return;
    }

    this.fetchPromise = (async () => {
      try {
        const response = await fetch(this.jwksUrl);
        if (!response.ok) {
          throw new Error(`JWKS fetch failed: ${response.status}`);
        }

        const jwks = (await response.json()) as JWKS;
        const newKeys = new Map<string, KeyObject>();

        for (const jwk of jwks.keys) {
          if (jwk.use && jwk.use !== 'sig') continue;

          try {
            const key = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
            const kid = jwk.kid ?? 'default';
            newKeys.set(kid, key);
          } catch (e) {
            cliLogger.warn({ kid: jwk.kid, err: e }, 'Failed to import JWK');
          }
        }

        this.cachedKeys = newKeys;
        this.lastFetchTime = Date.now();

        cliLogger.info(
          { keyCount: newKeys.size },
          'JWKS refreshed'
        );
      } catch (error) {
        cliLogger.error({ err: error }, 'Failed to fetch JWKS');
        throw error;
      } finally {
        this.fetchPromise = null;
      }
    })();

    await this.fetchPromise;
  }

  private getNodeAlgorithm(alg: string): string | null {
    const mapping: Record<string, string> = {
      RS256: 'RSA-SHA256',
      RS384: 'RSA-SHA384',
      RS512: 'RSA-SHA512',
      ES256: 'SHA256',
      ES384: 'SHA384',
      ES512: 'SHA512',
    };
    return mapping[alg] ?? null;
  }
}
