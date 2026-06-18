//! Idempotency lock — port of `src/services/reliability/idempotency-lock.ts`.
//!
//! A single-instance guard via `~/.sage/sage.lock`. A live foreign PID holding
//! the lock blocks `acquire`; a dead holder's lock is overwritten. Standalone
//! primitive (not wired into dispatch in the TS either).

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockData {
    pub pid: u32,
    /// Process start time (Unix seconds). Diagnostic only; approximated on Rust.
    pub boot_time: i64,
    pub acquired_at: String,
}

#[derive(Debug, Clone, thiserror::Error)]
#[error("{message}")]
pub struct IdempotencyLockError {
    pub message: String,
    pub holder_pid: u32,
}

impl IdempotencyLockError {
    pub const CODE: &'static str = "IDEMPOTENCY_LOCK_HELD";
}

pub struct IdempotencyLock {
    path: PathBuf,
    acquired_by_this_process: bool,
}

/// `process.kill(pid, 0)` equivalent: alive on success or EPERM, dead otherwise.
#[cfg(unix)]
fn is_process_alive(pid: u32) -> bool {
    use nix::errno::Errno;
    use nix::sys::signal::kill;
    use nix::unistd::Pid;
    match kill(Pid::from_raw(pid as i32), None) {
        Ok(()) => true,
        Err(Errno::EPERM) => true,
        Err(_) => false,
    }
}

#[cfg(not(unix))]
fn is_process_alive(_pid: u32) -> bool {
    // Non-unix: conservatively treat as alive (no portable signal-0 probe).
    true
}

impl IdempotencyLock {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            acquired_by_this_process: false,
        }
    }

    fn read(&self) -> Option<LockData> {
        let content = std::fs::read_to_string(&self.path).ok()?;
        serde_json::from_str(&content).ok()
    }

    pub fn acquire(&mut self) -> Result<(), IdempotencyLockError> {
        let me = std::process::id();
        if let Some(existing) = self.read() {
            if existing.pid != me && is_process_alive(existing.pid) {
                return Err(IdempotencyLockError {
                    message: format!(
                        "sage process {} already holds {} (acquired {})",
                        existing.pid,
                        self.path.display(),
                        existing.acquired_at
                    ),
                    holder_pid: existing.pid,
                });
            }
            // else: stale lock from a dead process → overwrite.
        }
        let data = LockData {
            pid: me,
            boot_time: Utc::now().timestamp(),
            acquired_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        };
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&data) {
            let _ = std::fs::write(&self.path, json);
        }
        self.acquired_by_this_process = true;
        Ok(())
    }

    pub fn release(&mut self) {
        if !self.acquired_by_this_process {
            return;
        }
        if let Some(existing) = self.read() {
            if existing.pid == std::process::id() {
                let _ = std::fs::remove_file(&self.path);
            }
        }
        self.acquired_by_this_process = false;
    }

    pub fn is_held_by_this_process(&self) -> bool {
        self.acquired_by_this_process
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acquire_release_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let mut lock = IdempotencyLock::new(dir.path().join("sage.lock"));
        assert!(lock.acquire().is_ok());
        assert!(lock.is_held_by_this_process());
        assert!(lock.path().exists());
        lock.release();
        assert!(!lock.is_held_by_this_process());
        assert!(!lock.path().exists());
    }

    #[test]
    fn stale_lock_from_dead_pid_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sage.lock");
        // A lock held by an almost-certainly-dead PID.
        let stale = LockData {
            pid: 999_999,
            boot_time: 0,
            acquired_at: "2020-01-01T00:00:00.000Z".into(),
        };
        std::fs::write(&path, serde_json::to_string(&stale).unwrap()).unwrap();
        let mut lock = IdempotencyLock::new(&path);
        // Dead holder → acquire overwrites and succeeds.
        assert!(lock.acquire().is_ok());
        assert_eq!(lock.read().unwrap().pid, std::process::id());
    }
}
