//! Priority engine — a 1:1 port of `src/utils/priority.ts`.
//!
//! A first-match cascade: evaluate P0 conditions, then P1, then P2; the first
//! tier with ≥1 matching condition wins; otherwise `default_priority`. Within a
//! tier, every matching condition's `description` is collected for the reason.
//!
//! The deadline rule reads the current time, so `now` is injected (the TS used
//! ambient `new Date()`) — this makes the engine deterministic and testable.

use crate::{
    ConditionOperator, ConditionType, ConditionValue, DeadlineUnit, Priority, PriorityCondition,
    PriorityRules, Task, TeamConfig, TeamRole,
};
use chrono::{DateTime, Utc};

/// Inline manager-keyword list from `evaluateStakeholderCondition` (priority.ts,
/// distinct from `stakeholders.ts`'s longer list). Verbatim.
const MANAGER_KEYWORDS: &[&str] = &[
    "manager",
    "マネージャー",
    "上司",
    "boss",
    "部長",
    "課長",
    "係長",
    "主任",
    "社長",
    "取締役",
    "director",
    "lead",
    "リーダー",
];

/// `blockingKeywords` from `evaluateBlockingCondition`. Verbatim.
const BLOCKING_KEYWORDS: &[&str] = &[
    "blocking",
    "blocker",
    "blocks",
    "ブロック",
    "ブロッカー",
    "障害",
    "dependency",
    "依存",
];

const HOUR_MS: f64 = 60.0 * 60.0 * 1000.0;
const DAY_MS: f64 = 24.0 * HOUR_MS;
const WEEK_MS: f64 = 7.0 * DAY_MS;

#[derive(Debug, Clone, PartialEq)]
pub struct PriorityResult {
    pub priority: Priority,
    pub reason: String,
    /// Descriptions of the conditions that matched the winning tier.
    pub matched_conditions: Vec<String>,
}

/// Determine a task's priority. Port of `PriorityEngine.determinePriority`.
pub fn determine_priority(
    task: &Task,
    rules: &PriorityRules,
    team: Option<&TeamConfig>,
    now: DateTime<Utc>,
) -> PriorityResult {
    let text = task.search_text().to_lowercase();

    for (conditions, priority) in [
        (&rules.p0_conditions, Priority::P0),
        (&rules.p1_conditions, Priority::P1),
        (&rules.p2_conditions, Priority::P2),
    ] {
        let matched: Vec<String> = conditions
            .iter()
            .filter(|c| evaluate_condition(c, task, &text, team, now))
            .map(|c| c.description.clone())
            .collect();
        if !matched.is_empty() {
            let reason = format!("{}のため{}に設定", matched.join("、"), priority);
            return PriorityResult {
                priority,
                reason,
                matched_conditions: matched,
            };
        }
    }

    PriorityResult {
        priority: rules.default_priority,
        reason: format!("デフォルト優先度 ({})", rules.default_priority),
        matched_conditions: Vec::new(),
    }
}

fn evaluate_condition(
    c: &PriorityCondition,
    task: &Task,
    text_lower: &str,
    team: Option<&TeamConfig>,
    now: DateTime<Utc>,
) -> bool {
    match c.condition_type {
        ConditionType::Deadline => {
            evaluate_deadline(task.deadline.as_deref(), c.operator, &c.value, c.unit, now)
        }
        ConditionType::Keyword => evaluate_keyword(&c.value, c.operator, text_lower),
        ConditionType::Stakeholder => evaluate_stakeholder(&c.value, text_lower, team),
        ConditionType::Blocking => BLOCKING_KEYWORDS.iter().any(|k| text_lower.contains(k)),
        ConditionType::Custom => evaluate_custom(&c.value, c.operator, text_lower),
    }
}

fn evaluate_deadline(
    deadline: Option<&str>,
    op: ConditionOperator,
    value: &ConditionValue,
    unit: Option<DeadlineUnit>,
    now: DateTime<Utc>,
) -> bool {
    let Some(deadline) = deadline else {
        return false;
    };
    // Invalid date → JS `NaN`, every comparison false.
    let Ok(dt) = DateTime::parse_from_rfc3339(deadline) else {
        return false;
    };
    let ConditionValue::Number(value) = value else {
        return false;
    };
    let diff_ms = (dt.with_timezone(&Utc) - now).num_milliseconds() as f64;
    let threshold_ms = match unit {
        Some(DeadlineUnit::Days) => value * DAY_MS,
        Some(DeadlineUnit::Weeks) => value * WEEK_MS,
        // hours, or unspecified (TS defaults to hours)
        Some(DeadlineUnit::Hours) | None => value * HOUR_MS,
    };
    match op {
        // `<` is `<=` in the TS — overdue tasks (diff <= 0) match.
        ConditionOperator::Lt => diff_ms <= threshold_ms,
        ConditionOperator::Gt => diff_ms > threshold_ms,
        ConditionOperator::Eq => (diff_ms - threshold_ms).abs() < HOUR_MS,
        _ => false,
    }
}

