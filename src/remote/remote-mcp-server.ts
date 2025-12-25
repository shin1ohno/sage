/**
 * Remote MCP Server
 * HTTP/WebSocket based MCP server for remote access
 * Requirements: 13.1-13.5
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { randomUUID } from 'crypto';

/**
 * SSL configuration
 */
export interface SSLConfig {
  cert: string;
  key: string;
  ca?: string;
}

/**
 * Remote MCP Server configuration
 */
export interface RemoteMCPServerConfig {
  port?: number;
  host?: string;
  ssl?: SSLConfig;
  auth?: {
    enabled: boolean;
    jwtSecret?: string;
    apiKeys?: string[];
    ipWhitelist?: string[];
    tokenExpiry?: number;
  };
  cors?: {
    allowedOrigins?: string[];
    allowedMethods?: string[];
    allowedHeaders?: string[];
  };
}

/**
 * Session information
 */
export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  lastAccessedAt: Date;
  data: Record<string, unknown>;
}

/**
 * Session manager configuration
 */
export interface SessionManagerConfig {
  sessionTimeout: number; // milliseconds
  maxSessions: number;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  uptime: number;
  version: string;
  timestamp: string;
}

/**
 * JSON-RPC request
 */
export interface JSONRPCRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response
 */
export interface JSONRPCResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP Over HTTP Handler configuration
 */
export interface MCPOverHTTPHandlerConfig {
  allowedOrigins?: string[];
}

/**
 * Session Manager
 * Handles session creation, validation, and cleanup
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private config: SessionManagerConfig;

  constructor(config: SessionManagerConfig) {
    this.config = config;
  }

  /**
   * Create a new session
   */
  createSession(userId: string): Session {
    // Check if we're at max sessions and remove oldest if needed
    while (this.sessions.size >= this.config.maxSessions) {
      // Remove oldest session
      this.removeOldestSession();
    }

    const session: Session = {
      id: randomUUID(),
      userId,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      data: {},
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Check if a session is valid
   */
  isValidSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const now = Date.now();
    const lastAccess = session.lastAccessedAt.getTime();

    if (now - lastAccess > this.config.sessionTimeout) {
      this.sessions.delete(sessionId);
      return false;
    }

    // Update last accessed time
    session.lastAccessedAt = new Date();
    return true;
  }

  /**
   * Terminate a session
   */
  terminateSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    if (this.isValidSession(sessionId)) {
      return this.sessions.get(sessionId);
    }
    return undefined;
  }

  /**
   * Clean up expired sessions
   */
  cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt.getTime() > this.config.sessionTimeout) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Remove oldest session
   */
  private removeOldestSession(): void {
    let oldestId: string | null = null;
    let oldestTime = Date.now();

    for (const [id, session] of this.sessions.entries()) {
      if (session.createdAt.getTime() < oldestTime) {
        oldestTime = session.createdAt.getTime();
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
    }
  }
}

/**
 * Authentication Configuration
 * Handles JWT, API keys, and IP whitelist authentication
 */
export class AuthConfig {
  private config: NonNullable<RemoteMCPServerConfig['auth']>;
  private tokens: Map<string, { userId: string; expiresAt: number }> = new Map();

  constructor(config: NonNullable<RemoteMCPServerConfig['auth']>) {
    this.config = config;
  }

  /**
   * Generate a token for a user
   */
  generateToken(userId: string): string {
    const token = randomUUID();
    const expiry = this.config.tokenExpiry || 3600000; // 1 hour default
    const expiresAt = Date.now() + expiry;

    this.tokens.set(token, { userId, expiresAt });
    return token;
  }

