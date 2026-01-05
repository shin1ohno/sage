/**
 * Persistent Client Store Tests
 * Requirements: FR-2 (OAuth Token Persistence - Client Store)
 *
 * Tests for PersistentClientStore implementation including:
 * - Register/Load cycle
 * - Client deletion with persistence
 * - Redirect URI validation logic
 */

import { PersistentClientStore } from '../../../src/oauth/persistent-client-store.js';
import { EncryptionService } from '../../../src/oauth/encryption-service.js';
import { ClientStoreConfig } from '../../../src/oauth/client-store.js';
import { ClientRegistrationRequest, CLAUDE_CALLBACK_URLS } from '../../../src/oauth/types.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('PersistentClientStore', () => {
  let encryptionService: EncryptionService;
  let clientStore: PersistentClientStore;
  let tempStoragePath: string;
  let config: ClientStoreConfig;

  beforeEach(async () => {
    // Create temporary storage path for tests
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-test-'));
    tempStoragePath = path.join(tempDir, 'test_clients.enc');

    // Initialize encryption service
    const mockKey = 'test-encryption-key-32-chars!';
    encryptionService = new EncryptionService({ encryptionKey: mockKey });
    await encryptionService.initialize();

    // Default config allowing localhost and wildcard
    config = {
      allowedRedirectUris: ['*'],
    };

    // Create client store with temp storage
    clientStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      const tempDir = path.dirname(tempStoragePath);
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Register/Load Cycle', () => {
    it('should register client, save to file, load from file, and restore state', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'none',
      };

      // Act - Register client
      const registerResult = await clientStore.registerClient(request);

      // Assert - Registration successful
      expect(registerResult.success).toBe(true);
      expect(registerResult.client).toBeDefined();
      expect(registerResult.client?.client_name).toBe('Test Client');
      expect(registerResult.client?.redirect_uris).toEqual(['https://example.com/callback']);

      const clientId = registerResult.client!.client_id;

      // Verify file was created
      const fileStats = await fs.stat(tempStoragePath);
      expect(fileStats.isFile()).toBe(true);

      // Act - Create new store instance and load from storage
      const newStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert - Client was restored from storage
      const restoredClient = await newStore.getClient(clientId);
      expect(restoredClient).toBeDefined();
      expect(restoredClient?.client_name).toBe('Test Client');
      expect(restoredClient?.redirect_uris).toEqual(['https://example.com/callback']);
      expect(restoredClient?.client_id).toBe(clientId);
    });

    it('should handle loading from non-existent storage file', async () => {
      // Arrange
      const nonExistentPath = path.join(os.tmpdir(), 'nonexistent-clients.enc');

      // Act
      const newStore = new PersistentClientStore(config, encryptionService, nonExistentPath);
      await newStore.loadFromStorage(); // Should not throw

      // Assert - Store is empty
      const client = await newStore.getClient('fake-id');
      expect(client).toBeNull();
    });

    it('should preserve multiple clients across save/load cycles', async () => {
      // Arrange
      const request1: ClientRegistrationRequest = {
        client_name: 'Client 1',
        redirect_uris: ['https://app1.com/callback'],
      };
      const request2: ClientRegistrationRequest = {
        client_name: 'Client 2',
        redirect_uris: ['https://app2.com/callback'],
      };

      // Act - Register multiple clients
      const result1 = await clientStore.registerClient(request1);
      const result2 = await clientStore.registerClient(request2);

      const clientId1 = result1.client!.client_id;
      const clientId2 = result2.client!.client_id;

      // Act - Load from storage
      const newStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert - Both clients restored
      const restored1 = await newStore.getClient(clientId1);
      const restored2 = await newStore.getClient(clientId2);

      expect(restored1?.client_name).toBe('Client 1');
      expect(restored2?.client_name).toBe('Client 2');
    });
  });

  describe('Client Deletion', () => {
    it('should delete client and persist deletion to file', async () => {
      // Arrange - Register multiple clients
      const request1: ClientRegistrationRequest = {
        client_name: 'Client 1',
        redirect_uris: ['https://app1.com/callback'],
      };
      const request2: ClientRegistrationRequest = {
        client_name: 'Client 2',
        redirect_uris: ['https://app2.com/callback'],
      };

      const result1 = await clientStore.registerClient(request1);
      const result2 = await clientStore.registerClient(request2);

      const clientId1 = result1.client!.client_id;
      const clientId2 = result2.client!.client_id;

      // Act - Delete first client
      const deleteResult = await clientStore.deleteClient(clientId1);

      // Assert - Delete was successful
      expect(deleteResult).toBe(true);

      // Verify client is gone from memory
      const deletedClient = await clientStore.getClient(clientId1);
      expect(deletedClient).toBeNull();

      // Verify other client still exists
      const remainingClient = await clientStore.getClient(clientId2);
      expect(remainingClient).toBeDefined();

      // Act - Load from storage to verify persistence
      const newStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      // Assert - Deletion was persisted
      const restoredDeleted = await newStore.getClient(clientId1);
      expect(restoredDeleted).toBeNull();

      const restoredRemaining = await newStore.getClient(clientId2);
      expect(restoredRemaining).toBeDefined();
      expect(restoredRemaining?.client_name).toBe('Client 2');
    });

    it('should return false when deleting non-existent client', async () => {
      // Act
      const result = await clientStore.deleteClient('nonexistent-client-id');

      // Assert
      expect(result).toBe(false);
    });

    it('should handle deleting all clients', async () => {
      // Arrange - Register clients
      const request: ClientRegistrationRequest = {
        client_name: 'Solo Client',
        redirect_uris: ['https://example.com/callback'],
      };
      const result = await clientStore.registerClient(request);
      const clientId = result.client!.client_id;

      // Act - Delete the only client
      await clientStore.deleteClient(clientId);

      // Assert - Store is empty
      const newStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();

      const client = await newStore.getClient(clientId);
      expect(client).toBeNull();
    });
  });

  describe('Redirect URI Validation', () => {
    beforeEach(() => {
      // Restrict config for validation tests
      config = {
        allowedRedirectUris: ['https://allowed.com/callback'],
      };
      clientStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
    });

    it('should accept Claude official callback URLs (always allowed)', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Claude Client',
        redirect_uris: [CLAUDE_CALLBACK_URLS[0]], // Use first official URL
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.client).toBeDefined();
    });

    it('should accept localhost callbacks (CLI tool support)', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'CLI Tool',
        redirect_uris: ['http://localhost:3000/callback'],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.client).toBeDefined();
    });

    it('should accept 127.0.0.1 callbacks (localhost variant)', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Local App',
        redirect_uris: ['http://127.0.0.1:8080/callback'],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should accept URIs in allowed list', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Allowed App',
        redirect_uris: ['https://allowed.com/callback'],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject URIs not in allowed list', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Unauthorized App',
        redirect_uris: ['https://malicious.com/callback'],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_redirect_uri');
      expect(result.errorDescription).toContain('redirect_uri not allowed');
    });

    it('should require HTTPS for non-localhost URIs (with wildcard config)', async () => {
      // Arrange - Use wildcard config to test HTTPS validation
      const wildcardConfig: ClientStoreConfig = {
        allowedRedirectUris: ['*'],
      };
      const wildcardStore = new PersistentClientStore(wildcardConfig, encryptionService, tempStoragePath);

      const request: ClientRegistrationRequest = {
        client_name: 'Insecure App',
        redirect_uris: ['http://example.com/callback'], // HTTP not HTTPS
      };

      // Act
      const result = await wildcardStore.registerClient(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_redirect_uri');
      expect(result.errorDescription).toContain('must use HTTPS');
    });

    it('should reject invalid URI format (with wildcard config)', async () => {
      // Arrange - Use wildcard config to test format validation
      const wildcardConfig: ClientStoreConfig = {
        allowedRedirectUris: ['*'],
      };
      const wildcardStore = new PersistentClientStore(wildcardConfig, encryptionService, tempStoragePath);

      const request: ClientRegistrationRequest = {
        client_name: 'Bad Format App',
        redirect_uris: ['not-a-valid-uri'],
      };

      // Act
      const result = await wildcardStore.registerClient(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_redirect_uri');
      expect(result.errorDescription).toContain('Invalid redirect_uri format');
    });

    it('should reject empty redirect_uris', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'No URIs App',
        redirect_uris: [],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_redirect_uri');
      expect(result.errorDescription).toBe('redirect_uris is required');
    });

    it('should validate all URIs in array (reject if any invalid)', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Mixed URIs',
        redirect_uris: [
          'https://allowed.com/callback', // Valid
          'http://example.com/callback',  // Invalid (HTTP)
        ],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_redirect_uri');
    });
  });

  describe('isValidRedirectUri()', () => {
    it('should return true for exact match', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      };
      const result = await clientStore.registerClient(request);
      const clientId = result.client!.client_id;

      // Act
      const isValid = await clientStore.isValidRedirectUri(clientId, 'https://example.com/callback');

      // Assert
      expect(isValid).toBe(true);
    });

    it('should return false for non-matching URI', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      };
      const result = await clientStore.registerClient(request);
      const clientId = result.client!.client_id;

      // Act
      const isValid = await clientStore.isValidRedirectUri(clientId, 'https://other.com/callback');

      // Assert
      expect(isValid).toBe(false);
    });

    it('should support dynamic localhost ports (CLI tool pattern)', async () => {
      // Arrange - Register with any localhost URI
      const request: ClientRegistrationRequest = {
        client_name: 'CLI Tool',
        redirect_uris: ['http://localhost:3000/callback'],
      };
      const result = await clientStore.registerClient(request);
      const clientId = result.client!.client_id;

      // Act - Validate with different port
      const isValid = await clientStore.isValidRedirectUri(clientId, 'http://localhost:8080/callback');

      // Assert - Should be valid (dynamic port support)
      expect(isValid).toBe(true);
    });

    it('should return false for non-existent client', async () => {
      // Act
      const isValid = await clientStore.isValidRedirectUri('nonexistent-id', 'https://example.com/callback');

      // Assert
      expect(isValid).toBe(false);
    });

    it('should not allow non-localhost URI if only localhost registered', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Local Only',
        redirect_uris: ['http://localhost:3000/callback'],
      };
      const result = await clientStore.registerClient(request);
      const clientId = result.client!.client_id;

      // Act
      const isValid = await clientStore.isValidRedirectUri(clientId, 'https://example.com/callback');

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should reject registration with empty client_name', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: '',
        redirect_uris: ['https://example.com/callback'],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_client_metadata');
      expect(result.errorDescription).toBe('client_name is required');
    });

    it('should reject registration with whitespace-only client_name', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: '   ',
        redirect_uris: ['https://example.com/callback'],
      };

      // Act
      const result = await clientStore.registerClient(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_client_metadata');
    });

    it('should generate unique client IDs', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      };

      // Act
      const result1 = await clientStore.registerClient(request);
      const result2 = await clientStore.registerClient(request);

      // Assert
      expect(result1.client!.client_id).not.toBe(result2.client!.client_id);
    });

    it('should flush pending saves on demand', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      };
      const result = await clientStore.registerClient(request);
      const clientId = result.client!.client_id;

      // Act - Explicit flush
      await clientStore.flush();

      // Assert - Data persisted
      const newStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();
      const client = await newStore.getClient(clientId);
      expect(client).toBeDefined();
    });

    it('should handle wildcard allowed URIs', async () => {
      // Arrange
      const wildcardConfig: ClientStoreConfig = {
        allowedRedirectUris: ['*'],
      };
      const store = new PersistentClientStore(wildcardConfig, encryptionService, tempStoragePath);

      const request: ClientRegistrationRequest = {
        client_name: 'Wildcard App',
        redirect_uris: ['https://anything.com/callback'],
      };

      // Act
      const result = await store.registerClient(request);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should preserve client_id_issued_at timestamp', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      };

      // Act
      const result = await clientStore.registerClient(request);
      const originalTimestamp = result.client!.client_id_issued_at;

      // Load from storage
      const newStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage();
      const restored = await newStore.getClient(result.client!.client_id);

      // Assert
      expect(restored?.client_id_issued_at).toBe(originalTimestamp);
    });

    it('should handle corrupted storage file gracefully', async () => {
      // Arrange - Write corrupted data to storage file
      await fs.mkdir(path.dirname(tempStoragePath), { recursive: true });
      await fs.writeFile(tempStoragePath, 'corrupted-non-encrypted-data');

      // Act
      const newStore = new PersistentClientStore(config, encryptionService, tempStoragePath);
      await newStore.loadFromStorage(); // Should not throw

      // Assert - Store starts fresh
      const client = await newStore.getClient('any-id');
      expect(client).toBeNull();
    });
  });

  describe('getClient()', () => {
    it('should return null for non-existent client', async () => {
      // Act
      const client = await clientStore.getClient('nonexistent-id');

      // Assert
      expect(client).toBeNull();
    });

    it('should return client immediately after registration', async () => {
      // Arrange
      const request: ClientRegistrationRequest = {
        client_name: 'Test Client',
        redirect_uris: ['https://example.com/callback'],
      };
      const result = await clientStore.registerClient(request);
      const clientId = result.client!.client_id;

      // Act
      const client = await clientStore.getClient(clientId);

      // Assert
      expect(client).toBeDefined();
      expect(client?.client_id).toBe(clientId);
      expect(client?.client_name).toBe('Test Client');
    });
  });
});
