/**
 * Encryption Service for OAuth Data
 * Requirements: FR-4 (Encryption Key Management)
 *
 * Provides AES-256-GCM encryption/decryption for sensitive OAuth data.
 * Supports key derivation via scrypt and secure key management.
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { readFile, writeFile, mkdir, chmod, unlink, rename } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { FileMutex, FileMutexMetrics } from './file-mutex.js';

const scryptAsync = promisify(scrypt);

/**
 * Encryption Service Configuration
 */
export interface EncryptionServiceConfig {
  encryptionKey?: string; // From SAGE_ENCRYPTION_KEY env var
  keyStoragePath?: string; // Default: ~/.sage/oauth_encryption_key
}

/**
 * Encryption Service Class
 *
 * Handles AES-256-GCM encryption/decryption for OAuth data persistence.
 * Manages encryption key lifecycle and secure file operations.
 */
export class EncryptionService {
  private encryptionKey: string;
  private keyStoragePath: string;
  private initialized: boolean = false;
  private fileMutex: FileMutex = new FileMutex();

  constructor(config: EncryptionServiceConfig = {}) {
    this.keyStoragePath = config.keyStoragePath || join(homedir(), '.sage', 'oauth_encryption_key');
    this.encryptionKey = config.encryptionKey || '';
  }

  /**
   * Initialize encryption service and load/generate key
   *
   * Key loading priority:
   * 1. SAGE_ENCRYPTION_KEY environment variable (highest priority)
   * 2. Persistent key file at ~/.sage/oauth_encryption_key
   * 3. Generate new key and save (with warning)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return; // Already initialized
    }

    // Priority 1: Use SAGE_ENCRYPTION_KEY environment variable
    if (process.env.SAGE_ENCRYPTION_KEY) {
      this.encryptionKey = process.env.SAGE_ENCRYPTION_KEY;
      console.log('[OAuth] Using encryption key from SAGE_ENCRYPTION_KEY environment variable');
      this.initialized = true;
      return;
    }

    // Priority 2: Load existing key from storage
    if (existsSync(this.keyStoragePath)) {
      try {
        this.encryptionKey = (await readFile(this.keyStoragePath, 'utf-8')).trim();
        console.log('[OAuth] Loaded encryption key from storage');
        this.initialized = true;
        return;
      } catch (error) {
        console.error('[OAuth] Failed to load encryption key:', error);
        // Fall through to generation
      }
    }

    // Priority 3: Generate new key and store it
    console.warn('[OAuth] No encryption key found. Generating new key...');
    console.warn('[OAuth] Warning: Set SAGE_ENCRYPTION_KEY environment variable for production use');

    this.encryptionKey = randomBytes(32).toString('hex');

    // Ensure directory exists with secure permissions
    const dir = join(homedir(), '.sage');
    await mkdir(dir, { recursive: true, mode: 0o700 });

    // Write key with restricted permissions (read/write for owner only)
    await writeFile(this.keyStoragePath, this.encryptionKey, { mode: 0o600 });

    // Ensure permissions are set correctly (some systems ignore mode in writeFile)
    try {
      await chmod(this.keyStoragePath, 0o600);
    } catch (error) {
      // chmod may fail on Windows, log but continue
      console.warn('[OAuth] Could not set file permissions (may not be supported on this OS)');
    }

    console.log(`[OAuth] Generated encryption key stored at: ${this.keyStoragePath}`);
    this.initialized = true;
  }

  /**
   * Encrypt data using AES-256-GCM
   *
   * Format: salt:iv:authTag:encrypted
   *
   * @param data - Plain text data to encrypt
   * @returns Encrypted data in format "salt:iv:authTag:encrypted"
   */
  async encrypt(data: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('EncryptionService not initialized. Call initialize() first.');
    }

