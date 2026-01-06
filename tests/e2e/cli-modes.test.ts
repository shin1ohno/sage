/**
 * CLI Modes E2E Tests
 * Requirements: 14.1-14.10
 *
 * Tests the complete CLI workflow including Stdio mode and HTTP mode.
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { waitForProcessOutput, waitForProcessExit, gracefulStop } from '../utils/index.js';

const PROJECT_ROOT = join(__dirname, '../..');
const CLI_PATH = join(PROJECT_ROOT, 'dist/index.js');
const SAGE_CONFIG_DIR = join(homedir(), '.sage');
const SAGE_CONFIG_PATH = join(SAGE_CONFIG_DIR, 'config.json');

// Minimal test config
const TEST_CONFIG = {
  version: '1.0.0',
  user: {
    name: 'Test User',
    timezone: 'UTC',
    locale: 'en-US',
    workingHours: {
      start: '09:00',
      end: '17:00',
      timezone: 'UTC',
    },
    deepWorkDays: ['Monday', 'Tuesday', 'Wednesday'],
  },
  calendar: {
    sources: {
      eventkit: {
        enabled: true,
      },
      google: {
        enabled: true,
        defaultCalendar: 'primary',
        excludedCalendars: [],
        syncInterval: 300,
        enableNotifications: true,
      },
    },
  },
  priorityRules: {
    urgentKeywords: ['urgent', 'asap'],
    importantKeywords: ['important', 'critical'],
  },
  integrations: {
    appleReminders: {
      enabled: false,
      defaultList: 'Reminders',
    },
    notion: {
      enabled: false,
      databaseId: '',
      threshold: 7,
    },
  },
  team: {
    members: [],
  },
  preferences: {
    defaultReminderTime: '09:00',
    taskEstimationUnit: 'hours' as const,
  },
};

// Helper to run CLI command (event-based completion detection)
async function runCLI(args: string[], maxTimeout = 5000): Promise<{ stdout: string; stderr: string; code: number | null }> {
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

  // Wait for process to exit (event-based, maxTimeout is safety net)
  const result = await waitForProcessExit(proc, { maxTimeout });

  return { stdout, stderr, code: result.code };
}

// Helper to start HTTP server and wait for it to be ready (event-based)
async function startHTTPServer(
  port: number,
  additionalArgs: string[] = []
): Promise<{ proc: ChildProcess; stop: () => Promise<void> }> {
  // Create test config file
  const testConfigPath = join(PROJECT_ROOT, `test-config-${port}.json`);
  writeFileSync(testConfigPath, JSON.stringify(TEST_CONFIG, null, 2), 'utf-8');

  const proc = spawn('node', [CLI_PATH, '--remote', '--port', port.toString(), '--config', testConfigPath, ...additionalArgs], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });

  try {
    // Wait for "started in HTTP mode" message (event-based, not fixed timeout)
    // Note: pino logger outputs to stdout by default
    await waitForProcessOutput(proc, /started in HTTP mode/, {
      maxTimeout: 30000,
      stream: 'stdout',
    });

    return {
      proc,
      stop: async () => {
        // Graceful shutdown (event-based)
        await gracefulStop(proc, { maxTimeout: 10000 });
        // Clean up test config file
        if (existsSync(testConfigPath)) {
          unlinkSync(testConfigPath);
        }
      },
    };
  } catch (error) {
    // Clean up on failure
    proc.kill('SIGKILL');
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
    throw error;
  }
}

describe('CLI Modes E2E', () => {
  // Safety net timeout (tests should complete much faster with event-based detection)
  jest.setTimeout(30000);

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

    it.skip('should accept MCP requests on /mcp endpoint', async () => {
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

      // Wait for startup message (event-based)
      // Note: pino logger outputs to stdout by default
      await waitForProcessOutput(proc, /started in HTTP mode/, {
        maxTimeout: 30000,
        stream: 'stdout',
      });

      // Graceful shutdown
      await gracefulStop(proc, { maxTimeout: 5000 });
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

  describe('Calendar Source Management in Remote Mode', () => {
    let server: { proc: ChildProcess; stop: () => Promise<void> } | null = null;
    let existingConfigBackup: string | null = null;

    beforeEach(() => {
      // Backup existing config if it exists
      if (existsSync(SAGE_CONFIG_PATH)) {
        existingConfigBackup = readFileSync(SAGE_CONFIG_PATH, 'utf-8');
      }

      // Create .sage directory if it doesn't exist
      if (!existsSync(SAGE_CONFIG_DIR)) {
        mkdirSync(SAGE_CONFIG_DIR, { recursive: true });
      }

      // Write test config
      writeFileSync(SAGE_CONFIG_PATH, JSON.stringify(TEST_CONFIG, null, 2), 'utf-8');
    });

    afterEach(async () => {
      if (server) {
        try {
          await server.stop();
        } catch {
          // Ignore if already stopped
        }
        server = null;
      }

      // Restore or remove config
      if (existingConfigBackup) {
        writeFileSync(SAGE_CONFIG_PATH, existingConfigBackup, 'utf-8');
        existingConfigBackup = null;
      } else if (existsSync(SAGE_CONFIG_PATH)) {
        unlinkSync(SAGE_CONFIG_PATH);
      }
    });

    it('should initialize CalendarSourceManager and support list_calendar_sources tool', async () => {
      server = await startHTTPServer(3307);

      // Verify server is running
      const healthResponse = await fetch('http://127.0.0.1:3307/health');
      expect(healthResponse.status).toBe(200);

      // Call list_calendar_sources tool
      const response = await fetch('http://127.0.0.1:3307/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'list_calendar_sources',
            arguments: {},
          },
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json() as { jsonrpc: string; id: number; result?: { content: Array<{ type: string; text: string }> }; error?: unknown };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result).toBeDefined();
      expect(body.result?.content).toBeDefined();
      expect(body.result?.content[0]).toBeDefined();

      const resultText = body.result?.content[0].text;
      expect(resultText).toBeDefined();

      const resultData = JSON.parse(resultText!) as {
        success: boolean;
        sources: {
          eventkit: { available: boolean; enabled: boolean };
          google: { available: boolean; enabled: boolean }
        }
      };

      // Verify CalendarSourceManager is working
      expect(resultData.success).toBe(true);
      expect(resultData.sources).toBeDefined();
      expect(resultData.sources.eventkit).toBeDefined();
      expect(resultData.sources.google).toBeDefined();
    });

    it('should use CalendarSourceManager for list_calendar_events tool', async () => {
      server = await startHTTPServer(3308);

      // Verify server is running
      const healthResponse = await fetch('http://127.0.0.1:3308/health');
      expect(healthResponse.status).toBe(200);

      // Call list_calendar_events tool
      const response = await fetch('http://127.0.0.1:3308/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'list_calendar_events',
            arguments: {
              startDate: '2025-01-05',
              endDate: '2025-01-06',
            },
          },
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json() as { jsonrpc: string; id: number; result?: { content: Array<{ type: string; text: string }> } };
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(2);
      expect(body.result).toBeDefined();
      expect(body.result?.content).toBeDefined();
      expect(body.result?.content[0]).toBeDefined();

      const resultText = body.result?.content[0].text;
      expect(resultText).toBeDefined();

      const resultData = JSON.parse(resultText!) as {
        success?: boolean;
        error?: boolean;
        message?: string;
        events?: unknown[];
      };

      // In test environment, calendar sources are not available
      // Verify CalendarSourceManager is being used by checking error message
      // If the error mentions "All calendar sources failed", it means CalendarSourceManager tried multiple sources
      if (resultData.error) {
        expect(resultData.message).toContain('All calendar sources failed');
      } else {
        // If somehow it succeeds, verify the response structure
        expect(resultData.success).toBe(true);
        expect(resultData.events).toBeDefined();
        expect(Array.isArray(resultData.events)).toBe(true);
      }
    });
  });
});
