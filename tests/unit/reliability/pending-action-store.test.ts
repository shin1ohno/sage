import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PendingActionStore } from '../../../src/services/reliability/pending-action-store.js';

describe('PendingActionStore', () => {
  const testDir = join(tmpdir(), `sage-pending-test-${process.pid}-${Date.now()}`);
  const path = join(testDir, 'pending-actions.json');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(path, { force: true });
  });

  it('enqueue returns a unique token and persists action', () => {
    const store = new PendingActionStore(path);
    const a = store.enqueue('create_calendar_event', { title: 'A' }, 30);
    const b = store.enqueue('create_calendar_event', { title: 'B' }, 30);
    expect(a.token).not.toBe(b.token);
    expect(store.list()).toHaveLength(2);
  });

  it('consume returns and removes the action', () => {
    const store = new PendingActionStore(path);
    const action = store.enqueue('sync_to_notion', { id: 'x' }, 30);
    const popped = store.consume(action.token);
    expect(popped?.toolName).toBe('sync_to_notion');
    expect(store.list()).toHaveLength(0);
    expect(store.consume(action.token)).toBeNull();
  });

  it('survives process restart (re-loads from disk)', () => {
    const a = new PendingActionStore(path);
    const action = a.enqueue('set_reminder', { at: 'tomorrow' }, 30);

    const b = new PendingActionStore(path);
    expect(b.list()).toHaveLength(1);
    expect(b.consume(action.token)?.args.at).toBe('tomorrow');
  });

  it('cleanupExpired drops past-TTL entries', () => {
    const store = new PendingActionStore(path);
    store.enqueue('a', {}, 0); // expires immediately
    // Force cleanup with a now-time past expiry
    const future = new Date(Date.now() + 60_000);
    const dropped = store.cleanupExpired(future);
    expect(dropped).toBe(1);
    expect(store.list()).toHaveLength(0);
  });

  it('list and consume implicitly prune expired', async () => {
    const store = new PendingActionStore(path);
    store.enqueue('a', {}, 0);
    // Wait so expiresAt is strictly in the past
    await new Promise((r) => setTimeout(r, 5));
    expect(store.list()).toHaveLength(0);
  });
});
