//! Task-analysis orchestration — a 1:1 port of `src/tools/analyze-tasks.ts`
//! (`TaskAnalyzer`). Composes the priority, estimation, and stakeholder engines,
//! applies the manager-priority boost, and derives reminders, tags, summary, and
//! the markdown render.
//!
//! Pure given an injected `now` (the TS read ambient `new Date()` for the
//! reminder/tag deadline math). Config is passed as `AnalyzeInputs` of
//! `sage-domain` types + a reminder-type slice, so this stays in the base crate
//! (no `sage-config` dependency).

use crate::{
    determine_priority, estimate_duration, extract_stakeholders, split_tasks, Complexity,
    EstimationConfig, Priority, PriorityRules, Task, TeamConfig,
};
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

/// Config slices the analysis consumes (composed from `UserConfig` by callers).
pub struct AnalyzeInputs<'a> {
    pub rules: &'a PriorityRules,
    pub estimation: &'a EstimationConfig,
    pub team: Option<&'a TeamConfig>,
    /// `config.reminders.defaultTypes`.
    pub default_reminder_types: &'a [String],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Reminder {
    #[serde(rename = "type")]
    pub reminder_type: String,
    pub time: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisReasoning {
    pub priority_reason: String,
    pub estimation_reason: String,
    pub stakeholder_reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzedTask {
    pub original: Task,
    pub priority: Priority,
    pub estimated_minutes: u32,
    pub stakeholders: Vec<String>,
    pub suggested_reminders: Vec<Reminder>,
    pub reasoning: AnalysisReasoning,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitInfo {
    pub was_split: bool,
    pub split_reason: String,
    pub recommended_order: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSummary {
    pub total_tasks: usize,
    pub p0_count: usize,
    pub p1_count: usize,
    pub p2_count: usize,
    pub p3_count: usize,
    pub total_estimated_minutes: u32,
    pub unique_stakeholders: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_input: Option<String>,
    pub analyzed_tasks: Vec<AnalyzedTask>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_info: Option<SplitInfo>,
    pub summary: AnalysisSummary,
}

const DAY_MS: f64 = 24.0 * 60.0 * 60.0 * 1000.0;

fn priority_order(p: Priority) -> u8 {
    match p {
        Priority::P0 => 0,
        Priority::P1 => 1,
        Priority::P2 => 2,
        Priority::P3 => 3,
    }
}

/// Boost one level toward P0 (only called when `p != P0`).
fn boost_one(p: Priority) -> Priority {
    match p {
        Priority::P0 | Priority::P1 => Priority::P0,
        Priority::P2 => Priority::P1,
        Priority::P3 => Priority::P2,
    }
}

fn complexity_tag(c: Complexity) -> &'static str {
    match c {
        Complexity::Simple => "simple",
        Complexity::Medium => "medium",
        Complexity::Complex => "complex",
        Complexity::Project => "project",
    }
}

fn parse_deadline(deadline: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(deadline)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn days_until(deadline: DateTime<Utc>, now: DateTime<Utc>) -> i64 {
    ((deadline - now).num_milliseconds() as f64 / DAY_MS).ceil() as i64
}

fn reminder_time(deadline: DateTime<Utc>, reminder_type: &str) -> DateTime<Utc> {
    match reminder_type {
        "1_hour_before" => deadline - Duration::hours(1),
        "3_hours_before" => deadline - Duration::hours(3),
        "1_day_before" => deadline - Duration::days(1),
        "3_days_before" => deadline - Duration::days(3),
        "1_week_before" => deadline - Duration::days(7),
        _ => deadline - Duration::days(1),
    }
}

fn iso(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn generate_reminders(task: &Task, default_types: &[String], now: DateTime<Utc>) -> Vec<Reminder> {
    let mut reminders = Vec::new();
    let Some(deadline) = task.deadline.as_deref().and_then(parse_deadline) else {
        return reminders;
    };
    for reminder_type in default_types {
        let t = reminder_time(deadline, reminder_type);
        if t > now {
            reminders.push(Reminder {
                reminder_type: reminder_type.clone(),
                time: iso(t),
                message: format!("{}の期限が近づいています", task.title),
            });
        }
    }
    if days_until(deadline, now) <= 1 {
        reminders.push(Reminder {
            reminder_type: "urgent".to_string(),
            time: iso(now + Duration::minutes(30)),
            message: format!("【緊急】{}の期限は本日です", task.title),
        });
    }
    reminders
}

fn generate_tags(
    task: &Task,
    complexity: Complexity,
    manager_involved: bool,
    now: DateTime<Utc>,
) -> Vec<String> {
    let mut tags = vec![complexity_tag(complexity).to_string()];
    if manager_involved {
        tags.push("manager-involved".to_string());
    }
    if let Some(deadline) = task.deadline.as_deref().and_then(parse_deadline) {
        let days = days_until(deadline, now);
        if days <= 1 {
            tags.push("due-today".to_string());
        } else if days <= 3 {
            tags.push("due-soon".to_string());
        } else if days <= 7 {
            tags.push("due-this-week".to_string());
        }
    }
    for t in &task.tags {
        if !tags.contains(t) {
            tags.push(t.clone());
        }
    }
    tags
}

/// Analyze a single task. Port of `TaskAnalyzer.analyzeTask`.
pub fn analyze_task(task: &Task, inputs: &AnalyzeInputs, now: DateTime<Utc>) -> AnalyzedTask {
    let priority_result = determine_priority(task, inputs.rules, inputs.team, now);
    let estimation_result = estimate_duration(task, inputs.estimation);
    let stakeholder_result = extract_stakeholders(task, inputs.team);

    let mut priority = priority_result.priority;
    if stakeholder_result.manager_involved && priority != Priority::P0 {
        priority = boost_one(priority);
    }

    let suggested_reminders = generate_reminders(task, inputs.default_reminder_types, now);
    let tags = generate_tags(
        task,
        estimation_result.complexity,
        stakeholder_result.manager_involved,
        now,
    );

    AnalyzedTask {
        original: task.clone(),
        priority,
        estimated_minutes: estimation_result.estimated_minutes,
        stakeholders: stakeholder_result.stakeholders,
        suggested_reminders,
        reasoning: AnalysisReasoning {
            priority_reason: priority_result.reason,
            estimation_reason: estimation_result.reason,
            stakeholder_reason: stakeholder_result.reason,
        },
        tags,
    }
}

fn build_summary(tasks: &[AnalyzedTask]) -> AnalysisSummary {
    let mut summary = AnalysisSummary {
        total_tasks: tasks.len(),
        p0_count: 0,
        p1_count: 0,
        p2_count: 0,
        p3_count: 0,
        total_estimated_minutes: 0,
        unique_stakeholders: Vec::new(),
    };
    for t in tasks {
        match t.priority {
            Priority::P0 => summary.p0_count += 1,
            Priority::P1 => summary.p1_count += 1,
            Priority::P2 => summary.p2_count += 1,
            Priority::P3 => summary.p3_count += 1,
        }
        summary.total_estimated_minutes += t.estimated_minutes;
        for s in &t.stakeholders {
            if !summary.unique_stakeholders.contains(s) {
                summary.unique_stakeholders.push(s.clone());
            }
        }
    }
    summary
}

/// Analyze a list of tasks (sorted by priority). Port of `TaskAnalyzer.analyzeTasks`.
pub fn analyze_tasks(tasks: &[Task], inputs: &AnalyzeInputs, now: DateTime<Utc>) -> AnalysisResult {
    let mut analyzed: Vec<AnalyzedTask> =
        tasks.iter().map(|t| analyze_task(t, inputs, now)).collect();
    // Stable sort by priority (JS Array.sort is stable).
    analyzed.sort_by_key(|a| priority_order(a.priority));
    let summary = build_summary(&analyzed);
    AnalysisResult {
        success: true,
        original_input: None,
        analyzed_tasks: analyzed,
        split_info: None,
        summary,
    }
}

/// Split raw text into tasks, then analyze. Port of `TaskAnalyzer.analyzeFromText`.
pub fn analyze_from_text(
    input: &str,
    inputs: &AnalyzeInputs,
    now: DateTime<Utc>,
) -> AnalysisResult {
    let split = split_tasks(input);
    let tasks: Vec<Task> = split
        .split_tasks
        .iter()
        .map(|s| Task {
            title: s.title.clone(),
            ..Default::default()
        })
        .collect();
    let mut result = analyze_tasks(&tasks, inputs, now);
    result.original_input = Some(input.to_string());
    result.split_info = Some(SplitInfo {
        was_split: split.split_tasks.len() > 1,
        split_reason: split.split_reason,
        recommended_order: split.recommended_order,
    });
    result
}

/// Markdown render. Port of `TaskAnalyzer.formatResult`.
pub fn format_result(result: &AnalysisResult) -> String {
    let mut lines: Vec<String> = Vec::new();
    lines.push("## タスク分析結果\n".to_string());
    lines.push("### サマリー".to_string());
    lines.push(format!("- 総タスク数: {}", result.summary.total_tasks));
    lines.push(format!(
        "- 優先度内訳: P0={}, P1={}, P2={}, P3={}",
        result.summary.p0_count,
        result.summary.p1_count,
        result.summary.p2_count,
        result.summary.p3_count
    ));
    lines.push(format!(
        "- 総見積もり時間: {}時間{}分",
        result.summary.total_estimated_minutes / 60,
        result.summary.total_estimated_minutes % 60
    ));
    if !result.summary.unique_stakeholders.is_empty() {
        lines.push(format!(
            "- 関係者: {}",
            result.summary.unique_stakeholders.join(", ")
        ));
    }
    lines.push(String::new());

    if let Some(info) = &result.split_info {
        if info.was_split {
            lines.push(format!("> {}", info.split_reason));
            lines.push(String::new());
        }
    }

    lines.push("### タスク詳細\n".to_string());
    for (i, task) in result.analyzed_tasks.iter().enumerate() {
        lines.push(format!("#### {}. {}", i + 1, task.original.title));
        lines.push(format!("- **優先度**: {}", task.priority));
        lines.push(format!("- **見積もり**: {}分", task.estimated_minutes));
        lines.push(format!("- **理由**: {}", task.reasoning.priority_reason));
        if !task.stakeholders.is_empty() {
            lines.push(format!("- **関係者**: {}", task.stakeholders.join(", ")));
        }
        if !task.tags.is_empty() {
            lines.push(format!("- **タグ**: {}", task.tags.join(", ")));
        }
        lines.push(String::new());
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ConditionOperator, ConditionType, ConditionValue, DeadlineUnit, KeywordMapping,
        PriorityCondition, TeamMember, TeamRole,
    };
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 6, 1, 9, 0, 0).unwrap()
    }

    fn vs(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn rules() -> PriorityRules {
        PriorityRules {
            p0_conditions: vec![
                PriorityCondition {
                    condition_type: ConditionType::Deadline,
                    operator: ConditionOperator::Lt,
                    value: ConditionValue::Number(24.0),
                    unit: Some(DeadlineUnit::Hours),
                    description: "Due within 24 hours".into(),
                    weight: None,
                },
                PriorityCondition {
                    condition_type: ConditionType::Keyword,
                    operator: ConditionOperator::Contains,
                    value: ConditionValue::List(vs(&["urgent", "emergency", "緊急", "至急"])),
                    unit: None,
                    description: "Contains urgent keywords".into(),
                    weight: None,
                },
            ],
            p1_conditions: vec![
                PriorityCondition {
                    condition_type: ConditionType::Deadline,
                    operator: ConditionOperator::Lt,
                    value: ConditionValue::Number(3.0),
                    unit: Some(DeadlineUnit::Days),
                    description: "Due within 3 days".into(),
                    weight: None,
                },
                PriorityCondition {
                    condition_type: ConditionType::Stakeholder,
                    operator: ConditionOperator::Contains,
                    value: ConditionValue::Text("manager".into()),
                    unit: None,
                    description: "Involves manager".into(),
                    weight: None,
                },
            ],
            p2_conditions: vec![PriorityCondition {
                condition_type: ConditionType::Deadline,
                operator: ConditionOperator::Lt,
                value: ConditionValue::Number(7.0),
                unit: Some(DeadlineUnit::Days),
                description: "Due within a week".into(),
                weight: None,
            }],
            default_priority: Priority::P3,
        }
    }

    fn estimation() -> EstimationConfig {
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

    fn team() -> TeamConfig {
        TeamConfig {
            manager: Some(TeamMember {
                name: "Manager San".into(),
                role: TeamRole::Manager,
                keywords: vs(&["manager", "マネージャー"]),
                priority: None,
            }),
            frequent_collaborators: vec![],
            departments: vec![],
        }
    }

    fn rt() -> Vec<String> {
        vs(&["1_day_before", "1_hour_before"])
    }

    fn inputs<'a>(
        r: &'a PriorityRules,
        e: &'a EstimationConfig,
        t: &'a TeamConfig,
        rt: &'a [String],
    ) -> AnalyzeInputs<'a> {
        AnalyzeInputs {
            rules: r,
            estimation: e,
            team: Some(t),
            default_reminder_types: rt,
        }
    }

    fn task(title: &str) -> Task {
        Task {
            title: title.into(),
            ..Default::default()
        }
    }

    fn deadline_in(d: Duration) -> Option<String> {
        Some(iso(now() + d))
    }

    #[test]
    fn manager_boost_pushes_p1_to_p0() {
        let (r, e, t, rt) = (rules(), estimation(), team(), rt());
        let inp = inputs(&r, &e, &t, &rt);
        // 'Manager San' matches stakeholder 'manager' → P1; boost → P0.
        let a = analyze_task(&task("Report to Manager San"), &inp, now());
        assert_eq!(a.priority, Priority::P0);
    }

    #[test]
    fn tags_due_windows_and_manager_and_complexity() {
        let (r, e, t, rt) = (rules(), estimation(), team(), rt());
        let inp = inputs(&r, &e, &t, &rt);

        let mut tk = task("Submit report");
        tk.deadline = deadline_in(Duration::days(2));
        let a = analyze_task(&tk, &inp, now());
        assert!(a.tags.contains(&"due-soon".to_string()));
        assert!(!a.suggested_reminders.is_empty());

        let mut tk = task("Urgent submission");
        tk.deadline = deadline_in(Duration::hours(6));
        assert!(analyze_task(&tk, &inp, now())
            .tags
            .contains(&"due-today".to_string()));

        let mut tk = task("Weekly task");
        tk.deadline = deadline_in(Duration::days(5));
        assert!(analyze_task(&tk, &inp, now())
            .tags
            .contains(&"due-this-week".to_string()));

        assert!(analyze_task(&task("Present to マネージャー"), &inp, now())
            .tags
            .contains(&"manager-involved".to_string()));
    }

    #[test]
    fn reminder_types_selected_and_default() {
        let (r, e, t) = (rules(), estimation(), team());
        let three_h = vs(&["3_hours_before"]);
        let inp = inputs(&r, &e, &t, &three_h);
        let mut tk = task("X");
        tk.deadline = deadline_in(Duration::days(2));
        let a = analyze_task(&tk, &inp, now());
        assert!(a
            .suggested_reminders
            .iter()
            .any(|x| x.reminder_type == "3_hours_before"));

        // unknown type → still produces a reminder (defaults to 1 day before)
        let unknown = vs(&["unknown_type"]);
        let inp = inputs(&r, &e, &t, &unknown);
        let mut tk = task("Y");
        tk.deadline = deadline_in(Duration::days(7));
        assert!(!analyze_task(&tk, &inp, now())
            .suggested_reminders
            .is_empty());
    }

    #[test]
    fn analyze_tasks_sorts_and_summarizes() {
        let (r, e, t, rt) = (rules(), estimation(), team(), rt());
        let inp = inputs(&r, &e, &t, &rt);
        let tasks = vec![
            task("Low priority task"),
            task("Urgent emergency fix"),
            task("Medium priority implementation"),
        ];
        let res = analyze_tasks(&tasks, &inp, now());
        assert_eq!(res.summary.total_tasks, 3);
        assert_eq!(res.analyzed_tasks[0].priority, Priority::P0); // urgent first
        assert!(res.summary.p0_count >= 1);
        assert!(res.summary.total_estimated_minutes > 0);
    }

    #[test]
    fn unique_stakeholders_dedup() {
        let (r, e, t, rt) = (rules(), estimation(), team(), rt());
        let inp = inputs(&r, &e, &t, &rt);
        let res = analyze_tasks(
            &[
                task("Meeting with @alice"),
                task("Review with @bob and @alice"),
            ],
            &inp,
            now(),
        );
        assert!(res
            .summary
            .unique_stakeholders
            .contains(&"alice".to_string()));
        assert!(res.summary.unique_stakeholders.contains(&"bob".to_string()));
        assert_eq!(
            res.summary
                .unique_stakeholders
                .iter()
                .filter(|s| *s == "alice")
                .count(),
            1
        );
    }

    #[test]
    fn analyze_from_text_splits_and_flags() {
        let (r, e, t, rt) = (rules(), estimation(), team(), rt());
        let inp = inputs(&r, &e, &t, &rt);
        let res = analyze_from_text(
            "- Review PR #123\n- Fix login bug\n- Update documentation",
            &inp,
            now(),
        );
        assert!(res.success);
        assert_eq!(res.analyzed_tasks.len(), 3);
        assert!(res.split_info.as_ref().unwrap().was_split);

        let res = analyze_from_text("Review the pull request", &inp, now());
        assert_eq!(res.analyzed_tasks.len(), 1);
        assert!(!res.split_info.unwrap().was_split);
    }

    #[test]
    fn format_result_markdown_sections() {
        let (r, e, t, rt) = (rules(), estimation(), team(), rt());
        let inp = inputs(&r, &e, &t, &rt);
        let res = analyze_tasks(&[task("Meeting with @alice and @bob")], &inp, now());
        let md = format_result(&res);
        assert!(md.contains("## タスク分析結果"));
        assert!(md.contains("### サマリー"));
        assert!(md.contains("### タスク詳細"));
        assert!(md.contains("**優先度**"));
        assert!(md.contains("**見積もり**"));
        assert!(md.contains("**関係者**"));
    }
}
