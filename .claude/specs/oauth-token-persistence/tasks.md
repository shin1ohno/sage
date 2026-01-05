# Implementation Tasks: OAuth Token Persistence

## Task Overview

This document breaks down the OAuth Token Persistence implementation into atomic, testable tasks. Tasks are organized by component and prioritized for systematic implementation.

## Task Status Legend

- [ ] Not started
- [x] Completed
- [~] In progress

## Phase 1: Foundation (EncryptionService)

### Task 1.1: Create EncryptionService Class
**Priority**: P0 (Critical - foundation for all persistence)
**Estimated Effort**: 2-3 hours
**File**: `src/oauth/encryption-service.ts`

**Description**:
Create EncryptionService class that handles AES-256-GCM encryption/decryption and key management.

**Implementation Details**:
- Extract and refactor encryption logic from `GoogleOAuthHandler`
- Implement `EncryptionService` class with methods:
  - `initialize()` - Load or generate encryption key
  - `encrypt(data: string)` - Encrypt using AES-256-GCM
  - `decrypt(encryptedData: string)` - Decrypt data
  - `encryptToFile(data, filePath)` - Atomic file write
  - `decryptFromFile(filePath)` - Read and decrypt
- Support key loading priority:
  1. `SAGE_ENCRYPTION_KEY` environment variable
  2. `~/.sage/oauth_encryption_key` file
  3. Generate new key and save
- Use scrypt for key derivation
- Format: `salt:iv:authTag:encrypted`

**Acceptance Criteria**:
- [x] EncryptionService class created with all methods
- [x] Key loading follows priority order
- [x] Warning logged if using auto-generated key
- [x] Files created with 600 permissions
- [x] Atomic writes using temp file + rename

**Testing**:
- Unit test: encrypt/decrypt round-trip
- Unit test: key initialization from env var
- Unit test: key initialization from file
- Unit test: key generation and storage
- Unit test: file permissions verification

**Dependencies**: None

---

### Task 1.2: Unit Tests for EncryptionService
**Priority**: P0 (Critical - verify foundation security)
**Estimated Effort**: 1-2 hours
**File**: `tests/unit/oauth/encryption-service.test.ts`

**Description**:
Create comprehensive unit tests for EncryptionService to verify encryption correctness and security.

**Test Cases**:
1. **Encrypt/Decrypt Round-Trip**:
   - Encrypt plain text
   - Decrypt encrypted text
   - Verify original data restored

2. **Key Initialization - Environment Variable**:
   - Set `SAGE_ENCRYPTION_KEY`
   - Initialize service
   - Verify key used from env var

3. **Key Initialization - File**:
   - Create key file at `~/.sage/oauth_encryption_key`
   - Initialize service
   - Verify key loaded from file

4. **Key Generation**:
   - No env var, no file
   - Initialize service
   - Verify key generated and saved
   - Verify file permissions 600

5. **File Encryption/Decryption**:
   - Encrypt data to file
   - Decrypt data from file
   - Verify data integrity

6. **Error Handling**:
   - Corrupted encrypted data
   - Invalid format
   - Missing file (should return null)

**Acceptance Criteria**:
- [x] All 6 test suites pass
- [x] 100% code coverage for EncryptionService
- [x] Tests verify security properties (key derivation, auth tags)

**Dependencies**: Task 1.1

---

## Phase 2: Persistent Stores Implementation

### Task 2.1: Create PersistentRefreshTokenStore
**Priority**: P0 (Critical - core functionality)
**Estimated Effort**: 3-4 hours
**File**: `src/oauth/persistent-refresh-token-store.ts`

**Description**:
Implement PersistentRefreshTokenStore that extends refresh token storage with encrypted filesystem persistence.

**Implementation Details**:
- Implement `RefreshTokenStore` interface
- In-memory Map for fast access
- Storage path: `~/.sage/oauth_refresh_tokens.enc`
- Methods to implement:
  - `loadFromStorage()` - Load from encrypted file, filter expired tokens
  - `saveToStorage()` - Save to encrypted file
  - `scheduleSave()` - Debounced save (1 second)
  - `generateToken()` - Generate + schedule save
  - `validateToken()` - Validate (no persistence needed)
  - `rotateToken()` - Rotate + schedule save
  - `revokeToken()` - Revoke + schedule save
  - `revokeAllForClient()` - Revoke all + schedule save
  - `cleanup()` - Clean expired + schedule save
  - `flush()` - Force immediate save