  /**
   * Validate a token
   */
  validateToken(token: string): boolean {
    const tokenData = this.tokens.get(token);
    if (!tokenData) {
      return false;
    }

    if (Date.now() > tokenData.expiresAt) {
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Validate an API key
   */
  validateApiKey(apiKey: string): boolean {
    if (!this.config.apiKeys || this.config.apiKeys.length === 0) {
      return false;
    }
    return this.config.apiKeys.includes(apiKey);
  }

  /**
   * Check if an IP is allowed
   */
  isIPAllowed(ip: string): boolean {
    if (!this.config.ipWhitelist || this.config.ipWhitelist.length === 0) {
      return true; // No whitelist means all IPs allowed
    }

    // Simple IP matching (supports exact match and CIDR notation)
    for (const allowed of this.config.ipWhitelist) {
      if (this.matchIP(ip, allowed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match IP against pattern (exact or CIDR)
   */
  private matchIP(ip: string, pattern: string): boolean {
    if (ip === pattern) {
      return true;
    }

    // Simple CIDR matching for IPv4
    if (pattern.includes('/')) {
      const [network, bits] = pattern.split('/');
      const mask = parseInt(bits, 10);

      if (mask >= 0 && mask <= 32) {
        const ipParts = ip.split('.').map(Number);
        const networkParts = network.split('.').map(Number);

        if (ipParts.length === 4 && networkParts.length === 4) {
          const ipNum =
            (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
          const networkNum =
            (networkParts[0] << 24) |
            (networkParts[1] << 16) |
            (networkParts[2] << 8) |
            networkParts[3];
          const maskNum = ~((1 << (32 - mask)) - 1);

          return (ipNum & maskNum) === (networkNum & maskNum);
        }
      }
    }

    return false;
  }

  /**
   * Extract token from Authorization header
   */
  extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }

  /**
   * Check if authentication is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * MCP Over HTTP Handler
 * Handles JSON-RPC over HTTP protocol
 */
export class MCPOverHTTPHandler {
  private config: MCPOverHTTPHandlerConfig;

  constructor(config?: MCPOverHTTPHandlerConfig) {
    this.config = config || {};
  }

  /**
   * Parse a JSON-RPC request
   */
  parseRequest(body: string): JSONRPCRequest {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error('Invalid JSON');
    }

    const request = parsed as Record<string, unknown>;

    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC request');
    }

    if (request.method === undefined) {
      throw new Error('Invalid JSON-RPC request: missing method');
    }

    return {
      jsonrpc: '2.0',
      id: (request.id as number | string) ?? null,
      method: request.method as string,
      params: request.params as Record<string, unknown> | undefined,
    };
  }

  /**
   * Build a success response
   */
  buildResponse(id: number | string | null, result: unknown): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  /**
   * Build an error response
   */
  buildErrorResponse(
    id: number | string | null,
    code: number,
    message: string,
    data?: unknown
  ): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    };
  }

  /**
   * Get CORS headers for a request
   */
  getCORSHeaders(origin?: string): Record<string, string> {
    const allowedOrigins = this.config.allowedOrigins || ['*'];

    let allowOrigin = '*';
    if (origin && allowedOrigins.includes(origin)) {
      allowOrigin = origin;
    } else if (allowedOrigins.length === 1 && allowedOrigins[0] !== '*') {
      allowOrigin = allowedOrigins[0];
    }

    return {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400',
    };
  }
}

/**
 * Remote MCP Server
 * HTTP/HTTPS server that exposes MCP protocol over HTTP
 */
export class RemoteMCPServer {
  private config: RemoteMCPServerConfig;
  private server: Server | HttpsServer | null = null;
  private running: boolean = false;
  private startTime: Date | null = null;
  private _sessionManager: SessionManager;
  private auth: AuthConfig | null;
  private httpHandler: MCPOverHTTPHandler;

  constructor(config: RemoteMCPServerConfig) {
    this.config = {
      port: 3000,
      host: 'localhost',
      ...config,
    };

    this._sessionManager = new SessionManager({
      sessionTimeout: 3600000, // 1 hour
      maxSessions: 1000,
    });

    this.auth = config.auth ? new AuthConfig(config.auth) : null;
    this.httpHandler = new MCPOverHTTPHandler({
      allowedOrigins: config.cors?.allowedOrigins,
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const requestHandler = this.handleRequest.bind(this);

        if (this.config.ssl) {
          this.server = createHttpsServer(
            {
              cert: this.config.ssl.cert,
              key: this.config.ssl.key,
              ca: this.config.ssl.ca,
            },
            requestHandler
          );
        } else {
          this.server = createServer(requestHandler);
        }

        this.server.listen(this.config.port, this.config.host, () => {
          this.running = true;
          this.startTime = new Date();
          resolve();
        });

        this.server.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        this.startTime = null;
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get configured port
   */
  getPort(): number {
    return this.config.port!;
  }

  /**
   * Check if HTTPS is enabled
   */
  isHTTPS(): boolean {
    return !!this.config.ssl;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    return {
      status: this.running ? 'ok' : 'error',
      uptime,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get session manager for external access
   */
  getSessionManager(): SessionManager {
    return this._sessionManager;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this._sessionManager.getActiveSessionCount();
  }

  /**
   * Handle incoming HTTP request
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const origin = req.headers.origin;

    // Add CORS headers
    const corsHeaders = this.httpHandler.getCORSHeaders(origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
      res.setHeader(key, value);
    }

    // Handle preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint
    if (url === '/health' && method === 'GET') {
      this.handleHealthCheck(res);
      return;
    }

    // MCP endpoint
    if (url === '/mcp' && method === 'POST') {
      this.handleMCPRequest(req, res);
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle health check request
   */
  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    const health = await this.healthCheck();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  /**
   * Handle MCP request
   */
  private handleMCPRequest(req: IncomingMessage, res: ServerResponse): void {
    // Check authentication if enabled
    if (this.auth?.isEnabled()) {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string | undefined;
      const clientIP =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        req.socket.remoteAddress ||
        '';

      // Check IP whitelist
      if (!this.auth.isIPAllowed(clientIP)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.httpHandler.buildErrorResponse(null, -32001, 'IP not allowed')));
        return;
      }

      // Check API key or token
      const token = this.auth.extractToken(authHeader);
      if (!token && !apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify(
            this.httpHandler.buildErrorResponse(null, -32002, 'Authentication required')
          )
        );
        return;
      }

      if (token && !this.auth.validateToken(token)) {
        if (!apiKey || !this.auth.validateApiKey(apiKey)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify(this.httpHandler.buildErrorResponse(null, -32003, 'Invalid credentials'))
          );
          return;
        }
      }
    }

    // Read request body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const request = this.httpHandler.parseRequest(body);

        // TODO: Route to appropriate MCP tool handler
        // For now, return a placeholder response
        const response = this.httpHandler.buildResponse(request.id, {
          message: 'MCP request received',
          method: request.method,
          params: request.params,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.httpHandler.buildErrorResponse(null, -32700, errorMessage)));
      }
    });

    req.on('error', (error) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(this.httpHandler.buildErrorResponse(null, -32603, error.message))
      );
    });
  }
}