    try {
      // Generate salt and derive key using scrypt
      const salt = randomBytes(16);
      const key = (await scryptAsync(this.encryptionKey, salt, 32)) as Buffer;

      // Generate initialization vector
      const iv = randomBytes(16);

      // Create cipher
      const cipher = createCipheriv('aes-256-gcm', key, iv);

      // Encrypt data
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag for integrity verification
      const authTag = cipher.getAuthTag();

      // Combine: salt:iv:authTag:encrypted
      return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('[OAuth] Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   *
   * @param encryptedData - Encrypted data in format "salt:iv:authTag:encrypted"
   * @returns Decrypted plain text data
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('EncryptionService not initialized. Call initialize() first.');
    }

    try {
      // Split encrypted data
      const parts = encryptedData.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format');
      }

      const [saltHex, ivHex, authTagHex, encrypted] = parts;

      // Convert from hex
      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      // Derive key from encryption key using scrypt
      const key = (await scryptAsync(this.encryptionKey, salt, 32)) as Buffer;

      // Create decipher
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('[OAuth] Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt and save data to file
   *
   * Uses atomic write pattern (temp file + rename) to prevent corruption.
   * Serialized with mutex to prevent concurrent write race conditions.
   *
   * @param data - Plain text data to encrypt and save
   * @param filePath - Destination file path
   */
  async encryptToFile(data: string, filePath: string): Promise<void> {
    await this.fileMutex.withLock(filePath, async () => {
      const encrypted = await this.encrypt(data);

      // Ensure directory exists with secure permissions
      const { dirname } = require('path');
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true, mode: 0o700 });

      // Atomic write using temp file + rename pattern
      const tempPath = `${filePath}.tmp`;

      try {
        // Write to temp file with restricted permissions
        await writeFile(tempPath, encrypted, { mode: 0o600 });

        // Ensure permissions are set (some systems ignore mode in writeFile)
        try {
          await chmod(tempPath, 0o600);
        } catch (error) {
          // chmod may fail on Windows, log but continue
          console.warn('[OAuth] Could not set file permissions (may not be supported on this OS)');
        }

        // Rename is atomic on most filesystems - prevents corruption
        await rename(tempPath, filePath);
      } catch (error) {
        console.error(`[OAuth] Failed to write ${filePath}:`, error);

        // Clean up temp file if it exists
        try {
          await unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }

        throw error;
      }
    });
  }

  /**
   * Load and decrypt data from file
   *
   * Serialized with mutex to prevent read-during-write issues.
   *
   * @param filePath - Source file path
   * @returns Decrypted data or null if file doesn't exist
   */
  async decryptFromFile(filePath: string): Promise<string | null> {
    return await this.fileMutex.withLock(filePath, async () => {
      try {
        if (!existsSync(filePath)) {
          return null;
        }

        const encrypted = await readFile(filePath, 'utf-8');
        return await this.decrypt(encrypted);
      } catch (error) {
        console.error(`[OAuth] Failed to decrypt file ${filePath}:`, error);
        return null;
      }
    });
  }

  /**
   * Check if encryption service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the storage path for the encryption key
   */
  getKeyStoragePath(): string {
    return this.keyStoragePath;
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): {
    initialized: boolean;
    keySource: 'environment' | 'file' | 'generated';
    keyStoragePath: string;
    mutex: FileMutexMetrics;
  } {
    let keySource: 'environment' | 'file' | 'generated' = 'generated';
    if (process.env.SAGE_ENCRYPTION_KEY) {
      keySource = 'environment';
    } else if (existsSync(this.keyStoragePath)) {
      keySource = 'file';
    }

    return {
      initialized: this.initialized,
      keySource,
      keyStoragePath: this.keyStoragePath,
      mutex: this.fileMutex.getMetrics(),
    };
  }

  /**
   * Get mutex metrics for monitoring
   */
  getMutexMetrics(): FileMutexMetrics {
    return this.fileMutex.getMetrics();
  }

  /**
   * Wait for all pending file operations to complete
   *
   * Used for graceful shutdown to ensure all data is persisted.
   */
  async waitForPendingWrites(): Promise<void> {
    await this.fileMutex.waitForPending();
  }

  /**
   * Check if there are pending file operations
   */
  hasPendingWrites(): boolean {
    return this.fileMutex.hasPendingOperations();
  }
}
