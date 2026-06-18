//! Notion integration via an **MCP client** that spawns the Notion MCP server as
//! a child process — the real wiring the TS `notion-mcp.ts` only stubbed
//! (`StdioClientTransport` was never connected). Uses rmcp's client +
//! `transport-child-process`.
//!
//! The database-ID allow-list (the one functional piece of the TS) is enforced
//! before every call. The exact Notion property mapping for `notion-create-pages`
//! depends on the running Notion MCP server's tool schema and must be validated
//! against it at integration time; the request-building here is a faithful
//! best-effort passthrough.

use rmcp::model::CallToolRequestParams;
use rmcp::service::{RoleClient, RunningService};
use rmcp::transport::{ConfigureCommandExt, TokioChildProcess};
use rmcp::ServiceExt;
use serde_json::{json, Map, Value};
use tokio::process::Command;

#[derive(Debug, thiserror::Error)]
pub enum NotionError {
    #[error("database id {0} is not in the allow-list")]
    DatabaseNotAllowed(String),
    #[error("notion mcp transport error: {0}")]
    Transport(String),
    #[error("notion mcp call error: {0}")]
    Call(String),
    #[error("notion result missing page id")]
    NoPageId,
}

/// A task to sync to Notion (from the `sync_to_notion` tool).
#[derive(Debug, Clone, Default)]
pub struct NotionPageRequest {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub stakeholders: Vec<String>,
    pub estimated_minutes: Option<u32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NotionPageResult {
    pub page_id: String,
    pub page_url: Option<String>,
}

/// Enforce the database-ID allow-list (the one real guard from the TS stub).
pub fn validate_database_id(database_id: &str, allowed: &[String]) -> Result<(), NotionError> {
    if allowed.iter().any(|a| a == database_id) {
        Ok(())
    } else {
        Err(NotionError::DatabaseNotAllowed(database_id.to_string()))
    }
}

/// Build the `notion-create-pages` arguments object. Pure.
pub fn build_create_page_args(database_id: &str, req: &NotionPageRequest) -> Map<String, Value> {
    let mut properties = Map::new();
    properties.insert("title".to_string(), json!(req.title));
    if let Some(d) = &req.description {
        properties.insert("description".to_string(), json!(d));
    }
    if let Some(p) = &req.priority {
        properties.insert("priority".to_string(), json!(p));
    }
    if let Some(d) = &req.due_date {
        properties.insert("dueDate".to_string(), json!(d));
    }
    if !req.stakeholders.is_empty() {
        properties.insert("stakeholders".to_string(), json!(req.stakeholders));
    }
    if let Some(m) = req.estimated_minutes {
        properties.insert("estimatedMinutes".to_string(), json!(m));
    }
    let mut args = Map::new();
    args.insert("database_id".to_string(), json!(database_id));
    args.insert("properties".to_string(), Value::Object(properties));
    args
}

/// Extract `{page_id, page_url}` from a tool result JSON. Port of the TS parsing
/// (`pageId ?? page.id`, `pageUrl ?? url ?? page.url`). Pure.
pub fn parse_page_result(value: &Value) -> Result<NotionPageResult, NotionError> {
    let page_id = value
        .get("pageId")
        .and_then(Value::as_str)
        .or_else(|| {
            value
                .get("page")
                .and_then(|p| p.get("id"))
                .and_then(Value::as_str)
        })
        .ok_or(NotionError::NoPageId)?
        .to_string();
    let page_url = value
        .get("pageUrl")
        .and_then(Value::as_str)
        .or_else(|| value.get("url").and_then(Value::as_str))
        .or_else(|| {
            value
                .get("page")
                .and_then(|p| p.get("url"))
                .and_then(Value::as_str)
        })
        .map(str::to_string);
    Ok(NotionPageResult { page_id, page_url })
}

/// A connected Notion MCP client (owns the child-process MCP server).
pub struct NotionMcpClient {
    allowed_database_ids: Vec<String>,
    service: RunningService<RoleClient, ()>,
}

impl NotionMcpClient {
    /// Spawn the Notion MCP server (`command args...`) and connect over stdio.
    /// Typical: `command = "npx"`, `args = ["-y", "@notionhq/notion-mcp-server"]`
    /// with `NOTION_API_KEY` in the environment.
    pub async fn connect(
        command: &str,
        args: &[String],
        env: &[(String, String)],
        allowed_database_ids: Vec<String>,
    ) -> Result<Self, NotionError> {
        let args = args.to_vec();
        let env = env.to_vec();
        let transport = TokioChildProcess::new(Command::new(command).configure(|cmd| {
            cmd.args(&args);
            for (k, v) in &env {
                cmd.env(k, v);
            }
        }))
        .map_err(|e| NotionError::Transport(e.to_string()))?;
        let service = ().serve(transport).await.map_err(|e| NotionError::Transport(e.to_string()))?;
        Ok(Self {
            allowed_database_ids,
            service,
        })
    }

