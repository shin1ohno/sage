# Implementation Plan: Streamable HTTP Transport

> **Last Updated**: 2026-01-19
> **Status**: ✅ COMPLETED
> **Feature**: streamable-http-transport
> **Requirements**: [requirements.md](./requirements.md)
> **Design**: [design.md](./design.md)

## Task Overview

MCP Streamable HTTP Transport対応を実装し、Codex等のMCPクライアントからの接続を可能にする。

## Steering Document Compliance

- **structure.md**: `src/cli/` にハンドラ、`src/types/` に型定義、`tests/` にテスト
- **tech.md**: TypeScript strict mode、Zod validation、Jest テスト

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

---

## Tasks

### Phase 1: Type Definitions

- [ ] 1. Add Streamable HTTP types to src/types/streamable-http.ts
  - **File**: `src/types/streamable-http.ts` (new)
  - Define `StreamableSession` interface
  - Define `BufferedEvent` interface
  - Define `SSEConnectionExtended` interface
  - Define `StreamableHTTPHandlerOptions` interface
  - Export all types
  - **Purpose**: Establish type safety for Streamable HTTP components
  - _Requirements: FR-3, FR-4, FR-5_

- [ ] 2. Add Zod validation schemas for Streamable HTTP
  - **File**: `src/config/validation.ts` (modify)
  - Add `StreamableHTTPConfigSchema` for remote-config.json extension
  - Add validation for session ID format (UUID or JWT)
  - **Purpose**: Runtime validation of configuration
  - _Leverage: existing Zod patterns in validation.ts_
  - _Requirements: FR-3, NFR-2_

---

### Phase 2: Session Manager

- [ ] 3. Create SessionManager class skeleton
  - **File**: `src/cli/session-manager.ts` (new)
  - Create `SessionManager` class with constructor
  - Add private `sessions: Map<string, StreamableSession>`
  - Add `createSession()`, `getSession()`, `deleteSession()` method signatures
  - **Purpose**: Establish session management structure
  - _Requirements: FR-3_

- [ ] 4. Implement SessionManager.createSession
  - **File**: `src/cli/session-manager.ts` (continue)
  - Generate cryptographically secure UUID v4 using `crypto.randomUUID()`
  - Initialize session with timestamps and empty event buffer
  - Add session count limit enforcement
  - **Purpose**: Enable session creation
  - _Requirements: FR-3 (AC-3.1)_

- [ ] 5. Implement SessionManager session operations
  - **File**: `src/cli/session-manager.ts` (continue)
  - Implement `getSession()` with expiration check
  - Implement `touchSession()` to update lastActivityAt
  - Implement `deleteSession()` with cleanup
  - **Purpose**: Complete session lifecycle management
  - _Requirements: FR-3 (AC-3.2, AC-3.4, AC-3.5)_

- [ ] 6. Implement SessionManager event buffering
  - **File**: `src/cli/session-manager.ts` (continue)
  - Implement `bufferEvent()` to store events with IDs
  - Implement `getEventsAfter()` for resumability
  - Add buffer size limit and retention cleanup
  - **Purpose**: Enable stream resumability
  - _Requirements: FR-5 (AC-5.1, AC-5.2, AC-5.3)_

- [ ] 7. Implement SessionManager cleanup
  - **File**: `src/cli/session-manager.ts` (continue)
  - Implement `cleanupExpiredSessions()` to remove stale sessions
  - Add periodic cleanup timer setup
  - Export `createSessionManager()` factory function
  - **Purpose**: Prevent memory leaks
  - _Requirements: NFR-1, NFR-3_

---

### Phase 3: SSE Stream Handler Enhancement

- [ ] 8. Extend SSEConnection interface with event ID support
  - **File**: `src/cli/sse-stream-handler.ts` (modify)
  - Add `id: string` (connection ID) to SSEConnection
  - Add `lastEventId: string` field
  - Add `eventCounter: number` field
  - **Purpose**: Enable event ID tracking per connection
  - _Requirements: FR-4 (AC-4.2, AC-4.3)_

- [ ] 9. Implement event ID generation in SSEStreamHandler
  - **File**: `src/cli/sse-stream-handler.ts` (modify)
  - Add `generateEventId()` private method
  - Update `sendEvent()` to use event IDs
  - Add `sendEventWithId()` method for explicit ID assignment
  - **Purpose**: Enable resumability via event IDs
  - _Requirements: FR-4 (AC-4.2), FR-5_

