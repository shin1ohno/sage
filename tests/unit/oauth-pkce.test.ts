/**
 * OAuth PKCE (S256) Tests
 * Requirements: 21.2, 26.4
 *
 * Tests for PKCE implementation using S256 method.
 */

import {
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
} from '../../src/oauth/pkce.js';

describe('OAuth PKCE (S256)', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a code verifier with valid length', () => {
      const verifier = generateCodeVerifier();
      // RFC 7636: code_verifier must be between 43 and 128 characters
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('should generate a code verifier with valid characters', () => {
      const verifier = generateCodeVerifier();
      // RFC 7636: code_verifier uses unreserved characters [A-Za-z0-9-._~]
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it('should generate unique verifiers each time', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });

    it('should generate verifier with specified length', () => {
      const verifier = generateCodeVerifier(64);
      expect(verifier.length).toBe(64);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate a valid S256 code challenge', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = generateCodeChallenge(verifier);

      // The challenge should be base64url encoded without padding
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
      expect(challenge).not.toContain('=');
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
    });

    it('should generate the correct challenge for known verifier', () => {
      // Test vector from RFC 7636 Appendix B
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = generateCodeChallenge(verifier);

      // Expected: BASE64URL(SHA256(verifier))
      // SHA256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') base64url encoded
      expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });

    it('should generate consistent challenges for the same verifier', () => {
      const verifier = generateCodeVerifier();
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge1 = generateCodeChallenge(verifier1);
      const challenge2 = generateCodeChallenge(verifier2);
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('verifyCodeChallenge', () => {
    it('should return true for valid verifier-challenge pair', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      expect(verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
    });

    it('should return false for invalid verifier', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      const wrongVerifier = generateCodeVerifier();

      expect(verifyCodeChallenge(wrongVerifier, challenge, 'S256')).toBe(false);
    });

    it('should return false for invalid challenge', () => {
      const verifier = generateCodeVerifier();
      const wrongChallenge = 'invalid_challenge_value_here';

      expect(verifyCodeChallenge(verifier, wrongChallenge, 'S256')).toBe(false);
    });

    it('should verify RFC 7636 test vector correctly', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      expect(verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
    });

    it('should throw error for plain method (not supported)', () => {
      const verifier = 'test_verifier';
      const challenge = 'test_challenge';

      expect(() => {
        verifyCodeChallenge(verifier, challenge, 'plain' as any);
      }).toThrow('Only S256 code challenge method is supported');
    });
  });

  describe('integration', () => {
    it('should complete full PKCE flow', () => {
      // Client generates verifier
      const codeVerifier = generateCodeVerifier();

      // Client generates challenge from verifier
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Server stores challenge during authorization
      // Server verifies verifier during token exchange
      const isValid = verifyCodeChallenge(codeVerifier, codeChallenge, 'S256');

      expect(isValid).toBe(true);
    });

    it('should reject tampered verifier', () => {
      const originalVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(originalVerifier);

      // Attacker tries to use different verifier
      const tamperedVerifier = originalVerifier.slice(0, -1) + 'X';
      const isValid = verifyCodeChallenge(tamperedVerifier, codeChallenge, 'S256');

      expect(isValid).toBe(false);
    });
  });
});
