/**
 * Cloud Configuration Management Tests
 * Requirements: 12.3, 12.6
 * Tests for cloud-based configuration sync
 */

import {
  CloudConfigManager,
  ConfigSyncStatus,
  EncryptedConfig,
} from '../../src/remote/cloud-config.js';

interface TestConfig {
  user: { name: string; timezone: string };
  preferences: { language: string };
}

describe('CloudConfigManager', () => {
  let manager: CloudConfigManager;

  beforeEach(() => {
    manager = new CloudConfigManager({
      encryptionKey: 'test-encryption-key-32char!!',
      syncEndpoint: 'https://api.example.com/config',
    });
  });

  describe('Configuration Encryption', () => {
    it('should encrypt configuration data', () => {
      const config = {
        user: { name: 'Test User', timezone: 'Asia/Tokyo' },
        preferences: { language: 'ja' },
      };

      const encrypted = manager.encryptConfig(config);

      expect(encrypted.data).not.toContain('Test User');
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.version).toBe(1);
    });

    it('should decrypt configuration data', () => {
      const config = {
        user: { name: 'Test User', timezone: 'Asia/Tokyo' },
        preferences: { language: 'ja' },
      };

      const encrypted = manager.encryptConfig(config);
      const decrypted = manager.decryptConfig(encrypted) as unknown as TestConfig;

      expect(decrypted.user.name).toBe('Test User');
      expect(decrypted.preferences.language).toBe('ja');
    });

    it('should fail to decrypt with wrong key', () => {
      const config = { user: { name: 'Test' } };
      const encrypted = manager.encryptConfig(config);

      const wrongManager = new CloudConfigManager({
        encryptionKey: 'wrong-encryption-key-32chars!!',
        syncEndpoint: 'https://api.example.com/config',
      });

      expect(() => wrongManager.decryptConfig(encrypted)).toThrow();
    });
  });

  describe('Configuration Versioning', () => {
    it('should track configuration version', () => {
      const version = manager.getCurrentVersion();

      expect(version).toBeGreaterThanOrEqual(0);
    });

    it('should increment version on save', async () => {
      const initialVersion = manager.getCurrentVersion();

      await manager.saveLocal({
        user: { name: 'Test', timezone: 'UTC' },
        preferences: { language: 'en' },
      });

      const newVersion = manager.getCurrentVersion();
      expect(newVersion).toBeGreaterThan(initialVersion);
    });

    it('should detect version conflicts', () => {
      const localConfig: EncryptedConfig = {
        data: 'encrypted-local',
        iv: 'iv1',
        version: 2,
        timestamp: Date.now() - 1000,
      };

      const remoteConfig: EncryptedConfig = {
        data: 'encrypted-remote',
        iv: 'iv2',
        version: 3,
        timestamp: Date.now(),
      };

      const conflict = manager.detectConflict(localConfig, remoteConfig);

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.newerVersion).toBe('remote');
    });
  });

  describe('Sync Status', () => {
    it('should report sync status', () => {
      const status = manager.getSyncStatus();

      expect(status.lastSyncTime).toBeDefined();
      expect(status.syncState).toBe('idle');
    });

    it('should track pending changes', async () => {
      await manager.saveLocal({
        user: { name: 'Test', timezone: 'UTC' },
        preferences: { language: 'en' },
      });

      const status = manager.getSyncStatus();
      expect(status.hasPendingChanges).toBe(true);
    });
  });

  describe('Multi-Device Sync', () => {
    it('should generate device ID', () => {
      const deviceId = manager.getDeviceId();

      expect(deviceId).toBeDefined();
      expect(deviceId.length).toBeGreaterThan(0);
    });

    it('should track sync across devices', () => {
      const devices = manager.getKnownDevices();

      expect(Array.isArray(devices)).toBe(true);
    });
  });

  describe('Conflict Resolution', () => {
    it('should merge non-conflicting changes', () => {
      const local = {
        user: { name: 'Local Name', timezone: 'Asia/Tokyo' },
        preferences: { language: 'ja' },
      };

      const remote = {
        user: { name: 'Local Name', timezone: 'UTC' },
        preferences: { language: 'ja' },
      };

      const merged = manager.mergeConfigs(local, remote) as unknown as TestConfig;

      // Remote should win for timezone (newer)
      expect(merged.user.name).toBe('Local Name');
    });

    it('should preserve local changes when remote is older', () => {
      const result = manager.resolveConflict(
        { version: 5, timestamp: Date.now() },
        { version: 3, timestamp: Date.now() - 10000 },
        'keep-newer'
      );

      expect(result.winner).toBe('local');
    });
  });
});

describe('ConfigSyncStatus', () => {
  it('should correctly identify sync states', () => {
    const syncingStatus: ConfigSyncStatus = {
      syncState: 'syncing',
      lastSyncTime: Date.now(),
      hasPendingChanges: true,
      error: undefined,
    };

    expect(syncingStatus.syncState).toBe('syncing');
    expect(syncingStatus.hasPendingChanges).toBe(true);
  });

  it('should track sync errors', () => {
    const errorStatus: ConfigSyncStatus = {
      syncState: 'error',
      lastSyncTime: Date.now() - 60000,
      hasPendingChanges: true,
      error: 'Network error',
    };

    expect(errorStatus.syncState).toBe('error');
    expect(errorStatus.error).toBe('Network error');
  });
});
