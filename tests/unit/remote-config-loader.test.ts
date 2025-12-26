/**
 * Remote Config Loader Unit Tests
 * Requirements: 15.1, 15.2, 15.3, 15.10
 *
 * TDD: RED phase - Writing tests before implementation
 */

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, writeFile, rm } from 'fs/promises';
import {
  loadRemoteConfig,
  RemoteConfig,
  validateRemoteConfig,
  getDefaultRemoteConfig,
  DEFAULT_REMOTE_CONFIG_PATH,
} from '../../src/cli/remote-config-loader.js';

describe('Remote Config Loader', () => {
  const testDir = join(tmpdir(), 'sage-remote-config-test-' + Date.now());

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

  describe('getDefaultRemoteConfig', () => {
    it('should return default configuration', () => {
      const config = getDefaultRemoteConfig();

      expect(config.remote.enabled).toBe(false);
      expect(config.remote.port).toBe(3000);
      expect(config.remote.host).toBe('0.0.0.0');
      expect(config.remote.auth.type).toBe('none');
      expect(config.remote.cors.allowedOrigins).toContain('*');
    });
  });

  describe('DEFAULT_REMOTE_CONFIG_PATH', () => {
    it('should point to ~/.sage/remote-config.json', () => {
      expect(DEFAULT_REMOTE_CONFIG_PATH).toContain('.sage');
      expect(DEFAULT_REMOTE_CONFIG_PATH).toContain('remote-config.json');
    });
  });

  describe('loadRemoteConfig', () => {
    it('should load config from specified path', async () => {
      const configPath = join(testDir, 'custom-config.json');
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 8080,
          host: '127.0.0.1',
          auth: {
            type: 'jwt',
            secret: 'test-secret-key-at-least-32-characters-long',
            expiresIn: '1h',
          },
          cors: {
            allowedOrigins: ['https://example.com'],
          },
        },
      };
      await writeFile(configPath, JSON.stringify(config));

      const loaded = await loadRemoteConfig(configPath);

      expect(loaded.remote.enabled).toBe(true);
      expect(loaded.remote.port).toBe(8080);
      expect(loaded.remote.host).toBe('127.0.0.1');
      expect(loaded.remote.auth.type).toBe('jwt');
      if (loaded.remote.auth.type === 'jwt') {
        expect(loaded.remote.auth.secret).toBe('test-secret-key-at-least-32-characters-long');
        expect(loaded.remote.auth.expiresIn).toBe('1h');
      }
      expect(loaded.remote.cors.allowedOrigins).toContain('https://example.com');
    });

    it('should return default config when file does not exist', async () => {
      const nonExistentPath = join(testDir, 'nonexistent.json');

      const loaded = await loadRemoteConfig(nonExistentPath);

      expect(loaded.remote.enabled).toBe(false);
      expect(loaded.remote.port).toBe(3000);
    });

    it('should merge partial config with defaults', async () => {
      const configPath = join(testDir, 'partial-config.json');
      const partialConfig = {
        remote: {
          enabled: true,
          port: 9000,
          // Missing host, auth, cors - should use defaults
        },
      };
      await writeFile(configPath, JSON.stringify(partialConfig));

      const loaded = await loadRemoteConfig(configPath);

      expect(loaded.remote.enabled).toBe(true);
      expect(loaded.remote.port).toBe(9000);
      expect(loaded.remote.host).toBe('0.0.0.0'); // Default
      expect(loaded.remote.auth.type).toBe('none'); // Default
      expect(loaded.remote.cors.allowedOrigins).toContain('*'); // Default
    });

    it('should throw error for invalid JSON', async () => {
      const configPath = join(testDir, 'invalid.json');
      await writeFile(configPath, 'not valid json {{{');

      await expect(loadRemoteConfig(configPath)).rejects.toThrow();
    });

    it('should load from default path when no path specified', async () => {
      // This test verifies the function signature accepts undefined
      // The actual default path behavior is tested in integration tests
      const loaded = await loadRemoteConfig();

      // Should return default config if default path doesn't exist
      expect(loaded.remote).toBeDefined();
    });
  });

  describe('validateRemoteConfig', () => {
    it('should validate a complete valid config', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 3000,
          host: '0.0.0.0',
          auth: {
            type: 'jwt',
            secret: 'a-very-long-secret-key-for-jwt-signing',
            expiresIn: '24h',
          },
          cors: {
            allowedOrigins: ['*'],
          },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid port number', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 99999,
          host: '0.0.0.0',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid port number');
    });

    it('should reject negative port number', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: -1,
          host: '0.0.0.0',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(false);
    });

    it('should reject jwt auth without secret', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 3000,
          host: '0.0.0.0',
          auth: {
            type: 'jwt',
            // Missing secret
          },
          cors: { allowedOrigins: ['*'] },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('secret'))).toBe(true);
    });

    it('should reject short secret for jwt auth', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 3000,
          host: '0.0.0.0',
          auth: {
            type: 'jwt',
            secret: 'short', // Too short
          },
          cors: { allowedOrigins: ['*'] },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('32'))).toBe(true);
    });

    it('should accept auth type none without secret', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 3000,
          host: '0.0.0.0',
          auth: { type: 'none' },
          cors: { allowedOrigins: ['*'] },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(true);
    });

    it('should reject empty allowedOrigins', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 3000,
          host: '0.0.0.0',
          auth: { type: 'none' },
          cors: { allowedOrigins: [] },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('allowedOrigins'))).toBe(true);
    });

    it('should validate expiresIn format', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 3000,
          host: '0.0.0.0',
          auth: {
            type: 'jwt',
            secret: 'a-very-long-secret-key-for-jwt-signing',
            expiresIn: 'invalid-format',
          },
          cors: { allowedOrigins: ['*'] },
        },
      };

      const result = validateRemoteConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('expiresIn'))).toBe(true);
    });

    it('should accept valid expiresIn formats', () => {
      const validFormats = ['1h', '24h', '7d', '30m', '1w'];

      for (const expiresIn of validFormats) {
        const config: RemoteConfig = {
          remote: {
            enabled: true,
            port: 3000,
            host: '0.0.0.0',
            auth: {
              type: 'jwt',
              secret: 'a-very-long-secret-key-for-jwt-signing',
              expiresIn,
            },
            cors: { allowedOrigins: ['*'] },
          },
        };

        const result = validateRemoteConfig(config);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('RemoteConfig interface', () => {
    it('should have all required fields', () => {
      const config: RemoteConfig = {
        remote: {
          enabled: true,
          port: 3000,
          host: '0.0.0.0',
          auth: {
            type: 'jwt',
            secret: 'test-secret',
            expiresIn: '24h',
          },
          cors: {
            allowedOrigins: ['*'],
          },
        },
      };

      expect(config.remote.enabled).toBeDefined();
      expect(config.remote.port).toBeDefined();
      expect(config.remote.host).toBeDefined();
      expect(config.remote.auth.type).toBeDefined();
      expect(config.remote.cors.allowedOrigins).toBeDefined();
    });
  });
});