- Storage format:
  ```typescript
  interface RefreshTokenStorage {
    version: number;
    tokens: StoredRefreshToken[];
  }
  ```
- Log loaded/expired counts on startup

**Acceptance Criteria**:
- [x] PersistentRefreshTokenStore class created
- [x] All RefreshTokenStore interface methods implemented
- [x] Write debouncing implemented (1 second)
- [x] Expired tokens filtered on load
- [x] Flush method for immediate save
- [x] Logging for load/save operations

**Testing**:
- Unit test: save/load cycle
- Unit test: expired token cleanup
- Unit test: write debouncing
- Unit test: flush operation

**Dependencies**: Task 1.1

---

### Task 2.2: Create PersistentClientStore
**Priority**: P0 (Critical - client registration persistence)
**Estimated Effort**: 2-3 hours
**File**: `src/oauth/persistent-client-store.ts`

**Description**:
Implement PersistentClientStore that persists OAuth client registrations across server restarts.

**Implementation Details**:
- Implement `ClientStore` interface
- In-memory Map for fast access
- Storage path: `~/.sage/oauth_clients.enc`
- Methods to implement:
  - `loadFromStorage()` - Load from encrypted file
  - `saveToStorage()` - Save to encrypted file (immediate, not debounced)
  - `registerClient()` - Register + save
  - `getClient()` - Get from memory
  - `deleteClient()` - Delete + save
  - `isValidRedirectUri()` - Validate (no persistence needed)
  - `flush()` - Force save (for consistency)
- Storage format:
  ```typescript
  interface ClientStorage {
    version: number;
    clients: OAuthClient[];
  }
  ```
- Reuse validation logic from InMemoryClientStore

**Acceptance Criteria**:
- [x] PersistentClientStore class created
- [x] All ClientStore interface methods implemented
- [x] Client registration persists across restarts
- [x] Validation logic preserved
- [x] Logging for load/save operations

**Testing**:
- Unit test: register/load cycle
- Unit test: client deletion persistence
- Unit test: redirect URI validation

**Dependencies**: Task 1.1

---

### Task 2.3: Create PersistentSessionStore
**Priority**: P1 (High - session persistence)
**Estimated Effort**: 2-3 hours
**File**: `src/oauth/persistent-session-store.ts`

**Description**:
Implement PersistentSessionStore that persists user sessions with automatic cleanup and session limits.

**Implementation Details**:
- Implement `SessionStore` interface (extract from oauth-server.ts)
- In-memory Map for fast access
- Storage path: `~/.sage/oauth_sessions.enc`
- Session limit: 100 sessions max
- Session expiry: 24 hours
- Methods to implement:
  - `loadFromStorage()` - Load from encrypted file, filter expired
  - `saveToStorage()` - Save to encrypted file, enforce limit
  - `createSession()` - Create + async save
  - `getSession()` - Get from memory, check expiry
  - `deleteSession()` - Delete + async save
  - `flush()` - Force save
- Storage format:
  ```typescript
  interface SessionStorage {
    version: number;
    sessions: UserSession[];
  }
  ```
- Enforce session limit by keeping most recent 100

**Acceptance Criteria**:
- [x] PersistentSessionStore class created
- [x] All SessionStore interface methods implemented
- [x] Session limit enforced (100 max)
- [x] Expired sessions filtered on load
- [x] Async save for performance
- [x] Logging for load/save operations

**Testing**:
- Unit test: session creation/load cycle
- Unit test: expired session cleanup
- Unit test: session limit enforcement
- Unit test: session expiry on get

**Dependencies**: Task 1.1

---

### Task 2.4: Extract SessionStore Interface
**Priority**: P1 (High - required for Task 2.3)
**Estimated Effort**: 30 minutes
**File**: `src/oauth/session-store.ts`

**Description**:
Extract SessionStore interface from oauth-server.ts into separate file for reuse.

**Implementation Details**:
- Create `src/oauth/session-store.ts`
- Extract `SessionStore` interface:
  ```typescript
  export interface SessionStore {
    createSession(userId: string): UserSession;
    getSession(sessionId: string): UserSession | null;
    deleteSession(sessionId: string): void;
  }
  ```
