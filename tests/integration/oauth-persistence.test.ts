/**
 * OAuth Persistence Integration Tests
 * Requirements: FR-2 (OAuth Token Persistence)
 *
 * End-to-end tests verifying that OAuth data persists across server restarts.
 * Tests all three persistent stores: RefreshTokenStore, ClientStore, and SessionStore.
 */

import { OAuthServer, createOAuthServer } from '../../src/oauth/oauth-server.js';
import { EncryptionService } from '../../src/oauth/encryption-service.js';
import { generateCodeVerifier, generateCodeChallenge } from '../../src/oauth/pkce.js';
import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync, rmSync } from 'fs';

describe('OAuth Persistence - End-to-End Integration', () => {
  let tempDir: string;
  let encryptionService: EncryptionService;
  const issuer = 'https://sage-test.example.com';
  const testUser = {
    id: 'test-user-123',
    username: 'testuser',
    passwordHash: createHash('sha256').update('testpass123').digest('hex'),
    createdAt: Date.now(),
  };

  beforeEach(async () => {
    // Create unique temporary directory for each test
    tempDir = join(tmpdir(), `sage-oauth-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Initialize encryption service with temp key storage
    const keyPath = join(tempDir, 'oauth_encryption_key');
    encryptionService = new EncryptionService({
      encryptionKey: 'test-encryption-key-for-e2e!!',
      keyStoragePath: keyPath,
    });
    await encryptionService.initialize();
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.error('Failed to clean up temp directory:', error);
      }
    }
  });

  /**
   * Helper function to create OAuthServer with test configuration
   */
  async function createTestServer(): Promise<OAuthServer> {
    const server = await createOAuthServer({
      issuer,
      accessTokenExpiry: '1h',
      refreshTokenExpiry: '30d',
      authorizationCodeExpiry: '10m',
      allowedRedirectUris: ['https://test.example.com/callback'],
      users: [testUser],
      enablePersistence: true,
      encryptionService,
      storageBasePath: tempDir, // Use temp directory for test isolation
    });

    return server;
  }

  /**
   * Helper function to perform complete OAuth flow
   */
  async function performOAuthFlow(server: OAuthServer, clientId: string) {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Complete authorization
    const authCode = await server.completeAuthorization(
      {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://test.example.com/callback',
        scope: 'mcp:read mcp:write',
        state: 'test-state-123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
      testUser.id
    );

    // Exchange code for tokens
    const tokenResult = await server.exchangeAuthorizationCode(
      authCode,
      clientId,
      'https://test.example.com/callback',
      codeVerifier
    );

    if (!tokenResult.success || !tokenResult.tokens) {
      throw new Error('Failed to get tokens');
    }

    return {
      accessToken: tokenResult.tokens.access_token,
      refreshToken: tokenResult.tokens.refresh_token!,
      codeVerifier,
    };
  }

  describe('Test Scenario 1: Refresh Token Persistence', () => {
    it('should persist refresh tokens across server restart', async () => {
      // Arrange: Create server and register client
      const server1 = await createTestServer();

      const clientResult = await server1.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['https://test.example.com/callback'],
      });
      expect(clientResult.success).toBe(true);
      const clientId = clientResult.client!.client_id;

      // Act: Perform OAuth flow to get refresh token
      const { refreshToken } = await performOAuthFlow(server1, clientId);

      // Verify token works before restart
      const tokenResult1 = await server1.exchangeRefreshToken(refreshToken, clientId);
      expect(tokenResult1.success).toBe(true);
      const newRefreshToken = tokenResult1.tokens!.refresh_token!;

      // Shutdown server and flush data
      await server1.shutdown();

      // Simulate server restart
      const server2 = await createTestServer();

      // Assert: New refresh token should still work
      const tokenResult2 = await server2.exchangeRefreshToken(newRefreshToken, clientId);
      expect(tokenResult2.success).toBe(true);
      expect(tokenResult2.tokens?.access_token).toBeDefined();
      expect(tokenResult2.tokens?.refresh_token).toBeDefined();

      // Verify we can use the newly rotated token
      const tokenResult3 = await server2.exchangeRefreshToken(
        tokenResult2.tokens!.refresh_token!,
        clientId
      );
      expect(tokenResult3.success).toBe(true);

      await server2.shutdown();
    });

    it('should reject old refresh token after rotation and restart', async () => {
      // Arrange: Create server and get initial refresh token
      const server1 = await createTestServer();

      const clientResult = await server1.registerClient({
        client_name: 'Test Client 2',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const clientId = clientResult.client!.client_id;

      const { refreshToken: oldToken } = await performOAuthFlow(server1, clientId);

      // Rotate token
      const rotateResult = await server1.exchangeRefreshToken(oldToken, clientId);
      expect(rotateResult.success).toBe(true);
      const newToken = rotateResult.tokens!.refresh_token!;

      // Shutdown and restart
      await server1.shutdown();
      const server2 = await createTestServer();

      // Assert: Old token should be rejected
      const oldTokenResult = await server2.exchangeRefreshToken(oldToken, clientId);
      expect(oldTokenResult.success).toBe(false);
      expect(oldTokenResult.error?.error).toBe('invalid_grant');

      // New token should still work
      const newTokenResult = await server2.exchangeRefreshToken(newToken, clientId);
      expect(newTokenResult.success).toBe(true);

      await server2.shutdown();
    });

    it('should filter expired tokens on server startup', async () => {
      // Arrange: Create server with short-lived tokens
      const server1 = await createOAuthServer({
        issuer,
        accessTokenExpiry: '1h',
        refreshTokenExpiry: '1s', // Very short expiry
        authorizationCodeExpiry: '10m',
        allowedRedirectUris: ['https://test.example.com/callback'],
        users: [testUser],
        enablePersistence: true,
        encryptionService,
        storageBasePath: tempDir,
      });

      const clientResult = await server1.registerClient({
        client_name: 'Short-lived Token Client',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const clientId = clientResult.client!.client_id;

      const { refreshToken } = await performOAuthFlow(server1, clientId);

      // Flush data
      await server1.shutdown();

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Act: Restart server (should filter expired token)
      const server2 = await createTestServer();

      // Assert: Expired token should be rejected
      const tokenResult = await server2.exchangeRefreshToken(refreshToken, clientId);
      expect(tokenResult.success).toBe(false);
      expect(tokenResult.error?.error).toBe('invalid_grant');

      await server2.shutdown();
    });
  });

  describe('Test Scenario 2: Client Registration Persistence', () => {
    it('should persist client registration across server restart', async () => {
      // Arrange: Create server and register client
      const server1 = await createTestServer();

      const clientResult = await server1.registerClient({
        client_name: 'Persistent Test Client',
        redirect_uris: ['https://test.example.com/callback'],
      });
      expect(clientResult.success).toBe(true);
      const clientId = clientResult.client!.client_id;
      const clientName = clientResult.client!.client_name;

      // Shutdown server
      await server1.shutdown();

      // Act: Restart server
      const server2 = await createTestServer();

      // Assert: Client should still exist with same metadata
      const retrievedClient = await server2.getClient(clientId);
      expect(retrievedClient).not.toBeNull();
      expect(retrievedClient!.client_id).toBe(clientId);
      expect(retrievedClient!.client_name).toBe(clientName);
      expect(retrievedClient!.redirect_uris).toEqual(['https://test.example.com/callback']);

      await server2.shutdown();
    });

    it('should allow authentication with persisted client after restart', async () => {
      // Arrange: Create server, register client, and perform OAuth flow
      const server1 = await createTestServer();

      const clientResult = await server1.registerClient({
        client_name: 'Auth Test Client',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const clientId = clientResult.client!.client_id;

      // Shutdown server
      await server1.shutdown();

      // Act: Restart server and perform OAuth flow
      const server2 = await createTestServer();

      // Assert: Should be able to complete full OAuth flow
      const { accessToken, refreshToken } = await performOAuthFlow(server2, clientId);

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();

      // Verify access token
      const verifyResult = await server2.verifyAccessToken(accessToken);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.claims?.client_id).toBe(clientId);

      await server2.shutdown();
    });

    it('should handle client deletion and persist changes', async () => {
      // Arrange: Create server and register two clients
      const server1 = await createTestServer();

      const client1Result = await server1.registerClient({
        client_name: 'Client to Delete',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const client1Id = client1Result.client!.client_id;

      const client2Result = await server1.registerClient({
        client_name: 'Client to Keep',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const client2Id = client2Result.client!.client_id;

      // Delete first client
      const deleted = await server1.deleteClient(client1Id);
      expect(deleted).toBe(true);

      // Shutdown server
      await server1.shutdown();

      // Act: Restart server
      const server2 = await createTestServer();

      // Assert: Deleted client should not exist
      const deletedClient = await server2.getClient(client1Id);
      expect(deletedClient).toBeNull();

      // Kept client should still exist
      const keptClient = await server2.getClient(client2Id);
      expect(keptClient).not.toBeNull();
      expect(keptClient!.client_id).toBe(client2Id);

      await server2.shutdown();
    });
  });

  describe('Test Scenario 3: Session Persistence', () => {
    it('should persist user sessions across server restart', async () => {
      // Arrange: Create server and authenticate user
      const server1 = await createTestServer();

      const authResult = await server1.authenticateUser(testUser.username, 'testpass123');
      expect(authResult.success).toBe(true);
      const sessionId = authResult.session!.sessionId;
      const userId = authResult.session!.userId;

      // Verify session works before restart
      const session1 = server1.validateSession(sessionId);
      expect(session1).not.toBeNull();
      expect(session1!.userId).toBe(userId);

      // Wait for async save to complete before shutdown
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Shutdown server
      await server1.shutdown();

      // Act: Restart server
      const server2 = await createTestServer();

      // Assert: Session should still be valid
      const session2 = server2.validateSession(sessionId);
      expect(session2).not.toBeNull();
      expect(session2!.sessionId).toBe(sessionId);
      expect(session2!.userId).toBe(userId);

      await server2.shutdown();
    });

    it('should filter expired sessions on server startup', async () => {
      // Arrange: Create server with short session expiry
      // Note: Session expiry is hardcoded to 24h in PersistentSessionStore
      // For this test, we'll manually create an expired session by mocking time
      const server1 = await createTestServer();

      const authResult = await server1.authenticateUser(testUser.username, 'testpass123');
      expect(authResult.success).toBe(true);
      const sessionId = authResult.session!.sessionId;

      // Get the session store and modify the session to be expired
      const sessionStore = (server1 as any).sessionStore;
      const session = sessionStore.sessions.get(sessionId);
      if (session) {
        // Set expiry to past
        session.expiresAt = Date.now() - 1000;
      }

      // Wait for async save to complete before shutdown
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Flush with expired session
      await server1.shutdown();

      // Act: Restart server (should filter expired session)
      const server2 = await createTestServer();

      // Assert: Expired session should be filtered out
      const session2 = server2.validateSession(sessionId);
      expect(session2).toBeNull();

      await server2.shutdown();
    }, 10000); // Increase timeout to 10 seconds

    it('should handle logout and persist changes', async () => {
      // Arrange: Create server and authenticate user
      const server1 = await createTestServer();

      const authResult = await server1.authenticateUser(testUser.username, 'testpass123');
      const sessionId = authResult.session!.sessionId;

      // Verify session exists
      expect(server1.validateSession(sessionId)).not.toBeNull();

      // Logout
      server1.logout(sessionId);

      // Verify session is deleted
      expect(server1.validateSession(sessionId)).toBeNull();

      // Wait a bit for async save to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Shutdown server
      await server1.shutdown();

      // Act: Restart server
      const server2 = await createTestServer();

      // Assert: Logged out session should not exist
      const session2 = server2.validateSession(sessionId);
      expect(session2).toBeNull();

      await server2.shutdown();
    });
  });

  describe('Test Scenario 4: Corrupted File Handling', () => {
    it('should handle corrupted refresh token storage gracefully', async () => {
      // Arrange: Create server and generate some data
      const server1 = await createTestServer();

      const clientResult = await server1.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const clientId = clientResult.client!.client_id;

      await performOAuthFlow(server1, clientId);
      await server1.shutdown();

      // Corrupt the refresh token file
      const tokenFilePath = join(tempDir, 'oauth_refresh_tokens.enc');
      if (existsSync(tokenFilePath)) {
        await encryptionService.encryptToFile('corrupted json data!!!', tokenFilePath);
      }

      // Act & Assert: Server should start without throwing
      const server2 = await createTestServer();
      expect(server2).toBeDefined();

      // Client should still exist (not in corrupted file)
      const client = await server2.getClient(clientId);
      expect(client).not.toBeNull();

      await server2.shutdown();
    });

    it('should handle corrupted client storage gracefully', async () => {
      // Arrange: Create server and register client
      const server1 = await createTestServer();

      await server1.registerClient({
        client_name: 'Test Client',
        redirect_uris: ['https://test.example.com/callback'],
      });

      await server1.shutdown();

      // Corrupt the client file
      const clientFilePath = join(tempDir, 'oauth_clients.enc');
      if (existsSync(clientFilePath)) {
        await encryptionService.encryptToFile('{"invalid": json}}', clientFilePath);
      }

      // Act & Assert: Server should start without throwing
      const server2 = await createTestServer();
      expect(server2).toBeDefined();

      // Can register new clients after corruption
      const newClientResult = await server2.registerClient({
        client_name: 'New Client',
        redirect_uris: ['https://test.example.com/callback'],
      });
      expect(newClientResult.success).toBe(true);

      await server2.shutdown();
    });

    it('should handle corrupted session storage gracefully', async () => {
      // Arrange: Create server and create session
      const server1 = await createTestServer();

      await server1.authenticateUser(testUser.username, 'testpass123');
      await server1.shutdown();

      // Corrupt the session file
      const sessionFilePath = join(tempDir, 'oauth_sessions.enc');
      if (existsSync(sessionFilePath)) {
        await encryptionService.encryptToFile('not valid json at all', sessionFilePath);
      }

      // Act & Assert: Server should start without throwing
      const server2 = await createTestServer();
      expect(server2).toBeDefined();

      // Can create new sessions after corruption
      const authResult = await server2.authenticateUser(testUser.username, 'testpass123');
      expect(authResult.success).toBe(true);

      // Wait for async save to complete before shutdown
      await new Promise((resolve) => setTimeout(resolve, 100));

      await server2.shutdown();
    });

    it('should handle missing storage files gracefully', async () => {
      // Arrange: Create empty temp directory (no storage files)
      // Act: Create server
      const server = await createTestServer();

      // Assert: Server should initialize successfully
      expect(server).toBeDefined();

      // Should be able to perform all operations
      const clientResult = await server.registerClient({
        client_name: 'First Client',
        redirect_uris: ['https://test.example.com/callback'],
      });
      expect(clientResult.success).toBe(true);

      const authResult = await server.authenticateUser(testUser.username, 'testpass123');
      expect(authResult.success).toBe(true);

      await server.shutdown();
    });
  });

  describe('Edge Case: Multiple Operations with Restart', () => {
    it('should handle complex workflow across multiple restarts', async () => {
      // Arrange: Create server
      const server1 = await createTestServer();

      // Register multiple clients
      const client1Result = await server1.registerClient({
        client_name: 'Client 1',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const client1Id = client1Result.client!.client_id;

      const client2Result = await server1.registerClient({
        client_name: 'Client 2',
        redirect_uris: ['https://test.example.com/callback'],
      });
      const client2Id = client2Result.client!.client_id;

      // Perform OAuth flows for both clients
      const { refreshToken: token1 } = await performOAuthFlow(server1, client1Id);
      const { refreshToken: token2 } = await performOAuthFlow(server1, client2Id);

      // Create user session
      const authResult = await server1.authenticateUser(testUser.username, 'testpass123');
      const sessionId = authResult.session!.sessionId;

      // Wait for async save to complete before shutdown
      await new Promise((resolve) => setTimeout(resolve, 100));

      await server1.shutdown();

      // Act: Restart 1
      const server2 = await createTestServer();

      // Rotate token for client 1
      const rotateResult = await server2.exchangeRefreshToken(token1, client1Id);
      const newToken1 = rotateResult.tokens!.refresh_token!;

      // Delete client 2
      await server2.deleteClient(client2Id);

      await server2.shutdown();

      // Act: Restart 2
      const server3 = await createTestServer();

      // Assert: New token 1 should work
      const token1Result = await server3.exchangeRefreshToken(newToken1, client1Id);
      expect(token1Result.success).toBe(true);

      // Client 2 should be deleted
      const client2 = await server3.getClient(client2Id);
      expect(client2).toBeNull();

      // Token 2 should not work (client deleted)
      const token2Result = await server3.exchangeRefreshToken(token2, client2Id);
      expect(token2Result.success).toBe(false);

      // Session should still exist
      const session = server3.validateSession(sessionId);
      expect(session).not.toBeNull();

      await server3.shutdown();
    });
  });
});
