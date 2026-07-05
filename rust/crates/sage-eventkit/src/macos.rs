//! Native EventKit implementation (macOS) via objc2. All ObjC calls are
//! `unsafe`; this module concentrates them behind a safe `EventKitClient`.
//!
//! NOTE (live verification deferred): the structure + signatures are checked by
//! the compiler (macOS CI + local build), but the runtime behavior requires a
//! real Mac with Calendar/Reminders permission grants. Reminder fetch uses the
//! only EventKit API available (the async completion-handler form) bridged to a
//! blocking channel with a timeout.
//!
//! `EventKitClient` is **not `Send`/`Sync`** (it owns ObjC objects); the MCP
//! layer (Phase 2g) drives it from a dedicated thread.

use crate::helpers::{
    apple_reminder_priority, epoch_to_jst_rfc3339, is_all_day_iso, parse_alarm_offset_seconds,
    parse_event_datetime_to_epoch,
};
use crate::types::{
    CreateEventRequest, DeleteEventResult, EventResponseResult, EventWriteResult, ReminderItem,
    ReminderRequest, ReminderResult, RsvpResponse, UpdateEventRequest,
};
use crate::EventKitError;
use block2::RcBlock;
use chrono::{Datelike, FixedOffset, TimeZone, Timelike};
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2_event_kit::{
    EKAlarm, EKAuthorizationStatus, EKCalendar, EKEntityType, EKEvent, EKEventStore, EKReminder,
    EKSpan,
};
use objc2_foundation::{NSArray, NSDate, NSDateComponents, NSString};
use sage_domain::calendar::{CalendarEvent, CalendarResource, EventType};
use std::sync::mpsc;
use std::time::Duration;

const ACCESS_TIMEOUT: Duration = Duration::from_secs(10);
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);

fn ns(s: &str) -> Retained<NSString> {
    NSString::from_str(s)
}

fn jst() -> FixedOffset {
    FixedOffset::east_opt(9 * 3600).expect("valid offset")
}

fn err_string(e: &objc2_foundation::NSError) -> String {
    e.localizedDescription().to_string()
}

/// Native EventKit client owning a long-lived `EKEventStore`.
pub struct EventKitClient {
    store: Retained<EKEventStore>,
}

impl EventKitClient {
    pub fn new() -> Self {
        // SAFETY: `new` is the documented EKEventStore constructor.
        let store = unsafe { EKEventStore::new() };
        Self { store }
    }

    // ---- access ----------------------------------------------------------

    fn ensure_access(&self, entity: EKEntityType) -> Result<(), EventKitError> {
        // SAFETY: class method, no receiver state.
        let status = unsafe { EKEventStore::authorizationStatusForEntityType(entity) };
        if status == EKAuthorizationStatus::FullAccess {
            return Ok(());
        }
        if status == EKAuthorizationStatus::Denied || status == EKAuthorizationStatus::Restricted {
            return Err(EventKitError::AccessDenied);
        }

        // NotDetermined → request and wait for the completion to fire.
        let (tx, rx) = mpsc::channel::<bool>();
        let block = RcBlock::new(move |granted: Bool, _err: *mut objc2_foundation::NSError| {
            let _ = tx.send(granted.as_bool());
        });
        let ptr = (&*block
            as *const block2::DynBlock<dyn Fn(Bool, *mut objc2_foundation::NSError)>)
            .cast_mut();
        // SAFETY: `ptr` points at a live block we keep alive until recv returns.
        unsafe {
            if entity == EKEntityType::Reminder {
                self.store.requestFullAccessToRemindersWithCompletion(ptr);
            } else {
                self.store.requestFullAccessToEventsWithCompletion(ptr);
            }
        }
        let granted = rx.recv_timeout(ACCESS_TIMEOUT).unwrap_or(false);
        drop(block);
        if granted {
            Ok(())
        } else {
            // Re-check: the grant may have landed without our block firing.
            let status = unsafe { EKEventStore::authorizationStatusForEntityType(entity) };
            if status == EKAuthorizationStatus::FullAccess {
                Ok(())
            } else {
                Err(EventKitError::AccessDenied)
            }
        }
    }

    // ---- calendars -------------------------------------------------------

