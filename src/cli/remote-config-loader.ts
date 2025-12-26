/**
 * Remote Config Loader for sage
 * Requirements: 15.1, 15.2, 15.3, 15.10
 *
 * Loads and validates remote MCP server configuration.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/**
 * OAuth User Configuration
 */
export interface OAuthUserConfig {
  username: string;
  passwordHash: string;
}

/**
 * OAuth Configuration
 */
export interface OAuthAuthConfig {
  type: 'oauth2';
  issuer: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
  allowedRedirectUris?: string[];
  users: OAuthUserConfig[];
  scopes?: Record<string, string>;
}

/**
 * JWT Configuration
 */
export interface JWTAuthConfig {
  type: 'jwt';
  secret?: string;
  expiresIn?: string;
}

/**
 * No Auth Configuration
 */
export interface NoAuthConfig {
  type: 'none';
}

/**
 * Auth Configuration Union Type
 */
export type AuthConfig = OAuthAuthConfig | JWTAuthConfig | NoAuthConfig;

/**
 * Remote MCP Server Configuration
 */
export interface RemoteConfig {
  remote: {
    enabled: boolean;
    port: number;
    host: string;
    auth: AuthConfig;
    cors: {
      allowedOrigins: string[];
    };
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Default path for remote config file
 */
export const DEFAULT_REMOTE_CONFIG_PATH = join(homedir(), '.sage', 'remote-config.json');

/**
 * Minimum secret length for JWT auth
 */
const MIN_SECRET_LENGTH = 32;

/**
 * Valid port range
 */
const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * Valid expiresIn pattern (e.g., "1h", "24h", "7d", "30m", "1w")
 */
const EXPIRES_IN_PATTERN = /^\d+[smhdw]$/;

/**
 * Get default remote configuration
 */
export function getDefaultRemoteConfig(): RemoteConfig {
  return {
    remote: {
      enabled: false,
      port: 3000,
      host: '0.0.0.0',
      auth: {
        type: 'none',
      },
      cors: {
        allowedOrigins: ['*'],
      },
    },
  };
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Load remote configuration from file
 * @param configPath - Path to config file (defaults to ~/.sage/remote-config.json)
 * @returns Loaded configuration merged with defaults
 */
export async function loadRemoteConfig(configPath?: string): Promise<RemoteConfig> {
  const path = configPath ?? DEFAULT_REMOTE_CONFIG_PATH;
  const defaults = getDefaultRemoteConfig();

  try {
    const content = await readFile(path, 'utf-8');
    const parsed = JSON.parse(content) as Partial<RemoteConfig>;

    // Deep merge with defaults
    if (parsed.remote) {
      return {
        remote: deepMerge(defaults.remote, parsed.remote),
      };
    }

    return defaults;
  } catch (error) {
    // If file doesn't exist, return defaults
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaults;
    }

    // Re-throw other errors (e.g., JSON parse errors)
    throw error;
  }
}

/**
 * Validate remote configuration
 * @param config - Configuration to validate
 * @returns Validation result with errors if any
 */
export function validateRemoteConfig(config: RemoteConfig): ValidationResult {
  const errors: string[] = [];

  // Validate port
  if (config.remote.port < MIN_PORT || config.remote.port > MAX_PORT) {
    errors.push('Invalid port number');
  }

  // Validate auth
  if (config.remote.auth.type === 'jwt') {
    if (!config.remote.auth.secret) {
      errors.push('JWT auth requires a secret');
    } else if (config.remote.auth.secret.length < MIN_SECRET_LENGTH) {
      errors.push(`JWT secret must be at least ${MIN_SECRET_LENGTH} characters`);
    }

    // Validate expiresIn format
    if (config.remote.auth.expiresIn && !EXPIRES_IN_PATTERN.test(config.remote.auth.expiresIn)) {
      errors.push('Invalid expiresIn format (use format like "1h", "24h", "7d")');
    }
  }

  // Validate CORS
  if (!config.remote.cors.allowedOrigins || config.remote.cors.allowedOrigins.length === 0) {
    errors.push('At least one allowedOrigins must be specified');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
