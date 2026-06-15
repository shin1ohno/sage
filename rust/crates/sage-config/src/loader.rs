//! Config loading/saving with lazy migration. Mirrors `src/config/loader.ts`.
//!
//! Migration operates on the parsed JSON `Value` (like the TS code mutating the
//! parsed object) before deserialization, so old/partial configs that omit
//! `calendar.sources`, `meetingIntelligence`, `integrations.*`, or `autonomy`
//! load successfully and are re-saved with the backfilled defaults.

use crate::default::default_config;
use crate::types::UserConfig;
use crate::validation::{validate_calendar_sources, ValidationError};
use chrono::{SecondsFormat, Utc};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("home directory not found")]
    NoHomeDir,
    #[error("configuration file not found")]
    NotFound,
    #[error("invalid configuration file structure: {0}")]
    InvalidStructure(String),
    #[error(transparent)]
    InvalidCalendarSources(#[from] ValidationError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

/// `~/.sage`
pub fn config_dir() -> Result<PathBuf, ConfigError> {
    Ok(dirs::home_dir()
        .ok_or(ConfigError::NoHomeDir)?
        .join(".sage"))
}

/// `~/.sage/config.json`
pub fn config_path() -> Result<PathBuf, ConfigError> {
    Ok(config_dir()?.join("config.json"))
}

/// Whether the config file exists.
pub fn exists() -> bool {
    config_path().map(|p| p.exists()).unwrap_or(false)
}

/// Backfill missing optional sections from the defaults, mutating `value` in
/// place. Returns `true` if anything was added. Pure (no I/O) for testability.
pub(crate) fn migrate(value: &mut Value) -> bool {
    let defaults = serde_json::to_value(default_config()).expect("default_config serializes");
    let mut migrated = false;

    let Some(obj) = value.as_object_mut() else {
        return false;
    };

    // calendar.sources
    if let Some(cal) = obj.get_mut("calendar").and_then(Value::as_object_mut) {
        if !cal.contains_key("sources") {
            cal.insert("sources".into(), defaults["calendar"]["sources"].clone());
            migrated = true;
        }
    }

    // meetingIntelligence
    if !obj.contains_key("meetingIntelligence") {
        obj.insert(
            "meetingIntelligence".into(),
            defaults["meetingIntelligence"].clone(),
        );
        migrated = true;
    }

    // integrations (whole block, then per-sub-field backfill)
    if !obj.contains_key("integrations") {
        obj.insert("integrations".into(), defaults["integrations"].clone());
        migrated = true;
    } else if let Some(integ) = obj.get_mut("integrations").and_then(Value::as_object_mut) {
        for key in ["appleReminders", "notion", "googleCalendar", "slack"] {
            if !integ.contains_key(key) {
                integ.insert(key.into(), defaults["integrations"][key].clone());
                migrated = true;
            }
        }
    }

    // autonomy (safe-by-default: backfills the Tier-1 matrix)
    if !obj.contains_key("autonomy") {
        obj.insert("autonomy".into(), defaults["autonomy"].clone());
        migrated = true;
    }

    migrated
}

/// Load and (lazily migrate) the config from `~/.sage/config.json`.
pub fn load() -> Result<UserConfig, ConfigError> {
    let path = config_path()?;
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(ConfigError::NotFound),
        Err(e) => return Err(e.into()),
    };

    let mut value: Value = serde_json::from_str(&content)?;

    // Basic structure check (TS: `parsed.version && parsed.user`).
    let has_version = value
        .get("version")
        .and_then(Value::as_str)
        .is_some_and(|s| !s.is_empty());
    if !has_version || value.get("user").is_none() {
        return Err(ConfigError::InvalidStructure(
            "missing version or user".into(),
        ));
    }

    let migrated = migrate(&mut value);
    let config: UserConfig = serde_json::from_value(value)?;

    if let Some(sources) = &config.calendar.sources {
        validate_calendar_sources(sources)?;
    }

    if migrated {
        save(&config)?;
    }
    Ok(config)
}

/// Persist the config, validating `calendar.sources` and stamping `lastUpdated`.
pub fn save(config: &UserConfig) -> Result<(), ConfigError> {
    let sources = config.calendar.sources.as_ref().ok_or_else(|| {
        ConfigError::InvalidStructure("missing required field: calendar.sources".into())
    })?;
    validate_calendar_sources(sources)?;

    fs::create_dir_all(config_dir()?)?;

    let mut to_write = config.clone();
    to_write.last_updated = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    fs::write(config_path()?, serde_json::to_string_pretty(&to_write)?)?;
    Ok(())
}

/// A fresh default config (timestamps set to now). Mirrors `getDefaultConfig`.
pub fn get_default_config() -> UserConfig {
    default_config()
}

/// Load the config, creating a default one if it doesn't exist or is invalid.
pub fn load_or_create() -> Result<UserConfig, ConfigError> {
    match load() {
        Ok(config) => Ok(config),
        Err(_) => {
            let config = get_default_config();
            save(&config)?;
            Ok(config)
        }
    }
}
