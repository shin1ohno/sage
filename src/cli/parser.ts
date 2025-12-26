/**
 * CLI Parser for sage
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8
 *
 * Parses command line arguments and environment variables
 * to determine the server mode and configuration.
 */

/**
 * CLI Options interface
 */
export interface CLIOptions {
  /** Run in HTTP server mode (Remote MCP) */
  remote: boolean;
  /** HTTP server port */
  port: number;
  /** HTTP server host address */
  host: string;
  /** Path to configuration file */
  config?: string;
  /** Show help message */
  help: boolean;
  /** Show version */
  version: boolean;
  /** JWT authentication secret */
  authSecret?: string;
}

/** Default port for HTTP server */
const DEFAULT_PORT = 3000;

/** Default host for HTTP server */
const DEFAULT_HOST = '0.0.0.0';

/** Minimum valid port number */
const MIN_PORT = 1;

/** Maximum valid port number */
const MAX_PORT = 65535;

/**
 * Get the value of an argument that takes a parameter
 * @param args - Command line arguments
 * @param longFlag - Long flag (e.g., '--port')
 * @param shortFlag - Short flag (e.g., '-p')
 * @returns The value or undefined
 */
function getArgValue(
  args: string[],
  longFlag: string,
  shortFlag?: string
): string | undefined {
  // Check for long flag
  const longIndex = args.indexOf(longFlag);
  if (longIndex !== -1 && longIndex + 1 < args.length) {
    const value = args[longIndex + 1];
    // Make sure it's not another flag
    if (!value.startsWith('-')) {
      return value;
    }
  }

  // Check for short flag
  if (shortFlag) {
    const shortIndex = args.indexOf(shortFlag);
    if (shortIndex !== -1 && shortIndex + 1 < args.length) {
      const value = args[shortIndex + 1];
      if (!value.startsWith('-')) {
        return value;
      }
    }
  }

  return undefined;
}

/**
 * Check if a boolean flag is present in the arguments
 * @param args - Command line arguments
 * @param longFlag - Long flag (e.g., '--remote')
 * @param shortFlag - Short flag (e.g., '-r')
 * @returns true if the flag is present
 */
function hasFlag(args: string[], longFlag: string, shortFlag?: string): boolean {
  return args.includes(longFlag) || (shortFlag ? args.includes(shortFlag) : false);
}

/**
 * Parse port number from string
 * @param portStr - Port string
 * @param defaultPort - Default port if parsing fails
 * @returns Valid port number
 */
function parsePort(portStr: string | undefined, defaultPort: number): number {
  if (!portStr) {
    return defaultPort;
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
    return defaultPort;
  }

  return port;
}

/**
 * Parse command line arguments and environment variables
 * @param args - Command line arguments (without node and script path)
 * @returns Parsed CLI options
 */
export function parseArgs(args: string[]): CLIOptions {
  // Check environment variables first
  const envRemote = process.env.SAGE_REMOTE_MODE === 'true';
  const envPort = process.env.SAGE_PORT;
  const envHost = process.env.SAGE_HOST;
  const envConfig = process.env.SAGE_CONFIG_PATH;
  const envAuthSecret = process.env.SAGE_AUTH_SECRET;

  // Parse CLI arguments
  const cliRemote = hasFlag(args, '--remote', '-r');
  const cliPort = getArgValue(args, '--port', '-p');
  const cliHost = getArgValue(args, '--host', '-H');
  const cliConfig = getArgValue(args, '--config', '-c');
  const cliHelp = hasFlag(args, '--help', '-h');
  const cliVersion = hasFlag(args, '--version', '-v');

  // CLI takes precedence over environment variables
  const remote = cliRemote || envRemote;

  // Parse port with CLI priority
  let port = DEFAULT_PORT;
  if (cliPort) {
    port = parsePort(cliPort, DEFAULT_PORT);
  } else if (envPort) {
    port = parsePort(envPort, DEFAULT_PORT);
  }

  // Parse host with CLI priority
  let host = DEFAULT_HOST;
  if (cliHost && cliHost.length > 0) {
    host = cliHost;
  } else if (envHost && envHost.length > 0) {
    host = envHost;
  }

  // Parse config with CLI priority
  const config = cliConfig || envConfig || undefined;

  return {
    remote,
    port,
    host,
    config,
    help: cliHelp,
    version: cliVersion,
    authSecret: envAuthSecret,
  };
}

/**
 * Generate help message
 * @returns Help message string
 */
export function getHelpMessage(): string {
  return `
sage - AI Task Management Assistant MCP Server

Usage:
  npx sage [options]

Options:
  --remote, -r           Run in HTTP server mode (Remote MCP)
  --config, -c <path>    Path to configuration file
  --port, -p <number>    HTTP server port (default: 3000)
  --host, -H <address>   HTTP server host (default: 0.0.0.0)
  --help, -h             Show this help message
  --version, -v          Show version

Environment Variables:
  SAGE_REMOTE_MODE       Set to 'true' to run in HTTP server mode
  SAGE_PORT              HTTP server port
  SAGE_HOST              HTTP server host
  SAGE_CONFIG_PATH       Path to configuration file
  SAGE_AUTH_SECRET       JWT authentication secret key

Examples:
  npx sage                           # Run in Stdio mode (Local MCP)
  npx sage --remote                  # Run in HTTP mode (Remote MCP)
  npx sage --remote --port 8080      # Run in HTTP mode on port 8080
  npx sage --config ~/.sage/custom.json  # Use custom config file
`.trim();
}

/**
 * Get version string
 * @returns Version string
 */
export function getVersion(): string {
  return '0.3.0';
}
