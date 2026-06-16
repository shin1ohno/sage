//! The `Task` input shared by the analysis engines.

use serde::{Deserialize, Serialize};

/// A task as consumed by the analysis engines. Mirrors the subset of the TS
/// `Task` (`src/types/task.ts`) the pure engines read: title, optional
/// description / deadline, and free-form tags.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// ISO-8601 deadline string, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

impl Task {
    /// `"{title} {description}"` — the haystack the engines scan (the TS code
    /// builds this exact string, with an empty description rendered as `""`).
    pub(crate) fn search_text(&self) -> String {
        format!(
            "{} {}",
            self.title,
            self.description.as_deref().unwrap_or("")
        )
    }
}
