/**
 * OAuth PKCE (S256) Implementation
 * Requirements: 21.2, 26.4
 *
 * Implements PKCE (Proof Key for Code Exchange) using S256 method.
 * Based on RFC 7636.
 */

import { createHash, randomBytes } from 'crypto';
import { CodeChallengeMethod } from './types.js';

/**
 * Characters allowed in code verifier (unreserved characters per RFC 7636)
 */
const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Default code verifier length
 */
const DEFAULT_VERIFIER_LENGTH = 64;

/**
 * Minimum and maximum verifier length per RFC 7636
 */
const MIN_VERIFIER_LENGTH = 43;
const MAX_VERIFIER_LENGTH = 128;

/**
 * Generate a cryptographically random code verifier
 *
 * @param length - Length of the verifier (default: 64, min: 43, max: 128)
 * @returns A random code verifier string
 */
export function generateCodeVerifier(length: number = DEFAULT_VERIFIER_LENGTH): string {
  // Clamp length to valid range
  const validLength = Math.max(MIN_VERIFIER_LENGTH, Math.min(MAX_VERIFIER_LENGTH, length));

  const bytes = randomBytes(validLength);
  let verifier = '';

  for (let i = 0; i < validLength; i++) {
    verifier += UNRESERVED_CHARS[bytes[i] % UNRESERVED_CHARS.length];
  }

  return verifier;
}

/**
 * Generate a code challenge from a code verifier using S256 method
 *
 * S256: BASE64URL(SHA256(code_verifier))
 *
 * @param codeVerifier - The code verifier to hash
 * @returns Base64URL encoded SHA256 hash of the verifier
 */
export function generateCodeChallenge(codeVerifier: string): string {
  // Calculate SHA256 hash
  const hash = createHash('sha256').update(codeVerifier, 'ascii').digest();

  // Convert to base64url encoding (no padding)
  const base64 = hash.toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return base64url;
}

/**
 * Verify a code verifier against a code challenge
 *
 * @param codeVerifier - The code verifier from the token request
 * @param codeChallenge - The code challenge from the authorization request
 * @param method - The code challenge method (only 'S256' is supported)
 * @returns True if the verifier matches the challenge
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: CodeChallengeMethod
): boolean {
  if (method !== 'S256') {
    throw new Error('Only S256 code challenge method is supported');
  }

  // Generate challenge from verifier and compare
  const expectedChallenge = generateCodeChallenge(codeVerifier);
  return expectedChallenge === codeChallenge;
}

/**
 * Validate code verifier format
 *
 * @param codeVerifier - The code verifier to validate
 * @returns True if the verifier has valid format
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  if (!codeVerifier) {
    return false;
  }

  // Check length
  if (codeVerifier.length < MIN_VERIFIER_LENGTH || codeVerifier.length > MAX_VERIFIER_LENGTH) {
    return false;
  }

  // Check characters (unreserved characters only)
  const validPattern = /^[A-Za-z0-9\-._~]+$/;
  return validPattern.test(codeVerifier);
}

/**
 * Validate code challenge format
 *
 * @param codeChallenge - The code challenge to validate
 * @returns True if the challenge has valid format
 */
export function isValidCodeChallenge(codeChallenge: string): boolean {
  if (!codeChallenge) {
    return false;
  }

  // S256 challenge should be base64url encoded SHA256 hash (43 characters)
  if (codeChallenge.length !== 43) {
    return false;
  }

  // Check base64url format (no padding)
  const validPattern = /^[A-Za-z0-9\-_]+$/;
  return validPattern.test(codeChallenge);
}