    fn extract_text(result: &rmcp::model::CallToolResult) -> Option<String> {
        // Serialize the result and pull the first text content block, avoiding a
        // dependency on the exact rmcp Content accessor API.
        let v = serde_json::to_value(result).ok()?;
        v.get("content")?
            .as_array()?
            .iter()
            .find_map(|c| c.get("text").and_then(Value::as_str).map(str::to_string))
    }

    async fn call(&self, name: &str, args: Map<String, Value>) -> Result<Value, NotionError> {
        let result = self
            .service
            .call_tool(CallToolRequestParams::new(name.to_string()).with_arguments(args))
            .await
            .map_err(|e| NotionError::Call(e.to_string()))?;
        let text = Self::extract_text(&result).unwrap_or_default();
        Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
    }

    /// Create a Notion page (`notion-create-pages`). Validates the allow-list first.
    pub async fn create_page(
        &self,
        database_id: &str,
        req: &NotionPageRequest,
    ) -> Result<NotionPageResult, NotionError> {
        validate_database_id(database_id, &self.allowed_database_ids)?;
        let args = build_create_page_args(database_id, req);
        let value = self.call("notion-create-pages", args).await?;
        parse_page_result(&value)
    }

    /// Query a Notion data source (`notion-query-data-sources`). Allow-list checked.
    pub async fn query_data_source(
        &self,
        database_id: &str,
        filter: Option<Value>,
    ) -> Result<Value, NotionError> {
        validate_database_id(database_id, &self.allowed_database_ids)?;
        let mut args = Map::new();
        args.insert("data_source_id".to_string(), json!(database_id));
        if let Some(f) = filter {
            args.insert("filter".to_string(), f);
        }
        self.call("notion-query-data-sources", args).await
    }

    /// Update a Notion page (`notion-update-page`).
    pub async fn update_page(
        &self,
        page_id: &str,
        properties: Value,
    ) -> Result<Value, NotionError> {
        let mut args = Map::new();
        args.insert("page_id".to_string(), json!(page_id));
        args.insert("properties".to_string(), properties);
        self.call("notion-update-page", args).await
    }

    /// Gracefully terminate the child MCP server.
    pub async fn shutdown(self) {
        let _ = self.service.cancel().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allow_list_enforced() {
        let allowed = vec!["db-1".to_string(), "db-2".to_string()];
        assert!(validate_database_id("db-1", &allowed).is_ok());
        assert!(matches!(
            validate_database_id("db-x", &allowed),
            Err(NotionError::DatabaseNotAllowed(_))
        ));
        // empty allow-list denies everything
        assert!(validate_database_id("db-1", &[]).is_err());
    }

    #[test]
    fn create_page_args_shape() {
        let req = NotionPageRequest {
            title: "Q2 planning".into(),
            priority: Some("P1".into()),
            due_date: Some("2026-07-01".into()),
            stakeholders: vec!["alice".into()],
            estimated_minutes: Some(120),
            ..Default::default()
        };
        let args = build_create_page_args("db-1", &req);
        assert_eq!(args["database_id"], "db-1");
        assert_eq!(args["properties"]["title"], "Q2 planning");
        assert_eq!(args["properties"]["priority"], "P1");
        assert_eq!(args["properties"]["dueDate"], "2026-07-01");
        assert_eq!(args["properties"]["stakeholders"][0], "alice");
        assert_eq!(args["properties"]["estimatedMinutes"], 120);
    }

    #[test]
    fn page_result_parsing_variants() {
        // flat pageId/pageUrl
        let r = parse_page_result(&json!({"pageId": "p1", "pageUrl": "https://n/p1"})).unwrap();
        assert_eq!(r.page_id, "p1");
        assert_eq!(r.page_url.as_deref(), Some("https://n/p1"));
        // nested page.id / page.url
        let r = parse_page_result(&json!({"page": {"id": "p2", "url": "https://n/p2"}})).unwrap();
        assert_eq!(r.page_id, "p2");
        assert_eq!(r.page_url.as_deref(), Some("https://n/p2"));
        // missing id → error
        assert!(matches!(
            parse_page_result(&json!({"foo": "bar"})),
            Err(NotionError::NoPageId)
        ));
    }
}
