/**
 * Google OAuth Handler
 * Requirements: 1 (Google Calendar OAuth Authentication)
 *
 * Handles OAuth 2.0 flow for Google Calendar API integration.
 * Uses PKCE (Proof Key for Code Exchange) with S256 method.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const scryptAsync = promisify(scrypt);

/**
 * Google OAuth Tokens
 */
export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

/**
 * Stored tokens format (for persistence)
 */
interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601
  scope: string[];
}

/**
 * Google OAuth Configuration
 */
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Google Calendar API Scopes
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.readonly',
];

/**
 * Google OAuth Handler Class
 *
 * Manages OAuth 2.0 authentication flow with Google Calendar API.
 * Implements PKCE for enhanced security.
 */
export class GoogleOAuthHandler {
  private codeVerifier: string | null = null;
  private config: GoogleOAuthConfig;
  private readonly encryptionKey: string;
  private readonly tokensStoragePath: string;

  constructor(config: GoogleOAuthConfig, encryptionKey?: string, userId?: string) {
    this.config = config;
    // Use provided encryption key or generate from environment
    this.encryptionKey = encryptionKey || process.env.SAGE_ENCRYPTION_KEY || 'sage-default-encryption-key-change-me';
    // Store tokens at ~/.sage/google_oauth_tokens_{userId}.enc
    const sageDir = join(homedir(), '.sage');
    const userIdSuffix = userId ? `_${userId}` : '';
    this.tokensStoragePath = join(sageDir, `google_oauth_tokens${userIdSuffix}.enc`);
  }

