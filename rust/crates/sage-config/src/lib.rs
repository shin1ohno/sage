//! `sage-config` — configuration types, loading, validation, migration.
//!
//! A faithful serde port of the TypeScript `~/.sage/config.json` layer
//! (`src/types/config.ts`, `src/types/pipeline-config.ts`, `src/config/`).
//! Composes the domain-input config types from `sage-domain`. Phase 1+ adds the
//! hot-reload chain (file watch + SIGHUP → diff → reinitialize).

pub mod default;
pub mod loader;
pub mod types;
pub mod validation;

pub use default::default_config;
pub use loader::{
    config_dir, config_path, exists, get_default_config, load, load_or_create, save, ConfigError,
};
pub use types::*;
pub use validation::{validate_calendar_sources, ValidationError};

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn default_config_roundtrips() {
        let cfg = default_config();
        let json = serde_json::to_string(&cfg).unwrap();
        let back: UserConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, back);
    }

    #[test]
    fn default_config_uses_expected_camelcase_keys_and_values() {
        let v = serde_json::to_value(default_config()).unwrap();
        // TTL key keeps its uppercase run.
        assert!(v["autonomy"]["pendingActionTTLMinutes"].is_number());
        assert_eq!(v["autonomy"]["pendingActionTTLMinutes"], 30);
        // camelCase nested keys.
        assert_eq!(v["calendar"]["workingHours"]["start"], "09:00");
        // Runtime estimation block is the 90/180 short-list variant.
        assert_eq!(v["estimation"]["complexTaskMinutes"], 90);
        assert_eq!(v["estimation"]["projectTaskMinutes"], 180);
        // All 12 write tools default to Tier 1.
        assert_eq!(v["autonomy"]["tools"]["create_calendar_event"], 1);
        assert_eq!(v["autonomy"]["tools"].as_object().unwrap().len(), 12);
        // Priority P0 urgent-keyword list is verbatim.
        assert_eq!(
            v["priorityRules"]["p0Conditions"][1]["value"],
            serde_json::json!(["urgent", "emergency", "critical", "緊急", "至急"])
        );
        assert_eq!(v["preferences"]["timeFormat"], "24h");
    }

    #[test]
    fn validate_requires_at_least_one_source() {
        let mut sources = default_config().calendar.sources.unwrap();
        sources.eventkit.enabled = false;
        sources.google.enabled = false;
        assert_eq!(
            validate_calendar_sources(&sources),
            Err(ValidationError::NoCalendarSourceEnabled)
        );
        sources.google.enabled = true;
        assert!(validate_calendar_sources(&sources).is_ok());
    }

    #[test]
    fn migrate_backfills_missing_optional_sections() {
        // Start from a complete default, strip the sections older configs omit.
        let mut v = serde_json::to_value(default_config()).unwrap();
        let obj = v.as_object_mut().unwrap();
        obj.get_mut("calendar")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .remove("sources");
        obj.remove("meetingIntelligence");
        obj.remove("autonomy");
        obj.get_mut("integrations")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .remove("slack");

        let migrated = loader::migrate(&mut v);
        assert!(migrated);
        assert!(v["calendar"]["sources"].is_object());
        assert!(v["meetingIntelligence"].is_object());
        assert!(v["autonomy"].is_object());
        assert!(v["integrations"]["slack"].is_object());

        // The migrated value must still deserialize cleanly.
        let cfg: UserConfig = serde_json::from_value(v).unwrap();
        assert!(cfg.calendar.sources.is_some());
        assert!(cfg.autonomy.is_some());
    }

    #[test]
    fn migrate_is_noop_on_complete_config() {
        let mut v: Value = serde_json::to_value(default_config()).unwrap();
        assert!(!loader::migrate(&mut v));
    }
}
