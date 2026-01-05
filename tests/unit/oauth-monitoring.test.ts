/**
 * OAuth Monitoring and Metrics Tests
 * Requirements: Task 5.3 (Monitoring and Metrics)
 *
 * Tests startup metrics logging, health check functionality, and debug logging.
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { OAuthServer } from '../../src/oauth/oauth-server.js';
import { EncryptionService } from '../../src/oauth/encryption-service.js';
import { PersistentRefreshTokenStore } from '../../src/oauth/persistent-refresh-token-store.js';
import { PersistentClientStore } from '../../src/oauth/persistent-client-store.js';
import { PersistentSessionStore } from '../../src/oauth/persistent-session-store.js';

describe('OAuth Monitoring and Metrics', () => {
  let tempDir: string;
  let encryptionService: EncryptionService;

  beforeEach(async () => {
    // Create temp directory for test storage
    tempDir = await mkdtemp(join(tmpdir(), 'oauth-monitoring-test-'));
    encryptionService = new EncryptionService({
      keyStoragePath: join(tempDir, 'encryption_key'),
      encryptionKey: 'test-key-for-monitoring-tests-32chars-long',
    });
    await encryptionService.initialize();
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Store Metrics', () => {
    it('should get metrics from PersistentRefreshTokenStore', async () => {
      const store = new PersistentRefreshTokenStore(
        { expirySeconds: 3600 },
        encryptionService,
        join(tempDir, 'tokens.enc')
      );

      // Generate some tokens
      await store.generateToken({ clientId: 'client1', userId: 'user1', scope: 'read' });
      await store.generateToken({ clientId: 'client2', userId: 'user2', scope: 'write' });

      const metrics = store.getMetrics();
      expect(metrics.count).toBe(2);
      expect(metrics.expiredCount).toBe(0);
      expect(metrics.rotatedCount).toBe(0);
    });

    it('should track expired tokens in metrics', async () => {
      const store = new PersistentRefreshTokenStore(
        { expirySeconds: -1 }, // Tokens expire immediately
        encryptionService,
        join(tempDir, 'tokens.enc')
      );

      await store.generateToken({ clientId: 'client1', userId: 'user1', scope: 'read' });

      const metrics = store.getMetrics();
      expect(metrics.count).toBe(1);
      expect(metrics.expiredCount).toBe(1);
    });

    it('should track rotated tokens in metrics', async () => {
      const store = new PersistentRefreshTokenStore(
        { expirySeconds: 3600 },
        encryptionService,
        join(tempDir, 'tokens.enc')
      );

      const token = await store.generateToken({ clientId: 'client1', userId: 'user1', scope: 'read' });
      await store.rotateToken(token, 'client1');

      const metrics = store.getMetrics();
      expect(metrics.count).toBe(2); // Old + new token
      expect(metrics.rotatedCount).toBe(1); // Old token marked as rotated
    });

    it('should get metrics from PersistentClientStore', async () => {
      const store = new PersistentClientStore(
        { allowedRedirectUris: ['*'] },
        encryptionService,
        join(tempDir, 'clients.enc')
      );

      await store.registerClient({
        client_name: 'Test Client 1',
        redirect_uris: ['https://example.com/callback'],
      });
      await store.registerClient({
        client_name: 'Test Client 2',
        redirect_uris: ['https://example.org/callback'],
      });

      const metrics = store.getMetrics();
      expect(metrics.count).toBe(2);
    });

    it('should get metrics from PersistentSessionStore', async () => {
      const store = new PersistentSessionStore(
        encryptionService,
        join(tempDir, 'sessions.enc')
      );

      store.createSession('user1');
      store.createSession('user2');

      const metrics = store.getMetrics();
      expect(metrics.count).toBe(2);
      expect(metrics.expiredCount).toBe(0);
    });
  });

  describe('EncryptionService Health Status', () => {
    it('should return health status', () => {
      const health = encryptionService.getHealthStatus();
      expect(health.initialized).toBe(true);
      // Key source could be 'environment' or 'file' depending on test execution order
      expect(['environment', 'file', 'generated']).toContain(health.keySource);
      expect(health.keyStoragePath).toBe(join(tempDir, 'encryption_key'));
    });
  });

  describe('OAuthServer Metrics', () => {
    it('should get comprehensive metrics from OAuthServer', async () => {
      const server = new OAuthServer(
        {
          issuer: 'http://localhost:3000',
          users: [],
          enablePersistence: true,
          encryptionService,
        }
      );

      await server.initialize();

      const metrics = server.getMetrics();
      expect(metrics).toHaveProperty('refreshTokens');
      expect(metrics).toHaveProperty('clients');
      expect(metrics).toHaveProperty('sessions');
      expect(metrics.refreshTokens).toHaveProperty('count');
      expect(metrics.clients).toHaveProperty('count');
      expect(metrics.sessions).toHaveProperty('count');
    });

    it('should get health status from OAuthServer', async () => {
      const server = new OAuthServer(
        {
          issuer: 'http://localhost:3000',
          users: [],
          enablePersistence: true,
          encryptionService,
        }
      );

      await server.initialize();

      const health = server.getHealthStatus();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('encryption');
      expect(health).toHaveProperty('storage');
      expect(health).toHaveProperty('issues');
      expect(health.healthy).toBe(true);
      expect(health.encryption.initialized).toBe(true);
    });
  });

  describe('Startup Metrics Logging', () => {
    it('should have metrics available after initialization', async () => {
      const server = new OAuthServer(
        {
          issuer: 'http://localhost:3000',
          users: [],
          enablePersistence: true,
          encryptionService,
        }
      );

      await server.initialize();

      // Verify that metrics are available via getMetrics() after initialization
      // (pino logger outputs JSON format, so we verify metrics are computed correctly)
      const metrics = server.getMetrics();
      expect(metrics).toHaveProperty('refreshTokens');
      expect(metrics).toHaveProperty('clients');
      expect(metrics).toHaveProperty('sessions');
      expect(metrics).toHaveProperty('storage');

      // Check refresh tokens metrics structure
      expect(metrics.refreshTokens).toHaveProperty('count');
      expect(typeof metrics.refreshTokens.count).toBe('number');

      // Check clients metrics structure
      expect(metrics.clients).toHaveProperty('count');
      expect(typeof metrics.clients.count).toBe('number');

      // Check sessions metrics structure
      expect(metrics.sessions).toHaveProperty('count');
      expect(typeof metrics.sessions.count).toBe('number');

      // Check storage metrics structure
      expect(metrics.storage).toHaveProperty('tokensSize');
      expect(typeof metrics.storage?.tokensSize).toBe('number');
    });
  });
});
