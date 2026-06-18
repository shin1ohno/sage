//! Non-macOS stub: EventKit is unavailable, so every operation reports "not
//! supported on this platform". This lets the rest of the workspace (and the
//! Google-only calendar path) build and run on Linux/Windows/CI.

use crate::types::{
    CreateEventRequest, DeleteEventResult, EventResponseResult, EventWriteResult, ReminderItem,
    ReminderRequest, ReminderResult, RsvpResponse, UpdateEventRequest,
};
use crate::EventKitError;
use sage_domain::calendar::{CalendarEvent, CalendarResource};

const UNSUPPORTED: &str = "EventKit is only available on macOS";

/// Stub client; all methods report unavailability.
#[derive(Debug, Default, Clone, Copy)]
pub struct EventKitClient;

impl EventKitClient {
    pub fn new() -> Self {
        Self
    }

    pub fn list_calendars(&self) -> Result<Vec<CalendarResource>, EventKitError> {
        Err(EventKitError::NotSupported)
    }

    pub fn list_events(
        &self,
        _start: &str,
        _end: &str,
        _calendar_name: Option<&str>,
    ) -> Result<Vec<CalendarEvent>, EventKitError> {
        Err(EventKitError::NotSupported)
    }

    pub fn create_event(&self, _req: &CreateEventRequest) -> EventWriteResult {
        EventWriteResult {
            success: false,
            event_id: None,
            title: None,
            start_date: None,
            end_date: None,
            calendar_name: None,
            is_all_day: None,
            error: Some(UNSUPPORTED.to_string()),
        }
    }

    pub fn update_event(&self, _req: &UpdateEventRequest) -> EventWriteResult {
        self.create_event(&CreateEventRequest::default())
    }

    pub fn delete_event(&self, event_id: &str, _calendar_name: Option<&str>) -> DeleteEventResult {
        DeleteEventResult {
            success: false,
            event_id: Some(event_id.to_string()),
            title: None,
            calendar_name: None,
            error: Some(UNSUPPORTED.to_string()),
        }
    }

    pub fn respond_to_event(&self, event_id: &str, _response: RsvpResponse) -> EventResponseResult {
        EventResponseResult {
            success: false,
            event_id: event_id.to_string(),
            event_title: None,
            new_status: None,
            skipped: false,
            reason: None,
            error: Some(UNSUPPORTED.to_string()),
        }
    }

    pub fn create_reminder(&self, _req: &ReminderRequest) -> ReminderResult {
        ReminderResult {
            success: false,
            reminder_id: None,
            error: Some(UNSUPPORTED.to_string()),
        }
    }

    pub fn fetch_reminders(&self, _list: Option<&str>) -> Result<Vec<ReminderItem>, EventKitError> {
        Err(EventKitError::NotSupported)
    }

    pub fn update_reminder_status(&self, reminder_id: &str, _completed: bool) -> ReminderResult {
        ReminderResult {
            success: false,
            reminder_id: Some(reminder_id.to_string()),
            error: Some(UNSUPPORTED.to_string()),
        }
    }
}
