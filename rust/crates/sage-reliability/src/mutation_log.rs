//! Mutation logger — port of `src/services/reliability/mutation-logger.ts`.
//!
//! Append-only JSONL at `~/.sage/audit.jsonl` (one compact `AuditRecord` per
//! line). `synthesize_inverse_op` (the inverse-op derivation) lives in the
//! dispatch layer (`sage-mcp`) since it parses tool results; this module owns
//! the record types + read/append.

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Success,
    Error,
}

/// `tool == None` (serialized `null`) means the operation is irreversible.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InverseOp {
    pub tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Caller-supplied fields for an audit record.
#[derive(Debug, Clone)]
pub struct AuditRecordInput {
    pub tool: String,
    pub args: Value,
    pub outcome: Outcome,
    pub result: Option<Value>,
    pub error_message: Option<String>,
    pub inverse_op: Option<InverseOp>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    pub correlation_id: String,
    pub timestamp: String,
    pub pid: u32,
    pub tool: String,
    pub args: Value,
    pub outcome: Outcome,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inverse_op: Option<InverseOp>,
}

pub struct MutationLogger {
    path: PathBuf,
}

impl MutationLogger {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn new_correlation_id(&self) -> String {
        uuid::Uuid::new_v4().to_string()
    }

    /// Append a record. Never panics — write failures are swallowed (the record
    /// is still returned).
    pub fn record(&self, input: AuditRecordInput, correlation_id: String) -> AuditRecord {
        let record = AuditRecord {
            correlation_id,
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            pid: std::process::id(),
            tool: input.tool,
            args: input.args,
            outcome: input.outcome,
            result: input.result,
            error_message: input.error_message,
            inverse_op: input.inverse_op,
        };
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(line) = serde_json::to_string(&record) {
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)
            {
                let _ = writeln!(f, "{line}");
            }
        }
        record
    }

    pub fn read_all(&self) -> Vec<AuditRecord> {
        let Ok(content) = std::fs::read_to_string(&self.path) else {
            return Vec::new();
        };
        content
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .filter_map(|l| serde_json::from_str::<AuditRecord>(l).ok())
            .collect()
    }

    /// Records with `timestamp >= cutoff` (inclusive).
    pub fn read_since(&self, cutoff: DateTime<Utc>) -> Vec<AuditRecord> {
        self.read_all()
            .into_iter()
            .filter(|r| {
                DateTime::parse_from_rfc3339(&r.timestamp)
                    .map(|t| t.with_timezone(&Utc) >= cutoff)
                    .unwrap_or(false)
            })
            .collect()
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;
    use serde_json::json;

    #[test]
    fn append_and_read_since() {
        let dir = tempfile::tempdir().unwrap();
        let log = MutationLogger::new(dir.path().join("audit.jsonl"));
        let cid = log.new_correlation_id();
        let rec = log.record(
            AuditRecordInput {
                tool: "create_calendar_event".into(),
                args: json!({"title": "x"}),
                outcome: Outcome::Success,
                result: Some(json!({"eventId": "E1"})),
                error_message: None,
                inverse_op: Some(InverseOp {
                    tool: Some("delete_calendar_event".into()),
                    args: Some(json!({"eventId": "E1"})),
                    reason: None,
                }),
            },
            cid.clone(),
        );
        assert_eq!(rec.correlation_id, cid);

        let all = log.read_all();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].tool, "create_calendar_event");
        assert_eq!(all[0].outcome, Outcome::Success);

        // read_since inclusive of records at/after the cutoff
        let since = Utc::now() - Duration::minutes(60);
        assert_eq!(log.read_since(since).len(), 1);
        let future = Utc::now() + Duration::minutes(60);
        assert_eq!(log.read_since(future).len(), 0);
    }
}
