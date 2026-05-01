import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MutationLogger } from '../../../src/services/reliability/mutation-logger.js';

describe('MutationLogger', () => {
  const testDir = join(tmpdir(), `sage-audit-test-${process.pid}-${Date.now()}`);
  const path = join(testDir, 'audit.jsonl');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(path, { force: true });
  });

  it('appends a JSONL record and reads it back', () => {
    const logger = new MutationLogger(path);
    const written = logger.record({
      tool: 'create_calendar_event',
      args: { title: 'Lunch' },
      outcome: 'success',
      result: { eventId: 'evt-1' },
    });

    expect(written.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(written.timestamp).toBeTruthy();

    const records = logger.readAll();
    expect(records).toHaveLength(1);
    expect(records[0].tool).toBe('create_calendar_event');
    expect(records[0].args.title).toBe('Lunch');
    expect(records[0].outcome).toBe('success');
  });

  it('preserves correlation id when caller supplies one', () => {
    const logger = new MutationLogger(path);
    const id = '11111111-2222-3333-4444-555555555555';
    const written = logger.record(
      { tool: 'set_reminder', args: { at: 'tomorrow' }, outcome: 'success' },
      id
    );
    expect(written.correlationId).toBe(id);
  });

  it('records error outcomes with errorMessage', () => {
    const logger = new MutationLogger(path);
    logger.record({
      tool: 'sync_to_notion',
      args: { databaseId: 'x' },
      outcome: 'error',
      errorMessage: 'unauthorized',
    });

    const records = logger.readAll();
    expect(records[0].outcome).toBe('error');
    expect(records[0].errorMessage).toBe('unauthorized');
  });

  it('returns empty array when audit log does not exist', () => {
    const logger = new MutationLogger(path);
    expect(logger.readAll()).toEqual([]);
  });

  it('readSince filters by timestamp', async () => {
    const logger = new MutationLogger(path);
    logger.record({ tool: 'first', args: {}, outcome: 'success' });

    // Sleep long enough that the next timestamp (and the cutoff) is strictly
    // after the first record's millisecond-precision timestamp.
    await new Promise((r) => setTimeout(r, 50));
    const between = new Date();
    await new Promise((r) => setTimeout(r, 50));

    logger.record({ tool: 'second', args: {}, outcome: 'success' });

    const recent = logger.readSince(between);
    expect(recent).toHaveLength(1);
    expect(recent[0].tool).toBe('second');
  });

  it('skips malformed lines instead of throwing', async () => {
    await writeFile(
      path,
      '{"valid":"json","tool":"a","args":{},"outcome":"success","correlationId":"x","timestamp":"2026-05-01T00:00:00Z","pid":1}\nnot json line\n'
    );
    const logger = new MutationLogger(path);
    const records = logger.readAll();
    expect(records).toHaveLength(1);
    expect(records[0].tool).toBe('a');
  });

  it('captures inverseOp when provided', () => {
    const logger = new MutationLogger(path);
    logger.record({
      tool: 'create_calendar_event',
      args: { title: 'Lunch' },
      outcome: 'success',
      result: { eventId: 'evt-1' },
      inverseOp: { tool: 'delete_calendar_event', args: { eventId: 'evt-1' } },
    });
    const records = logger.readAll();
    expect(records[0].inverseOp?.tool).toBe('delete_calendar_event');
    expect(records[0].inverseOp?.args?.eventId).toBe('evt-1');
  });
});
