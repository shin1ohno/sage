/**
 * Cloud Configuration Management System
 * Handles secure cloud sync of user configurations
 * Requirements: 12.3, 12.6
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Cloud config manager options
 */
export interface CloudConfigOptions {
  encryptionKey: string;
  syncEndpoint: string;
  deviceName?: string;
}

/**
 * Encrypted configuration structure
 */
export interface EncryptedConfig {
  data: string;
  iv: string;
  version: number;
  timestamp: number;
  deviceId?: string;
}

/**
 * Configuration sync status
 */
export interface ConfigSyncStatus {
  syncState: 'idle' | 'syncing' | 'error' | 'conflict';
  lastSyncTime: number;
  hasPendingChanges: boolean;
  error?: string;
  conflictInfo?: ConflictInfo;
}

/**
 * Conflict detection result
 */
export interface ConflictInfo {
  hasConflict: boolean;
  newerVersion?: 'local' | 'remote';
  localVersion?: number;
  remoteVersion?: number;
}

/**
 * Conflict resolution result
 */
export interface ResolutionResult {
  winner: 'local' | 'remote' | 'merged';
  config?: Record<string, unknown>;
}

/**
 * Known device info
 */
export interface DeviceInfo {
  id: string;
  name: string;
  lastSeen: number;
  platform: string;
}

/**
 * Cloud Configuration Manager
 * Handles encrypted cloud sync of configurations
 */
export class CloudConfigManager {
  private options: CloudConfigOptions;
  private currentVersion: number = 0;
  private hasPendingChanges: boolean = false;
  private lastSyncTime: number = 0;
  private deviceId: string;
  private localConfig: Record<string, unknown> | null = null;
  private knownDevices: DeviceInfo[] = [];

  constructor(options: CloudConfigOptions) {
    this.options = options;
    this.deviceId = this.generateDeviceId();
  }

  /**
   * Encrypt configuration for cloud storage
   */
  encryptConfig(config: Record<string, unknown>): EncryptedConfig {
    const iv = randomBytes(16);
    const key = this.deriveKey(this.options.encryptionKey);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const jsonData = JSON.stringify(config);

    let encrypted = cipher.update(jsonData, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
      data: encrypted + ':' + authTag.toString('base64'),
      iv: iv.toString('base64'),
      version: this.currentVersion + 1,
      timestamp: Date.now(),
      deviceId: this.deviceId,
    };
  }

  /**
   * Decrypt configuration from cloud storage
   */
  decryptConfig(encrypted: EncryptedConfig): Record<string, unknown> {
    const [encryptedData, authTagBase64] = encrypted.data.split(':');
    const iv = Buffer.from(encrypted.iv, 'base64');
    const key = this.deriveKey(this.options.encryptionKey);
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * Derive encryption key from password
   */
  private deriveKey(password: string): Buffer {
    const hash = createHash('sha256');
    hash.update(password);
    return hash.digest();
  }

  /**
   * Get current configuration version
   */
  getCurrentVersion(): number {
    return this.currentVersion;
  }

  /**
   * Save configuration locally
   */
  async saveLocal(config: Record<string, unknown>): Promise<void> {
    this.localConfig = config;
    this.currentVersion++;
    this.hasPendingChanges = true;
  }

  /**
   * Detect conflict between local and remote configs
   */
  detectConflict(local: EncryptedConfig, remote: EncryptedConfig): ConflictInfo {
    if (local.version === remote.version) {
      return {
        hasConflict: false,
        localVersion: local.version,
        remoteVersion: remote.version,
      };
    }

    const hasConflict = local.version !== remote.version;
    const newerVersion = local.version > remote.version ? 'local' : 'remote';

    return {
      hasConflict,
      newerVersion,
      localVersion: local.version,
      remoteVersion: remote.version,
    };
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): ConfigSyncStatus {
    return {
      syncState: 'idle',
      lastSyncTime: this.lastSyncTime,
      hasPendingChanges: this.hasPendingChanges,
    };
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(): string {
    // In real implementation, this would be persisted
    const hash = createHash('sha256');
    hash.update(this.options.deviceName || 'default');
    hash.update(Date.now().toString());
    hash.update(randomBytes(16));
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Get known devices
   */
  getKnownDevices(): DeviceInfo[] {
    return this.knownDevices;
  }

  /**
   * Merge two configurations
   */
  mergeConfigs(
    local: Record<string, unknown>,
    remote: Record<string, unknown>
  ): Record<string, unknown> {
    // Deep merge with remote taking precedence for conflicts
    return this.deepMerge(local, remote);
  }

  /**
   * Deep merge objects
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };

    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] !== null &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this.deepMerge(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Resolve conflict between local and remote
   */
  resolveConflict(
    local: { version: number; timestamp: number },
    remote: { version: number; timestamp: number },
    strategy: 'keep-newer' | 'keep-local' | 'keep-remote' | 'merge'
  ): ResolutionResult {
    switch (strategy) {
      case 'keep-local':
        return { winner: 'local' };
      case 'keep-remote':
        return { winner: 'remote' };
      case 'keep-newer':
        if (local.timestamp > remote.timestamp || local.version > remote.version) {
          return { winner: 'local' };
        }
        return { winner: 'remote' };
      case 'merge':
        return { winner: 'merged' };
      default:
        return { winner: 'local' };
    }
  }

  /**
   * Sync configuration to cloud
   */
  async syncToCloud(): Promise<ConfigSyncStatus> {
    if (!this.localConfig) {
      return this.getSyncStatus();
    }

    try {
      // Encrypt config for transmission (currently a no-op for placeholder)
      this.encryptConfig(this.localConfig);

      // In real implementation, this would POST to the sync endpoint
      // const encrypted = this.encryptConfig(this.localConfig);
      // await fetch(this.options.syncEndpoint, {
      //   method: 'POST',
      //   body: JSON.stringify(encrypted),
      // });

      this.lastSyncTime = Date.now();
      this.hasPendingChanges = false;

      return {
        syncState: 'idle',
        lastSyncTime: this.lastSyncTime,
        hasPendingChanges: false,
      };
    } catch (error) {
      return {
        syncState: 'error',
        lastSyncTime: this.lastSyncTime,
        hasPendingChanges: true,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Sync configuration from cloud
   */
  async syncFromCloud(): Promise<Record<string, unknown> | null> {
    try {
      // In real implementation, this would GET from the sync endpoint
      // const response = await fetch(this.options.syncEndpoint);
      // const encrypted = await response.json();
      // return this.decryptConfig(encrypted);

      this.lastSyncTime = Date.now();
      return this.localConfig;
    } catch (error) {
      logger.error({ err: error }, 'Failed to sync from cloud');
      return null;
    }
  }
}
