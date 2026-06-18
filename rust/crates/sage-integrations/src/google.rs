//! Google OAuth + Calendar API types and mapping — a hand-rolled (over `reqwest`)
//! port of the `google-auth-library` and `googleapis` usage in
//! `src/google-oauth/google-oauth-handler.ts` and `google-calendar-service.ts`.
//!
//! Phase 2c: OAuth token lifecycle (exchange / refresh / validate / encrypted
//! persistence) + the Google event JSON types + the pure mapping to
//! `CalendarEvent`. The Calendar/People REST operations (events.list/insert/...,
//! freebusy, searchDirectoryPeople) land in Phase 2c2 using these types.

use crate::calendar::{AttendeeDetail, CalendarEvent, EventType, Organizer};
use crate::encryption::{CryptoError, EncryptionService};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Verbatim OAuth scopes (`GOOGLE_CALENDAR_SCOPES`).
pub const GOOGLE_SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/directory.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
];

const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
/// 5-minute pre-emptive refresh window (`validateToken`).
const REFRESH_THRESHOLD_MS: i64 = 5 * 60 * 1000;
const DEFAULT_EXPIRY_SECS: i64 = 3600;

// ---------- Google Calendar API JSON ----------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GoogleDateTime {
    #[serde(rename = "dateTime", default, skip_serializing_if = "Option::is_none")]
    pub date_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(rename = "timeZone", default, skip_serializing_if = "Option::is_none")]
    pub time_zone: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAttendee {
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub response_status: Option<String>,
    pub optional: Option<bool>,
    #[serde(rename = "self")]
    pub self_: Option<bool>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleOrganizer {
    pub email: Option<String>,
    pub display_name: Option<String>,
    #[serde(rename = "self")]
    pub self_: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEvent {
    pub id: Option<String>,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    #[serde(default)]
    pub start: GoogleDateTime,
    #[serde(default)]
    pub end: GoogleDateTime,
    pub status: Option<String>,
    #[serde(rename = "iCalUID")]
    pub i_cal_uid: Option<String>,
    pub event_type: Option<String>,
    #[serde(default)]
    pub recurrence: Vec<String>,
    pub recurring_event_id: Option<String>,
    pub organizer: Option<GoogleOrganizer>,
    #[serde(default)]
    pub attendees: Vec<GoogleAttendee>,
    // Type-discriminating property bags (presence used by detect_event_type).
    pub out_of_office_properties: Option<serde_json::Value>,
    pub focus_time_properties: Option<serde_json::Value>,
    pub working_location_properties: Option<serde_json::Value>,
    pub birthday_properties: Option<serde_json::Value>,
}

/// Detect the event type. Port of `detectEventType`.
pub fn detect_event_type(event: &GoogleEvent) -> EventType {
    if let Some(t) = &event.event_type {
        return match t.as_str() {
            "outOfOffice" => EventType::OutOfOffice,
            "focusTime" => EventType::FocusTime,
            "workingLocation" => EventType::WorkingLocation,
            "birthday" => EventType::Birthday,
            "fromGmail" => EventType::FromGmail,
            _ => EventType::Default,
        };
    }
    if event.out_of_office_properties.is_some() {
        EventType::OutOfOffice
    } else if event.focus_time_properties.is_some() {
        EventType::FocusTime
    } else if event.working_location_properties.is_some() {
        EventType::WorkingLocation
    } else if event.birthday_properties.is_some() {
        EventType::Birthday
    } else {
        EventType::Default
    }
}

/// Port of `convertGoogleToCalendarEvent`.
pub fn convert_google_to_calendar_event(event: &GoogleEvent) -> CalendarEvent {
    let is_all_day = event.start.date.is_some();
    let start = event
        .start
        .date_time
        .clone()
        .or_else(|| event.start.date.clone())
        .unwrap_or_default();
    let end = event
        .end
        .date_time
        .clone()
        .or_else(|| event.end.date.clone())
        .unwrap_or_default();

    CalendarEvent {
        id: event.id.clone().unwrap_or_default(),
        title: event.summary.clone().unwrap_or_default(),
        start,
        end,
        is_all_day,
        source: "google".to_string(),
        calendar: event.organizer.as_ref().and_then(|o| o.email.clone()),
        location: event.location.clone(),
        description: event.description.clone(),
        attendees: event
            .attendees
            .iter()
            .filter_map(|a| a.email.clone())
            .collect(),
        status: event.status.clone(),
        i_cal_uid: event.i_cal_uid.clone(),
        event_type: detect_event_type(event),
        recurrence: event.recurrence.clone(),
        recurring_event_id: event.recurring_event_id.clone(),
        organizer: event.organizer.as_ref().map(|o| Organizer {
            email: o.email.clone(),
            display_name: o.display_name.clone(),
            self_: o.self_,
        }),
        attendees_detailed: event
            .attendees
            .iter()
            .map(|a| AttendeeDetail {
                email: a.email.clone().unwrap_or_default(),
                display_name: a.display_name.clone(),
                response_status: a
                    .response_status
                    .clone()
                    .unwrap_or_else(|| "needsAction".to_string()),
                optional: a.optional,
                self_: a.self_,
                comment: a.comment.clone(),
            })
            .collect(),
    }
}

/// Normalize a date for `timeMin`/`timeMax`. Bare `YYYY-MM-DD` becomes
/// `YYYY-MM-DDT00:00:00Z`; for an end date, 1 UTC day is added (timeMax is
/// exclusive). Strings already containing `T` pass through. Port of `normalizeToRFC3339`.
pub fn normalize_to_rfc3339(date: &str, is_end_date: bool) -> String {
    if date.contains('T') {
        return date.to_string();
    }
    if is_end_date {
        if let Ok(d) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") {
            let next = d + chrono::Duration::days(1);
            return format!("{}T00:00:00Z", next.format("%Y-%m-%d"));
        }
    }
    format!("{date}T00:00:00Z")
}

// ---------- OAuth tokens ----------

/// Encrypted-at-rest token shape (`expiresAt` is ISO-8601 in the file).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: String,
    #[serde(default)]
    pub scope: Vec<String>,
}

