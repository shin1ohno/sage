/**
 * OAuth 2.1 Type Definitions
 * Requirements: 21.1-21.6, 22.1-22.5, 23.1-23.9, 24.1-24.8, 25.1-25.10, 26.1-26.9
 *
 * Type definitions for OAuth 2.1 implementation based on:
 * - OAuth 2.1 (draft-ietf-oauth-v2-1-13)
 * - RFC 8414 (Authorization Server Metadata)
 * - RFC 7591 (Dynamic Client Registration)
 * - RFC 9728 (Protected Resource Metadata)
 * - RFC 8707 (Resource Indicators)
 * - RFC 7636 (PKCE)
 */

/**
 * Supported OAuth scopes
 * Requirement 22.2
 */
export type OAuthScope = 'mcp:read' | 'mcp:write' | 'mcp:admin';

/**
 * Supported response types
 * Requirement 23.6
 */
export type ResponseType = 'code';

/**
 * Supported grant types
 * Requirement 23.7
 */
export type GrantType = 'authorization_code' | 'refresh_token';

/**
 * Supported code challenge methods
 * Requirement 21.2, 23.8
 */
export type CodeChallengeMethod = 'S256';

/**
 * Supported token endpoint auth methods
 * Requirement 23.9
 */
export type TokenEndpointAuthMethod = 'none' | 'client_secret_post';

/**
 * OAuth Client Registration Request (RFC 7591)
 * Requirement 24.1-24.7
 */
export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris: string[];
  response_types?: ResponseType[];
  grant_types?: GrantType[];
  token_endpoint_auth_method?: TokenEndpointAuthMethod;
  scope?: string;
  contacts?: string[];
  logo_uri?: string;
  client_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
}

/**
 * OAuth Client Metadata (RFC 7591)
 * Requirement 24.6
 */
export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  response_types: ResponseType[];
  grant_types: GrantType[];
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  client_id_issued_at: number;
  client_secret?: string;
  client_secret_expires_at?: number;
  scope?: string;
}

/**
 * Authorization Request Parameters
 * Requirement 25.1-25.10
 */
export interface AuthorizationRequest {
  response_type: ResponseType;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state: string;
  code_challenge: string;
  code_challenge_method: CodeChallengeMethod;
  resource?: string;
}

/**
 * Authorization Code Data (internal)
 * Requirement 25.9, 25.10
 */
export interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: CodeChallengeMethod;
  resource?: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  used: boolean;
}

/**
 * Token Request for authorization_code grant
 * Requirement 26.1-26.5
 */
export interface TokenRequestAuthorizationCode {
  grant_type: 'authorization_code';
  code: string;
  client_id: string;
  redirect_uri: string;
  code_verifier: string;
  resource?: string;
}

/**
 * Token Request for refresh_token grant
 * Requirement 26.3
 */
export interface TokenRequestRefreshToken {
  grant_type: 'refresh_token';
  refresh_token: string;
  client_id: string;
  scope?: string;
}

/**
 * Token Request (union type)
 */
export type TokenRequest = TokenRequestAuthorizationCode | TokenRequestRefreshToken;

/**
 * Token Response
 * Requirement 26.7
 */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Access Token Claims (JWT payload)
 * Requirement 26.6, 27.4
 */
export interface AccessTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
  client_id: string;
  scope: string;
}

/**
 * Refresh Token Data (internal)
 * Requirement 21.6, 26.8
 */
export interface RefreshToken {
  token: string;
  client_id: string;
  user_id: string;
  scope: string;
  created_at: number;
  expires_at: number;
  rotated: boolean;
}

/**
 * Protected Resource Metadata (RFC 9728)
 * Requirement 22.1-22.3
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
}

/**
 * Authorization Server Metadata (RFC 8414)
 * Requirement 23.1-23.9
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: ResponseType[];
  response_modes_supported?: string[];
  grant_types_supported: GrantType[];
  token_endpoint_auth_methods_supported: TokenEndpointAuthMethod[];
  code_challenge_methods_supported: CodeChallengeMethod[];
  service_documentation?: string;
}

/**
 * OAuth Error Response
 */
export interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

/**
 * OAuth Error Codes
 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'unauthorized_client'
  | 'access_denied'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unsupported_grant_type'
  | 'invalid_token'
  | 'insufficient_scope';

/**
 * User for authentication
 * Requirement 29.1-29.4
 */
export interface OAuthUser {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

/**
 * User Session
 */
export interface UserSession {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * OAuth Configuration
 */
export interface OAuthConfig {
  issuer: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  authorizationCodeExpiry: string;
  allowedRedirectUris: string[];
  scopes: Record<OAuthScope, string>;
  users: OAuthUser[];
  privateKey?: string;
  publicKey?: string;
}

/**
 * Scope definitions with descriptions
 */
export const SCOPE_DEFINITIONS: Record<OAuthScope, string> = {
  'mcp:read': '読み取り専用アクセス',
  'mcp:write': '読み書きアクセス',
  'mcp:admin': '管理者アクセス',
};

/**
 * Claude official callback URLs
 * Requirement 24.4, 24.5, 31.1, 31.2
 */
export const CLAUDE_CALLBACK_URLS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

/**
 * Default token expiry durations
 */
export const DEFAULT_TOKEN_EXPIRY = {
  accessToken: '1h',
  refreshToken: '30d',
  authorizationCode: '10m',
};

/**
 * Verify Token Result
 */
export interface VerifyTokenResult {
  valid: boolean;
  claims?: AccessTokenClaims;
  error?: string;
}
