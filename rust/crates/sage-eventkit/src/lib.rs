//! `sage-eventkit` — native EventKit access (calendar events + reminders).
//!
//! Phase 2 home for the `objc2-event-kit` (`EKEventStore`) implementations of
//! the `CalendarSource` and `ReminderStore` traits, replacing the TS
//! AppleScript/AppleScriptObjC `osascript` shell-outs (removes the `delay 0.5`
//! access-grant race, locale-dependent date parsing, and delimiter parsing).
//! macOS only — compiles to an empty crate elsewhere so the Google-only path
//! still builds on Linux/Windows. Empty in Phase 0.
