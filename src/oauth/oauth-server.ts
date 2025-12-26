/**
 * OAuth 2.1 Server
 * Requirements: 21-31 (OAuth 2.1 Authentication)
 *
 * Main OAuth server that coordinates all OAuth components and handles requests.
 */

import { randomBytes, createHash } from 'crypto';
import {
  AuthorizationServerMetadata,
  ProtectedResourceMetadata,
  AuthorizationRequest,
  TokenResponse,
  OAuthError,
  OAuthClient,
  ClientRegistrationRequest,
  VerifyTokenResult,
  OAuthUser,
  UserSession,
  SCOPE_DEFINITIONS,
  DEFAULT_TOKEN_EXPIRY,
  CLAUDE_CALLBACK_URLS,
} from './types.js';
import { createTokenService, TokenService, generateKeyPair } from './token-service.js';
import { createAuthorizationCodeStore, AuthorizationCodeStore } from './code-store.js';
import { createRefreshTokenStore, RefreshTokenStore } from './refresh-token-store.js';
import { createClientStore, ClientStore, ClientRegistrationResult } from './client-store.js';
import { verifyCodeChallenge } from './pkce.js';

/**
 * OAuth Server Configuration
 */
export interface OAuthServerConfig {
  issuer: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
  authorizationCodeExpiry?: string;
  allowedRedirectUris?: string[];
  users?: OAuthUser[];
  privateKey?: string;
  publicKey?: string;
}

/**
 * Session Store Interface
 */
interface SessionStore {
  createSession(userId: string): UserSession;
  getSession(sessionId: string): UserSession | null;
  deleteSession(sessionId: string): void;
}

/**
 * In-memory Session Store
 */
