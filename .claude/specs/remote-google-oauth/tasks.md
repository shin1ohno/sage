# Tasks: Remote Google OAuth Authentication

## Steering Document Compliance

このタスクリストは以下の設計パターンを踏襲：
- 既存の `GoogleOAuthHandler` パターンを継承
- `EncryptionService` を使用した暗号化保存
- HTTPサーバーのルーティングパターンを継承
- 既存の PKCE 実装 (`src/oauth/pkce.ts`) を再利用

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Clear Verification**: Explicit test command or verification step
- **Self-Contained**: All needed context included in task description

## Task Overview

| Task ID | Title | Priority | Dependencies | Files |
|---------|-------|----------|--------------|-------|
| T-1a | PendingGoogleAuthStore core methods | P0 | None | 1 |
| T-1b | PendingGoogleAuthStore persistence | P0 | T-1a | 1 |
| T-2a | GoogleOAuthCallbackHandler parse and validate | P0 | T-1b | 1 |
| T-2b | GoogleOAuthCallbackHandler token exchange | P0 | T-2a | 1 |
| T-2c | GoogleOAuthCallbackHandler HTML templates | P0 | T-2b | 1 |
| T-3 | Extend authenticate_google for remote mode | P0 | T-1b | 1 |
| T-4 | Integrate callback endpoint into HTTP server | P0 | T-2c, T-3 | 1 |
| T-5 | Update src/oauth/index.ts exports | P0 | T-1b, T-2c | 1 |
| T-6 | Unit tests for PendingGoogleAuthStore | P1 | T-1b | 1 |
| T-7 | Unit tests for GoogleOAuthCallbackHandler | P1 | T-2c | 1 |
| T-8 | Unit tests for remote mode | P1 | T-3 | 1 |
| T-9 | Update README.md documentation | P1 | T-4 | 1 |
| T-10 | Integration test for full OAuth flow | P2 | T-4 | 1 |

---

## Phase 1: Core Implementation

- [x] **T-1a. Create PendingGoogleAuthStore core methods**
  - File: `src/oauth/pending-google-auth-store.ts`
  - Implement `PendingGoogleAuth` interface with state, codeVerifier, redirectUri, createdAt, expiresAt
  - Implement `create(redirectUri)` - returns state, codeVerifier, codeChallenge
  - Implement `findByState(state)` - returns session or null
  - Implement `remove(state)` - deletes session
  - Use `Map<string, PendingGoogleAuth>` for in-memory storage
  - Use `randomUUID()` from crypto for state generation
  - Default expiration: 10 minutes
  - _Leverage: `src/oauth/pkce.ts` (generateCodeVerifier, generateCodeChallenge)_
  - _Requirements: FR-3_
  - Verify: `npm run build` succeeds

- [x] **T-1b. Add PendingGoogleAuthStore persistence and cleanup**
  - File: `src/oauth/pending-google-auth-store.ts`
  - Implement `persist()` - save to `~/.sage/google_pending_auth.enc`
  - Implement `load()` - restore from file on startup
  - Implement `cleanupExpired()` - remove sessions past expiresAt
  - Use `EncryptionService` for encryption (same pattern as google_oauth_tokens.enc)
  - Add cleanup interval (5 minutes)
  - _Leverage: `src/oauth/encryption-service.ts`, `src/calendar/google-token-storage.ts` (pattern reference)_
  - _Requirements: FR-3, NFR-1_
  - Verify: `npm run build` succeeds

- [x] **T-2a. Create GoogleOAuthCallbackHandler parse and validate**
  - File: `src/oauth/google-oauth-callback-handler.ts`
  - Create `GoogleOAuthCallbackHandler` class with constructor accepting `PendingGoogleAuthStore` and `GoogleOAuthHandler`
  - Implement `parseCallbackParams(url)` - extract code, state, error from query string
  - Implement validation: check state exists in store, check session not expired
  - Export types: `GoogleOAuthCallbackHandlerOptions`
  - _Leverage: `src/oauth/pending-google-auth-store.ts`_
  - _Requirements: FR-1, NFR-1_
  - Verify: `npm run build` succeeds

- [x] **T-2b. Add GoogleOAuthCallbackHandler token exchange**
  - File: `src/oauth/google-oauth-callback-handler.ts`
  - Implement `exchangeCodeForTokens(code, session)` - use GoogleOAuthHandler
  - Call `googleOAuthHandler.exchangeAuthorizationCode()` with code and code_verifier
  - Store tokens using `googleOAuthHandler.storeTokens()`
  - Remove session from store after successful exchange
  - Handle token exchange errors
  - _Leverage: `src/oauth/google-oauth-handler.ts` (exchangeAuthorizationCode, storeTokens)_
  - _Requirements: FR-4, NFR-1_
  - Verify: `npm run build` succeeds

- [x] **T-2c. Add GoogleOAuthCallbackHandler HTML templates and main handler**
  - File: `src/oauth/google-oauth-callback-handler.ts`
  - Implement `renderSuccessPage(res)` - HTML with "認証が完了しました" message
  - Implement `renderErrorPage(res, error)` - HTML with error message in Japanese
  - Implement main `handleCallback(req, res)` orchestrating the full flow
  - Set Content-Type to text/html, charset=utf-8
  - Return HTTP 200 for both success and error (browser display)
  - _Requirements: FR-1, NFR-2_
  - Verify: `npm run build` succeeds

