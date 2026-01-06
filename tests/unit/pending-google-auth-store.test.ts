/**
 * Tests for PendingGoogleAuthStore
 * Requirements: FR-3 (Pending Auth Session Management)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the encryption service
jest.mock('../../src/oauth/encryption-service.js', () => ({
  EncryptionService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockImplementation(() => Promise.resolve()),
    encryptToFile: jest.fn().mockImplementation(() => Promise.resolve()),
    decryptFromFile: jest.fn().mockImplementation(() => Promise.resolve(null)),
  })),
}));

// Mock the logger
jest.mock('../../src/utils/logger.js', () => ({
  oauthLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { PendingGoogleAuthStore } from '../../src/oauth/pending-google-auth-store.js';

describe('PendingGoogleAuthStore', () => {
  let store: PendingGoogleAuthStore;

  beforeEach(async () => {
    store = new PendingGoogleAuthStore();
    await store.initialize();
  });

  afterEach(async () => {
    await store.shutdown();
  });

  describe('create()', () => {
    it('should create a pending auth session with state, codeVerifier, and codeChallenge', () => {
      const result = store.create('https://example.com/oauth/google/callback');

      expect(result.state).toBeDefined();
      expect(result.state).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(result.codeVerifier).toBeDefined();
      expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(result.codeChallenge).toBeDefined();
      expect(result.codeChallenge.length).toBe(43); // SHA-256 base64url is always 43 chars
    });

    it('should create unique states for each session', () => {
      const result1 = store.create('https://example.com/oauth/google/callback');
      const result2 = store.create('https://example.com/oauth/google/callback');

      expect(result1.state).not.toBe(result2.state);
      expect(result1.codeVerifier).not.toBe(result2.codeVerifier);
    });
  });

  describe('findByState()', () => {
    it('should find a session by state', () => {
      const redirectUri = 'https://example.com/oauth/google/callback';
      const created = store.create(redirectUri);

      const found = store.findByState(created.state);

      expect(found).not.toBeNull();
      expect(found!.state).toBe(created.state);
      expect(found!.codeVerifier).toBe(created.codeVerifier);
      expect(found!.redirectUri).toBe(redirectUri);
    });

    it('should return null for unknown state', () => {
      const found = store.findByState('nonexistent-state');
      expect(found).toBeNull();
    });

    it('should return null for expired session', async () => {
      // Create a store with very short timeout for testing
      const shortTimeoutStore = new PendingGoogleAuthStore();
      // Override timeout to 1ms
      (shortTimeoutStore as any).sessionTimeoutMs = 1;
      await shortTimeoutStore.initialize();

      const created = shortTimeoutStore.create('https://example.com/callback');

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      const found = shortTimeoutStore.findByState(created.state);
      expect(found).toBeNull();

      await shortTimeoutStore.shutdown();
    });
  });

  describe('remove()', () => {
    it('should remove a session by state', () => {
      const created = store.create('https://example.com/callback');

      // Verify it exists
      expect(store.findByState(created.state)).not.toBeNull();

      // Remove it
      store.remove(created.state);

      // Verify it's gone
      expect(store.findByState(created.state)).toBeNull();
    });

    it('should not throw when removing nonexistent state', () => {
      expect(() => store.remove('nonexistent-state')).not.toThrow();
    });
  });

  describe('cleanupExpired()', () => {
    it('should remove only expired sessions', async () => {
      // Create a store with very short timeout
      const shortTimeoutStore = new PendingGoogleAuthStore();
      (shortTimeoutStore as any).sessionTimeoutMs = 50;
      await shortTimeoutStore.initialize();

      // Create two sessions
      const session1 = shortTimeoutStore.create('https://example.com/callback1');
      const session2 = shortTimeoutStore.create('https://example.com/callback2');

      // Verify both exist
      expect(shortTimeoutStore.findByState(session1.state)).not.toBeNull();
      expect(shortTimeoutStore.findByState(session2.state)).not.toBeNull();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup
      shortTimeoutStore.cleanupExpired();

      // Both should be gone
      expect(shortTimeoutStore.findByState(session1.state)).toBeNull();
      expect(shortTimeoutStore.findByState(session2.state)).toBeNull();

      await shortTimeoutStore.shutdown();
    });
  });

  describe('getSessionTimeoutSeconds()', () => {
    it('should return default timeout of 600 seconds', () => {
      expect(store.getSessionTimeoutSeconds()).toBe(600);
    });
  });

  describe('getSessionCount()', () => {
    it('should return correct session count', () => {
      expect(store.getSessionCount()).toBe(0);

      const session1 = store.create('https://example.com/callback1');
      expect(store.getSessionCount()).toBe(1);

      store.create('https://example.com/callback2');
      expect(store.getSessionCount()).toBe(2);

      store.remove(session1.state);
      expect(store.getSessionCount()).toBe(1);
    });
  });
});
