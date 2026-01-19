# Requirements: Streamable HTTP Transport

> **Last Updated**: 2026-01-19
> **Status**: Draft
> **Feature**: streamable-http-transport
> **MCP Spec Version**: 2025-03-26

## Overview

MCP Streamable HTTP Transport対応を実装し、Codex等のMCPクライアントからの接続を可能にする。

### Background

現在のsageは`POST /mcp`でJSON直接レスポンスのみをサポートしており、Streamable HTTP Transportで必要な`GET /mcp`（SSEストリーム）に対応していない。これにより、Codex等の新しいMCPクライアントからの接続が失敗する。

### References

- [MCP Streamable HTTP Transport Specification (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP's New Transport Layer - Deep Dive](https://www.claudemcp.com/blog/mcp-streamable-http)

---

## Functional Requirements

### FR-1: GET /mcp - SSE Stream Establishment

**EARS Format**: When a client sends a GET request to `/mcp` with `Accept: text/event-stream` header, the system shall establish an SSE connection and respond with `Content-Type: text/event-stream`.

**User Story**: As an MCP client, I want to establish an SSE stream to receive server-initiated messages so that I can receive notifications and responses asynchronously.

**Acceptance Criteria**:
- [ ] AC-1.1: GET /mcp with `Accept: text/event-stream` returns 200 with `Content-Type: text/event-stream`
- [ ] AC-1.2: SSE stream sends keepalive comments (`: keepalive\n\n`) every 30 seconds
- [ ] AC-1.3: GET /mcp without `Accept: text/event-stream` returns 406 Not Acceptable
- [ ] AC-1.4: Connection properly handles client disconnect

---

### FR-2: POST /mcp - SSE Response Mode

**EARS Format**: When a client sends a POST request to `/mcp` with `Accept` header containing `text/event-stream`, the system shall respond with SSE stream containing JSON-RPC responses.

**User Story**: As an MCP client, I want to receive responses via SSE stream so that I can handle long-running operations and receive multiple messages.

**Acceptance Criteria**:
- [ ] AC-2.1: POST /mcp with `Accept: application/json, text/event-stream` and JSON-RPC request returns SSE stream
- [ ] AC-2.2: Each JSON-RPC response is sent as `data: {json}\n\n` format
- [ ] AC-2.3: Stream closes after all responses are sent (unless session maintained)
- [ ] AC-2.4: POST /mcp with `Accept: application/json` only returns JSON directly (backward compatible)

---

### FR-3: Session Management

**EARS Format**: When a client receives `InitializeResult`, the system shall assign a session ID via `Mcp-Session-Id` header, and subsequent requests with that session ID shall be associated with the same session.

**User Story**: As an MCP client, I want to maintain a session across multiple requests so that server state is preserved.

**Acceptance Criteria**:
- [ ] AC-3.1: `InitializeResult` response includes `Mcp-Session-Id` header with cryptographically secure UUID
- [ ] AC-3.2: Requests with valid `Mcp-Session-Id` are associated with existing session
- [ ] AC-3.3: Requests without `Mcp-Session-Id` (after initialization) return 400 Bad Request
- [ ] AC-3.4: Requests with invalid/expired session ID return 404 Not Found
- [ ] AC-3.5: DELETE /mcp with valid session ID terminates the session

---

### FR-4: SSE Event Format

**EARS Format**: The system shall send SSE events in the standard format with optional event IDs for resumability.

**User Story**: As an MCP client, I want to receive properly formatted SSE events so that I can parse them correctly.

**Acceptance Criteria**:
- [ ] AC-4.1: JSON-RPC messages are sent as `data: {json}\n\n`
- [ ] AC-4.2: Event IDs are included for resumability: `id: {event-id}\ndata: {json}\n\n`
- [ ] AC-4.3: Event IDs are unique per stream
- [ ] AC-4.4: Keepalive messages use SSE comment format: `: keepalive\n\n`

---

### FR-5: Stream Resumability

**EARS Format**: When a client reconnects with `Last-Event-ID` header, the system shall attempt to replay missed messages from that point.

**User Story**: As an MCP client, I want to resume a broken connection without losing messages so that reliability is improved.

**Acceptance Criteria**:
- [ ] AC-5.1: GET /mcp with `Last-Event-ID` header attempts to resume from that event
- [ ] AC-5.2: Server replays messages after the specified event ID if available
- [ ] AC-5.3: Server does not replay messages from different streams
- [ ] AC-5.4: If event ID is not found/expired, stream starts fresh

---

### FR-6: Authentication Integration

**EARS Format**: The system shall integrate SSE streams with existing JWT and OAuth authentication mechanisms.

**User Story**: As an MCP server administrator, I want SSE connections to be authenticated so that unauthorized access is prevented.

**Acceptance Criteria**:
- [ ] AC-6.1: GET /mcp requires valid authentication (JWT or OAuth token)
- [ ] AC-6.2: Unauthenticated GET /mcp returns 401 Unauthorized
- [ ] AC-6.3: Session ID is bound to authenticated user
- [ ] AC-6.4: Token refresh does not invalidate session

---

### FR-7: Multiple Stream Support

**EARS Format**: The system shall support multiple simultaneous SSE streams per client/session.

**User Story**: As an MCP client, I want to open multiple SSE streams so that I can receive messages in parallel.

**Acceptance Criteria**:
- [ ] AC-7.1: Client can maintain multiple GET /mcp connections simultaneously
- [ ] AC-7.2: Each message is sent to only ONE connected stream (no broadcast)
- [ ] AC-7.3: Stream assignment follows round-robin or deterministic routing

---

### FR-8: Backward Compatibility

**EARS Format**: The system shall maintain backward compatibility with existing JSON-only POST /mcp clients.

**User Story**: As an existing MCP client using JSON responses, I want my requests to continue working so that I don't need to update immediately.

**Acceptance Criteria**:
- [ ] AC-8.1: POST /mcp with `Accept: application/json` returns JSON response directly
- [ ] AC-8.2: Existing Claude Desktop integration continues to work
- [ ] AC-8.3: No breaking changes to existing `/mcp` POST behavior

---

## Non-Functional Requirements

### NFR-1: Performance

- SSE keepalive interval: 30 seconds (configurable)
- Maximum simultaneous SSE connections per server: 1000+
- Message delivery latency: < 100ms for local connections

### NFR-2: Security

- Session IDs must be cryptographically secure (UUID v4 or JWT)
- Origin header validation for DNS rebinding protection
- Rate limiting on SSE connection establishment

### NFR-3: Reliability

- Graceful handling of client disconnects
- Event buffering for resumability (configurable retention)
- No message loss during normal operation

### NFR-4: Observability

- Log SSE connection establishment and termination
- Metrics for active connections count
- Debug logging for message routing

---

## Out of Scope

- WebSocket transport (separate feature)
- Binary message encoding
- Compression (gzip/deflate for SSE)
- Server-to-server MCP communication

---

## Glossary

| Term | Definition |
|------|------------|
| SSE | Server-Sent Events - HTTP-based protocol for server-to-client streaming |
| Streamable HTTP | MCP transport using POST for client→server and GET/SSE for server→client |
| Session ID | Cryptographically secure identifier binding multiple requests together |
| Event ID | Per-stream unique identifier enabling resumability |
