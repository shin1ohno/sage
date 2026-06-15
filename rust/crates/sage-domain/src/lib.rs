//! `sage-domain` — pure, deterministic task-analysis logic.
//!
//! No I/O, no network, no clock (callers inject `now` where deadlines matter).
//! Every item here is a 1:1 port of the TypeScript implementation under
//! `../../../src/utils` and `../../../src/tools`, preserving the exact output
//! contract. The TS unit tests are the parity oracle (see `rust/parity`).
//!
//! Phase 1 ports the config-input types (here) and the engines: priority
//! cascade, estimation formula, stakeholder extraction (mind the CJK regex
//! divergence — Rust `\w` is Unicode by default; use `(?-u)` /
//! `[\x{4E00}-\x{9FAF}]`), and the task splitter (Kahn topological order).

pub mod config;
pub mod estimation;
pub mod task;

pub use config::{
    ConditionOperator, ConditionType, ConditionValue, DeadlineUnit, EstimationConfig,
    KeywordMapping, PriorityCondition, PriorityRules, TeamConfig, TeamMember, TeamRole,
};
pub use estimation::{default_estimation_config, estimate_duration, EstimationResult};
pub use task::Task;

/// Task priority. Mirrors the TS `Priority` union `'P0' | 'P1' | 'P2' | 'P3'`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Priority {
    P0,
    P1,
    P2,
    P3,
}

/// Complexity tier used by the time estimator. Mirrors the TS
/// `'simple' | 'medium' | 'complex' | 'project'` union (lowercase on the wire).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Complexity {
    Simple,
    Medium,
    Complex,
    Project,
}

/// Snap a minute estimate to the nearest Pomodoro (25-minute) multiple.
///
/// Faithful port of `Math.round(minutes / 25) * 25` in
/// `src/utils/estimation.ts`. JS `Math.round` and Rust `f64::round` both round
/// half away from zero for positive inputs, so results match exactly.
pub fn round_to_pomodoro(minutes: f64) -> u32 {
    ((minutes / 25.0).round() * 25.0).max(0.0) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pomodoro_rounding_matches_ts() {
        // Values chosen to exercise the round-half-away-from-zero boundary,
        // mirroring Math.round(x/25)*25.
        assert_eq!(round_to_pomodoro(50.0), 50);
        assert_eq!(round_to_pomodoro(62.0), 50); // round(2.48) -> 2
        assert_eq!(round_to_pomodoro(63.0), 75); // round(2.52) -> 3
        assert_eq!(round_to_pomodoro(90.0), 100); // round(3.6) -> 4
        assert_eq!(round_to_pomodoro(180.0), 175); // round(7.2) -> 7
    }

    #[test]
    fn priority_serializes_as_pn() {
        assert_eq!(serde_json::to_string(&Priority::P0).unwrap(), "\"P0\"");
        assert_eq!(
            serde_json::to_string(&Complexity::Project).unwrap(),
            "\"project\""
        );
    }
}
