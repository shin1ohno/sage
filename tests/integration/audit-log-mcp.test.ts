import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createMCPHandler } from '../../src/cli/mcp-handler.js';
import { MutationLogger } from '../../src/services/reliability/mutation-logger.js';

const SAGE_AUDIT_PATH = join(homedir(), '.sage', 'audit.jsonl');

describe('Audit log via MCP handler', () => {
  beforeEach(async () => {
    await rm(SAGE_AUDIT_PATH, { force: true });
  });

  afterEach(async () => {
    await rm(SAGE_AUDIT_PATH, { force: true });
  });

  it('does not record save_config when it is queued at Tier 1 (default)', async () => {
    const handler = await createMCPHandler();
    const beforeCall = new Date();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'save_config', arguments: { config: {} } },
    });

    // Default autonomy is Tier 1: save_config returns pending without dispatch
    const result = response.result as { content: Array<{ type: string; text: string }> };
    const body = JSON.parse(result.content[0].text) as { code?: string };
    expect(body.code).toBe('CAPABILITY_PENDING');

    const reader = new MutationLogger();
    const records = reader.readSince(beforeCall);
    expect(records.find((r) => r.tool === 'save_config')).toBeUndefined();

    await handler.shutdown();
  });

  it('records save_config dispatch when explicitly confirmed', async () => {
    const handler = await createMCPHandler();
    const beforeCall = new Date();

    // Step 1: queue Tier 1 action and capture token
    const pendingResp = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'save_config', arguments: { config: {} } },
    });
    const pendingBody = JSON.parse(
      (pendingResp.result as { content: Array<{ type: string; text: string }> }).content[0].text
    ) as { token?: string; code?: string };
    expect(pendingBody.code).toBe('CAPABILITY_PENDING');
    expect(pendingBody.token).toBeDefined();

    // Step 2: confirm_action triggers dispatch which writes the audit entry
    await handler.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'confirm_action', arguments: { token: pendingBody.token } },
    });

    const reader = new MutationLogger();
    const records = reader.readSince(beforeCall);
    const entry = records.find((r) => r.tool === 'save_config');
    expect(entry).toBeDefined();
    expect(entry?.correlationId).toMatch(/^[0-9a-f-]{36}$/);

    await handler.shutdown();
  });

  it('does not record read-only tools', async () => {
    const handler = await createMCPHandler();
    const beforeCall = new Date();
    await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'check_setup_status', arguments: {} },
    });

    const reader = new MutationLogger();
    const records = reader.readSince(beforeCall);
    const checkSetupEntries = records.filter((r) => r.tool === 'check_setup_status');
    expect(checkSetupEntries).toHaveLength(0);

    await handler.shutdown();
  });
});
