//! `sage-config` — configuration types, loading, validation, hot-reload.
//!
//! Phase 1+ home for the serde port of `UserConfig` (`~/.sage/config.json`,
//! TS `src/types/config.ts`) and `RemoteConfig` (`~/.sage/remote-config.json`).
//! Consolidates the TS dual-validation (zod vs hand-rolled) onto one serde +
//! `garde` approach, and ports the hot-reload chain (file watch + SIGHUP →
//! diff → reinitialize affected services). Empty in Phase 0.
