/**
 * HTTP Server with Remote Config Integration
 * Requirements: 15.1, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 21-31 (OAuth)
 *
 * Creates an HTTP server with configuration loaded from remote-config.json
 * and integrates JWT-based authentication and OAuth 2.1.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { VERSION } from '../version.js';
import {
  loadRemoteConfig,
  RemoteConfig,
  DEFAULT_REMOTE_CONFIG_PATH,
  OAuthAuthConfig,
} from './remote-config-loader.js';
import { createSecretAuthenticator, SecretAuthenticator } from './secret-auth.js';
import { createMCPHandler, MCPHandler, MCPRequest } from './mcp-handler.js';
import { createSSEStreamHandler, SSEStreamHandler } from './sse-stream-handler.js';
import { OAuthServer, OAuthHandler } from '../oauth/index.js';

/**
 * Options for creating the server
 */
export interface HTTPServerWithConfigOptions {
  /** Path to remote config file (default: ~/.sage/remote-config.json) */
  configPath?: string;
  /** Override port from CLI */
  port?: number;
  /** Override host from CLI */
  host?: string;
  /** Override auth secret from environment */
  authSecret?: string;
}

/**
 * HTTP Server with Config interface
 */
export interface HTTPServerWithConfig {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getPort(): number;
  getHost(): string;
  isAuthEnabled(): boolean;
  getConfig(): RemoteConfig;
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: 'ok' | 'error';
  uptime: number;
  version: string;
  timestamp: string;
  authEnabled: boolean;
}

/**
 * HTTP Server with Config Implementation
 */
class HTTPServerWithConfigImpl implements HTTPServerWithConfig {
  private server: Server | null = null;
  private running: boolean = false;
  private startTime: Date | null = null;
  private config: RemoteConfig;
  private effectivePort: number;
  private effectiveHost: string;
  private authenticator: SecretAuthenticator | null = null;
  private mcpHandler: MCPHandler | null = null;
  private sseHandler: SSEStreamHandler | null = null;
  private oauthServer: OAuthServer | null = null;
  private oauthHandler: OAuthHandler | null = null;

