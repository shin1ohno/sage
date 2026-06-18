//! Google Calendar v3 REST client — port of `src/integrations/google-calendar-service.ts`
//! over `reqwest` (replacing the `googleapis` SDK).
//!
//! Methods take an `access_token` (the caller refreshes via `GoogleOAuthHandler`
//! first), which keeps the client decoupled + testable. The request-building and
//! response-parsing helpers are pure and unit-tested; live API round-trips need
//! real OAuth credentials (deferred to integration testing).

use crate::calendar::{CalendarEvent, EventType};
use crate::google::{convert_google_to_calendar_event, normalize_to_rfc3339, GoogleEvent};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const CALENDAR_BASE: &str = "https://www.googleapis.com/calendar/v3";
const FREEBUSY_BATCH: usize = 50;

#[derive(Debug, thiserror::Error)]
pub enum CalendarError {
    #[error("http error: {0}")]
    Http(String),
    #[error("api error {status}: {body}")]
    Api { status: u16, body: String },
    #[error("read-only or invalid calendar")]
    ReadOnly,
}

/// A calendar from `calendarList.list`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarInfo {
    pub id: String,
    pub name: String,
    pub source: String,
    pub is_primary: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_role: Option<String>,
}

/// A free/busy interval.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BusyPeriod {
    pub start: String,
    pub end: String,
}

/// Input for `create_event` (subset of the `create_calendar_event` tool schema).
#[derive(Debug, Clone, Default)]
pub struct CreateEventRequest {
    pub title: String,
    pub start: String,
    pub end: String,
    pub is_all_day: bool,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub attendees: Vec<String>,
    /// Relative alarm strings like "-15m", "-1h", "-1d".
    pub alarms: Vec<String>,
    pub recurrence: Vec<String>,
    pub event_type: EventType,
    pub auto_decline_mode: Option<String>,
    pub decline_message: Option<String>,
    pub chat_status: Option<String>,
    pub working_location_type: Option<String>,
    pub working_location_label: Option<String>,
}

/// Parse a relative alarm string ("-15m" / "-1h" / "-1d" / "-2d3h"...) to minutes
/// before the event. Returns `None` if unparseable.
pub fn parse_alarm_minutes(s: &str) -> Option<i64> {
    let s = s.trim();
    let s = s.strip_prefix('-').unwrap_or(s);
    if s.is_empty() {
        return None;
    }
    let mut total = 0i64;
    let mut num = String::new();
    let mut matched = false;
    for c in s.chars() {
        if c.is_ascii_digit() {
            num.push(c);
        } else {
            let n: i64 = num.parse().ok()?;
            num.clear();
            total += match c {
                'd' | 'D' => n * 24 * 60,
                'h' | 'H' => n * 60,
                'm' | 'M' => n,
                _ => return None,
            };
            matched = true;
        }
    }
    // A bare number with no unit is invalid (the TS expects a unit suffix).
    if !matched || !num.is_empty() {
        return None;
    }
    Some(total)
}