    pub fn list_calendars(&self) -> Result<Vec<CalendarResource>, EventKitError> {
        self.ensure_access(EKEntityType::Event)?;
        // SAFETY: requires event access (ensured above).
        let cals = unsafe { self.store.calendarsForEntityType(EKEntityType::Event) };
        let mut out = Vec::new();
        let count = cals.count();
        for i in 0..count {
            let cal = cals.objectAtIndex(i);
            // SAFETY: valid EKCalendar from the store.
            let (id, title, writable, is_local) = unsafe {
                (
                    cal.calendarIdentifier().to_string(),
                    cal.title().to_string(),
                    cal.allowsContentModifications(),
                    cal.r#type() == objc2_event_kit::EKCalendarType::Local,
                )
            };
            out.push(CalendarResource {
                id,
                name: title,
                source: "eventkit".to_string(),
                color: None,
                is_primary: Some(is_local && i == 0),
                is_writable: Some(writable),
                access_role: None,
            });
        }
        Ok(out)
    }

    fn find_calendar_by_title(&self, title: &str) -> Option<Retained<EKCalendar>> {
        let cals = unsafe { self.store.calendarsForEntityType(EKEntityType::Event) };
        let count = cals.count();
        for i in 0..count {
            let cal = cals.objectAtIndex(i);
            if unsafe { cal.title() }.to_string() == title {
                return Some(cal);
            }
        }
        None
    }

    // ---- events: read ----------------------------------------------------

    pub fn list_events(
        &self,
        start: &str,
        end: &str,
        calendar_name: Option<&str>,
    ) -> Result<Vec<CalendarEvent>, EventKitError> {
        self.ensure_access(EKEntityType::Event)?;
        let start_secs = parse_event_datetime_to_epoch(start)
            .ok_or_else(|| EventKitError::InvalidInput(format!("invalid startDate: {start}")))?;
        let end_secs = parse_event_datetime_to_epoch(end)
            .ok_or_else(|| EventKitError::InvalidInput(format!("invalid endDate: {end}")))?;

        // SAFETY: NSDate factory + predicate over all calendars; eventsMatching
        // expands recurring events into occurrences (the reason for EventKit).
        let events = unsafe {
            let start_ns = NSDate::dateWithTimeIntervalSince1970(start_secs);
            let end_ns = NSDate::dateWithTimeIntervalSince1970(end_secs);
            let predicate = self
                .store
                .predicateForEventsWithStartDate_endDate_calendars(&start_ns, &end_ns, None);
            self.store.eventsMatchingPredicate(&predicate)
        };

        let mut out = Vec::new();
        let count = events.count();
        for i in 0..count {
            let ev = events.objectAtIndex(i);
            let mapped = unsafe { self.map_event(&ev) };
            if let Some(filter) = calendar_name {
                if mapped.calendar.as_deref() != Some(filter) {
                    continue;
                }
            }
            out.push(mapped);
        }
        Ok(out)
    }

    /// # Safety
    /// `ev` must be a valid `EKEvent` from `self.store`.
    unsafe fn map_event(&self, ev: &EKEvent) -> CalendarEvent {
        let id = ev
            .eventIdentifier()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let title = ev.title().to_string();
        let start = epoch_to_jst_rfc3339(ev.startDate().timeIntervalSince1970());
        let end = epoch_to_jst_rfc3339(ev.endDate().timeIntervalSince1970());
        let is_all_day = ev.isAllDay();
        let calendar = ev.calendar().map(|c| c.title().to_string());
        let location = ev.location().map(|l| l.to_string());
        let description = ev.notes().map(|n| n.to_string());
        // calendarItemIdentifier doubles as the iCalUID for dedup (per TS).
        let i_cal_uid = Some(ev.calendarItemIdentifier().to_string());
        CalendarEvent {
            id,
            title,
            start,
            end,
            is_all_day,
            source: "eventkit".to_string(),
            calendar,
            location,
            description,
            attendees: Vec::new(),
            status: None,
            i_cal_uid,
            event_type: EventType::Default,
            recurrence: Vec::new(),
            recurring_event_id: None,
            organizer: None,
            attendees_detailed: Vec::new(),
        }
    }

    // ---- events: write (the native upgrade over the TS Google-only path) --

