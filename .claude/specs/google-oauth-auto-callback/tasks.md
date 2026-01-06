# Implementation Plan: Google OAuth Auto-Callback

## Task Overview

Google OAuth自動コールバック機能を3つの新規コンポーネント（OAuthCallbackServer、BrowserOpener、authenticate_googleツール）として実装し、既存のGoogleOAuthHandlerと統合します。

## Steering Document Compliance

- **structure.md**: ファイル命名はkebab-case、テストはtests/unit/配下に配置
- **tech.md**: TypeScript strict mode、Zod検証、Jest テスト

## Atomic Task Requirements

**各タスクの基準:**
- **File Scope**: 1-3ファイルに限定
- **Time Boxing**: 15-30分で完了可能
- **Single Purpose**: 1つのテスト可能な成果
- **Specific Files**: 具体的なファイルパスを指定

## Tasks

### Phase A: Core Components

- [x] 1. Create OAuthCallbackServer class with basic server lifecycle
  - File: `src/oauth/oauth-callback-server.ts`
  - Implement constructor with OAuthCallbackServerOptions interface
  - Implement `start()` method to bind to port and return callbackUrl
  - Implement `shutdown()` method to close server and release port
  - Implement `isRunning()` method to check server status
  - Use Node.js `http` module, extend `EventEmitter`
  - Purpose: Establish server lifecycle foundation
  - _Leverage: Node.js http module pattern_
  - _Requirements: FR-2.1, FR-2.2, FR-2.8_

- [x] 2. Add callback handling to OAuthCallbackServer
  - File: `src/oauth/oauth-callback-server.ts` (continue from task 1)
  - Implement GET /oauth/callback route handler
  - Parse `code` and `error` query parameters using URL API
  - Implement `waitForCallback()` method returning Promise<CallbackResult>
  - Emit 'callback' event when callback is received
  - Purpose: Enable OAuth callback capture
  - _Leverage: URL API for query parsing_
  - _Requirements: FR-2.3, FR-2.4, FR-2.6_

- [x] 3. Add timeout and HTML response to OAuthCallbackServer
  - File: `src/oauth/oauth-callback-server.ts` (continue from task 2)
  - Add timeout mechanism (default: 5 minutes) to `waitForCallback()`
  - Create success HTML response template
  - Create error HTML response template
  - Return appropriate HTML based on callback result
  - Purpose: Complete user-facing callback experience
  - _Requirements: FR-2.5, FR-2.7, NFR-11_

- [x] 4. Add port fallback logic to OAuthCallbackServer
  - File: `src/oauth/oauth-callback-server.ts` (continue from task 3)
  - Modify `start()` to try ports 3000-3010 sequentially on EADDRINUSE
  - Add error handling for all ports exhausted
  - Ensure only localhost binding (127.0.0.1)
  - Purpose: Handle port conflicts gracefully
  - _Requirements: FR-2.1, FR-5.5, NFR-4, NFR-9_

- [x] 5. Create BrowserOpener utility
  - File: `src/utils/browser-opener.ts`
  - Detect platform (darwin/linux/win32) using `process.platform`
  - Implement `openBrowser(url: string)` function
  - Use `open` for macOS, `xdg-open` for Linux, `start` for Windows
  - Return `BrowserOpenResult` with success/error
  - Use `child_process.exec` with proper error handling
  - Purpose: Enable cross-platform browser opening
  - _Leverage: Platform detection pattern from src/platform/detector.ts_
  - _Requirements: FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-3.5, FR-3.6_

### Phase B: Tool Handler

- [x] 6. Create OAuthToolsContext and tool exports
  - File: `src/tools/oauth/index.ts`
  - Define OAuthToolsContext interface with getGoogleOAuthHandler method
  - Export context type and handler functions
  - Purpose: Establish OAuth tools module structure
  - _Leverage: Pattern from src/tools/setup/index.ts_
  - _Requirements: FR-1_

- [x] 7. Create authenticate_google tool handler - check existing tokens
  - File: `src/tools/oauth/authenticate-google.ts`
  - Define AuthenticateGoogleArgs schema with Zod (force, timeout)
  - Define AuthenticateGoogleResult interface
  - Implement check for existing tokens via GoogleOAuthHandler.getTokens()
  - Return early if tokens exist and force=false
  - Purpose: Handle already-authenticated case
  - _Leverage: GoogleOAuthHandler.getTokens()_
  - _Requirements: FR-4.5, FR-1.1_

