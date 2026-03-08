/**
 * OAuth Callback Server
 * Requirements: FR-2 (Local HTTP Callback Server)
 *
 * Temporary HTTP server to capture OAuth authorization callbacks.
 * Listens on localhost only for security.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { URL } from 'url';
import { oauthLogger } from '../utils/logger.js';

/**
 * OAuth Callback Server Options
 */
export interface OAuthCallbackServerOptions {
  /** Port to listen on (default: 3000) */
  port?: number;
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Host to bind to (default: '127.0.0.1') */
  host?: string;
}

/**
 * Result from OAuth callback
 */
export interface CallbackResult {
  success: boolean;
  code?: string;
  error?: string;
  errorDescription?: string;
  state?: string;
}

/**
 * Server state for tracking
 */
interface ServerState {
  isRunning: boolean;
  port: number | null;
  startedAt: number | null;
  callbackReceived: boolean;
}

// HTML Templates
const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>sage - Google Calendar 認証完了</title>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #f9fafb; }
    .container { max-width: 400px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .success { color: #22c55e; font-size: 48px; margin-bottom: 20px; }
    h1 { color: #111827; font-size: 24px; margin-bottom: 16px; }
    p { color: #6b7280; font-size: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">✓</div>
    <h1>認証が完了しました</h1>
    <p>このウィンドウを閉じて、Claude に戻ってください。</p>
  </div>
</body>
</html>`;

const ERROR_HTML = (error: string, description: string) => `<!DOCTYPE html>
<html>
<head>
  <title>sage - Google Calendar 認証エラー</title>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #f9fafb; }
    .container { max-width: 400px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .error { color: #ef4444; font-size: 48px; margin-bottom: 20px; }
    h1 { color: #111827; font-size: 24px; margin-bottom: 16px; }
    p { color: #6b7280; font-size: 16px; }
    .error-detail { background: #fef2f2; color: #991b1b; padding: 12px; border-radius: 8px; margin-top: 16px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error">✗</div>
    <h1>認証に失敗しました</h1>
    <p>Claude に戻って再試行してください。</p>
    <div class="error-detail">${error}: ${description}</div>
  </div>
</body>
</html>`;

/**
 * OAuth Callback Server
 *
 * Temporary HTTP server that captures OAuth authorization callbacks.
 * Binds only to localhost for security (NFR-4).
 */
export class OAuthCallbackServer extends EventEmitter {
  private server: Server | null = null;
  private state: ServerState = {
    isRunning: false,
    port: null,
    startedAt: null,
    callbackReceived: false,
  };
  private options: Required<OAuthCallbackServerOptions>;
  private callbackPromise: Promise<CallbackResult> | null = null;
  private callbackResolve: ((result: CallbackResult) => void) | null = null;
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(options?: OAuthCallbackServerOptions) {
    super();
    this.options = {
      port: options?.port ?? 3000,
      timeout: options?.timeout ?? 300000, // 5 minutes
      host: options?.host ?? '127.0.0.1',
    };
  }

  /**
   * Start the server
   *
   * Attempts to bind to the configured port, falling back to ports 3001-3010
   * if the primary port is in use.
   *
   * @returns Port number and callback URL
   * @throws Error if no port is available
   */
  async start(): Promise<{ port: number; callbackUrl: string }> {
    if (this.state.isRunning) {
      throw new Error('Server is already running');
    }

    // Try ports starting from configured port
    const portsToTry = [this.options.port];
    for (let i = 1; i <= 10; i++) {
      portsToTry.push(this.options.port + i);
    }

    let lastError: Error | null = null;

    for (const port of portsToTry) {
      try {
        await this.tryBindToPort(port);
        this.state.isRunning = true;
        this.state.port = port;
        this.state.startedAt = Date.now();
        this.state.callbackReceived = false;

        const callbackUrl = `http://${this.options.host}:${port}/oauth/callback`;
        oauthLogger.info({ port, callbackUrl }, 'OAuth callback server started');

        return { port, callbackUrl };
      } catch (error) {
        lastError = error as Error;
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
          throw error;
        }
        // Port in use, try next
        oauthLogger.debug({ port }, 'Port in use, trying next');
      }
    }

    throw new Error(
      `Failed to bind to any port (tried ${portsToTry[0]}-${portsToTry[portsToTry.length - 1]}): ${lastError?.message}`
    );
  }

  /**
   * Try to bind to a specific port
   */
  private tryBindToPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (error) => {
        reject(error);
      });

      this.server.listen(port, this.options.host, () => {
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://${this.options.host}:${this.state.port}`);

    // Only handle GET /oauth/callback
    if (req.method !== 'GET' || url.pathname !== '/oauth/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Parse callback parameters
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description') || 'Unknown error';
    const state = url.searchParams.get('state');

    let result: CallbackResult;

    if (code) {
      // Success - authorization code received
      result = {
        success: true,
        code,
        state: state || undefined,
      };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      oauthLogger.info('OAuth callback received successfully');
    } else if (error) {
      // Error from OAuth provider
      result = {
        success: false,
        error,
        errorDescription,
        state: state || undefined,
      };
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ERROR_HTML(error, errorDescription));
      oauthLogger.warn({ errorCode: error, errorDescription }, 'OAuth callback received with error');
    } else {
      // Missing required parameters
      result = {
        success: false,
        error: 'invalid_request',
        errorDescription: 'Missing code or error parameter',
      };
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ERROR_HTML('invalid_request', 'Missing code or error parameter'));
      oauthLogger.warn('OAuth callback received without code or error');
    }

    // Mark callback as received and resolve promise
    this.state.callbackReceived = true;
    this.emit('callback', result);

    if (this.callbackResolve) {
      this.callbackResolve(result);
      this.callbackResolve = null;
    }

    // Clear timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Wait for callback to be received
   *
   * Returns a promise that resolves when a callback is received
   * or rejects on timeout.
   *
   * @returns Callback result
   * @throws Error on timeout
   */
  waitForCallback(): Promise<CallbackResult> {
    if (!this.state.isRunning) {
      return Promise.reject(new Error('Server is not running'));
    }

    if (this.state.callbackReceived) {
      return Promise.reject(new Error('Callback already received'));
    }

    if (this.callbackPromise) {
      return this.callbackPromise;
    }

    this.callbackPromise = new Promise((resolve, reject) => {
      this.callbackResolve = resolve;

      // Set timeout
      this.timeoutHandle = setTimeout(() => {
        this.callbackResolve = null;
        this.callbackPromise = null;
        reject(
          new Error(
            `OAuth callback timeout after ${this.options.timeout / 1000} seconds. Please try again.`
          )
        );
        // Auto-shutdown on timeout
        this.shutdown().catch(() => {
          // Ignore shutdown errors on timeout
        });
      }, this.options.timeout);
    });

    return this.callbackPromise;
  }

  /**
   * Shutdown the server
   *
   * Closes the server and releases the port.
   */
  async shutdown(): Promise<void> {
    if (!this.server) {
      return;
    }

    // Clear timeout
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.state.isRunning = false;
        this.state.port = null;
        this.state.startedAt = null;
        this.callbackPromise = null;
        this.callbackResolve = null;
        oauthLogger.info('OAuth callback server stopped');
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Get current server state
   */
  getState(): Readonly<ServerState> {
    return { ...this.state };
  }
}
