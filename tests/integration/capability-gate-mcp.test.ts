import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createMCPHandler } from '../../src/cli/mcp-handler.js';

const SAGE_PENDING_PATH = join(homedir(), '.sage', 'pending-actions.json');

describe('Capability gate via MCP handler', () => {
  beforeEach(async () => {
    await rm(SAGE_PENDING_PATH, { force: true });
  });

  afterEach(async () => {
    await rm(SAGE_PENDING_PATH, { force: true });
  });

  it('returns CAPABILITY_PENDING for default Tier 1 write tool', async () => {
    const handler = await createMCPHandler();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'save_config', arguments: { config: {} } },
    });

    const result = response.result as { content: Array<{ type: string; text: string }> };
    const body = JSON.parse(result.content[0].text) as {
      kind?: string;
      code?: string;
      tier?: number;
      token?: string;
      tool?: string;
    };

    expect(body.kind).toBe('pending');
    expect(body.code).toBe('CAPABILITY_PENDING');
    expect(body.tier).toBe(1);
    expect(body.token).toBeDefined();
    expect(body.tool).toBe('save_config');

    await handler.shutdown();
  });

  it('list_pending_actions surfaces queued actions', async () => {
    const handler = await createMCPHandler();
    await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'save_config', arguments: { config: { foo: 'bar' } } },
    });

    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_pending_actions', arguments: {} },
    });

    const body = JSON.parse(
      (response.result as { content: Array<{ type: string; text: string }> }).content[0].text
    ) as { count: number; actions: Array<{ toolName: string; args: { config?: { foo?: string } } }> };

    expect(body.count).toBeGreaterThanOrEqual(1);
    const ours = body.actions.find(
      (a) => a.toolName === 'save_config' && a.args.config?.foo === 'bar'
    );
    expect(ours).toBeDefined();

    await handler.shutdown();
  });

  it('confirm_action consumes the token and dispatches the queued tool', async () => {
    const handler = await createMCPHandler();
    const pendingResp = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'save_config', arguments: { config: {} } },
    });
    const pendingBody = JSON.parse(
      (pendingResp.result as { content: Array<{ type: string; text: string }> }).content[0].text
    ) as { token: string };

    const confirmResp = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'confirm_action', arguments: { token: pendingBody.token } },
    });
    const confirmBody = JSON.parse(
      (confirmResp.result as { content: Array<{ type: string; text: string }> }).content[0].text
    ) as { confirmed?: boolean; toolName?: string };

    expect(confirmBody.confirmed).toBe(true);
    expect(confirmBody.toolName).toBe('save_config');

    // Token should be one-shot
    const reuseResp = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'confirm_action', arguments: { token: pendingBody.token } },
    });
    const reuseBody = JSON.parse(
      (reuseResp.result as { content: Array<{ type: string; text: string }> }).content[0].text
    ) as { error?: boolean; code?: string };
    expect(reuseBody.error).toBe(true);
    expect(reuseBody.code).toBe('PENDING_TOKEN_UNKNOWN');

    await handler.shutdown();
  });

  it('confirm_action with unknown token returns PENDING_TOKEN_UNKNOWN', async () => {
    const handler = await createMCPHandler();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'confirm_action', arguments: { token: 'never-issued' } },
    });
    const body = JSON.parse(
      (response.result as { content: Array<{ type: string; text: string }> }).content[0].text
    ) as { error: boolean; code: string };
    expect(body.error).toBe(true);
    expect(body.code).toBe('PENDING_TOKEN_UNKNOWN');

    await handler.shutdown();
  });
});