  /**
   * Create OAuth2Client instance
   */
  private createOAuth2Client(redirectUri?: string): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      redirectUri || this.config.redirectUri
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private async encrypt(data: string): Promise<string> {
    // Derive key from encryption key using scrypt
    const salt = randomBytes(16);
    const key = (await scryptAsync(this.encryptionKey, salt, 32)) as Buffer;

    // Generate IV
    const iv = randomBytes(16);

    // Create cipher
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    // Encrypt data
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Combine: salt:iv:authTag:encrypted
    return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private async decrypt(encryptedData: string): Promise<string> {
    // Split encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltHex, ivHex, authTagHex, encrypted] = parts;

    // Convert from hex
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Derive key from encryption key using scrypt
    const key = (await scryptAsync(this.encryptionKey, salt, 32)) as Buffer;

    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate authorization URL with PKCE code_challenge
   *
   * Generates a code_verifier and code_challenge (S256), stores the verifier
   * for later token exchange, and returns the authorization URL.
   *
   * @param redirectUri - Redirect URI for OAuth callback
   * @returns Authorization URL for user to visit
   */
  async getAuthorizationUrl(redirectUri?: string): Promise<string> {
    // Generate PKCE parameters
    this.codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(this.codeVerifier);

    // Create OAuth2 client with redirect URI
    const oauth2Client = this.createOAuth2Client(redirectUri);

    // Generate authorization URL with PKCE
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: GOOGLE_CALENDAR_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent', // Force consent screen to get refresh token
    } as any);

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   *
   * Exchanges the authorization code received from OAuth callback
   * for access and refresh tokens. Uses the stored code_verifier
   * for PKCE verification.
   *
   * @param code - Authorization code from OAuth callback
   * @param redirectUri - Redirect URI (must match authorization request)
   * @returns Google OAuth tokens
   * @throws Error if code_verifier is not found or token exchange fails
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri?: string
  ): Promise<GoogleOAuthTokens> {
    if (!this.codeVerifier) {
      throw new Error('code_verifier not found. Call getAuthorizationUrl() first.');
    }

    // Create OAuth2 client with redirect URI
    const oauth2Client = this.createOAuth2Client(redirectUri);

    try {
      // Exchange code for tokens with PKCE verifier
      const { tokens } = await oauth2Client.getToken({
        code,
        codeVerifier: this.codeVerifier,
      });

      // Clear stored code_verifier
      this.codeVerifier = null;

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Failed to retrieve access_token or refresh_token');
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
        scope: tokens.scope ? tokens.scope.split(' ') : GOOGLE_CALENDAR_SCOPES,
      };
    } catch (error) {
      // Clear code_verifier on error
      this.codeVerifier = null;
      throw new Error(
        `Failed to exchange code for tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Refresh token
   * @returns Updated Google OAuth tokens
   * @throws Error if token refresh fails
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
    const oauth2Client = this.createOAuth2Client();

    try {
      // Set refresh token
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      // Refresh access token
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error('Failed to refresh access_token');
      }

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken,
        expiresAt: credentials.expiry_date || Date.now() + 3600 * 1000,
        scope: credentials.scope ? credentials.scope.split(' ') : GOOGLE_CALENDAR_SCOPES,
      };
    } catch (error) {
      throw new Error(
        `Failed to refresh access token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Revoke access token
   *
   * @param accessToken - Access token to revoke
   * @throws Error if token revocation fails
   */
  async revokeToken(accessToken: string): Promise<void> {
    const oauth2Client = this.createOAuth2Client();

    try {
      await oauth2Client.revokeToken(accessToken);
    } catch (error) {
      throw new Error(
        `Failed to revoke token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Store tokens securely with encryption
   *
   * Encrypts tokens using AES-256-GCM and stores them in ~/.sage/google_oauth_tokens_{userId}.enc
   *
   * @param tokens - Google OAuth tokens to store
   * @throws Error if token storage fails
   */
  async storeTokens(tokens: GoogleOAuthTokens): Promise<void> {
    try {
      // Convert to stored format
      const storedTokens: StoredTokens = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(tokens.expiresAt).toISOString(),
        scope: tokens.scope,
      };

      // Encrypt tokens
      const tokensJson = JSON.stringify(storedTokens);
      const encrypted = await this.encrypt(tokensJson);

      // Ensure ~/.sage directory exists
      const sageDir = join(homedir(), '.sage');
      await mkdir(sageDir, { recursive: true });

      // Write encrypted tokens to file
      await writeFile(this.tokensStoragePath, encrypted, 'utf8');
    } catch (error) {
      throw new Error(
        `Failed to store tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get stored tokens with decryption
   *
   * Reads and decrypts tokens from ~/.sage/google_oauth_tokens_{userId}.enc
   *
   * @returns Google OAuth tokens or null if not found
   * @throws Error if token retrieval or decryption fails
   */
  async getTokens(): Promise<GoogleOAuthTokens | null> {
    try {
      // Read encrypted tokens from file
      const encrypted = await readFile(this.tokensStoragePath, 'utf8');

      // Decrypt tokens
      const tokensJson = await this.decrypt(encrypted);
      const storedTokens: StoredTokens = JSON.parse(tokensJson);

      // Convert to GoogleOAuthTokens format
      return {
        accessToken: storedTokens.accessToken,
        refreshToken: storedTokens.refreshToken,
        expiresAt: new Date(storedTokens.expiresAt).getTime(),
        scope: storedTokens.scope,
      };
    } catch (error) {
      // Return null if file not found (user hasn't authenticated yet)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new Error(
        `Failed to get tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Revoke tokens and clear local storage
   *
   * Calls Google's token revocation endpoint AND removes locally stored tokens
   *
   * @throws Error if token revocation fails
   */
  async revokeTokens(): Promise<void> {
    try {
      // Get current tokens
      const tokens = await this.getTokens();

      if (tokens) {
        // Revoke token at Google
        await this.revokeToken(tokens.accessToken);
      }

      // Clear local storage (remove file)
      const fs = await import('fs/promises');
      try {
        await fs.unlink(this.tokensStoragePath);
      } catch (error) {
        // Ignore if file doesn't exist
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to revoke tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate access token
   *
   * Checks if the access token is valid and not expired (or expiring soon).
   * Token is considered expiring if it expires within 5 minutes.
   *
   * @param tokens - Google OAuth tokens to validate
   * @returns True if token is valid and not expiring soon
   */
  async validateToken(tokens: GoogleOAuthTokens): Promise<boolean> {
    // Check if expiresAt timestamp is in the future
    const now = Date.now();
    const fiveMinutesInMs = 5 * 60 * 1000;

    // Token is valid if it expires more than 5 minutes from now
    return tokens.expiresAt > now + fiveMinutesInMs;
  }

  /**
   * Ensure valid token
   *
   * Gets stored tokens, validates expiry, refreshes if needed,
   * stores updated tokens, and returns valid access token.
   * This method should be called before each Google Calendar API call.
   *
   * @returns Valid access token
   * @throws Error if no tokens found or refresh fails
   */
  async ensureValidToken(): Promise<string> {
    // 1. Get stored tokens
    const tokens = await this.getTokens();

    if (!tokens) {
      throw new Error('No stored tokens found. Please authenticate with Google Calendar first.');
    }

    // 2. Validate expiry
    const isValid = await this.validateToken(tokens);

    // 3. Refresh if needed
    if (!isValid) {
      try {
        const refreshedTokens = await this.refreshAccessToken(tokens.refreshToken);

        // 4. Store updated tokens
        await this.storeTokens(refreshedTokens);

        // 5. Return valid access token
        return refreshedTokens.accessToken;
      } catch (error) {
        throw new Error(
          `Failed to refresh expired token: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // 5. Return valid access token (no refresh needed)
    return tokens.accessToken;
  }

  /**
   * Get OAuth2 client instance
   *
   * Returns the configured OAuth2Client for use in Google API calls.
   *
   * @param tokens - Google OAuth tokens
   * @returns Configured OAuth2Client
   */
  getOAuth2Client(tokens: GoogleOAuthTokens): OAuth2Client {
    const client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri
    );

    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt,
      scope: tokens.scope.join(' '),
    });

    return client;
  }
}
