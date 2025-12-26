/**
 * OAuth Client Store
 * Requirements: 24.1-24.8
 *
 * Manages OAuth client registration and storage for Dynamic Client Registration (RFC 7591).
 */

import { randomBytes } from 'crypto';
import {
  OAuthClient,
  ClientRegistrationRequest,
  CLAUDE_CALLBACK_URLS,
} from './types.js';

/**
 * Client Store Configuration
 */
export interface ClientStoreConfig {
  allowedRedirectUris: string[];
}

/**
 * Client Registration Result
 */
export interface ClientRegistrationResult {
  success: boolean;
  client?: OAuthClient;
  error?: string;
  errorDescription?: string;
}

/**
 * Client Store Interface
 */
export interface ClientStore {
  registerClient(request: ClientRegistrationRequest): Promise<ClientRegistrationResult>;
  getClient(clientId: string): Promise<OAuthClient | null>;
  deleteClient(clientId: string): Promise<boolean>;
  isValidRedirectUri(clientId: string, redirectUri: string): Promise<boolean>;
}

/**
 * Validate redirect URIs against allowed list
 * Requirement 24.3, 24.4, 24.5
 */
function validateRedirectUris(
  uris: string[],
  allowedUris: string[]
): { valid: boolean; error?: string } {
  if (!uris || uris.length === 0) {
    return { valid: false, error: 'redirect_uris is required' };
  }

  for (const uri of uris) {
    // Check if URI is in Claude official URLs (always allowed)
    if (CLAUDE_CALLBACK_URLS.includes(uri)) {
      continue;
    }

    // Check if URI is in allowed list
    if (!allowedUris.includes(uri) && !allowedUris.includes('*')) {
      return { valid: false, error: `redirect_uri not allowed: ${uri}` };
    }

    // Validate URI format
    try {
      const parsed = new URL(uri);
      // Require HTTPS for non-localhost URIs
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
        return { valid: false, error: `redirect_uri must use HTTPS: ${uri}` };
      }
    } catch {
      return { valid: false, error: `Invalid redirect_uri format: ${uri}` };
    }
  }

  return { valid: true };
}

/**
 * In-memory Client Store Implementation
 */
class InMemoryClientStore implements ClientStore {
  private clients: Map<string, OAuthClient> = new Map();
  private config: ClientStoreConfig;

  constructor(config: ClientStoreConfig) {
    this.config = config;
  }

  async registerClient(request: ClientRegistrationRequest): Promise<ClientRegistrationResult> {
    // Validate client_name
    if (!request.client_name || request.client_name.trim() === '') {
      return {
        success: false,
        error: 'invalid_client_metadata',
        errorDescription: 'client_name is required',
      };
    }

    // Validate redirect_uris (Requirement 24.3)
    const uriValidation = validateRedirectUris(request.redirect_uris, this.config.allowedRedirectUris);
    if (!uriValidation.valid) {
      return {
        success: false,
        error: 'invalid_redirect_uri',
        errorDescription: uriValidation.error,
      };
    }

    // Generate client_id
    const clientId = `sage_${randomBytes(16).toString('hex')}`;

    // Create client metadata
    const client: OAuthClient = {
      client_id: clientId,
      client_name: request.client_name,
      redirect_uris: request.redirect_uris,
      response_types: request.response_types || ['code'],
      grant_types: request.grant_types || ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: request.token_endpoint_auth_method || 'none',
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };

    // Store client
    this.clients.set(clientId, client);

    return { success: true, client };
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    return this.clients.get(clientId) || null;
  }

  async deleteClient(clientId: string): Promise<boolean> {
    return this.clients.delete(clientId);
  }

  async isValidRedirectUri(clientId: string, redirectUri: string): Promise<boolean> {
    const client = await this.getClient(clientId);
    if (!client) {
      return false;
    }

    // Requirement 30.5: Exact match validation
    return client.redirect_uris.includes(redirectUri);
  }
}

/**
 * Create a Client Store instance
 */
export function createClientStore(config: ClientStoreConfig): ClientStore {
  return new InMemoryClientStore(config);
}
