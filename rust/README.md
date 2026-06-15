# sage — Rust rewrite

A phased reimplementation of the TypeScript `@shin1ohno/sage` MCP server (`../src`)
in Rust. Goals: single-binary distribution (no Node runtime), type safety /
maintainability, and faithful tool I/O parity. Built on the official
[`rmcp`](https://crates.io/crates/rmcp) SDK.

The TS tree stays in place as the parity oracle (`parity/`) until cutover.

## Workspace layout

| crate | responsibility |
|---|---|
| `sage-domain` | Pure, deterministic logic (priority, estimation, stakeholders, splitter). No I/O. |
| `sage-config` | `UserConfig` / `RemoteConfig`, loading, validation, hot-reload. |
| `sage-reliability` | Kill-switch, budget, capability-gate, audit, idempotency, pending-actions. |
| `sage-eventkit` | Native EventKit (events + reminders) via `objc2`. macOS only. |
| `sage-integrations` | Google / Slack / Notion / crypto + the `Sampler` seam (MCP sampling). |
| `sage-mcp` | rmcp `ServerHandler`, tool registration, unified dispatch wrapper. |
| `sage-server` | `sage` binary: stdio + Streamable HTTP transports, auth, CLI, pipeline. |

## Phases

- **Phase 0** (this scaffold): workspace + 7-crate skeleton + rmcp stdio hello-world (`check_setup_status`, `analyze_tasks` stubs) + CI + parity-harness skeleton.
- **Phase 1**: pure domain ports + config/setup + stdio MCP + `Sampler` trait.
- **Phase 2**: EventKit + Google/Slack/Notion + reliability suite + all write tools.
- **Phase 3**: Streamable HTTP + SSE + JWT/JWKS auth + OAuth callbacks.
- **Phase 4**: Meeting Intelligence pipeline (scheduler, briefings, post-meeting).

## Develop

```bash
cd rust
cargo build --workspace
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check

# Run the stdio server (Phase 0 stub):
cargo run -p sage-server
# Inspect with the MCP inspector:
#   npx @modelcontextprotocol/inspector cargo run -p sage-server
```
