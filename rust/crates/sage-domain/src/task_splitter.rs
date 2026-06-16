//! Task splitter — a 1:1 port of `src/utils/task-splitter.ts`.
//!
//! Pure. Multi-pass: list detection → conjunction/newline fallback →
//! complexity-based phase expansion → dependency inference → Kahn topological
//! order. The 5th multi-task pattern uses a regex lookahead (unsupported by the
//! `regex` crate), so its match-count is reimplemented in `count_sentence_boundaries`.

use crate::{Complexity, Task};
use regex::Regex;
use std::sync::LazyLock;

const PROJECT_KW: &[&str] = &[
    "システム",
    "アーキテクチャ",
    "設計",
    "構築",
    "プロジェクト",
    "system",
    "architecture",
    "design",
    "build",
    "project",
    "develop",
    "開発",
];
const COMPLEX_KW: &[&str] = &[
    "リファクタ",
    "統合",
    "移行",
    "マイグレーション",
    "最適化",
    "refactor",
    "integrate",
    "migrate",
    "migration",
    "optimize",
    "implement",
    "実装",
];
const MEDIUM_KW: &[&str] = &[
    "修正", "更新", "変更", "追加", "作成", "fix", "update", "change", "add", "create", "modify",
];
// Defined in the TS `COMPLEXITY_KEYWORDS.simple`, but `analyzeComplexity` falls
// through to `simple` as the else-branch without ever checking this list — so
// it is unused here too. Kept verbatim for fidelity.
#[allow(dead_code)]
const SIMPLE_KW: &[&str] = &[
    "確認",
    "レビュー",
    "チェック",
    "読む",
    "返信",
    "confirm",
    "review",
    "check",
    "read",
    "reply",
    "send",
    "送信",
];

const AFTER_KW: &[&str] = &["後に", "次に", "その後", "after", "then", "following"];
const REQUIRES_KW: &[&str] = &["必要", "依存", "requires", "depends on", "needs"];

