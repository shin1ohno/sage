import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IdempotencyLock,
  IdempotencyLockError,
} from '../../../src/services/reliability/idempotency-lock.js';

describe('IdempotencyLock', () => {
  const testDir = join(tmpdir(), `sage-lock-test-${process.pid}-${Date.now()}`);
  const lockPath = join(testDir, 'sage.lock');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(lockPath, { force: true });
  });

  it('acquires when no lock exists', () => {
    const lock = new IdempotencyLock(lockPath);
    expect(() => lock.acquire()).not.toThrow();
    expect(lock.isHeldByThisProcess()).toBe(true);
    lock.release();
  });

  it('releases the lock when called', () => {
    const lock = new IdempotencyLock(lockPath);
    lock.acquire();
    lock.release();
    expect(lock.isHeldByThisProcess()).toBe(false);

    // After release, a fresh acquire should succeed
    const lock2 = new IdempotencyLock(lockPath);
    expect(() => lock2.acquire()).not.toThrow();
    lock2.release();
  });

  it('throws IdempotencyLockError when another live PID holds the lock', async () => {
    // Simulate another live process: write a lock file with our parent PID
    // (which we know is alive since we are running)
    const aliveButForeignPid = process.ppid;
    if (aliveButForeignPid === process.pid) {
      // Edge case in some test runners — skip rather than false-pass
      return;
    }

    await writeFile(
      lockPath,
      JSON.stringify({
        pid: aliveButForeignPid,
        bootTime: Math.floor(Date.now() / 1000),
        acquiredAt: new Date().toISOString(),
      })
    );

    const lock = new IdempotencyLock(lockPath);
    let captured: IdempotencyLockError | null = null;
    try {
      lock.acquire();
    } catch (error) {
      if (error instanceof IdempotencyLockError) captured = error;
      else throw error;
    }

    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('IDEMPOTENCY_LOCK_HELD');
    expect(captured?.holderPid).toBe(aliveButForeignPid);
  });

  it('overwrites a stale lock from a dead PID', async () => {
    // PID 1 (init) is always alive — instead use a clearly-impossible PID.
    // 0x7FFFFFFF is well above any real PID and cannot exist.
    const deadPid = 0x7fffffff;
    await writeFile(
      lockPath,
      JSON.stringify({
        pid: deadPid,
        bootTime: Math.floor(Date.now() / 1000),
        acquiredAt: new Date(Date.now() - 86_400_000).toISOString(),
      })
    );

    const lock = new IdempotencyLock(lockPath);
    expect(() => lock.acquire()).not.toThrow();
    expect(lock.isHeldByThisProcess()).toBe(true);
    lock.release();
  });

  it('release is idempotent and safe when never acquired', () => {
    const lock = new IdempotencyLock(lockPath);
    expect(() => lock.release()).not.toThrow();
    expect(() => lock.release()).not.toThrow();
  });

  it('release leaves a foreign lock alone', async () => {
    const foreignPid = 0x7ffffffe;
    await writeFile(
      lockPath,
      JSON.stringify({
        pid: foreignPid,
        bootTime: Math.floor(Date.now() / 1000),
        acquiredAt: new Date().toISOString(),
      })
    );

    // We never acquired this lock; release() should be a no-op
    const lock = new IdempotencyLock(lockPath);
    lock.release();

    const { readFile } = await import('node:fs/promises');
    const stillThere = await readFile(lockPath, 'utf-8');
    expect(JSON.parse(stillThere).pid).toBe(foreignPid);
  });
});
