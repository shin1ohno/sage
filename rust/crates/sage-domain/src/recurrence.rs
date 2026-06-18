//! RRULE (RFC 5545) parse / validate / describe — 1:1 port of
//! `src/utils/recurrence-validator.ts`. Pure.
//!
//! `parse_rrule` short-circuits to `None` on any malformed component;
//! `validate_recurrence_rules` accumulates every error with its code. The JS
//! `INVALID_INPUT`/`INVALID_RULE_TYPE` top-level type checks are unrepresentable
//! for a typed `&[String]` and so are omitted.

use chrono::NaiveDate;

pub const VALID_FREQUENCIES: &[&str] = &["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
pub const VALID_DAY_CODES: &[&str] = &["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

fn day_code_to_japanese_base(code: &str) -> Option<&'static str> {
    match code {
        "MO" => Some("月"),
        "TU" => Some("火"),
        "WE" => Some("水"),
        "TH" => Some("木"),
        "FR" => Some("金"),
        "SA" => Some("土"),
        "SU" => Some("日"),
        _ => None,
    }
}

fn freq_to_japanese(freq: &str) -> &'static str {
    match freq {
        "DAILY" => "毎日",
        "WEEKLY" => "毎週",
        "MONTHLY" => "毎月",
        "YEARLY" => "毎年",
        _ => "",
    }
}

fn freq_to_interval_suffix(freq: &str) -> &'static str {
    match freq {
        "DAILY" => "日ごと",
        "WEEKLY" => "週間ごと",
        "MONTHLY" => "ヶ月ごと",
        "YEARLY" => "年ごと",
        _ => "",
    }
}

/// JS `parseInt(s, 10)`: optional sign, leading digits, stop at first non-digit,
/// `None` if no leading digits (NaN).
pub fn parse_int_js(s: &str) -> Option<i64> {
    let t = s.trim_start();
    let bytes = t.as_bytes();
    let mut i = 0;
    let mut neg = false;
    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        neg = bytes[i] == b'-';
        i += 1;
    }
    let start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == start {
        return None;
    }
    let n: i64 = t[start..i].parse().ok()?;
    Some(if neg { -n } else { n })
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedRrule {
    pub freq: String,
    pub interval: Option<u32>,
    pub count: Option<u32>,
    pub until: Option<String>,
    pub byday: Option<Vec<String>>,
    pub bymonthday: Option<Vec<i32>>,
}

fn last2_upper(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let start = chars.len().saturating_sub(2);
    chars[start..].iter().collect::<String>().to_uppercase()
}

pub fn is_valid_byday(day: &str) -> bool {
    if day.is_empty() {
        return false;
    }
    let day_code = last2_upper(day);
    if !VALID_DAY_CODES.contains(&day_code.as_str()) {
        return false;
    }
    let char_count = day.chars().count();
    if char_count > 2 {
        let prefix: String = day.chars().take(char_count - 2).collect();
        match parse_int_js(&prefix) {
            Some(n) if n != 0 && (-53..=53).contains(&n) => {}
            _ => return false,
        }
    }
    true
}

