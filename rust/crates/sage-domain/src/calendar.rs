//! Shared, normalized calendar types used across every calendar source
//! (Google over REST, EventKit natively). Pure — no I/O. These live in
//! `sage-domain` so both `sage-integrations` (Google) and `sage-eventkit`
//! (native) produce the identical `CalendarEvent`, and the Phase 2g
//! `CalendarSourceManager` can merge/dedup them by `i_cal_uid`.
//! Mirrors `src/types/calendar.ts`.

use serde::{Deserialize, Serialize};

/// Calendar event type. Mirrors the 6 TS event types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum EventType {
    #[default]
    Default,
    OutOfOffice,
    FocusTime,
    WorkingLocation,
    Birthday,
    FromGmail,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Organizer {
    pub email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub self_: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendeeDetail {
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// `accepted | declined | tentative | needsAction` (default `needsAction`).
    pub response_status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub optional: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub self_: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// A calendar (list) resource. `list_calendar_resources` merges EventKit and
/// Google calendars into this shape. Mirrors `CalendarResource` in
/// `src/types/calendar.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarResource {
    pub id: String,
    pub name: String,
    /// `eventkit` | `google`.
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_primary: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_writable: Option<bool>,
    /// `owner | writer | reader | freeBusyReader` (Google); unset for EventKit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_role: Option<String>,
}

/// A calendar event in sage's normalized shape. `start`/`end` are RFC3339
/// datetimes for timed events or `YYYY-MM-DD` for all-day events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start: String,
    pub end: String,
    pub is_all_day: bool,
    /// `eventkit` | `google`.
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attendees: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub i_cal_uid: Option<String>,
    pub event_type: EventType,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recurrence: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurring_event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organizer: Option<Organizer>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attendees_detailed: Vec<AttendeeDetail>,
}
