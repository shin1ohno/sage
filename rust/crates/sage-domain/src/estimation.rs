//! Time-estimation engine — a 1:1 port of `src/utils/estimation.ts`.
//!
//! Fully pure (no clock). The formula:
//!   1. complexity tier = first keyword group hit, in order
//!      project → complex → medium → simple; no hit → medium (fallback).
//!   2. length modifier on the UTF-16 length of `"{title} {description}"`:
//!      <30 → 0.75, <100 → 1.0, <250 → 1.25, else 1.5.
//!   3. ONE special modifier (insertion order, first match wins):
//!      meeting ×1.5, documentation ×1.25, debugging ×1.5, testing ×1.25.
//!   4. Pomodoro round: `round(base × lengthMod × specialMod / 25) × 25`.

use crate::{round_to_pomodoro, Complexity, EstimationConfig, KeywordMapping, Task};

/// Special-modifier keyword groups in TS insertion order — the FIRST group with
/// a hit applies and stops the scan (`break`). Verbatim from `SPECIAL_MODIFIERS`.
const SPECIAL_MODIFIERS: &[(&[&str], f64)] = &[
    (
        &["meeting", "ミーティング", "会議", "sync", "call", "通話"],
        1.5,
    ),
    (&["document", "ドキュメント", "文書", "doc", "docs"], 1.25),
    (&["debug", "デバッグ", "bug", "バグ", "issue", "問題"], 1.5),
    (&["test", "テスト", "qa", "verify", "検証"], 1.25),
];

/// Outcome of estimating a task.
#[derive(Debug, Clone, PartialEq)]
pub struct EstimationResult {
    pub estimated_minutes: u32,
    pub complexity: Complexity,
    pub reason: String,
    pub matched_keywords: Vec<String>,
}

fn vs(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

/// The engine's default estimation config. Mirrors `DEFAULT_ESTIMATION_CONFIG`
/// in `estimation.ts` (75/175 + the LONG keyword lists) — distinct from
/// `sage_config`'s `DEFAULT_CONFIG.estimation` (90/180 + short lists), which the
/// runtime `analyze_tasks` path uses. The estimation unit tests use THIS one.
pub fn default_estimation_config() -> EstimationConfig {
    EstimationConfig {
        simple_task_minutes: 25,
        medium_task_minutes: 50,
        complex_task_minutes: 75,
        project_task_minutes: 175,
        keyword_mapping: KeywordMapping {
            simple: vs(&[
                "check",
                "review",
                "read",
                "confirm",
                "send",
                "reply",
                "answer",
                "確認",
                "レビュー",
                "読む",
                "返信",
                "送信",
                "回答",
                "approve",
                "承認",
                "quick",
                "すぐ",
                "simple",
                "シンプル",
            ]),
            medium: vs(&[
                "implement",
                "fix",
                "update",
                "create",
                "modify",
                "add",
                "write",
                "実装",
                "修正",
                "更新",
                "作成",
                "変更",
                "追加",
                "書く",
                "develop",
                "開発",
                "test",
                "テスト",
            ]),
            complex: vs(&[
                "design",
                "refactor",
                "migrate",
                "integrate",
                "optimize",
                "analyze",
                "設計",
                "リファクタ",
                "移行",
                "統合",
                "最適化",
                "分析",
                "research",
                "調査",
                "investigate",
                "調べる",
            ]),
            project: vs(&[
                "build",
                "architect",
                "system",
                "platform",
                "infrastructure",
                "構築",
                "アーキテクチャ",
                "システム",
                "プラットフォーム",
                "インフラ",
                "framework",
                "フレームワーク",
                "rewrite",
                "書き直し",
            ]),
        },
        user_adjustments: None,
    }
}

/// `keywords.filter(k => text.includes(k.toLowerCase()))` — both sides lowercased.
fn find_matching(keywords: &[String], text_lower: &str) -> Vec<String> {
    keywords
        .iter()
        .filter(|k| text_lower.contains(&k.to_lowercase()))
        .cloned()
        .collect()
}

/// UTF-16 code-unit length of `"{title} {description}"` — JS `String.length`
/// counts UTF-16 units, which the length-modifier thresholds key off.
fn length_modifier(task: &Task) -> f64 {
    let total = task.title.encode_utf16().count()
        + task
            .description
            .as_deref()
            .unwrap_or("")
            .encode_utf16()
            .count();
    if total < 30 {
        0.75
    } else if total < 100 {
        1.0
    } else if total < 250 {
        1.25
    } else {
        1.5
    }
}

fn complexity_name(c: Complexity) -> &'static str {
    match c {
        Complexity::Simple => "シンプル",
        Complexity::Medium => "標準",
        Complexity::Complex => "複雑",
        Complexity::Project => "プロジェクト",
    }
}

