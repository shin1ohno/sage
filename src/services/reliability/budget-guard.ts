import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('reliability/budget-guard');

const DEFAULT_BUDGET_PATH = join(homedir(), '.sage', 'budget-state.json');

export type BudgetKind =
  | 'llmCalls'
  | 'slackMessages'
  | 'notionWrites'
  | 'calendarMutations';

export interface DailyBudget {
  llmCalls: number;
  slackMessages: number;
  notionWrites: number;
  calendarMutations: number;
}

export const DEFAULT_DAILY_BUDGET: DailyBudget = {
  llmCalls: 50,
  slackMessages: 30,
  notionWrites: 100,
  calendarMutations: 20,
};

interface BudgetState {
  date: string;
  consumed: Record<BudgetKind, number>;
}

export interface BudgetSnapshot {
  date: string;
  limits: DailyBudget;
  consumed: Record<BudgetKind, number>;
  remaining: Record<BudgetKind, number>;
}

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED';

  constructor(
    message: string,
    readonly kind: BudgetKind,
    readonly limit: number,
    readonly consumed: number
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Persistent daily counter guarding against autonomous-loop blast radius.
 *
 * Each call to consume() either records the spend or throws
 * BudgetExceededError. State is kept on disk so multi-process invocations
 * and restarts share the same daily quota. The date roll-over is handled
 * lazily on next consume.
 */
export class BudgetGuard {
  private state: BudgetState;
  private limits: DailyBudget;

  constructor(
    limits: DailyBudget = DEFAULT_DAILY_BUDGET,
    private readonly path: string = DEFAULT_BUDGET_PATH
  ) {
    this.limits = limits;
    this.state = this.load() ?? this.freshState();
  }

  /** Replace limits at runtime (for hot-reload scenarios). */
  updateLimits(limits: DailyBudget): void {
    this.limits = limits;
    logger.info({ limits }, 'budget limits updated');
  }

  /**
   * Try to consume `amount` of the given budget kind. Throws when the new
   * total would exceed the configured daily limit.
   */
  consume(kind: BudgetKind, amount: number = 1): void {
    if (amount <= 0) return;

    this.rollOverIfNewDay();

    const limit = this.limits[kind];
    const next = (this.state.consumed[kind] ?? 0) + amount;
    if (next > limit) {
      throw new BudgetExceededError(
        `daily budget exceeded for ${kind}: ${next}/${limit}`,
        kind,
        limit,
        this.state.consumed[kind] ?? 0
      );
    }
    this.state.consumed[kind] = next;
    this.persist();
  }

  /** Non-throwing peek — returns true if at least `amount` budget remains. */
  hasBudget(kind: BudgetKind, amount: number = 1): boolean {
    this.rollOverIfNewDay();
    const remaining = this.limits[kind] - (this.state.consumed[kind] ?? 0);
    return remaining >= amount;
  }

  snapshot(): BudgetSnapshot {
    this.rollOverIfNewDay();
    const remaining: Record<BudgetKind, number> = {
      llmCalls: this.limits.llmCalls - (this.state.consumed.llmCalls ?? 0),
      slackMessages: this.limits.slackMessages - (this.state.consumed.slackMessages ?? 0),
      notionWrites: this.limits.notionWrites - (this.state.consumed.notionWrites ?? 0),
      calendarMutations: this.limits.calendarMutations - (this.state.consumed.calendarMutations ?? 0),
    };
    return {
      date: this.state.date,
      limits: { ...this.limits },
      consumed: { ...this.state.consumed },
      remaining,
    };
  }

  getPath(): string {
    return this.path;
  }

  private freshState(): BudgetState {
    return {
      date: this.todayKey(),
      consumed: {
        llmCalls: 0,
        slackMessages: 0,
        notionWrites: 0,
        calendarMutations: 0,
      },
    };
  }

  private todayKey(now: Date = new Date()): string {
    return now.toISOString().split('T')[0];
  }

  private rollOverIfNewDay(): void {
    const today = this.todayKey();
    if (this.state.date !== today) {
      logger.info({ from: this.state.date, to: today }, 'budget day rolled over');
      this.state = this.freshState();
      this.persist();
    }
  }

  private load(): BudgetState | null {
    try {
      const raw = readFileSync(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as BudgetState;
      if (!parsed.date || !parsed.consumed) return null;
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      logger.warn({ err: error, path: this.path }, 'failed to read budget state; starting fresh');
      return null;
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (error) {
      logger.warn({ err: error, path: this.path }, 'failed to persist budget state');
    }
  }
}
