//! Slack Web API + OAuth client — port of `src/integrations/slack-service.ts`
//! and `src/oauth/slack-oauth-handler.ts` over `reqwest` (replacing
//! `@slack/web-api`; `@slack/oauth` was unused). No PKCE (Slack doesn't support it).

use crate::encryption::{CryptoError, EncryptionService};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

const API_BASE: &str = "https://slack.com/api";
const AUTHORIZE_URL: &str = "https://slack.com/oauth/v2/authorize";
/// Verbatim OAuth scopes (comma-separated, exact order).
pub const SLACK_SCOPES: &str =
    "chat:write,channels:history,channels:read,groups:history,groups:read,im:write,users:read";

#[derive(Debug, Clone, thiserror::Error)]
pub enum SlackError {
    #[error("slack api error: {0}")]
    Api(String),
    #[error("slack auth revoked")]
    AuthRevoked,
    #[error("slack rate limited")]
    RateLimited,
    #[error("http error: {0}")]
    Http(String),
}

/// Classify a Slack `error` code from the `{ok:false, error}` envelope.
pub fn classify_error(code: &str) -> SlackError {
    match code {
        "token_revoked" | "invalid_auth" => SlackError::AuthRevoked,
        "ratelimited" | "rate_limited" => SlackError::RateLimited,
        other => SlackError::Api(other.to_string()),
    }
}