  constructor(config: RemoteConfig, options: HTTPServerWithConfigOptions) {
    this.config = config;

    // Apply priority: CLI > Environment > Config > Default
    this.effectivePort = options.port ?? config.remote.port;
    this.effectiveHost = options.host ?? config.remote.host;

    // Setup authentication based on type
    if (config.remote.auth.type === 'oauth2') {
      // OAuth will be initialized in start()
    } else if (config.remote.auth.type === 'jwt') {
      // Setup JWT authenticator from config
      const jwtConfig = config.remote.auth;
      const secret = options.authSecret ?? jwtConfig.secret;

      if (secret) {
        this.authenticator = createSecretAuthenticator({
          secret,
          expiresIn: jwtConfig.expiresIn ?? '24h',
        });
      }
    } else if (options.authSecret) {
      // Setup JWT authenticator from CLI option (overrides 'none' type)
      this.authenticator = createSecretAuthenticator({
        secret: options.authSecret,
        expiresIn: '24h',
      });
      // Update auth type to reflect that auth is now enabled
      this.config.remote.auth = {
        type: 'jwt',
        secret: options.authSecret,
        expiresIn: '24h',
      };
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Initialize MCP handler
    this.mcpHandler = await createMCPHandler();

    // Initialize SSE handler for Streamable HTTP Transport (Requirement 20)
    this.sseHandler = createSSEStreamHandler();

    // Initialize OAuth if configured (Requirements 21-31)
    if (this.config.remote.auth.type === 'oauth2') {
      const oauthConfig = this.config.remote.auth as OAuthAuthConfig;
      const issuer = oauthConfig.issuer || `http://${this.effectiveHost}:${this.effectivePort}`;

      // Convert user config to OAuth users
      const users = oauthConfig.users.map((u, i) => ({
        id: `user_${i}`,
        username: u.username,
        passwordHash: u.passwordHash,
        createdAt: Date.now(),
      }));

      this.oauthServer = new OAuthServer({
        issuer,
        accessTokenExpiry: oauthConfig.accessTokenExpiry || '1h',
        refreshTokenExpiry: oauthConfig.refreshTokenExpiry || '30d',
        authorizationCodeExpiry: '10m',
        allowedRedirectUris: oauthConfig.allowedRedirectUris || [],
        users,
      });

      await this.oauthServer.initialize();
      this.oauthHandler = new OAuthHandler(this.oauthServer, {
        issuer,
        accessTokenExpiry: oauthConfig.accessTokenExpiry || '1h',
        refreshTokenExpiry: oauthConfig.refreshTokenExpiry || '30d',
        allowedRedirectUris: oauthConfig.allowedRedirectUris || [],
        users,
      });
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.handleRequest.bind(this));

        this.server.listen(this.effectivePort, this.effectiveHost, () => {
          this.running = true;
          this.startTime = new Date();
          resolve();
        });

        this.server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    // Cleanup SSE connections
    if (this.sseHandler) {
      this.sseHandler.cleanup();
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        this.startTime = null;
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getPort(): number {
    return this.effectivePort;
  }

  getHost(): string {
    return this.effectiveHost;
  }

  isAuthEnabled(): boolean {
    return (
      (this.config.remote.auth.type === 'jwt' && this.authenticator !== null) ||
      (this.config.remote.auth.type === 'oauth2' && this.oauthServer !== null)
    );
  }

  isOAuthEnabled(): boolean {
    return this.config.remote.auth.type === 'oauth2' && this.oauthServer !== null;
  }

  getConfig(): RemoteConfig {
    return this.config;
  }

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

    // Health check endpoint (no auth required)
    if (url === '/health' && method === 'GET') {
      this.handleHealthCheck(res);
      return;
    }

    // OAuth endpoints (Requirements 21-31)
    if (this.oauthHandler) {
      const path = url.split('?')[0];
      const oauthPaths = [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-authorization-server',
        '/oauth/register',
        '/oauth/authorize',
        '/oauth/login',
        '/oauth/token',
      ];

      if (oauthPaths.includes(path)) {
        this.oauthHandler.handleRequest(req, res).catch(() => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        });
        return;
      }
    }

    // Auth token endpoint (for JWT mode)
    if (url === '/auth/token' && method === 'POST' && !this.isOAuthEnabled()) {
      this.handleAuthToken(req, res);
      return;
    }

    // MCP SSE endpoint for Streamable HTTP Transport (Requirement 20.1)
    // GET /mcp establishes SSE stream for server->client notifications
    if (url === '/mcp' && method === 'GET') {
      this.handleMCPSSERequest(req, res);
      return;
    }

    // MCP endpoint (auth required if enabled)
    if (url === '/mcp' && method === 'POST') {
      this.handleMCPRequest(req, res);
      return;
    }

    // Root path - show server info
    if ((url === '/' || url === '') && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'sage',
        version: VERSION,
        status: 'running',
        endpoints: {
          mcp: '/mcp',
          health: '/health',
          oauth: this.isOAuthEnabled() ? {
            metadata: '/.well-known/oauth-authorization-server',
            authorize: '/oauth/authorize',
            token: '/oauth/token',
            register: '/oauth/register',
          } : undefined,
        },
      }));
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private getCORSHeaders(origin?: string): Record<string, string> {
    const allowedOrigins = this.config.remote.cors.allowedOrigins;

    let allowOrigin = '*';
    if (allowedOrigins.includes('*')) {
      allowOrigin = '*';
    } else if (origin && allowedOrigins.includes(origin)) {
      allowOrigin = origin;
    } else if (allowedOrigins.length === 1) {
      allowOrigin = allowedOrigins[0];
    }

    return {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
  }

  private handleHealthCheck(res: ServerResponse): void {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    const health: HealthCheckResponse = {
      status: this.running ? 'ok' : 'error',
      uptime,
      version: VERSION,
      timestamp: new Date().toISOString(),
      authEnabled: this.isAuthEnabled(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  private handleAuthToken(req: IncomingMessage, res: ServerResponse): void {
    // Check if auth is enabled
    if (!this.isAuthEnabled() || !this.authenticator) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentication is disabled' }));
      return;
    }

    // Read request body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const secret = parsed.secret;

        if (!secret) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Secret is required' }));
          return;
        }

        const result = await this.authenticator!.authenticate(secret);

        if (result.success) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              token: result.token,
              expiresIn: result.expiresIn,
            })
          );
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error || 'Invalid secret' }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
  }

  /**
   * Verify Bearer token (supports both JWT and OAuth)
   */
  private async verifyBearerToken(authHeader: string | undefined): Promise<{ valid: boolean; error?: string }> {
    if (!authHeader) {
      return { valid: false, error: 'Authentication required' };
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return { valid: false, error: 'Invalid Authorization header' };
    }

    const token = parts[1];

    // Use OAuth verification if OAuth is enabled
    if (this.isOAuthEnabled() && this.oauthServer) {
      const result = await this.oauthServer.verifyAccessToken(token);
      return { valid: result.valid, error: result.error };
    }

    // Fall back to JWT verification
    if (this.authenticator) {
      const result = await this.authenticator.verifyToken(token);
      return { valid: result.valid, error: result.error };
    }

    return { valid: false, error: 'No authentication configured' };
  }

  /**
   * Handle GET /mcp request for SSE stream (Streamable HTTP Transport)
   * Requirement 20.1, 20.10, 31.5 (OAuth Bearer auth for SSE)
   */
  private handleMCPSSERequest(req: IncomingMessage, res: ServerResponse): void {
    // Requirement 20.10, 31.5: Check authentication if enabled
    if (this.isAuthEnabled()) {
      // Add WWW-Authenticate header for OAuth (Requirement 22.4)
      if (this.isOAuthEnabled() && this.oauthServer) {
        res.setHeader('WWW-Authenticate', this.oauthServer.getWWWAuthenticateHeader());
      }

      this.verifyBearerToken(req.headers.authorization).then((result) => {
        if (!result.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error || 'Invalid token' }));
          return;
        }

        this.establishSSEConnection(req, res);
      });
    } else {
      // Requirement 20.10: authEnabled: false allows access without auth
      this.establishSSEConnection(req, res);
    }
  }

  /**
   * Establish SSE connection
   */
  private establishSSEConnection(req: IncomingMessage, res: ServerResponse): void {
    if (!this.sseHandler) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SSE handler not initialized' }));
      return;
    }

    this.sseHandler.handleSSERequest(req, res);
  }

  private handleMCPRequest(req: IncomingMessage, res: ServerResponse): void {
    // Check authentication if enabled
    if (this.isAuthEnabled()) {
      // Add WWW-Authenticate header for OAuth (Requirement 22.4)
      if (this.isOAuthEnabled() && this.oauthServer) {
        res.setHeader('WWW-Authenticate', this.oauthServer.getWWWAuthenticateHeader());
      }

      this.verifyBearerToken(req.headers.authorization).then((result) => {
        if (!result.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32002,
                message: result.error || 'Invalid token',
              },
            })
          );
          return;
        }

        this.processMCPRequest(req, res);
      });
    } else {
      this.processMCPRequest(req, res);
    }
  }

  private processMCPRequest(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const request = this.parseJSONRPCRequest(body);

        // Process request through MCP handler
        if (!this.mcpHandler) {
          throw new Error('MCP handler not initialized');
        }

        const mcpRequest: MCPRequest = {
          jsonrpc: '2.0',
          id: request.id,
          method: request.method,
          params: request.params,
        };

        const response = await this.mcpHandler.handleRequest(mcpRequest);

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
  }

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
 * Create HTTP server with configuration from file
 */
export async function createHTTPServerWithConfig(
  options: HTTPServerWithConfigOptions = {}
): Promise<HTTPServerWithConfig> {
  // Load configuration
  const configPath = options.configPath ?? DEFAULT_REMOTE_CONFIG_PATH;
  const config = await loadRemoteConfig(configPath);

  // Create and start server
  const server = new HTTPServerWithConfigImpl(config, options);
  await server.start();

  return server;
}
