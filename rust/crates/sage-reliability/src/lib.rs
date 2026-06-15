//! `sage-reliability` — the 8-module reliability suite, all flat-file state in
//! `~/.sage/`.
//!
//! Ports `src/services/reliability/*`: kill-switch (`STOP`), heartbeat
//! (`heartbeat.json`), budget-guard (`budget-state.json`), capability-gate
//! (Tier 0/1/2, defaults to Tier 1), error-dedup-cache (in-memory), idempotency
//! -lock (`sage.lock` + `kill(pid, None)` liveness), mutation-logger
//! (`audit.jsonl` + `synthesizeInverseOp`), pending-action-store
//! (`pending-actions.json`). Phase 2 enforces these in a single dispatch
//! wrapper shared by BOTH transports (the TS HTTP-only gating gap is a defect
//! to fix, not replicate). Empty in Phase 0.
