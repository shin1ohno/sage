/**
 * In-memory dedup cache keyed by `(component, errorClass)` with a
 * sliding window. Used to suppress repeat critical-error notifications
 * (e.g. Slack DM storms when auth has been broken for an hour).
 *
 * State is intentionally process-local — across-restart dedup would
 * require persistence which is overkill for the SLO; on restart the
 * first error in a class will fire, which is also the right behaviour
 * for "did something change after I restarted?".
 */
export class ErrorDedupCache {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs: number = 60 * 60 * 1000) {}

  /** Returns true when the caller should emit (first time in window). */
  shouldNotify(key: string, now: number = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < this.windowMs) return false;
    this.seen.set(key, now);
    return true;
  }

  /** Drop entries older than the window. Optional housekeeping. */
  prune(now: number = Date.now()): void {
    for (const [key, ts] of this.seen.entries()) {
      if (now - ts >= this.windowMs) this.seen.delete(key);
    }
  }

  /** For test inspection. */
  size(): number {
    return this.seen.size;
  }
}