- [x] 8. Add OAuth flow orchestration to authenticate_google handler
  - File: `src/tools/oauth/authenticate-google.ts` (continue from task 7)
  - Check environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  - Create OAuthCallbackServer and start it
  - Generate authorization URL via GoogleOAuthHandler.getAuthorizationUrl()
  - Open browser via BrowserOpener.openBrowser()
  - Purpose: Initiate OAuth flow
  - _Leverage: OAuthCallbackServer, BrowserOpener, GoogleOAuthHandler_
  - _Requirements: FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-5.1, FR-5.2_

- [x] 9. Complete authenticate_google handler - token exchange and storage
  - File: `src/tools/oauth/authenticate-google.ts` (continue from task 8)
  - Wait for callback via OAuthCallbackServer.waitForCallback()
  - Exchange code for tokens via GoogleOAuthHandler.exchangeCodeForTokens()
  - Store tokens via GoogleOAuthHandler.storeTokens()
  - Shutdown server and return success response
  - Handle errors and ensure server cleanup
  - Purpose: Complete OAuth flow with token persistence
  - _Leverage: GoogleOAuthHandler.exchangeCodeForTokens(), storeTokens()_
  - _Requirements: FR-1.5, FR-1.6, FR-1.7, FR-1.8, FR-1.9, FR-4.1, FR-4.2, FR-4.3, FR-4.4_

### Phase C: Integration

- [x] 10. Register authenticate_google tool in index.ts
  - File: `src/index.ts`
  - Import OAuthToolsContext and handleAuthenticateGoogle from tools/oauth
  - Add createOAuthToolsContext function
  - Register "authenticate_google" tool with schema and handler
  - Purpose: Make tool available via MCP
  - _Leverage: Pattern from existing tool registrations in index.ts_
  - _Requirements: FR-1_

- [x] 11. Export OAuthCallbackServer from oauth module
  - File: `src/oauth/index.ts`
  - Add export for OAuthCallbackServer class
  - Add export for related types (OAuthCallbackServerOptions, CallbackResult)
  - Purpose: Enable module access to callback server
  - _Requirements: FR-2_

### Phase D: Unit Tests

- [x] 12. Create OAuthCallbackServer unit tests - lifecycle
  - File: `tests/unit/oauth/oauth-callback-server.test.ts`
  - Test server start/shutdown lifecycle
  - Test isRunning() state changes
  - Test port binding and callbackUrl generation
  - Test server only binds to localhost
  - Purpose: Verify server lifecycle correctness
  - _Leverage: Jest, existing test patterns_
  - _Requirements: FR-2.1, FR-2.2, FR-2.8, NFR-4_

- [x] 13. Create OAuthCallbackServer unit tests - callback handling
  - File: `tests/unit/oauth/oauth-callback-server.test.ts` (continue from task 12)
  - Test successful callback with code parameter
  - Test error callback with error parameter
  - Test callback HTML responses
  - Test waitForCallback() promise resolution
  - Purpose: Verify callback handling correctness
  - _Requirements: FR-2.3, FR-2.4, FR-2.5, FR-2.6_

- [x] 14. Create OAuthCallbackServer unit tests - timeout and port fallback
  - File: `tests/unit/oauth/oauth-callback-server.test.ts` (continue from task 13)
  - Test timeout triggers after specified duration
  - Test port fallback when primary port is in use
  - Test error when all ports exhausted
  - Purpose: Verify edge case handling
  - _Requirements: FR-2.7, NFR-9_

- [x] 15. Create BrowserOpener unit tests
  - File: `tests/unit/utils/browser-opener.test.ts`
  - Mock child_process.exec
  - Test correct command selection per platform
  - Test success result on command success
  - Test error result on command failure
  - Purpose: Verify cross-platform browser opening
  - _Leverage: Jest mocking_
  - _Requirements: FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-3.5_

- [x] 16. Create authenticate_google handler unit tests
  - File: `tests/unit/tools/oauth/authenticate-google.test.ts`
  - Mock GoogleOAuthHandler, OAuthCallbackServer, BrowserOpener
  - Test early return when tokens exist
  - Test force=true triggers re-authentication
  - Test error when environment variables missing
  - Test full flow with mocked dependencies
  - Test error handling and server cleanup
  - Purpose: Verify tool handler correctness
  - _Leverage: Jest mocking_
  - _Requirements: FR-1.1-9, FR-4.5, FR-5.1-6_

### Phase E: Integration Tests

- [x] 17. Create Google OAuth flow integration test
  - File: `tests/integration/google-oauth-flow.test.ts`
  - Create real OAuthCallbackServer instance
  - Simulate HTTP callback request with test code
  - Verify callback result is correctly captured
  - Test server shutdown after callback
  - Purpose: Verify component integration
  - _Leverage: Jest, http module for test requests_
  - _Requirements: FR-2, FR-4_
