import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('reliability/pending-action-store');

const DEFAULT_PENDING_PATH = join(homedir(), '.sage', 'pending-actions.json');

export interface PendingAction {
  token: string;
  toolName: string;
  args: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  summary?: string;
}

interface PendingState {
  actions: PendingAction[];
}

/**
 * Persistent store for actions that are awaiting explicit confirm_action
 * calls. Each enqueue returns an opaque token; consume() removes the
 * action atomically so a token can only be used once. TTL cleanup happens
 * lazily on every read.
 */
export class PendingActionStore {
  private state: PendingState;

  constructor(private readonly path: string = DEFAULT_PENDING_PATH) {
    this.state = this.load() ?? { actions: [] };
  }

  enqueue(toolName: string, args: Record<string, unknown>, ttlMinutes: number, summary?: string): PendingAction {
    this.cleanupExpired();
    const now = new Date();
    const action: PendingAction = {
      token: randomUUID(),
      toolName,
      args,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
      summary,
    };
    this.state.actions.push(action);
    this.persist();
    return action;
  }

  list(): PendingAction[] {
    this.cleanupExpired();
    return [...this.state.actions];
  }

  /** Pop a pending action by token. Returns null when token is unknown or expired. */
  consume(token: string): PendingAction | null {
    this.cleanupExpired();
    const idx = this.state.actions.findIndex((a) => a.token === token);
    if (idx < 0) return null;
    const [action] = this.state.actions.splice(idx, 1);
    this.persist();
    return action;
  }

  /** Drop entries whose expiresAt has passed. Persists if anything was removed. */
  cleanupExpired(now: Date = new Date()): number {
    const before = this.state.actions.length;
    this.state.actions = this.state.actions.filter(
      (a) => new Date(a.expiresAt).getTime() > now.getTime()
    );
    const dropped = before - this.state.actions.length;
    if (dropped > 0) {
      logger.info({ dropped }, 'pruned expired pending actions');
      this.persist();
    }
    return dropped;
  }

  getPath(): string {
    return this.path;
  }

  private load(): PendingState | null {
    try {
      const raw = readFileSync(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as PendingState;
      if (!Array.isArray(parsed.actions)) return null;
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      logger.warn({ err: error, path: this.path }, 'failed to read pending-actions; starting fresh');
      return null;
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (error) {
      logger.warn({ err: error, path: this.path }, 'failed to persist pending-actions');
    }
  }
}
