/**
 * Browser Opener Utility
 * Requirements: FR-3 (Browser Opening)
 *
 * Cross-platform utility to open URLs in the default browser.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Result of browser open operation
 */
export interface BrowserOpenResult {
  success: boolean;
  error?: string;
}

/**
 * Open URL in default browser
 *
 * Uses platform-appropriate command:
 * - macOS: open
 * - Linux: xdg-open
 * - Windows: start
 *
 * @param url - URL to open
 * @returns Result indicating success or failure
 */
export async function openBrowser(url: string): Promise<BrowserOpenResult> {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin':
      // macOS
      command = `open "${url}"`;
      break;
    case 'win32':
      // Windows - use start with empty title
      command = `start "" "${url}"`;
      break;
    case 'linux':
    default:
      // Linux and other Unix-like systems
      command = `xdg-open "${url}"`;
      break;
  }

  try {
    await execAsync(command);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to open browser: ${errorMessage}`,
    };
  }
}

/**
 * Get the command that would be used to open a URL
 *
 * Useful for testing and debugging.
 *
 * @param url - URL to open
 * @returns Command string
 */
export function getBrowserCommand(url: string): string {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return `open "${url}"`;
    case 'win32':
      return `start "" "${url}"`;
    case 'linux':
    default:
      return `xdg-open "${url}"`;
  }
}