    pub fn create_event(&self, req: &CreateEventRequest) -> EventWriteResult {
        if let Err(e) = self.ensure_access(EKEntityType::Event) {
            return write_err(&e.to_string());
        }
        if req.title.trim().is_empty() {
            return write_err("title is empty");
        }
        let Some(start_secs) = parse_event_datetime_to_epoch(&req.start_date) else {
            return write_err(&format!("invalid startDate: {}", req.start_date));
        };
        let Some(end_secs) = parse_event_datetime_to_epoch(&req.end_date) else {
            return write_err(&format!("invalid endDate: {}", req.end_date));
        };
        if end_secs < start_secs {
            return write_err("endDate must be after startDate");
        }
        let all_day = is_all_day_iso(&req.start_date, &req.end_date);

        let calendar = match &req.calendar_name {
            Some(name) => match self.find_calendar_by_title(name) {
                Some(c) if unsafe { c.allowsContentModifications() } => c,
                Some(_) => return write_err(&format!("calendar is read-only: {name}")),
                None => return write_err(&format!("calendar not found: {name}")),
            },
            None => match unsafe { self.store.defaultCalendarForNewEvents() } {
                Some(c) => c,
                None => return write_err("no default calendar for new events"),
            },
        };

        // SAFETY: building + saving an EKEvent owned by this store.
        let save = unsafe {
            let ev = EKEvent::eventWithEventStore(&self.store);
            ev.setTitle(Some(&ns(&req.title)));
            ev.setStartDate(Some(&NSDate::dateWithTimeIntervalSince1970(start_secs)));
            ev.setEndDate(Some(&NSDate::dateWithTimeIntervalSince1970(end_secs)));
            ev.setAllDay(all_day);
            ev.setCalendar(Some(&calendar));
            if let Some(loc) = &req.location {
                ev.setLocation(Some(&ns(loc)));
            }
            if let Some(notes) = &req.notes {
                ev.setNotes(Some(&ns(notes)));
            }
            for alarm in &req.alarms {
                if let Some(secs) = parse_alarm_offset_seconds(alarm) {
                    ev.addAlarm(&EKAlarm::alarmWithRelativeOffset(secs));
                }
            }
            self.store
                .saveEvent_span_error(&ev, EKSpan::ThisEvent)
                .map(|()| {
                    (
                        ev.eventIdentifier().map(|s| s.to_string()),
                        calendar.title().to_string(),
                    )
                })
        };

        match save {
            Ok((event_id, cal_name)) => EventWriteResult {
                success: true,
                event_id,
                title: Some(req.title.clone()),
                start_date: Some(req.start_date.clone()),
                end_date: Some(req.end_date.clone()),
                calendar_name: Some(cal_name),
                is_all_day: Some(all_day),
                error: None,
            },
            Err(e) => write_err(&err_string(&e)),
        }
    }

    pub fn update_event(&self, req: &UpdateEventRequest) -> EventWriteResult {
        if let Err(e) = self.ensure_access(EKEntityType::Event) {
            return write_err(&e.to_string());
        }
        // SAFETY: lookup by identifier; mutate provided fields; save.
        let ev = match unsafe { self.store.eventWithIdentifier(&ns(&req.event_id)) } {
            Some(ev) => ev,
            None => return write_err(&format!("event not found: {}", req.event_id)),
        };
        let save = unsafe {
            if let Some(t) = &req.title {
                ev.setTitle(Some(&ns(t)));
            }
            if let Some(s) = &req.start_date {
                match parse_event_datetime_to_epoch(s) {
                    Some(secs) => {
                        ev.setStartDate(Some(&NSDate::dateWithTimeIntervalSince1970(secs)))
                    }
                    None => return write_err(&format!("invalid startDate: {s}")),
                }
            }
            if let Some(e) = &req.end_date {
                match parse_event_datetime_to_epoch(e) {
                    Some(secs) => ev.setEndDate(Some(&NSDate::dateWithTimeIntervalSince1970(secs))),
                    None => return write_err(&format!("invalid endDate: {e}")),
                }
            }
            if let Some(loc) = &req.location {
                ev.setLocation(Some(&ns(loc)));
            }
            if let Some(notes) = &req.notes {
                ev.setNotes(Some(&ns(notes)));
            }
            self.store
                .saveEvent_span_error(&ev, EKSpan::ThisEvent)
                .map(|()| {
                    (
                        ev.eventIdentifier().map(|s| s.to_string()),
                        ev.title().to_string(),
                        ev.calendar().map(|c| c.title().to_string()),
                        ev.isAllDay(),
                    )
                })
        };
        match save {
            Ok((event_id, title, cal, all_day)) => EventWriteResult {
                success: true,
                event_id,
                title: Some(title),
                start_date: req.start_date.clone(),
                end_date: req.end_date.clone(),
                calendar_name: cal,
                is_all_day: Some(all_day),
                error: None,
            },
            Err(e) => write_err(&err_string(&e)),
        }
    }

