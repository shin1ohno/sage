/**
 * JWT Authentication Middleware for Remote MCP Server
 * Requirements: 15.7, 15.8
 *
 * Provides middleware for authenticating requests with JWT tokens.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { createSecretAuthenticator, SecretAuthenticator, TokenResponse } from './secret-auth.js';

/**
 * JWT middleware configuration
 */
export interface JWTMiddlewareConfig {
  secret: string;
  expiresIn: string;
  skipPaths?: string[];
}

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * JWT middleware interface
 */
export interface JWTMiddleware {
  authenticate(req: IncomingMessage, res: ServerResponse): Promise<AuthResult>;
  generateToken(secret: string): Promise<TokenResponse>;
}

/**
 * Parse Authorization header
 */
function parseAuthorizationHeader(header: string | undefined): { scheme: string; token: string } | null {
  if (!header) {
    return null;
  }

  const parts = header.split(' ');
  if (parts.length !== 2) {
    return null;
  }

  return {
    scheme: parts[0].toLowerCase(),
    token: parts[1],
  };
}

/**
 * Send JSON error response
 */
function sendErrorResponse(res: ServerResponse, statusCode: number, error: string): void {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(statusCode);
  res.end(JSON.stringify({ error }));
}

/**
 * Create JWT authentication middleware
 */
export function createJWTMiddleware(config: JWTMiddlewareConfig): JWTMiddleware {
  const authenticator: SecretAuthenticator = createSecretAuthenticator({
    secret: config.secret,
    expiresIn: config.expiresIn,
  });

  const skipPaths = new Set(config.skipPaths || []);

  return {
    async authenticate(req: IncomingMessage, res: ServerResponse): Promise<AuthResult> {
      // Check if path should skip authentication
      const url = req.url || '';
      const path = url.split('?')[0];

      if (skipPaths.has(path)) {
        return {
          authenticated: true,
          skipped: true,
        };
      }

      // Get Authorization header
      const authHeader = req.headers.authorization;
      const parsed = parseAuthorizationHeader(authHeader);

      if (!parsed) {
        sendErrorResponse(res, 401, 'Missing or invalid Authorization header');
        return {
          authenticated: false,
          error: 'Missing or invalid Authorization header',
        };
      }

      // Check scheme
      if (parsed.scheme !== 'bearer') {
        sendErrorResponse(res, 401, 'Authorization scheme must be Bearer');
        return {
          authenticated: false,
          error: 'Authorization scheme must be Bearer',
        };
      }

      // Check token
      if (!parsed.token || parsed.token.trim() === '') {
        sendErrorResponse(res, 401, 'Token is required');
        return {
          authenticated: false,
          error: 'Token is required',
        };
      }

      // Verify token
      const verifyResult = await authenticator.verifyToken(parsed.token);

      if (!verifyResult.valid) {
        const errorMessage = verifyResult.error?.includes('expired')
          ? 'Token expired'
          : 'Invalid token';
        sendErrorResponse(res, 401, errorMessage);
        return {
          authenticated: false,
          error: errorMessage,
        };
      }

      return {
        authenticated: true,
      };
    },

    async generateToken(secret: string): Promise<TokenResponse> {
      return authenticator.authenticate(secret);
    },
  };
}
