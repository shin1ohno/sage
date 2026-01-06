/**
 * OAuth Tools Module
 * Requirements: FR-1 (authenticate_google MCP Tool)
 *
 * Exports OAuth-related MCP tool handlers and context.
 */

import { GoogleOAuthHandler } from '../../oauth/google-oauth-handler.js';

/**
 * OAuth Tools Context
 *
 * Provides access to OAuth-related services for tool handlers.
 */
export interface OAuthToolsContext {
  /**
   * Get GoogleOAuthHandler instance
   * Returns null if Google OAuth is not configured
   */
  getGoogleOAuthHandler: () => GoogleOAuthHandler | null;

  /**
   * Create a new GoogleOAuthHandler with the current config
   */
  createGoogleOAuthHandler: () => GoogleOAuthHandler | null;
}

// Export handler
export { handleAuthenticateGoogle } from './authenticate-google.js';

// Export types
export type { AuthenticateGoogleArgs, AuthenticateGoogleResult } from './authenticate-google.js';
