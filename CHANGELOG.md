# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
