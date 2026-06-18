//! Heartbeat — port of `src/services/reliability/heartbeat.ts`.
//!
//! Overwrites `~/.sage/heartbeat.json` each tick; `status()` reports staleness
//! (`stale_seconds > interval_seconds * 2`). Writes never panic (errors swallowed).

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatRecord {
    pub last_tick_at: String,
    pub last_source: String,
    pub interval_seconds: u64,
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatStatus {
    pub exists: bool,
    pub last_tick_at: Option<String>,
    pub last_source: Option<String>,
    pub stale_seconds: Option<i64>,
    pub is_stale: bool,
    pub expected_interval_seconds: Option<u64>,
    pub pid: Option<u32>,
}

pub struct Heartbeat {
    path: PathBuf,
    default_interval_seconds: u64,
}

impl Heartbeat {
    pub fn new(path: impl Into<PathBuf>, default_interval_seconds: u64) -> Self {
        Self {
            path: path.into(),
            default_interval_seconds,
        }
    }

    /// Overwrite the heartbeat. Never panics — I/O errors are swallowed (the TS
    /// `logger.warn`s and continues).
    pub fn touch(&self, source: &str, interval_seconds: Option<u64>) {
        let record = HeartbeatRecord {
            last_tick_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            last_source: source.to_string(),
            interval_seconds: interval_seconds.unwrap_or(self.default_interval_seconds),
            pid: std::process::id(),
        };
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&record) {
            let _ = std::fs::write(&self.path, json);
        }
    }

    pub fn read(&self) -> Option<HeartbeatRecord> {
        let content = std::fs::read_to_string(&self.path).ok()?;
        serde_json::from_str(&content).ok()
    }

    pub fn status(&self, now: DateTime<Utc>) -> HeartbeatStatus {
        match self.read() {
            None => HeartbeatStatus {
                exists: false,
                last_tick_at: None,
                last_source: None,
                stale_seconds: None,
                is_stale: true,
                expected_interval_seconds: None,
                pid: None,
            },
            Some(record) => {
                let stale_seconds = DateTime::parse_from_rfc3339(&record.last_tick_at)
                    .map(|t| {
                        ((now - t.with_timezone(&Utc)).num_milliseconds() as f64 / 1000.0).floor()
                            as i64
                    })
                    .map(|s| s.max(0))
                    .unwrap_or(0);
                let is_stale = stale_seconds > (record.interval_seconds as i64) * 2;
                HeartbeatStatus {
                    exists: true,
                    last_tick_at: Some(record.last_tick_at),
                    last_source: Some(record.last_source),
                    stale_seconds: Some(stale_seconds),
                    is_stale,
                    expected_interval_seconds: Some(record.interval_seconds),
                    pid: Some(record.pid),
                }
            }
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn absent_heartbeat_is_stale() {
        let dir = tempfile::tempdir().unwrap();
        let hb = Heartbeat::new(dir.path().join("heartbeat.json"), 3600);
        let s = hb.status(Utc::now());
        assert!(!s.exists);
        assert!(s.is_stale);
    }

    #[test]
    fn fresh_tick_not_stale_old_tick_stale() {
        let dir = tempfile::tempdir().unwrap();
        let hb = Heartbeat::new(dir.path().join("heartbeat.json"), 60);
        hb.touch("pipeline.preMeeting", Some(60));
        let rec = hb.read().unwrap();
        assert_eq!(rec.last_source, "pipeline.preMeeting");
        assert_eq!(rec.interval_seconds, 60);

        let now = DateTime::parse_from_rfc3339(&rec.last_tick_at)
            .unwrap()
            .with_timezone(&Utc);
        assert!(!hb.status(now).is_stale);
        // 121s later (> 60*2) → stale.
        assert!(hb.status(now + Duration::seconds(121)).is_stale);
        // exactly 120s (== 60*2) → NOT stale (strictly greater).
        assert!(!hb.status(now + Duration::seconds(120)).is_stale);
    }
}
