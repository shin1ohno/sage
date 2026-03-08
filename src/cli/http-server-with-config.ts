/**
 * HTTP Server with Remote Config Integration
 * Requirements: 15.1, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9
 *
 * Creates an HTTP server with configuration loaded from remote-config.json
 * and integrates JWKS-based JWT verification (via Hydra) for OAuth 2.0.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { VERSION } from '../version.js';
import {
  loadRemoteConfig,
  RemoteConfig,
  DEFAULT_REMOTE_CONFIG_PATH,
} from './remote-config-loader.js';
import { createSecretAuthenticator, SecretAuthenticator } from './secret-auth.js';
import { createMCPHandler, MCPHandler } from './mcp-handler.js';
import {
  PendingGoogleAuthStore,
  GoogleOAuthCallbackHandler,
  GoogleOAuthHandler,
} from '../google-oauth/index.js';
import { setSharedPendingAuthStore } from '../tools/oauth/authenticate-google.js';
import { JWKSVerifier } from '../auth/jwks-verifier.js';
import { cliLogger } from '../utils/logger.js';
import { createSSEStreamHandler, SSEStreamHandler } from './sse-stream-handler.js';
import {
  createStreamableHTTPHandler,
  StreamableHTTPHandler,
} from './streamable-http-handler.js';

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
  /** Enable debug logging */
  debug?: boolean;
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
 * Cookie name for session token
 */
const SESSION_COOKIE_NAME = 'sage_session';

/**
 * Parse cookies from Cookie header
 */
function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    if (name && rest.length > 0) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });

  return cookies;
}

/**
 * Create Set-Cookie header value
 */
