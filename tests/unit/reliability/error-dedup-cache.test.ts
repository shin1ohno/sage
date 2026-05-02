import { ErrorDedupCache } from '../../../src/services/reliability/error-dedup-cache.js';

describe('ErrorDedupCache', () => {
  it('first occurrence in a window returns true', () => {
    const cache = new ErrorDedupCache(60_000);
    expect(cache.shouldNotify('component:error')).toBe(true);
  });

  it('repeat within window returns false', () => {
    const cache = new ErrorDedupCache(60_000);
    expect(cache.shouldNotify('component:error', 1000)).toBe(true);
    expect(cache.shouldNotify('component:error', 2000)).toBe(false);
    expect(cache.shouldNotify('component:error', 60_999)).toBe(false);
  });

  it('returns true again after window elapsed', () => {
    const cache = new ErrorDedupCache(60_000);
    expect(cache.shouldNotify('component:error', 1000)).toBe(true);
    expect(cache.shouldNotify('component:error', 62_000)).toBe(true);
  });

  it('different keys are tracked independently', () => {
    const cache = new ErrorDedupCache(60_000);
    expect(cache.shouldNotify('a', 1000)).toBe(true);
    expect(cache.shouldNotify('b', 2000)).toBe(true);
    expect(cache.shouldNotify('a', 3000)).toBe(false);
    expect(cache.shouldNotify('b', 4000)).toBe(false);
  });

  it('prune drops expired entries', () => {
    const cache = new ErrorDedupCache(60_000);
    cache.shouldNotify('a', 1000);
    cache.shouldNotify('b', 2000);
    cache.prune(120_000);
    expect(cache.size()).toBe(0);
  });
});