- [x] **T-3. Extend authenticate_google for remote mode**
  - File: `src/tools/oauth/authenticate-google.ts`
  - Add `isRemoteMode()` function: returns true if GOOGLE_REDIRECT_URI doesn't contain 'localhost'
  - Modify `handleAuthenticateGoogle` to check mode
  - Remote mode: create session via PendingGoogleAuthStore, return authorizationUrl to user
  - Add response fields: authorizationUrl, state, pendingAuth, expiresIn
  - Subsequent calls: check if session was completed, return authenticated status
  - Maintain backward compatibility: local mode unchanged
  - _Leverage: `src/oauth/pending-google-auth-store.ts`, `src/oauth/google-oauth-handler.ts`_
  - _Requirements: FR-2, FR-5, NFR-4_
  - Verify: `npm run build` succeeds

- [x] **T-4. Integrate callback endpoint into HTTP server**
  - File: `src/cli/http-server-with-config.ts`
  - Import `PendingGoogleAuthStore` and `GoogleOAuthCallbackHandler`
  - Initialize store in `start()` when GOOGLE_CLIENT_ID/SECRET are set
  - Add route: `GET /oauth/google/callback` → `googleOAuthCallbackHandler.handleCallback()`
  - Callback endpoint does NOT require JWT authentication
  - Return 503 if Google OAuth not configured
  - Export `pendingGoogleAuthStore` for use by tools
  - _Leverage: existing route handling pattern at line 282-372_
  - _Requirements: FR-1_
  - Verify: `npm run build` succeeds, server starts without error

- [x] **T-5. Update src/oauth/index.ts exports**
  - File: `src/oauth/index.ts`
  - Add export for `PendingGoogleAuthStore` and related types
  - Add export for `GoogleOAuthCallbackHandler` and `GoogleOAuthCallbackHandlerOptions`
  - _Requirements: (internal)_
  - Verify: `npm run build` succeeds

---

## Phase 2: Testing

- [x] **T-6. Add unit tests for PendingGoogleAuthStore**
  - File: `src/oauth/__tests__/pending-google-auth-store.test.ts`
  - Test: create() returns state (UUID), codeVerifier, codeChallenge
  - Test: findByState() returns correct session
  - Test: findByState() returns null for unknown state
  - Test: remove() deletes session
  - Test: cleanupExpired() removes only expired sessions
  - Test: persist() and load() round-trip
  - Use jest mocks for file system operations
  - _Requirements: FR-3_
  - Verify: `npm test -- pending-google-auth-store` passes

- [x] **T-7. Add unit tests for GoogleOAuthCallbackHandler**
  - File: `src/oauth/__tests__/google-oauth-callback-handler.test.ts`
  - Test: parseCallbackParams extracts code, state, error
  - Test: Missing state returns error page
  - Test: Unknown state returns "session not found" error
  - Test: Expired session returns "session expired" error
  - Test: Successful exchange renders success page
  - Test: Failed token exchange renders error page
  - Test: Session removed after successful exchange
  - _Requirements: FR-1, FR-4_
  - Verify: `npm test -- google-oauth-callback-handler` passes

- [x] **T-8. Add unit tests for authenticate_google remote mode**
  - File: `src/tools/oauth/__tests__/authenticate-google.test.ts`
  - Test: isRemoteMode() returns true for non-localhost URI
  - Test: isRemoteMode() returns false for localhost URI
  - Test: Remote mode returns authorization URL
  - Test: Remote mode creates pending session
  - Test: Subsequent call detects completed auth
  - Test: Local mode behavior unchanged
  - _Requirements: FR-2, FR-5, NFR-4_
  - Verify: `npm test -- authenticate-google` passes

---

## Phase 3: Documentation

- [x] **T-9. Update README.md with OAuth setup documentation**
  - File: `README.md`
  - Add section: "## Google Calendar 連携設定"
  - Subsection: "### 1. Google Cloud Console でOAuthクライアントを作成"
    - アプリケーションの種類: **Webアプリケーション**
    - 承認済みのリダイレクトURI設定方法
  - Subsection: "### 2. 環境変数の設定"
    - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
  - Subsection: "### 3. 認証の実行"
    - authenticate_google の使用方法
  - Subsection: "### トラブルシューティング"
    - redirect_uri_mismatch, セッション期限切れ
  - _Requirements: FR-6, AC-5_
  - Verify: Documentation is clear and complete

---

## Phase 4: Integration

- [x] **T-10. Add integration test for full OAuth flow**
  - File: `src/oauth/__tests__/remote-oauth-integration.test.ts`
  - Setup: Start HTTP server with test config
  - Test flow:
    1. Call authenticate_google → get authorization URL
    2. Simulate callback to /oauth/google/callback with mock code
    3. Verify tokens are stored
    4. Call authenticate_google again → verify authenticated
  - Use mock Google token endpoint
  - Verify PKCE flow end-to-end
  - Verify session cleanup after success
  - _Requirements: All_
  - Verify: `npm test -- remote-oauth-integration` passes

---

## Execution Order

```
Phase 1 (Sequential):
T-1a → T-1b → T-2a → T-2b → T-2c → T-3 → T-4 → T-5

Phase 2 (Parallel after T-5):
T-6, T-7, T-8 (can run in parallel)

Phase 3 (After Phase 2):
T-9

Phase 4 (After Phase 3):
T-10
```

## Notes

- 既存の `GoogleOAuthHandler` は変更不要（token exchange ロジックを再利用）
- `EncryptionService` の使用方法は既存の `google_oauth_tokens.enc` 保存処理を参考にする
- HTMLテンプレートはインライン文字列として実装（外部ファイル不要）
- 環境変数 `GOOGLE_AUTH_SESSION_TIMEOUT` でセッション有効期限をカスタマイズ可能