class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, UserSession> = new Map();
  private sessionExpiryMs = 24 * 60 * 60 * 1000; // 24 hours

  createSession(userId: string): UserSession {
    const sessionId = randomBytes(32).toString('hex');
    const now = Date.now();
    const session: UserSession = {
      sessionId,
      userId,
      createdAt: now,
      expiresAt: now + this.sessionExpiryMs,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

/**
 * Authorization Pending Request (stored during consent flow)
 */
interface PendingAuthRequest {
  request: AuthorizationRequest;
  client: OAuthClient;
  createdAt: number;
}

/**
 * OAuth Server Class
 */
export class OAuthServer {
  private config: OAuthServerConfig;
  private tokenService: TokenService;
  private codeStore: AuthorizationCodeStore;
  private refreshTokenStore: RefreshTokenStore;
  private clientStore: ClientStore;
  private sessionStore: SessionStore;
  private users: Map<string, OAuthUser>;
  private pendingAuthRequests: Map<string, PendingAuthRequest> = new Map();
  private loginAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();

  private privateKey: string;
  private publicKey: string;

  constructor(config: OAuthServerConfig, keys?: { privateKey: string; publicKey: string }) {
    this.config = config;
    this.privateKey = keys?.privateKey || '';
    this.publicKey = keys?.publicKey || '';

    // Parse expiry durations to seconds
    const refreshTokenExpirySec = this.parseExpiryToSeconds(
      config.refreshTokenExpiry || DEFAULT_TOKEN_EXPIRY.refreshToken
    );
    const authCodeExpirySec = this.parseExpiryToSeconds(
      config.authorizationCodeExpiry || DEFAULT_TOKEN_EXPIRY.authorizationCode
    );

    // Initialize stores
    this.codeStore = createAuthorizationCodeStore({ expirySeconds: authCodeExpirySec });
    this.refreshTokenStore = createRefreshTokenStore({ expirySeconds: refreshTokenExpirySec });
    this.clientStore = createClientStore({
      allowedRedirectUris: [...(config.allowedRedirectUris || []), ...CLAUDE_CALLBACK_URLS],
    });
    this.sessionStore = new InMemorySessionStore();

    // Initialize token service (will be updated when keys are available)
    this.tokenService = createTokenService({
      issuer: config.issuer,
      privateKey: this.privateKey,
      publicKey: this.publicKey,
      accessTokenExpiry: config.accessTokenExpiry || DEFAULT_TOKEN_EXPIRY.accessToken,
    });

    // Store users
    this.users = new Map();
    for (const user of config.users || []) {
      this.users.set(user.username, user);
    }
  }

  /**
   * Initialize the server with generated keys if not provided
   */
  async initialize(): Promise<void> {
    if (!this.privateKey || !this.publicKey) {
      const keys = await generateKeyPair();
      this.privateKey = keys.privateKey;
      this.publicKey = keys.publicKey;

      // Recreate token service with new keys
      this.tokenService = createTokenService({
        issuer: this.config.issuer,
        privateKey: this.privateKey,
        publicKey: this.publicKey,
        accessTokenExpiry: this.config.accessTokenExpiry || DEFAULT_TOKEN_EXPIRY.accessToken,
      });
    }
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhdw])$/);
    if (!match) return 3600;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      case 'w': return value * 604800;
      default: return 3600;
    }
  }

  /**
   * Get Protected Resource Metadata (RFC 9728)
   * Requirement 22.1-22.3
   */
  getProtectedResourceMetadata(): ProtectedResourceMetadata {
    return {
      resource: this.config.issuer,
      authorization_servers: [this.config.issuer],
      scopes_supported: Object.keys(SCOPE_DEFINITIONS),
      bearer_methods_supported: ['header'],
    };
  }

  /**
   * Get Authorization Server Metadata (RFC 8414)
   * Requirement 23.1-23.9
   */
  getAuthorizationServerMetadata(): AuthorizationServerMetadata {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.issuer}/oauth/authorize`,
      token_endpoint: `${this.config.issuer}/oauth/token`,
      registration_endpoint: `${this.config.issuer}/oauth/register`,
      scopes_supported: Object.keys(SCOPE_DEFINITIONS),
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      service_documentation: 'https://github.com/shin1ohno/sage',
    };
  }

  /**
   * Get WWW-Authenticate header for 401 responses
   * Requirement 22.4, 22.5
   */
  getWWWAuthenticateHeader(): string {
    return `Bearer realm="sage", resource_metadata="${this.config.issuer}/.well-known/oauth-protected-resource"`;
  }

  /**
   * Register a new client (Dynamic Client Registration)
   * Requirement 24.1-24.7
   */
  async registerClient(request: ClientRegistrationRequest): Promise<ClientRegistrationResult> {
    return this.clientStore.registerClient(request);
  }

  /**
   * Get a registered client
   */
  async getClient(clientId: string): Promise<OAuthClient | null> {
    return this.clientStore.getClient(clientId);
  }

  /**
   * Delete a client (Requirement 24.8)
   */
  async deleteClient(clientId: string): Promise<boolean> {
    // Also revoke all refresh tokens for this client
    await this.refreshTokenStore.revokeAllForClient(clientId);
    return this.clientStore.deleteClient(clientId);
  }

  /**
   * Validate an authorization request
   * Requirement 25.1-25.8
   */
  async validateAuthorizationRequest(request: AuthorizationRequest): Promise<{
    valid: boolean;
    error?: OAuthError;
    client?: OAuthClient;
  }> {
    // Requirement 25.2: Only support response_type=code
    if (request.response_type !== 'code') {
      return {
        valid: false,
        error: {
          error: 'unsupported_response_type',
          error_description: 'Only response_type=code is supported',
          state: request.state,
        },
      };
    }

    // Requirement 25.3: client_id is required
    const client = await this.clientStore.getClient(request.client_id);
    if (!client) {
      return {
        valid: false,
        error: {
          error: 'invalid_client',
          error_description: 'Unknown client_id',
          state: request.state,
        },
      };
    }

    // Requirement 25.4: Validate redirect_uri
    if (!await this.clientStore.isValidRedirectUri(request.client_id, request.redirect_uri)) {
      return {
        valid: false,
        error: {
          error: 'invalid_request',
          error_description: 'Invalid redirect_uri',
          state: request.state,
        },
      };
    }

    // Requirement 25.5, 25.6: PKCE is required, only S256
    if (!request.code_challenge) {
      return {
        valid: false,
        error: {
          error: 'invalid_request',
          error_description: 'code_challenge is required',
          state: request.state,
        },
      };
    }

    if (request.code_challenge_method !== 'S256') {
      return {
        valid: false,
        error: {
          error: 'invalid_request',
          error_description: 'Only code_challenge_method=S256 is supported',
          state: request.state,
        },
      };
    }

    // Requirement 25.7: state is required
    if (!request.state) {
      return {
        valid: false,
        error: {
          error: 'invalid_request',
          error_description: 'state is required',
        },
      };
    }

    return { valid: true, client };
  }

  /**
   * Store a pending authorization request (for consent flow)
   */
  storePendingAuthRequest(requestId: string, request: AuthorizationRequest, client: OAuthClient): void {
    this.pendingAuthRequests.set(requestId, {
      request,
      client,
      createdAt: Date.now(),
    });

    // Cleanup old requests (older than 10 minutes)
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, pending] of this.pendingAuthRequests.entries()) {
      if (pending.createdAt < cutoff) {
        this.pendingAuthRequests.delete(id);
      }
    }
  }

  /**
   * Get a pending authorization request
   */
  getPendingAuthRequest(requestId: string): PendingAuthRequest | null {
    return this.pendingAuthRequests.get(requestId) || null;
  }

  /**
   * Complete authorization and generate code
   * Requirement 25.9, 25.10
   */
  async completeAuthorization(
    request: AuthorizationRequest,
    userId: string
  ): Promise<string> {
    const code = await this.codeStore.generateCode({
      clientId: request.client_id,
      redirectUri: request.redirect_uri,
      scope: request.scope || '',
      codeChallenge: request.code_challenge,
      codeChallengeMethod: request.code_challenge_method,
      userId,
      resource: request.resource,
    });

    return code;
  }

  /**
   * Exchange authorization code for tokens
   * Requirement 26.1-26.7
   */
  async exchangeAuthorizationCode(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier: string,
    resource?: string
  ): Promise<{ success: boolean; tokens?: TokenResponse; error?: OAuthError }> {
    // Consume code (marks it as used)
    const codeResult = await this.codeStore.consumeCode(code, clientId);

    if (!codeResult.valid || !codeResult.codeData) {
      return {
        success: false,
        error: {
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        },
      };
    }

    // Verify redirect_uri matches
    if (codeResult.codeData.redirect_uri !== redirectUri) {
      return {
        success: false,
        error: {
          error: 'invalid_grant',
          error_description: 'redirect_uri does not match',
        },
      };
    }

    // Verify PKCE code_verifier (Requirement 26.4)
    if (!verifyCodeChallenge(codeVerifier, codeResult.codeData.code_challenge, 'S256')) {
      return {
        success: false,
        error: {
          error: 'invalid_grant',
          error_description: 'Invalid code_verifier',
        },
      };
    }

    // Verify resource if specified (Requirement 26.5)
    if (resource && codeResult.codeData.resource && resource !== codeResult.codeData.resource) {
      return {
        success: false,
        error: {
          error: 'invalid_grant',
          error_description: 'resource does not match',
        },
      };
    }

    // Generate access token
    const accessTokenResponse = await this.tokenService.generateAccessToken({
      clientId,
      userId: codeResult.codeData.user_id,
      scope: codeResult.codeData.scope,
      audience: resource || this.config.issuer,
    });

    // Generate refresh token (Requirement 21.6)
    const refreshToken = await this.refreshTokenStore.generateToken({
      clientId,
      userId: codeResult.codeData.user_id,
      scope: codeResult.codeData.scope,
    });

    return {
      success: true,
      tokens: {
        ...accessTokenResponse,
        refresh_token: refreshToken,
      },
    };
  }

  /**
   * Exchange refresh token for new tokens
   * Requirement 26.3, 26.8
   */
  async exchangeRefreshToken(
    refreshToken: string,
    clientId: string,
    scope?: string
  ): Promise<{ success: boolean; tokens?: TokenResponse; error?: OAuthError }> {
    // Rotate refresh token (Requirement 26.8)
    const newRefreshToken = await this.refreshTokenStore.rotateToken(refreshToken, clientId);

    if (!newRefreshToken) {
      return {
        success: false,
        error: {
          error: 'invalid_grant',
          error_description: 'Invalid or expired refresh token',
        },
      };
    }

    // Get the original token data before it was rotated
    const tokenResult = await this.refreshTokenStore.validateToken(newRefreshToken, clientId);

    if (!tokenResult.valid || !tokenResult.tokenData) {
      return {
        success: false,
        error: {
          error: 'invalid_grant',
          error_description: 'Invalid refresh token',
        },
      };
    }

    // Use requested scope or original scope
    const effectiveScope = scope || tokenResult.tokenData.scope;

    // Generate new access token
    const accessTokenResponse = await this.tokenService.generateAccessToken({
      clientId,
      userId: tokenResult.tokenData.user_id,
      scope: effectiveScope,
      audience: this.config.issuer,
    });

    return {
      success: true,
      tokens: {
        ...accessTokenResponse,
        refresh_token: newRefreshToken,
      },
    };
  }

  /**
   * Verify an access token
   * Requirement 27.1-27.5
   */
  async verifyAccessToken(token: string, expectedAudience?: string): Promise<VerifyTokenResult> {
    return this.tokenService.verifyAccessToken(token, expectedAudience);
  }

  /**
   * Extract token from Authorization header
   * Requirement 27.1
   */
  extractTokenFromHeader(header: string | undefined): string | null {
    return this.tokenService.extractTokenFromHeader(header);
  }

  /**
   * Authenticate a user (Requirement 29.1-29.5)
   */
  async authenticateUser(
    username: string,
    password: string
  ): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    // Rate limiting (Requirement 29.5)
    const key = username;
    const attempts = this.loginAttempts.get(key) || { count: 0, lastAttempt: 0 };

    // Reset attempts after 15 minutes
    if (Date.now() - attempts.lastAttempt > 15 * 60 * 1000) {
      attempts.count = 0;
    }

    if (attempts.count >= 5) {
      return { success: false, error: 'Too many login attempts. Please try again later.' };
    }

    const user = this.users.get(username);
    if (!user) {
      attempts.count++;
      attempts.lastAttempt = Date.now();
      this.loginAttempts.set(key, attempts);
      return { success: false, error: 'Invalid username or password' };
    }

    // Verify password (Requirement 29.4: passwords should be hashed)
    // For simplicity, we'll compare against the stored hash
    // In production, use bcrypt or similar
    const passwordHash = createHash('sha256').update(password).digest('hex');
    if (passwordHash !== user.passwordHash) {
      attempts.count++;
      attempts.lastAttempt = Date.now();
      this.loginAttempts.set(key, attempts);
      return { success: false, error: 'Invalid username or password' };
    }

    // Reset login attempts on success
    this.loginAttempts.delete(key);

    // Create session
    const session = this.sessionStore.createSession(user.id);

    return { success: true, session };
  }

  /**
   * Validate a session
   */
  validateSession(sessionId: string): UserSession | null {
    return this.sessionStore.getSession(sessionId);
  }

  /**
   * Logout user
   */
  logout(sessionId: string): void {
    this.sessionStore.deleteSession(sessionId);
  }

  /**
   * Check if a scope includes another scope
   */
  hasScope(tokenScope: string, requiredScope: string): boolean {
    const tokenScopes = tokenScope.split(' ');
    return tokenScopes.includes(requiredScope);
  }

  /**
   * Get scope descriptions for consent UI
   */
  getScopeDescriptions(scopes: string): Array<{ scope: string; description: string }> {
    return scopes.split(' ').filter(s => s in SCOPE_DEFINITIONS).map(scope => ({
      scope,
      description: SCOPE_DEFINITIONS[scope as keyof typeof SCOPE_DEFINITIONS],
    }));
  }
}

/**
 * Create an OAuth Server instance
 */
export async function createOAuthServer(
  config: OAuthServerConfig
): Promise<OAuthServer> {
  const server = new OAuthServer(config);
  await server.initialize();
  return server;
}