- [ ] 10. Add session-aware connection management
  - **File**: `src/cli/sse-stream-handler.ts` (modify)
  - Modify `handleSSERequest()` to accept session ID parameter
  - Add `getConnectionsBySessionId()` method
  - Add `sendToSession()` method for session-targeted messaging
  - **Purpose**: Enable session-based message routing
  - _Requirements: FR-3, FR-7 (AC-7.2)_

---

### Phase 4: Streamable HTTP Handler

- [ ] 11. Create StreamableHTTPHandler class skeleton
  - **File**: `src/cli/streamable-http-handler.ts` (new)
  - Create class with constructor accepting options
  - Inject SessionManager and SSEStreamHandler dependencies
  - Define method signatures: `handleGetRequest()`, `handlePostRequest()`, `handleDeleteRequest()`
  - **Purpose**: Establish main handler structure
  - _Requirements: FR-1, FR-2, FR-3_

- [ ] 12. Implement StreamableHTTPHandler.handleGetRequest
  - **File**: `src/cli/streamable-http-handler.ts` (continue)
  - Validate Accept header contains `text/event-stream`
  - Extract or create session ID
  - Handle `Last-Event-ID` header for resumability
  - Delegate to SSEStreamHandler
  - **Purpose**: Enable GET /mcp SSE stream establishment
  - _Requirements: FR-1 (AC-1.1, AC-1.2, AC-1.3), FR-5 (AC-5.1)_

- [ ] 13. Implement StreamableHTTPHandler.handlePostRequest - SSE mode
  - **File**: `src/cli/streamable-http-handler.ts` (continue)
  - Parse Accept header to determine response mode
  - If SSE mode: set `Content-Type: text/event-stream`
  - Send JSON-RPC response via SSE format with event ID
  - Close stream after response
  - **Purpose**: Enable POST /mcp with SSE response
  - _Requirements: FR-2 (AC-2.1, AC-2.2, AC-2.3)_

- [ ] 14. Implement StreamableHTTPHandler.handlePostRequest - JSON mode
  - **File**: `src/cli/streamable-http-handler.ts` (continue)
  - If JSON-only Accept: delegate to existing MCPHandler
  - Return `Content-Type: application/json`
  - Maintain backward compatibility
  - **Purpose**: Preserve existing JSON response behavior
  - _Requirements: FR-8 (AC-8.1, AC-8.2)_

- [ ] 15. Implement StreamableHTTPHandler.handleDeleteRequest
  - **File**: `src/cli/streamable-http-handler.ts` (continue)
  - Extract session ID from `Mcp-Session-Id` header
  - Validate session exists
  - Delete session and close associated SSE connections
  - Return 200 OK or 404 Not Found
  - **Purpose**: Enable client-initiated session termination
  - _Requirements: FR-3 (AC-3.5)_

- [ ] 16. Add session ID validation to StreamableHTTPHandler
  - **File**: `src/cli/streamable-http-handler.ts` (continue)
  - Implement `validateSessionId()` helper
  - Return 400 if missing (after init)
  - Return 404 if invalid/expired
  - Bind session to authenticated user
  - **Purpose**: Enforce session management rules
  - _Requirements: FR-3 (AC-3.3, AC-3.4), FR-6 (AC-6.3)_

---

### Phase 5: HTTP Server Integration

- [ ] 17. Add StreamableHTTPHandler initialization to HTTPServerWithConfig
  - **File**: `src/cli/http-server-with-config.ts` (modify)
  - Import StreamableHTTPHandler and dependencies
  - Initialize in constructor with config options
  - Add cleanup in stop() method
  - **Purpose**: Integrate handler with HTTP server
  - _Requirements: FR-1, FR-2_

- [ ] 18. Add GET /mcp route to handleRequest
  - **File**: `src/cli/http-server-with-config.ts` (modify)
  - Add case for `method === 'GET'` on `/mcp` path
  - Authenticate request before delegating
  - Call `streamableHandler.handleGetRequest()`
  - **Purpose**: Enable SSE connection endpoint
  - _Requirements: FR-1, FR-6 (AC-6.1, AC-6.2)_

