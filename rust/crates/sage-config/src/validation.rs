//! Config validation. Mirrors `src/config/validation.ts`'s `validateCalendarSources`
//! refine: at least one calendar source must be enabled.

use crate::types::CalendarSources;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("At least one calendar source (eventkit or google) must be enabled")]
    NoCalendarSourceEnabled,
}

/// Returns `Ok(())` iff at least one of EventKit / Google sources is enabled.
pub fn validate_calendar_sources(sources: &CalendarSources) -> Result<(), ValidationError> {
    if sources.eventkit.enabled || sources.google.enabled {
        Ok(())
    } else {
        Err(ValidationError::NoCalendarSourceEnabled)
    }
}
