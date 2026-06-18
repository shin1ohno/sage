//! `sage-integrations` — external-service boundaries behind traits.
//!
//! Phase 1c establishes the `Sampler` seam (MCP sampling). Phase 2+ adds the
//! concrete integrations and their traits:
//! - **google**: `reqwest` over Calendar v3 + People; `oauth2` + PKCE + refresh.
//! - **slack**: `reqwest` Web API + OAuth.
//! - **notion**: `rmcp` client over `transport-child-process` (spawn the Notion
//!   MCP server).
//! - **crypto**: AES-256-GCM + scrypt encryption-service (byte-compatible), PKCE.

pub mod calendar;
pub mod encryption;
pub mod google;
pub mod google_calendar;
pub mod google_people;
pub mod notion;
pub mod pkce;
pub mod sampler;
pub mod slack;
pub mod slack_blocks;

pub use calendar::{AttendeeDetail, CalendarEvent, EventType, Organizer};
pub use encryption::{CryptoError, EncryptionService};
pub use google::{
    convert_google_to_calendar_event, normalize_to_rfc3339, token_is_valid, GoogleAuthError,
    GoogleEvent, GoogleOAuthHandler, GoogleOAuthTokens, StoredTokens, GOOGLE_SCOPES,
};
pub use google_calendar::{
    build_event_body, is_available, parse_alarm_minutes, parse_freebusy, BusyPeriod, CalendarError,
    CalendarInfo, CreateEventRequest, GoogleCalendarClient,
};
pub use google_people::{DirectoryPerson, GooglePeopleClient, PeopleError};
pub use notion::{
    build_create_page_args, parse_page_result, validate_database_id, NotionError, NotionMcpClient,
    NotionPageRequest, NotionPageResult,
};
pub use sampler::{Sampler, SamplingError, SamplingMessage, SamplingRequest, SamplingResponse};
pub use slack::{
    classify_error, SlackChannel, SlackClient, SlackError, SlackMessage, SlackOAuthHandler,
    SlackTokens, SlackUser, SLACK_SCOPES,
};
pub use slack_blocks::{
    format_briefing, format_critical_error, format_daily_summary, format_post_meeting_report,
    CriticalPipelineError, DailySummaryStatus, SourceLinks,
};
