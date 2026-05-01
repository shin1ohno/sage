import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('reliability/heartbeat');

const DEFAULT_HEARTBEAT_PATH = join(homedir(), '.sage', 'heartbeat.json');

export interface HeartbeatRecord {
  /** ISO timestamp of the last successful tick from any source */
  lastTickAt: string;
  /** Tick source label, e.g. "pipeline.preMeeting", "pipeline.postMeeting" */
  lastSource: string;
  /** Number of seconds the heartbeat is considered fresh */
  intervalSeconds: number;
  /** Process PID that wrote the heartbeat */
  pid: number;
}

export interface HeartbeatStatus {
  exists: boolean;
  lastTickAt: string | null;
  lastSource: string | null;
  staleSeconds: number | null;
  isStale: boolean;
  expectedIntervalSeconds: number | null;
  pid: number | null;
}

/**
 * Append-style status file written by long-running components so external
 * monitors can detect when sage has gone silent. The file lives at
 * ~/.sage/heartbeat.json and is overwritten on every tick.
 *
 * Heartbeat is observational only — no kill switch wiring lives here. A
 * monitor (cron/launchd/systemd timer) reads the same file and alerts when
 * `now - lastTickAt > expectedIntervalSeconds * 2`.
 */
export class Heartbeat {
  constructor(
    private readonly path: string = DEFAULT_HEARTBEAT_PATH,
    private readonly defaultIntervalSeconds: number = 3600
  ) {}

  touch(source: string, intervalSeconds: number = this.defaultIntervalSeconds): void {
    const record: HeartbeatRecord = {
      lastTickAt: new Date().toISOString(),
      lastSource: source,
      intervalSeconds,
      pid: process.pid,
    };

    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(record, null, 2), 'utf-8');
    } catch (error) {
      // Heartbeat failures must never crash a tick; log and continue.
      logger.warn({ err: error, path: this.path }, 'failed to update heartbeat');
    }
  }

  read(): HeartbeatRecord | null {
    try {
      const raw = readFileSync(this.path, 'utf-8');
      return JSON.parse(raw) as HeartbeatRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      logger.warn({ err: error, path: this.path }, 'failed to read heartbeat');
      return null;
    }
  }

  status(now: Date = new Date()): HeartbeatStatus {
    const record = this.read();
    if (!record) {
      return {
        exists: false,
        lastTickAt: null,
        lastSource: null,
        staleSeconds: null,
        isStale: true,
        expectedIntervalSeconds: null,
        pid: null,
      };
    }

    const last = new Date(record.lastTickAt).getTime();
    const staleSeconds = Math.max(0, Math.floor((now.getTime() - last) / 1000));
    const isStale = staleSeconds > record.intervalSeconds * 2;

    return {
      exists: true,
      lastTickAt: record.lastTickAt,
      lastSource: record.lastSource,
      staleSeconds,
      isStale,
      expectedIntervalSeconds: record.intervalSeconds,
      pid: record.pid,
    };
  }

  getPath(): string {
    return this.path;
  }
}
