//! Pure, cross-platform helpers shared by the macOS impl and exercised by tests
//! on every platform (the parity-testable surface of the crate).

use crate::types::ReminderPriority;
use chrono::{DateTime, FixedOffset, NaiveDate, NaiveDateTime, TimeZone};

/// Asia/Tokyo fixed offset (+09:00). sage targets JST; the TS read path emits a
/// hardcoded `+09:00` suffix, which this reproduces.
fn jst() -> FixedOffset {
    FixedOffset::east_opt(9 * 3600).expect("valid offset")
}

/// Apple Reminders priority value: 0=none, 1=high, 5=medium, 9=low.
/// Port of `AppleRemindersService.mapPriority`.
pub fn apple_reminder_priority(p: ReminderPriority) -> u64 {
    match p {
        ReminderPriority::High => 1,
        ReminderPriority::Medium => 5,
        ReminderPriority::Low => 9,
        ReminderPriority::None => 0,
    }
}

/// Parse a relative alarm offset (`-15m`, `-1h`, `-1d`, `-1w`) into seconds
/// (negative = before the event). `None` if malformed. Port of
/// `CalendarEventCreatorService.parseAlarmString` (`/^-(\d+)([mhdw])$/`).
pub fn parse_alarm_offset_seconds(s: &str) -> Option<f64> {
    let rest = s.strip_prefix('-')?;
    let (digits, unit) = rest.split_at(rest.len().checked_sub(1)?);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let n: f64 = digits.parse().ok()?;
    let mult = match unit {
        "m" => 60.0,
        "h" => 3600.0,
        "d" => 86400.0,
        "w" => 604800.0,
        _ => return None,
    };
    Some(-(n * mult))
}

/// Extract the underlying event UID from an EventKit identifier. iCloud event
/// IDs take the form `<uuid>:<occurrence>`; the deleter keys off the substring
/// after the LAST `:`. Port of `CalendarEventDeleterService.extractEventUid`.
pub fn extract_event_uid(event_id: &str) -> String {
    match event_id.rfind(':') {
        Some(idx) => event_id[idx + 1..].to_string(),
        None => event_id.trim().to_string(),
    }
}

/// Format an epoch-seconds instant as an Asia/Tokyo RFC3339 string
/// (`YYYY-MM-DDTHH:MM:SS+09:00`). Port of `CalendarService.formatDateToJST`'s
/// observable output (offset-aware, unlike the TS local-getter hack — identical
/// for JST inputs).
pub fn epoch_to_jst_rfc3339(secs: f64) -> String {
    let dt: DateTime<FixedOffset> =
        jst()
            .timestamp_opt(secs as i64, 0)
            .single()
            .unwrap_or_else(|| {
                // Fallback: clamp via Utc then convert (covers out-of-range secs).
                DateTime::<chrono::Utc>::from_timestamp(secs as i64, 0)
                    .unwrap_or_else(|| DateTime::<chrono::Utc>::from_timestamp(0, 0).unwrap())
                    .with_timezone(&jst())
            });
    dt.format("%Y-%m-%dT%H:%M:%S+09:00").to_string()
}

/// Parse an ISO 8601 event datetime into epoch seconds. Offset-aware values use
/// their offset; naive (offset-less) datetimes and date-only values are
/// interpreted as Asia/Tokyo.
pub fn parse_event_datetime_to_epoch(iso: &str) -> Option<f64> {
    let s = iso.trim();
    // Offset-aware RFC3339 (`...Z` or `...+09:00`).
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp() as f64);
    }
    // Date-only `YYYY-MM-DD` → JST midnight.
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let ndt = d.and_hms_opt(0, 0, 0)?;
        return jst()
            .from_local_datetime(&ndt)
            .single()
            .map(|dt| dt.timestamp() as f64);
    }
    // Naive datetime (no offset) → interpret as JST.
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S"] {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            return jst()
                .from_local_datetime(&ndt)
                .single()
                .map(|dt| dt.timestamp() as f64);
        }
    }
    None
}