pub fn is_valid_until_date(until: &str) -> bool {
    if until.is_empty() {
        return false;
    }
    // YYYYMMDD
    if until.len() == 8 && until.bytes().all(|b| b.is_ascii_digit()) {
        let y: i32 = until[0..4].parse().unwrap_or(0);
        let m: u32 = until[4..6].parse().unwrap_or(0);
        let d: u32 = until[6..8].parse().unwrap_or(0);
        if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
            return false;
        }
        return NaiveDate::from_ymd_opt(y, m, d).is_some();
    }
    // YYYYMMDDTHHMMSSZ?
    let dt_ok = (until.len() == 15 || until.len() == 16)
        && until[0..8].bytes().all(|b| b.is_ascii_digit())
        && until.as_bytes().get(8) == Some(&b'T')
        && until[9..15].bytes().all(|b| b.is_ascii_digit())
        && (until.len() == 15 || until.as_bytes().get(15) == Some(&b'Z'));
    if dt_ok {
        let y: i32 = until[0..4].parse().unwrap_or(0);
        let m: u32 = until[4..6].parse().unwrap_or(0);
        let d: u32 = until[6..8].parse().unwrap_or(0);
        let h: u32 = until[9..11].parse().unwrap_or(99);
        let min: u32 = until[11..13].parse().unwrap_or(99);
        let s: u32 = until[13..15].parse().unwrap_or(99);
        return (1970..=9999).contains(&y)
            && (1..=12).contains(&m)
            && (1..=31).contains(&d)
            && h <= 23
            && min <= 59
            && s <= 59;
    }
    // ISO 8601 fallback (`new Date(until)` validity).
    chrono::DateTime::parse_from_rfc3339(until).is_ok()
        || NaiveDate::parse_from_str(until, "%Y-%m-%d").is_ok()
}

/// Parse an RRULE; `None` if any component is malformed/invalid (FREQ required).
pub fn parse_rrule(rule: &str) -> Option<ParsedRrule> {
    let stripped = strip_rrule_prefix(rule).trim().to_string();
    let mut freq: Option<String> = None;
    let mut interval = None;
    let mut count = None;
    let mut until = None;
    let mut byday = None;
    let mut bymonthday = None;

    for part in stripped.split(';') {
        let (k, v) = part.split_once('=')?;
        let key = k.trim().to_uppercase();
        let value = v.trim();
        if key.is_empty() || value.is_empty() {
            return None;
        }
        match key.as_str() {
            "FREQ" => {
                let f = value.to_uppercase();
                if !VALID_FREQUENCIES.contains(&f.as_str()) {
                    return None;
                }
                freq = Some(f);
            }
            "INTERVAL" => {
                let n = parse_int_js(value)?;
                if n < 1 {
                    return None;
                }
                interval = Some(n as u32);
            }
            "COUNT" => {
                let n = parse_int_js(value)?;
                if n < 1 {
                    return None;
                }
                count = Some(n as u32);
            }
            "UNTIL" => {
                if !is_valid_until_date(value) {
                    return None;
                }
                until = Some(value.to_string());
            }
            "BYDAY" => {
                let days: Vec<String> = value.split(',').map(|d| d.trim().to_string()).collect();
                if !days.iter().all(|d| is_valid_byday(d)) {
                    return None;
                }
                byday = Some(days);
            }
            "BYMONTHDAY" => {
                let mut nums = Vec::new();
                for d in value.split(',') {
                    let n = parse_int_js(d.trim())?;
                    if !((1..=31).contains(&n) || (-31..=-1).contains(&n)) {
                        return None;
                    }
                    nums.push(n as i32);
                }
                bymonthday = Some(nums);
            }
            _ => {} // unknown keys skipped
        }
    }

    Some(ParsedRrule {
        freq: freq?,
        interval,
        count,
        until,
        byday,
        bymonthday,
    })
}

