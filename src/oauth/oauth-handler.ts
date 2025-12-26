/**
 * OAuth HTTP Handler
 * Requirements: 22-31 (OAuth 2.1 HTTP Endpoints)
 *
 * Handles OAuth HTTP endpoints including metadata, DCR, authorization, and token endpoints.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { randomBytes } from 'crypto';
import { OAuthServer, OAuthServerConfig } from './oauth-server.js';
import { AuthorizationRequest, ClientRegistrationRequest } from './types.js';

/**
 * OAuth Handler Configuration
 */
export interface OAuthHandlerConfig extends OAuthServerConfig {
  // Additional handler-specific config if needed
}

/**
 * Parse URL-encoded form data
 */
function parseFormData(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = body.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  return params;
}

/**
 * Parse query string from URL
 */
function parseQueryString(url: string): Record<string, string> {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return {};
  return parseFormData(url.slice(queryStart + 1));
}

/**
 * Get cookie value
 */
function getCookie(req: IncomingMessage, name: string): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;

  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Set cookie header
 */
function setCookie(res: ServerResponse, name: string, value: string, options: {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  maxAge?: number;
  path?: string;
} = {}): void {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);

  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * OAuth Handler Class
 */
export class OAuthHandler {
  private server: OAuthServer;

  constructor(server: OAuthServer, _config: OAuthHandlerConfig) {
    this.server = server;
    // Config reserved for future use (e.g., custom templates)
  }