fn evaluate_keyword(value: &ConditionValue, op: ConditionOperator, text_lower: &str) -> bool {
    let keywords: Vec<String> = match value {
        ConditionValue::List(v) => v.clone(),
        ConditionValue::Text(s) => vec![s.clone()],
        ConditionValue::Number(_) => return false,
    };
    match op {
        ConditionOperator::Contains => keywords
            .iter()
            .any(|k| text_lower.contains(&k.to_lowercase())),
        ConditionOperator::Matches => keywords.iter().any(|k| regex_match(k, text_lower)),
        _ => false,
    }
}

fn evaluate_stakeholder(
    value: &ConditionValue,
    text_lower: &str,
    team: Option<&TeamConfig>,
) -> bool {
    let ConditionValue::Text(value) = value else {
        return false;
    };
    match value.as_str() {
        "manager" => {
            let mut keywords: Vec<String> =
                MANAGER_KEYWORDS.iter().map(|k| k.to_string()).collect();
            if let Some(manager) = team.and_then(|t| t.manager.as_ref()) {
                keywords.push(manager.name.to_lowercase());
                keywords.extend(manager.keywords.iter().map(|k| k.to_lowercase()));
            }
            keywords.iter().any(|k| text_lower.contains(k))
        }
        "lead" => team.is_some_and(|t| {
            t.frequent_collaborators
                .iter()
                .filter(|c| c.role == TeamRole::Lead)
                .any(|c| {
                    c.keywords
                        .iter()
                        .any(|k| text_lower.contains(&k.to_lowercase()))
                })
        }),
        _ => false,
    }
}

fn evaluate_custom(value: &ConditionValue, op: ConditionOperator, text_lower: &str) -> bool {
    let ConditionValue::Text(value) = value else {
        return false;
    };
    match op {
        ConditionOperator::Contains => text_lower.contains(&value.to_lowercase()),
        ConditionOperator::Matches => regex_match(value, text_lower),
        _ => false,
    }
}

