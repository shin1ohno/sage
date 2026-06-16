//! Stakeholder-extraction engine — a 1:1 port of `src/utils/stakeholders.ts`.
//!
//! Pure. Parity hazards handled explicitly:
//! - JS mention regexes use ASCII `\w` (no `u` flag) → ported as `[A-Za-z0-9_]`,
//!   so Japanese names are caught only by the explicit さん/様 alternation.
//! - CJK name patterns use `[一-龯]` = U+4E00–U+9FAF (narrower than full CJK) →
//!   ported as `[\x{4E00}-\x{9FAF}]`.
//! - `mention.length > 1` is UTF-16 length → `encode_utf16().count()`.

use crate::{Task, TeamConfig, TeamMember};
use regex::Regex;
use std::sync::LazyLock;

/// `MANAGER_KEYWORDS` (18 entries — the canonical list for involvement checks,
/// larger than priority.ts's inline list). Verbatim, all lowercase-equivalent.
const MANAGER_KEYWORDS: &[&str] = &[
    "manager",
    "マネージャー",
    "上司",
    "boss",
    "supervisor",
    "管理者",
    "director",
    "ディレクター",
    "lead",
    "リーダー",
    "team lead",
    "チームリード",
    "部長",
    "課長",
    "係長",
    "主任",
    "社長",
    "取締役",
];

/// `isCommonWord` stopword list (checked against `word.toLowerCase()`).
const STOPWORDS: &[&str] = &[
    "the", "a", "an", "to", "from", "with", "by", "for", "in", "on", "at", "it", "is", "are",
    "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
    "used", "this", "that", "these", "those", "の", "に", "を", "で", "が", "は",
];

/// `isCommonCapitalizedWord` list (CASE-SENSITIVE — no lowercasing).
const COMMON_CAPITALIZED: &[&str] = &[
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    "The",
    "This",
    "That",
    "Please",
    "Thanks",
    "Hello",
    "Hi",
    "Dear",
    "Task",
    "Project",
    "Meeting",
    "Review",
    "Update",
    "Urgent",
    "Important",
    "TODO",
    "FIXME",
    "NOTE",
    "API",
    "UI",
    "PR",
    "MR",
];

// MENTION_PATTERNS (4), in TS order. ASCII `\w` is `[A-Za-z0-9_]`.
static MENTION_AT_ASCII: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@([A-Za-z0-9_]+)").unwrap());
static MENTION_AT_SAN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@([^\s]+さん)").unwrap());
static MENTION_PREP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(?:from|by|with|to|cc)\s+([A-Za-z0-9_]+)").unwrap());
static MENTION_JP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:から|と|へ|宛)\s*([^\s、]+(?:さん|様)?)").unwrap());

// extractManagerReferences patterns.
static MGR_JP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([\x{4E00}-\x{9FAF}]{2,4})(部長|課長|係長|主任|社長|取締役|マネージャー|リーダー)")
        .unwrap()
});
static MGR_EN_FIRST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(?:manager|director|lead|boss)\s+([A-Z][a-z]+)").unwrap());
static MGR_EN_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)([A-Z][a-z]+)\s+(?:manager|director|lead)").unwrap());

// extractPotentialNames patterns.
static NAME_JP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"([\x{4E00}-\x{9FAF}]{2,4})(さん|様|氏)").unwrap());
static NAME_EN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b").unwrap());

#[derive(Debug, Clone, PartialEq)]
pub struct StakeholderResult {
    pub stakeholders: Vec<String>,
    pub manager_involved: bool,
    pub reason: String,
    pub mentions: Vec<String>,
    pub matched_team_members: Vec<String>,
}

fn push_unique(out: &mut Vec<String>, s: String) {
    if !out.contains(&s) {
        out.push(s);
    }
}

fn is_common_word(word: &str) -> bool {
    let lower = word.to_lowercase();
    STOPWORDS.contains(&lower.as_str())
}

fn is_common_capitalized_word(word: &str) -> bool {
    COMMON_CAPITALIZED.contains(&word)
}

/// Extract @mentions and prepositional/Japanese-particle references. Port of
/// `findMentions`. Dedup preserves insertion order; entries kept iff UTF-16
/// length > 1 and not a stopword.
fn find_mentions(text: &str) -> Vec<String> {
    let patterns: [&Regex; 4] = [
        &MENTION_AT_ASCII,
        &MENTION_AT_SAN,
        &MENTION_PREP,
        &MENTION_JP,
    ];
    let mut out = Vec::new();
    for re in patterns {
        for cap in re.captures_iter(text) {
            if let Some(m) = cap.get(1) {
                let mention = m.as_str().trim().to_string();
                if mention.encode_utf16().count() > 1 && !is_common_word(&mention) {
                    push_unique(&mut out, mention);
                }
            }
        }
    }
    out
}

fn member_matches(lower_text: &str, m: &TeamMember) -> bool {
    lower_text.contains(&m.name.to_lowercase())
        || m.keywords
            .iter()
            .any(|k| lower_text.contains(&k.to_lowercase()))
}

