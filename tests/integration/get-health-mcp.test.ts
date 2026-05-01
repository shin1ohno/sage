import { rm, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createMCPHandler } from '../../src/cli/mcp-handler.js';

const SAGE_KILL_SWITCH_PATH = join(homedir(), '.sage', 'STOP');

describe('get_health MCP tool', () => {
  beforeEach(async () => {
    await rm(SAGE_KILL_SWITCH_PATH, { force: true });
  });

  afterEach(async () => {
    await rm(SAGE_KILL_SWITCH_PATH, { force: true });
  });

  it('reports kill switch and heartbeat state in a structured payload', async () => {
    const handler = await createMCPHandler();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_health', arguments: {} },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      killSwitch: { active: boolean; path: string };
      heartbeat: { exists: boolean; isStale: boolean };
      initialized: boolean;
    };

    expect(body.killSwitch.active).toBe(false);
    expect(body.killSwitch.path).toContain('STOP');
    expect(body.heartbeat).toBeDefined();
    expect(typeof body.heartbeat.isStale).toBe('boolean');
    expect(body.initialized).toBe(true);

    await handler.shutdown();
  });

  it('reflects kill switch activation in the health payload', async () => {
    const handler = await createMCPHandler();
    await mkdir(join(homedir(), '.sage'), { recursive: true });
    await writeFile(SAGE_KILL_SWITCH_PATH, '');

    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_health', arguments: {} },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      killSwitch: { active: boolean };
    };

    expect(body.killSwitch.active).toBe(true);

    await handler.shutdown();
  });
});