- [ ] 19. Modify POST /mcp handling for dual response mode
  - **File**: `src/cli/http-server-with-config.ts` (modify)
  - Change POST /mcp to delegate to `streamableHandler.handlePostRequest()`
  - Handler internally decides JSON vs SSE based on Accept header
  - **Purpose**: Support both JSON and SSE response modes
  - _Requirements: FR-2, FR-8_

- [ ] 20. Add DELETE /mcp route to handleRequest
  - **File**: `src/cli/http-server-with-config.ts` (modify)
  - Add case for `method === 'DELETE'` on `/mcp` path
  - Call `streamableHandler.handleDeleteRequest()`
  - **Purpose**: Enable session termination endpoint
  - _Requirements: FR-3 (AC-3.5)_

---

### Phase 6: Configuration Extension

- [ ] 21. Extend RemoteConfig interface with streamableHttp options
  - **File**: `src/cli/remote-config-loader.ts` (modify)
  - Add `streamableHttp` section to `RemoteConfig` interface
  - Add default values for all options
  - **Purpose**: Enable configuration of Streamable HTTP features
  - _Requirements: NFR-1_

- [ ] 22. Add streamableHttp config documentation
  - **File**: `docs/CONFIGURATION.md` (modify)
  - Document `streamableHttp` section
  - Add examples for session timeout, buffer retention, etc.
  - **Purpose**: User documentation
  - _Requirements: NFR-4_

---

### Phase 7: Unit Tests

- [x] 23. Add SessionManager unit tests
  - **File**: `tests/unit/session-manager.test.ts` (new)
  - Test createSession() generates unique IDs
  - Test getSession() returns undefined for expired sessions
  - Test deleteSession() removes session
  - Test event buffering and retrieval
  - Test cleanup removes expired sessions
  - **Purpose**: Verify session management logic
  - _Requirements: FR-3, FR-5_

- [x] 24. Add SSEStreamHandler enhancement tests
  - **File**: `tests/unit/sse-stream-handler.test.ts` (modify)
  - Test event ID generation is unique per stream
  - Test sendEventWithId() includes event ID in SSE format
  - Test getConnectionsBySessionId() returns correct connections
  - **Purpose**: Verify SSE enhancement logic
  - _Requirements: FR-4_

- [x] 25. Add StreamableHTTPHandler unit tests - GET ✅
  - **File**: `tests/unit/streamable-http-handler.test.ts` (new)
  - Test handleGetRequest() with valid Accept header
  - Test handleGetRequest() returns 406 without text/event-stream
  - Test handleGetRequest() with Last-Event-ID for resumability
  - **Purpose**: Verify GET /mcp logic
  - _Requirements: FR-1, FR-5_

- [x] 26. Add StreamableHTTPHandler unit tests - POST ✅
  - **File**: `tests/unit/streamable-http-handler.test.ts` (continue)
  - Test handlePostRequest() with SSE Accept returns SSE stream
  - Test handlePostRequest() with JSON Accept returns JSON
  - Test session ID validation
  - **Purpose**: Verify POST /mcp logic
  - _Requirements: FR-2, FR-8_

- [x] 27. Add StreamableHTTPHandler unit tests - DELETE ✅
  - **File**: `tests/unit/streamable-http-handler.test.ts` (continue)
  - Test handleDeleteRequest() terminates valid session
  - Test handleDeleteRequest() returns 404 for invalid session
  - **Purpose**: Verify DELETE /mcp logic
  - _Requirements: FR-3_

---

### Phase 8: Integration Tests

- [x] 28. Add Streamable HTTP transport integration tests
  - **File**: `tests/integration/streamable-http-transport.test.ts` (new)
  - Test full SSE connection lifecycle (connect, receive, disconnect)
  - Test POST with SSE response mode end-to-end
  - Test session persistence across multiple requests
  - **Purpose**: Verify component integration
  - _Requirements: FR-1, FR-2, FR-3_

- [x] 29. Add authentication integration tests for SSE
  - **File**: `tests/integration/streamable-http-transport.test.ts` (continue)
  - Test unauthenticated GET /mcp returns 401
  - Test authenticated GET /mcp succeeds
  - Test session bound to user
  - **Purpose**: Verify authentication integration
  - _Requirements: FR-6_

