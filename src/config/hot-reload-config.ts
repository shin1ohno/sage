/**
 * Hot Reload Configuration
 * Reads hot reload settings from environment variables.
 */

import type { HotReloadConfig } from '../types/hot-reload.js';

/**
 * Default debounce delay in milliseconds
 */
const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Parse boolean environment variable
 * @param value - Environment variable value
 * @param defaultValue - Default value if not set or invalid
 * @returns Parsed boolean value
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const lowered = value.toLowerCase();
  if (lowered === 'true' || lowered === '1' || lowered === 'yes') {
    return true;
  }
  if (lowered === 'false' || lowered === '0' || lowered === 'no') {
    return false;
  }

  return defaultValue;
}

/**
 * Parse number environment variable
 * @param value - Environment variable value
 * @param defaultValue - Default value if not set or invalid
 * @returns Parsed number value
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Get hot reload configuration from environment variables.
 *
 * Environment variables:
 * - SAGE_DISABLE_HOT_RELOAD: Set to 'true' to disable hot reload (default: false)
 * - SAGE_HOT_RELOAD_DEBOUNCE: Debounce delay in milliseconds (default: 500)
 *
 * @returns Hot reload configuration
 */
export function getHotReloadConfig(): HotReloadConfig {
  const disabled = parseBoolean(process.env.SAGE_DISABLE_HOT_RELOAD, false);
  const debounceMs = parseNumber(process.env.SAGE_HOT_RELOAD_DEBOUNCE, DEFAULT_DEBOUNCE_MS);

  return {
    disabled,
    debounceMs,
  };
}