- Move `InMemorySessionStore` class
- Export factory function `createSessionStore()`
- Update imports in `oauth-server.ts`

**Acceptance Criteria**:
- [x] SessionStore interface extracted
- [x] InMemorySessionStore moved to new file
- [x] oauth-server.ts imports from new file
- [x] No functionality changes
- [x] All existing tests pass

**Testing**:
- Verify existing OAuth server tests still pass

**Dependencies**: None

---

## Phase 3: Integration

### Task 3.1: Add Persistence to OAuthServer
**Priority**: P0 (Critical - main integration point)
**Estimated Effort**: 2-3 hours
**File**: `src/oauth/oauth-server.ts`

**Description**:
Integrate persistent stores into OAuthServer with initialization and shutdown methods.

**Implementation Details**:
- Add to `OAuthServerConfig`:
  ```typescript
  enablePersistence?: boolean; // Default: true
  encryptionService?: EncryptionService;
  ```
- Modify constructor:
  - Create EncryptionService if persistence enabled
  - Create persistent stores if persistence enabled
  - Create in-memory stores if persistence disabled (testing)
- Add `initialize()` method:
  - Initialize EncryptionService
  - Load data from all persistent stores in parallel
  - Log initialization status
- Add `shutdown()` method:
  - Flush all pending writes
  - Log shutdown status
- Keep authorization code store in-memory (short-lived)

**Acceptance Criteria**:
- [x] OAuthServerConfig extended with persistence options
- [x] Constructor creates appropriate stores
- [x] initialize() method loads all data
- [x] shutdown() method flushes all data
- [x] Backward compatibility (persistence can be disabled)
- [x] Logging for initialization/shutdown

**Testing**:
- Integration test: server init with persistence
- Integration test: server init without persistence
- Integration test: shutdown flushes data

**Dependencies**: Tasks 2.1, 2.2, 2.3

---

### Task 3.2: Integrate Persistence in HTTP Server
**Priority**: P0 (Critical - enable in production)
**Estimated Effort**: 1-2 hours
**File**: `src/cli/http-server-with-config.ts`

**Description**:
Enable OAuth persistence in remote MCP server and add graceful shutdown handlers.

**Implementation Details**:
- In `startRemoteServer()` method:
  ```typescript
  const oauthServer = new OAuthServer({
    // ... existing config
    enablePersistence: true, // Enable persistence
  });

  // Initialize and load persisted data
  await oauthServer.initialize();
  ```
- Add shutdown handlers:
  ```typescript
  const shutdownHandler = async () => {
    console.log('Shutting down, flushing OAuth data...');
    await oauthServer.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
  ```
- Log OAuth data location on startup

**Acceptance Criteria**:
- [x] OAuth server initialized with persistence enabled
- [x] Data loaded on server startup
- [x] SIGTERM handler flushes data
- [x] SIGINT handler flushes data
- [x] Startup logging includes persistence status

**Testing**:
- Integration test: server startup loads data
- Integration test: SIGTERM triggers flush
- Manual test: pm2 restart preserves tokens

**Dependencies**: Task 3.1

---

## Phase 4: Testing

### Task 4.1: Unit Tests for PersistentRefreshTokenStore
**Priority**: P0 (Critical - verify core functionality)
**Estimated Effort**: 2-3 hours
**File**: `tests/unit/oauth/persistent-refresh-token-store.test.ts`

**Description**:
Create comprehensive unit tests for PersistentRefreshTokenStore.

**Test Cases**:
1. **Save/Load Cycle**:
   - Generate tokens
   - Save to file
   - Load from file
   - Verify tokens restored

2. **Expired Token Cleanup**:
   - Create expired and valid tokens
   - Save to file
   - Load from file
   - Verify expired tokens filtered out

3. **Write Debouncing**:
   - Generate multiple tokens quickly
   - Verify only one write occurs
   - Verify all tokens persisted

4. **Flush Operation**:
   - Generate token
   - Call flush()
   - Verify immediate write
   - Verify debounce timer cleared

5. **Token Rotation**:
   - Generate token
   - Rotate token
   - Verify both operations persisted

