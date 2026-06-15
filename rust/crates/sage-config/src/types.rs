//! `UserConfig` and its nested types — a faithful serde port of the TypeScript
//! `~/.sage/config.json` shape (`src/types/config.ts` + `src/types/pipeline-config.ts`).
//!
//! Every struct serializes camelCase to round-trip existing config files. The
//! domain-input sub-configs (priority/estimation/team) are reused from
//! `sage-domain` to keep the pure engines depending only on that base crate.

use sage_domain::{EstimationConfig, PriorityRules, TeamConfig};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Top-level config persisted at `~/.sage/config.json`. Mirrors TS `UserConfig`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserConfig {
    pub version: String,
    pub created_at: String,
    pub last_updated: String,
    pub user: UserProfile,
    pub calendar: CalendarConfig,
    pub priority_rules: PriorityRules,
    pub estimation: EstimationConfig,
    pub reminders: RemindersConfig,
    pub team: TeamConfig,
    pub integrations: IntegrationsConfig,
    pub preferences: PreferencesConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meeting_intelligence: Option<MeetingIntelligenceConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autonomy: Option<AutonomyConfig>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub timezone: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarConfig {
    pub working_hours: WorkingHours,
    pub meeting_heavy_days: Vec<String>,
    pub deep_work_days: Vec<String>,
    pub deep_work_blocks: Vec<DeepWorkBlock>,
    pub time_zone: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<CalendarSources>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkingHours {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepWorkBlock {
    pub day: String,
    pub start_hour: u32,
    pub end_hour: u32,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalendarSources {
    pub eventkit: EventKitSourceConfig,
    pub google: GoogleCalendarSourceConfig,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventKitSourceConfig {
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_calendars: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleCalendarSourceConfig {
    pub enabled: bool,
    pub default_calendar: String,
    pub excluded_calendars: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_calendars: Option<Vec<String>>,
    pub sync_interval: u32,
    pub enable_notifications: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemindersConfig {
    pub default_types: Vec<String>,
    pub weekly_review: WeeklyReview,
    pub custom_rules: Vec<ReminderRule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeeklyReview {
    pub enabled: bool,
    pub day: String,
    pub time: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReminderRule {
    pub condition: String,
    pub reminders: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationsConfig {
    pub apple_reminders: AppleRemindersConfig,
    pub notion: NotionConfig,
    pub google_calendar: GoogleCalendarConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slack: Option<SlackIntegrationConfig>,
}

/// `'days' | 'hours'` threshold unit used by Apple Reminders / Notion routing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThresholdUnit {
    Days,
    Hours,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleRemindersConfig {
    pub enabled: bool,
    pub threshold: u32,
    pub unit: ThresholdUnit,
    pub default_list: String,
    pub lists: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionConfig {
    pub enabled: bool,
    pub threshold: u32,
    pub unit: ThresholdUnit,
    pub database_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub database_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub property_mappings: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleCalendarConfig {
    pub enabled: bool,
    pub default_calendar: String,
    pub conflict_detection: bool,
    pub look_ahead_days: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesConfig {
    pub language: Language,
    pub date_format: String,
    pub time_format: TimeFormat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Ja,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimeFormat {
    #[serde(rename = "12h")]
    H12,
    #[serde(rename = "24h")]
    H24,
}

/// Per-tool autonomy tiers (0 = auto, 1 = confirm, 2 = forbidden) + pending TTL.
/// Mirrors TS `AutonomyConfig`. Tier values stay as `u8` for round-trip fidelity
/// (JSON numbers); the capability gate (Phase 2) maps them to a tier enum.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomyConfig {
    pub tools: HashMap<String, u8>,
    // TS key is `pendingActionTTLMinutes` — camelCase can't reproduce the "TTL"
    // uppercase run, so rename explicitly.
    #[serde(rename = "pendingActionTTLMinutes")]
    pub pending_action_ttl_minutes: u32,
}

/// Meeting-intelligence pipeline tuning. Mirrors TS `MeetingIntelligenceConfig`
/// (`src/types/pipeline-config.ts`). Consumed in Phase 4; kept here so configs
/// round-trip.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingIntelligenceConfig {
    pub enabled: bool,
    pub briefing_window: u32,
    pub pre_meeting_poll_interval: u32,
    pub post_meeting_poll_interval: u32,
    pub post_meeting_timeout: u32,
    pub post_meeting_delay: u32,
    pub meeting_end_buffer: u32,
    pub slack_lookback_days: u32,
    pub slack_message_batch_size: u32,
    pub minimum_attendees: u32,
    pub exclude_patterns: Vec<ExcludePattern>,
    pub daily_summary_enabled: bool,
    pub prompts_dir: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExcludePattern {
    #[serde(rename = "type")]
    pub pattern_type: ExcludePatternType,
    pub pattern: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExcludePatternType {
    Title,
    Calendar,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackIntegrationConfig {
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub redirect_uri: Option<String>,
}
