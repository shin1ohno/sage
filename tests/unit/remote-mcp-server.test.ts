/**
 * Remote MCP Server Unit Tests
 * Requirements: 13.1-13.5
 * Tests for HTTP/WebSocket based MCP server
 */

import {
  RemoteMCPServer,
  RemoteMCPServerConfig,
  AuthConfig,
  SessionManager,
  MCPOverHTTPHandler,
} from '../../src/remote/remote-mcp-server.js';

// Mock http module
jest.mock('http', () => ({
  createServer: jest.fn().mockReturnValue({
    listen: jest.fn((_port: number, _host: string, callback: () => void) => callback()),
    close: jest.fn((callback: () => void) => callback()),
    on: jest.fn(),
  }),
}));

describe('RemoteMCPServer', () => {
  let server: RemoteMCPServer;
  const defaultConfig: RemoteMCPServerConfig = {
    port: 3000,
    host: 'localhost',
    auth: {
      enabled: false,
    },
  };

  beforeEach(() => {
    server = new RemoteMCPServer(defaultConfig);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('Server Lifecycle', () => {
    it('should start server on configured port', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
    });

    it('should stop server gracefully', async () => {
      await server.start();
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should handle multiple start/stop cycles', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);

      await server.start();
      expect(server.isRunning()).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should use default port if not specified', () => {
      const serverWithDefaults = new RemoteMCPServer({});
      expect(serverWithDefaults.getPort()).toBe(3000);
    });

    it('should use custom port when specified', () => {
      const customServer = new RemoteMCPServer({ port: 8080 });
      expect(customServer.getPort()).toBe(8080);
    });

    it('should enable HTTPS when certificate is provided', () => {
      const httpsConfig: RemoteMCPServerConfig = {
        port: 443,
        ssl: {
          cert: 'fake-cert',
          key: 'fake-key',
        },
      };
      const httpsServer = new RemoteMCPServer(httpsConfig);
      expect(httpsServer.isHTTPS()).toBe(true);
    });
  });

  describe('Health Check', () => {
    it('should respond to health check endpoint', async () => {
      await server.start();
      const health = await server.healthCheck();
      expect(health.status).toBe('ok');
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionTimeout: 60000, // 1 minute
      maxSessions: 100,
    });
  });

  describe('Session Creation', () => {
    it('should create a new session', () => {
      const session = sessionManager.createSession('user-123');
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-123');
      expect(session.createdAt).toBeDefined();
    });

    it('should generate unique session IDs', () => {
      const session1 = sessionManager.createSession('user-1');
      const session2 = sessionManager.createSession('user-2');
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('Session Validation', () => {
    it('should validate active session', () => {
      const session = sessionManager.createSession('user-123');
      expect(sessionManager.isValidSession(session.id)).toBe(true);
    });

    it('should reject invalid session ID', () => {
      expect(sessionManager.isValidSession('invalid-session-id')).toBe(false);
    });

    it('should expire session after timeout', async () => {
      const shortTimeoutManager = new SessionManager({
        sessionTimeout: 100, // 100ms
        maxSessions: 10,
      });

      const session = shortTimeoutManager.createSession('user-123');
      expect(shortTimeoutManager.isValidSession(session.id)).toBe(true);

      // Wait for session to expire
      await new Promise((resolve) => setTimeout(resolve, 150));
      shortTimeoutManager.cleanExpiredSessions();

      expect(shortTimeoutManager.isValidSession(session.id)).toBe(false);
    });
  });

  describe('Session Termination', () => {
    it('should terminate a session', () => {
      const session = sessionManager.createSession('user-123');
      expect(sessionManager.isValidSession(session.id)).toBe(true);

      sessionManager.terminateSession(session.id);
      expect(sessionManager.isValidSession(session.id)).toBe(false);
    });

    it('should handle terminating non-existent session gracefully', () => {
      expect(() => sessionManager.terminateSession('non-existent')).not.toThrow();
    });
  });

  describe('Max Sessions', () => {
    it('should respect max sessions limit', () => {
      const limitedManager = new SessionManager({
        sessionTimeout: 60000,
        maxSessions: 2,
      });

      limitedManager.createSession('user-1');
      limitedManager.createSession('user-2');

      // Third session should fail or evict oldest
      const session3 = limitedManager.createSession('user-3');
      expect(session3).toBeDefined();
      expect(limitedManager.getActiveSessionCount()).toBeLessThanOrEqual(2);
    });
  });
});

describe('MCPOverHTTPHandler', () => {
  let handler: MCPOverHTTPHandler;

  beforeEach(() => {
    handler = new MCPOverHTTPHandler();
  });

  describe('Request Parsing', () => {
    it('should parse valid MCP request', () => {
      const requestBody = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'analyze_tasks',
          arguments: { tasks: [] },
        },
      });

      const parsed = handler.parseRequest(requestBody);
      expect(parsed.method).toBe('tools/call');
      expect(parsed.params?.name).toBe('analyze_tasks');
    });

    it('should reject invalid JSON', () => {
      expect(() => handler.parseRequest('invalid json')).toThrow('Invalid JSON');
    });

    it('should reject non-JSON-RPC request', () => {
      const invalidRequest = JSON.stringify({
        method: 'test',
        // Missing jsonrpc field
      });
      expect(() => handler.parseRequest(invalidRequest)).toThrow('Invalid JSON-RPC request');
    });
  });

  describe('Response Building', () => {
    it('should build success response', () => {
      const response = handler.buildResponse(1, { success: true, data: 'test' });
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toEqual({ success: true, data: 'test' });
    });

    it('should build error response', () => {
      const response = handler.buildErrorResponse(1, -32600, 'Invalid request');
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error?.code).toBe(-32600);
      expect(response.error?.message).toBe('Invalid request');
    });
  });

  describe('CORS Handling', () => {
    it('should add CORS headers to response', () => {
      const headers = handler.getCORSHeaders('https://claude.ai');
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    });

    it('should allow configured origins', () => {
      const configuredHandler = new MCPOverHTTPHandler({
        allowedOrigins: ['https://claude.ai', 'https://anthropic.com'],
      });

      const headers = configuredHandler.getCORSHeaders('https://claude.ai');
      expect(headers['Access-Control-Allow-Origin']).toBe('https://claude.ai');
    });
  });
});

describe('AuthConfig', () => {
  describe('Token Validation', () => {
    it('should validate JWT token', () => {
      const auth = new AuthConfig({
        enabled: true,
        jwtSecret: 'test-secret',
      });

      // Create a mock token
      const token = auth.generateToken('user-123');
      expect(auth.validateToken(token)).toBe(true);
    });

    it('should reject expired token', async () => {
      const auth = new AuthConfig({
        enabled: true,
        jwtSecret: 'test-secret',
        tokenExpiry: 100, // 100ms
      });

      const token = auth.generateToken('user-123');

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(auth.validateToken(token)).toBe(false);
    });

    it('should reject invalid token', () => {
      const auth = new AuthConfig({
        enabled: true,
        jwtSecret: 'test-secret',
      });

      expect(auth.validateToken('invalid-token')).toBe(false);
    });
  });

  describe('API Key Authentication', () => {
    it('should validate API key', () => {
      const auth = new AuthConfig({
        enabled: true,
        apiKeys: ['valid-api-key-1', 'valid-api-key-2'],
      });

      expect(auth.validateApiKey('valid-api-key-1')).toBe(true);
      expect(auth.validateApiKey('invalid-key')).toBe(false);
    });
  });

  describe('IP Whitelist', () => {
    it('should allow whitelisted IPs', () => {
      const auth = new AuthConfig({
        enabled: true,
        ipWhitelist: ['127.0.0.1', '::1', '192.168.1.0/24'],
      });

      expect(auth.isIPAllowed('127.0.0.1')).toBe(true);
      expect(auth.isIPAllowed('192.168.1.100')).toBe(true);
    });

    it('should block non-whitelisted IPs when whitelist is configured', () => {
      const auth = new AuthConfig({
        enabled: true,
        ipWhitelist: ['127.0.0.1'],
      });

      expect(auth.isIPAllowed('192.168.1.1')).toBe(false);
    });

    it('should allow all IPs when whitelist is empty', () => {
      const auth = new AuthConfig({
        enabled: true,
        ipWhitelist: [],
      });

      expect(auth.isIPAllowed('any-ip')).toBe(true);
    });
  });
});
