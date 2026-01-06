/**
 * PKCE Implementation Tests
 * Tests for OAuth PKCE (Proof Key for Code Exchange) functions
 */

import {
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
  isValidCodeVerifier,
  isValidCodeChallenge,
} from '../../../src/oauth/pkce.js';

describe('PKCE Implementation', () => {
  describe('generateCodeVerifier', () => {
    it('should generate verifier with default length', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBe(64);
    });

    it('should generate verifier with custom length', () => {
      const verifier = generateCodeVerifier(80);
      expect(verifier.length).toBe(80);
    });

    it('should clamp length to minimum (43) when below', () => {
      const verifier = generateCodeVerifier(10);
      expect(verifier.length).toBe(43);
    });

    it('should clamp length to maximum (128) when above', () => {
      const verifier = generateCodeVerifier(200);
      expect(verifier.length).toBe(128);
    });

    it('should only use unreserved characters', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('should generate unique verifiers', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate base64url encoded challenge', () => {
      const verifier = 'test-verifier-string-that-is-long-enough-for-the-test';
      const challenge = generateCodeChallenge(verifier);
      // Should be base64url format (no +, /, or = padding)
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('should generate 43 character challenge for S256', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      expect(challenge.length).toBe(43);
    });

    it('should generate consistent challenge for same verifier', () => {
      const verifier = 'consistent-test-verifier-for-challenge-generation';
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', () => {
      const challenge1 = generateCodeChallenge('verifier-one-test-string');
      const challenge2 = generateCodeChallenge('verifier-two-test-string');
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('verifyCodeChallenge', () => {
    it('should verify valid code verifier against challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      const result = verifyCodeChallenge(verifier, challenge, 'S256');
      expect(result).toBe(true);
    });

    it('should reject invalid verifier', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      const result = verifyCodeChallenge('wrong-verifier', challenge, 'S256');
      expect(result).toBe(false);
    });

    it('should throw error for unsupported method', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      expect(() => {
        verifyCodeChallenge(verifier, challenge, 'plain' as any);
      }).toThrow('Only S256 code challenge method is supported');
    });
  });

  describe('isValidCodeVerifier', () => {
    it('should return true for valid verifier', () => {
      const verifier = generateCodeVerifier();
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidCodeVerifier('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isValidCodeVerifier(null as any)).toBe(false);
      expect(isValidCodeVerifier(undefined as any)).toBe(false);
    });

    it('should return false for too short verifier (< 43)', () => {
      const shortVerifier = 'a'.repeat(42);
      expect(isValidCodeVerifier(shortVerifier)).toBe(false);
    });

    it('should return true for minimum length verifier (43)', () => {
      const minVerifier = 'a'.repeat(43);
      expect(isValidCodeVerifier(minVerifier)).toBe(true);
    });

    it('should return false for too long verifier (> 128)', () => {
      const longVerifier = 'a'.repeat(129);
      expect(isValidCodeVerifier(longVerifier)).toBe(false);
    });

    it('should return true for maximum length verifier (128)', () => {
      const maxVerifier = 'a'.repeat(128);
      expect(isValidCodeVerifier(maxVerifier)).toBe(true);
    });

    it('should return false for verifier with invalid characters', () => {
      const invalidVerifier = 'a'.repeat(43) + '@#$%';
      expect(isValidCodeVerifier(invalidVerifier)).toBe(false);
    });

    it('should accept all valid unreserved characters', () => {
      const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
      // Create a verifier using only valid characters (length 43)
      const verifier = validChars.substring(0, 43);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });
  });

  describe('isValidCodeChallenge', () => {
    it('should return true for valid challenge', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      expect(isValidCodeChallenge(challenge)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidCodeChallenge('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isValidCodeChallenge(null as any)).toBe(false);
      expect(isValidCodeChallenge(undefined as any)).toBe(false);
    });

    it('should return false for wrong length (not 43)', () => {
      expect(isValidCodeChallenge('a'.repeat(42))).toBe(false);
      expect(isValidCodeChallenge('a'.repeat(44))).toBe(false);
    });

    it('should return true for correct length (43)', () => {
      // Valid base64url characters, exactly 43 chars
      // ABCDEFGHIJKLMNOPQRSTUVWXYZ = 26, abcdefghijklmnopq = 17 = 43 total
      const validChallenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
      expect(validChallenge.length).toBe(43);
      expect(isValidCodeChallenge(validChallenge)).toBe(true);
    });

    it('should return false for invalid base64url characters', () => {
      // 43 chars but contains invalid characters (+, /, =)
      // ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm = 39, +/== = 4 = 43 total
      const invalidChallenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm+/==';
      expect(invalidChallenge.length).toBe(43);
      expect(isValidCodeChallenge(invalidChallenge)).toBe(false);
    });

    it('should accept valid base64url characters (A-Z, a-z, 0-9, -, _)', () => {
      // Contains - and _ which are valid base64url characters
      const validChallenge = 'ABCDEFGHIJ-KLMNOPQRSTUVWXYZ_abcdefghijk1234';
      expect(validChallenge.length).toBe(43);
      expect(isValidCodeChallenge(validChallenge)).toBe(true);
    });
  });
});
