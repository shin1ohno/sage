//! `sage-eventkit` — native EventKit access (calendar events + reminders) via
//! `objc2-event-kit`, replacing the TS AppleScript/`osascript` shell-outs
//! (removing the `delay 0.5` access-grant race, locale-dependent date parsing,
//! and `|`-delimiter parsing).
//!
//! **Scope (user-approved upgrade over TS parity):** the TS implementation only
//! reads events / lists calendars / does Reminders CRUD via EventKit and routes
//! calendar *writes* to Google (with the standalone EventKit creator/deleter
//! services left as dead code, and RSVP a no-op). This crate genuinely
//! implements native event create/update/delete. RSVP remains best-effort:
//! EventKit attendee status is read-only, so [`EventKitClient::respond_to_event`]
//! reports that limitation rather than faking success.
//!
//! macOS hosts use the `objc2` implementation; every other target compiles a
//! stub whose operations report `NotSupported`, so the Google-only calendar
//! path still builds on Linux/CI.
//!
//! Verification: the pure helpers ([`helpers`]) are unit-tested on all
//! platforms; the objc2 surface is compiler-checked on macOS (CI + local), with
//! live Calendar/Reminders permission grants verified manually on a real Mac.

pub mod helpers;
pub mod types;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod stub;

#[cfg(target_os = "macos")]
pub use macos::EventKitClient;
#[cfg(not(target_os = "macos"))]
pub use stub::EventKitClient;

pub use helpers::{
    apple_reminder_priority, epoch_to_jst_rfc3339, extract_event_uid, is_all_day_iso,
    parse_alarm_offset_seconds, parse_event_datetime_to_epoch,
};
pub use types::{
    CreateEventRequest, DeleteEventResult, EventResponseResult, EventWriteResult, ReminderItem,
    ReminderPriority, ReminderRequest, ReminderResult, RsvpResponse, UpdateEventRequest,
};

/// Errors surfaced by the EventKit client.
#[derive(Debug, thiserror::Error)]
pub enum EventKitError {
    #[error("EventKit is only available on macOS")]
    NotSupported,
    #[error("Calendar/Reminders access was not granted")]
    AccessDenied,
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("EventKit operation timed out")]
    Timeout,
}
