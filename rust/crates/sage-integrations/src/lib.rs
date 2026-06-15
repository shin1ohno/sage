//! `sage-integrations` — external-service boundaries behind traits.
//!
//! Phase 2+ home for the trait definitions (`Sampler`, `CalendarSource`,
//! `ReminderStore`, `NotionClient`, `SlackClient`, `DirectoryService`) and
//! their concrete impls:
//! - **google**: `reqwest` over Calendar v3 (events/calendarList/freebusy) +
//!   People `searchDirectoryPeople`; `oauth2` + PKCE + pre-emptive refresh.
//! - **slack**: `reqwest` Web API (5 methods) + OAuth (2 calls).
//! - **notion**: `rmcp` client over `transport-child-process` (spawn the Notion
//!   MCP server) — the TS `StdioClientTransport` was never wired.
//! - **crypto**: AES-256-GCM + scrypt encryption-service (byte-compatible),
//!   PKCE S256.
//!
//! `Sampler` is the single most important seam: sage holds no NLP; all natural
//! -language analysis is delegated through MCP `sampling/createMessage`. Empty
//! in Phase 0; the trait lands in Phase 1.
