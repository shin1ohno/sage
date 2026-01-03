/**
 * Version information for sage
 *
 * Reads version from package.json at runtime.
 * Import this instead of hardcoding version strings.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Fallback version - keep in sync with package.json
const FALLBACK_VERSION = '0.8.3';

function getVersion(): string {
  // Try to find package.json from current working directory
  const pkgPath = join(process.cwd(), 'package.json');
  try {
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === '@shin1ohno/sage') {
        return pkg.version;
      }
    }
  } catch {
    // Fall through to default
  }
  return FALLBACK_VERSION;
}

export const VERSION = getVersion();
export const SERVER_NAME = 'sage';