    pub fn delete_event(&self, event_id: &str, _calendar_name: Option<&str>) -> DeleteEventResult {
        if let Err(e) = self.ensure_access(EKEntityType::Event) {
            return DeleteEventResult {
                success: false,
                event_id: Some(event_id.to_string()),
                title: None,
                calendar_name: None,
                error: Some(e.to_string()),
            };
        }
        // SAFETY: lookup + remove.
        let result = unsafe {
            match self.store.eventWithIdentifier(&ns(event_id)) {
                None => Err(format!("event not found: {event_id}")),
                Some(ev) => {
                    let title = ev.title().to_string();
                    let cal = ev.calendar().map(|c| c.title().to_string());
                    if ev
                        .calendar()
                        .map(|c| !c.allowsContentModifications())
                        .unwrap_or(false)
                    {
                        Err(format!("calendar is read-only for event: {event_id}"))
                    } else {
                        self.store
                            .removeEvent_span_error(&ev, EKSpan::ThisEvent)
                            .map(|()| (title, cal))
                            .map_err(|e| err_string(&e))
                    }
                }
            }
        };
        match result {
            Ok((title, cal)) => DeleteEventResult {
                success: true,
                event_id: Some(event_id.to_string()),
                title: Some(title),
                calendar_name: cal,
                error: None,
            },
            Err(msg) => DeleteEventResult {
                success: false,
                event_id: Some(event_id.to_string()),
                title: None,
                calendar_name: None,
                error: Some(msg),
            },
        }
    }

    /// Best-effort RSVP. EventKit attendee status is **read-only** (no setter on
    /// `EKParticipant`), so a native client cannot change RSVP — this reports
    /// the limitation honestly (vs the TS no-op that faked success).
    pub fn respond_to_event(&self, event_id: &str, response: RsvpResponse) -> EventResponseResult {
        let event_title = self
            .ensure_access(EKEntityType::Event)
            .ok()
            .and_then(|()| unsafe { self.store.eventWithIdentifier(&ns(event_id)) })
            .map(|ev| unsafe { ev.title() }.to_string());
        let new_status = match response {
            RsvpResponse::Accept => "accepted",
            RsvpResponse::Decline => "declined",
            RsvpResponse::Tentative => "tentative",
        };
        EventResponseResult {
            success: false,
            event_id: event_id.to_string(),
            event_title,
            new_status: Some(new_status.to_string()),
            skipped: true,
            reason: Some(
                "EventKit attendee status is read-only; RSVP cannot be set natively. \
                 Respond via Google Calendar or the Calendar app."
                    .to_string(),
            ),
            error: None,
        }
    }

    // ---- reminders -------------------------------------------------------

    pub fn create_reminder(&self, req: &ReminderRequest) -> ReminderResult {
        if let Err(e) = self.ensure_access(EKEntityType::Reminder) {
            return ReminderResult {
                success: false,
                reminder_id: None,
                error: Some(e.to_string()),
            };
        }
        let calendar = match &req.list {
            Some(name) => self.find_reminder_calendar_by_title(name),
            None => unsafe { self.store.defaultCalendarForNewReminders() },
        };
        let Some(calendar) = calendar else {
            return ReminderResult {
                success: false,
                reminder_id: None,
                error: Some("no reminder calendar available".to_string()),
            };
        };

        // SAFETY: build + save an EKReminder owned by this store.
        let saved = unsafe {
            let reminder = EKReminder::reminderWithEventStore(&self.store);
            reminder.setTitle(Some(&ns(&req.title)));
            if let Some(notes) = &req.notes {
                reminder.setNotes(Some(&ns(notes)));
            }
            reminder.setCalendar(Some(&calendar));
            reminder
                .setPriority(apple_reminder_priority(req.priority) as objc2_foundation::NSUInteger);
            if let Some(due) = &req.due_date {
                if let Some(secs) = parse_event_datetime_to_epoch(due) {
                    reminder.setDueDateComponents(Some(&date_components_from_epoch(secs)));
                }
            }
            self.store
                .saveReminder_commit_error(&reminder, true)
                .map(|()| reminder.calendarItemIdentifier().to_string())
                .map_err(|e| err_string(&e))
        };
        match saved {
            Ok(id) => ReminderResult {
                success: true,
                reminder_id: Some(id),
                error: None,
            },
            Err(msg) => ReminderResult {
                success: false,
                reminder_id: None,
                error: Some(msg),
            },
        }
    }

