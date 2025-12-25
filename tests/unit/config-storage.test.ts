/**
 * Config Storage Unit Tests
 * Tests for platform-specific configuration storage
 * Requirements: 1.1, 1.5, 10.1
 *
 * 実装:
 * - desktop_mcp: ファイルベースストレージ
 * - remote_mcp: クラウドストレージ（セッションフォールバック）
 */

import { FileConfigStorage } from '../../src/config/storage/file-storage.js';
import { SessionConfigStorage } from '../../src/config/storage/session-storage.js';
import { ConfigStorageFactory } from '../../src/config/storage/storage-factory.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('FileConfigStorage', () => {
  const testDir = path.join(os.tmpdir(), 'sage-test-' + Date.now());
  const testPath = path.join(testDir, 'config.json');
  let storage: FileConfigStorage;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    storage = new FileConfigStorage(testPath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('exists', () => {
    it('should return false when file does not exist', async () => {
      const result = await storage.exists();
      expect(result).toBe(false);
    });

    it('should return true when file exists', async () => {
      await fs.writeFile(testPath, '{}');
      const result = await storage.exists();
      expect(result).toBe(true);
    });
  });

  describe('save and load', () => {
    it('should save and load config', async () => {
      const config = { user: { name: 'Test User' }, version: '1.0.0' };
      await storage.save(config);

      const loaded = await storage.load();
      expect(loaded).toEqual(config);
    });

    it('should throw error when loading non-existent file', async () => {
      await expect(storage.load()).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete config file', async () => {
      await fs.writeFile(testPath, '{}');
      await storage.delete();

      const exists = await storage.exists();
      expect(exists).toBe(false);
    });

    it('should not throw when deleting non-existent file', async () => {
      await expect(storage.delete()).resolves.not.toThrow();
    });
  });
});

describe('SessionConfigStorage', () => {
  let storage: SessionConfigStorage;

  beforeEach(() => {
    storage = new SessionConfigStorage();
  });

  describe('exists', () => {
    it('should return false initially', async () => {
      const result = await storage.exists();
      expect(result).toBe(false);
    });

    it('should return true after saving', async () => {
      await storage.save({ test: 'data' });
      const result = await storage.exists();
      expect(result).toBe(true);
    });
  });

  describe('save and load', () => {
    it('should save and load config in memory', async () => {
      const config = { user: { name: 'Session User' }, version: '1.0.0' };
      await storage.save(config);

      const loaded = await storage.load();
      expect(loaded).toEqual(config);
    });

    it('should return null when loading without save', async () => {
      const result = await storage.load();
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete session config', async () => {
      await storage.save({ test: 'data' });
      await storage.delete();

      const exists = await storage.exists();
      expect(exists).toBe(false);
    });
  });
});

describe('ConfigStorageFactory', () => {
  describe('create', () => {
    it('should create FileConfigStorage for desktop_mcp', () => {
      const storage = ConfigStorageFactory.create('desktop_mcp');
      expect(storage).toBeInstanceOf(FileConfigStorage);
    });

    it('should create SessionConfigStorage for remote_mcp', () => {
      const storage = ConfigStorageFactory.create('remote_mcp');
      expect(storage).toBeInstanceOf(SessionConfigStorage);
    });
  });

  describe('getStorageType', () => {
    it('should return file for desktop_mcp', () => {
      expect(ConfigStorageFactory.getStorageType('desktop_mcp')).toBe('file');
    });

    it('should return cloud for remote_mcp', () => {
      expect(ConfigStorageFactory.getStorageType('remote_mcp')).toBe('cloud');
    });
  });

  describe('isPersistent', () => {
    it('should return true for desktop_mcp', () => {
      expect(ConfigStorageFactory.isPersistent('desktop_mcp')).toBe(true);
    });

    it('should return true for remote_mcp (cloud storage)', () => {
      expect(ConfigStorageFactory.isPersistent('remote_mcp')).toBe(true);
    });
  });

  describe('getStorageDescription', () => {
    it('should return file description for desktop_mcp', () => {
      const desc = ConfigStorageFactory.getStorageDescription('desktop_mcp');
      expect(desc).toContain('~/.sage/config.json');
    });

    it('should return cloud description for remote_mcp', () => {
      const desc = ConfigStorageFactory.getStorageDescription('remote_mcp');
      expect(desc).toContain('クラウドストレージ');
    });
  });
});
