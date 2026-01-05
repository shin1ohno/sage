/**
 * Main Entry Point for sage
 * Requirements: 14.1, 14.2, 14.3
 *
 * Handles server startup based on CLI options.
 */

import { CLIOptions, getHelpMessage, getVersion } from './parser.js';
import { createHTTPServerWithConfig } from './http-server-with-config.js';
import { loadRemoteConfig, DEFAULT_REMOTE_CONFIG_PATH } from './remote-config-loader.js';
import { createSecretAuthenticator } from './secret-auth.js';

/**
 * Server mode type
 */
export type ServerMode = 'stdio' | 'http' | 'help' | 'version' | 'token-gen';

/**
 * Server start result
 */
export interface ServerStartResult {
  /** Server mode */
  mode: ServerMode;
  /** Whether startup was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Message for help/version modes */
  message?: string;
  /** Config path used */
  configPath?: string;
  /** HTTP server port (for http mode) */
  port?: number;
  /** HTTP server host (for http mode) */
  host?: string;
  /** Whether authentication is enabled */
  authEnabled?: boolean;
  /** Stop function for HTTP server */
  stop?: () => Promise<void>;
  /** Generated token (for token-gen mode) */
  token?: string;
  /** Token expiry in seconds (for token-gen mode) */
  expiresIn?: number;
}

/**
 * Start the server based on CLI options
 * @param options - Parsed CLI options
 * @returns Server start result
 */
export async function startServer(options: CLIOptions): Promise<ServerStartResult> {
  // Handle help
  if (options.help) {
    return {
      mode: 'help',
      success: true,
      message: getHelpMessage(),
    };
  }

  // Handle version
  if (options.version) {
    return {
      mode: 'version',
      success: true,
      message: getVersion(),
    };
  }

  // Handle token generation
  if (options.generateToken) {
    try {
      const configPath = options.config ?? DEFAULT_REMOTE_CONFIG_PATH;
      const config = await loadRemoteConfig(configPath);

      if (config.remote.auth.type === 'jwt') {
        // JWT mode: generate token using secret
        const secret = options.authSecret ?? config.remote.auth.secret;

        if (!secret) {
          return {
            mode: 'token-gen',
            success: false,
            error: 'JWT secret not configured. Set auth.secret in remote-config.json or use SAGE_AUTH_SECRET environment variable',
          };
        }

        const expiresIn = config.remote.auth.expiresIn ?? '24h';
        const authenticator = createSecretAuthenticator({ secret, expiresIn });
        const result = await authenticator.authenticate(secret);

        if (!result.success || !result.token) {
          return {
            mode: 'token-gen',
            success: false,
            error: result.error ?? 'Failed to generate token',
          };
        }

        return {
          mode: 'token-gen',
          success: true,
          token: result.token,
          expiresIn: result.expiresIn,
          message: `Bearer token generated successfully.

Token: ${result.token}
Expires in: ${result.expiresIn ?? 86400} seconds

Usage with Claude Code:
  claude mcp add --transport http sage "http://your-server:${config.remote.port}/mcp" --header "Authorization: Bearer ${result.token}"`,
        };
      } else if (config.remote.auth.type === 'oauth2') {
        // OAuth2 mode: check if static tokens are enabled
        const oauthConfig = config.remote.auth;
        const issuer = oauthConfig.issuer || `http://localhost:${config.remote.port}`;

        if (!oauthConfig.allowStaticTokens || !oauthConfig.staticTokenSecret) {
          return {
            mode: 'token-gen',
            success: false,
            error: `Static token generation is not enabled for OAuth2 mode.

To enable it, add the following to your remote-config.json:
{
  "remote": {
    "auth": {
      "type": "oauth2",
      ...
      "allowStaticTokens": true,
      "staticTokenSecret": "your-secret-key-at-least-32-characters-long"
    }
  }
}

Alternatively, use the OAuth2 flow with SSH port forwarding.`,
          };
        }

        // Generate static JWT token using the configured secret
        const authenticator = createSecretAuthenticator({
          secret: oauthConfig.staticTokenSecret,
          expiresIn: oauthConfig.accessTokenExpiry ?? '1h',
        });

        const result = await authenticator.authenticate(oauthConfig.staticTokenSecret);

        if (!result.success || !result.token) {
          return {
            mode: 'token-gen',
            success: false,
            error: result.error ?? 'Failed to generate token',
          };
        }

        return {
          mode: 'token-gen',
          success: true,
          token: result.token,
          expiresIn: result.expiresIn,
          message: `Bearer token generated successfully (OAuth2 + Static Token mode).

Token: ${result.token}
Expires in: ${result.expiresIn ?? 3600} seconds

This token can be used alongside the OAuth2 flow for CLI access.

Usage with Claude Code:
  claude mcp add --transport http sage "${issuer}/mcp" --header "Authorization: Bearer ${result.token}"`,
        };
      } else {
        // No auth mode
        return {
          mode: 'token-gen',
          success: false,
          error: 'Authentication is disabled. Set auth.type to "jwt" or "oauth2" in remote-config.json',
        };
      }
    } catch (error) {
      return {
        mode: 'token-gen',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Start in HTTP mode if remote flag is set
  if (options.remote) {
    try {
      // createHTTPServerWithConfig already starts the server
      const server = await createHTTPServerWithConfig({
        configPath: options.config,
        port: options.port,
        host: options.host,
        authSecret: options.authSecret,
        debug: options.debug,
      });

      return {
        mode: 'http',
        success: true,
        port: server.getPort(),
        host: server.getHost(),
        configPath: options.config,
        authEnabled: server.isAuthEnabled(),
        stop: async () => {
          await server.stop();
        },
      };
    } catch (error) {
      return {
        mode: 'http',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Start in Stdio mode (default)
  try {
    // In Stdio mode, we don't actually start the server here
    // The MCP server will be connected via StdioServerTransport
    // This is handled in the main index.ts
    return {
      mode: 'stdio',
      success: true,
      configPath: options.config,
    };
  } catch (error) {
    return {
      mode: 'stdio',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
