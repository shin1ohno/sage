import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('reliability/mutation-logger');

const DEFAULT_AUDIT_PATH = join(homedir(), '.sage', 'audit.jsonl');

export interface InverseOp {
  /**
   * Tool name that, when called with `args`, undoes this mutation.
   * `null` means the mutation is irreversible (e.g. external Slack message).
   */
  tool: string | null;
  args?: Record<string, unknown>;
  reason?: string;
}

export interface AuditRecordInput {
  tool: string;
  args: Record<string, unknown>;
  outcome: 'success' | 'error';
  result?: unknown;
  errorMessage?: string;
  inverseOp?: InverseOp;
}

export interface AuditRecord extends AuditRecordInput {
  correlationId: string;
  timestamp: string;
  pid: number;
}

/**
 * Append-only JSONL writer for sage write actions. Every line is one
 * AuditRecord. Reads scan from the file end so callers can answer
 * "what did sage do in the last N minutes?" cheaply.
 *
 * The audit file is the single source of truth for the future sage_undo
 * command and for invocation-cost ROI analysis.
 */
export class MutationLogger {
  constructor(private readonly path: string = DEFAULT_AUDIT_PATH) {}

  newCorrelationId(): string {
    return randomUUID();
  }

  record(input: AuditRecordInput, correlationId: string = this.newCorrelationId()): AuditRecord {
    const record: AuditRecord = {
      ...input,
      correlationId,
      timestamp: new Date().toISOString(),
      pid: process.pid,
    };
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, JSON.stringify(record) + '\n', 'utf-8');
    } catch (error) {
      // Audit write failure must never break the user's request. Surface it
      // in logs so the operator can investigate, but the caller's mutation
      // is still observable through the underlying API logs.
      logger.error({ err: error, path: this.path, tool: input.tool }, 'failed to append audit record');
    }
    return record;
  }

  /** Read every record (chronological order). Empty array if file is missing. */
  readAll(): AuditRecord[] {
    if (!existsSync(this.path)) return [];

    let raw: string;
    try {
      raw = readFileSync(this.path, 'utf-8');
    } catch (error) {
      logger.warn({ err: error, path: this.path }, 'failed to read audit log');
      return [];
    }

    const records: AuditRecord[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed) as AuditRecord);
      } catch {
        // Skip malformed lines rather than blowing up the whole readAll
        logger.warn({ path: this.path }, 'skipping malformed audit record');
      }
    }
    return records;
  }

  /** Read records strictly newer than `since` (Date or ISO string). */
  readSince(since: Date | string): AuditRecord[] {
    const cutoff = (typeof since === 'string' ? new Date(since) : since).getTime();
    return this.readAll().filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }

  getPath(): string {
    return this.path;
  }
}
