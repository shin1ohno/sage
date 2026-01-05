# Requirements Document

## Feature Name
OAuth Token Persistence

## Feature Description
Persist OAuth 2.1 server state (refresh tokens, client registrations, and user sessions) to filesystem storage to prevent token invalidation and forced re-authentication after server restarts.

## Business Goals
- Improve user experience by eliminating forced re-authentication on server restarts
- Maintain security while providing seamless OAuth token continuity
- Enable production-ready OAuth server deployment with restart resilience

## User Stories

### US-1: Persistent Refresh Tokens
**As a** Claude Code user connecting to remote sage MCP server
**I want** my refresh tokens to survive server restarts
**So that** I don't have to re-authenticate every time the server is restarted

**Acceptance Criteria:**
- WHEN the OAuth server restarts
- THEN existing refresh tokens remain valid
- AND I can use my refresh token to get new access tokens
- AND the refresh token expiry is preserved correctly

### US-2: Persistent Client Registrations
**As a** remote sage MCP server administrator
**I want** OAuth client registrations to persist across restarts
**So that** users don't need to re-register their clients after server maintenance

**Acceptance Criteria:**
- WHEN a client is registered via `/oauth/register` endpoint
- THEN the client credentials are stored persistently
- AND the client can authenticate immediately after server restart
- AND existing client secrets remain valid

### US-3: Graceful Session Recovery
**As a** Claude Code user with an active session
**I want** my session to be recognized after server restart
**So that** I can continue working without interruption

**Acceptance Criteria:**
- WHEN I have an active session before server restart
- AND the session has not expired
- THEN my session is still valid after restart
- AND I don't see authentication errors

## Functional Requirements

### FR-1: Refresh Token Storage
**Priority:** High
**Description:** Store refresh tokens in encrypted filesystem storage

**Details:**
- Store refresh tokens in `~/.sage/oauth_refresh_tokens.enc`
- Encrypt tokens using AES-256-GCM
- Include metadata: userId, clientId, scope, expiresAt, issuedAt
- Support atomic read/write operations
- Handle concurrent access from multiple requests

**Dependencies:** None

### FR-2: Client Store Persistence
**Priority:** High
**Description:** Persist OAuth client registrations to filesystem

**Details:**
- Store client data in `~/.sage/oauth_clients.enc`
- Encrypt client secrets using AES-256-GCM
- Include: clientId, clientSecret, redirectUris, grantTypes, createdAt
- Support dynamic client registration
- Validate stored data integrity on load

**Dependencies:** None

### FR-3: Session Store Persistence
**Priority:** Medium
**Description:** Persist user sessions to filesystem storage

**Details:**
- Store sessions in `~/.sage/oauth_sessions.enc`
- Encrypt session data using AES-256-GCM
- Include: sessionId, userId, createdAt, expiresAt
- Automatically clean up expired sessions on load
- Limit maximum stored sessions (e.g., 100)

**Dependencies:** None

### FR-4: Encryption Key Management
**Priority:** High
**Description:** Secure encryption key derivation and storage

**Details:**
- Use `SAGE_ENCRYPTION_KEY` environment variable if provided
- Fall back to server-generated persistent key stored at `~/.sage/oauth_encryption_key`
- Generate key using crypto.randomBytes(32)
- Prevent key regeneration on subsequent server starts
- Warn if using default/weak key

**Dependencies:** None

### FR-5: Storage Migration
**Priority:** Low
**Description:** Migrate existing in-memory data on first implementation

**Details:**
- Detect first run after upgrade
- No migration needed (in-memory data is ephemeral)
- Log information about new persistent storage location
- Document that users will need to re-authenticate once after upgrade

**Dependencies:** FR-1, FR-2, FR-3

### FR-6: Automatic Data Loading
**Priority:** High
**Description:** Load persisted data on server startup

**Details:**
- Load refresh tokens from storage before handling first request
- Load client registrations before handling first request
- Load sessions before handling first request
- Handle corrupted data gracefully (log error, start with empty state)
- Validate expiry times and discard expired entries

**Dependencies:** FR-1, FR-2, FR-3

## Non-Functional Requirements

### NFR-1: Performance
- Data loading must complete within 500ms on server startup
- File I/O operations should not block request handling
- Use asynchronous file operations (fs/promises)
- Cache decrypted data in memory for fast access

### NFR-2: Security
- All stored data must be encrypted with AES-256-GCM
- Encryption key must be at least 256 bits
- File permissions must be restricted (600 on Unix systems)
- No sensitive data in plain text logs
- Support key rotation (future enhancement)

### NFR-3: Reliability
- Atomic file writes to prevent corruption
- Graceful degradation if storage is unavailable
- Automatic recovery from corrupted files
- No data loss during concurrent writes

### NFR-4: Maintainability
- Abstract storage interface for future database support
- Clear separation between storage and business logic
- Comprehensive error logging
- Unit tests for encryption/decryption
- Integration tests for persistence

### NFR-5: Compatibility
- Work on Linux, macOS, and Windows
- Use Node.js built-in crypto module only
- No external database dependencies
- Backward compatible with existing OAuth implementation

## Technical Constraints

### TC-1: File System Requirements
- Server must have write access to `~/.sage/` directory
- Storage path must support file locking (for atomic writes)
- Minimum 10MB free disk space for OAuth data

### TC-2: Encryption Requirements
- Use Node.js crypto module for AES-256-GCM
- Derive keys using scrypt (already used in google-oauth-handler.ts)
- Include authentication tags for integrity verification

### TC-3: Existing Code Reuse
- Reuse encryption/decryption logic from GoogleOAuthHandler
- Follow existing file storage patterns in sage
- Maintain compatibility with existing OAuth server API

## Acceptance Criteria

### AC-1: Refresh Token Persistence
- [ ] Refresh tokens are stored encrypted in `~/.sage/oauth_refresh_tokens.enc`
- [ ] Tokens can be loaded successfully after server restart
- [ ] Token expiry is correctly preserved across restarts
- [ ] Expired tokens are automatically cleaned up on load

### AC-2: Client Persistence
- [ ] Client registrations are stored in `~/.sage/oauth_clients.enc`
- [ ] Clients can authenticate immediately after server restart
- [ ] Client secrets remain valid across restarts
- [ ] Dynamic client registration works as expected

### AC-3: Session Persistence
- [ ] Active sessions are stored in `~/.sage/oauth_sessions.enc`
- [ ] Sessions are recognized after server restart (if not expired)
- [ ] Expired sessions are cleaned up automatically
- [ ] Session limit (100 max) is enforced

### AC-4: Security
- [ ] All stored files use 600 permissions (Unix)
- [ ] Data is encrypted with AES-256-GCM
- [ ] Encryption key is properly managed
- [ ] No sensitive data appears in logs

### AC-5: Error Handling
- [ ] Corrupted files don't crash the server
- [ ] Missing files are handled gracefully
- [ ] Encryption errors are logged appropriately
- [ ] Server starts successfully even if storage fails

## Success Metrics
- Zero forced re-authentications after server restart (for valid tokens)
- 100% of refresh tokens survive server restart
- <500ms startup time increase for data loading
- Zero security vulnerabilities in encryption implementation

## Out of Scope
- Database storage (future enhancement)
- Multi-server synchronization
- Authorization code persistence (short-lived, not needed)
- Access token persistence (short-lived, will be regenerated)
- Key rotation UI
- Storage encryption key recovery mechanism
