//! `sage-mcp` — the MCP tool surface.
//!
//! Phase 0 proves the rmcp wiring with two stub tools (one no-arg, one with a
//! `Parameters` extractor) and a customized `ServerHandler`. Phase 1+ grows this
//! into the full 38-tool union and adds the unified dispatch wrapper (kill-switch
//! → capability-gate → budget → audit) applied to BOTH transports.
//!
//! Response contract (preserved from TS): every tool returns
//! `{ content: [{ type: "text", text: <json-string> }] }`. Returning a `String`
//! lets rmcp wrap it as a single text content block; we make that string a
//! JSON document to match the TS `createToolResponse` shape.

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{Implementation, ServerCapabilities, ServerInfo};
use rmcp::{schemars, tool, tool_handler, tool_router, ServerHandler};
use serde::Deserialize;

/// A single task as accepted by `analyze_tasks` (Phase 0 subset: title only).
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AnalyzeTasksArgs {
    #[schemars(description = "Tasks to analyze (Phase 0 accepts titles only)")]
    pub tasks: Vec<TaskInput>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TaskInput {
    #[schemars(description = "Task title")]
    pub title: String,
}

/// The sage MCP server handler.
#[derive(Clone)]
pub struct SageHandler {
    // rmcp's `#[tool_handler]` (1.7) resolves the router via `Self::tool_router()`,
    // so this stored field is not read directly. We keep it to match the canonical
    // rmcp handler shape (see the upstream `Counter` example) — Phase 1 adds the
    // state fields (config, services) that sit alongside it and ARE read.
    #[allow(dead_code)]
    tool_router: ToolRouter<SageHandler>,
}

impl Default for SageHandler {
    fn default() -> Self {
        Self::new()
    }
}

#[tool_router]
impl SageHandler {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    /// Mirrors the TS `check_setup_status` tool (Phase 0 stub).
    #[tool(description = "Check whether sage is configured. Returns setup status.")]
    async fn check_setup_status(&self) -> String {
        serde_json::json!({
            "configured": false,
            "phase": "0",
            "implementation": "rust",
            "version": env!("CARGO_PKG_VERSION"),
            "message": "sage (Rust) Phase 0 scaffold — full setup status lands in Phase 1."
        })
        .to_string()
    }

    /// Mirrors the TS `analyze_tasks` tool (Phase 0 echo stub — real priority /
    /// estimation / stakeholder engines port in Phase 1 from `sage-domain`).
    #[tool(description = "Analyze tasks for priority, time, and stakeholders.")]
    async fn analyze_tasks(&self, Parameters(args): Parameters<AnalyzeTasksArgs>) -> String {
        let titles: Vec<&str> = args.tasks.iter().map(|t| t.title.as_str()).collect();
        serde_json::json!({
            "phase": "0",
            "note": "stub — engines port in Phase 1",
            "summary": { "totalTasks": titles.len() },
            "tasks": titles,
        })
        .to_string()
    }
}

#[tool_handler]
impl ServerHandler for SageHandler {
    // `ServerInfo` (rmcp's `InitializeResult`) is `#[non_exhaustive]`, so it
    // cannot be built with a struct literal from outside rmcp. Start from
    // `Default` and set the fields we care about.
    #[allow(clippy::field_reassign_with_default)]
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.instructions = Some(
            "sage (賢者) — AI task management MCP server (Rust). Phase 0 scaffold.".to_string(),
        );
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        // Identify as "sage" rather than the rmcp default. `from_build_env`
        // avoids constructing the (non_exhaustive) `Implementation` via literal,
        // but it bakes in rmcp's own name/version, so override both with sage's.
        let mut server_info = Implementation::from_build_env();
        server_info.name = "sage".to_string();
        server_info.version = env!("CARGO_PKG_VERSION").to_string();
        info.server_info = server_info;
        info
    }
}