6. **Cleanup Method**:
   - Create expired tokens
   - Call cleanup()
   - Verify expired tokens removed
   - Verify changes persisted

**Acceptance Criteria**:
- [x] All 6 test suites pass
- [x] High code coverage (>90%)
- [x] Tests use temporary storage paths
- [x] Tests clean up files after execution

**Dependencies**: Task 2.1

---

### Task 4.2: Unit Tests for PersistentClientStore
**Priority**: P0 (Critical - verify client persistence)
**Estimated Effort**: 1-2 hours
**File**: `tests/unit/oauth/persistent-client-store.test.ts`

**Description**:
Create unit tests for PersistentClientStore.

**Test Cases**:
1. **Register/Load Cycle**:
   - Register client
   - Save to file
   - Load from file
   - Verify client restored

2. **Client Deletion**:
   - Register multiple clients
   - Delete one client
   - Save and load
   - Verify deletion persisted

3. **Redirect URI Validation**:
   - Register client with redirect URIs
   - Validate URIs
   - Verify validation logic preserved

**Acceptance Criteria**:
- [x] All test suites pass
- [x] Tests use temporary storage paths
- [x] Tests verify validation logic

**Dependencies**: Task 2.2

---

### Task 4.3: Unit Tests for PersistentSessionStore
**Priority**: P1 (High - verify session persistence)
**Estimated Effort**: 1-2 hours
**File**: `tests/unit/oauth/persistent-session-store.test.ts`

**Description**:
Create unit tests for PersistentSessionStore.

**Test Cases**:
1. **Session Creation/Load Cycle**:
   - Create sessions
   - Save to file
   - Load from file
   - Verify sessions restored

2. **Expired Session Cleanup**:
   - Create expired and valid sessions
   - Load from file
   - Verify expired sessions filtered

3. **Session Limit Enforcement**:
   - Create 150 sessions
   - Save to file
   - Verify only 100 most recent saved

4. **Session Expiry on Get**:
   - Create session
   - Mock time to exceed expiry
   - Call getSession()
   - Verify returns null
   - Verify session removed from memory

**Acceptance Criteria**:
- [x] All test suites pass
- [x] Tests use temporary storage paths
- [x] Tests mock time for expiry testing

**Status**: ✅ COMPLETED

**Implementation Summary**:
- Created comprehensive unit tests with 24 test cases covering all PersistentSessionStore functionality
- Test Case 1: Session Creation/Load Cycle (4 tests) - validates sessions persist across restarts and metadata preservation
- Test Case 2: Expired Session Cleanup (3 tests) - validates expired session filtering on load
- Test Case 3: Session Limit Enforcement (3 tests) - validates 100 session limit, keeping most recent sessions
- Test Case 4: Session Expiry on Get (4 tests) - validates automatic expiry checking and cleanup on retrieval
- Additional Edge Cases (10 tests) - validates deletion, multiple sessions per user, corrupted storage, save errors, unique ID generation, expiry time calculation, flush operations
- All 24 tests passing with proper isolation using temporary storage paths and mocked saveToStorage to avoid race conditions
- Tests use jest.fn().mockResolvedValue() to handle async save operations in createSession()

**Dependencies**: Task 2.3

---

### Task 4.4: Integration Test - End-to-End Persistence
**Priority**: P0 (Critical - verify complete flow)
**Estimated Effort**: 2-3 hours
**File**: `tests/integration/oauth-persistence.test.ts`

**Description**:
Create integration test that verifies complete OAuth persistence flow across server restarts.

**Test Scenarios**:
1. **Refresh Token Persistence**:
   - Start OAuth server with persistence
   - Generate refresh token via OAuth flow
   - Shut down server
   - Start new server instance
   - Verify refresh token still valid
   - Use refresh token to get access token
   - Verify access token works

2. **Client Registration Persistence**:
   - Register OAuth client
   - Shut down server
   - Start new server
   - Verify client can authenticate

3. **Session Persistence**:
   - Create user session
   - Shut down server
   - Start new server
   - Verify session still valid
   - Verify session expires correctly

4. **Corrupted File Handling**:
   - Create valid storage file
   - Corrupt the file
   - Start server
   - Verify server starts successfully (empty state)
   - Verify no crash

