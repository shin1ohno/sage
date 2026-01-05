/**
 * Encryption Service Tests
 * Requirements: FR-4 (Encryption Key Management)
 *
 * Comprehensive tests for the EncryptionService implementation.
 */

import { EncryptionService } from '../../src/oauth/encryption-service.js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

// Mock filesystem modules
jest.mock('fs/promises');
jest.mock('fs');

describe('EncryptionService', () => {
  const mockKeyStoragePath = '/mock/.sage/oauth_encryption_key';
  const mockEncryptionKey = 'mock-encryption-key-32-chars!!';

  let service: EncryptionService;
  let mockReadFile: jest.MockedFunction<typeof fs.readFile>;
  let mockWriteFile: jest.MockedFunction<typeof fs.writeFile>;
  let mockMkdir: jest.MockedFunction<typeof fs.mkdir>;
  let mockChmod: jest.MockedFunction<typeof fs.chmod>;
  let mockRename: jest.MockedFunction<typeof fs.rename>;
  let mockUnlink: jest.MockedFunction<typeof fs.unlink>;
  let mockExistsSync: jest.MockedFunction<typeof fsSync.existsSync>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get mocked functions
    mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
    mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
    mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
    mockChmod = fs.chmod as jest.MockedFunction<typeof fs.chmod>;
    mockRename = fs.rename as jest.MockedFunction<typeof fs.rename>;
    mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
    mockExistsSync = fsSync.existsSync as jest.MockedFunction<typeof fsSync.existsSync>;

    // Default mock implementations
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockChmod.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      service = new EncryptionService();
      expect(service).toBeDefined();
      expect(service.isInitialized()).toBe(false);
    });

    it('should initialize with custom key storage path', () => {
      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      expect(service.getKeyStoragePath()).toBe(mockKeyStoragePath);
    });

    it('should initialize with provided encryption key', () => {
      service = new EncryptionService({ encryptionKey: mockEncryptionKey });
      expect(service).toBeDefined();
    });
  });

  describe('initialize()', () => {
    afterEach(() => {
      // Clean up environment variable
      delete process.env.SAGE_ENCRYPTION_KEY;
    });

    it('should use SAGE_ENCRYPTION_KEY environment variable (priority 1)', async () => {
      const envKey = 'env-encryption-key-32-chars!!!';
      process.env.SAGE_ENCRYPTION_KEY = envKey;

      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should load key from file if env var not set (priority 2)', async () => {
      delete process.env.SAGE_ENCRYPTION_KEY;
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(`${mockEncryptionKey}\n` as any);

      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(mockReadFile).toHaveBeenCalledWith(mockKeyStoragePath, 'utf-8');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should generate and save new key if no key exists (priority 3)', async () => {
      delete process.env.SAGE_ENCRYPTION_KEY;
      mockExistsSync.mockReturnValue(false);

      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockKeyStoragePath,
        expect.any(String),
        { mode: 0o600 }
      );
      expect(mockChmod).toHaveBeenCalledWith(mockKeyStoragePath, 0o600);
    });

    it('should handle file read errors and fall back to generation', async () => {
      delete process.env.SAGE_ENCRYPTION_KEY;
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();

      expect(service.isInitialized()).toBe(true);
      expect(mockWriteFile).toHaveBeenCalled(); // Fell back to generation
    });

    it('should not reinitialize if already initialized', async () => {
      process.env.SAGE_ENCRYPTION_KEY = mockEncryptionKey;

      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();
      await service.initialize(); // Call again

      expect(service.isInitialized()).toBe(true);
      // Should only be called once (not twice)
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should create directory with secure permissions', async () => {
      delete process.env.SAGE_ENCRYPTION_KEY;
      mockExistsSync.mockReturnValue(false);

      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.sage'),
        { recursive: true, mode: 0o700 }
      );
    });

    it('should handle chmod failures gracefully (e.g., Windows)', async () => {
      delete process.env.SAGE_ENCRYPTION_KEY;
      mockExistsSync.mockReturnValue(false);
      mockChmod.mockRejectedValue(new Error('chmod not supported'));

      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize(); // Should not throw

      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('encrypt() and decrypt()', () => {
    beforeEach(async () => {
      process.env.SAGE_ENCRYPTION_KEY = mockEncryptionKey;
      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();
    });

    afterEach(() => {
      delete process.env.SAGE_ENCRYPTION_KEY;
    });

    it('should encrypt and decrypt data successfully (round-trip)', async () => {
      const plaintext = 'sensitive data 12345';

      const encrypted = await service.encrypt(plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(':').length).toBe(4); // salt:iv:authTag:encrypted

      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', async () => {
      const plaintext = 'test data';

      const encrypted1 = await service.encrypt(plaintext);
      const encrypted2 = await service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Different due to random IV
      expect(await service.decrypt(encrypted1)).toBe(plaintext);
      expect(await service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty strings', async () => {
      const plaintext = '';

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle large data', async () => {
      const plaintext = 'x'.repeat(10000); // 10KB of data

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters and unicode', async () => {
      const plaintext = 'Hello 世界! 🎉 Special chars: \n\t\r\0';

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error if encrypting before initialization', async () => {
      const uninitializedService = new EncryptionService();

      await expect(uninitializedService.encrypt('data')).rejects.toThrow(
        'EncryptionService not initialized'
      );
    });

    it('should throw error if decrypting before initialization', async () => {
      const uninitializedService = new EncryptionService();

      await expect(uninitializedService.decrypt('fake:data:here:test')).rejects.toThrow(
        'EncryptionService not initialized'
      );
    });

    it('should reject invalid encrypted data format', async () => {
      await expect(service.decrypt('invalid-format')).rejects.toThrow();
      await expect(service.decrypt('only:two:parts')).rejects.toThrow();
      await expect(service.decrypt('too:many:parts:here:extra')).rejects.toThrow();
    });

    it('should reject tampered ciphertext', async () => {
      const plaintext = 'important data';
      const encrypted = await service.encrypt(plaintext);

      // Tamper with the encrypted data
      const parts = encrypted.split(':');
      parts[3] = parts[3].slice(0, -2) + 'XX'; // Change last 2 chars of ciphertext
      const tampered = parts.join(':');

      await expect(service.decrypt(tampered)).rejects.toThrow();
    });

    it('should reject tampered auth tag', async () => {
      const plaintext = 'important data';
      const encrypted = await service.encrypt(plaintext);

      // Tamper with the auth tag
      const parts = encrypted.split(':');
      parts[2] = parts[2].slice(0, -2) + 'FF'; // Change auth tag
      const tampered = parts.join(':');

      await expect(service.decrypt(tampered)).rejects.toThrow();
    });
  });

  describe('encryptToFile()', () => {
    beforeEach(async () => {
      process.env.SAGE_ENCRYPTION_KEY = mockEncryptionKey;
      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();
    });

    afterEach(() => {
      delete process.env.SAGE_ENCRYPTION_KEY;
    });

    it('should encrypt and save data to file atomically', async () => {
      const data = 'test data';
      const filePath = '/mock/.sage/test.enc';
      const tempPath = `${filePath}.tmp`;

      await service.encryptToFile(data, filePath);

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledWith(
        tempPath,
        expect.any(String),
        { mode: 0o600 }
      );
      expect(mockChmod).toHaveBeenCalledWith(tempPath, 0o600);
      expect(mockRename).toHaveBeenCalledWith(tempPath, filePath);
    });

    it('should clean up temp file on write failure', async () => {
      const data = 'test data';
      const filePath = '/mock/.sage/test.enc';
      const tempPath = `${filePath}.tmp`;

      mockRename.mockRejectedValue(new Error('Disk full'));

      await expect(service.encryptToFile(data, filePath)).rejects.toThrow('Disk full');

      expect(mockUnlink).toHaveBeenCalledWith(tempPath);
    });

    it('should handle chmod failures gracefully (e.g., Windows)', async () => {
      const data = 'test data';
      const filePath = '/mock/.sage/test.enc';

      mockChmod.mockRejectedValue(new Error('chmod not supported'));

      await service.encryptToFile(data, filePath); // Should not throw

      expect(mockRename).toHaveBeenCalled(); // Still completed the operation
    });

    it('should create directory if it does not exist', async () => {
      const data = 'test data';
      const filePath = '/mock/.sage/new/test.enc';

      await service.encryptToFile(data, filePath);

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('.sage'),
        { recursive: true, mode: 0o700 }
      );
    });
  });

  describe('decryptFromFile()', () => {
    beforeEach(async () => {
      process.env.SAGE_ENCRYPTION_KEY = mockEncryptionKey;
      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();
    });

    afterEach(() => {
      delete process.env.SAGE_ENCRYPTION_KEY;
    });

    it('should load and decrypt data from file', async () => {
      const plaintext = 'file data';
      const encrypted = await service.encrypt(plaintext);
      const filePath = '/mock/.sage/test.enc';

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(encrypted as any);

      const result = await service.decryptFromFile(filePath);

      expect(result).toBe(plaintext);
      expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
    });

    it('should return null if file does not exist', async () => {
      const filePath = '/mock/.sage/nonexistent.enc';

      mockExistsSync.mockReturnValue(false);

      const result = await service.decryptFromFile(filePath);

      expect(result).toBeNull();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should return null on decryption errors', async () => {
      const filePath = '/mock/.sage/corrupted.enc';

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('invalid:encrypted:data:here' as any);

      const result = await service.decryptFromFile(filePath);

      expect(result).toBeNull(); // Graceful failure
    });

    it('should return null on file read errors', async () => {
      const filePath = '/mock/.sage/test.enc';

      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const result = await service.decryptFromFile(filePath);

      expect(result).toBeNull();
    });
  });

  describe('Integration: encryptToFile() and decryptFromFile()', () => {
    beforeEach(async () => {
      process.env.SAGE_ENCRYPTION_KEY = mockEncryptionKey;
      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      await service.initialize();
    });

    afterEach(() => {
      delete process.env.SAGE_ENCRYPTION_KEY;
    });

    it('should write and read data successfully (round-trip)', async () => {
      const plaintext = JSON.stringify({
        tokens: ['token1', 'token2'],
        metadata: { created: Date.now() },
      });
      const filePath = '/mock/.sage/data.enc';

      let capturedEncrypted: string | undefined;

      // Capture encrypted data written to file
      mockWriteFile.mockImplementation(async (path, data) => {
        if (path === `${filePath}.tmp`) {
          capturedEncrypted = data as string;
        }
        return undefined;
      });

      // Write to file
      await service.encryptToFile(plaintext, filePath);
      expect(capturedEncrypted).toBeDefined();

      // Mock file read to return captured encrypted data
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(capturedEncrypted as any);

      // Read from file
      const result = await service.decryptFromFile(filePath);

      expect(result).toBe(plaintext);
    });
  });

  describe('isInitialized()', () => {
    it('should return false before initialization', () => {
      service = new EncryptionService();
      expect(service.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      process.env.SAGE_ENCRYPTION_KEY = mockEncryptionKey;
      service = new EncryptionService();
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
      delete process.env.SAGE_ENCRYPTION_KEY;
    });
  });

  describe('getKeyStoragePath()', () => {
    it('should return default storage path', () => {
      service = new EncryptionService();
      expect(service.getKeyStoragePath()).toContain('.sage');
      expect(service.getKeyStoragePath()).toContain('oauth_encryption_key');
    });

    it('should return custom storage path', () => {
      service = new EncryptionService({ keyStoragePath: mockKeyStoragePath });
      expect(service.getKeyStoragePath()).toBe(mockKeyStoragePath);
    });
  });
});
