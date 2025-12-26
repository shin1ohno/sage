/**
 * Main Entry Point Unit Tests
 * Requirements: 14.1, 14.2, 14.3
 *
 * TDD: RED phase - Writing tests before implementation
 */

import {
  startServer,
  ServerMode,
  ServerStartResult,
} from '../../src/cli/main-entry.js';
import { CLIOptions } from '../../src/cli/parser.js';

// Mock the MCP server creation
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    tool: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({})),
}));

describe('Main Entry Point', () => {
  describe('startServer', () => {
    describe('mode detection', () => {
      it('should start in stdio mode when remote is false', async () => {
        const options: CLIOptions = {
          remote: false,
          port: 3000,
          host: '0.0.0.0',
          help: false,
          version: false,
        };

        const result = await startServer(options);

        expect(result.mode).toBe('stdio');
        expect(result.success).toBe(true);
      });

      it('should start in http mode when remote is true', async () => {
        const options: CLIOptions = {
          remote: true,
          port: 3200,
          host: '127.0.0.1',
          help: false,
          version: false,
        };

        const result = await startServer(options);

        expect(result.mode).toBe('http');
        expect(result.success).toBe(true);
        expect(result.port).toBe(3200);
        expect(result.host).toBe('127.0.0.1');

        // Cleanup
        if (result.stop) {
          await result.stop();
        }
      });
    });

    describe('help and version', () => {
      it('should return help message when help is true', async () => {
        const options: CLIOptions = {
          remote: false,
          port: 3000,
          host: '0.0.0.0',
          help: true,
          version: false,
        };

        const result = await startServer(options);

        expect(result.mode).toBe('help');
        expect(result.message).toBeDefined();
        expect(result.message).toContain('sage');
      });

      it('should return version when version is true', async () => {
        const options: CLIOptions = {
          remote: false,
          port: 3000,
          host: '0.0.0.0',
          help: false,
          version: true,
        };

        const result = await startServer(options);

        expect(result.mode).toBe('version');
        expect(result.message).toBeDefined();
        expect(result.message).toMatch(/\d+\.\d+\.\d+/);
      });
    });

    describe('custom config path', () => {
      it('should use custom config path when provided', async () => {
        const options: CLIOptions = {
          remote: false,
          port: 3000,
          host: '0.0.0.0',
          config: '/custom/config.json',
          help: false,
          version: false,
        };

        const result = await startServer(options);

        expect(result.success).toBe(true);
        expect(result.configPath).toBe('/custom/config.json');
      });
    });

    describe('HTTP server options', () => {
      it('should use authSecret when provided', async () => {
        const options: CLIOptions = {
          remote: true,
          port: 3201,
          host: '127.0.0.1',
          help: false,
          version: false,
          authSecret: 'test-secret',
        };

        const result = await startServer(options);

        expect(result.success).toBe(true);
        expect(result.authEnabled).toBe(true);

        // Cleanup
        if (result.stop) {
          await result.stop();
        }
      });
    });
  });

  describe('ServerMode', () => {
    it('should have all expected modes', () => {
      const modes: ServerMode[] = ['stdio', 'http', 'help', 'version'];
      expect(modes).toContain('stdio');
      expect(modes).toContain('http');
      expect(modes).toContain('help');
      expect(modes).toContain('version');
    });
  });

  describe('ServerStartResult', () => {
    it('should have required fields for stdio mode', () => {
      const result: ServerStartResult = {
        mode: 'stdio',
        success: true,
      };

      expect(result.mode).toBe('stdio');
      expect(result.success).toBe(true);
    });

    it('should have required fields for http mode', () => {
      const result: ServerStartResult = {
        mode: 'http',
        success: true,
        port: 3000,
        host: '0.0.0.0',
        stop: async () => {},
      };

      expect(result.mode).toBe('http');
      expect(result.port).toBe(3000);
      expect(result.host).toBe('0.0.0.0');
      expect(result.stop).toBeDefined();
    });

    it('should have message field for help mode', () => {
      const result: ServerStartResult = {
        mode: 'help',
        success: true,
        message: 'Help message',
      };

      expect(result.message).toBeDefined();
    });
  });
});