/// Names of team members referenced in `text` (manager first, then collaborators).
fn match_team_members(text: &str, team: &TeamConfig) -> Vec<String> {
    let lower = text.to_lowercase();
    let mut matched = Vec::new();
    if let Some(m) = &team.manager {
        if member_matches(&lower, m) {
            matched.push(m.name.clone());
        }
    }
    for c in &team.frequent_collaborators {
        if member_matches(&lower, c) {
            matched.push(c.name.clone());
        }
    }
    matched
}

fn check_manager_involvement(text: &str, team: Option<&TeamConfig>) -> bool {
    let lower = text.to_lowercase();
    if MANAGER_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return true;
    }
    if let Some(m) = team.and_then(|t| t.manager.as_ref()) {
        if lower.contains(&m.name.to_lowercase()) {
            return true;
        }
        if m.keywords.iter().any(|k| lower.contains(&k.to_lowercase())) {
            return true;
        }
    }
    false
}

/// Mine manager references when involvement is detected but no manager is
/// configured. Japanese matches push both "山田部長" and "山田".
fn extract_manager_references(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for cap in MGR_JP.captures_iter(text) {
        push_unique(&mut out, format!("{}{}", &cap[1], &cap[2]));
        push_unique(&mut out, cap[1].to_string());
    }
    for cap in MGR_EN_FIRST.captures_iter(text) {
        push_unique(&mut out, cap[1].to_string());
    }
    for cap in MGR_EN_TITLE.captures_iter(text) {
        push_unique(&mut out, cap[1].to_string());
    }
    out
}

/// Capitalized / honorific-suffixed potential names. Port of `extractPotentialNames`.
pub fn extract_potential_names(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for cap in NAME_JP.captures_iter(text) {
        push_unique(&mut out, cap[1].to_string());
    }
    for cap in NAME_EN.captures_iter(text) {
        let name = cap[1].to_string();
        if !is_common_capitalized_word(&name) {
            push_unique(&mut out, name);
        }
    }
    out
}

/// The manager-involvement priority boost (always 1). Port of `getManagerPriorityBoost`.
pub fn manager_priority_boost() -> u32 {
    1
}

fn build_reason(stakeholders: &[String], mentions: &[String], manager_involved: bool) -> String {
    if stakeholders.is_empty() {
        return "関係者は検出されませんでした".to_string();
    }
    let mut parts: Vec<String> = Vec::new();
    if !mentions.is_empty() {
        parts.push(format!("@メンションから{}名を検出", mentions.len()));
    }
    if manager_involved {
        parts.push("マネージャーが関与".to_string());
    }
    let non_mention = stakeholders.len() as isize - mentions.len() as isize;
    if non_mention > 0 && !manager_involved {
        parts.push(format!("チームメンバーから{non_mention}名を検出"));
    }
    if parts.is_empty() {
        format!("{}名の関係者を検出", stakeholders.len())
    } else {
        parts.join("、")
    }
}

