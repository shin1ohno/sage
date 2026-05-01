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

  it('records save_config dispatch as an audit entry', async () => {
    const handler = await createMCPHandler();
    const beforeCall = new Date();
    await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'save_config', arguments: { config: {} } },
    });

    const reader = new MutationLogger();
    const records = reader.readSince(beforeCall);

    expect(records.length).toBeGreaterThanOrEqual(1);
    const entry = records.find((r) => r.tool === 'save_config');
    expect(entry).toBeDefined();
    expect(entry?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof entry?.outcome).toBe('string');

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
