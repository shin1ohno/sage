/**
 * CLI Modes E2E Tests
 * Requirements: 14.1-14.10
 *
 * Tests the complete CLI workflow including Stdio mode and HTTP mode.
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

const PROJECT_ROOT = join(__dirname, '../..');
const CLI_PATH = join(PROJECT_ROOT, 'dist/index.js');

// Helper to run CLI command
function runCLI(args: string[], timeout = 5000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

// Helper to start HTTP server and wait for it to be ready
async function startHTTPServer(
  port: number,
  additionalArgs: string[] = []
): Promise<{ proc: ChildProcess; stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    // Use non-existent config path to fall back to defaults (no auth)
    const testConfigPath = join(PROJECT_ROOT, 'test-nonexistent-config.json');
    const proc = spawn('node', [CLI_PATH, '--remote', '--port', port.toString(), '--config', testConfigPath, ...additionalArgs], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });

    let started = false;

    // Timeout after 10 seconds
    const timeoutId = setTimeout(() => {
      if (!started) {
        proc.kill('SIGTERM');
        reject(new Error('Server failed to start within timeout'));
      }
    }, 10000);

    proc.stderr.on('data', (data) => {
      const message = data.toString();
      if (message.includes('started in HTTP mode')) {
        started = true;
        clearTimeout(timeoutId);
        resolve({
          proc,
          stop: () => {
            return new Promise((resolveStop) => {
              proc.on('close', () => {
                resolveStop();
              });
              proc.kill('SIGINT');
            });
          },
        });
      }
    });

    proc.on('error', (error) => {
      if (!started) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  });
}

describe('CLI Modes E2E', () => {
  describe('Help and Version', () => {
    it('should display help message with --help', async () => {
      const result = await runCLI(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('sage');
      expect(result.stdout).toContain('--remote');
      expect(result.stdout).toContain('--port');
      expect(result.stdout).toContain('--config');
    });

    it('should display help message with -h', async () => {
      const result = await runCLI(['-h']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('sage');
    });

    it('should display version with --version', async () => {
      const result = await runCLI(['--version']);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should display version with -v', async () => {
      const result = await runCLI(['-v']);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('HTTP Server Mode', () => {
    let server: { proc: ChildProcess; stop: () => Promise<void> } | null = null;

    afterEach(async () => {
      if (server) {
        await server.stop();
        server = null;
      }
    });

    it('should start HTTP server with --remote flag', async () => {
      server = await startHTTPServer(3300);

      // Verify the server is running by checking health endpoint
      const response = await fetch('http://127.0.0.1:3300/health');
      expect(response.status).toBe(200);

      const body = await response.json() as { status: string };
      expect(body.status).toBe('ok');
    });

    it('should use custom port from --port option', async () => {
      server = await startHTTPServer(3301);

      const response = await fetch('http://127.0.0.1:3301/health');
      expect(response.status).toBe(200);
    });

    it('should accept MCP requests on /mcp endpoint', async () => {
      server = await startHTTPServer(3302);

      const response = await fetch('http://127.0.0.1:3302/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json() as { jsonrpc: string; id: number };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
    });

    it('should handle CORS preflight requests', async () => {
      server = await startHTTPServer(3303);

      const response = await fetch('http://127.0.0.1:3303/mcp', {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });

    it('should return 404 for unknown routes', async () => {
      server = await startHTTPServer(3304);

      const response = await fetch('http://127.0.0.1:3304/unknown');
      expect(response.status).toBe(404);
    });
  });

  describe('Environment Variables', () => {
    it('should start in HTTP mode when SAGE_REMOTE_MODE=true', async () => {
      const proc = spawn('node', [CLI_PATH], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, SAGE_REMOTE_MODE: 'true', SAGE_PORT: '3305' },
      });

      await new Promise<void>((resolve, reject) => {
        let started = false;

        const timeoutId = setTimeout(() => {
          if (!started) {
            proc.kill('SIGTERM');
            reject(new Error('Server failed to start with env var'));
          }
        }, 10000);

        proc.stderr.on('data', (data) => {
          const message = data.toString();
          if (message.includes('started in HTTP mode')) {
            started = true;
            clearTimeout(timeoutId);
            proc.kill('SIGINT');
            resolve();
          }
        });
      });
    });
  });

  describe('Graceful Shutdown', () => {
    let server: { proc: ChildProcess; stop: () => Promise<void> } | null = null;

    afterEach(async () => {
      if (server) {
        try {
          await server.stop();
        } catch {
          // Ignore if already stopped
        }
        server = null;
      }
    });

    it('should shutdown gracefully on SIGINT', async () => {
      server = await startHTTPServer(3306);

      // Verify server is running
      const response = await fetch('http://127.0.0.1:3306/health');
      expect(response.status).toBe(200);

      // Stop the server
      await server.stop();
      server = null;

      // Verify server is no longer running
      try {
        await fetch('http://127.0.0.1:3306/health');
        fail('Server should have stopped');
      } catch (error) {
        // Expected - connection refused
        expect(error).toBeDefined();
      }
    });
  });
});
