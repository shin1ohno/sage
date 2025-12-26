/**
 * Main Entry Point for sage
 * Requirements: 14.1, 14.2, 14.3
 *
 * Handles server startup based on CLI options.
 */

import { CLIOptions, getHelpMessage, getVersion } from './parser.js';
import { createHTTPServer } from './http-server.js';

/**
 * Server mode type
 */
export type ServerMode = 'stdio' | 'http' | 'help' | 'version';

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

  // Start in HTTP mode if remote flag is set
  if (options.remote) {
    try {
      const authEnabled = !!options.authSecret;
      const httpConfig = {
        port: options.port,
        host: options.host,
        configPath: options.config,
        auth: authEnabled
          ? {
              enabled: true,
              jwtSecret: options.authSecret,
              apiKeys: [], // API keys can be configured later
            }
          : undefined,
      };

      const server = await createHTTPServer(httpConfig);

      return {
        mode: 'http',
        success: true,
        port: options.port,
        host: options.host,
        configPath: options.config,
        authEnabled,
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