**Acceptance Criteria**:
- [x] All 4 test scenarios pass
- [x] Tests use temporary storage directories
- [x] Tests properly clean up resources
- [x] Tests verify tokens work after restart

**Status**: ✅ COMPLETED

**Implementation Summary**:
- Created comprehensive E2E integration test with 14 test cases
- Test Scenario 1: Refresh Token Persistence (3 tests) - validates tokens persist across server restarts, old tokens rejected after rotation, expired tokens filtered on startup
- Test Scenario 2: Client Registration Persistence (3 tests) - validates client metadata persists, authentication works after restart, deletion persists
- Test Scenario 3: Session Persistence (3 tests) - validates sessions persist, expired sessions filtered, logout persists
- Test Scenario 4: Corrupted File Handling (4 tests) - validates graceful handling of corrupted refresh token, client, session storage files, and missing files
- Edge Case: Multiple Operations with Restart (1 test) - validates complex workflow with multiple clients, tokens, and operations across multiple restarts
- All 14 tests passing, with proper cleanup of temporary test directories
- Tests use temporary storage paths for isolation
- Added `storageBasePath` option to OAuthServerConfig for test directory control

**Dependencies**: Tasks 3.1, 3.2

---

## Phase 5: Documentation and Cleanup

### Task 5.1: Update Documentation
**Priority**: P2 (Medium - important for users)
**Estimated Effort**: 1-2 hours
**Files**: `README.md`, `docs/SETUP-REMOTE.md`, `CHANGELOG.md`

**Description**:
Update documentation to explain OAuth token persistence feature.

**Updates Needed**:
1. **README.md**:
   - Add section on OAuth token persistence
   - Explain `SAGE_ENCRYPTION_KEY` environment variable
   - Document storage location (`~/.sage/`)

2. **docs/SETUP-REMOTE.md**:
   - Update remote server setup instructions
   - Add encryption key management section
   - Document token persistence behavior

3. **CHANGELOG.md**:
   - Add entry for OAuth token persistence feature
   - Document breaking changes (none expected)
   - Mention one-time re-authentication after upgrade

**Acceptance Criteria**:
- [x] README.md updated with persistence info
- [x] SETUP-REMOTE.md includes encryption key setup
- [x] CHANGELOG.md documents new feature
- [x] Examples provided for key management

**Status**: ✅ COMPLETED

**Dependencies**: All implementation tasks

---

### Task 5.2: Refactor GoogleOAuthHandler to Use EncryptionService
**Priority**: P3 (Low - code quality improvement)
**Estimated Effort**: 1-2 hours
**File**: `src/oauth/google-oauth-handler.ts`

**Description**:
Refactor GoogleOAuthHandler to reuse EncryptionService instead of duplicating encryption logic.

**Implementation Details**:
- Remove duplicate encrypt/decrypt methods
- Accept EncryptionService in constructor
- Use encryptionService.encryptToFile() and decryptFromFile()
- Maintain backward compatibility
- Update all callers to pass EncryptionService

**Acceptance Criteria**:
- [x] GoogleOAuthHandler uses EncryptionService
- [x] No duplicate encryption logic
- [x] All existing tests pass
- [x] Backward compatible

**Status**: ✅ COMPLETED

**Implementation Summary**:
- Replaced duplicate encrypt/decrypt methods with EncryptionService integration
- Updated constructor to create EncryptionService instance
- Modified storeTokens() to use encryptionService.encryptToFile()
- Modified getTokens() to use encryptionService.decryptFromFile()
- Added ensureInitialized() helper method for lazy initialization
- Updated test mocks to mock EncryptionService
- All 52 GoogleOAuthHandler tests passing
- Maintained complete backward compatibility with existing API

**Testing**:
- Verify existing Google Calendar tests pass ✅ (52/52 tests passing)
- Verify token persistence still works ✅

**Dependencies**: Task 1.1

---

### Task 5.3: Add Monitoring and Metrics
**Priority**: P3 (Low - future enhancement)
**Estimated Effort**: 2-3 hours
**Files**: Multiple

**Description**:
Add optional monitoring and metrics for OAuth persistence (future enhancement).

**Features**:
- Log metrics on startup:
  - Number of tokens loaded
  - Number of clients loaded
  - Number of sessions loaded
  - Storage file sizes
