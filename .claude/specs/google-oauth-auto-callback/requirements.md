# Requirements Document: Google OAuth Auto-Callback

## Introduction

Google OAuth自動コールバック認証フローは、Claude Desktop/Claude Code内でシームレスにGoogle Calendar認証を完結させる機能です。ローカルHTTPサーバーを一時的に起動し、OAuth認証コードを自動取得してトークン交換まで行います。

現状、認証URLは生成できますが、認証コードの取得とトークン交換が手動（未実装）のため、ユーザー体験が悪い状態です。

## Alignment with Product Vision

**product.md との整合性:**
- **Calendar Integration**: Google Calendar統合の完全なサポート（product.md Section 3）
- **Platform Support**: Linux/Windowsでの唯一のカレンダーソース（product.md Section 6）
- **Remote Access**: OAuth 2.1認証の基盤強化（product.md Section 5）

この機能により、非macOSユーザーもワンアクションでGoogle Calendar連携が可能になります。

## Requirements

### FR-1: MCP Tool - authenticate_google

**User Story:** As a sage user, I want to authenticate with Google Calendar using a single MCP tool command, so that I don't need to manually copy authorization codes.

#### Acceptance Criteria

1. WHEN user calls `authenticate_google` tool THEN system SHALL start a local HTTP server on an available port
2. WHEN local HTTP server starts THEN system SHALL generate authorization URL with the server's callback URL
3. WHEN authorization URL is generated THEN system SHALL attempt to open the URL in the default browser
4. IF browser cannot be opened automatically THEN system SHALL return the URL for manual opening
5. WHEN Google redirects to callback URL with authorization code THEN system SHALL capture the code automatically
6. WHEN authorization code is captured THEN system SHALL exchange it for tokens using PKCE verification
7. WHEN tokens are received THEN system SHALL store them encrypted using existing EncryptionService
8. WHEN authentication completes successfully THEN system SHALL shut down the local HTTP server
9. WHEN authentication completes THEN system SHALL return success status with token expiry information

### FR-2: Local HTTP Callback Server

**User Story:** As a developer, I want a temporary local HTTP server to handle OAuth callbacks, so that the authentication flow can be automated.

#### Acceptance Criteria

1. WHEN server starts THEN system SHALL find an available port (default: 3000, fallback to random)
2. WHEN server starts THEN system SHALL listen only on localhost (127.0.0.1)
3. WHEN GET request arrives at /oauth/callback with `code` parameter THEN system SHALL extract the authorization code
4. WHEN GET request arrives at /oauth/callback with `error` parameter THEN system SHALL capture the error
5. WHEN callback is received THEN system SHALL respond with a user-friendly HTML page indicating success/failure
6. WHEN callback is processed THEN system SHALL emit an event to notify the main flow
7. WHEN timeout (default: 5 minutes) is reached without callback THEN system SHALL shut down and return timeout error
8. WHEN server shuts down THEN system SHALL release the port immediately

### FR-3: Browser Opening

**User Story:** As a user, I want the authorization URL to open automatically in my browser, so that I can authenticate with minimal effort.

#### Acceptance Criteria

1. WHEN authorization URL is ready THEN system SHALL attempt to open it using platform-appropriate command
2. IF platform is macOS THEN system SHALL use `open` command
3. IF platform is Linux THEN system SHALL use `xdg-open` command
4. IF platform is Windows THEN system SHALL use `start` command
5. IF browser opening fails THEN system SHALL return the URL in the response for manual copying
6. WHEN browser is opened THEN system SHALL NOT block the main process

### FR-4: Token Exchange and Storage

**User Story:** As a user, I want my authentication tokens to be securely stored, so that I don't need to re-authenticate frequently.

#### Acceptance Criteria

1. WHEN authorization code is received THEN system SHALL exchange it for tokens using GoogleOAuthHandler.exchangeCodeForTokens()
2. WHEN tokens are received THEN system SHALL store them using GoogleOAuthHandler.storeTokens()
3. WHEN tokens are stored THEN system SHALL be encrypted using AES-256-GCM via EncryptionService
4. IF token exchange fails THEN system SHALL return a descriptive error message
5. IF tokens already exist THEN system SHALL prompt user to confirm re-authentication or skip

### FR-5: Error Handling and Recovery

**User Story:** As a user, I want clear error messages when authentication fails, so that I can troubleshoot issues.

#### Acceptance Criteria

1. IF GOOGLE_CLIENT_ID is not set THEN system SHALL return error with setup instructions
2. IF GOOGLE_CLIENT_SECRET is not set THEN system SHALL return error with setup instructions
3. IF user denies access in Google consent screen THEN system SHALL return "access_denied" error
4. IF network error occurs THEN system SHALL return error with retry suggestion
5. IF server cannot bind to any port THEN system SHALL return error with port conflict details
6. WHEN any error occurs THEN system SHALL ensure server is shut down properly

## Non-Functional Requirements

### Performance
- NFR-1: Server startup time SHALL be < 500ms
- NFR-2: Token exchange SHALL complete within 10 seconds
- NFR-3: Server shutdown SHALL complete within 1 second

### Security
- NFR-4: Server SHALL only accept connections from localhost
- NFR-5: PKCE S256 SHALL be used for all OAuth flows
- NFR-6: Authorization code SHALL be used only once
- NFR-7: Server SHALL not log sensitive data (tokens, codes)

### Reliability
- NFR-8: Server SHALL handle concurrent callback attempts gracefully
- NFR-9: Server SHALL recover from port binding failures
- NFR-10: Authentication state SHALL be preserved across retries

### Usability
- NFR-11: Success/error HTML page SHALL be clear and informative
- NFR-12: Tool response SHALL include next steps on success
- NFR-13: Timeout duration SHALL be configurable (default: 5 minutes)
