/**
 * Integration test: kill switch blocks write tools through MCP dispatch.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMCPHandler } from '../../src/cli/mcp-handler.js';

const SAGE_KILL_SWITCH_PATH = join(homedir(), '.sage', 'STOP');

describe('Kill switch via MCP handler', () => {
  beforeEach(async () => {
    // Ensure clean state — production sage uses real ~/.sage/STOP path
    await rm(SAGE_KILL_SWITCH_PATH, { force: true });
  });

  afterEach(async () => {
    await rm(SAGE_KILL_SWITCH_PATH, { force: true });
  });

  it('blocks save_config when kill switch is active', async () => {
    const handler = await createMCPHandler();

    await mkdir(join(homedir(), '.sage'), { recursive: true });
    await writeFile(SAGE_KILL_SWITCH_PATH, '');

    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'save_config',
        arguments: { config: {} },
      },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      error: boolean;
      code?: string;
      message?: string;
    };

    expect(body.error).toBe(true);
    expect(body.code).toBe('KILL_SWITCH_ACTIVE');
    expect(body.message).toMatch(/save_config/);

    await handler.shutdown();
  });

  it('allows write tools to dispatch when kill switch is absent', async () => {
    const handler = await createMCPHandler();

    // Sanity: confirm the kill switch file does not exist
    const cleaned = await rm(SAGE_KILL_SWITCH_PATH, { force: true })
      .then(() => true)
      .catch(() => false);
    expect(cleaned).toBe(true);

    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'save_config',
        arguments: { config: {} }, // intentionally invalid; we only verify dispatch path is reached
      },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      error?: boolean;
      code?: string;
    };

    // The handler should have dispatched (kill switch did not block); the
    // save_config handler may itself reject the empty payload, but the kill
    // switch code MUST NOT be the rejecter.
    expect(body.code).not.toBe('KILL_SWITCH_ACTIVE');

    await handler.shutdown();
  });

  // Also exercise the test-tmpdir path for hermeticity (no global dependency)
  it('honours a custom kill switch path via direct service usage', async () => {
    const customDir = join(tmpdir(), `sage-killswitch-int-${process.pid}-${Date.now()}`);
    await mkdir(customDir, { recursive: true });
    const customPath = join(customDir, 'STOP');
    try {
      const { KillSwitch } = await import('../../src/services/reliability/kill-switch.js');
      const ks = new KillSwitch(customPath);
      expect(ks.isActive()).toBe(false);

      await writeFile(customPath, '');
      expect(ks.isActive()).toBe(true);
      expect(() => ks.assertNotKilled('test_tool')).toThrow(/test_tool/);
    } finally {
      await rm(customDir, { recursive: true, force: true });
    }
  });
});