    fn find_reminder_calendar_by_title(&self, title: &str) -> Option<Retained<EKCalendar>> {
        let cals = unsafe { self.store.calendarsForEntityType(EKEntityType::Reminder) };
        let count = cals.count();
        for i in 0..count {
            let cal = cals.objectAtIndex(i);
            if unsafe { cal.title() }.to_string() == title {
                return Some(cal);
            }
        }
        None
    }

    pub fn fetch_reminders(&self, list: Option<&str>) -> Result<Vec<ReminderItem>, EventKitError> {
        self.ensure_access(EKEntityType::Reminder)?;
        let calendars = match list {
            Some(name) => match self.find_reminder_calendar_by_title(name) {
                Some(c) => Some(NSArray::from_retained_slice(&[c])),
                None => return Ok(Vec::new()),
            },
            None => None,
        };

        let (tx, rx) = mpsc::channel::<Vec<ReminderItem>>();
        // SAFETY: predicate over the (optional) calendar set; completion maps
        // each reminder and sends the owned Vec back through the channel.
        unsafe {
            let predicate = self
                .store
                .predicateForRemindersInCalendars(calendars.as_deref());
            let block = RcBlock::new(move |arr: *mut NSArray<EKReminder>| {
                let mut items = Vec::new();
                if let Some(arr) = arr.as_ref() {
                    let count = arr.count();
                    for i in 0..count {
                        let r = arr.objectAtIndex(i);
                        items.push(map_reminder(&r));
                    }
                }
                let _ = tx.send(items);
            });
            let _request = self
                .store
                .fetchRemindersMatchingPredicate_completion(&predicate, &block);
            // Keep `block` alive until the completion fires (or we time out).
            match rx.recv_timeout(FETCH_TIMEOUT) {
                Ok(items) => Ok(items),
                Err(_) => Err(EventKitError::Timeout),
            }
        }
    }

    pub fn update_reminder_status(&self, reminder_id: &str, completed: bool) -> ReminderResult {
        if let Err(e) = self.ensure_access(EKEntityType::Reminder) {
            return ReminderResult {
                success: false,
                reminder_id: Some(reminder_id.to_string()),
                error: Some(e.to_string()),
            };
        }
        // SAFETY: a reminder is an EKCalendarItem; look it up and downcast.
        let saved = unsafe {
            match self.store.calendarItemWithIdentifier(&ns(reminder_id)) {
                None => Err(format!("reminder not found: {reminder_id}")),
                Some(item) => match item.downcast::<EKReminder>() {
                    Ok(reminder) => {
                        reminder.setCompleted(completed);
                        self.store
                            .saveReminder_commit_error(&reminder, true)
                            .map(|()| reminder_id.to_string())
                            .map_err(|e| err_string(&e))
                    }
                    Err(_) => Err(format!("identifier is not a reminder: {reminder_id}")),
                },
            }
        };
        match saved {
            Ok(id) => ReminderResult {
                success: true,
                reminder_id: Some(id),
                error: None,
            },
            Err(msg) => ReminderResult {
                success: false,
                reminder_id: Some(reminder_id.to_string()),
                error: Some(msg),
            },
        }
    }
}

impl Default for EventKitClient {
    fn default() -> Self {
        Self::new()
    }
}

fn write_err(msg: &str) -> EventWriteResult {
    EventWriteResult {
        success: false,
        event_id: None,
        title: None,
        start_date: None,
        end_date: None,
        calendar_name: None,
        is_all_day: None,
        error: Some(msg.to_string()),
    }
}

/// Build an `NSDateComponents` (year..minute, JST) from epoch seconds.
fn date_components_from_epoch(secs: f64) -> Retained<NSDateComponents> {
    let dt = jst()
        .timestamp_opt(secs as i64, 0)
        .single()
        .unwrap_or_else(|| jst().timestamp_opt(0, 0).unwrap());
    let comps = NSDateComponents::new();
    comps.setYear(dt.year() as isize);
    comps.setMonth(dt.month() as isize);
    comps.setDay(dt.day() as isize);
    comps.setHour(dt.hour() as isize);
    comps.setMinute(dt.minute() as isize);
    comps
}

/// # Safety
/// `r` must be a valid `EKReminder`.
unsafe fn map_reminder(r: &EKReminder) -> ReminderItem {
    let id = r.calendarItemIdentifier().to_string();
    let title = r.title().to_string();
    let notes = r.notes().map(|n| n.to_string());
    let completed = r.isCompleted();
    let priority = Some(r.priority() as u64);
    ReminderItem {
        id,
        title,
        notes,
        completed,
        due_date: None,
        creation_date: None,
        modification_date: None,
        priority,
    }
}
