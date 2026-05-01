import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BudgetExceededError,
  BudgetGuard,
  DEFAULT_DAILY_BUDGET,
} from '../../../src/services/reliability/budget-guard.js';

describe('BudgetGuard', () => {
  const testDir = join(tmpdir(), `sage-budget-test-${process.pid}-${Date.now()}`);
  const path = join(testDir, 'budget-state.json');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(path, { force: true });
  });

  it('starts at zero with default limits', () => {
    const guard = new BudgetGuard(DEFAULT_DAILY_BUDGET, path);
    const snap = guard.snapshot();

    expect(snap.consumed.llmCalls).toBe(0);
    expect(snap.remaining.llmCalls).toBe(DEFAULT_DAILY_BUDGET.llmCalls);
  });

  it('consumes budget and persists across instances', () => {
    const guardA = new BudgetGuard({ ...DEFAULT_DAILY_BUDGET, slackMessages: 5 }, path);
    guardA.consume('slackMessages', 3);
    expect(guardA.snapshot().consumed.slackMessages).toBe(3);

    // Fresh instance should pick up the same persisted counter
    const guardB = new BudgetGuard({ ...DEFAULT_DAILY_BUDGET, slackMessages: 5 }, path);
    expect(guardB.snapshot().consumed.slackMessages).toBe(3);
  });

  it('throws BudgetExceededError when limit would be crossed', () => {
    const guard = new BudgetGuard({ ...DEFAULT_DAILY_BUDGET, calendarMutations: 2 }, path);
    guard.consume('calendarMutations', 2);

    let captured: BudgetExceededError | null = null;
    try {
      guard.consume('calendarMutations', 1);
    } catch (error) {
      if (error instanceof BudgetExceededError) captured = error;
      else throw error;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('BUDGET_EXCEEDED');
    expect(captured?.kind).toBe('calendarMutations');
    expect(captured?.limit).toBe(2);
  });

  it('does not record spend when consume throws', () => {
    const guard = new BudgetGuard({ ...DEFAULT_DAILY_BUDGET, notionWrites: 1 }, path);
    guard.consume('notionWrites', 1);
    expect(() => guard.consume('notionWrites', 1)).toThrow(BudgetExceededError);
    expect(guard.snapshot().consumed.notionWrites).toBe(1);
  });

  it('rolls over consumed counters when the date changes', async () => {
    // Seed yesterday's state
    await writeFile(
      path,
      JSON.stringify({
        date: '2000-01-01',
        consumed: { llmCalls: 99, slackMessages: 99, notionWrites: 99, calendarMutations: 99 },
      })
    );

    const guard = new BudgetGuard(DEFAULT_DAILY_BUDGET, path);
    // First consume should detect the date change and reset to today
    guard.consume('llmCalls', 1);

    const snap = guard.snapshot();
    expect(snap.date).not.toBe('2000-01-01');
    expect(snap.consumed.llmCalls).toBe(1);
    expect(snap.consumed.slackMessages).toBe(0);
  });

  it('hasBudget reports remaining without consuming', () => {
    const guard = new BudgetGuard({ ...DEFAULT_DAILY_BUDGET, llmCalls: 3 }, path);
    expect(guard.hasBudget('llmCalls', 3)).toBe(true);
    expect(guard.hasBudget('llmCalls', 4)).toBe(false);
    expect(guard.snapshot().consumed.llmCalls).toBe(0);
  });

  it('updateLimits applies to subsequent consume calls', () => {
    const guard = new BudgetGuard({ ...DEFAULT_DAILY_BUDGET, slackMessages: 2 }, path);
    guard.consume('slackMessages', 2);
    expect(() => guard.consume('slackMessages', 1)).toThrow(BudgetExceededError);

    guard.updateLimits({ ...DEFAULT_DAILY_BUDGET, slackMessages: 10 });
    expect(() => guard.consume('slackMessages', 1)).not.toThrow();
    expect(guard.snapshot().consumed.slackMessages).toBe(3);
  });
});