- [x] 30. Add resumability integration tests
  - **File**: `tests/integration/streamable-http-transport.test.ts` (continue)
  - Test reconnection with Last-Event-ID replays events
  - Test events not replayed from different streams
  - **Purpose**: Verify resumability feature
  - _Requirements: FR-5_

---

### Phase 9: E2E Tests

- [x] 31. Add E2E test for Codex-like client connection ✅
  - **File**: `tests/e2e/streamable-http-e2e.test.ts` (new)
  - Simulate Codex connection flow:
    1. GET /mcp to establish SSE
    2. POST /mcp with InitializeRequest
    3. Verify Mcp-Session-Id in response
    4. POST /mcp with subsequent requests
  - **Purpose**: Validate real-world client flow
  - _Requirements: All FRs_

- [x] 32. Add E2E test for multiple streams ✅
  - **File**: `tests/e2e/streamable-http-e2e.test.ts` (continue)
  - Open multiple SSE connections
  - Verify messages routed to single stream
  - **Purpose**: Validate multi-stream behavior
  - _Requirements: FR-7_

---

### Phase 10: Tool Parity and Final Validation

- [x] 33. Update tool parity tests
  - **File**: `tests/unit/tool-parity.test.ts` (modify)
  - Verify Streamable HTTP endpoints available in remote mode
  - **Purpose**: Ensure feature parity
  - _Requirements: FR-8_

- [x] 34. Run full test suite and fix issues ✅
  - **Files**: All test files
  - Run `npm test`
  - Fix any failing tests
  - Verify coverage thresholds
  - **Purpose**: Final validation
  - _Requirements: All_

- [x] 35. Build and verify no TypeScript errors ✅
  - **Files**: All source files
  - Run `npm run build`
  - Fix any type errors
  - **Purpose**: Ensure production build succeeds
  - _Requirements: All_

---

## Task Dependencies

```
Phase 1 (Types): 1 → 2
Phase 2 (Session): 3 → 4 → 5 → 6 → 7
Phase 3 (SSE): 8 → 9 → 10
Phase 4 (Handler): 11 → 12 → 13 → 14 → 15 → 16
Phase 5 (Integration): 17 → 18 → 19 → 20

Dependencies across phases:
- Task 11 depends on Tasks 7, 10 (Session and SSE ready)
- Task 17 depends on Task 16 (Handler ready)
- Phase 6 can run in parallel after Phase 5
- Phase 7-9 depend on Phase 5

Phase 6 (Config): 21 → 22
Phase 7 (Unit Tests): 23, 24, 25 → 26 → 27
Phase 8 (Integration): 28 → 29 → 30
Phase 9 (E2E): 31 → 32
Phase 10 (Validation): 33 → 34 → 35
```

## Success Criteria

- [x] `GET /mcp` with `Accept: text/event-stream` returns SSE stream ✅
- [x] `POST /mcp` supports both JSON and SSE response modes ✅
- [x] Session management works correctly with `Mcp-Session-Id` header ✅
- [x] Reconnection with `Last-Event-ID` replays buffered events ✅
- [x] Authentication integrated with SSE connections ✅
- [x] Backward compatibility with existing JSON-only clients ✅
- [x] Codex can successfully connect to sage ✅
- [x] All tests pass (`npm test`) ✅ (107 suites, 2571 passed)
- [x] Build succeeds (`npm run build`) ✅

## Progress Tracking

- [x] Phase 1: Type Definitions (2 tasks) ✅
- [x] Phase 2: Session Manager (5 tasks) ✅
- [x] Phase 3: SSE Stream Handler Enhancement (3 tasks) ✅
- [x] Phase 4: Streamable HTTP Handler (6 tasks) ✅
- [x] Phase 5: HTTP Server Integration (4 tasks) ✅
- [x] Phase 6: Configuration Extension (2 tasks) ✅
- [x] Phase 7: Unit Tests (5 tasks) ✅
- [x] Phase 8: Integration Tests (3 tasks) ✅
- [x] Phase 9: E2E Tests (2 tasks) ✅
- [x] Phase 10: Tool Parity and Final Validation (3 tasks) ✅

**Total: 35/35 tasks completed** 🎉