  /**
   * Handle an HTTP request
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const path = url.split('?')[0];

    // Protected Resource Metadata (RFC 9728)
    if (path === '/.well-known/oauth-protected-resource' && method === 'GET') {
      this.handleProtectedResourceMetadata(res);
      return true;
    }

    // Authorization Server Metadata (RFC 8414)
    if (path === '/.well-known/oauth-authorization-server' && method === 'GET') {
      this.handleAuthorizationServerMetadata(res);
      return true;
    }

    // Dynamic Client Registration
    if (path === '/oauth/register' && method === 'POST') {
      await this.handleClientRegistration(req, res);
      return true;
    }

    // Authorization Endpoint
    if (path === '/oauth/authorize' && method === 'GET') {
      await this.handleAuthorization(req, res);
      return true;
    }

    // Authorization Consent Submit
    if (path === '/oauth/authorize' && method === 'POST') {
      await this.handleAuthorizationSubmit(req, res);
      return true;
    }

    // Login Page
    if (path === '/oauth/login' && method === 'GET') {
      await this.handleLoginPage(req, res);
      return true;
    }

    // Login Submit
    if (path === '/oauth/login' && method === 'POST') {
      await this.handleLoginSubmit(req, res);
      return true;
    }

    // Token Endpoint
    if (path === '/oauth/token' && method === 'POST') {
      await this.handleToken(req, res);
      return true;
    }

    return false;
  }

  /**
   * Handle Protected Resource Metadata (RFC 9728)
   * Requirement 22.1-22.3
   */
  private handleProtectedResourceMetadata(res: ServerResponse): void {
    const metadata = this.server.getProtectedResourceMetadata();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metadata));
  }

  /**
   * Handle Authorization Server Metadata (RFC 8414)
   * Requirement 23.1-23.9
   */
  private handleAuthorizationServerMetadata(res: ServerResponse): void {
    const metadata = this.server.getAuthorizationServerMetadata();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metadata));
  }

  /**
   * Handle Dynamic Client Registration (RFC 7591)
   * Requirement 24.1-24.8
   */
  private async handleClientRegistration(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);

    let request: ClientRegistrationRequest;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_client_metadata',
        error_description: 'Invalid JSON body',
      }));
      return;
    }

    const result = await this.server.registerClient(request);

    if (result.success && result.client) {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.client));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: result.error,
        error_description: result.errorDescription,
      }));
    }
  }

  /**
   * Handle Authorization Endpoint (GET)
   * Requirement 25.1-25.10
   */
  private async handleAuthorization(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const query = parseQueryString(req.url || '');

    const authRequest: AuthorizationRequest = {
      response_type: query.response_type as 'code',
      client_id: query.client_id || '',
      redirect_uri: query.redirect_uri || '',
      scope: query.scope || '',
      state: query.state || '',
      code_challenge: query.code_challenge || '',
      code_challenge_method: (query.code_challenge_method || 'S256') as 'S256',
      resource: query.resource,
    };

    // Validate request
    const validation = await this.server.validateAuthorizationRequest(authRequest);

    if (!validation.valid) {
      // If we can redirect (redirect_uri is valid), redirect with error
      if (authRequest.redirect_uri && validation.error) {
        const errorUrl = new URL(authRequest.redirect_uri);
        errorUrl.searchParams.set('error', validation.error.error);
        if (validation.error.error_description) {
          errorUrl.searchParams.set('error_description', validation.error.error_description);
        }
        if (authRequest.state) {
          errorUrl.searchParams.set('state', authRequest.state);
        }
        res.writeHead(302, { Location: errorUrl.toString() });
        res.end();
        return;
      }

      // Otherwise, show error page
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderErrorPage(
        validation.error?.error || 'invalid_request',
        validation.error?.error_description || 'Invalid authorization request'
      ));
      return;
    }

    // Check if user is logged in
    const sessionId = getCookie(req, 'sage_session');
    const session = sessionId ? this.server.validateSession(sessionId) : null;

    if (!session) {
      // Store pending auth request and redirect to login
      const requestId = randomBytes(16).toString('hex');
      this.server.storePendingAuthRequest(requestId, authRequest, validation.client!);

      setCookie(res, 'sage_auth_request', requestId, {
        httpOnly: true,
        secure: false, // Allow HTTP for reverse proxy setups
        sameSite: 'Lax',
        maxAge: 600, // 10 minutes
        path: '/',
      });

      res.writeHead(302, { Location: '/oauth/login' });
      res.end();
      return;
    }

    // User is logged in, show consent page
    const requestId = randomBytes(16).toString('hex');
    this.server.storePendingAuthRequest(requestId, authRequest, validation.client!);

    setCookie(res, 'sage_auth_request', requestId, {
      httpOnly: true,
      secure: false, // Allow HTTP for reverse proxy setups
      sameSite: 'Lax',
      maxAge: 600,
      path: '/',
    });

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(this.renderConsentPage(
      validation.client!.client_name,
      this.server.getScopeDescriptions(authRequest.scope || 'mcp:read')
    ));
  }

  /**
   * Handle Authorization Submit (POST)
   * Requirement 25.9, 25.10, 28.4, 28.5
   */
  private async handleAuthorizationSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const params = parseFormData(body);
    const approved = params.approve === 'true';

    const requestId = getCookie(req, 'sage_auth_request');
    if (!requestId) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderErrorPage('invalid_request', 'Authorization request expired'));
      return;
    }

    const pending = this.server.getPendingAuthRequest(requestId);
    if (!pending) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderErrorPage('invalid_request', 'Authorization request expired'));
      return;
    }

    const sessionId = getCookie(req, 'sage_session');
    const session = sessionId ? this.server.validateSession(sessionId) : null;

    if (!session) {
      res.writeHead(302, { Location: '/oauth/login' });
      res.end();
      return;
    }

    const redirectUrl = new URL(pending.request.redirect_uri);

    if (!approved) {
      // Requirement 28.5: Denied authorization
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set('error_description', 'User denied the request');
      if (pending.request.state) {
        redirectUrl.searchParams.set('state', pending.request.state);
      }
      res.writeHead(302, { Location: redirectUrl.toString() });
      res.end();
      return;
    }

    // Complete authorization
    const code = await this.server.completeAuthorization(pending.request, session.userId);

    redirectUrl.searchParams.set('code', code);
    if (pending.request.state) {
      redirectUrl.searchParams.set('state', pending.request.state);
    }

    res.writeHead(302, { Location: redirectUrl.toString() });
    res.end();
  }

  /**
   * Handle Login Page (GET)
   * Requirement 29.1
   */
  private async handleLoginPage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const error = parseQueryString(req.url || '').error;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(this.renderLoginPage(error));
  }

  /**
   * Handle Login Submit (POST)
   * Requirement 29.1-29.5
   */
  private async handleLoginSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const params = parseFormData(body);

    const result = await this.server.authenticateUser(params.username || '', params.password || '');

    if (!result.success) {
      res.writeHead(302, { Location: `/oauth/login?error=${encodeURIComponent(result.error || 'Login failed')}` });
      res.end();
      return;
    }

    // Set session cookie
    setCookie(res, 'sage_session', result.session!.sessionId, {
      httpOnly: true,
      secure: false, // Allow HTTP for reverse proxy setups
      sameSite: 'Lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    // Check for pending auth request
    const requestId = getCookie(req, 'sage_auth_request');
    if (requestId) {
      const pending = this.server.getPendingAuthRequest(requestId);
      if (pending) {
        // Show consent page
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderConsentPage(
          pending.client.client_name,
          this.server.getScopeDescriptions(pending.request.scope || 'mcp:read')
        ));
        return;
      }
    }

    // No pending request, redirect to home
    res.writeHead(302, { Location: '/' });
    res.end();
  }

  /**
   * Handle Token Endpoint (POST)
   * Requirement 26.1-26.9
   */
  private async handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const params = parseFormData(body);

    const grantType = params.grant_type;

    if (grantType === 'authorization_code') {
      await this.handleAuthorizationCodeGrant(params, res);
    } else if (grantType === 'refresh_token') {
      await this.handleRefreshTokenGrant(params, res);
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token grants are supported',
      }));
    }
  }

  /**
   * Handle authorization_code grant
   * Requirement 26.2, 26.4, 26.5
   */
  private async handleAuthorizationCodeGrant(
    params: Record<string, string>,
    res: ServerResponse
  ): Promise<void> {
    const { code, client_id, redirect_uri, code_verifier, resource } = params;

    if (!code || !client_id || !redirect_uri || !code_verifier) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      }));
      return;
    }

    // Check if client exists (Requirement 26.9)
    const client = await this.server.getClient(client_id);
    if (!client) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_client',
        error_description: 'Unknown client_id',
      }));
      return;
    }

    const result = await this.server.exchangeAuthorizationCode(
      code,
      client_id,
      redirect_uri,
      code_verifier,
      resource
    );

    if (result.success && result.tokens) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      });
      res.end(JSON.stringify(result.tokens));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.error));
    }
  }

  /**
   * Handle refresh_token grant
   * Requirement 26.3, 26.8
   */
  private async handleRefreshTokenGrant(
    params: Record<string, string>,
    res: ServerResponse
  ): Promise<void> {
    const { refresh_token, client_id, scope } = params;

    if (!refresh_token || !client_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      }));
      return;
    }

    // Check if client exists (Requirement 26.9)
    const client = await this.server.getClient(client_id);
    if (!client) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'invalid_client',
        error_description: 'Unknown client_id',
      }));
      return;
    }

    const result = await this.server.exchangeRefreshToken(refresh_token, client_id, scope);

    if (result.success && result.tokens) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      });
      res.end(JSON.stringify(result.tokens));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.error));
    }
  }

  /**
   * Read request body
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Render login page HTML
   * Requirement 29.1
   */
  private renderLoginPage(error?: string): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sage ログイン</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    h1 { text-align: center; margin-bottom: 1.5rem; color: #333; }
    .error { background: #fee; color: #c00; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; color: #666; }
    input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
    input:focus { outline: none; border-color: #007bff; }
    button { width: 100%; padding: 0.75rem; background: #007bff; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #0056b3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>sage ログイン</h1>
    ${error ? `<div class="error">${this.escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/oauth/login">
      <div class="form-group">
        <label for="username">ユーザー名</label>
        <input type="text" id="username" name="username" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="password">パスワード</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <button type="submit">ログイン</button>
    </form>
  </div>
</body>
</html>`;
  }

  /**
   * Render consent page HTML
   * Requirement 28.1-28.4
   */
  private renderConsentPage(
    clientName: string,
    scopes: Array<{ scope: string; description: string }>
  ): string {
    const scopeList = scopes.map(s =>
      `<li><strong>${this.escapeHtml(s.scope)}</strong>: ${this.escapeHtml(s.description)}</li>`
    ).join('\n');

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sage 認可リクエスト</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 450px; }
    h1 { text-align: center; margin-bottom: 1rem; color: #333; font-size: 1.5rem; }
    .client-name { text-align: center; font-size: 1.2rem; color: #007bff; margin-bottom: 1.5rem; }
    p { margin-bottom: 1rem; color: #666; }
    ul { margin: 1rem 0 1.5rem 1.5rem; }
    li { margin-bottom: 0.5rem; }
    .buttons { display: flex; gap: 1rem; }
    button { flex: 1; padding: 0.75rem; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
    .approve { background: #28a745; color: white; }
    .approve:hover { background: #218838; }
    .deny { background: #dc3545; color: white; }
    .deny:hover { background: #c82333; }
  </style>
</head>
<body>
  <div class="container">
    <h1>sage 認可リクエスト</h1>
    <div class="client-name">${this.escapeHtml(clientName)}</div>
    <p>上記のアプリケーションがあなたの sage アカウントへのアクセスを要求しています。</p>
    <p><strong>要求されている権限:</strong></p>
    <ul>${scopeList}</ul>
    <form method="POST" action="/oauth/authorize">
      <div class="buttons">
        <button type="submit" name="approve" value="true" class="approve">許可</button>
        <button type="submit" name="approve" value="false" class="deny">拒否</button>
      </div>
    </form>
  </div>
</body>
</html>`;
  }

  /**
   * Render error page HTML
   */
  private renderErrorPage(error: string, description: string): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sage エラー</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
    h1 { color: #dc3545; margin-bottom: 1rem; }
    .error-code { background: #f8f9fa; padding: 0.5rem 1rem; border-radius: 4px; font-family: monospace; margin-bottom: 1rem; display: inline-block; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>エラー</h1>
    <div class="error-code">${this.escapeHtml(error)}</div>
    <p>${this.escapeHtml(description)}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/**
 * Create an OAuth Handler instance
 */
export async function createOAuthHandler(config: OAuthHandlerConfig): Promise<OAuthHandler> {
  const server = new OAuthServer(config);
  await server.initialize();
  return new OAuthHandler(server, config);
}
