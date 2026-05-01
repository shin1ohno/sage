import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('reliability/idempotency-lock');

const DEFAULT_LOCK_PATH = join(homedir(), '.sage', 'sage.lock');

interface LockData {
  pid: number;
  bootTime: number;
  acquiredAt: string;
}

export class IdempotencyLockError extends Error {
  readonly code = 'IDEMPOTENCY_LOCK_HELD';

  constructor(message: string, readonly holderPid: number) {
    super(message);
    this.name = 'IdempotencyLockError';
  }
}

/**
 * File-based idempotency lock guarding against duplicate sage processes.
 *
 * On `acquire()` the current PID is written to the lock file. If a lock from
 * a different live PID already exists, an IdempotencyLockError is thrown so
 * the caller can exit cleanly. Stale locks (from crashed processes) are
 * detected by probing the recorded PID with `kill(pid, 0)` and overwritten.
 */
export class IdempotencyLock {
  private acquiredByThisProcess = false;

  constructor(private readonly path: string = DEFAULT_LOCK_PATH) {}

  /** Acquire the lock or throw IdempotencyLockError when another live PID holds it. */
  acquire(): void {
    const existing = this.readLock();
    if (existing && existing.pid !== process.pid && this.isProcessAlive(existing.pid)) {
      throw new IdempotencyLockError(
        `sage process ${existing.pid} already holds ${this.path} (acquired ${existing.acquiredAt})`,
        existing.pid
      );
    }

    if (existing && existing.pid !== process.pid) {
      logger.warn(
        { stalePid: existing.pid, lockPath: this.path },
        'overwriting stale lock from dead process'
      );
    }

    const data: LockData = {
      pid: process.pid,
      bootTime: Math.floor((Date.now() - process.uptime() * 1000) / 1000),
      acquiredAt: new Date().toISOString(),
    };

    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(data, null, 2), 'utf-8');
    this.acquiredByThisProcess = true;
    logger.info({ pid: data.pid, lockPath: this.path }, 'idempotency lock acquired');
  }

  /** Release the lock if held by this process. Safe to call multiple times. */
  release(): void {
    if (!this.acquiredByThisProcess) return;

    const existing = this.readLock();
    if (!existing) {
      this.acquiredByThisProcess = false;
      return;
    }

    if (existing.pid === process.pid) {
      try {
        unlinkSync(this.path);
        logger.info({ pid: process.pid, lockPath: this.path }, 'idempotency lock released');
      } catch (error) {
        logger.warn({ err: error, lockPath: this.path }, 'failed to remove lock file');
      }
    }

    this.acquiredByThisProcess = false;
  }

  isHeldByThisProcess(): boolean {
    return this.acquiredByThisProcess;
  }

  getPath(): string {
    return this.path;
  }

  private readLock(): LockData | null {
    try {
      const raw = readFileSync(this.path, 'utf-8');
      return JSON.parse(raw) as LockData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      logger.warn({ err: error, lockPath: this.path }, 'failed to read existing lock; treating as absent');
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      // Sending signal 0 doesn't deliver anything but throws if the process is gone.
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        // Process exists but we lack permission to signal it; still alive from our perspective.
        return true;
      }
      return false;
    }
  }
}
