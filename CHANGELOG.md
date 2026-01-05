# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.1] - 2026-01-06

### Fixed
- **OAuth Persistence Race Condition** - Fix ENOENT errors during concurrent file writes
  - Add `FileMutex` class for per-file write serialization
  - Integrate mutex into `EncryptionService.encryptToFile()` and `decryptFromFile()`
  - Prevents race conditions when multiple OAuth operations save simultaneously
  - Add `waitForPendingWrites()` for graceful shutdown support
  - Add mutex metrics to health status for monitoring

### Added
- **FileMutex Utility** - New utility class for serializing file operations
  - Per-file locking allows parallel writes to different files
  - Promise queue pattern with no external dependencies
  - Built-in metrics tracking (wait times, queue depth)
  - Warning logs for high contention (>10 queued ops) or long waits (>5s)

## [0.9.0] - 2026-01-06

### Added
- **OAuth Token Persistence** - Remote MCP server now persists OAuth tokens across server restarts
  - Automatic encryption and persistence of refresh tokens, client registrations, and user sessions
  - AES-256-GCM encryption for all stored OAuth data
  - Secure encryption key management via `SAGE_ENCRYPTION_KEY` environment variable or auto-generated key at `~/.sage/oauth_encryption_key`
  - Automatic cleanup of expired tokens and sessions
  - Write debouncing for optimal performance (refresh tokens)
  - Atomic file writes to prevent data corruption
  - Storage location: `~/.sage/` directory
    - `oauth_refresh_tokens.enc` - Encrypted refresh tokens
    - `oauth_clients.enc` - Encrypted client registrations
    - `oauth_sessions.enc` - Encrypted user sessions
    - `oauth_encryption_key` - Encryption key (auto-generated if not provided)
  - **No re-authentication required after server restarts**
  - Graceful shutdown handlers (SIGTERM/SIGINT) to flush pending writes

### Changed
- **EncryptionService** - Extracted encryption logic for reuse across OAuth components
  - Supports key loading from environment variable or persistent file
  - Uses scrypt for key derivation
  - Format: `salt:iv:authTag:encrypted`
  - Secure file permissions (600) for all sensitive files

### Security
- **Enhanced OAuth Security**
  - All OAuth tokens encrypted at rest using AES-256-GCM
  - Encryption keys stored with restricted file permissions (600)
  - Automatic session limits (100 max) to prevent memory exhaustion
  - Expired token cleanup on server startup
  - Secure temp file pattern for atomic writes

### Migration Notes
- **First startup after upgrade**: Users may need to re-authenticate once as existing in-memory tokens are not migrated
- **Encryption key management**: For production deployments, set `SAGE_ENCRYPTION_KEY` environment variable to ensure token portability across server reinstalls
- **No breaking changes**: All existing functionality preserved, persistence is enabled by default

## [0.8.7] - 2026-01-05

### Fixed
- **Remote MCP server now respects calendar.sources configuration** ([#remote-mcp-ignores-calendar-sources](https://github.com/shin1ohno/sage/issues/remote-mcp-ignores-calendar-sources))
  - Fixed bug where remote MCP server ignored `calendar.sources` configuration and always used EventKit
  - Remote MCP server now properly initializes GoogleCalendarService and CalendarSourceManager
  - Google Calendar API integration now works in remote mode (HTTP transport)
  - All 8 calendar tools now use CalendarSourceManager architecture for consistent multi-source support

### Changed
- **Refactored remote MCP handler to use extracted calendar handlers**
  - Replaced inline calendar tool implementations with extracted handlers from `src/tools/calendar/handlers.ts`
  - Ensures consistency between local (stdio) and remote (HTTP) MCP modes
  - Reduced code duplication by ~800 lines
  - Single maintenance path for all calendar features

### Added
- **E2E tests for CalendarSourceManager in remote mode**
  - Added tests to verify CalendarSourceManager initialization
  - Added tests to verify calendar source selection in remote mode
  - Tests ensure Google Calendar configuration is respected

### Technical Details
- **Commits**: b61b1c6, 6f5619f
- **Files Modified**:
  - `src/cli/mcp-handler.ts` - Integrated CalendarSourceManager
  - `tests/e2e/cli-modes.test.ts` - Added E2E tests for calendar source management
- **Impact**:
  - Users can now use Google Calendar API in remote mode
  - Configuration-based calendar source selection works as expected
  - Multi-source calendar support fully functional in remote mode

## [0.8.6] - 2026-01-05

### Added
- Initial release with remote MCP server support
- Calendar integration with EventKit
- Task management with Apple Reminders and Notion
- Working cadence analysis
- Setup wizard for configuration

---

**Note**: For earlier versions, see git history.
