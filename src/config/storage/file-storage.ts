/**
 * File Config Storage
 * Stores configuration in the file system (for Desktop/Code MCP)
 * Requirements: 1.1, 1.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ConfigStorage } from '../../platform/types.js';

/**
 * File-based configuration storage
 * Used for Desktop/Code MCP environment
 */
export class FileConfigStorage implements ConfigStorage {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(os.homedir(), '.sage', 'config.json');
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<Record<string, unknown> | null> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${this.filePath}`);
      }
      throw error;
    }
  }

  /**
   * Save configuration to file
   */
  async save(config: Record<string, unknown>): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write config
    await fs.writeFile(this.filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Check if configuration file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete configuration file
   */
  async delete(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, that's fine
    }
  }

  /**
   * Get the file path
   */
  getFilePath(): string {
    return this.filePath;
  }
}