/// Estimate a task's duration. Port of `TimeEstimator.estimateDuration`.
pub fn estimate_duration(task: &Task, config: &EstimationConfig) -> EstimationResult {
    let text = task.search_text().to_lowercase();
    let km = &config.keyword_mapping;

    // Complexity tier: project → complex → medium → simple; fallback medium.
    let project = find_matching(&km.project, &text);
    let (complexity, base, matched) = if !project.is_empty() {
        (Complexity::Project, config.project_task_minutes, project)
    } else {
        let complex = find_matching(&km.complex, &text);
        if !complex.is_empty() {
            (Complexity::Complex, config.complex_task_minutes, complex)
        } else {
            let medium = find_matching(&km.medium, &text);
            if !medium.is_empty() {
                (Complexity::Medium, config.medium_task_minutes, medium)
            } else {
                let simple = find_matching(&km.simple, &text);
                if !simple.is_empty() {
                    (Complexity::Simple, config.simple_task_minutes, simple)
                } else {
                    // Fallback: no keyword matched → medium minutes, no matches.
                    (Complexity::Medium, config.medium_task_minutes, Vec::new())
                }
            }
        }
    };

    // Apply modifiers: length first, then the single matching special modifier.
    let mut minutes = base as f64 * length_modifier(task);
    for (keywords, multiplier) in SPECIAL_MODIFIERS {
        if keywords.iter().any(|k| text.contains(&k.to_lowercase())) {
            minutes *= multiplier;
            break;
        }
    }
    let estimated = round_to_pomodoro(minutes);

    let reason = if matched.is_empty() {
        format!("キーワードが検出されなかったため、標準的なタスク（{estimated}分）として見積もり")
    } else {
        let keyword_str = matched
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<_>>()
            .join("、");
        format!(
            "「{}」を含む{}なタスクとして{}分と見積もり",
            keyword_str,
            complexity_name(complexity),
            estimated
        )
    };

    EstimationResult {
        estimated_minutes: estimated,
        complexity,
        reason,
        matched_keywords: matched,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(title: &str) -> Task {
        Task {
            title: title.to_string(),
            ..Default::default()
        }
    }

    fn est(title: &str) -> EstimationResult {
        estimate_duration(&t(title), &default_estimation_config())
    }

    // Parity vectors from tests/unit/estimation.test.ts (exact values computed
    // from the formula; the TS tests assert ranges, we assert the exact result).
    #[test]
    fn complexity_tiers_and_exact_minutes() {
        let r = est("Review PR");
        assert_eq!(r.complexity, Complexity::Simple);
        assert_eq!(r.estimated_minutes, 25);
        assert!(r.matched_keywords.contains(&"review".to_string()));

        let r = est("Implement new feature");
        assert_eq!(r.complexity, Complexity::Medium);
        assert_eq!(r.estimated_minutes, 50);

        let r = est("Refactor the authentication module");
        assert_eq!(r.complexity, Complexity::Complex);
        assert_eq!(r.estimated_minutes, 75);

        let r = est("Build new authentication system from scratch");
        assert_eq!(r.complexity, Complexity::Project);
        assert_eq!(r.estimated_minutes, 175);
    }

    #[test]
    fn japanese_complexity_tiers() {
        assert_eq!(est("メールを確認する").complexity, Complexity::Simple);
        assert_eq!(est("新機能を実装する").complexity, Complexity::Medium);
        assert_eq!(
            est("コードをリファクタする").complexity,
            Complexity::Complex
        );
    }

    #[test]
    fn no_keyword_falls_back_to_medium() {
        let r = est("Do something");
        assert_eq!(r.complexity, Complexity::Medium);
        assert!(r.matched_keywords.is_empty());
        assert!(r.reason.contains("キーワードが検出されなかった"));
    }

    #[test]
    fn matched_keywords_collected_in_order() {
        let r = est("Review and confirm the changes");
        assert_eq!(r.complexity, Complexity::Simple);
        assert_eq!(r.matched_keywords, vec!["review", "confirm"]);
    }

    #[test]
    fn special_modifier_applies_once() {
        // 'fix' (medium, base 50) × length 0.75 (len 11) = 37.5, then 'bug'
        // (debugging ×1.5) = 56.25 → round(2.25)*25 = 50. complexity stays medium.
        let r = est("Fix the bug");
        assert_eq!(r.complexity, Complexity::Medium);
        assert_eq!(r.estimated_minutes, 50);
        assert_eq!(r.matched_keywords, vec!["fix"]);
    }

    #[test]
    fn project_with_length_and_special_modifier() {
        // tests/unit/estimation.test.ts's compound case → exactly 325.
        let task = Task {
            title: "Debug the complex authentication system with detailed investigation"
                .to_string(),
            description: Some(
                "This is a long description that should trigger the length modifier".to_string(),
            ),
            ..Default::default()
        };
        let r = estimate_duration(&task, &default_estimation_config());
        assert_eq!(r.complexity, Complexity::Project);
        assert_eq!(r.estimated_minutes % 25, 0);
        assert_eq!(r.estimated_minutes, 325);
    }

    #[test]
    fn all_estimates_are_pomodoro_multiples() {
        for title in [
            "Review PR",
            "Implement new feature",
            "Refactor the authentication module",
            "Build new authentication system from scratch",
        ] {
            assert_eq!(est(title).estimated_minutes % 25, 0);
        }
    }
}
