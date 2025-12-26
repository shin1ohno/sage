/**
 * CLI Parser Unit Tests
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8
 *
 * TDD: RED phase - Writing tests before implementation
 */

import { parseArgs, CLIOptions } from '../../src/cli/parser.js';

describe('CLI Parser', () => {
  // Store original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env vars before each test
    process.env = { ...originalEnv };
    delete process.env.SAGE_REMOTE_MODE;
    delete process.env.SAGE_PORT;
    delete process.env.SAGE_HOST;
    delete process.env.SAGE_CONFIG_PATH;
    delete process.env.SAGE_AUTH_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('parseArgs', () => {
    describe('default values', () => {
      it('should return undefined port/host when no arguments provided (allows config file fallback)', () => {
        const result = parseArgs([]);

        expect(result.remote).toBe(false);
        expect(result.port).toBeUndefined(); // Config file fallback
        expect(result.host).toBeUndefined(); // Config file fallback
        expect(result.config).toBeUndefined();
        expect(result.help).toBe(false);
        expect(result.version).toBe(false);
      });
    });

    describe('--remote option', () => {
      it('should set remote to true when --remote flag is provided', () => {
        const result = parseArgs(['--remote']);

        expect(result.remote).toBe(true);
      });

      it('should set remote to true when -r flag is provided', () => {
        const result = parseArgs(['-r']);

        expect(result.remote).toBe(true);
      });
    });

    describe('--config option', () => {
      it('should set config path when --config is provided', () => {
        const result = parseArgs(['--config', '/path/to/config.json']);

        expect(result.config).toBe('/path/to/config.json');
      });

      it('should set config path when -c is provided', () => {
        const result = parseArgs(['-c', '/path/to/config.json']);

        expect(result.config).toBe('/path/to/config.json');
      });
    });

    describe('--port option', () => {
      it('should set port when --port is provided', () => {
        const result = parseArgs(['--port', '8080']);

        expect(result.port).toBe(8080);
      });

      it('should set port when -p is provided', () => {
        const result = parseArgs(['-p', '9000']);

        expect(result.port).toBe(9000);
      });

      it('should use default port when invalid port is provided', () => {
        const result = parseArgs(['--port', 'invalid']);

        expect(result.port).toBe(3000);
      });

      it('should use default port when port is out of range', () => {
        const result = parseArgs(['--port', '99999']);

        expect(result.port).toBe(3000);
      });
    });

    describe('--host option', () => {
      it('should set host when --host is provided', () => {
        const result = parseArgs(['--host', '127.0.0.1']);

        expect(result.host).toBe('127.0.0.1');
      });

      it('should set host when -H is provided', () => {
        const result = parseArgs(['-H', 'localhost']);

        expect(result.host).toBe('localhost');
      });
    });

    describe('--help option', () => {
      it('should set help to true when --help is provided', () => {
        const result = parseArgs(['--help']);

        expect(result.help).toBe(true);
      });

      it('should set help to true when -h is provided', () => {
        const result = parseArgs(['-h']);

        expect(result.help).toBe(true);
      });
    });

    describe('--version option', () => {
      it('should set version to true when --version is provided', () => {
        const result = parseArgs(['--version']);

        expect(result.version).toBe(true);
      });

      it('should set version to true when -v is provided', () => {
        const result = parseArgs(['-v']);

        expect(result.version).toBe(true);
      });
    });

    describe('combined options', () => {
      it('should parse multiple options correctly', () => {
        const result = parseArgs([
          '--remote',
          '--port', '8080',
          '--host', '127.0.0.1',
          '--config', '/custom/config.json',
        ]);

        expect(result.remote).toBe(true);
        expect(result.port).toBe(8080);
        expect(result.host).toBe('127.0.0.1');
        expect(result.config).toBe('/custom/config.json');
      });

      it('should parse short options correctly', () => {
        const result = parseArgs([
          '-r',
          '-p', '8080',
          '-H', '127.0.0.1',
          '-c', '/custom/config.json',
        ]);

        expect(result.remote).toBe(true);
        expect(result.port).toBe(8080);
        expect(result.host).toBe('127.0.0.1');
        expect(result.config).toBe('/custom/config.json');
      });
    });
  });

  describe('environment variables', () => {
    describe('SAGE_REMOTE_MODE', () => {
      it('should set remote to true when SAGE_REMOTE_MODE=true', () => {
        process.env.SAGE_REMOTE_MODE = 'true';

        const result = parseArgs([]);

        expect(result.remote).toBe(true);
      });

      it('should not set remote when SAGE_REMOTE_MODE is not "true"', () => {
        process.env.SAGE_REMOTE_MODE = 'false';

        const result = parseArgs([]);

        expect(result.remote).toBe(false);
      });

      it('should prioritize CLI flag over env var', () => {
        process.env.SAGE_REMOTE_MODE = 'false';

        const result = parseArgs(['--remote']);

        expect(result.remote).toBe(true);
      });
    });

    describe('SAGE_PORT', () => {
      it('should use SAGE_PORT when set', () => {
        process.env.SAGE_PORT = '4000';

        const result = parseArgs([]);

        expect(result.port).toBe(4000);
      });

      it('should prioritize CLI --port over env var', () => {
        process.env.SAGE_PORT = '4000';

        const result = parseArgs(['--port', '5000']);

        expect(result.port).toBe(5000);
      });
    });

    describe('SAGE_HOST', () => {
      it('should use SAGE_HOST when set', () => {
        process.env.SAGE_HOST = '192.168.1.1';

        const result = parseArgs([]);

        expect(result.host).toBe('192.168.1.1');
      });

      it('should prioritize CLI --host over env var', () => {
        process.env.SAGE_HOST = '192.168.1.1';

        const result = parseArgs(['--host', '10.0.0.1']);

        expect(result.host).toBe('10.0.0.1');
      });
    });

    describe('SAGE_CONFIG_PATH', () => {
      it('should use SAGE_CONFIG_PATH when set', () => {
        process.env.SAGE_CONFIG_PATH = '/env/config.json';

        const result = parseArgs([]);

        expect(result.config).toBe('/env/config.json');
      });

      it('should prioritize CLI --config over env var', () => {
        process.env.SAGE_CONFIG_PATH = '/env/config.json';

        const result = parseArgs(['--config', '/cli/config.json']);

        expect(result.config).toBe('/cli/config.json');
      });
    });

    describe('SAGE_AUTH_SECRET', () => {
      it('should use SAGE_AUTH_SECRET when set', () => {
        process.env.SAGE_AUTH_SECRET = 'my-secret-key';

        const result = parseArgs([]);

        expect(result.authSecret).toBe('my-secret-key');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle unknown options gracefully', () => {
      const result = parseArgs(['--unknown-option']);

      expect(result.remote).toBe(false);
      expect(result.port).toBeUndefined(); // Config file fallback
    });

    it('should handle missing value for --port', () => {
      const result = parseArgs(['--port']);

      expect(result.port).toBeUndefined(); // Config file fallback
    });

    it('should handle missing value for --config', () => {
      const result = parseArgs(['--config']);

      expect(result.config).toBeUndefined();
    });

    it('should handle empty string values', () => {
      const result = parseArgs(['--host', '']);

      expect(result.host).toBeUndefined(); // Empty string treated as not specified
    });
  });
});

describe('CLIOptions interface', () => {
  it('should have all required fields', () => {
    const options: CLIOptions = {
      remote: true,
      port: 3000,
      host: '0.0.0.0',
      config: '/path/to/config.json',
      help: false,
      version: false,
      authSecret: 'secret',
    };

    expect(options.remote).toBeDefined();
    expect(options.port).toBeDefined();
    expect(options.host).toBeDefined();
    expect(options.config).toBeDefined();
    expect(options.help).toBeDefined();
    expect(options.version).toBeDefined();
    expect(options.authSecret).toBeDefined();
  });

  it('should allow undefined port to enable config file fallback', () => {
    // BUG FIX: When no port is specified via CLI or env, port should be undefined
    // so that the config file's port can be used as fallback
    const options: CLIOptions = {
      remote: true,
      port: undefined,
      host: undefined,
      help: false,
      version: false,
    };

    expect(options.port).toBeUndefined();
    expect(options.host).toBeUndefined();
  });
});

describe('parseArgs config file fallback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SAGE_PORT;
    delete process.env.SAGE_HOST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return undefined port when no port specified via CLI or env', () => {
    // This is the BUG: port should be undefined, not 3000
    // When undefined, http-server-with-config will use config file's port
    const result = parseArgs(['--remote']);

    // FIX: port should be undefined to allow config file fallback
    expect(result.port).toBeUndefined();
  });

  it('should return undefined host when no host specified via CLI or env', () => {
    const result = parseArgs(['--remote']);

    // FIX: host should be undefined to allow config file fallback
    expect(result.host).toBeUndefined();
  });

  it('should return explicit port when specified via CLI', () => {
    const result = parseArgs(['--remote', '--port', '8080']);

    expect(result.port).toBe(8080);
  });

  it('should return env port when specified via env', () => {
    process.env.SAGE_PORT = '9000';
    const result = parseArgs(['--remote']);

    expect(result.port).toBe(9000);
  });
});
