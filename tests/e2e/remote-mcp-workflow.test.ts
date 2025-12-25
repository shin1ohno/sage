/**
 * Remote MCP E2E Tests
 * Requirements: 12.1-12.8
 * Tests for complete Remote MCP server workflows
 */

import {
  RemoteMCPServer,
  SessionManager,
  AuthConfig,
  MCPOverHTTPHandler,
} from '../../src/remote/remote-mcp-server.js';
import { HybridIntegrationManager } from '../../src/remote/hybrid-integration.js';
import { CloudConfigManager } from '../../src/remote/cloud-config.js';

// Mock http module
jest.mock('http', () => ({
  createServer: jest.fn().mockReturnValue({
    listen: jest.fn((_port: number, _host: string, callback: () => void) => callback()),
    close: jest.fn((callback: () => void) => callback()),
    on: jest.fn(),
  }),
}));

describe('Remote MCP E2E Workflows', () => {
  describe('Complete Server Lifecycle', () => {
    let server: RemoteMCPServer;

    beforeEach(() => {
      server = new RemoteMCPServer({
        port: 3000,
        host: 'localhost',
        auth: { enabled: false },
      });
    });

    afterEach(async () => {
      if (server.isRunning()) {
        await server.stop();
      }
    });

    it('should complete full server lifecycle', async () => {
      // Start
      await server.start();
      expect(server.isRunning()).toBe(true);

      // Health check
      const health = await server.healthCheck();
      expect(health.status).toBe('ok');
      expect(health.uptime).toBeGreaterThanOrEqual(0);

      // Stop
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should handle multiple clients via sessions', async () => {
      await server.start();

      const sessionManager = server.getSessionManager();

      // Simulate multiple clients
      const session1 = sessionManager.createSession('client-1');
      const session2 = sessionManager.createSession('client-2');
      const session3 = sessionManager.createSession('client-3');

      expect(sessionManager.isValidSession(session1.id)).toBe(true);
      expect(sessionManager.isValidSession(session2.id)).toBe(true);
      expect(sessionManager.isValidSession(session3.id)).toBe(true);
      expect(server.getActiveSessionCount()).toBe(3);

      // Client 1 disconnects
      sessionManager.terminateSession(session1.id);
      expect(server.getActiveSessionCount()).toBe(2);
    });
  });

  describe('Authentication Flow', () => {
    it('should complete JWT token authentication flow', async () => {
      const auth = new AuthConfig({
        enabled: true,
        jwtSecret: 'test-secret-key-for-jwt',
        tokenExpiry: 3600000,
      });

      // Generate token
      const token = auth.generateToken('user-123');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Validate token
      expect(auth.validateToken(token)).toBe(true);

      // Reject invalid token
      expect(auth.validateToken('invalid-token')).toBe(false);
    });

    it('should complete API key authentication flow', async () => {
      const auth = new AuthConfig({
        enabled: true,
        apiKeys: ['valid-key-1', 'valid-key-2'],
      });

      // Valid keys
      expect(auth.validateApiKey('valid-key-1')).toBe(true);
      expect(auth.validateApiKey('valid-key-2')).toBe(true);

      // Invalid key
      expect(auth.validateApiKey('invalid-key')).toBe(false);
    });

    it('should complete IP whitelist flow', async () => {
      const auth = new AuthConfig({
        enabled: true,
        ipWhitelist: ['127.0.0.1', '192.168.1.0/24'],
      });

      // Allowed IPs
      expect(auth.isIPAllowed('127.0.0.1')).toBe(true);
      expect(auth.isIPAllowed('192.168.1.50')).toBe(true);

      // Blocked IPs
      expect(auth.isIPAllowed('10.0.0.1')).toBe(false);
    });

    it('should extract token from Authorization header', () => {
      const auth = new AuthConfig({
        enabled: true,
        jwtSecret: 'test-secret',
      });

      // Bearer token
      expect(auth.extractToken('Bearer my-token-123')).toBe('my-token-123');

      // No header
      expect(auth.extractToken(undefined)).toBeNull();

      // Wrong format
      expect(auth.extractToken('Basic abc123')).toBeNull();
    });
  });

  describe('MCP Request/Response Handling', () => {
    let handler: MCPOverHTTPHandler;

    beforeEach(() => {
      handler = new MCPOverHTTPHandler({
        allowedOrigins: ['https://claude.ai', 'https://anthropic.com'],
      });
    });

    it('should handle complete request/response cycle', () => {
      // Parse request
      const requestBody = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'analyze_tasks',
          arguments: {
            input: '緊急: レポート作成',
          },
        },
      });

      const request = handler.parseRequest(requestBody);
      expect(request.method).toBe('tools/call');
      expect(request.params?.name).toBe('analyze_tasks');

      // Build response
      const response = handler.buildResponse(request.id, {
        success: true,
        tasks: [{ title: 'レポート作成', priority: 'P0' }],
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
    });

    it('should handle error responses', () => {
      const errorResponse = handler.buildErrorResponse(
        1,
        -32600,
        'Invalid request',
        { details: 'Missing required parameter' }
      );

      expect(errorResponse.error?.code).toBe(-32600);
      expect(errorResponse.error?.message).toBe('Invalid request');
      expect(errorResponse.error?.data).toBeDefined();
    });

    it('should handle CORS for allowed origins', () => {
      const headers = handler.getCORSHeaders('https://claude.ai');

      expect(headers['Access-Control-Allow-Origin']).toBe('https://claude.ai');
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    });
  });

  describe('Hybrid Integration Workflow', () => {
    let hybridManager: HybridIntegrationManager;

    beforeEach(() => {
      hybridManager = new HybridIntegrationManager();
    });

    it('should execute complete hybrid task creation flow', async () => {
      // Create reminder task on macOS (native)
      const macResult = await hybridManager.executeTask({
        type: 'create_reminder',
        platform: 'macos',
        payload: {
          title: 'Test Reminder',
          dueDate: new Date().toISOString(),
        },
      });

      expect(macResult.success).toBe(true);
      expect(macResult.attempted).toContain('native');

      // Create reminder task on web (remote)
      const webResult = await hybridManager.executeTask({
        type: 'create_reminder',
        platform: 'web',
        payload: {
          title: 'Test Reminder',
        },
      });

      expect(webResult.success).toBe(true);
      expect(webResult.attempted).toContain('remote');
    });

    it('should coordinate multi-platform sync', () => {
      const plan = hybridManager.planCoordination(['macos', 'ios', 'web']);

      expect(plan.platforms).toHaveLength(3);
      expect(plan.syncStrategy).toBe('eventual');
      expect(plan.conflictResolution).toBe('last-write-wins');
      expect(plan.syncInterval).toBeDefined();
    });
  });

  describe('Cloud Configuration Sync Workflow', () => {
    let configManager: CloudConfigManager;

    beforeEach(() => {
      configManager = new CloudConfigManager({
        encryptionKey: 'test-encryption-key-32char!!',
        syncEndpoint: 'https://api.example.com/config',
      });
    });

    it('should complete config save and sync cycle', async () => {
      const config = {
        user: { name: 'Test User', timezone: 'Asia/Tokyo' },
        preferences: { language: 'ja' },
      };

      // Save locally
      await configManager.saveLocal(config);
      expect(configManager.getSyncStatus().hasPendingChanges).toBe(true);

      // Encrypt for transmission
      const encrypted = configManager.encryptConfig(config);
      expect(encrypted.data).not.toContain('Test User');
      expect(encrypted.version).toBeGreaterThan(0);

      // Decrypt
      const decrypted = configManager.decryptConfig(encrypted);
      expect((decrypted as { user: { name: string } }).user.name).toBe('Test User');
    });

    it('should handle conflict detection and resolution', async () => {
      const localConfig = {
        data: 'encrypted-local',
        iv: 'iv1',
        version: 2,
        timestamp: Date.now() - 1000,
      };

      const remoteConfig = {
        data: 'encrypted-remote',
        iv: 'iv2',
        version: 3,
        timestamp: Date.now(),
      };

      // Detect conflict
      const conflict = configManager.detectConflict(localConfig, remoteConfig);
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.newerVersion).toBe('remote');

      // Resolve conflict
      const resolution = configManager.resolveConflict(
        { version: localConfig.version, timestamp: localConfig.timestamp },
        { version: remoteConfig.version, timestamp: remoteConfig.timestamp },
        'keep-newer'
      );
      expect(resolution.winner).toBe('remote');
    });

    it('should support multi-device tracking', () => {
      const deviceId = configManager.getDeviceId();
      expect(deviceId).toBeDefined();
      expect(deviceId.length).toBeGreaterThan(0);

      const devices = configManager.getKnownDevices();
      expect(Array.isArray(devices)).toBe(true);
    });
  });

  describe('Session Management Workflow', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = new SessionManager({
        sessionTimeout: 60000,
        maxSessions: 100,
      });
    });

    it('should complete session lifecycle', () => {
      // Create session
      const session = sessionManager.createSession('user-123');
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-123');

      // Validate session
      expect(sessionManager.isValidSession(session.id)).toBe(true);

      // Get session
      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved?.userId).toBe('user-123');

      // Terminate session
      sessionManager.terminateSession(session.id);
      expect(sessionManager.isValidSession(session.id)).toBe(false);
    });

    it('should handle session expiration', async () => {
      const shortTimeoutManager = new SessionManager({
        sessionTimeout: 50,
        maxSessions: 10,
      });

      const session = shortTimeoutManager.createSession('user-123');
      expect(shortTimeoutManager.isValidSession(session.id)).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      shortTimeoutManager.cleanExpiredSessions();
      expect(shortTimeoutManager.isValidSession(session.id)).toBe(false);
    });

    it('should handle max sessions limit', () => {
      const limitedManager = new SessionManager({
        sessionTimeout: 60000,
        maxSessions: 3,
      });

      // Create max sessions
      limitedManager.createSession('user-1');
      limitedManager.createSession('user-2');
      limitedManager.createSession('user-3');
      expect(limitedManager.getActiveSessionCount()).toBe(3);

      // Create another session (should evict oldest)
      limitedManager.createSession('user-4');
      expect(limitedManager.getActiveSessionCount()).toBeLessThanOrEqual(3);
    });
  });

  describe('Error Recovery Workflow', () => {
    it('should recover from server restart', async () => {
      const server = new RemoteMCPServer({ port: 3001 });

      // Start and stop multiple times
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);

      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
    });

    it('should handle invalid request gracefully', () => {
      const handler = new MCPOverHTTPHandler();

      // Invalid JSON
      expect(() => handler.parseRequest('not valid json')).toThrow('Invalid JSON');

      // Missing jsonrpc field
      expect(() =>
        handler.parseRequest(JSON.stringify({ method: 'test' }))
      ).toThrow('Invalid JSON-RPC request');
    });

    it('should handle token expiration gracefully', async () => {
      const auth = new AuthConfig({
        enabled: true,
        jwtSecret: 'test-secret',
        tokenExpiry: 50, // 50ms
      });

      const token = auth.generateToken('user-123');
      expect(auth.validateToken(token)).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(auth.validateToken(token)).toBe(false);
    });
  });
});
