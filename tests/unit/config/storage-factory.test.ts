/**
 * ConfigStorageFactory Tests
 * Tests for platform-specific config storage creation
 */

import { ConfigStorageFactory } from '../../../src/config/storage/storage-factory.js';
import { FileConfigStorage } from '../../../src/config/storage/file-storage.js';
import { SessionConfigStorage } from '../../../src/config/storage/session-storage.js';

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

    it('should create SessionConfigStorage for unknown platform type', () => {
      const storage = ConfigStorageFactory.create('unknown' as any);
      expect(storage).toBeInstanceOf(SessionConfigStorage);
    });
  });

  describe('getStorageType', () => {
    it('should return "file" for desktop_mcp', () => {
      expect(ConfigStorageFactory.getStorageType('desktop_mcp')).toBe('file');
    });

    it('should return "cloud" for remote_mcp', () => {
      expect(ConfigStorageFactory.getStorageType('remote_mcp')).toBe('cloud');
    });

    it('should return "session" for unknown platform type', () => {
      expect(ConfigStorageFactory.getStorageType('unknown' as any)).toBe('session');
    });
  });

  describe('isPersistent', () => {
    it('should return true for desktop_mcp', () => {
      expect(ConfigStorageFactory.isPersistent('desktop_mcp')).toBe(true);
    });

    it('should return true for remote_mcp', () => {
      expect(ConfigStorageFactory.isPersistent('remote_mcp')).toBe(true);
    });

    it('should return false for unknown platform type', () => {
      expect(ConfigStorageFactory.isPersistent('unknown' as any)).toBe(false);
    });
  });

  describe('getStorageDescription', () => {
    it('should return file storage description for desktop_mcp', () => {
      const description = ConfigStorageFactory.getStorageDescription('desktop_mcp');
      expect(description).toContain('.sage/config.json');
    });

    it('should return cloud storage description for remote_mcp', () => {
      const description = ConfigStorageFactory.getStorageDescription('remote_mcp');
      expect(description).toContain('クラウドストレージ');
    });

    it('should return session storage description for unknown platform type', () => {
      const description = ConfigStorageFactory.getStorageDescription('unknown' as any);
      expect(description).toContain('セッション終了時');
    });
  });
});
