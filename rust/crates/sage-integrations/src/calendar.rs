//! Calendar types are now defined in `sage-domain` (pure, shared by the Google
//! REST client here and the native EventKit client in `sage-eventkit`).
//! Re-exported here so existing `crate::calendar::*` paths keep resolving.

pub use sage_domain::calendar::{AttendeeDetail, CalendarEvent, EventType, Organizer};
