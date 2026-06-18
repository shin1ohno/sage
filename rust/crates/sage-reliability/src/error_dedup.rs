//! Error-dedup cache — port of `src/services/reliability/error-dedup-cache.ts`.
//!
//! In-memory only (intentionally not persisted): suppresses repeat critical-error
//! notifications within a sliding window. A suppressed call does NOT slide the
//! window (timestamp updates only when `should_notify` returns true).

use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct ErrorDedupCache {
    window: Duration,
    seen: HashMap<String, Instant>,
}

impl Default for ErrorDedupCache {
    fn default() -> Self {
        // TS default window: 1 hour.
        Self::new(Duration::from_secs(60 * 60))
    }
}

impl ErrorDedupCache {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            seen: HashMap::new(),
        }
    }

    /// Returns true (and records the emit) the first time within the window;
    /// false (suppress) while a prior emit is still inside the window.
    pub fn should_notify(&mut self, key: &str, now: Instant) -> bool {
        if let Some(&last) = self.seen.get(key) {
            if now.duration_since(last) < self.window {
                return false;
            }
        }
        self.seen.insert(key.to_string(), now);
        true
    }

    pub fn prune(&mut self, now: Instant) {
        self.seen
            .retain(|_, &mut ts| now.duration_since(ts) < self.window);
    }

    pub fn size(&self) -> usize {
        self.seen.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suppresses_within_window_then_allows_after() {
        let mut c = ErrorDedupCache::new(Duration::from_secs(3600));
        let t0 = Instant::now();
        assert!(c.should_notify("google_auth:bad", t0));
        // within window → suppressed
        assert!(!c.should_notify("google_auth:bad", t0 + Duration::from_secs(10)));
        // a different key always notifies
        assert!(c.should_notify("slack_auth:bad", t0 + Duration::from_secs(10)));
        // past the window → notifies again
        assert!(c.should_notify("google_auth:bad", t0 + Duration::from_secs(3601)));
    }

    #[test]
    fn prune_drops_expired() {
        let mut c = ErrorDedupCache::new(Duration::from_secs(100));
        let t0 = Instant::now();
        c.should_notify("k", t0);
        c.prune(t0 + Duration::from_secs(101));
        assert_eq!(c.size(), 0);
    }
}