/// In-memory tokens (`expires_at` as ms-epoch for comparison).
#[derive(Debug, Clone)]
pub struct GoogleOAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at_ms: i64,
    pub scope: Vec<String>,
}

impl GoogleOAuthTokens {
    fn to_stored(&self) -> StoredTokens {
        let expires_at = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(self.expires_at_ms)
            .map(|t| t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
            .unwrap_or_default();
        StoredTokens {
            access_token: self.access_token.clone(),
            refresh_token: self.refresh_token.clone(),
            expires_at,
            scope: self.scope.clone(),
        }
    }
    fn from_stored(s: StoredTokens) -> Self {
        let expires_at_ms = chrono::DateTime::parse_from_rfc3339(&s.expires_at)
            .map(|t| t.timestamp_millis())
            .unwrap_or(0);
        Self {
            access_token: s.access_token,
            refresh_token: s.refresh_token,
            expires_at_ms,
            scope: s.scope,
        }
    }
}

/// Raw `oauth2.googleapis.com/token` response.
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    scope: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum GoogleAuthError {
    #[error("no stored Google tokens")]
    NoTokens,
    #[error("token response missing access_token")]
    MissingAccessToken,
    #[error("http error: {0}")]
    Http(String),
    #[error(transparent)]
    Crypto(#[from] CryptoError),
}

/// Compute `GoogleOAuthTokens` from a token response. Pure (testable): falls
/// back to `now + 3600s` expiry and to `old_refresh` when the response omits a
/// refresh token (Google omits it on refresh).
fn tokens_from_response(
    resp: TokenResponse,
    now_ms: i64,
    old_refresh: Option<&str>,
) -> Result<GoogleOAuthTokens, GoogleAuthError> {
    let access_token = resp
        .access_token
        .ok_or(GoogleAuthError::MissingAccessToken)?;
    let refresh_token = resp
        .refresh_token
        .or_else(|| old_refresh.map(str::to_string))
        .unwrap_or_default();
    let expires_at_ms = now_ms + resp.expires_in.unwrap_or(DEFAULT_EXPIRY_SECS) * 1000;
    let scope = resp
        .scope
        .map(|s| s.split(' ').map(str::to_string).collect())
        .unwrap_or_else(|| GOOGLE_SCOPES.iter().map(|s| s.to_string()).collect());
    Ok(GoogleOAuthTokens {
        access_token,
        refresh_token,
        expires_at_ms,
        scope,
    })
}

/// A token is valid if it expires more than 5 minutes from `now`. Port of `validateToken`.
pub fn token_is_valid(tokens: &GoogleOAuthTokens, now_ms: i64) -> bool {
    tokens.expires_at_ms > now_ms + REFRESH_THRESHOLD_MS
}

/// Hand-rolled Google OAuth handler (token lifecycle + encrypted persistence).
pub struct GoogleOAuthHandler {
    client_id: String,
    client_secret: String,
    token_path: PathBuf,
    encryption: EncryptionService,
    http: reqwest::Client,
}

impl GoogleOAuthHandler {
    pub fn new(
        client_id: String,
        client_secret: String,
        token_path: PathBuf,
        encryption: EncryptionService,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            token_path,
            encryption,
            http: reqwest::Client::new(),
        }
    }

    /// Load + decrypt stored tokens (`None` if absent).
    pub fn load_tokens(&self) -> Result<Option<GoogleOAuthTokens>, GoogleAuthError> {
        let Some(plain) = self.encryption.decrypt_from_file(&self.token_path)? else {
            return Ok(None);
        };
        let stored: StoredTokens =
            serde_json::from_str(&plain).map_err(|e| GoogleAuthError::Http(e.to_string()))?;
        Ok(Some(GoogleOAuthTokens::from_stored(stored)))
    }

    fn persist(&self, tokens: &GoogleOAuthTokens) -> Result<(), GoogleAuthError> {
        let json = serde_json::to_string(&tokens.to_stored())
            .map_err(|e| GoogleAuthError::Http(e.to_string()))?;
        self.encryption.encrypt_to_file(&json, &self.token_path)?;
        Ok(())
    }

    async fn post_token(&self, form: &[(&str, &str)]) -> Result<TokenResponse, GoogleAuthError> {
        let resp = self
            .http
            .post(TOKEN_ENDPOINT)
            .form(form)
            .send()
            .await
            .map_err(|e| GoogleAuthError::Http(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(GoogleAuthError::Http(format!(
                "token endpoint {}",
                resp.status()
            )));
        }
        resp.json::<TokenResponse>()
            .await
            .map_err(|e| GoogleAuthError::Http(e.to_string()))
    }

    /// Exchange an authorization code (+ PKCE verifier) for tokens, and persist them.
    pub async fn exchange_code(
        &self,
        code: &str,
        code_verifier: &str,
        redirect_uri: &str,
    ) -> Result<GoogleOAuthTokens, GoogleAuthError> {
        let resp = self
            .post_token(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("code_verifier", code_verifier),
                ("client_id", &self.client_id),
                ("client_secret", &self.client_secret),
                ("redirect_uri", redirect_uri),
            ])
            .await?;
        let tokens = tokens_from_response(resp, now_ms(), None)?;
        self.persist(&tokens)?;
        Ok(tokens)
    }

    /// Refresh the access token using the stored refresh token, and re-persist.
    pub async fn refresh(&self) -> Result<GoogleOAuthTokens, GoogleAuthError> {
        let current = self.load_tokens()?.ok_or(GoogleAuthError::NoTokens)?;
        let resp = self
            .post_token(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", &current.refresh_token),
                ("client_id", &self.client_id),
                ("client_secret", &self.client_secret),
            ])
            .await?;
        let tokens = tokens_from_response(resp, now_ms(), Some(&current.refresh_token))?;
        self.persist(&tokens)?;
        Ok(tokens)
    }