/// Whether a `start`/`end` ISO pair denotes an all-day event: both date-only,
/// or both at literal midnight. Port of `isAllDayEvent` (ignores TZ offset on
/// the time portion).
pub fn is_all_day_iso(start: &str, end: &str) -> bool {
    is_midnight_or_date_only(start) && is_midnight_or_date_only(end)
}

fn is_midnight_or_date_only(s: &str) -> bool {
    match s.split_once('T') {
        None => true, // date-only `YYYY-MM-DD`
        Some((_, time)) => {
            // Strip any trailing offset/zulu before checking the wall-clock time.
            let t = time.split(['+', '-', 'Z']).next().unwrap_or(time);
            matches!(t, "00:00" | "00:00:00" | "00:00:00.000")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_mapping() {
        assert_eq!(apple_reminder_priority(ReminderPriority::High), 1);
        assert_eq!(apple_reminder_priority(ReminderPriority::Medium), 5);
        assert_eq!(apple_reminder_priority(ReminderPriority::Low), 9);
        assert_eq!(apple_reminder_priority(ReminderPriority::None), 0);
    }

    #[test]
    fn alarm_offsets() {
        assert_eq!(parse_alarm_offset_seconds("-15m"), Some(-900.0));
        assert_eq!(parse_alarm_offset_seconds("-1h"), Some(-3600.0));
        assert_eq!(parse_alarm_offset_seconds("-1d"), Some(-86400.0));
        assert_eq!(parse_alarm_offset_seconds("-1w"), Some(-604800.0));
        // malformed
        assert_eq!(parse_alarm_offset_seconds("15m"), None); // no leading minus
        assert_eq!(parse_alarm_offset_seconds("-1x"), None); // bad unit
        assert_eq!(parse_alarm_offset_seconds("-m"), None); // no digits
        assert_eq!(parse_alarm_offset_seconds(""), None);
        assert_eq!(parse_alarm_offset_seconds("-"), None);
    }

    #[test]
    fn event_uid_extraction() {
        assert_eq!(extract_event_uid("ABC123:1"), "1");
        assert_eq!(extract_event_uid("uuid:2:3"), "3"); // last colon
        assert_eq!(extract_event_uid("plain-id"), "plain-id");
        assert_eq!(extract_event_uid("  spaced  "), "spaced");
    }

    #[test]
    fn jst_formatting_and_roundtrip() {
        // epoch 0 is 09:00 in JST.
        assert_eq!(epoch_to_jst_rfc3339(0.0), "1970-01-01T09:00:00+09:00");
        // 2024-01-01T00:00:00Z → 09:00 JST.
        assert_eq!(
            epoch_to_jst_rfc3339(1_704_067_200.0),
            "2024-01-01T09:00:00+09:00"
        );

        // Offset-aware parse.
        let e = parse_event_datetime_to_epoch("2024-01-01T00:00:00+09:00").unwrap();
        assert_eq!(e, 1_704_034_800.0); // 2023-12-31T15:00:00Z
                                        // Round-trips back to the same +09:00 wall-clock.
        assert_eq!(epoch_to_jst_rfc3339(e), "2024-01-01T00:00:00+09:00");

        // Date-only → JST midnight.
        assert_eq!(
            parse_event_datetime_to_epoch("2024-01-01").unwrap(),
            1_704_034_800.0
        );
        // Naive datetime → interpreted as JST.
        assert_eq!(
            parse_event_datetime_to_epoch("2024-01-01T00:00:00").unwrap(),
            1_704_034_800.0
        );
        assert_eq!(parse_event_datetime_to_epoch("not-a-date"), None);
    }

    #[test]
    fn all_day_detection() {
        assert!(is_all_day_iso("2024-01-01", "2024-01-02"));
        assert!(is_all_day_iso("2024-01-01T00:00:00", "2024-01-01T00:00:00"));
        assert!(is_all_day_iso(
            "2024-01-01T00:00:00+09:00",
            "2024-01-02T00:00:00+09:00"
        ));
        assert!(!is_all_day_iso(
            "2024-01-01T09:00:00",
            "2024-01-01T10:00:00"
        ));
        assert!(!is_all_day_iso("2024-01-01", "2024-01-01T10:00:00"));
    }
}