function createSessionCookie(token: string, maxAge: number = 86400): string {
  // maxAge in seconds (default: 24 hours)
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
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
  private jwksVerifier: JWKSVerifier | null = null;
  private debug: boolean = false;
  // Google OAuth remote mode handlers
  private pendingGoogleAuthStore: PendingGoogleAuthStore | null = null;
  private googleOAuthCallbackHandler: GoogleOAuthCallbackHandler | null = null;
  // Streamable HTTP Transport handlers (FR-1, FR-2, FR-3)
  private sseHandler: SSEStreamHandler | null = null;
  private streamableHandler: StreamableHTTPHandler | null = null;

  constructor(config: RemoteConfig, options: HTTPServerWithConfigOptions) {
    this.config = config;
    this.debug = options.debug ?? false;

    // Apply priority: CLI > Environment > Config > Default
    this.effectivePort = options.port ?? config.remote.port;
    this.effectiveHost = options.host ?? config.remote.host;

    // Setup authentication based on type
    if (config.remote.auth.type === 'oauth2') {
      // JWKS verifier will be initialized in start()
      // Also setup static token authenticator if enabled
      const oauthConfig = config.remote.auth;
      if (oauthConfig.allowStaticTokens && oauthConfig.staticTokenSecret) {
        this.authenticator = createSecretAuthenticator({
          secret: oauthConfig.staticTokenSecret,
          expiresIn: '1h',
        });
      }
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

    // Initialize Streamable HTTP Transport handlers (FR-1, FR-2, FR-3)
    this.sseHandler = createSSEStreamHandler({
      keepaliveInterval: this.config.remote.streamableHttp?.keepaliveInterval ?? 30000,
      maxConnectionsPerSession: this.config.remote.streamableHttp?.maxStreamsPerSession ?? 5,
    });
    this.streamableHandler = createStreamableHTTPHandler(
      this.mcpHandler,
      this.sseHandler,
      {
        sessionTimeout: this.config.remote.streamableHttp?.sessionTimeout ?? 3600000,
        eventBufferRetention: this.config.remote.streamableHttp?.eventBufferRetention ?? 300000,
        keepaliveInterval: this.config.remote.streamableHttp?.keepaliveInterval ?? 30000,
        maxSessions: this.config.remote.streamableHttp?.maxSessions ?? 1000,
        maxStreamsPerSession: this.config.remote.streamableHttp?.maxStreamsPerSession ?? 5,
      }
    );

    // Initialize Google OAuth callback handler for remote mode
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const redirectUri = process.env.GOOGLE_REDIRECT_URI;
      // Only enable remote mode if redirect URI is not localhost
      if (redirectUri && !redirectUri.toLowerCase().includes('localhost') && !redirectUri.toLowerCase().includes('127.0.0.1')) {
        this.pendingGoogleAuthStore = new PendingGoogleAuthStore();
        await this.pendingGoogleAuthStore.initialize();

        // Share the store with authenticate_google tool
        setSharedPendingAuthStore(this.pendingGoogleAuthStore);

        const googleOAuthHandler = new GoogleOAuthHandler({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri,
        });

        this.googleOAuthCallbackHandler = new GoogleOAuthCallbackHandler({
          pendingAuthStore: this.pendingGoogleAuthStore,
          googleOAuthHandler,
        });

        cliLogger.info({ redirectUri }, 'Google OAuth remote mode enabled');
      }
    }

    // Initialize JWKS verifier for OAuth token validation (delegated to Hydra)
    if (this.config.remote.auth.type === 'oauth2') {
      const oauthConfig = this.config.remote.auth;
      const issuer = oauthConfig.issuer || `http://${this.effectiveHost}:${this.effectivePort}`;

      this.jwksVerifier = new JWKSVerifier({
        jwksUrl: `${issuer}/.well-known/jwks.json`,
        issuer,
      });

      cliLogger.info({ issuer }, 'JWKS-based token verification enabled (Hydra)');
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

    // Shutdown Google OAuth pending auth store
    if (this.pendingGoogleAuthStore) {
      await this.pendingGoogleAuthStore.shutdown();
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
      (this.config.remote.auth.type === 'oauth2' && this.jwksVerifier !== null)
    );
  }

  getConfig(): RemoteConfig {
    return this.config;
  }

  /**
   * Log debug message if debug mode is enabled
   */
  private debugLog(message: string, data?: Record<string, unknown>): void {
    if (this.debug) {
      cliLogger.debug(data ?? {}, message);
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const origin = req.headers.origin;
    // Extract path without query parameters for routing
    const path = url.split('?')[0];

    this.debugLog(`${method} ${path}`, { origin, headers: req.headers as Record<string, unknown> });

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
    if (path === '/health' && method === 'GET') {
      this.handleHealthCheck(res);
      return;
    }

    // Google OAuth callback endpoint (no auth required - receives redirect from Google)
    if (path === '/oauth/google/callback' && method === 'GET') {
      if (this.googleOAuthCallbackHandler) {
        this.googleOAuthCallbackHandler.handleCallback(req, res).catch((error) => {
          cliLogger.error({ err: error }, 'Google OAuth callback failed');
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Internal Server Error</h1>');
        });
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Google OAuth not configured' }));
      }
      return;
    }

    // RFC 9728 — Protected Resource Metadata
    if (path === '/.well-known/oauth-protected-resource' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(JSON.stringify({
        resource: 'https://mcp.ohno.be',
        authorization_servers: ['https://mcp.ohno.be'],
        bearer_methods_supported: ['header'],
      }));
      return;
    }

    // Auth token endpoint (for JWT mode)
    if (path === '/auth/token' && method === 'POST' && this.config.remote.auth.type !== 'oauth2') {
      this.handleAuthToken(req, res);
      return;
    }

    // MCP endpoint - Streamable HTTP Transport (FR-1, FR-2, FR-3)
    if (path === '/mcp') {
      switch (method) {
        case 'GET':
          // FR-1: SSE stream establishment
          this.handleMCPGetRequest(req, res);
          return;
        case 'POST':
          // FR-2, FR-8: JSON-RPC with optional SSE response
          this.handleMCPPostRequest(req, res);
          return;
        case 'DELETE':
          // FR-3 (AC-3.5): Session termination
          this.handleMCPDeleteRequest(req, res);
          return;
        default:
          res.writeHead(405, {
            'Content-Type': 'application/json',
            'Allow': 'GET, POST, DELETE, OPTIONS',
          });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
      }
    }

    // Root path - show server info
    if ((path === '/' || path === '') && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'sage',
        version: VERSION,
        status: 'running',
        endpoints: {
          mcp: '/mcp',
          health: '/health',
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
          // Set session cookie in addition to returning token
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': createSessionCookie(result.token!),
          });
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
   * Extract token from Authorization header or Cookie
   */
  private extractToken(req: IncomingMessage): string | null {
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
      }
    }

    // Fall back to Cookie
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[SESSION_COOKIE_NAME]) {
      return cookies[SESSION_COOKIE_NAME];
    }

    return null;
  }

  /**
   * Verify authentication from request (checks Authorization header and Cookie)
   * Uses JWKS-based verification for OAuth tokens (delegated to Hydra)
   */
  private async verifyAuthentication(req: IncomingMessage): Promise<{ valid: boolean; error?: string; token?: string }> {
    const token = this.extractToken(req);

    if (!token) {
      this.debugLog('Authentication failed: No token provided');
      return { valid: false, error: 'Authentication required' };
    }

    this.debugLog('Verifying token...');

    // Verify token using JWKS (Hydra)
    if (this.jwksVerifier) {
      const result = await this.jwksVerifier.verify(token);
      if (result.valid) {
        this.debugLog('JWKS token verified successfully');
        return { valid: true, token };
      }
      // If JWKS fails and static tokens are enabled, try static token verification
      if (this.authenticator) {
        const staticResult = await this.authenticator.verifyToken(token);
        if (staticResult.valid) {
          this.debugLog('Static token verified successfully');
          return { valid: true, token };
        }
      }
      this.debugLog('Token verification failed', { error: result.error });
      return { valid: false, error: result.error };
    }

    // Fall back to JWT verification only
    if (this.authenticator) {
      const result = await this.authenticator.verifyToken(token);
      this.debugLog('JWT token verification', { valid: result.valid });
      return { valid: result.valid, error: result.error, token: result.valid ? token : undefined };
    }

    this.debugLog('No authentication configured');
    return { valid: false, error: 'No authentication configured' };
  }

  /**
   * Handle GET /mcp - SSE stream establishment
   * Requirement: FR-1
   */
  private handleMCPGetRequest(req: IncomingMessage, res: ServerResponse): void {
    if (this.isAuthEnabled()) {
      this.verifyAuthentication(req).then((result) => {
        if (!result.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Unauthorized',
            message: result.error || 'Invalid token',
          }));
          return;
        }

        if (!this.streamableHandler) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Streamable HTTP handler not initialized' }));
          return;
        }

        this.streamableHandler.handleGetRequest(req, res, result.token).catch((error) => {
          cliLogger.error({ err: error }, 'GET /mcp failed');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      }).catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token verification failed' }));
      });
    } else {
      if (!this.streamableHandler) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Streamable HTTP handler not initialized' }));
        return;
      }

      this.streamableHandler.handleGetRequest(req, res).catch((error) => {
        cliLogger.error({ err: error }, 'GET /mcp failed');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    }
  }

  /**
   * Handle POST /mcp - JSON-RPC with optional SSE response
   * Requirement: FR-2, FR-8
   */
  private handleMCPPostRequest(req: IncomingMessage, res: ServerResponse): void {
    if (this.isAuthEnabled()) {
      this.verifyAuthentication(req).then((result) => {
        if (!result.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32002,
              message: result.error || 'Invalid token',
            },
          }));
          return;
        }

        // Set session cookie for reconnection (if not already set)
        if (result.token && !req.headers.cookie?.includes(SESSION_COOKIE_NAME)) {
          res.setHeader('Set-Cookie', createSessionCookie(result.token));
        }

        if (!this.streamableHandler) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: 'Streamable HTTP handler not initialized',
            },
          }));
          return;
        }

        this.streamableHandler.handlePostRequest(req, res, result.token).catch((error) => {
          cliLogger.error({ err: error }, 'POST /mcp failed');
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32603, message: 'Internal server error' },
            }));
          }
        });
      }).catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Token verification failed' },
        }));
      });
    } else {
      if (!this.streamableHandler) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Streamable HTTP handler not initialized' },
        }));
        return;
      }

      this.streamableHandler.handlePostRequest(req, res).catch((error) => {
        cliLogger.error({ err: error }, 'POST /mcp failed');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'Internal server error' },
          }));
        }
      });
    }
  }

  /**
   * Handle DELETE /mcp - Session termination
   * Requirement: FR-3 (AC-3.5)
   */
  private handleMCPDeleteRequest(req: IncomingMessage, res: ServerResponse): void {
    if (!this.streamableHandler) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Streamable HTTP handler not initialized' }));
      return;
    }

    this.streamableHandler.handleDeleteRequest(req, res).catch((error) => {
      cliLogger.error({ err: error }, 'DELETE /mcp failed');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
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
