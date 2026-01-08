/**
 * Persistent Refresh Token Store Tests
 * Requirements: 21.6, 26.3, 26.8
 *
 * Comprehensive tests for the PersistentRefreshTokenStore implementation.
 */

import { PersistentRefreshTokenStore } from '../../../src/oauth/persistent-refresh-token-store.js';
import { EncryptionService } from '../../../src/oauth/encryption-service.js';
import { RefreshTokenStoreConfig } from '../../../src/oauth/refresh-token-store.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Extend timeout for all tests (CI environment is slower)
jest.setTimeout(30000);

describe('PersistentRefreshTokenStore', () => {
  let store: PersistentRefreshTokenStore;
  let encryptionService: EncryptionService;
  let tempStoragePath: string;
  const config: RefreshTokenStoreConfig = {
    expirySeconds: 2592000, // 30 days
  };

  beforeEach(async () => {
    // Create temporary storage path for each test
    tempStoragePath = join(tmpdir(), `test-refresh-tokens-${Date.now()}.enc`);

    // Initialize encryption service with test key
    encryptionService = new EncryptionService({
      encryptionKey: 'test-encryption-key-32-chars!!',
    });
    await encryptionService.initialize();

    // Create store with temp storage path
    store = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
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

  describe('Test Case 1: Save/Load Cycle', () => {
    it('should save tokens and restore them after load', async () => {
      // Arrange: Generate tokens
      const token1 = await store.generateToken({
        clientId: 'client-1',
        userId: 'user-1',
        scope: 'mcp:read mcp:write',
      });

      const token2 = await store.generateToken({
        clientId: 'client-2',
        userId: 'user-2',
        scope: 'mcp:admin',
      });

      // Act: Flush to save immediately
      await store.flush();

      // Create new store instance and load from storage
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Tokens should be restored
      const validation1 = await newStore.validateToken(token1, 'client-1');
      expect(validation1.valid).toBe(true);
      expect(validation1.tokenData?.user_id).toBe('user-1');
      expect(validation1.tokenData?.scope).toBe('mcp:read mcp:write');

      const validation2 = await newStore.validateToken(token2, 'client-2');
      expect(validation2.valid).toBe(true);
      expect(validation2.tokenData?.user_id).toBe('user-2');
      expect(validation2.tokenData?.scope).toBe('mcp:admin');
    });

    it('should handle empty storage gracefully', async () => {
      // Arrange: Load from non-existent file
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);

      // Act & Assert: Should not throw
      await expect(newStore.loadFromStorage()).resolves.not.toThrow();
    });

    it('should preserve token metadata after load', async () => {
      // Arrange: Generate token with specific metadata
      const token = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Get original token data
      const originalValidation = await store.validateToken(token, 'client-test');
      expect(originalValidation.valid).toBe(true);
      const originalData = originalValidation.tokenData!;

      // Act: Save and reload
      await store.flush();
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Metadata should be preserved
      const newValidation = await newStore.validateToken(token, 'client-test');
      expect(newValidation.valid).toBe(true);
      const newData = newValidation.tokenData!;

      expect(newData.token).toBe(originalData.token);
      expect(newData.client_id).toBe(originalData.client_id);
      expect(newData.user_id).toBe(originalData.user_id);
      expect(newData.scope).toBe(originalData.scope);
      expect(newData.created_at).toBe(originalData.created_at);
      expect(newData.expires_at).toBe(originalData.expires_at);
      expect(newData.rotated).toBe(originalData.rotated);
    });
  });

  describe('Test Case 2: Expired Token Cleanup', () => {
    it('should filter expired tokens on load', async () => {
      // Arrange: Create store with short expiry (1 second)
      const shortExpiryConfig: RefreshTokenStoreConfig = {
        expirySeconds: 1,
      };
      const shortStore = new PersistentRefreshTokenStore(
        shortExpiryConfig,
        encryptionService,
        tempStoragePath
      );

      // Generate token that will expire
      const expiredToken = await shortStore.generateToken({
        clientId: 'client-expired',
        userId: 'user-expired',
        scope: 'mcp:write',
      });

      // Save tokens
      await shortStore.flush();

      // Wait for token to expire (1.2 seconds: 1s expiry + 200ms buffer)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Act: Load from storage (should filter expired tokens)
      const newStore = new PersistentRefreshTokenStore(
        config,
        encryptionService,
        tempStoragePath
      );
      await newStore.loadFromStorage();

      // Assert: Expired token should be filtered out
      const expiredValidation = await newStore.validateToken(expiredToken, 'client-expired');
      expect(expiredValidation.valid).toBe(false);
    });

    it('should load all tokens when none are expired', async () => {
      // Arrange: Generate multiple tokens
      const tokens = await Promise.all([
        store.generateToken({ clientId: 'client-1', userId: 'user-1', scope: 'mcp:read' }),
        store.generateToken({ clientId: 'client-2', userId: 'user-2', scope: 'mcp:write' }),
        store.generateToken({ clientId: 'client-3', userId: 'user-3', scope: 'mcp:admin' }),
      ]);

      await store.flush();

      // Act: Load from storage
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: All tokens should be valid
      for (let i = 0; i < tokens.length; i++) {
        const validation = await newStore.validateToken(tokens[i], `client-${i + 1}`);
        expect(validation.valid).toBe(true);
      }
    });
  });

  describe('Test Case 3: Write Debouncing', () => {
    it('should debounce multiple token generations', async () => {
      // Arrange: Mock saveToStorage to count calls
      let saveCallCount = 0;
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn(async () => {
        saveCallCount++;
        await originalSaveToStorage();
      });

      // Act: Generate multiple tokens rapidly
      await Promise.all([
        store.generateToken({ clientId: 'client-1', userId: 'user-1', scope: 'mcp:read' }),
        store.generateToken({ clientId: 'client-2', userId: 'user-2', scope: 'mcp:write' }),
        store.generateToken({ clientId: 'client-3', userId: 'user-3', scope: 'mcp:admin' }),
      ]);

      // Wait for debounce timer (1 second + buffer)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Assert: Should only save once after debounce
      expect(saveCallCount).toBe(1);
    });

    it('should not write immediately after token generation', async () => {
      // Arrange: Mock saveToStorage
      let saveCalled = false;
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn(async () => {
        saveCalled = true;
        await originalSaveToStorage();
      });

      // Act: Generate token
      await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Assert: Should not have saved yet (debounced)
      expect(saveCalled).toBe(false);
    });
  });

  describe('Test Case 4: Flush Operation', () => {
    it('should save immediately when flush is called', async () => {
      // Arrange: Generate tokens
      const token1 = await store.generateToken({
        clientId: 'client-1',
        userId: 'user-1',
        scope: 'mcp:read',
      });

      // Act: Flush immediately (no waiting for debounce)
      await store.flush();

      // Assert: File should exist and contain token
      expect(existsSync(tempStoragePath)).toBe(true);

      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      const validation = await newStore.validateToken(token1, 'client-1');
      expect(validation.valid).toBe(true);
    });

    it('should clear debounce timer on flush', async () => {
      // Arrange: Mock saveToStorage to count calls
      let saveCallCount = 0;
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn(async () => {
        saveCallCount++;
        await originalSaveToStorage();
      });

      // Act: Generate token (schedules debounced save)
      await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Flush immediately (should clear timer and save once)
      await store.flush();

      // Wait for original debounce period
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Assert: Should only have saved once (from flush)
      expect(saveCallCount).toBe(1);
    });

    it('should handle multiple flush calls', async () => {
      // Arrange: Generate token
      await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Act: Multiple flush calls
      await store.flush();
      await store.flush();
      await store.flush();

      // Assert: Should not throw and file should be valid
      expect(existsSync(tempStoragePath)).toBe(true);

      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await expect(newStore.loadFromStorage()).resolves.not.toThrow();
    });
  });

  describe('Test Case 5: Token Rotation', () => {
    it('should persist rotated token state', async () => {
      // Arrange: Generate and rotate token
      const oldToken = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      const newToken = await store.rotateToken(oldToken, 'client-test');
      expect(newToken).not.toBeNull();

      // Act: Save and reload
      await store.flush();
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert: Old token should be marked as rotated (invalid)
      const oldValidation = await newStore.validateToken(oldToken, 'client-test');
      expect(oldValidation.valid).toBe(false);
      expect(oldValidation.error).toBe('invalid_grant');

      // New token should be valid
      const newValidation = await newStore.validateToken(newToken!, 'client-test');
      expect(newValidation.valid).toBe(true);
    });

    it('should preserve both tokens after rotation', async () => {
      // Arrange: Generate and rotate token
      const oldToken = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      const newToken = await store.rotateToken(oldToken, 'client-test');
      expect(newToken).not.toBeNull();

      // Act: Save and reload
      await store.flush();

      // Assert: Both tokens should exist in storage
      const data = await encryptionService.decryptFromFile(tempStoragePath);
      expect(data).not.toBeNull();

      const storage = JSON.parse(data!);
      expect(storage.tokens).toHaveLength(2); // Both old and new tokens

      // Find rotated token
      const rotatedToken = storage.tokens.find((t: any) => t.token === oldToken);
      expect(rotatedToken).toBeDefined();
      expect(rotatedToken.rotated).toBe(true);

      // Find new token
      const activeToken = storage.tokens.find((t: any) => t.token === newToken);
      expect(activeToken).toBeDefined();
      expect(activeToken.rotated).toBe(false);
    });

    it('should schedule save after rotation', async () => {
      // Arrange: Mock saveToStorage
      let saveCalled = false;
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn(async () => {
        saveCalled = true;
        await originalSaveToStorage();
      });

      const oldToken = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Reset save flag after initial generation
      saveCalled = false;

      // Act: Rotate token
      await store.rotateToken(oldToken, 'client-test');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Assert: Should have saved after rotation
      expect(saveCalled).toBe(true);
    });
  });

  describe('Test Case 6: Cleanup Method', () => {
    it('should remove expired tokens and persist changes', async () => {
      // Arrange: Create store with short expiry
      const shortExpiryConfig: RefreshTokenStoreConfig = {
        expirySeconds: 1,
      };
      const shortStore = new PersistentRefreshTokenStore(
        shortExpiryConfig,
        encryptionService,
        tempStoragePath
      );

      // Generate tokens
      const token1 = await shortStore.generateToken({
        clientId: 'client-1',
        userId: 'user-1',
        scope: 'mcp:read',
      });

      // Wait for expiry (1.2 seconds: 1s expiry + 200ms buffer)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Generate valid token
      const token2 = await shortStore.generateToken({
        clientId: 'client-2',
        userId: 'user-2',
        scope: 'mcp:write',
      });

      // Act: Cleanup expired tokens
      const cleanedCount = await shortStore.cleanup();
      await shortStore.flush();

      // Assert: Should have cleaned up 1 expired token
      expect(cleanedCount).toBe(1);

      // Load and verify
      const newStore = new PersistentRefreshTokenStore(
        config,
        encryptionService,
        tempStoragePath
      );
      await newStore.loadFromStorage();

      const validation1 = await newStore.validateToken(token1, 'client-1');
      expect(validation1.valid).toBe(false);

      const validation2 = await newStore.validateToken(token2, 'client-2');
      expect(validation2.valid).toBe(true);
    });

    it('should remove rotated tokens and persist changes', async () => {
      // Arrange: Generate and rotate token
      const oldToken = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      const newToken = await store.rotateToken(oldToken, 'client-test');
      expect(newToken).not.toBeNull();

      // Act: Cleanup rotated tokens
      const cleanedCount = await store.cleanup();
      await store.flush();

      // Assert: Should have cleaned up 1 rotated token
      expect(cleanedCount).toBe(1);

      // Load and verify
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Old token should not exist anymore
      const oldValidation = await newStore.validateToken(oldToken, 'client-test');
      expect(oldValidation.valid).toBe(false);

      // New token should still be valid
      const newValidation = await newStore.validateToken(newToken!, 'client-test');
      expect(newValidation.valid).toBe(true);
    });

    it('should return 0 when no tokens need cleanup', async () => {
      // Arrange: Generate valid tokens
      await store.generateToken({
        clientId: 'client-1',
        userId: 'user-1',
        scope: 'mcp:read',
      });

      // Act: Cleanup
      const cleanedCount = await store.cleanup();

      // Assert: No tokens should be cleaned up
      expect(cleanedCount).toBe(0);
    });

    it('should schedule save only when tokens are cleaned up', async () => {
      // Arrange: Mock saveToStorage
      let saveCallCount = 0;
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn(async () => {
        saveCallCount++;
        await originalSaveToStorage();
      });

      // Generate valid token
      await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Reset counter after initial save
      await new Promise((resolve) => setTimeout(resolve, 1200));
      saveCallCount = 0;

      // Act: Cleanup (no tokens to clean)
      await store.cleanup();

      // Wait to see if save is called
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Assert: Should not have saved (no changes)
      expect(saveCallCount).toBe(0);
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle validation with wrong client_id', async () => {
      // Arrange: Generate token for client-1
      const token = await store.generateToken({
        clientId: 'client-1',
        userId: 'user-1',
        scope: 'mcp:read',
      });

      // Act: Validate with wrong client_id
      const validation = await store.validateToken(token, 'wrong-client');

      // Assert: Should be invalid
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('invalid_grant');
    });

    it('should handle token expiry during validation', async () => {
      // Arrange: Create store with very short expiry
      const shortExpiryConfig: RefreshTokenStoreConfig = {
        expirySeconds: 1,
      };
      const shortStore = new PersistentRefreshTokenStore(
        shortExpiryConfig,
        encryptionService,
        tempStoragePath
      );

      const token = await shortStore.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Wait for expiry (1.2 seconds: 1s expiry + 200ms buffer)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Act: Validate expired token
      const validation = await shortStore.validateToken(token, 'client-test');

      // Assert: Should be invalid and scheduled for save
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('invalid_grant');
    });

    it('should handle save errors gracefully', async () => {
      // Arrange: Mock saveToStorage to throw error
      const originalSaveToStorage = (store as any).saveToStorage.bind(store);
      (store as any).saveToStorage = jest.fn().mockRejectedValue(new Error('Disk full'));

      // Act: Generate token (will schedule save that fails)
      await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Wait for debounce timer to trigger failed save
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Assert: Should not throw (errors are logged but not thrown)
      // No assertion needed - test passes if no error is thrown

      // Restore original implementation
      (store as any).saveToStorage = originalSaveToStorage;
    });

    it('should handle rotation failure for invalid token', async () => {
      // Arrange: Non-existent token
      const invalidToken = 'invalid-token-that-does-not-exist';

      // Act: Try to rotate invalid token
      const newToken = await store.rotateToken(invalidToken, 'client-test');

      // Assert: Should return null
      expect(newToken).toBeNull();
    });

    it('should handle revoke operation and persist changes', async () => {
      // Arrange: Generate token
      const token = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-test',
        scope: 'mcp:read',
      });

      // Act: Revoke token
      await store.revokeToken(token);
      await store.flush();

      // Assert: Token should not exist after reload
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      const validation = await newStore.validateToken(token, 'client-test');
      expect(validation.valid).toBe(false);
    });

    it('should handle revokeAllForClient and persist changes', async () => {
      // Arrange: Generate multiple tokens for same client
      const token1 = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-1',
        scope: 'mcp:read',
      });

      const token2 = await store.generateToken({
        clientId: 'client-test',
        userId: 'user-2',
        scope: 'mcp:write',
      });

      const token3 = await store.generateToken({
        clientId: 'other-client',
        userId: 'user-3',
        scope: 'mcp:admin',
      });

      // Act: Revoke all tokens for client-test
      await store.revokeAllForClient('client-test');
      await store.flush();

      // Assert: client-test tokens should be gone, other-client token should remain
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      const validation1 = await newStore.validateToken(token1, 'client-test');
      expect(validation1.valid).toBe(false);

      const validation2 = await newStore.validateToken(token2, 'client-test');
      expect(validation2.valid).toBe(false);

      const validation3 = await newStore.validateToken(token3, 'other-client');
      expect(validation3.valid).toBe(true);
    });

    it('should handle corrupted storage gracefully', async () => {
      // Arrange: Write corrupted data to storage
      await encryptionService.encryptToFile('invalid json data', tempStoragePath);

      // Act & Assert: Should not throw, just start fresh
      const newStore = new PersistentRefreshTokenStore(config, encryptionService, tempStoragePath);
      await expect(newStore.loadFromStorage()).resolves.not.toThrow();
    });
  });
});