/// Build the Google `events.insert` body. Pure. Encodes the event-type side
/// fields the API requires (the bug-prone part the TS Zod layer guards):
/// OOO/focusTime → `transparency:opaque`; workingLocation → `visibility:public`
/// + `transparency:transparent`, `homeOffice` is `{}`; birthday → only `eventType`.
pub fn build_event_body(req: &CreateEventRequest) -> Value {
    let mut body = json!({ "summary": req.title });
    if let Some(loc) = &req.location {
        body["location"] = json!(loc);
    }
    if let Some(notes) = &req.notes {
        body["description"] = json!(notes);
    }
    if req.is_all_day {
        body["start"] = json!({ "date": req.start.split('T').next().unwrap_or(&req.start) });
        body["end"] = json!({ "date": req.end.split('T').next().unwrap_or(&req.end) });
    } else {
        body["start"] = json!({ "dateTime": req.start });
        body["end"] = json!({ "dateTime": req.end });
    }
    if !req.attendees.is_empty() {
        body["attendees"] = json!(req
            .attendees
            .iter()
            .map(|e| json!({ "email": e }))
            .collect::<Vec<_>>());
    }
    if !req.alarms.is_empty() {
        let overrides: Vec<Value> = req
            .alarms
            .iter()
            .filter_map(|a| parse_alarm_minutes(a))
            .map(|m| json!({ "method": "popup", "minutes": m }))
            .collect();
        body["reminders"] = json!({ "useDefault": false, "overrides": overrides });
    }
    if !req.recurrence.is_empty() {
        body["recurrence"] = json!(req.recurrence);
    }

    match req.event_type {
        EventType::Default | EventType::FromGmail => {}
        EventType::OutOfOffice => {
            body["eventType"] = json!("outOfOffice");
            body["transparency"] = json!("opaque");
            let mut props = json!({});
            if let Some(m) = &req.auto_decline_mode {
                props["autoDeclineMode"] = json!(m);
            }
            if let Some(msg) = &req.decline_message {
                props["declineMessage"] = json!(msg);
            }
            body["outOfOfficeProperties"] = props;
        }
        EventType::FocusTime => {
            body["eventType"] = json!("focusTime");
            body["transparency"] = json!("opaque");
            let mut props = json!({});
            if let Some(m) = &req.auto_decline_mode {
                props["autoDeclineMode"] = json!(m);
            }
            if let Some(msg) = &req.decline_message {
                props["declineMessage"] = json!(msg);
            }
            if let Some(cs) = &req.chat_status {
                props["chatStatus"] = json!(cs);
            }
            body["focusTimeProperties"] = props;
        }
        EventType::WorkingLocation => {
            body["eventType"] = json!("workingLocation");
            body["visibility"] = json!("public");
            body["transparency"] = json!("transparent");
            let wtype = req.working_location_type.as_deref().unwrap_or("homeOffice");
            let mut props = json!({ "type": wtype });
            match wtype {
                "homeOffice" => props["homeOffice"] = json!({}),
                "customLocation" => {
                    props["customLocation"] =
                        json!({ "label": req.working_location_label.clone().unwrap_or_default() })
                }
                "officeLocation" => {
                    props["officeLocation"] =
                        json!({ "label": req.working_location_label.clone().unwrap_or_default() })
                }
                _ => {}
            }
            body["workingLocationProperties"] = props;
        }
        EventType::Birthday => {
            body["eventType"] = json!("birthday");
        }
    }
    body
}

/// Whether `[slot_start, slot_end)` overlaps any busy period. Port of the
/// freebusy availability overlap check.
pub fn is_available(busy: &[BusyPeriod], slot_start: &str, slot_end: &str) -> bool {
    !busy
        .iter()
        .any(|b| slot_start < b.end.as_str() && slot_end > b.start.as_str())
}

/// Parse a `freeBusy` response into id → busy periods. Pure.
pub fn parse_freebusy(resp: &Value) -> std::collections::HashMap<String, Vec<BusyPeriod>> {
    let mut out = std::collections::HashMap::new();
    if let Some(cals) = resp.get("calendars").and_then(Value::as_object) {
        for (id, cal) in cals {
            let busy = cal
                .get("busy")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .map(|b| BusyPeriod {
                            start: b
                                .get("start")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                            end: b
                                .get("end")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                        })
                        .collect()
                })
                .unwrap_or_default();
            out.insert(id.clone(), busy);
        }
    }
    out
}

fn calendar_info_from_item(item: &Value) -> Option<CalendarInfo> {
    let id = item.get("id").and_then(Value::as_str)?.to_string();
    Some(CalendarInfo {
        name: item
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or(&id)
            .to_string(),
        is_primary: item
            .get("primary")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        color: item
            .get("backgroundColor")
            .and_then(Value::as_str)
            .map(str::to_string),
        access_role: item
            .get("accessRole")
            .and_then(Value::as_str)
            .map(str::to_string),
        source: "google".to_string(),
        id,
    })
}

/// Async Google Calendar REST client.
pub struct GoogleCalendarClient {
    http: reqwest::Client,
    base_url: String,
}

impl Default for GoogleCalendarClient {
    fn default() -> Self {
        Self::new()
    }
}

