/**
 * HTTP Server with Remote Config Integration
 * Requirements: 15.1, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9
 *
 * Creates an HTTP server with configuration loaded from remote-config.json
 * and integrates JWT-based authentication.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { VERSION } from '../version.js';
import {
  loadRemoteConfig,
  RemoteConfig,
  DEFAULT_REMOTE_CONFIG_PATH,
} from './remote-config-loader.js';
import { createSecretAuthenticator, SecretAuthenticator } from './secret-auth.js';
import { createMCPHandler, MCPHandler, MCPRequest } from './mcp-handler.js';

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

  constructor(config: RemoteConfig, options: HTTPServerWithConfigOptions) {
    this.config = config;

    // Apply priority: CLI > Environment > Config > Default
    this.effectivePort = options.port ?? config.remote.port;
    this.effectiveHost = options.host ?? config.remote.host;

    // Setup authenticator if JWT auth is enabled or authSecret is provided
    // If authSecret is provided via CLI/env, enable JWT auth regardless of config
    const secret = options.authSecret ?? config.remote.auth.secret;
    const shouldEnableAuth = config.remote.auth.type === 'jwt' || !!options.authSecret;

    if (shouldEnableAuth && secret) {
      this.authenticator = createSecretAuthenticator({
        secret,
        expiresIn: config.remote.auth.expiresIn ?? '24h',
      });
      // Update config to reflect auth is enabled
      this.config.remote.auth.type = 'jwt';
      this.config.remote.auth.secret = secret;
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Initialize MCP handler
    this.mcpHandler = await createMCPHandler();

    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.handleRequest.bind(this));

        this.server.listen(this.effectivePort, this.effectiveHost, () => {
          this.running = true;
          this.startTime = new Date();
          console.error(`[sage] Server started on ${this.effectiveHost}:${this.effectivePort}`);
          console.error(`[sage] Auth enabled: ${this.isAuthEnabled()}`);
          console.error(`[sage] CORS origins: ${this.config.remote.cors.allowedOrigins.join(', ')}`);
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
    return this.config.remote.auth.type === 'jwt' && this.authenticator !== null;
  }

  getConfig(): RemoteConfig {
    return this.config;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const origin = req.headers.origin;
    const clientIP = req.socket.remoteAddress;

    // Debug log
    console.error(`[sage] ${new Date().toISOString()} ${method} ${url} from ${clientIP}`);

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

    // Auth token endpoint
    if (url === '/auth/token' && method === 'POST') {
      this.handleAuthToken(req, res);
      return;
    }

    // MCP endpoint (auth required if enabled)
    if (url === '/mcp' && method === 'POST') {
      console.error(`[sage] MCP endpoint hit, authEnabled: ${this.isAuthEnabled()}`);
      this.handleMCPRequest(req, res);
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

  private handleMCPRequest(req: IncomingMessage, res: ServerResponse): void {
    // Check authentication if enabled
    if (this.isAuthEnabled()) {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32002,
              message: 'Authentication required',
            },
          })
        );
        return;
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32002,
              message: 'Invalid Authorization header',
            },
          })
        );
        return;
      }

      const token = parts[1];

      // Verify token synchronously for simplicity
      this.authenticator!.verifyToken(token).then((verifyResult) => {
        if (!verifyResult.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32003,
                message: verifyResult.error || 'Invalid token',
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
      console.error(`[sage] MCP request body: ${body.substring(0, 500)}`);

      try {
        const request = this.parseJSONRPCRequest(body);
        console.error(`[sage] MCP method: ${request.method}, id: ${request.id}`);

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
        console.error(`[sage] MCP response id: ${response.id}, hasError: ${!!response.error}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[sage] MCP error: ${errorMessage}`);
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
