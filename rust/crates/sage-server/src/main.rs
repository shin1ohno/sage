//! sage MCP server binary.
//!
//! Phase 0: stdio transport only (Claude Desktop / Claude Code). Phase 1 adds
//! CLI parsing (`--remote`/`--config`/`--port`/`--host`, `SAGE_*` env) and
//! config loading; Phase 3 adds the axum Streamable HTTP + SSE transport and
//! auth. CLI mode selection mirrors the TS `--remote` flag.

use anyhow::Result;
use rmcp::{transport::stdio, ServiceExt};
use sage_mcp::SageHandler;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    // CRITICAL for stdio MCP: logs MUST go to stderr. The TS implementation
    // defaulted pino to stdout, which would interleave with the JSON-RPC stream
    // on fd 1 and corrupt it. This is a defect we fix, not replicate.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    tracing::info!("starting sage (Rust) stdio MCP server — Phase 0");

    let service = SageHandler::new().serve(stdio()).await.inspect_err(|e| {
        tracing::error!("failed to start MCP service: {e:?}");
    })?;

    service.waiting().await?;
    Ok(())
}