static NUMBERED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9]+[.)]\s+(.+)").unwrap());
static BULLET: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[-•*]\s+(.+)").unwrap());
static MTP_BULLET: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|\n)\s*[-•*]\s+").unwrap());
static MTP_NUMBERED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:^|\n)\s*[0-9]+[.)]\s+").unwrap());
static MTP_JP_CONJ: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:そして|また|さらに|加えて|それから)").unwrap());
static MTP_EN_CONJ: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:and then|also|additionally|furthermore|moreover)").unwrap()
});
static CONJ_SPLIT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:そして|また|さらに|加えて|それから)").unwrap());

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SplitTask {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

impl SplitTask {
    fn plain(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            order: None,
            status: None,
        }
    }
    fn phase(title: String, order: usize) -> Self {
        Self {
            title,
            order: Some(order),
            status: Some("not_started".to_string()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDependency {
    pub task_index: usize,
    pub depends_on: Vec<usize>,
    #[serde(rename = "type")]
    pub dep_type: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ComplexityAnalysis {
    pub is_complex: bool,
    pub complexity: Complexity,
    pub reasoning: String,
    pub suggested_splits: Option<Vec<SplitTask>>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitResult {
    pub original_input: String,
    pub split_tasks: Vec<SplitTask>,
    pub split_reason: String,
    pub recommended_order: Vec<usize>,
    pub dependencies: Vec<TaskDependency>,
}

fn contains_any(text_lower: &str, keywords: &[&str]) -> bool {
    keywords
        .iter()
        .any(|k| text_lower.contains(&k.to_lowercase()))
}

/// First 10 UTF-16 code units of `s` (JS `String.prototype.substring(0, 10)`).
fn substring_utf16(s: &str, n: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().take(n).collect();
    String::from_utf16_lossy(&units)
}

/// Count matches of `[。.]\s*(?=[^。.]+[。.])` (lookahead, hand-rolled): a
/// delimiter followed (after optional whitespace) by ≥1 non-delimiter then
/// another delimiter.
fn count_sentence_boundaries(text: &str) -> usize {
    let chars: Vec<char> = text.chars().collect();
    let is_delim = |c: char| c == '。' || c == '.';
    let mut count = 0;
    for i in 0..chars.len() {
        if !is_delim(chars[i]) {
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() && chars[j].is_whitespace() {
            j += 1;
        }
        let mut k = j;
        let mut saw_content = false;
        while k < chars.len() && !is_delim(chars[k]) {
            k += 1;
            saw_content = true;
        }
        if saw_content && k < chars.len() && is_delim(chars[k]) {
            count += 1;
        }
    }
    count
}

fn contains_multiple_tasks(input: &str) -> bool {
    MTP_BULLET.find_iter(input).count() > 1
        || MTP_NUMBERED.find_iter(input).count() > 1
        || MTP_JP_CONJ.find_iter(input).count() > 1
        || MTP_EN_CONJ.find_iter(input).count() > 1
        || count_sentence_boundaries(input) > 1
}

fn split_into_lines(input: &str) -> Vec<String> {
    let mut results: Vec<String> = Vec::new();
    let mut has_list_items = false;
    let mut current_non_list = String::new();

    for line in input.split('\n') {
        let trimmed = line.trim();

        if let Some(c) = NUMBERED.captures(trimmed) {
            has_list_items = true;
            if !current_non_list.trim().is_empty() {
                results.push(current_non_list.trim().to_string());
                current_non_list.clear();
            }
            results.push(c[1].trim().to_string());
            continue;
        }
        if let Some(c) = BULLET.captures(trimmed) {
            has_list_items = true;
            if !current_non_list.trim().is_empty() {
                results.push(current_non_list.trim().to_string());
                current_non_list.clear();
            }
            results.push(c[1].trim().to_string());
            continue;
        }
        if trimmed.is_empty() || trimmed.ends_with(':') || trimmed.ends_with('：') {
            continue;
        }
        current_non_list.push(' ');
        current_non_list.push_str(trimmed);
    }

    if !current_non_list.trim().is_empty() {
        results.push(current_non_list.trim().to_string());
    }

    if has_list_items && !results.is_empty() {
        return results;
    }

    // TS: `input.split(re).length > 1` (raw, incl. empties) → return filtered.
    if CONJ_SPLIT.split(input).count() > 1 {
        return CONJ_SPLIT
            .split(input)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }

    let newline: Vec<String> = input
        .split('\n')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if newline.len() > 1 {
        return newline;
    }

    vec![input.to_string()]
}

/// Port of `analyzeComplexity`.
pub fn analyze_complexity(task: &Task) -> ComplexityAnalysis {
    let text = task.search_text().to_lowercase();
    if contains_any(&text, PROJECT_KW) {
        ComplexityAnalysis {
            is_complex: true,
            complexity: Complexity::Project,
            reasoning: "プロジェクトレベルのタスクです。複数のフェーズに分割することを推奨します。"
                .to_string(),
            suggested_splits: Some(suggest_project_splits(&task.title)),
        }
    } else if contains_any(&text, COMPLEX_KW) {
        ComplexityAnalysis {
            is_complex: true,
            complexity: Complexity::Complex,
            reasoning: "複雑なタスクです。より小さなステップに分割することを推奨します。"
                .to_string(),
            suggested_splits: Some(suggest_complex_splits(&task.title)),
        }
    } else if contains_any(&text, MEDIUM_KW) {
        ComplexityAnalysis {
            is_complex: false,
            complexity: Complexity::Medium,
            reasoning: "中程度の複雑さのタスクです。そのまま実行可能です。".to_string(),
            suggested_splits: None,
        }
    } else {
        ComplexityAnalysis {
            is_complex: false,
            complexity: Complexity::Simple,
            reasoning: "シンプルなタスクです。分割は不要です。".to_string(),
            suggested_splits: None,
        }
    }
}

fn suggest_project_splits(title: &str) -> Vec<SplitTask> {
    [
        "要件定義と計画",
        "設計とアーキテクチャ",
        "実装",
        "テストと検証",
        "デプロイとドキュメント",
    ]
    .iter()
    .enumerate()
    .map(|(i, s)| SplitTask::phase(format!("{title} - {s}"), i))
    .collect()
}

fn suggest_complex_splits(title: &str) -> Vec<SplitTask> {
    ["調査と準備", "実装", "確認とテスト"]
        .iter()
        .enumerate()
        .map(|(i, s)| SplitTask::phase(format!("{title} - {s}"), i))
        .collect()
}

fn infer_dependencies(tasks: &[SplitTask]) -> Vec<TaskDependency> {
    let mut dependencies: Vec<TaskDependency> = Vec::new();

    for i in 0..tasks.len() {
        let text = format!("{} ", tasks[i].title).to_lowercase();
        let mut depends_on: Vec<usize> = Vec::new();

        if contains_any(&text, AFTER_KW) && i > 0 {
            depends_on.push(i - 1);
        }
        if contains_any(&text, REQUIRES_KW) && i > 0 {
            for (j, prev_task) in tasks.iter().enumerate().take(i) {
                let prev = prev_task.title.to_lowercase();
                if text.contains(&substring_utf16(&prev, 10)) {
                    depends_on.push(j);
                }
            }
        }

        if !depends_on.is_empty() {
            dependencies.push(TaskDependency {
                task_index: i,
                depends_on,
                dep_type: "sequential".to_string(),
            });
        }
    }

    if dependencies.is_empty() && tasks.len() > 1 {
        for i in 1..tasks.len() {
            dependencies.push(TaskDependency {
                task_index: i,
                depends_on: vec![i - 1],
                dep_type: "sequential".to_string(),
            });
        }
    }

    dependencies
}

fn calculate_recommended_order(n: usize, dependencies: &[TaskDependency]) -> Vec<usize> {
    let mut order: Vec<usize> = Vec::new();
    let mut completed = vec![false; n];
    while order.len() < n {
        let mut progress = false;
        for i in 0..n {
            if completed[i] {
                continue;
            }
            let satisfied = match dependencies.iter().find(|d| d.task_index == i) {
                None => true,
                Some(d) => d.depends_on.iter().all(|&x| completed[x]),
            };
            if satisfied {
                order.push(i);
                completed[i] = true;
                progress = true;
            }
        }
        // Cycles cannot occur (forward refs only); guard against a hang anyway.
        if !progress {
            break;
        }
    }
    order
}

/// Split input text into individual tasks. Port of `TaskSplitter.splitTasks`.
pub fn split_tasks(input: &str) -> SplitResult {
    let trimmed_input = input.trim();
    if trimmed_input.is_empty() {
        return SplitResult {
            original_input: input.to_string(),
            split_tasks: vec![],
            split_reason: "入力が空です".to_string(),
            recommended_order: vec![],
            dependencies: vec![],
        };
    }

    let lines = split_into_lines(trimmed_input);

    if lines.len() == 1 && !contains_multiple_tasks(trimmed_input) {
        let task = Task {
            title: input.trim().to_string(),
            ..Default::default()
        };
        let complexity = analyze_complexity(&task);
        if complexity.is_complex {
            if let Some(splits) = complexity.suggested_splits {
                let recommended_order = (0..splits.len()).collect();
                let dependencies = infer_dependencies(&splits);
                return SplitResult {
                    original_input: input.to_string(),
                    split_tasks: splits,
                    split_reason: complexity.reasoning,
                    recommended_order,
                    dependencies,
                };
            }
        }
        return SplitResult {
            original_input: input.to_string(),
            split_tasks: vec![SplitTask::plain(task.title)],
            split_reason: "シンプルなタスクのため分割不要".to_string(),
            recommended_order: vec![0],
            dependencies: vec![],
        };
    }

    let tasks: Vec<SplitTask> = lines
        .iter()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(SplitTask::plain)
        .collect();

    let dependencies = infer_dependencies(&tasks);
    let recommended_order = calculate_recommended_order(tasks.len(), &dependencies);
    let split_reason = format!("{}個のタスクを検出しました", tasks.len());

    SplitResult {
        original_input: input.to_string(),
        split_tasks: tasks,
        split_reason,
        recommended_order,
        dependencies,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bullet_and_numbered_lists() {
        let r = split_tasks("- Review PR #123\n- Fix bug in login\n- Update documentation");
        assert_eq!(r.split_tasks.len(), 3);
        assert!(r.split_tasks[0].title.contains("Review PR"));
        assert!(r.split_tasks[1].title.contains("Fix bug"));
        assert!(r.split_tasks[2].title.contains("Update documentation"));

        let r = split_tasks("1. First task\n2. Second task\n3. Third task");
        assert_eq!(r.split_tasks.len(), 3);
    }

    #[test]
    fn japanese_conjunction_split() {
        let r = split_tasks("メールを確認するそしてレポートを書くまた会議の準備をする");
        assert!(r.split_tasks.len() > 1);
    }

    #[test]
    fn single_simple_task_not_split() {
        let r = split_tasks("Review the pull request");
        assert_eq!(r.split_tasks.len(), 1);
        assert!(r.split_reason.contains("シンプル"));
    }

    #[test]
    fn recommended_order_for_bullets() {
        let r = split_tasks("- Task A\n- Task B\n- Task C");
        assert_eq!(r.recommended_order, vec![0, 1, 2]);
    }

    #[test]
    fn analyze_complexity_tiers() {
        assert_eq!(
            analyze_complexity(&t("Check email")).complexity,
            Complexity::Simple
        );
        assert!(!analyze_complexity(&t("Check email")).is_complex);
        assert_eq!(
            analyze_complexity(&t("Fix the login bug")).complexity,
            Complexity::Medium
        );

        let c = analyze_complexity(&t("Refactor the entire authentication module"));
        assert!(c.is_complex);
        assert_eq!(c.complexity, Complexity::Complex);
        assert_eq!(c.suggested_splits.as_ref().unwrap().len(), 3);

        let c = analyze_complexity(&t("Build a new microservice architecture"));
        assert!(c.is_complex);
        assert_eq!(c.complexity, Complexity::Project);
        assert_eq!(c.suggested_splits.unwrap().len(), 5);

        // 'design' -> project (reasoning truthy).
        assert!(!analyze_complexity(&t("Design new API"))
            .reasoning
            .is_empty());
        assert_eq!(
            analyze_complexity(&t("新しいシステムを構築する")).complexity,
            Complexity::Project
        );
        assert_eq!(
            analyze_complexity(&t("コードをリファクタリングする")).complexity,
            Complexity::Complex
        );
    }

    #[test]
    fn complex_single_task_splits_into_phases() {
        let r = split_tasks("Design and implement the new authentication system from scratch");
        // 'design'/'system' -> project; single line, no multi-task markers.
        assert!(!r.split_tasks.is_empty());
        assert!(!r.split_reason.is_empty());
        assert_eq!(r.split_tasks.len(), 5);
    }

    #[test]
    fn newline_splitting_plain_text() {
        let r = split_tasks("Task One\nTask Two\nTask Three");
        assert_eq!(r.split_tasks.len(), 3);
        assert_eq!(r.split_tasks[0].title, "Task One");
        assert_eq!(r.split_tasks[1].title, "Task Two");
        assert_eq!(r.split_tasks[2].title, "Task Three");
    }

    #[test]
    fn circular_requires_terminates() {
        let r = split_tasks(
            "- Task A requires Task C\n- Task B requires Task A\n- Task C requires Task B",
        );
        assert_eq!(r.split_tasks.len(), 3);
        assert_eq!(r.recommended_order.len(), 3);
    }

    #[test]
    fn empty_input() {
        let r = split_tasks("   ");
        assert!(r.split_tasks.is_empty());
        assert_eq!(r.split_reason, "入力が空です");
    }

    fn t(title: &str) -> Task {
        Task {
            title: title.into(),
            ..Default::default()
        }
    }
}