/// `new RegExp(pattern, 'i').test(text)`. Invalid patterns → no match (the TS
/// would throw; we fail soft). Case-insensitive via `(?i)`.
fn regex_match(pattern: &str, text: &str) -> bool {
    regex::Regex::new(&format!("(?i){pattern}"))
        .map(|re| re.is_match(text))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{TeamConfig, TeamMember};
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 6, 1, 9, 0, 0).unwrap()
    }

    fn deadline_in(d: chrono::Duration) -> Option<String> {
        Some((now() + d).to_rfc3339())
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

    fn vs(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    // The test ruleset from priority.test.ts (P0 keyword list omits 'critical').
    fn default_rules() -> PriorityRules {
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
                    ConditionValue::List(vs(&["urgent", "emergency", "緊急", "至急"])),
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
                    ConditionValue::Text("manager".into()),
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

    fn team() -> TeamConfig {
        TeamConfig {
            manager: Some(TeamMember {
                name: "John Manager".into(),
                role: TeamRole::Manager,
                keywords: vs(&["john", "manager"]),
                priority: None,
            }),
            frequent_collaborators: vec![],
            departments: vec![],
        }
    }

    fn task(title: &str) -> Task {
        Task {
            title: title.into(),
            ..Default::default()
        }
    }

    fn prio(task: &Task, rules: &PriorityRules, team: Option<&TeamConfig>) -> Priority {
        determine_priority(task, rules, team, now()).priority
    }

    #[test]
    fn keyword_and_default_cascade() {
        assert_eq!(
            prio(&task("Fix urgent production bug"), &default_rules(), None),
            Priority::P0
        );
        assert_eq!(
            prio(&task("緊急: サーバー障害対応"), &default_rules(), None),
            Priority::P0
        );
        assert_eq!(
            prio(&task("Review code changes"), &default_rules(), None),
            Priority::P3
        );
    }

    #[test]
    fn deadline_cascade_with_injected_now() {
        let mut t = task("Submit report");
        t.deadline = deadline_in(chrono::Duration::hours(12));
        assert_eq!(prio(&t, &default_rules(), None), Priority::P0);

        let mut t = task("Complete feature");
        t.deadline = deadline_in(chrono::Duration::days(2));
        assert_eq!(prio(&t, &default_rules(), None), Priority::P1);

        let mut t = task("Write documentation");
        t.deadline = deadline_in(chrono::Duration::days(5));
        assert_eq!(prio(&t, &default_rules(), None), Priority::P2);

        let mut t = task("Plan next quarter");
        t.deadline = deadline_in(chrono::Duration::days(14));
        assert_eq!(prio(&t, &default_rules(), None), Priority::P3);
    }

    #[test]
    fn stakeholder_manager_matches() {
        assert_eq!(
            prio(
                &task("Review with manager John"),
                &default_rules(),
                Some(&team())
            ),
            Priority::P1
        );
    }

    #[test]
    fn blocking_custom_and_matches_operators() {
        let mut rules = default_rules();
        rules.p0_conditions = vec![cond(
            ConditionType::Blocking,
            ConditionOperator::Contains,
            ConditionValue::Text("blocker".into()),
            None,
            "Blocking issue",
        )];
        rules.p1_conditions = vec![];
        rules.p2_conditions = vec![];
        assert_eq!(
            prio(&task("This is a blocker issue"), &rules, None),
            Priority::P0
        );

        let mut rules = default_rules();
        rules.p0_conditions = vec![cond(
            ConditionType::Custom,
            ConditionOperator::Matches,
            ConditionValue::Text("REF-\\d+".into()),
            None,
            "Has ref",
        )];
        assert_eq!(
            prio(&task("Task REF-123 needs attention"), &rules, None),
            Priority::P0
        );

        let mut rules = default_rules();
        rules.p0_conditions = vec![cond(
            ConditionType::Keyword,
            ConditionOperator::Matches,
            ConditionValue::List(vs(&["TICKET-\\d+"])),
            None,
            "Has ticket",
        )];
        assert_eq!(
            prio(&task("TICKET-456 needs review"), &rules, None),
            Priority::P0
        );
    }

    #[test]
    fn weeks_unit_and_gt_and_eq_operators() {
        // weeks
        let mut rules = default_rules();
        rules.p1_conditions = vec![cond(
            ConditionType::Deadline,
            ConditionOperator::Lt,
            ConditionValue::Number(2.0),
            Some(DeadlineUnit::Weeks),
            "Within 2 weeks",
        )];
        let mut t = task("Long term task");
        t.deadline = deadline_in(chrono::Duration::days(10));
        assert_eq!(prio(&t, &rules, None), Priority::P1);

        // '>' operator
        let mut rules = default_rules();
        rules.p0_conditions = vec![];
        rules.p1_conditions = vec![];
        rules.p2_conditions = vec![cond(
            ConditionType::Deadline,
            ConditionOperator::Gt,
            ConditionValue::Number(14.0),
            Some(DeadlineUnit::Days),
            "Far future",
        )];
        let mut t = task("Far future task");
        t.deadline = deadline_in(chrono::Duration::days(30));
        assert_eq!(prio(&t, &rules, None), Priority::P2);

        // '=' operator (within 1h tolerance)
        let mut rules = default_rules();
        rules.p1_conditions = vec![cond(
            ConditionType::Deadline,
            ConditionOperator::Eq,
            ConditionValue::Number(7.0),
            Some(DeadlineUnit::Days),
            "Exactly a week",
        )];
        let mut t = task("Exact deadline task");
        t.deadline = deadline_in(chrono::Duration::days(7));
        assert_eq!(prio(&t, &rules, None), Priority::P1);
    }

    #[test]
    fn lead_role_and_default_unit_and_empty_rules() {
        // lead role
        let team_with_lead = TeamConfig {
            manager: None,
            frequent_collaborators: vec![TeamMember {
                name: "Lead Person".into(),
                role: TeamRole::Lead,
                keywords: vs(&["lead person", "team lead"]),
                priority: None,
            }],
            departments: vec![],
        };
        let mut rules = default_rules();
        rules.p0_conditions = vec![];
        rules.p1_conditions = vec![cond(
            ConditionType::Stakeholder,
            ConditionOperator::Contains,
            ConditionValue::Text("lead".into()),
            None,
            "Involves lead",
        )];
        assert_eq!(
            prio(
                &task("Review with Lead Person"),
                &rules,
                Some(&team_with_lead)
            ),
            Priority::P1
        );

        // default unit (no unit → hours): now+20h < 24h → P0
        let mut rules = default_rules();
        rules.p0_conditions = vec![cond(
            ConditionType::Deadline,
            ConditionOperator::Lt,
            ConditionValue::Number(24.0),
            None,
            "Soon",
        )];
        let mut t = task("Soon task");
        t.deadline = deadline_in(chrono::Duration::hours(20));
        assert_eq!(prio(&t, &rules, None), Priority::P0);

        // empty rules → default P3
        let empty = PriorityRules {
            p0_conditions: vec![],
            p1_conditions: vec![],
            p2_conditions: vec![],
            default_priority: Priority::P3,
        };
        let r = determine_priority(&task("Plain simple task"), &empty, None, now());
        assert_eq!(r.priority, Priority::P3);
        assert!(r.reason.contains("P3"));
    }
}
