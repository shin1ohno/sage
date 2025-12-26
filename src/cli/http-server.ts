/**
 * HTTP Server Mode for sage
 * Requirements: 14.1, 14.9, 14.10, 13.1
 *
 * Provides HTTP server functionality for Remote MCP access.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { VERSION } from '../version.js';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { randomUUID } from 'crypto';

/**
 * HTTP Server Configuration
 */
export interface HTTPServerConfig {
  /** HTTP server port */
  port: number;
  /** HTTP server host address */
  host: string;
  /** Path to configuration file */
  configPath?: string;
  /** SSL configuration for HTTPS */
  ssl?: {
    cert: string;
    key: string;
    ca?: string;
  };
  /** Authentication configuration */
  auth?: {
    enabled: boolean;
    jwtSecret?: string;
    apiKeys?: string[];
    ipWhitelist?: string[];
    tokenExpiry?: number;
  };
  /** CORS configuration */
  cors?: {
    allowedOrigins?: string[];
    allowedMethods?: string[];
    allowedHeaders?: string[];
  };
}

/**
 * Server information
 */
export interface ServerInfo {
  port: number;
  host: string;
  ssl: boolean;
  authEnabled: boolean;
  startTime?: Date;
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
 * HTTP Server Instance interface
 */
export interface HTTPServerInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getPort(): number;
  getHost(): string;
  getServerInfo(): ServerInfo;
}

/**
 * Token store entry
 */
interface TokenEntry {
  userId: string;
  expiresAt: number;
}

/**
 * HTTP Server implementation
 */
class HTTPServer implements HTTPServerInstance {
  private config: HTTPServerConfig;
  private server: Server | HttpsServer | null = null;
  private running: boolean = false;
  private startTime: Date | null = null;
  private tokens: Map<string, TokenEntry> = new Map();

  constructor(config: HTTPServerConfig) {
    this.config = config;
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
    return this.config.port;
  }

  /**
   * Get configured host
   */
  getHost(): string {
    return this.config.host;
  }

  /**
   * Get server info
   */
  getServerInfo(): ServerInfo {
    return {
      port: this.config.port,
      host: this.config.host,
      ssl: !!this.config.ssl,
      authEnabled: this.config.auth?.enabled ?? false,
      startTime: this.startTime ?? undefined,
    };
  }

  /**
   * Handle incoming HTTP request
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const origin = req.headers.origin;

    // Add CORS headers
    const corsHeaders = this.getCORSHeaders(origin);
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

    // Auth token endpoint
    if (url === '/auth/token' && method === 'POST') {
      this.handleAuthToken(req, res);
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
   * Get CORS headers
   */
  private getCORSHeaders(origin?: string): Record<string, string> {
    const allowedOrigins = this.config.cors?.allowedOrigins || ['*'];

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

  /**
   * Handle health check request
   */
  private handleHealthCheck(res: ServerResponse): void {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    const health: HealthCheckResponse = {
      status: this.running ? 'ok' : 'error',
      uptime,
      version: VERSION,
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  /**
   * Handle auth token request
   */
  private handleAuthToken(req: IncomingMessage, res: ServerResponse): void {
    // Check if auth is enabled and API key is valid
    if (this.config.auth?.enabled) {
      const apiKey = req.headers['x-api-key'] as string | undefined;

      if (!apiKey || !this.config.auth.apiKeys?.includes(apiKey)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid API key' }));
        return;
      }
    }

    // Read request body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const userId = parsed.userId || 'anonymous';

        // Generate token
        const token = randomUUID();
        const expiry = this.config.auth?.tokenExpiry || 3600000; // 1 hour default
        const expiresAt = Date.now() + expiry;

        this.tokens.set(token, { userId, expiresAt });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token, expiresIn: expiry }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
  }

  /**
   * Handle MCP request
   */
  private handleMCPRequest(req: IncomingMessage, res: ServerResponse): void {
    // Check authentication if enabled
    if (this.config.auth?.enabled) {
      const authResult = this.checkAuth(req);
      if (!authResult.success) {
        res.writeHead(authResult.statusCode, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: authResult.errorCode,
              message: authResult.errorMessage,
            },
          })
        );
        return;
      }
    }

    // Read request body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const request = this.parseJSONRPCRequest(body);

        // TODO: Route to appropriate MCP tool handler
        // For now, return a placeholder response
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            message: 'MCP request received',
            method: request.method,
            params: request.params,
          },
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: errorMessage,
            },
          })
        );
      }
    });

    req.on('error', (error) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: error.message,
          },
        })
      );
    });
  }

  /**
   * Check authentication
   */
  private checkAuth(
    req: IncomingMessage
  ): { success: true } | { success: false; statusCode: number; errorCode: number; errorMessage: string } {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const clientIP =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket.remoteAddress ||
      '';

    // Check IP whitelist
    if (
      this.config.auth?.ipWhitelist &&
      this.config.auth.ipWhitelist.length > 0 &&
      !this.isIPAllowed(clientIP)
    ) {
      return {
        success: false,
        statusCode: 403,
        errorCode: -32001,
        errorMessage: 'IP not allowed',
      };
    }

    // Check API key or token
    const token = this.extractToken(authHeader);
    if (!token && !apiKey) {
      return {
        success: false,
        statusCode: 401,
        errorCode: -32002,
        errorMessage: 'Authentication required',
      };
    }

    // Validate token
    if (token) {
      const tokenData = this.tokens.get(token);
      if (tokenData && Date.now() <= tokenData.expiresAt) {
        return { success: true };
      }
    }

    // Validate API key
    if (apiKey && this.config.auth?.apiKeys?.includes(apiKey)) {
      return { success: true };
    }

    return {
      success: false,
      statusCode: 401,
      errorCode: -32003,
      errorMessage: 'Invalid credentials',
    };
  }

  /**
   * Check if IP is allowed
   */
  private isIPAllowed(ip: string): boolean {
    if (!this.config.auth?.ipWhitelist || this.config.auth.ipWhitelist.length === 0) {
      return true;
    }

    for (const allowed of this.config.auth.ipWhitelist) {
      if (ip === allowed) {
        return true;
      }
      // Simple CIDR matching
      if (allowed.includes('/')) {
        const [network, bits] = allowed.split('/');
        const mask = parseInt(bits, 10);
        if (this.matchCIDR(ip, network, mask)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Match IP against CIDR
   */
  private matchCIDR(ip: string, network: string, mask: number): boolean {
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);

    if (ipParts.length !== 4 || networkParts.length !== 4) {
      return false;
    }

    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const networkNum =
      (networkParts[0] << 24) | (networkParts[1] << 16) | (networkParts[2] << 8) | networkParts[3];
    const maskNum = ~((1 << (32 - mask)) - 1);

    return (ipNum & maskNum) === (networkNum & maskNum);
  }

  /**
   * Extract token from Authorization header
   */
  private extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }

  /**
   * Parse JSON-RPC request
   */
  private parseJSONRPCRequest(body: string): {
    jsonrpc: string;
    id: number | string | null;
    method: string;
    params?: Record<string, unknown>;
  } {
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
}

/**
 * Create and start an HTTP server
 * @param config - Server configuration
 * @returns Running HTTP server instance
 */
export async function createHTTPServer(config: HTTPServerConfig): Promise<HTTPServerInstance> {
  const server = new HTTPServer(config);
  await server.start();
  return server;
}
