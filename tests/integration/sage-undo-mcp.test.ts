import { rm, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createMCPHandler } from '../../src/cli/mcp-handler.js';

const SAGE_AUDIT_PATH = join(homedir(), '.sage', 'audit.jsonl');

describe('sage_undo MCP tool', () => {
  beforeEach(async () => {
    await rm(SAGE_AUDIT_PATH, { force: true });
    await mkdir(join(homedir(), '.sage'), { recursive: true });
  });

  afterEach(async () => {
    await rm(SAGE_AUDIT_PATH, { force: true });
  });

  it('returns empty buckets when audit log is empty', async () => {
    const handler = await createMCPHandler();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'sage_undo', arguments: { sinceMinutes: 5 } },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      totalRecords: number;
      reversible: unknown[];
      irreversible: unknown[];
    };

    expect(body.totalRecords).toBe(0);
    expect(body.reversible).toEqual([]);
    expect(body.irreversible).toEqual([]);

    await handler.shutdown();
  });

  it('classifies a synthetic create_calendar_event record as reversible', async () => {
    // Seed audit log with a fabricated create_calendar_event record so we can
    // verify the classifier without depending on real Calendar APIs.
    const now = new Date().toISOString();
    const record = {
      tool: 'create_calendar_event',
      args: { calendarName: 'work', title: 'Lunch' },
      outcome: 'success' as const,
      result: { content: [{ type: 'text', text: JSON.stringify({ eventId: 'evt-42' }) }] },
      inverseOp: {
        tool: 'delete_calendar_event',
        args: { eventId: 'evt-42', calendarName: 'work' },
      },
      correlationId: 'cid-test-1',
      timestamp: now,
      pid: process.pid,
    };
    await writeFile(SAGE_AUDIT_PATH, JSON.stringify(record) + '\n');

    const handler = await createMCPHandler();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'sage_undo', arguments: { sinceMinutes: 5 } },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      totalRecords: number;
      reversible: Array<{ tool: string; inverseOp: { tool: string } }>;
    };

    expect(body.totalRecords).toBe(1);
    expect(body.reversible).toHaveLength(1);
    expect(body.reversible[0].tool).toBe('create_calendar_event');
    expect(body.reversible[0].inverseOp.tool).toBe('delete_calendar_event');

    await handler.shutdown();
  });

  it('classifies a delete_calendar_event record as irreversible', async () => {
    const now = new Date().toISOString();
    const record = {
      tool: 'delete_calendar_event',
      args: { eventId: 'evt-99' },
      outcome: 'success' as const,
      result: { content: [{ type: 'text', text: '{}' }] },
      inverseOp: { tool: null, reason: 'calendar event deletion is irreversible' },
      correlationId: 'cid-test-2',
      timestamp: now,
      pid: process.pid,
    };
    await writeFile(SAGE_AUDIT_PATH, JSON.stringify(record) + '\n');

    const handler = await createMCPHandler();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'sage_undo', arguments: { sinceMinutes: 5 } },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      reversible: unknown[];
      irreversible: Array<{ tool: string; reason: string }>;
    };

    expect(body.reversible).toHaveLength(0);
    expect(body.irreversible).toHaveLength(1);
    expect(body.irreversible[0].tool).toBe('delete_calendar_event');
    expect(body.irreversible[0].reason).toContain('irreversible');

    await handler.shutdown();
  });

  it('filters by correlationId when provided', async () => {
    const now = new Date().toISOString();
    const records = [
      {
        tool: 'create_calendar_event',
        args: {},
        outcome: 'success' as const,
        result: { content: [{ type: 'text', text: '{"eventId":"a"}' }] },
        inverseOp: { tool: 'delete_calendar_event', args: { eventId: 'a' } },
        correlationId: 'keep-me',
        timestamp: now,
        pid: process.pid,
      },
      {
        tool: 'create_calendar_event',
        args: {},
        outcome: 'success' as const,
        result: { content: [{ type: 'text', text: '{"eventId":"b"}' }] },
        inverseOp: { tool: 'delete_calendar_event', args: { eventId: 'b' } },
        correlationId: 'skip-me',
        timestamp: now,
        pid: process.pid,
      },
    ];
    await writeFile(SAGE_AUDIT_PATH, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const handler = await createMCPHandler();
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'sage_undo', arguments: { sinceMinutes: 5, correlationId: 'keep-me' } },
    });

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
    };
    const body = JSON.parse(result.content[0].text) as {
      totalRecords: number;
      reversible: Array<{ correlationId: string }>;
    };

    expect(body.totalRecords).toBe(1);
    expect(body.reversible[0].correlationId).toBe('keep-me');

    await handler.shutdown();
  });
});
