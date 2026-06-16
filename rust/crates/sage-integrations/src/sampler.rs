//! The `Sampler` seam — sage's single most important abstraction boundary.
//!
//! sage holds no NLP itself: every natural-language analysis (meeting briefings,
//! action-item extraction, the iOS native-access routing) is delegated to the
//! MCP client via `sampling/createMessage`. Domain services depend only on this
//! trait, so they stay testable with a mock sampler. The production impl
//! (Phase 4) issues the JSON-RPC request through the rmcp server peer.
//!
//! Ports the error semantics of `src/services/sampling-service.ts`.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SamplingRequest {
    pub messages: Vec<SamplingMessage>,
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SamplingResponse {
    pub content: String,
    pub model: String,
    #[serde(default)]
    pub stop_reason: Option<String>,
}

/// Sampling failure with the JSON-RPC error code that drives retry/UX decisions.
#[derive(Debug, Clone, thiserror::Error)]
#[error("sampling error (code {code}): {message}")]
pub struct SamplingError {
    pub code: i64,
    pub message: String,
    pub is_retryable: bool,
}

impl SamplingError {
    /// `-1` USER_REJECTION — the user declined the sampling prompt (not retryable).
    pub fn is_user_rejection(&self) -> bool {
        self.code == -1
    }
    /// `-32601` METHOD_NOT_FOUND — the client doesn't support sampling (not retryable).
    pub fn is_sampling_not_supported(&self) -> bool {
        self.code == -32601
    }
}

/// The sampling boundary. Production impls issue an MCP `sampling/createMessage`
/// request to the connected client; tests use a mock.
#[async_trait]
pub trait Sampler: Send + Sync {
    async fn create_message(
        &self,
        request: SamplingRequest,
    ) -> Result<SamplingResponse, SamplingError>;
}
