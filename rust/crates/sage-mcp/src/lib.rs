//! `sage-mcp` — the MCP tool surface.
//!
//! Phase 1c wires the real `analyze_tasks` tool: the handler holds a loaded
//! `UserConfig` and orchestrates the `sage-domain` engines. Response contract
//! (preserved from TS): `{ content: [{ type: "text", text: <json> }] }` —
//! returning a `String` lets rmcp wrap it as a single text block, and we make
//! that string the JSON document.

use chrono::Utc;
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{Implementation, ServerCapabilities, ServerInfo};
use rmcp::{schemars, tool, tool_handler, tool_router, ServerHandler};
use sage_config::UserConfig;
use sage_domain::{
    analyze_tasks, AnalysisReasoning, AnalysisSummary, AnalyzeInputs, Priority, Reminder, Task,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// `analyze_tasks` input. Mirrors the TS tool schema: `tasks: [{title, description?, deadline?}]`.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AnalyzeTasksArgs {
    #[schemars(description = "Tasks to analyze")]
    pub tasks: Vec<TaskInput>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TaskInput {
    #[schemars(description = "Task title")]
    pub title: String,
    #[serde(default)]
    #[schemars(description = "Optional task description")]
    pub description: Option<String>,
    #[serde(default)]
    #[schemars(description = "Optional ISO-8601 deadline")]
    pub deadline: Option<String>,
}

// Tool output reshaped to the TS `{ summary, tasks[...] }` contract.
#[derive(Serialize)]
struct AnalyzeOutput {
    summary: AnalysisSummary,
    tasks: Vec<AnalyzeOutTask>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeOutTask {
    title: String,
    priority: Priority,
    estimated_minutes: u32,
    stakeholders: Vec<String>,
    tags: Vec<String>,
    reasoning: AnalysisReasoning,
    suggested_reminders: Vec<Reminder>,
}

/// The sage MCP server handler.
#[derive(Clone)]
pub struct SageHandler {
    // rmcp's `#[tool_handler]` (1.7) resolves the router via `Self::tool_router()`,
    // so this stored field is not read directly; kept to match the canonical shape.
    #[allow(dead_code)]
    tool_router: ToolRouter<SageHandler>,
    config: Arc<UserConfig>,
}

impl Default for SageHandler {
    fn default() -> Self {
        Self::new()
    }
}

#[tool_router]
impl SageHandler {
    pub fn new() -> Self {
        // Load the user config, falling back to an in-memory default (no disk
        // write) when absent — analyze_tasks is offline and config-driven.
        let config = sage_config::load().unwrap_or_else(|_| sage_config::default_config());
        Self {
            tool_router: Self::tool_router(),
            config: Arc::new(config),
        }
    }

    /// Mirrors the TS `check_setup_status` tool.
    #[tool(description = "Check whether sage is configured. Returns setup status.")]
    async fn check_setup_status(&self) -> String {
        serde_json::json!({
            "configured": sage_config::exists(),
            "implementation": "rust",
            "version": env!("CARGO_PKG_VERSION"),
            "user": self.config.user.name,
        })
        .to_string()
    }

    /// Analyze tasks for priority, time, and stakeholders (offline, config-driven).
    #[tool(description = "Analyze tasks for priority, time, and stakeholders.")]
    async fn analyze_tasks(&self, Parameters(args): Parameters<AnalyzeTasksArgs>) -> String {
        let tasks: Vec<Task> = args
            .tasks
            .into_iter()
            .map(|t| Task {
                title: t.title,
                description: t.description,
                deadline: t.deadline,
                tags: Vec::new(),
            })
            .collect();

        let cfg = &self.config;
        let inputs = AnalyzeInputs {
            rules: &cfg.priority_rules,
            estimation: &cfg.estimation,
            team: Some(&cfg.team),
            default_reminder_types: &cfg.reminders.default_types,
        };
        let result = analyze_tasks(&tasks, &inputs, Utc::now());

        let out = AnalyzeOutput {
            summary: result.summary,
            tasks: result
                .analyzed_tasks
                .into_iter()
                .map(|a| AnalyzeOutTask {
                    title: a.original.title,
                    priority: a.priority,
                    estimated_minutes: a.estimated_minutes,
                    stakeholders: a.stakeholders,
                    tags: a.tags,
                    reasoning: a.reasoning,
                    suggested_reminders: a.suggested_reminders,
                })
                .collect(),
        };

        serde_json::to_string(&out)
            .unwrap_or_else(|e| format!(r#"{{"error":true,"message":"{e}"}}"#))
    }
}

#[tool_handler]
impl ServerHandler for SageHandler {
    #[allow(clippy::field_reassign_with_default)]
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.instructions = Some("sage (賢者) — AI task management MCP server (Rust).".to_string());
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        let mut server_info = Implementation::from_build_env();
        server_info.name = "sage".to_string();
        server_info.version = env!("CARGO_PKG_VERSION").to_string();
        info.server_info = server_info;
        info
    }
}
