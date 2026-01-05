/**
 * Persistent Session Store Tests
 * Requirements: 26 (Session Management)
 *
 * Comprehensive tests for the PersistentSessionStore implementation.
 */

import { PersistentSessionStore } from '../../../src/oauth/persistent-session-store.js';
import { EncryptionService } from '../../../src/oauth/encryption-service.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('PersistentSessionStore', () => {
  let store: PersistentSessionStore;
  let encryptionService: EncryptionService;
  let tempStoragePath: string;
  const sessionExpiryMs = 24 * 60 * 60 * 1000; // 24 hours

  beforeEach(async () => {
    // Create temporary storage path for each test
    tempStoragePath = join(tmpdir(), `test-sessions-${Date.now()}.enc`);

    // Initialize encryption service with test key
    encryptionService = new EncryptionService({
      encryptionKey: 'test-encryption-key-32-chars!!',
    });
    await encryptionService.initialize();

    // Create store with temp storage path
    store = new PersistentSessionStore(encryptionService, tempStoragePath);
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(tempStoragePath)) {
      try {
        unlinkSync(tempStoragePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Test Case 1: Session Creation/Load Cycle', () => {
    it('should save sessions and restore them after load', async () => {
      // Arrange: Create sessions
      const session1 = store.createSession('user-1');
      const session2 = store.createSession('user-2');

      // Act: Flush to save immediately (mutex serializes concurrent writes)
      await store.flush();

      // Create new store instance and load from storage
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Sessions should be restored
      const loadedSession1 = newStore.getSession(session1.sessionId);
      expect(loadedSession1).not.toBeNull();
      expect(loadedSession1?.userId).toBe('user-1');
      expect(loadedSession1?.sessionId).toBe(session1.sessionId);
      expect(loadedSession1?.createdAt).toBe(session1.createdAt);
      expect(loadedSession1?.expiresAt).toBe(session1.expiresAt);

      const loadedSession2 = newStore.getSession(session2.sessionId);
      expect(loadedSession2).not.toBeNull();
      expect(loadedSession2?.userId).toBe('user-2');
      expect(loadedSession2?.sessionId).toBe(session2.sessionId);
    });

    it('should handle empty storage gracefully', async () => {
      // Arrange: Load from non-existent file
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);

      // Act & Assert: Should not throw
      await expect(newStore.loadFromStorage()).resolves.not.toThrow();
    });

    it('should preserve session metadata after load', async () => {
      // Arrange: Mock saveToStorage temporarily
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn().mockResolvedValue(undefined);

      const originalSession = store.createSession('user-test');

      // Restore and flush
      (store as any).saveToStorage = originalSaveToStorage;

      // Act: Save and reload
      await store.flush();
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Metadata should be preserved
      const loadedSession = newStore.getSession(originalSession.sessionId);
      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.sessionId).toBe(originalSession.sessionId);
      expect(loadedSession?.userId).toBe(originalSession.userId);
      expect(loadedSession?.createdAt).toBe(originalSession.createdAt);
      expect(loadedSession?.expiresAt).toBe(originalSession.expiresAt);
    });

    it('should return null for non-existent session', async () => {
      // Arrange: Empty store
      // Act: Try to get non-existent session
      const session = store.getSession('non-existent-session-id');

      // Assert: Should return null
      expect(session).toBeNull();
    });
  });

  describe('Test Case 2: Expired Session Cleanup', () => {
    it('should filter expired sessions on load', async () => {
      // Arrange: Create store with short expiry (1 second) using custom instance
      const shortExpiryStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      (shortExpiryStore as any).sessionExpiryMs = 1000; // 1 second

      // Create sessions
      const expiredSession = shortExpiryStore.createSession('user-expired');
      await shortExpiryStore.flush();

      // Wait for session to expire (1.5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Act: Load from storage (should filter expired sessions)
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Expired session should be filtered out
      const loadedSession = newStore.getSession(expiredSession.sessionId);
      expect(loadedSession).toBeNull();
    });

    it('should load valid sessions while filtering expired ones', async () => {
      // Arrange: Use different temp paths to avoid file conflicts
      const tempPath1 = join(tmpdir(), `test-sessions-expired-${Date.now()}.enc`);
      const tempPath2 = join(tmpdir(), `test-sessions-final-${Date.now()}.enc`);

      try {
        // Create store with short expiry
        const shortExpiryStore = new PersistentSessionStore(encryptionService, tempPath1);
        (shortExpiryStore as any).sessionExpiryMs = 1000; // 1 second

        // Create expired session
        shortExpiryStore.createSession('user-expired');
        await shortExpiryStore.flush();

        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Create new store that will load expired session and add valid one
        const normalStore = new PersistentSessionStore(encryptionService, tempPath2);
        await normalStore.loadFromStorage(); // Empty load

        // Manually add expired session data and valid session
        const now = Date.now();
        const expiredSessionData = {
          sessionId: 'expired-session-id',
          userId: 'user-expired',
          createdAt: now - 5000,
          expiresAt: now - 1000, // Already expired
        };
        (normalStore as any).sessions.set(expiredSessionData.sessionId, expiredSessionData);

        const validSession = normalStore.createSession('user-valid');
        await normalStore.flush();

        // Act: Load from storage (should filter expired sessions)
        const newStore = new PersistentSessionStore(encryptionService, tempPath2);
        await newStore.loadFromStorage();

        // Assert: Valid session should be loaded, expired session should not
        const loadedExpired = newStore.getSession(expiredSessionData.sessionId);
        expect(loadedExpired).toBeNull();

        const loadedValid = newStore.getSession(validSession.sessionId);
        expect(loadedValid).not.toBeNull();
        expect(loadedValid?.userId).toBe('user-valid');
      } finally {
        // Clean up both temp files
        if (existsSync(tempPath1)) {
          try {
            unlinkSync(tempPath1);
          } catch {
            // Ignore
          }
        }
        if (existsSync(tempPath2)) {
          try {
            unlinkSync(tempPath2);
          } catch {
            // Ignore
          }
        }
      }
    });

    it('should load all sessions when none are expired', async () => {
      // Arrange: Mock saveToStorage temporarily
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn().mockResolvedValue(undefined);

      // Generate multiple sessions
      const sessions = [
        store.createSession('user-1'),
        store.createSession('user-2'),
        store.createSession('user-3'),
      ];

      // Restore and flush
      (store as any).saveToStorage = originalSaveToStorage;
      await store.flush();

      // Act: Load from storage
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: All sessions should be valid
      for (let i = 0; i < sessions.length; i++) {
        const loadedSession = newStore.getSession(sessions[i].sessionId);
        expect(loadedSession).not.toBeNull();
        expect(loadedSession?.userId).toBe(`user-${i + 1}`);
      }
    });
  });

  describe('Test Case 3: Session Limit Enforcement', () => {
    it('should enforce 100 session limit and keep most recent', async () => {
      jest.setTimeout(20000); // Increase timeout for this test
      // Arrange: Use a dedicated temp path for this test
      const limitTestPath = join(tmpdir(), `test-sessions-limit-${Date.now()}.enc`);
      const limitStore = new PersistentSessionStore(encryptionService, limitTestPath);

      try {
        // Mock saveToStorage to avoid race conditions during test
        const originalSaveToStorage = (limitStore as any).saveToStorage.bind(limitStore);
        let saveCallCount = 0;
        (limitStore as any).saveToStorage = jest.fn(async () => {
          saveCallCount++;
          // Only actually save on explicit flush
          if (saveCallCount > 150) {
            await originalSaveToStorage();
          }
        });

        const sessions: string[] = [];
        const maxSessions = 100;
        const totalSessions = 150;

        for (let i = 0; i < totalSessions; i++) {
          // Add small delay to ensure unique timestamps
          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 2));
          }
          const session = limitStore.createSession(`user-${i}`);
          sessions.push(session.sessionId);
        }

        // Restore original and flush
        (limitStore as any).saveToStorage = originalSaveToStorage;

        // Act: Flush to trigger session limit enforcement
        await limitStore.flush();

        // Load from storage to verify persisted sessions
        const newStore = new PersistentSessionStore(encryptionService, limitTestPath);
        await newStore.loadFromStorage();

        // Assert: Only most recent 100 sessions should be loaded
        // Count how many sessions were actually loaded
        let loadedCount = 0;
        const loadedIndices: number[] = [];
        for (let i = 0; i < totalSessions; i++) {
          const session = newStore.getSession(sessions[i]);
          if (session !== null) {
            loadedCount++;
            loadedIndices.push(i);
          }
        }

        // Exactly 100 sessions should be loaded
        expect(loadedCount).toBe(maxSessions);

        // The loaded sessions should be the most recent ones (higher indices)
        // Check that at least the last 50 sessions are present
        for (let i = totalSessions - 50; i < totalSessions; i++) {
          const session = newStore.getSession(sessions[i]);
          expect(session).not.toBeNull();
          expect(session?.userId).toBe(`user-${i}`);
        }
      } finally {
        // Clean up
        if (existsSync(limitTestPath)) {
          try {
            unlinkSync(limitTestPath);
          } catch {
            // Ignore
          }
        }
      }
    });

    it('should maintain session limit in memory after save', async () => {
      jest.setTimeout(20000); // Increase timeout for this test
      // Arrange: Use a dedicated temp path for this test
      const memLimitTestPath = join(tmpdir(), `test-sessions-mem-limit-${Date.now()}.enc`);
      const memLimitStore = new PersistentSessionStore(encryptionService, memLimitTestPath);

      try {
        // Mock saveToStorage to avoid race conditions during test
        const originalSaveToStorage = (memLimitStore as any).saveToStorage.bind(memLimitStore);
        let saveCallCount = 0;
        (memLimitStore as any).saveToStorage = jest.fn(async () => {
          saveCallCount++;
          // Only actually save on explicit flush
          if (saveCallCount > 150) {
            await originalSaveToStorage();
          }
        });

        const sessions: string[] = [];
        const maxSessions = 100;
        const totalSessions = 150;

        for (let i = 0; i < totalSessions; i++) {
          // Add small delay to ensure unique timestamps
          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 2));
          }
          const session = memLimitStore.createSession(`user-${i}`);
          sessions.push(session.sessionId);
        }

        // Restore original and flush
        (memLimitStore as any).saveToStorage = originalSaveToStorage;

        // Act: Flush to trigger session limit enforcement
        await memLimitStore.flush();

        // Assert: In-memory map should also be limited to 100 sessions
        // Count how many sessions are in memory
        let inMemoryCount = 0;
        for (let i = 0; i < totalSessions; i++) {
          const session = memLimitStore.getSession(sessions[i]);
          if (session !== null) {
            inMemoryCount++;
          }
        }

        // Exactly 100 sessions should be in memory
        expect(inMemoryCount).toBe(maxSessions);

        // The most recent 50 sessions should definitely be in memory
        for (let i = totalSessions - 50; i < totalSessions; i++) {
          const session = memLimitStore.getSession(sessions[i]);
          expect(session).not.toBeNull();
        }
      } finally {
        // Clean up
        if (existsSync(memLimitTestPath)) {
          try {
            unlinkSync(memLimitTestPath);
          } catch {
            // Ignore
          }
        }
      }
    });

    it('should handle session limit with less than 100 sessions', async () => {
      // Arrange: Mock saveToStorage temporarily
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn().mockResolvedValue(undefined);

      const sessions: string[] = [];
      for (let i = 0; i < 50; i++) {
        const session = store.createSession(`user-${i}`);
        sessions.push(session.sessionId);
      }

      // Restore and flush
      (store as any).saveToStorage = originalSaveToStorage;

      // Act: Flush
      await store.flush();

      // Load from storage
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: All 50 sessions should be loaded
      for (let i = 0; i < 50; i++) {
        const session = newStore.getSession(sessions[i]);
        expect(session).not.toBeNull();
        expect(session?.userId).toBe(`user-${i}`);
      }
    });
  });

  describe('Test Case 4: Session Expiry on Get', () => {
    it('should return null for expired session on get', async () => {
      // Arrange: Create store with short expiry
      const shortExpiryStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      (shortExpiryStore as any).sessionExpiryMs = 1000; // 1 second

      const session = shortExpiryStore.createSession('user-test');

      // Verify session exists before expiry
      const beforeExpiry = shortExpiryStore.getSession(session.sessionId);
      expect(beforeExpiry).not.toBeNull();

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Act: Get session after expiry
      const afterExpiry = shortExpiryStore.getSession(session.sessionId);

      // Assert: Should return null
      expect(afterExpiry).toBeNull();
    });

    it('should remove expired session from memory on get', async () => {
      // Arrange: Create store with short expiry
      const shortExpiryStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      (shortExpiryStore as any).sessionExpiryMs = 1000; // 1 second

      const session = shortExpiryStore.createSession('user-test');

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Act: Get session after expiry (should remove from memory)
      const firstGet = shortExpiryStore.getSession(session.sessionId);
      expect(firstGet).toBeNull();

      // Try to get again
      const secondGet = shortExpiryStore.getSession(session.sessionId);

      // Assert: Should still return null
      expect(secondGet).toBeNull();
    });

    it('should persist removal of expired session', async () => {
      // Arrange: Create store with short expiry
      const shortExpiryStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      (shortExpiryStore as any).sessionExpiryMs = 1000; // 1 second

      // Mock saveToStorage temporarily
      const originalSaveToStorage = (shortExpiryStore as any).saveToStorage.bind(shortExpiryStore);
      (shortExpiryStore as any).saveToStorage = jest.fn().mockResolvedValue(undefined);

      const session = shortExpiryStore.createSession('user-test');

      // Restore and flush
      (shortExpiryStore as any).saveToStorage = originalSaveToStorage;
      await shortExpiryStore.flush();

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Act: Get session after expiry (triggers removal)
      shortExpiryStore.getSession(session.sessionId);

      // Flush to persist removal (mutex serializes writes)
      await shortExpiryStore.flush();

      // Load from storage
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Expired session should not exist in storage
      const loadedSession = newStore.getSession(session.sessionId);
      expect(loadedSession).toBeNull();
    });

    it('should return valid session before expiry', async () => {
      // Arrange: Create session with normal expiry (24 hours)
      const session = store.createSession('user-test');

      // Act: Get session immediately
      const retrievedSession = store.getSession(session.sessionId);

      // Assert: Should return valid session
      expect(retrievedSession).not.toBeNull();
      expect(retrievedSession?.userId).toBe('user-test');
      expect(retrievedSession?.sessionId).toBe(session.sessionId);
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle session deletion', async () => {
      // Arrange: Create session
      const session = store.createSession('user-test');

      // Verify it exists
      expect(store.getSession(session.sessionId)).not.toBeNull();

      // Act: Delete session
      store.deleteSession(session.sessionId);

      // Assert: Should return null after deletion
      expect(store.getSession(session.sessionId)).toBeNull();
    });

    it('should persist session deletion', async () => {
      // Arrange: Create and delete session
      const session = store.createSession('user-test');
      store.deleteSession(session.sessionId);
      await store.flush();

      // Act: Load from storage
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Deleted session should not exist
      expect(newStore.getSession(session.sessionId)).toBeNull();
    });

    it('should handle multiple sessions for same user', async () => {
      // Arrange: Create multiple sessions for same user
      const session1 = store.createSession('user-test');
      const session2 = store.createSession('user-test');
      const session3 = store.createSession('user-test');

      // Act: Flush and reload (mutex serializes writes)
      await store.flush();
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: All sessions should be independent
      expect(newStore.getSession(session1.sessionId)).not.toBeNull();
      expect(newStore.getSession(session2.sessionId)).not.toBeNull();
      expect(newStore.getSession(session3.sessionId)).not.toBeNull();

      // Each session should have unique sessionId
      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session2.sessionId).not.toBe(session3.sessionId);
      expect(session1.sessionId).not.toBe(session3.sessionId);
    });

    it('should handle corrupted storage gracefully', async () => {
      // Arrange: Write corrupted data to storage
      await encryptionService.encryptToFile('invalid json data', tempStoragePath);

      // Act & Assert: Should not throw, just start fresh
      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await expect(newStore.loadFromStorage()).resolves.not.toThrow();
    });

    it('should handle save errors gracefully during createSession', async () => {
      // Arrange: Mock saveToStorage to throw error
      (store as any).saveToStorage = jest.fn().mockRejectedValue(new Error('Disk full'));

      // Act: Create session (will schedule save that fails)
      const session = store.createSession('user-test');

      // Wait for async save to fail
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: Session should still exist in memory even if save fails
      expect(store.getSession(session.sessionId)).not.toBeNull();
    });

    it('should handle save errors gracefully during deleteSession', async () => {
      // Arrange: Create session and mock saveToStorage
      const session = store.createSession('user-test');
      (store as any).saveToStorage = jest.fn().mockRejectedValue(new Error('Disk full'));

      // Act: Delete session (will schedule save that fails)
      store.deleteSession(session.sessionId);

      // Wait for async save to fail
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: Session should be deleted from memory even if save fails
      expect(store.getSession(session.sessionId)).toBeNull();
    });

    it('should generate unique session IDs', async () => {
      // Arrange & Act: Create multiple sessions
      const sessions = [
        store.createSession('user-1'),
        store.createSession('user-2'),
        store.createSession('user-3'),
        store.createSession('user-4'),
        store.createSession('user-5'),
      ];

      // Assert: All session IDs should be unique
      const sessionIds = sessions.map((s) => s.sessionId);
      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(sessions.length);
    });

    it('should set correct expiry time', async () => {
      // Arrange: Create session
      const beforeCreate = Date.now();
      const session = store.createSession('user-test');
      const afterCreate = Date.now();

      // Assert: Expiry should be ~24 hours from creation
      const expectedExpiry = session.createdAt + sessionExpiryMs;
      expect(session.expiresAt).toBe(expectedExpiry);

      // Creation time should be within test execution window
      expect(session.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(session.createdAt).toBeLessThanOrEqual(afterCreate);

      // Expiry should be 24 hours later
      const actualDuration = session.expiresAt - session.createdAt;
      expect(actualDuration).toBe(sessionExpiryMs);
    });

    it('should handle flush with no sessions', async () => {
      // Arrange: Empty store
      // Act: Flush empty store
      await expect(store.flush()).resolves.not.toThrow();

      // Assert: File should be created with empty sessions array
      expect(existsSync(tempStoragePath)).toBe(true);

      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Should have no sessions
      expect(newStore.getSession('any-id')).toBeNull();
    });

    it('should handle multiple flush calls', async () => {
      // Arrange: Create session
      store.createSession('user-test');

      // Act: Multiple flush calls (mutex serializes writes)
      await store.flush();
      await store.flush();
      await store.flush();

      // Assert: Should not throw and file should be valid
      expect(existsSync(tempStoragePath)).toBe(true);

      const newStore = new PersistentSessionStore(encryptionService, tempStoragePath);
      await expect(newStore.loadFromStorage()).resolves.not.toThrow();
    });
  });
});