impl GoogleCalendarClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: CALENDAR_BASE.to_string(),
        }
    }

    /// Override the base URL (for tests against a mock server).
    pub fn with_base_url(base_url: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url,
        }
    }

    async fn get_json(
        &self,
        token: &str,
        url: &str,
        query: &[(&str, &str)],
    ) -> Result<Value, CalendarError> {
        let resp = self
            .http
            .get(url)
            .bearer_auth(token)
            .query(query)
            .send()
            .await
            .map_err(|e| CalendarError::Http(e.to_string()))?;
        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| CalendarError::Http(e.to_string()))?;
        if !status.is_success() {
            return Err(CalendarError::Api {
                status: status.as_u16(),
                body,
            });
        }
        serde_json::from_str(&body).map_err(|e| CalendarError::Http(e.to_string()))
    }

    /// `events.list` with `singleEvents=true`, paginating `nextPageToken`.
    pub async fn list_events(
        &self,
        token: &str,
        calendar_id: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<CalendarEvent>, CalendarError> {
        let time_min = normalize_to_rfc3339(start_date, false);
        let time_max = normalize_to_rfc3339(end_date, true);
        let url = format!("{}/calendars/{}/events", self.base_url, calendar_id);
        let mut events = Vec::new();
        let mut page_token = String::new();
        loop {
            let mut query = vec![
                ("timeMin", time_min.as_str()),
                ("timeMax", time_max.as_str()),
                ("maxResults", "250"),
                ("singleEvents", "true"),
            ];
            if !page_token.is_empty() {
                query.push(("pageToken", page_token.as_str()));
            }
            let json = self.get_json(token, &url, &query).await?;
            if let Some(items) = json.get("items").and_then(Value::as_array) {
                for item in items {
                    if let Ok(ge) = serde_json::from_value::<GoogleEvent>(item.clone()) {
                        events.push(convert_google_to_calendar_event(&ge));
                    }
                }
            }
            match json.get("nextPageToken").and_then(Value::as_str) {
                Some(t) if !t.is_empty() => page_token = t.to_string(),
                _ => break,
            }
        }
        Ok(events)
    }

    pub async fn get_event(
        &self,
        token: &str,
        calendar_id: &str,
        event_id: &str,
    ) -> Result<GoogleEvent, CalendarError> {
        let url = format!(
            "{}/calendars/{}/events/{}",
            self.base_url, calendar_id, event_id
        );
        let json = self.get_json(token, &url, &[]).await?;
        serde_json::from_value(json).map_err(|e| CalendarError::Http(e.to_string()))
    }

    pub async fn create_event(
        &self,
        token: &str,
        calendar_id: &str,
        req: &CreateEventRequest,
    ) -> Result<CalendarEvent, CalendarError> {
        let url = format!("{}/calendars/{}/events", self.base_url, calendar_id);
        let send_updates = if req.attendees.is_empty() {
            "none"
        } else {
            "all"
        };
        let resp = self
            .http
            .post(&url)
            .bearer_auth(token)
            .query(&[("sendUpdates", send_updates)])
            .json(&build_event_body(req))
            .send()
            .await
            .map_err(|e| CalendarError::Http(e.to_string()))?;
        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| CalendarError::Http(e.to_string()))?;
        if !status.is_success() {
            return Err(CalendarError::Api {
                status: status.as_u16(),
                body,
            });
        }
        let ge: GoogleEvent =
            serde_json::from_str(&body).map_err(|e| CalendarError::Http(e.to_string()))?;
        Ok(convert_google_to_calendar_event(&ge))
    }

    /// `events.delete`; treats 404 as success (already deleted).
    pub async fn delete_event(
        &self,
        token: &str,
        calendar_id: &str,
        event_id: &str,
    ) -> Result<(), CalendarError> {
        let url = format!(
            "{}/calendars/{}/events/{}",
            self.base_url, calendar_id, event_id
        );
        let resp = self
            .http
            .delete(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| CalendarError::Http(e.to_string()))?;
        let status = resp.status();
        if status.is_success() || status.as_u16() == 404 {
            Ok(())
        } else {
            Err(CalendarError::Api {
                status: status.as_u16(),
                body: resp.text().await.unwrap_or_default(),
            })
        }
    }

    pub async fn list_calendars(&self, token: &str) -> Result<Vec<CalendarInfo>, CalendarError> {
        let url = format!("{}/users/me/calendarList", self.base_url);
        let mut calendars = Vec::new();
        let mut page_token = String::new();
        loop {
            let mut query = vec![("showHidden", "true"), ("maxResults", "250")];
            if !page_token.is_empty() {
                query.push(("pageToken", page_token.as_str()));
            }
            let json = self.get_json(token, &url, &query).await?;
            if let Some(items) = json.get("items").and_then(Value::as_array) {
                calendars.extend(items.iter().filter_map(calendar_info_from_item));
            }
            match json.get("nextPageToken").and_then(Value::as_str) {
                Some(t) if !t.is_empty() => page_token = t.to_string(),
                _ => break,
            }
        }
        Ok(calendars)
    }

    /// `freeBusy.query`, batched in groups of 50.
    pub async fn query_freebusy(
        &self,
        token: &str,
        ids: &[String],
        time_min: &str,
        time_max: &str,
    ) -> Result<std::collections::HashMap<String, Vec<BusyPeriod>>, CalendarError> {
        let url = format!("{}/freeBusy", self.base_url);
        let mut out = std::collections::HashMap::new();
        for batch in ids.chunks(FREEBUSY_BATCH) {
            let items: Vec<Value> = batch.iter().map(|id| json!({ "id": id })).collect();
            let body = json!({ "timeMin": time_min, "timeMax": time_max, "items": items });
            let resp = self
                .http
                .post(&url)
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .map_err(|e| CalendarError::Http(e.to_string()))?;
            let status = resp.status();
            let text = resp
                .text()
                .await
                .map_err(|e| CalendarError::Http(e.to_string()))?;
            if !status.is_success() {
                return Err(CalendarError::Api {
                    status: status.as_u16(),
                    body: text,
                });
            }
            let json: Value =
                serde_json::from_str(&text).map_err(|e| CalendarError::Http(e.to_string()))?;
            out.extend(parse_freebusy(&json));
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alarm_parsing() {
        assert_eq!(parse_alarm_minutes("-15m"), Some(15));
        assert_eq!(parse_alarm_minutes("-1h"), Some(60));
        assert_eq!(parse_alarm_minutes("-1d"), Some(1440));
        assert_eq!(parse_alarm_minutes("-2d3h"), Some(2 * 1440 + 180));
        assert_eq!(parse_alarm_minutes("15"), None); // no unit
        assert_eq!(parse_alarm_minutes("-1x"), None); // bad unit
    }

    #[test]
    fn build_event_body_timed_and_allday() {
        let req = CreateEventRequest {
            title: "1on1".into(),
            start: "2025-01-14T14:00:00+09:00".into(),
            end: "2025-01-14T15:00:00+09:00".into(),
            alarms: vec!["-15m".into()],
            attendees: vec!["a@x.com".into()],
            ..Default::default()
        };
        let b = build_event_body(&req);
        assert_eq!(b["summary"], "1on1");
        assert_eq!(b["start"]["dateTime"], "2025-01-14T14:00:00+09:00");
        assert_eq!(b["reminders"]["overrides"][0]["minutes"], 15);
        assert_eq!(b["reminders"]["useDefault"], false);
        assert_eq!(b["attendees"][0]["email"], "a@x.com");

        let allday = CreateEventRequest {
            title: "Vacation".into(),
            start: "2025-12-30T00:00:00Z".into(),
            end: "2026-01-02T00:00:00Z".into(),
            is_all_day: true,
            ..Default::default()
        };
        let b = build_event_body(&allday);
        assert_eq!(b["start"]["date"], "2025-12-30");
        assert!(b["start"].get("dateTime").is_none());
    }

    #[test]
    fn build_event_body_event_type_side_fields() {
        let ooo = CreateEventRequest {
            title: "OOO".into(),
            event_type: EventType::OutOfOffice,
            auto_decline_mode: Some("declineAllConflictingInvitations".into()),
            ..Default::default()
        };
        let b = build_event_body(&ooo);
        assert_eq!(b["eventType"], "outOfOffice");
        assert_eq!(b["transparency"], "opaque");
        assert_eq!(
            b["outOfOfficeProperties"]["autoDeclineMode"],
            "declineAllConflictingInvitations"
        );

        let wl = CreateEventRequest {
            title: "WFH".into(),
            event_type: EventType::WorkingLocation,
            working_location_type: Some("homeOffice".into()),
            ..Default::default()
        };
        let b = build_event_body(&wl);
        assert_eq!(b["visibility"], "public");
        assert_eq!(b["transparency"], "transparent");
        // homeOffice is an empty object, not a bool.
        assert!(b["workingLocationProperties"]["homeOffice"].is_object());

        // birthday → only eventType.
        let bd = build_event_body(&CreateEventRequest {
            title: "BD".into(),
            event_type: EventType::Birthday,
            ..Default::default()
        });
        assert_eq!(bd["eventType"], "birthday");
        assert!(bd.get("birthdayProperties").is_none());
    }

    #[test]
    fn freebusy_parse_and_overlap() {
        let resp = json!({
            "calendars": {
                "room@x.com": { "busy": [{"start": "2025-01-15T10:00:00Z", "end": "2025-01-15T11:00:00Z"}] }
            }
        });
        let map = parse_freebusy(&resp);
        let busy = &map["room@x.com"];
        assert_eq!(busy.len(), 1);
        // overlapping slot → not available
        assert!(!is_available(
            busy,
            "2025-01-15T10:30:00Z",
            "2025-01-15T11:30:00Z"
        ));
        // disjoint slot → available
        assert!(is_available(
            busy,
            "2025-01-15T11:00:00Z",
            "2025-01-15T12:00:00Z"
        ));
    }

    #[test]
    fn calendar_info_mapping() {
        let item = json!({
            "id": "primary", "summary": "Work", "primary": true,
            "backgroundColor": "#fff", "accessRole": "owner"
        });
        let ci = calendar_info_from_item(&item).unwrap();
        assert_eq!(ci.id, "primary");
        assert_eq!(ci.name, "Work");
        assert!(ci.is_primary);
        assert_eq!(ci.source, "google");
    }
}
