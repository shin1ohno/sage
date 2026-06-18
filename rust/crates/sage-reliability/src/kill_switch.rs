//! Kill switch — port of `src/services/reliability/kill-switch.ts`.
//!
//! The `~/.sage/STOP` sentinel: its presence halts write operations. The class
//! never writes it (operators `touch`/`rm` it out of band).

use std::path::{Path, PathBuf};

/// Raised when the kill switch is active. Carries the `KILL_SWITCH_ACTIVE` code.
#[derive(Debug, Clone, thiserror::Error)]
#[error("{message}")]
pub struct KillSwitchActiveError {
    pub message: String,
}

impl KillSwitchActiveError {
    pub const CODE: &'static str = "KILL_SWITCH_ACTIVE";
}

pub struct KillSwitch {
    path: PathBuf,
}

impl KillSwitch {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn is_active(&self) -> bool {
        self.path.exists()
    }

    /// `Ok(())` when inactive; otherwise a `KillSwitchActiveError` whose message
    /// matches the TS (`refusing to <operation>` when an operation is given).
    pub fn assert_not_killed(&self, operation: Option<&str>) -> Result<(), KillSwitchActiveError> {
        if !self.is_active() {
            return Ok(());
        }
        let message = match operation {
            Some(op) => format!(
                "Kill switch active at {}; refusing to {}",
                self.path.display(),
                op
            ),
            None => format!("Kill switch active at {}", self.path.display()),
        };
        Err(KillSwitchActiveError { message })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inactive_when_file_absent_then_active_when_present() {
        let dir = tempfile::tempdir().unwrap();
        let stop = dir.path().join("STOP");
        let ks = KillSwitch::new(&stop);
        assert!(!ks.is_active());
        assert!(ks.assert_not_killed(Some("create_calendar_event")).is_ok());

        std::fs::write(&stop, "").unwrap();
        assert!(ks.is_active());
        let err = ks
            .assert_not_killed(Some("create_calendar_event"))
            .unwrap_err();
        assert!(err.message.contains("refusing to create_calendar_event"));
        assert!(ks
            .assert_not_killed(None)
            .unwrap_err()
            .message
            .contains("Kill switch active"));
    }
}