- Add health check endpoint:
  - Storage file accessibility
  - Encryption service status
  - Last save timestamp
- Add debug logging option for troubleshooting

**Acceptance Criteria**:
- [x] Startup metrics logged
- [x] Health check endpoint available
- [x] Debug logging option

**Status**: ✅ COMPLETED

**Implementation Summary**:
- Added `getMetrics()` methods to all persistent stores (PersistentRefreshTokenStore, PersistentClientStore, PersistentSessionStore)
- Added `getHealthStatus()` to EncryptionService
- Added `getMetrics()` and `getHealthStatus()` to OAuthServer with comprehensive monitoring data
- Added `/oauth/health` endpoint to HTTP server for OAuth-specific health checks
- Added `--debug` CLI flag and `SAGE_DEBUG` environment variable for debug logging
- Created comprehensive unit tests (9 tests, all passing) in `tests/unit/oauth-monitoring.test.ts`
- Debug logging integrated throughout authentication and request handling flows

**Dependencies**: All implementation tasks

---

## Task Summary

### By Priority

**P0 (Critical) - 9 tasks** (9 completed, 0 remaining):
- Task 1.1: EncryptionService ✅
- Task 1.2: EncryptionService tests ✅
- Task 2.1: PersistentRefreshTokenStore ✅
- Task 2.2: PersistentClientStore ✅
- Task 3.1: OAuthServer integration ✅
- Task 3.2: HTTP server integration ✅
- Task 4.1: RefreshTokenStore tests ✅
- Task 4.2: ClientStore tests ✅
- Task 4.4: E2E integration test ✅

**P1 (High) - 3 tasks** (3 completed, 0 remaining):
- Task 2.3: PersistentSessionStore ✅
- Task 2.4: SessionStore interface extraction ✅
- Task 4.3: SessionStore tests ✅

**P2 (Medium) - 1 task** (1 completed):
- Task 5.1: Documentation updates ✅

**P3 (Low) - 2 tasks** (2 completed):
- Task 5.2: GoogleOAuthHandler refactor ✅
- Task 5.3: Monitoring and metrics ✅

### Recommended Execution Order

1. **Phase 1 - Foundation**: Tasks 1.1 → 1.2
2. **Phase 2 - Stores**: Task 2.4 → Tasks 2.1, 2.2, 2.3 (parallel)
3. **Phase 3 - Integration**: Task 3.1 → Task 3.2
4. **Phase 4 - Testing**: Tasks 4.1, 4.2, 4.3 (parallel) → Task 4.4
5. **Phase 5 - Polish**: Tasks 5.1 → 5.2, 5.3 (optional)

### Total Estimated Effort

- **P0 tasks**: ~18-24 hours
- **P1 tasks**: ~4-6 hours
- **P2 tasks**: ~1-2 hours
- **P3 tasks**: ~3-5 hours
- **Total**: ~26-37 hours (approximately 4-5 days)

---

## Current Status

**Implementation Progress**: Phase 1-3 Complete + Tasks 4.1, 4.2, 4.3, 5.1, 5.2, 5.3 (14/15 tasks completed, 93%)

**Completed**:
- ✅ Phase 1: Foundation (Tasks 1.1, 1.2)
- ✅ Phase 2: Persistent Stores (Tasks 2.1, 2.2, 2.3, 2.4)
- ✅ Phase 3: Integration (Tasks 3.1, 3.2)
- ✅ Phase 4: Testing (Task 4.1 completed - 24 tests, 100% coverage)
- ✅ Phase 4: Testing (Task 4.2 completed - 29 tests, all passing)
- ✅ Phase 4: Testing (Task 4.3 completed - 24 tests, all passing)
- ✅ Phase 5: Documentation (Task 5.1 completed - all docs updated)
- ✅ Phase 5: Refactoring (Task 5.2 completed - GoogleOAuthHandler refactored, 52 tests passing)
- ✅ Phase 5: Monitoring (Task 5.3 completed - 9 tests, all passing)

**Remaining**:
- ⏳ Phase 4: Testing (Task 4.4 - E2E integration test already completed)

**Next Step**: All tasks completed! Task 4.4 was already marked as completed earlier.