    /// Return a valid access token, refreshing pre-emptively (5-min window).
    pub async fn ensure_valid_token(&self) -> Result<String, GoogleAuthError> {
        let tokens = self.load_tokens()?.ok_or(GoogleAuthError::NoTokens)?;
        if token_is_valid(&tokens, now_ms()) {
            return Ok(tokens.access_token);
        }
        Ok(self.refresh().await?.access_token)
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_dates() {
        assert_eq!(
            normalize_to_rfc3339("2025-01-15", false),
            "2025-01-15T00:00:00Z"
        );
        // end date adds 1 UTC day (exclusive timeMax)
        assert_eq!(
            normalize_to_rfc3339("2025-01-20", true),
            "2025-01-21T00:00:00Z"
        );
        // already has T → unchanged
        assert_eq!(
            normalize_to_rfc3339("2025-01-15T10:00:00+09:00", false),
            "2025-01-15T10:00:00+09:00"
        );
    }

    #[test]
    fn detect_and_convert_event_types() {
        let mut e = GoogleEvent {
            id: Some("E1".into()),
            summary: Some("Standup".into()),
            start: GoogleDateTime {
                date_time: Some("2025-01-15T10:00:00+09:00".into()),
                ..Default::default()
            },
            end: GoogleDateTime {
                date_time: Some("2025-01-15T10:15:00+09:00".into()),
                ..Default::default()
            },
            organizer: Some(GoogleOrganizer {
                email: Some("sh1@mercari.com".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let ce = convert_google_to_calendar_event(&e);
        assert_eq!(ce.id, "E1");
        assert_eq!(ce.title, "Standup");
        assert!(!ce.is_all_day);
        assert_eq!(ce.source, "google");
        assert_eq!(ce.calendar.as_deref(), Some("sh1@mercari.com"));
        assert_eq!(ce.event_type, EventType::Default);

        // all-day via `date`
        e.start = GoogleDateTime {
            date: Some("2025-01-16".into()),
            ..Default::default()
        };
        e.end = GoogleDateTime {
            date: Some("2025-01-17".into()),
            ..Default::default()
        };
        assert!(convert_google_to_calendar_event(&e).is_all_day);

        // event-type inference from properties bag
        e.focus_time_properties = Some(serde_json::json!({"chatStatus": "doNotDisturb"}));
        assert_eq!(detect_event_type(&e), EventType::FocusTime);
        e.event_type = Some("outOfOffice".into());
        assert_eq!(detect_event_type(&e), EventType::OutOfOffice); // explicit wins
    }

    #[test]
    fn token_validity_and_response_mapping() {
        let now = 1_000_000_000_000i64;
        let valid = GoogleOAuthTokens {
            access_token: "a".into(),
            refresh_token: "r".into(),
            expires_at_ms: now + 10 * 60 * 1000,
            scope: vec![],
        };
        assert!(token_is_valid(&valid, now));
        let expiring = GoogleOAuthTokens {
            expires_at_ms: now + 60 * 1000, // < 5min
            ..valid.clone()
        };
        assert!(!token_is_valid(&expiring, now));

        // refresh response omitting refresh_token → falls back to old one.
        let resp = TokenResponse {
            access_token: Some("new-access".into()),
            refresh_token: None,
            expires_in: Some(3600),
            scope: Some("https://www.googleapis.com/auth/calendar".into()),
        };
        let t = tokens_from_response(resp, now, Some("old-refresh")).unwrap();
        assert_eq!(t.access_token, "new-access");
        assert_eq!(t.refresh_token, "old-refresh");
        assert_eq!(t.expires_at_ms, now + 3600 * 1000);
        assert_eq!(t.scope, vec!["https://www.googleapis.com/auth/calendar"]);
    }

    #[test]
    fn stored_tokens_roundtrip() {
        let t = GoogleOAuthTokens {
            access_token: "a".into(),
            refresh_token: "r".into(),
            expires_at_ms: 1_700_000_000_000,
            scope: vec!["s1".into()],
        };
        let back = GoogleOAuthTokens::from_stored(t.to_stored());
        assert_eq!(back.expires_at_ms, t.expires_at_ms);
        assert_eq!(back.refresh_token, "r");
    }
}
