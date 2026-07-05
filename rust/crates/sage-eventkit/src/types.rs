//! Pure, cross-platform request/result types for the EventKit client. These
//! compile on every platform; only the `macos` impl module touches objc2.

use serde::{Deserialize, Serialize};

/// Apple Reminders priority. Maps to the Apple scale (0=none, 1=high, 5=medium,
/// 9=low) via [`crate::helpers::apple_reminder_priority`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ReminderPriority {
    #[default]
    None,
    Low,
    Medium,
    High,
}

/// A reminder to create (service-level shape; the MCP layer maps `P0..P3` and
/// the destination routing on top of this).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ReminderRequest {
    pub title: String,
    pub notes: Option<String>,
    /// RFC3339 / ISO 8601 due datetime.
    pub due_date: Option<String>,
    /// Target Reminders list (defaults to `Reminders` when `None`).
    pub list: Option<String>,
    pub priority: ReminderPriority,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reminder_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// A reminder read back from the store.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderItem {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub completed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creation_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modification_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u64>,
}

/// Create a calendar event natively (the upgrade over the TS Google-only path).
/// `start_date`/`end_date` are ISO 8601; a naive (offset-less) value is
/// interpreted as Asia/Tokyo.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateEventRequest {
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub location: Option<String>,
    pub notes: Option<String>,
    /// Target calendar by title; `None` → the default calendar for new events.
    pub calendar_name: Option<String>,
    /// Relative alarm offsets, e.g. `-15m`, `-1h`, `-1d`, `-1w`.
    pub alarms: Vec<String>,
}

/// Update an existing event in place. Only `Some` fields are changed.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateEventRequest {
    pub event_id: String,
    pub title: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub location: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventWriteResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calendar_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_all_day: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteEventResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calendar_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// RSVP response type. Mirrors the TS `EventResponseType`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RsvpResponse {
    Accept,
    Decline,
    Tentative,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventResponseResult {
    pub success: bool,
    pub event_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_status: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub skipped: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