fn strip_rrule_prefix(rule: &str) -> &str {
    if rule.len() >= 6 && rule[..6].eq_ignore_ascii_case("RRULE:") {
        &rule[6..]
    } else {
        rule
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidationError {
    pub code: String,
    pub message: String,
    pub rule: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidationResult {
    pub success: bool,
    pub errors: Vec<ValidationError>,
}

fn err(code: &str, message: String, rule: &str) -> ValidationError {
    ValidationError {
        code: code.to_string(),
        message,
        rule: rule.to_string(),
    }
}

/// Validate a single RRULE, accumulating all errors (vs `parse_rrule`'s short-circuit).
pub fn validate_single_rule(rule: &str) -> Vec<ValidationError> {
    let mut errors = Vec::new();
    let rule_string = strip_rrule_prefix(rule).trim().to_string();

    if rule_string.is_empty() {
        errors.push(err("EMPTY_RULE", "Rule cannot be empty".into(), rule));
        return errors;
    }

    let mut components: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for part in rule_string.split(';') {
        match part.find('=') {
            None => errors.push(err(
                "INVALID_SYNTAX",
                format!("Invalid rule part format: \"{part}\". Expected KEY=VALUE"),
                rule,
            )),
            Some(eq) => {
                let key = part[..eq].to_uppercase().trim().to_string();
                let value = part[eq + 1..].trim().to_string();
                if key.is_empty() || value.is_empty() {
                    errors.push(err(
                        "INVALID_SYNTAX",
                        format!("Invalid rule part: \"{part}\". Both key and value are required"),
                        rule,
                    ));
                } else {
                    components.insert(key, value);
                }
            }
        }
    }

    match components.get("FREQ") {
        None => errors.push(err(
            "MISSING_FREQ",
            "FREQ is required in RRULE".into(),
            rule,
        )),
        Some(f) => {
            let f = f.to_uppercase();
            if !VALID_FREQUENCIES.contains(&f.as_str()) {
                errors.push(err(
                    "INVALID_FREQ",
                    format!(
                        "Invalid FREQ value: \"{f}\". Must be one of: {}",
                        VALID_FREQUENCIES.join(", ")
                    ),
                    rule,
                ));
            }
        }
    }

    for (key, code) in [("INTERVAL", "INVALID_INTERVAL"), ("COUNT", "INVALID_COUNT")] {
        if let Some(v) = components.get(key) {
            match parse_int_js(v) {
                None => errors.push(err(
                    code,
                    format!("{key} must be a number, got: \"{v}\""),
                    rule,
                )),
                Some(n) if n < 1 => errors.push(err(
                    code,
                    format!("{key} must be a positive integer, got: {n}"),
                    rule,
                )),
                _ => {}
            }
        }
    }

    if let Some(until) = components.get("UNTIL") {
        if !is_valid_until_date(until) {
            errors.push(err(
                "INVALID_UNTIL",
                format!("UNTIL must be a valid ISO date (YYYYMMDD or ISO 8601 format), got: \"{until}\""),
                rule,
            ));
        }
    }

    if components.contains_key("COUNT") && components.contains_key("UNTIL") {
        errors.push(err(
            "MUTUALLY_EXCLUSIVE",
            "COUNT and UNTIL are mutually exclusive. Use only one of them.".into(),
            rule,
        ));
    }

    if let Some(byday) = components.get("BYDAY") {
        for day in byday.split(',').map(|d| d.trim().to_uppercase()) {
            if !is_valid_byday(&day) {
                errors.push(err(
                    "INVALID_BYDAY",
                    format!(
                        "Invalid BYDAY value: \"{day}\". Must be one of: {} (optionally prefixed with a number for MONTHLY/YEARLY rules)",
                        VALID_DAY_CODES.join(", ")
                    ),
                    rule,
                ));
            }
        }
    }

    if let Some(bymonthday) = components.get("BYMONTHDAY") {
        for day in bymonthday.split(',').map(str::trim) {
            match parse_int_js(day) {
                None => errors.push(err(
                    "INVALID_BYMONTHDAY",
                    format!("BYMONTHDAY must contain numbers, got: \"{day}\""),
                    rule,
                )),
                Some(n) if !((1..=31).contains(&n) || (-31..=-1).contains(&n)) => errors.push(err(
                    "INVALID_BYMONTHDAY",
                    format!("BYMONTHDAY values must be between 1-31 or -31 to -1, got: {n}"),
                    rule,
                )),
                _ => {}
            }
        }
    }

    errors
}

/// Validate a list of RRULEs. `success` iff no errors.
pub fn validate_recurrence_rules(rules: &[String]) -> ValidationResult {
    let mut errors = Vec::new();
    for rule in rules {
        errors.extend(validate_single_rule(rule));
    }
    ValidationResult {
        success: errors.is_empty(),
        errors,
    }
}

/// Build an RRULE string. Emit order: FREQ, INTERVAL(!=1), COUNT, UNTIL, BYDAY, BYMONTHDAY.
pub fn create_rrule(parsed: &ParsedRrule) -> String {
    let mut parts = vec![format!("FREQ={}", parsed.freq)];
    if let Some(i) = parsed.interval {
        if i != 1 {
            parts.push(format!("INTERVAL={i}"));
        }
    }
    if let Some(c) = parsed.count {
        parts.push(format!("COUNT={c}"));
    }
    if let Some(u) = &parsed.until {
        parts.push(format!("UNTIL={u}"));
    }
    if let Some(b) = &parsed.byday {
        if !b.is_empty() {
            parts.push(format!("BYDAY={}", b.join(",")));
        }
    }
    if let Some(b) = &parsed.bymonthday {
        if !b.is_empty() {
            parts.push(format!(
                "BYMONTHDAY={}",
                b.iter()
                    .map(|n| n.to_string())
                    .collect::<Vec<_>>()
                    .join(",")
            ));
        }
    }
    parts.join(";")
}

fn day_code_to_japanese(day_code: &str) -> String {
    let base = last2_upper(day_code);
    let jp = day_code_to_japanese_base(&base).unwrap_or(day_code);
    let char_count = day_code.chars().count();
    if char_count > 2 {
        let prefix: String = day_code.chars().take(char_count - 2).collect();
        if let Some(n) = parse_int_js(&prefix) {
            if n > 0 {
                return format!("第{n}{jp}曜日");
            } else {
                return format!("最終から{}番目の{jp}曜日", n.abs());
            }
        }
    }
    jp.to_string()
}

fn format_until_to_japanese(until: &str) -> String {
    let (y, m, d) = if until.len() >= 8 && until[0..8].bytes().all(|b| b.is_ascii_digit()) {
        (
            until[0..4].parse::<i64>().unwrap_or(0),
            until[4..6].parse::<i64>().unwrap_or(0),
            until[6..8].parse::<i64>().unwrap_or(0),
        )
    } else if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(until) {
        use chrono::Datelike;
        let dt = dt.with_timezone(&chrono::Utc);
        (dt.year() as i64, dt.month() as i64, dt.day() as i64)
    } else {
        return until.to_string();
    };
    format!("{y}年{m}月{d}日")
}

/// Human-readable Japanese description. Port of `describeRecurrence`.
pub fn describe_recurrence(rules: &[String]) -> String {
    if rules.is_empty() {
        return String::new();
    }
    let Some(rrule) = rules
        .iter()
        .find(|r| r.to_uppercase().starts_with("RRULE:") || !r.contains(':'))
    else {
        return String::new();
    };
    let Some(parsed) = parse_rrule(rrule) else {
        return String::new();
    };

    let mut parts: Vec<String> = Vec::new();
    let mut suffix = String::new();
    let interval = parsed.interval.unwrap_or(1);

    if interval == 1 {
        parts.push(freq_to_japanese(&parsed.freq).to_string());
    } else {
        parts.push(format!(
            "{interval}{}",
            freq_to_interval_suffix(&parsed.freq)
        ));
    }

    if let Some(byday) = &parsed.byday {
        if !byday.is_empty() {
            let jp: Vec<String> = byday.iter().map(|d| day_code_to_japanese(d)).collect();
            if interval == 1 {
                parts.push(format!("{}曜日", jp.join("・")));
            } else {
                let first = parts[0].clone();
                parts[0] = format!("{first}の");
                parts.push(format!("{}曜日", jp.join("・")));
            }
        }
    }

    if let Some(bmd) = &parsed.bymonthday {
        if !bmd.is_empty() {
            let list = bmd
                .iter()
                .map(|d| {
                    if *d < 0 {
                        format!("月末から{}日前", d.abs())
                    } else {
                        format!("{d}日")
                    }
                })
                .collect::<Vec<_>>()
                .join("・");
            parts.push(list);
        }
    }

    if let Some(c) = parsed.count {
        suffix = format!("（{c}回）");
    }
    if let Some(u) = &parsed.until {
        suffix = format!("（{}まで）", format_until_to_japanese(u));
    }

    format!("{}{}", parts.join(""), suffix)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vs(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parse_rrule_valid_and_invalid() {
        assert_eq!(parse_rrule("FREQ=DAILY").unwrap().freq, "DAILY");
        let p = parse_rrule("FREQ=WEEKLY;INTERVAL=2").unwrap();
        assert_eq!(p.interval, Some(2));
        assert_eq!(parse_rrule("FREQ=DAILY;COUNT=10").unwrap().count, Some(10));
        assert_eq!(
            parse_rrule("FREQ=DAILY;UNTIL=20251231")
                .unwrap()
                .until
                .as_deref(),
            Some("20251231")
        );
        assert_eq!(
            parse_rrule("FREQ=WEEKLY;BYDAY=MO,WE,FR").unwrap().byday,
            Some(vs(&["MO", "WE", "FR"]))
        );
        assert_eq!(
            parse_rrule("FREQ=MONTHLY;BYMONTHDAY=-1,-5")
                .unwrap()
                .bymonthday,
            Some(vec![-1, -5])
        );
        assert_eq!(parse_rrule("RRULE:FREQ=DAILY").unwrap().freq, "DAILY");
        // case-insensitive + interval=1 preserved by parse
        assert_eq!(
            parse_rrule("freq=daily;interval=1").unwrap().interval,
            Some(1)
        );

        // null cases
        for bad in [
            "",
            "INTERVAL=2;COUNT=10",
            "FREQ=HOURLY",
            "FREQ=DAILY;INTERVAL=abc",
            "FREQ=DAILY;INTERVAL=-1",
            "FREQ=DAILY;INTERVAL=0",
            "FREQ=DAILY;COUNT=0",
            "FREQ=DAILY;UNTIL=2025-13-45",
            "FREQ=WEEKLY;BYDAY=XX,YY",
            "FREQ=MONTHLY;BYMONTHDAY=32",
            "FREQ=DAILY;INVALID_PART",
            "FREQ=DAILY;=VALUE",
            "FREQ=DAILY;KEY=",
        ] {
            assert!(parse_rrule(bad).is_none(), "expected None for {bad:?}");
        }
    }

    #[test]
    fn validate_error_codes() {
        let code = |rule: &str| validate_recurrence_rules(&vs(&[rule]));
        assert!(validate_recurrence_rules(&[]).success);
        assert!(code("FREQ=DAILY").success);

        let r = code("INTERVAL=2;COUNT=10");
        assert!(!r.success);
        assert_eq!(r.errors[0].code, "MISSING_FREQ");
        assert!(r.errors[0].message.contains("FREQ is required"));

        let r = code("FREQ=HOURLY");
        assert_eq!(r.errors[0].code, "INVALID_FREQ");
        assert!(r.errors[0].message.contains("Invalid FREQ value"));
        assert!(r.errors[0].message.contains("DAILY"));

        assert_eq!(
            code("FREQ=DAILY;COUNT=10;UNTIL=20251231").errors[0].code,
            "MUTUALLY_EXCLUSIVE"
        );
        assert_eq!(
            code("FREQ=DAILY;INTERVAL=abc").errors[0].code,
            "INVALID_INTERVAL"
        );
        assert_eq!(code("FREQ=DAILY;COUNT=-5").errors[0].code, "INVALID_COUNT");
        assert_eq!(
            code("FREQ=DAILY;UNTIL=20251345").errors[0].code,
            "INVALID_UNTIL"
        );
        assert_eq!(code("FREQ=WEEKLY;BYDAY=XX").errors[0].code, "INVALID_BYDAY");
        assert_eq!(
            code("FREQ=MONTHLY;BYMONTHDAY=32").errors[0].code,
            "INVALID_BYMONTHDAY"
        );
        assert_eq!(code("").errors[0].code, "EMPTY_RULE");
        assert_eq!(
            code("FREQ=DAILY;INVALID_PART").errors[0].code,
            "INVALID_SYNTAX"
        );
        // multiple errors accumulate; MISSING_FREQ present
        let r = code("INTERVAL=-1;COUNT=-5;UNTIL=invalid");
        assert!(r.errors.len() > 1);
        assert!(r.errors.iter().any(|e| e.code == "MISSING_FREQ"));
    }

    #[test]
    fn describe_strings() {
        let d = |r: &str| describe_recurrence(&vs(&[r]));
        assert_eq!(d("FREQ=DAILY"), "毎日");
        assert_eq!(d("FREQ=WEEKLY"), "毎週");
        assert_eq!(d("FREQ=DAILY;INTERVAL=2"), "2日ごと");
        assert_eq!(d("FREQ=MONTHLY;INTERVAL=3"), "3ヶ月ごと");
        assert_eq!(d("FREQ=WEEKLY;BYDAY=MO"), "毎週月曜日");
        assert_eq!(d("FREQ=WEEKLY;BYDAY=MO,WE,FR"), "毎週月・水・金曜日");
        assert_eq!(d("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"), "2週間ごとの月曜日");
        assert_eq!(d("FREQ=MONTHLY;BYMONTHDAY=15"), "毎月15日");
        assert_eq!(d("FREQ=MONTHLY;BYMONTHDAY=1,15,30"), "毎月1日・15日・30日");
        assert!(d("FREQ=MONTHLY;BYMONTHDAY=-1").contains("月末"));
        assert_eq!(d("FREQ=DAILY;COUNT=10"), "毎日（10回）");
        assert_eq!(d("FREQ=DAILY;UNTIL=20251231"), "毎日（2025年12月31日まで）");
        assert_eq!(describe_recurrence(&[]), "");
        assert_eq!(d("INVALID"), "");
        assert_eq!(d("RRULE:FREQ=DAILY"), "毎日");
    }

    #[test]
    fn create_rrule_strings() {
        let mk = |freq: &str| ParsedRrule {
            freq: freq.into(),
            interval: None,
            count: None,
            until: None,
            byday: None,
            bymonthday: None,
        };
        assert_eq!(create_rrule(&mk("DAILY")), "FREQ=DAILY");
        assert_eq!(
            create_rrule(&ParsedRrule {
                interval: Some(2),
                ..mk("WEEKLY")
            }),
            "FREQ=WEEKLY;INTERVAL=2"
        );
        // interval 1 omitted
        assert_eq!(
            create_rrule(&ParsedRrule {
                interval: Some(1),
                ..mk("DAILY")
            }),
            "FREQ=DAILY"
        );
        assert_eq!(
            create_rrule(&ParsedRrule {
                count: Some(10),
                ..mk("DAILY")
            }),
            "FREQ=DAILY;COUNT=10"
        );
        assert_eq!(
            create_rrule(&ParsedRrule {
                byday: Some(vs(&["MO", "WE", "FR"])),
                ..mk("WEEKLY")
            }),
            "FREQ=WEEKLY;BYDAY=MO,WE,FR"
        );
        // emit order: FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY
        assert_eq!(
            create_rrule(&ParsedRrule {
                interval: Some(2),
                count: Some(20),
                byday: Some(vs(&["MO", "WE", "FR"])),
                ..mk("WEEKLY")
            }),
            "FREQ=WEEKLY;INTERVAL=2;COUNT=20;BYDAY=MO,WE,FR"
        );
    }
}
