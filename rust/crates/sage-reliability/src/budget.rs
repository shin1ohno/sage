//! Daily budget guard — port of `src/services/reliability/budget-guard.ts`.
//!
//! Persists `~/.sage/budget-state.json` (`{date, consumed}`), rolls over lazily
//! at UTC midnight, and rejects a `consume` that would exceed the daily limit
//! (strictly greater — equal is allowed).

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetKind {
    LlmCalls,
    SlackMessages,
    NotionWrites,
    CalendarMutations,
}

impl BudgetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            BudgetKind::LlmCalls => "llmCalls",
            BudgetKind::SlackMessages => "slackMessages",
            BudgetKind::NotionWrites => "notionWrites",
            BudgetKind::CalendarMutations => "calendarMutations",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetCounts {
    pub llm_calls: u32,
    pub slack_messages: u32,
    pub notion_writes: u32,
    pub calendar_mutations: u32,
}

impl BudgetCounts {
    pub const DEFAULT_LIMITS: BudgetCounts = BudgetCounts {
        llm_calls: 50,
        slack_messages: 30,
        notion_writes: 100,
        calendar_mutations: 20,
    };
    const ZERO: BudgetCounts = BudgetCounts {
        llm_calls: 0,
        slack_messages: 0,
        notion_writes: 0,
        calendar_mutations: 0,
    };

    fn get(&self, kind: BudgetKind) -> u32 {
        match kind {
            BudgetKind::LlmCalls => self.llm_calls,
            BudgetKind::SlackMessages => self.slack_messages,
            BudgetKind::NotionWrites => self.notion_writes,
            BudgetKind::CalendarMutations => self.calendar_mutations,
        }
    }

    fn set(&mut self, kind: BudgetKind, value: u32) {
        match kind {
            BudgetKind::LlmCalls => self.llm_calls = value,
            BudgetKind::SlackMessages => self.slack_messages = value,
            BudgetKind::NotionWrites => self.notion_writes = value,
            BudgetKind::CalendarMutations => self.calendar_mutations = value,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetState {
    pub date: String,
    pub consumed: BudgetCounts,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetSnapshot {
    pub date: String,
    pub limits: BudgetCounts,
    pub consumed: BudgetCounts,
    pub remaining: BudgetRemaining,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetRemaining {
    pub llm_calls: i64,
    pub slack_messages: i64,
    pub notion_writes: i64,
    pub calendar_mutations: i64,
}

#[derive(Debug, Clone, thiserror::Error)]
#[error("daily budget exceeded for {kind}: {next}/{limit}")]
pub struct BudgetExceededError {
    pub kind: String,
    pub limit: u32,
    /// Pre-increment consumed value (matches the TS field).
    pub consumed: u32,
    next: u32,
}

impl BudgetExceededError {
    pub const CODE: &'static str = "BUDGET_EXCEEDED";
}

pub struct BudgetGuard {
    limits: BudgetCounts,
    path: PathBuf,
    state: BudgetState,
}

fn today_key() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

impl BudgetGuard {
    pub fn new(limits: BudgetCounts, path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let state = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<BudgetState>(&s).ok())
            .unwrap_or_else(|| BudgetState {
                date: today_key(),
                consumed: BudgetCounts::ZERO,
            });
        Self {
            limits,
            path,
            state,
        }
    }

    pub fn update_limits(&mut self, limits: BudgetCounts) {
        self.limits = limits;
    }

    fn roll_over_if_new_day(&mut self) {
        let today = today_key();
        if self.state.date != today {
            self.state = BudgetState {
                date: today,
                consumed: BudgetCounts::ZERO,
            };
            self.persist();
        }
    }

    fn persist(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.state) {
            let _ = std::fs::write(&self.path, json);
        }
    }

    /// Consume `amount` (default 1) of `kind`. `Err` when it would exceed the limit.
    pub fn consume(&mut self, kind: BudgetKind, amount: u32) -> Result<(), BudgetExceededError> {
        if amount == 0 {
            return Ok(());
        }
        self.roll_over_if_new_day();
        let current = self.state.consumed.get(kind);
        let limit = self.limits.get(kind);
        let next = current + amount;
        if next > limit {
            return Err(BudgetExceededError {
                kind: kind.as_str().to_string(),
                limit,
                consumed: current,
                next,
            });
        }
        self.state.consumed.set(kind, next);
        self.persist();
        Ok(())
    }

    pub fn has_budget(&mut self, kind: BudgetKind, amount: u32) -> bool {
        self.roll_over_if_new_day();
        let remaining = self.limits.get(kind) as i64 - self.state.consumed.get(kind) as i64;
        remaining >= amount as i64
    }

    pub fn snapshot(&mut self) -> BudgetSnapshot {
        self.roll_over_if_new_day();
        let c = self.state.consumed;
        let l = self.limits;
        BudgetSnapshot {
            date: self.state.date.clone(),
            limits: l,
            consumed: c,
            remaining: BudgetRemaining {
                llm_calls: l.llm_calls as i64 - c.llm_calls as i64,
                slack_messages: l.slack_messages as i64 - c.slack_messages as i64,
                notion_writes: l.notion_writes as i64 - c.notion_writes as i64,
                calendar_mutations: l.calendar_mutations as i64 - c.calendar_mutations as i64,
            },
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consume_until_limit_then_reject() {
        let dir = tempfile::tempdir().unwrap();
        let mut g = BudgetGuard::new(
            BudgetCounts {
                calendar_mutations: 2,
                ..BudgetCounts::DEFAULT_LIMITS
            },
            dir.path().join("budget.json"),
        );
        assert!(g.consume(BudgetKind::CalendarMutations, 1).is_ok());
        assert!(g.consume(BudgetKind::CalendarMutations, 1).is_ok()); // 2/2 ok (equal allowed)
        let err = g.consume(BudgetKind::CalendarMutations, 1).unwrap_err();
        assert_eq!(err.kind, "calendarMutations");
        assert_eq!(err.limit, 2);
        assert_eq!(err.consumed, 2); // pre-increment
        assert!(err.to_string().contains("3/2"));
    }

    #[test]
    fn zero_amount_is_noop_and_persists_across_instances() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("budget.json");
        {
            let mut g = BudgetGuard::new(BudgetCounts::DEFAULT_LIMITS, &path);
            assert!(g.consume(BudgetKind::NotionWrites, 0).is_ok());
            g.consume(BudgetKind::NotionWrites, 3).unwrap();
        }
        // Reload: consumed persisted.
        let mut g = BudgetGuard::new(BudgetCounts::DEFAULT_LIMITS, &path);
        assert_eq!(g.snapshot().consumed.notion_writes, 3);
    }
}
