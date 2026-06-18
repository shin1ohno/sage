//! `sage-reliability` — the reliability suite, ported 1:1 from
//! `src/services/reliability/*` with the exact file formats, error codes, and
//! thresholds.
//!
//! Eight primitives, all flat-file state under `~/.sage/`:
//! kill-switch (`STOP`), heartbeat (`heartbeat.json`), budget (`budget-state.json`),
//! capability-gate (in-memory, from `UserConfig.autonomy`), error-dedup (in-memory),
//! idempotency-lock (`sage.lock`), mutation-logger (`audit.jsonl`),
//! pending-action-store (`pending-actions.json`).
//!
//! Phase 2g wires these into a single dispatch pipeline applied to BOTH
//! transports (the TS enforced reliability only on the HTTP path — a defect this
//! rewrite fixes), plus the `get_health` / `list_pending_actions` /
//! `confirm_action` / `sage_undo` tools.

pub mod budget;
pub mod capability_gate;
pub mod error_dedup;
pub mod heartbeat;
pub mod idempotency;
pub mod kill_switch;
pub mod mutation_log;
pub mod pending_actions;

pub use budget::{BudgetCounts, BudgetExceededError, BudgetGuard, BudgetKind, BudgetSnapshot};
pub use capability_gate::{CapabilityGate, GateDecision};
pub use error_dedup::ErrorDedupCache;
pub use heartbeat::{Heartbeat, HeartbeatRecord, HeartbeatStatus};
pub use idempotency::{IdempotencyLock, IdempotencyLockError, LockData};
pub use kill_switch::{KillSwitch, KillSwitchActiveError};
pub use mutation_log::{AuditRecord, AuditRecordInput, InverseOp, MutationLogger, Outcome};
pub use pending_actions::{PendingAction, PendingActionStore};

use std::path::PathBuf;

/// Resolve `~/.sage` (the directory all reliability state lives in).
pub fn sage_dir() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".sage"))
        .unwrap_or_else(|| PathBuf::from(".sage"))
}
