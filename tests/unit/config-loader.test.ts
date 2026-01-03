/**
 * Config Loader Unit Tests
 * Requirements: 1.1, 1.5, 10.1
 */

import { ConfigLoader } from '../../src/config/loader.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';
import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ConfigLoader', () => {
  const testDir = join(tmpdir(), 'sage-test-' + Date.now());

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getConfigDir', () => {
    it('should return path in home directory', () => {
      const configDir = ConfigLoader.getConfigDir();

      expect(configDir).toContain('.sage');
      expect(configDir).toBeTruthy();
    });
  });

  describe('getConfigPath', () => {
    it('should return path to config.json', () => {
      const configPath = ConfigLoader.getConfigPath();

      expect(configPath).toContain('.sage');
      expect(configPath).toContain('config.json');
    });
  });

  describe('exists', () => {
    it('should return false when config file does not exist', async () => {
      // Use a path that definitely doesn't exist
      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => join(testDir, 'nonexistent', 'config.json');

      const exists = await ConfigLoader.exists();

      expect(exists).toBe(false);

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should return true when config file exists', async () => {
      const existingConfigPath = join(testDir, 'existing-config.json');
      await writeFile(existingConfigPath, JSON.stringify({ test: true }));

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => existingConfigPath;

      const exists = await ConfigLoader.exists();

      expect(exists).toBe(true);

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });
  });

  describe('getDefaultConfig', () => {
    it('should return a valid default configuration', () => {
      const config = ConfigLoader.getDefaultConfig();

      expect(config.version).toBe(DEFAULT_CONFIG.version);
      expect(config.user).toBeDefined();
      expect(config.calendar).toBeDefined();
      expect(config.priorityRules).toBeDefined();
      expect(config.integrations).toBeDefined();
      expect(config.createdAt).toBeTruthy();
      expect(config.lastUpdated).toBeTruthy();
    });

    it('should set current timestamp for createdAt and lastUpdated', () => {
      const before = new Date().toISOString();
      const config = ConfigLoader.getDefaultConfig();
      const after = new Date().toISOString();

      expect(config.createdAt >= before).toBe(true);
      expect(config.createdAt <= after).toBe(true);
    });
  });

  describe('mergeConfig', () => {
    it('should merge partial updates into base config', () => {
      const base = ConfigLoader.getDefaultConfig();
      base.user.name = 'Original';

      const merged = ConfigLoader.mergeConfig(base, {
        user: { ...base.user, name: 'Updated' },
      });

      expect(merged.user.name).toBe('Updated');
      expect(merged.calendar).toEqual(base.calendar);
    });

    it('should update lastUpdated timestamp', () => {
      const base = ConfigLoader.getDefaultConfig();

      // Wait a tiny bit to ensure different timestamp
      const merged = ConfigLoader.mergeConfig(base, {});

      expect(merged.lastUpdated).toBeTruthy();
    });

    it('should preserve unmodified fields', () => {
      const base = ConfigLoader.getDefaultConfig();
      base.user.name = 'Test User';
      base.preferences.language = 'en';

      const merged = ConfigLoader.mergeConfig(base, {
        preferences: { ...base.preferences, language: 'ja' },
      });

      expect(merged.user.name).toBe('Test User');
      expect(merged.preferences.language).toBe('ja');
    });
  });

  describe('save and load integration', () => {
    // These tests would require mocking the file system paths
    // For now, we test the logic that doesn't require actual file I/O

    it('should throw error when loading non-existent file', async () => {
      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => join(testDir, 'nonexistent.json');

      await expect(ConfigLoader.load()).rejects.toThrow('Configuration file not found');

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should throw error when loading invalid JSON', async () => {
      const invalidJsonPath = join(testDir, 'invalid.json');
      await writeFile(invalidJsonPath, 'not valid json {{{');

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => invalidJsonPath;

      await expect(ConfigLoader.load()).rejects.toThrow();

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should throw error when loading config with missing required fields', async () => {
      const incompleteConfigPath = join(testDir, 'incomplete.json');
      await writeFile(incompleteConfigPath, JSON.stringify({ foo: 'bar' }));

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => incompleteConfigPath;

      await expect(ConfigLoader.load()).rejects.toThrow('Invalid configuration file structure');

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should successfully load valid config', async () => {
      const validConfig = ConfigLoader.getDefaultConfig();
      validConfig.user.name = 'Test User';

      const validConfigPath = join(testDir, 'valid.json');
      await writeFile(validConfigPath, JSON.stringify(validConfig));

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => validConfigPath;

      const loaded = await ConfigLoader.load();

      expect(loaded.user.name).toBe('Test User');
      expect(loaded.version).toBe(validConfig.version);

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should save config to file', async () => {
      const config = ConfigLoader.getDefaultConfig();
      config.user.name = 'Save Test';

      const saveDir = join(testDir, 'save-test');
      const savePath = join(saveDir, 'config.json');

      const originalGetConfigDir = ConfigLoader.getConfigDir;
      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigDir = () => saveDir;
      ConfigLoader.getConfigPath = () => savePath;

      await ConfigLoader.save(config);

      // Verify file exists
      await expect(access(savePath)).resolves.toBeUndefined();

      ConfigLoader.getConfigDir = originalGetConfigDir;
      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should auto-migrate config without calendar.sources', async () => {
      const legacyConfig = ConfigLoader.getDefaultConfig();
      // Remove calendar.sources to simulate legacy config
      delete (legacyConfig.calendar as { sources?: unknown }).sources;

      const migrationDir = join(testDir, 'migration-test');
      const migrationPath = join(migrationDir, 'config.json');

      await mkdir(migrationDir, { recursive: true });
      await writeFile(migrationPath, JSON.stringify(legacyConfig));

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => migrationPath;

      const loaded = await ConfigLoader.load();

      // Verify calendar.sources was added
      expect(loaded.calendar.sources).toBeDefined();
      expect(loaded.calendar.sources?.eventkit).toBeDefined();
      expect(loaded.calendar.sources?.google).toBeDefined();

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should reject config with invalid calendar.sources', async () => {
      const invalidConfig = ConfigLoader.getDefaultConfig();
      // Set both sources to disabled (invalid)
      invalidConfig.calendar.sources!.eventkit.enabled = false;
      invalidConfig.calendar.sources!.google.enabled = false;

      const invalidDir = join(testDir, 'invalid-test');

      await mkdir(invalidDir, { recursive: true });

      const originalGetConfigDir = ConfigLoader.getConfigDir;
      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigDir = () => invalidDir;
      ConfigLoader.getConfigPath = () => join(invalidDir, 'config.json');

      await expect(ConfigLoader.save(invalidConfig)).rejects.toThrow(
        'At least one calendar source must be enabled'
      );

      ConfigLoader.getConfigDir = originalGetConfigDir;
      ConfigLoader.getConfigPath = originalGetConfigPath;
    });

    it('should reject config when loading with invalid syncInterval', async () => {
      const invalidConfig = ConfigLoader.getDefaultConfig();
      // Set invalid syncInterval
      invalidConfig.calendar.sources!.google.syncInterval = 30; // Too low

      const invalidDir = join(testDir, 'invalid-sync-test');
      const invalidPath = join(invalidDir, 'config.json');

      await mkdir(invalidDir, { recursive: true });
      await writeFile(invalidPath, JSON.stringify(invalidConfig));

      const originalGetConfigPath = ConfigLoader.getConfigPath;
      ConfigLoader.getConfigPath = () => invalidPath;

      await expect(ConfigLoader.load()).rejects.toThrow(
        'Invalid calendar sources configuration'
      );

      ConfigLoader.getConfigPath = originalGetConfigPath;
    });
  });
});