/// Extract stakeholders from a task. Port of `StakeholderExtractor.extractStakeholders`.
pub fn extract_stakeholders(task: &Task, team: Option<&TeamConfig>) -> StakeholderResult {
    // NOTE: not lowercased at this level (mention extraction is case-sensitive).
    let text = task.search_text();

    let mentions = find_mentions(&text);
    let mut stakeholders: Vec<String> = mentions.clone();
    let mut matched_team_members: Vec<String> = Vec::new();

    if let Some(t) = team {
        for name in match_team_members(&text, t) {
            if !stakeholders.contains(&name) {
                stakeholders.push(name.clone());
                matched_team_members.push(name);
            }
        }
    }

    let manager_involved = check_manager_involvement(&text, team);
    if manager_involved {
        match team.and_then(|t| t.manager.as_ref()) {
            Some(m) => {
                if !stakeholders.contains(&m.name) {
                    stakeholders.push(m.name.clone());
                    matched_team_members.push(m.name.clone());
                }
            }
            None => {
                for name in extract_manager_references(&text) {
                    if !stakeholders.contains(&name) {
                        stakeholders.push(name);
                    }
                }
            }
        }
    }

    let reason = build_reason(&stakeholders, &mentions, manager_involved);
    StakeholderResult {
        stakeholders,
        manager_involved,
        reason,
        mentions,
        matched_team_members,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TeamRole;

    fn vs(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn team() -> TeamConfig {
        TeamConfig {
            manager: Some(TeamMember {
                name: "Tanaka".into(),
                role: TeamRole::Manager,
                keywords: vs(&["tanaka", "田中", "manager"]),
                priority: None,
            }),
            frequent_collaborators: vec![
                TeamMember {
                    name: "Suzuki".into(),
                    role: TeamRole::Lead,
                    keywords: vs(&["suzuki", "鈴木"]),
                    priority: None,
                },
                TeamMember {
                    name: "Yamada".into(),
                    role: TeamRole::Team,
                    keywords: vs(&["yamada", "山田"]),
                    priority: None,
                },
            ],
            departments: vs(&["Engineering", "Product"]),
        }
    }

    fn task(title: &str) -> Task {
        Task {
            title: title.into(),
            ..Default::default()
        }
    }

    fn extract(title: &str, team: Option<&TeamConfig>) -> StakeholderResult {
        extract_stakeholders(&task(title), team)
    }

    #[test]
    fn ascii_mentions() {
        let r = extract("Review PR with @john and @jane", None);
        assert!(r.stakeholders.contains(&"john".to_string()));
        assert!(r.stakeholders.contains(&"jane".to_string()));
        assert_eq!(r.mentions.len(), 2);
    }

    #[test]
    fn japanese_san_mention_via_explicit_pattern_not_word_class() {
        // `\w` ASCII captures nothing after @田中; the さん pattern catches it.
        let r = extract("@田中さんに確認する", None);
        assert!(!r.mentions.is_empty());
        assert!(r.mentions.iter().any(|m| m.contains("田中")));
    }

    #[test]
    fn team_member_and_manager_matching() {
        let r = extract("Discuss with Suzuki about the project", Some(&team()));
        assert!(r.stakeholders.contains(&"Suzuki".to_string()));

        let r = extract("Meeting with 田中 manager", Some(&team()));
        assert!(r.manager_involved);
        assert!(r.stakeholders.contains(&"Tanaka".to_string()));

        assert!(extract("Review with マネージャー", None).manager_involved);

        let r = extract("Write documentation", None);
        assert!(r.stakeholders.is_empty());
        assert!(!r.manager_involved);
    }

    #[test]
    fn find_mentions_stopword_filtering() {
        let r = extract("Please review @alice and @bob", None);
        assert!(r.mentions.contains(&"alice".to_string()));
        assert!(r.mentions.contains(&"bob".to_string()));

        let r = extract("Request from John, to be reviewed by Mary", None);
        assert!(r.mentions.contains(&"John".to_string()));
        // 'be' (from "to be") is a stopword → filtered out.
        assert!(!r.mentions.contains(&"be".to_string()));

        // '@the' and 'from the' → 'the' filtered as a stopword.
        let r = extract("@the task is from the team", None);
        assert!(!r.mentions.contains(&"the".to_string()));
    }

    #[test]
    fn manager_involvement_keywords() {
        for s in [
            "Meeting with manager",
            "Boss wants update",
            "Team lead review",
        ] {
            assert!(check_manager_involvement(s, None), "{s}");
        }
        for s in ["マネージャーとの会議", "上司への報告"] {
            assert!(check_manager_involvement(s, None), "{s}");
        }
        assert!(check_manager_involvement("Ask Tanaka", Some(&team())));
        assert!(!check_manager_involvement("Regular team meeting", None));
    }

    #[test]
    fn match_team_members_cases() {
        assert_eq!(
            match_team_members("Work with Suzuki", &team()),
            vec!["Suzuki"]
        );
        assert_eq!(
            match_team_members("鈴木さんに確認", &team()),
            vec!["Suzuki"]
        );
        assert_eq!(
            match_team_members("Suzuki and Yamada meeting", &team()).len(),
            2
        );
        assert!(match_team_members("Solo work", &team()).is_empty());
    }

    #[test]
    fn extract_potential_names_cases() {
        let n = extract_potential_names("田中さんと山田様に確認してください");
        assert!(n.contains(&"田中".to_string()));
        assert!(n.contains(&"山田".to_string()));

        assert!(
            extract_potential_names("Please contact John Smith about the project")
                .contains(&"John Smith".to_string())
        );

        let n = extract_potential_names("Meeting on Monday with the Project team");
        assert!(!n.contains(&"Monday".to_string()));
        assert!(!n.contains(&"Project".to_string()));
        assert!(!n.contains(&"Meeting".to_string()));

        assert!(extract_potential_names("佐藤氏からの報告").contains(&"佐藤".to_string()));
    }

    #[test]
    fn manager_keyword_triggers_configured_manager_add() {
        // KEY parity case: 上司 triggers involvement; matchTeamMembers does NOT
        // match "Boss Person", so the manager-add branch adds the configured name.
        let cfg = TeamConfig {
            manager: Some(TeamMember {
                name: "Boss Person".into(),
                role: TeamRole::Manager,
                keywords: vs(&["boss person"]),
                priority: None,
            }),
            frequent_collaborators: vec![],
            departments: vec![],
        };
        let r = extract("Report to 上司 about progress", Some(&cfg));
        assert!(r.manager_involved);
        assert!(r.stakeholders.contains(&"Boss Person".to_string()));
        assert!(r.matched_team_members.contains(&"Boss Person".to_string()));
    }

    #[test]
    fn mentions_dedup_and_boost() {
        let r = extract("@alice and @alice again", None);
        assert_eq!(r.stakeholders.iter().filter(|s| *s == "alice").count(), 1);
        assert_eq!(manager_priority_boost(), 1);
    }
}
