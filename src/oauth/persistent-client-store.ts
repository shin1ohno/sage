/**
 * Persistent Client Store
 * Requirements: FR-2 (OAuth Token Persistence - Client Store)
 *
 * Extends ClientStore with encrypted filesystem persistence.
 * Maintains same interface as InMemoryClientStore but survives server restarts.
 */

import { randomBytes } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import {
  ClientStore,
  ClientStoreConfig,
  ClientRegistrationResult,
} from './client-store.js';
import {
  OAuthClient,
  ClientRegistrationRequest,
  CLAUDE_CALLBACK_URLS,
  isLocalhostCallback,
} from './types.js';
import { EncryptionService } from './encryption-service.js';

/**
 * Client Storage Format
 */
interface ClientStorage {
  version: number; // For future migrations
  clients: OAuthClient[];
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

    // Check if URI is a localhost callback (allowed for CLI tools like Claude Code)
    if (isLocalhostCallback(uri)) {
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
 * Persistent Client Store Implementation
 *
 * Stores OAuth client registrations with encrypted filesystem persistence.
 * Uses immediate saves (not debounced) for client registrations.
 */
export class PersistentClientStore implements ClientStore {
  private clients: Map<string, OAuthClient> = new Map();
  private config: ClientStoreConfig;
  private encryptionService: EncryptionService;
  private storagePath: string;

  constructor(
    config: ClientStoreConfig,
    encryptionService: EncryptionService,
    storagePath?: string
  ) {
    this.config = config;
    this.encryptionService = encryptionService;
    this.storagePath = storagePath || join(homedir(), '.sage', 'oauth_clients.enc');
  }

  /**
   * Load clients from encrypted file
   */
  async loadFromStorage(): Promise<void> {
    const data = await this.encryptionService.decryptFromFile(this.storagePath);
    if (!data) {
      console.log('[OAuth] No existing clients found, starting fresh');
      return;
    }

    try {
      const storage: ClientStorage = JSON.parse(data);

      // Load all clients
      for (const client of storage.clients) {
        this.clients.set(client.client_id, client);
      }

      console.log(`[OAuth] Loaded ${storage.clients.length} OAuth clients`);
    } catch (error) {
      console.error('[OAuth] Failed to parse client storage, starting fresh:', error);
    }
  }

  /**
   * Save clients to encrypted file
   */
  private async saveToStorage(): Promise<void> {
    const storage: ClientStorage = {
      version: 1,
      clients: Array.from(this.clients.values()),
    };

    const data = JSON.stringify(storage, null, 2);
    await this.encryptionService.encryptToFile(data, this.storagePath);
  }

  /**
   * Register new client (with immediate persistence)
   */
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

    // Store client in memory
    this.clients.set(clientId, client);

    // Save to storage immediately (not debounced)
    await this.saveToStorage();

    return { success: true, client };
  }

  /**
   * Get client by ID
   */
  async getClient(clientId: string): Promise<OAuthClient | null> {
    return this.clients.get(clientId) || null;
  }

  /**
   * Delete client (with immediate persistence)
   */
  async deleteClient(clientId: string): Promise<boolean> {
    const result = this.clients.delete(clientId);
    if (result) {
      await this.saveToStorage();
    }
    return result;
  }

  /**
   * Validate redirect URI for client
   */
  async isValidRedirectUri(clientId: string, redirectUri: string): Promise<boolean> {
    const client = await this.getClient(clientId);
    if (!client) {
      return false;
    }

    // Check exact match first (Requirement 30.5)
    if (client.redirect_uris.includes(redirectUri)) {
      return true;
    }

    // Allow localhost callbacks if client has registered any localhost URI
    // This supports CLI tools that use dynamic ports
    if (isLocalhostCallback(redirectUri)) {
      const hasLocalhostRegistered = client.redirect_uris.some(uri => isLocalhostCallback(uri));
      if (hasLocalhostRegistered) {
        return true;
      }
    }

    return false;
  }

  /**
   * Flush pending saves (for consistency with other stores)
   */
  async flush(): Promise<void> {
    await this.saveToStorage();
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): {
    count: number;
  } {
    return {
      count: this.clients.size,
    };
  }
}
