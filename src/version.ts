/**
 * Version information for sage
 *
 * Reads version from package.json at runtime.
 * Import this instead of hardcoding version strings.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

function getVersion(): string {
  try {
    // Handle both ESM and compiled paths
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));

    // Look for package.json in parent directories
    let dir = currentDir;
    for (let i = 0; i < 5; i++) {
      try {
        const pkgPath = join(dir, 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === '@shin1ohno/sage') {
          return pkg.version;
        }
      } catch {
        // Continue searching
      }
      dir = dirname(dir);
    }
    return '0.0.0'; // Fallback
  } catch {
    return '0.0.0'; // Fallback
  }
}

export const VERSION = getVersion();
export const SERVER_NAME = 'sage';