/// `Ok(json)` when `ok:true`, else the classified error.
fn check_envelope(json: Value) -> Result<Value, SlackError> {
    if json.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        Ok(json)
    } else {
        let code = json
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("unknown_error");
        Err(classify_error(code))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackTokens {
    pub access_token: String,
    pub team_id: String,
    pub authed_user_id: String,
    #[serde(default)]
    pub bot_user_id: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SlackMessage {
    pub ts: String,
    pub user: Option<String>,
    pub text: Option<String>,
    pub thread_ts: Option<String>,
    pub reply_count: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SlackChannel {
    pub id: String,
    pub name: String,
    pub purpose: Option<String>,
    pub num_members: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SlackUser {
    pub id: String,
    pub name: Option<String>,
    pub real_name: Option<String>,
    pub email: Option<String>,
}

/// Parse `oauth.v2.access` response → `SlackTokens`. Pure.
pub fn tokens_from_oauth_response(json: &Value) -> SlackTokens {
    SlackTokens {
        access_token: json
            .get("access_token")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        team_id: json
            .get("team")
            .and_then(|t| t.get("id"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        authed_user_id: json
            .get("authed_user")
            .and_then(|u| u.get("id"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        bot_user_id: json
            .get("bot_user_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        scope: json
            .get("scope")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        expires_at: None,
    }
}

fn parse_message(m: &Value) -> SlackMessage {
    SlackMessage {
        ts: m
            .get("ts")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        user: m.get("user").and_then(Value::as_str).map(str::to_string),
        text: m.get("text").and_then(Value::as_str).map(str::to_string),
        thread_ts: m
            .get("thread_ts")
            .and_then(Value::as_str)
            .map(str::to_string),
        reply_count: m.get("reply_count").and_then(Value::as_u64),
    }
}

// ---------- OAuth handler ----------

pub struct SlackOAuthHandler {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    token_path: PathBuf,
    encryption: EncryptionService,
    http: reqwest::Client,
}

impl SlackOAuthHandler {
    pub fn new(
        client_id: String,
        client_secret: String,
        redirect_uri: String,
        token_path: PathBuf,
        encryption: EncryptionService,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            redirect_uri,
            token_path,
            encryption,
            http: reqwest::Client::new(),
        }
    }

    /// Build the OAuth authorize URL.
    pub fn authorize_url(&self, state: &str) -> String {
        let params = [
            ("client_id", self.client_id.as_str()),
            ("scope", SLACK_SCOPES),
            ("redirect_uri", self.redirect_uri.as_str()),
            ("state", state),
        ];
        let qs = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencode(v)))
            .collect::<Vec<_>>()
            .join("&");
        format!("{AUTHORIZE_URL}?{qs}")
    }

    pub fn load_tokens(&self) -> Result<Option<SlackTokens>, CryptoError> {
        let Some(plain) = self.encryption.decrypt_from_file(&self.token_path)? else {
            return Ok(None);
        };
        Ok(serde_json::from_str(&plain).ok())
    }

    fn store_tokens(&self, tokens: &SlackTokens) -> Result<(), SlackError> {
        let json = serde_json::to_string(tokens).map_err(|e| SlackError::Http(e.to_string()))?;
        self.encryption
            .encrypt_to_file(&json, &self.token_path)
            .map_err(|e| SlackError::Http(e.to_string()))
    }

    /// Exchange an authorization code for tokens (`oauth.v2.access`) and persist.
    pub async fn exchange_code(&self, code: &str) -> Result<SlackTokens, SlackError> {
        let resp = self
            .http
            .post(format!("{API_BASE}/oauth.v2.access"))
            .form(&[
                ("code", code),
                ("client_id", &self.client_id),
                ("client_secret", &self.client_secret),
                ("redirect_uri", &self.redirect_uri),
            ])
            .send()
            .await
            .map_err(|e| SlackError::Http(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(SlackError::Http(format!("HTTP {}", resp.status())));
        }
        let json: Value = resp
            .json()
            .await
            .map_err(|e| SlackError::Http(e.to_string()))?;
        let json = check_envelope(json)?;
        let tokens = tokens_from_oauth_response(&json);
        self.store_tokens(&tokens)?;
        Ok(tokens)
    }

    /// Revoke the token (`auth.revoke`) and delete the stored token file.
    pub async fn revoke(&self) -> Result<(), SlackError> {
        if let Some(tokens) = self
            .load_tokens()
            .map_err(|e| SlackError::Http(e.to_string()))?
        {
            let resp = self
                .http
                .post(format!("{API_BASE}/auth.revoke"))
                .bearer_auth(&tokens.access_token)
                .send()
                .await
                .map_err(|e| SlackError::Http(e.to_string()))?;
            if !resp.status().is_success() {
                return Err(SlackError::Http(format!("HTTP {}", resp.status())));
            }
        }
        let _ = std::fs::remove_file(&self.token_path);
        Ok(())
    }
}

fn urlencode(s: &str) -> String {
    // Minimal percent-encoding for query values (RFC 3986 unreserved kept).
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

// ---------- Web API client ----------

pub struct SlackClient {
    http: reqwest::Client,
    base_url: String,
}

impl Default for SlackClient {
    fn default() -> Self {
        Self::new()
    }
}

impl SlackClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: API_BASE.to_string(),
        }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url,
        }
    }

    async fn post_form(
        &self,
        token: &str,
        method: &str,
        form: &[(&str, &str)],
    ) -> Result<Value, SlackError> {
        let resp = self
            .http
            .post(format!("{}/{}", self.base_url, method))
            .bearer_auth(token)
            .form(form)
            .send()
            .await
            .map_err(|e| SlackError::Http(e.to_string()))?;
        if resp.status().as_u16() == 429 {
            return Err(SlackError::RateLimited);
        }
        let json: Value = resp
            .json()
            .await
            .map_err(|e| SlackError::Http(e.to_string()))?;
        check_envelope(json)
    }

    /// `chat.postMessage` to the authed user (DM-to-self) with Block Kit blocks.
    pub async fn send_direct_message(
        &self,
        token: &str,
        channel: &str,
        blocks: &[Value],
    ) -> Result<(), SlackError> {
        let body = serde_json::json!({
            "channel": channel,
            "blocks": blocks,
            "text": "Sage notification",
        });
        let resp = self
            .http
            .post(format!("{}/chat.postMessage", self.base_url))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| SlackError::Http(e.to_string()))?;
        if resp.status().as_u16() == 429 {
            return Err(SlackError::RateLimited);
        }
        let json: Value = resp
            .json()
            .await
            .map_err(|e| SlackError::Http(e.to_string()))?;
        check_envelope(json)?;
        Ok(())
    }

    /// `conversations.replies` for a thread.
    pub async fn get_thread_replies(
        &self,
        token: &str,
        channel: &str,
        thread_ts: &str,
    ) -> Result<Vec<SlackMessage>, SlackError> {
        let json = self
            .post_form(
                token,
                "conversations.replies",
                &[("channel", channel), ("ts", thread_ts)],
            )
            .await?;
        Ok(json
            .get("messages")
            .and_then(Value::as_array)
            .map(|a| a.iter().map(parse_message).collect())
            .unwrap_or_default())
    }

    /// `conversations.history`; optionally expands threads (breaks on rate-limit).
    pub async fn get_channel_history(
        &self,
        token: &str,
        channel: &str,
        oldest: &str,
        limit: u32,
        include_threads: bool,
    ) -> Result<Vec<SlackMessage>, SlackError> {
        let limit_s = limit.to_string();
        let json = self
            .post_form(
                token,
                "conversations.history",
                &[
                    ("channel", channel),
                    ("oldest", oldest),
                    ("limit", &limit_s),
                ],
            )
            .await?;
        let mut messages: Vec<SlackMessage> = json
            .get("messages")
            .and_then(Value::as_array)
            .map(|a| a.iter().map(parse_message).collect())
            .unwrap_or_default();

        if include_threads {
            let mut replies = Vec::new();
            for m in &messages {
                if m.reply_count.unwrap_or(0) > 0 && !m.ts.is_empty() {
                    match self.get_thread_replies(token, channel, &m.ts).await {
                        Ok(r) => replies.extend(r),
                        // Stop the thread loop on rate-limit (matches the TS `break`).
                        Err(SlackError::RateLimited) => break,
                        Err(e) => return Err(e),
                    }
                }
            }
            messages.extend(replies);
        }
        Ok(messages)
    }

    /// `conversations.list` (public + private). Single page (matches the TS).
    pub async fn list_bot_channels(&self, token: &str) -> Result<Vec<SlackChannel>, SlackError> {
        let json = self
            .post_form(
                token,
                "conversations.list",
                &[("types", "public_channel,private_channel")],
            )
            .await?;
        Ok(json
            .get("channels")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .map(|c| SlackChannel {
                        id: c
                            .get("id")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        name: c
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        purpose: c
                            .get("purpose")
                            .and_then(|p| p.get("value"))
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        num_members: c.get("num_members").and_then(Value::as_u64),
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    /// `users.lookupByEmail`; `users_not_found` → `Ok(None)`.
    pub async fn lookup_user(
        &self,
        token: &str,
        email: &str,
    ) -> Result<Option<SlackUser>, SlackError> {
        match self
            .post_form(token, "users.lookupByEmail", &[("email", email)])
            .await
        {
            Ok(json) => Ok(json.get("user").map(|u| SlackUser {
                id: u
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                name: u.get("name").and_then(Value::as_str).map(str::to_string),
                real_name: u
                    .get("real_name")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                email: u
                    .get("profile")
                    .and_then(|p| p.get("email"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })),
            Err(SlackError::Api(code)) if code == "users_not_found" => Ok(None),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn error_classification() {
        assert!(matches!(
            classify_error("token_revoked"),
            SlackError::AuthRevoked
        ));
        assert!(matches!(
            classify_error("invalid_auth"),
            SlackError::AuthRevoked
        ));
        assert!(matches!(
            classify_error("ratelimited"),
            SlackError::RateLimited
        ));
        assert!(matches!(
            classify_error("channel_not_found"),
            SlackError::Api(_)
        ));
    }

    #[test]
    fn envelope_ok_and_err() {
        assert!(check_envelope(json!({"ok": true, "messages": []})).is_ok());
        assert!(matches!(
            check_envelope(json!({"ok": false, "error": "token_revoked"})),
            Err(SlackError::AuthRevoked)
        ));
    }

    #[test]
    fn oauth_response_mapping() {
        let json = json!({
            "ok": true,
            "access_token": "xoxb-1",
            "team": {"id": "T1"},
            "authed_user": {"id": "U1"},
            "bot_user_id": "B1",
            "scope": "chat:write,users:read"
        });
        let t = tokens_from_oauth_response(&json);
        assert_eq!(t.access_token, "xoxb-1");
        assert_eq!(t.team_id, "T1");
        assert_eq!(t.authed_user_id, "U1");
        assert_eq!(t.bot_user_id, "B1");
    }

    #[test]
    fn message_parsing() {
        let m = parse_message(&json!({"ts": "1.2", "user": "U1", "text": "hi", "reply_count": 3}));
        assert_eq!(m.ts, "1.2");
        assert_eq!(m.reply_count, Some(3));
    }

    #[test]
    fn authorize_url_contains_scopes_and_state() {
        let h = SlackOAuthHandler::new(
            "cid".into(),
            "secret".into(),
            "https://mcp.example/oauth/slack/callback".into(),
            PathBuf::from("/tmp/slack_tokens.enc"),
            EncryptionService::with_key("k".repeat(40)),
        );
        let url = h.authorize_url("state123");
        assert!(url.starts_with("https://slack.com/oauth/v2/authorize?"));
        assert!(url.contains("client_id=cid"));
        assert!(url.contains("state=state123"));
        assert!(url.contains("chat%3Awrite")); // ':' encoded
    }
}
