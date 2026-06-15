//! `DEFAULT_CONFIG` — a faithful port of `src/types/config.ts`'s default.
//!
//! Values are quoted verbatim from the TS source. Note the estimation block
//! here (90/180 + SHORT keyword lists) is the runtime config used by
//! `analyze_tasks`; it intentionally differs from `sage_domain`'s
//! `DEFAULT_ESTIMATION_CONFIG` (75/175 + long lists), which only the
//! estimation unit tests use.

use crate::types::*;
use chrono::{SecondsFormat, Utc};
use sage_domain::{
    ConditionOperator, ConditionType, ConditionValue, DeadlineUnit, EstimationConfig,
    KeywordMapping, Priority, PriorityCondition, PriorityRules, TeamConfig,
};
use std::collections::HashMap;

fn vs(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

fn cond(
    t: ConditionType,
    op: ConditionOperator,
    v: ConditionValue,
    unit: Option<DeadlineUnit>,
    desc: &str,
) -> PriorityCondition {
    PriorityCondition {
        condition_type: t,
        operator: op,
        value: v,
        unit,
        description: desc.to_string(),
        weight: None,
    }
}

/// Mirrors TS `getDefaultCalendarSources()`: EventKit on by default on macOS,
/// Google on by default elsewhere (so at least one source is enabled).
fn default_calendar_sources() -> CalendarSources {
    let is_macos = cfg!(target_os = "macos");
    CalendarSources {
        eventkit: EventKitSourceConfig {
            enabled: is_macos,
            selected_calendars: None,
        },
        google: GoogleCalendarSourceConfig {
            enabled: !is_macos,
            default_calendar: "primary".to_string(),
            excluded_calendars: vec![],
            selected_calendars: None,
            sync_interval: 300,
            enable_notifications: true,
        },
    }
}

fn default_priority_rules() -> PriorityRules {
    PriorityRules {
        p0_conditions: vec![
            cond(
                ConditionType::Deadline,
                ConditionOperator::Lt,
                ConditionValue::Number(24.0),
                Some(DeadlineUnit::Hours),
                "Due within 24 hours",
            ),
            cond(
                ConditionType::Keyword,
                ConditionOperator::Contains,
                ConditionValue::List(vs(&["urgent", "emergency", "critical", "緊急", "至急"])),
                None,
                "Contains urgent keywords",
            ),
        ],
        p1_conditions: vec![
            cond(
                ConditionType::Deadline,
                ConditionOperator::Lt,
                ConditionValue::Number(3.0),
                Some(DeadlineUnit::Days),
                "Due within 3 days",
            ),
            cond(
                ConditionType::Stakeholder,
                ConditionOperator::Contains,
                ConditionValue::Text("manager".to_string()),
                None,
                "Involves manager",
            ),
        ],
        p2_conditions: vec![cond(
            ConditionType::Deadline,
            ConditionOperator::Lt,
            ConditionValue::Number(7.0),
            Some(DeadlineUnit::Days),
            "Due within a week",
        )],
        default_priority: Priority::P3,
    }
}

fn default_estimation() -> EstimationConfig {
    EstimationConfig {
        simple_task_minutes: 25,
        medium_task_minutes: 50,
        complex_task_minutes: 90,
        project_task_minutes: 180,
        keyword_mapping: KeywordMapping {
            simple: vs(&["check", "review", "read", "confirm", "確認", "レビュー"]),
            medium: vs(&[
                "implement",
                "fix",
                "update",
                "create",
                "実装",
                "修正",
                "作成",
            ]),
            complex: vs(&[
                "design",
                "refactor",
                "migrate",
                "integrate",
                "設計",
                "リファクタ",
            ]),
            project: vs(&["build", "develop", "architect", "構築", "開発"]),
        },
        user_adjustments: None,
    }
}

/// The 12 write tools defaulting to Tier 1 (confirm). Mirrors
/// `DEFAULT_CONFIG.autonomy.tools`.
fn default_autonomy() -> AutonomyConfig {
    let tools = [
        "create_calendar_event",
        "update_calendar_event",
        "delete_calendar_event",
        "delete_calendar_events_batch",
        "respond_to_calendar_event",
        "respond_to_calendar_events_batch",
        "set_reminder",
        "update_task_status",
        "sync_to_notion",
        "sync_tasks",
        "save_config",
        "update_config",
    ];
    AutonomyConfig {
        tools: tools.iter().map(|t| (t.to_string(), 1u8)).collect(),
        pending_action_ttl_minutes: 30,
    }
}

fn default_meeting_intelligence() -> MeetingIntelligenceConfig {
    MeetingIntelligenceConfig {
        enabled: false,
        briefing_window: 15,
        pre_meeting_poll_interval: 5,
        post_meeting_poll_interval: 15,
        post_meeting_timeout: 24,
        post_meeting_delay: 30,
        meeting_end_buffer: 10,
        slack_lookback_days: 7,
        slack_message_batch_size: 50,
        minimum_attendees: 2,
        exclude_patterns: vec![],
        daily_summary_enabled: true,
        prompts_dir: "~/.sage/prompts/".to_string(),
    }
}

/// Build a fresh default `UserConfig`, stamping `createdAt`/`lastUpdated` with
/// the current time (matching the TS `new Date().toISOString()` shape:
/// millisecond precision + trailing `Z`).
pub fn default_config() -> UserConfig {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    UserConfig {
        version: "1.0.0".to_string(),
        created_at: now.clone(),
        last_updated: now,
        user: UserProfile {
            name: String::new(),
            email: None,
            timezone: "Asia/Tokyo".to_string(),
            role: None,
        },
        calendar: CalendarConfig {
            working_hours: WorkingHours {
                start: "09:00".to_string(),
                end: "18:00".to_string(),
            },
            meeting_heavy_days: vs(&["Tuesday", "Thursday"]),
            deep_work_days: vs(&["Monday", "Wednesday", "Friday"]),
            deep_work_blocks: vec![],
            time_zone: "Asia/Tokyo".to_string(),
            sources: Some(default_calendar_sources()),
        },
        priority_rules: default_priority_rules(),
        estimation: default_estimation(),
        reminders: RemindersConfig {
            default_types: vs(&["1_day_before", "1_hour_before"]),
            weekly_review: WeeklyReview {
                enabled: true,
                day: "Friday".to_string(),
                time: "17:00".to_string(),
                description: "Weekly task review".to_string(),
            },
            custom_rules: vec![],
        },
        team: TeamConfig {
            manager: None,
            frequent_collaborators: vec![],
            departments: vec![],
        },
        integrations: IntegrationsConfig {
            apple_reminders: AppleRemindersConfig {
                enabled: true,
                threshold: 7,
                unit: ThresholdUnit::Days,
                default_list: "Reminders".to_string(),
                lists: HashMap::new(),
            },
            notion: NotionConfig {
                enabled: false,
                threshold: 8,
                unit: ThresholdUnit::Days,
                database_id: String::new(),
                database_url: None,
                property_mappings: None,
            },
            google_calendar: GoogleCalendarConfig {
                enabled: false,
                default_calendar: "primary".to_string(),
                conflict_detection: true,
                look_ahead_days: 14,
            },
            slack: Some(SlackIntegrationConfig {
                enabled: false,
                client_id: None,
                client_secret: None,
                redirect_uri: None,
            }),
        },
        preferences: PreferencesConfig {
            language: Language::Ja,
            date_format: "YYYY-MM-DD".to_string(),
            time_format: TimeFormat::H24,
        },
        meeting_intelligence: Some(default_meeting_intelligence()),
        autonomy: Some(default_autonomy()),
    }
}
