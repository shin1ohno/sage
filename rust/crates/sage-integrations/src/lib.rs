//! `sage-integrations` — external-service boundaries behind traits.
//!
//! Phase 1c establishes the `Sampler` seam (MCP sampling). Phase 2+ adds the
//! concrete integrations and their traits:
//! - **google**: `reqwest` over Calendar v3 + People; `oauth2` + PKCE + refresh.
//! - **slack**: `reqwest` Web API + OAuth.
//! - **notion**: `rmcp` client over `transport-child-process` (spawn the Notion
//!   MCP server).
//! - **crypto**: AES-256-GCM + scrypt encryption-service (byte-compatible), PKCE.

pub mod encryption;
pub mod pkce;
pub mod sampler;

pub use encryption::{CryptoError, EncryptionService};
pub use sampler::{Sampler, SamplingError, SamplingMessage, SamplingRequest, SamplingResponse};
