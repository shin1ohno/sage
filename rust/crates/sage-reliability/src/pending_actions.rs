//! Pending-action store — port of `src/services/reliability/pending-action-store.ts`.
//!
//! Persists `~/.sage/pending-actions.json` (`{actions: [...]}`). Tier-1 write
//! tools enqueue an action returning a one-shot UUID token; `confirm_action`
//! consumes it. Expiry is strictly-greater (`expires_at > now`).

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingAction {
    pub token: String,
    pub tool_name: String,
    pub args: Value,
    pub created_at: String,
    pub expires_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PendingState {
    actions: Vec<PendingAction>,
}

pub struct PendingActionStore {
    path: PathBuf,
    state: PendingState,
}

impl PendingActionStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let state = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<PendingState>(&s).ok())
            .unwrap_or_default();
        Self { path, state }
    }

    fn persist(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.state) {
            let _ = std::fs::write(&self.path, json);
        }
    }

    /// Drop expired actions (`expires_at <= now`). Returns the count dropped.
    pub fn cleanup_expired(&mut self, now: DateTime<Utc>) -> usize {
        let before = self.state.actions.len();
        self.state.actions.retain(|a| {
            DateTime::parse_from_rfc3339(&a.expires_at)
                .map(|t| t.with_timezone(&Utc) > now)
                .unwrap_or(false)
        });
        let dropped = before - self.state.actions.len();
        if dropped > 0 {
            self.persist();
        }
        dropped
    }

    pub fn enqueue(
        &mut self,
        tool_name: &str,
        args: Value,
        ttl_minutes: u32,
        summary: Option<String>,
    ) -> PendingAction {
        let now = Utc::now();
        self.cleanup_expired(now);
        let action = PendingAction {
            token: uuid::Uuid::new_v4().to_string(),
            tool_name: tool_name.to_string(),
            args,
            created_at: now.to_rfc3339_opts(SecondsFormat::Millis, true),
            expires_at: (now + Duration::minutes(ttl_minutes as i64))
                .to_rfc3339_opts(SecondsFormat::Millis, true),
            summary,
        };
        self.state.actions.push(action.clone());
        self.persist();
        action
    }

    pub fn list(&mut self) -> Vec<PendingAction> {
        self.cleanup_expired(Utc::now());
        self.state.actions.clone()
    }

    /// Remove and return the action for `token` (one-shot), or `None`.
    pub fn consume(&mut self, token: &str) -> Option<PendingAction> {
        self.cleanup_expired(Utc::now());
        let idx = self.state.actions.iter().position(|a| a.token == token)?;
        let action = self.state.actions.remove(idx);
        self.persist();
        Some(action)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn enqueue_list_consume_one_shot() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = PendingActionStore::new(dir.path().join("pending.json"));
        let a = store.enqueue(
            "create_calendar_event",
            json!({"title": "x"}),
            30,
            Some("sum".into()),
        );
        assert_eq!(store.list().len(), 1);
        let consumed = store.consume(&a.token).unwrap();
        assert_eq!(consumed.tool_name, "create_calendar_event");
        // one-shot: gone now
        assert!(store.consume(&a.token).is_none());
        assert_eq!(store.list().len(), 0);
    }

    #[test]
    fn expired_actions_dropped() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = PendingActionStore::new(dir.path().join("pending.json"));
        // TTL 0 → expires_at == now → strictly-greater cleanup drops it on next op.
        store.enqueue("set_reminder", json!({}), 0, None);
        assert_eq!(store.list().len(), 0);
    }
}
