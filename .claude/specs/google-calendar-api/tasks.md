# Implementation Plan: Google Calendar API Integration

## Task Overview

Google Calendar API統合を既存のEventKitカレンダー統合と共存させ、ユーザーがEventKit、Google Calendar、または両方を選択可能にする実装です。プラットフォーム検出による自動ソース選択、エラー時の自動フォールバック、統一されたMCPツールインターフェースを提供します。

**実装アプローチ**:
1. **Phase 1 (Foundation)**: GoogleCalendarService、GoogleOAuthHandler、CalendarSourceManager、Config拡張を実装（破壊的変更なし）
2. **Phase 2 (Integration)**: 既存CalendarServiceを拡張し、型定義を更新
3. **Phase 3 (MCP Tools)**: MCPツールをCalendarSourceManagerに移行、新規ツール追加
4. **Phase 4 (Testing)**: 統合テスト、E2Eテスト、ドキュメント更新

## Steering Document Compliance

### Technical Standards (tech.md)
- **TypeScript Strict Mode**: すべての新規コードはstrict mode準拠
- **Zodバリデーション**: 設定とAPI入力の実行時型検証
- **既存パターン踏襲**: retry.ts、OAuth 2.1サーバー、MCPツールパターンを再利用

### Project Structure (structure.md)
```
src/
├── integrations/
│   ├── calendar-service.ts (既存 - 拡張)
│   ├── google-calendar-service.ts (新規)
│   └── calendar-source-manager.ts (新規)
├── oauth/
│   ├── oauth-server.ts (既存 - Google スコープ追加)
│   └── google-oauth-handler.ts (新規)
├── types/
│   └── google-calendar-types.ts (新規)
└── index.ts (既存 - MCPツール拡張)
```

## Atomic Task Requirements
**Each task meets these criteria:**
- **File Scope**: 1-3 related files maximum
- **Time Boxing**: 15-30 minutes completion time
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Exact file paths specified
- **Agent-Friendly**: Clear input/output, minimal context switching

## Tasks

---

## Phase 1: Foundation (破壊的変更なし)

### 1.1 Type Definitions

- [x] 1. Create Google Calendar type definitions in src/types/google-calendar-types.ts
  - File: `src/types/google-calendar-types.ts`
  - Define `GoogleCalendarEvent`, `OAuthTokens`, `CalendarInfo`, `SyncResult`, `SyncStatus` interfaces
  - Add type conversion utilities: `convertGoogleToCalendarEvent()`
  - Purpose: Establish type safety for Google Calendar API integration
  - _Leverage: src/integrations/calendar-service.ts (CalendarEvent type)_
  - _Requirements: 1, 2, 3, 4, 5, 6_

### 1.2 Config Extension

- [x] 2. Extend SageConfig schema with calendar.sources in src/config/config-manager.ts
  - Files: `src/types/config.ts`, `src/config/validation.ts`, `src/config/loader.ts`
  - Add `calendar.sources` schema with Zod validation
  - Implement config refinement: at least one source must be enabled
  - Add default values: EventKit enabled on macOS, Google enabled on Linux/Windows
  - Purpose: Enable calendar source configuration management
  - _Leverage: existing ConfigManager, Zod validation patterns_
  - _Requirements: 9_

- [x] 3. Create config migration utility for existing users
  - File: `src/config/loader.ts`
  - Implement automatic migration in `load()` to add default calendar.sources if missing
  - Ensure backward compatibility: EventKit enabled by default for existing macOS users
  - Purpose: Seamless config upgrade for existing installations
  - _Leverage: existing config loading logic_
  - _Requirements: 9_
  - _Note: Implemented as part of Task 2 in ConfigLoader.load()_

### 1.3 Google OAuth Handler

- [x] 4. Create GoogleOAuthHandler class structure in src/oauth/google-oauth-handler.ts
  - File: `src/oauth/google-oauth-handler.ts`
  - Implement constructor with Google OAuth2Client initialization
  - Add `getAuthorizationUrl()` method with PKCE code_challenge generation
  - Add `exchangeCodeForTokens()` method with code_verifier
  - Purpose: Establish OAuth 2.0 flow foundation
  - _Leverage: src/oauth/oauth-server.ts (OAuth patterns), googleapis npm package_
  - _Requirements: 1_

- [x] 5. Implement token management in GoogleOAuthHandler
  - File: `src/oauth/google-oauth-handler.ts`
  - Add `refreshAccessToken()` method using refresh_token
  - Add `storeTokens()` method using existing TokenService encryption
  - Add `getTokens()` method with decryption
  - Add `revokeTokens()` method to revoke Google tokens
  - Purpose: Secure token lifecycle management
  - _Leverage: src/oauth/token-service.ts (encryption/decryption)_
  - _Requirements: 1_

- [x] 6. Add token validation to GoogleOAuthHandler
  - File: `src/oauth/google-oauth-handler.ts`
  - Implement `validateToken()` method to check token expiry
  - Add automatic token refresh logic when expired
  - Purpose: Ensure always-valid tokens for API calls
  - _Leverage: existing JWT validation patterns_
  - _Requirements: 1_

- [x] 7. Create GoogleOAuthHandler unit tests in tests/oauth/google-oauth-handler.test.ts
  - File: `tests/oauth/google-oauth-handler.test.ts`
  - Test `getAuthorizationUrl()` with PKCE
  - Test `exchangeCodeForTokens()` with mocked googleapis
  - Test `refreshAccessToken()` flow
  - Test `storeTokens()`/`getTokens()` with TokenService mock
  - Purpose: Ensure OAuth handler reliability
  - _Leverage: tests/helpers/testUtils.ts, googleapis mock_
  - _Requirements: 1_

### 1.4 Google Calendar Service

- [x] 8. Create GoogleCalendarService class structure in src/integrations/google-calendar-service.ts
  - File: `src/integrations/google-calendar-service.ts`
  - Implement constructor with GoogleOAuthHandler injection
  - Add `authenticate()` method to initialize google.calendar client
  - Add `isAvailable()` health check method
  - Purpose: Establish Google Calendar API integration foundation
  - _Leverage: src/oauth/google-oauth-handler.ts, googleapis npm package_
  - _Requirements: 1, 10_

- [x] 9a. Implement basic GoogleCalendarService.listEvents() with pagination
  - File: `src/integrations/google-calendar-service.ts`
  - Implement `listEvents(request: ListEventsRequest)` with Google Calendar API v3
  - Add pagination support using `pageToken` (maxResults=250)
  - Handle basic event fetching without recurring expansion
  - Purpose: Establish basic event retrieval functionality
  - _Leverage: googleapis npm package_
  - _Requirements: 2_
  - _Depends on: Task 8_

- [x] 9b. Add recurring event expansion, retry, and type conversion to listEvents()
  - File: `src/integrations/google-calendar-service.ts`
  - Add recurring event expansion using `singleEvents=true`
  - Add retry logic using existing `retryWithBackoff()`
  - Convert `GoogleCalendarEvent` → `CalendarEvent` using type converter
  - Purpose: Complete event retrieval with all features
  - _Leverage: src/utils/retry.ts, src/types/google-calendar-types.ts_
  - _Requirements: 2, 10_
  - _Depends on: Task 9a_

- [x] 10. Implement GoogleCalendarService.createEvent() method
  - File: `src/integrations/google-calendar-service.ts`
  - Implement `createEvent(request: CreateEventRequest, calendarId?: string)`
  - Support all-day events (use `date` instead of `dateTime`)
  - Support alarms/reminders with `reminders.overrides`
  - Support attendees with invitation sending
  - Add retry logic for transient errors
  - Purpose: Create calendar events in Google Calendar
  - _Leverage: src/utils/retry.ts, existing CreateEventRequest type_
  - _Requirements: 3, 10_

- [x] 11. Implement GoogleCalendarService.updateEvent() method
  - File: `src/integrations/google-calendar-service.ts`
  - Implement `updateEvent(eventId: string, updates: Partial<CreateEventRequest>)`
  - Support partial updates (patch API)
  - Handle recurring events with `recurringEventId`
  - Add retry logic
  - Purpose: Update existing calendar events
  - _Leverage: src/utils/retry.ts_
  - _Requirements: 4, 10_

- [x] 12. Implement GoogleCalendarService.deleteEvent() and deleteEventsBatch() methods
  - File: `src/integrations/google-calendar-service.ts`
  - Implement `deleteEvent(eventId: string)` for single deletion
  - Implement `deleteEventsBatch(eventIds: string[])` using Google Batch API (max 50 ops)
  - Add retry logic for both methods
  - Purpose: Delete calendar events from Google Calendar
  - _Leverage: src/utils/retry.ts, googleapis batch API_
  - _Requirements: 5, 10_

- [x] 13. Implement GoogleCalendarService.respondToEvent() method
  - File: `src/integrations/google-calendar-service.ts`
  - Implement `respondToEvent(eventId: string, response: 'accepted' | 'declined' | 'tentative')`
  - Update attendee's `responseStatus` in event
  - Send notification to organizer using `sendNotifications=true`
  - Add retry logic
  - Purpose: Respond to calendar event invitations
  - _Leverage: src/utils/retry.ts_
  - _Requirements: 6, 10_

- [x] 14. Implement GoogleCalendarService.listCalendars() method
  - File: `src/integrations/google-calendar-service.ts`
  - Implement `listCalendars()` using `calendarList.list` API
  - Return array of `CalendarInfo` with id, name, isPrimary, accessRole
  - Add retry logic
  - Purpose: List available Google Calendars for user
  - _Leverage: src/utils/retry.ts, src/types/google-calendar-types.ts_
  - _Requirements: 2, 9_

- [x] 15. Create GoogleCalendarService unit tests in tests/integrations/google-calendar-service.test.ts
  - File: `tests/integrations/google-calendar-service.test.ts`
  - Test `listEvents()` with pagination and recurring events
  - Test `createEvent()` with all-day and attendees
  - Test `updateEvent()` with partial updates
  - Test `deleteEvent()` and `deleteEventsBatch()`
  - Test `respondToEvent()` with all response types
  - Test `listCalendars()`
  - Test error handling (429, 401, 500) with retry
  - Purpose: Ensure GoogleCalendarService reliability
  - _Leverage: tests/helpers/testUtils.ts, googleapis mock_
  - _Requirements: All from 1-6, 10_

### 1.5 Calendar Source Manager

- [x] 16. Create CalendarSourceManager class structure in src/integrations/calendar-source-manager.ts
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement constructor with CalendarService and GoogleCalendarService injection
  - Add `detectAvailableSources()` method using `detectPlatform()` pattern
  - Add `enableSource(source: 'eventkit' | 'google')` method
  - Add `disableSource(source: 'eventkit' | 'google')` method
  - Add `getEnabledSources()` method reading from config
  - Purpose: Establish multi-source calendar management foundation
  - _Leverage: src/integrations/calendar-service.ts (detectPlatform), src/config/config-manager.ts_
  - _Requirements: 9, 11_

- [x] 17a. Implement CalendarSourceManager.getEvents() with parallel fetching and merging
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement `getEvents(startDate: string, endDate: string, calendarId?: string)`
  - Fetch events from all enabled sources in parallel using `Promise.all()`
  - Merge events from multiple sources into single array
  - Purpose: Establish multi-source event retrieval foundation
  - _Leverage: src/integrations/calendar-service.ts, src/integrations/google-calendar-service.ts_
  - _Requirements: 2, 7_
  - _Depends on: Tasks 9b, 16_

- [x] 17b. Add deduplication and fallback logic to getEvents()
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement `areEventsDuplicate()` helper using iCalUID and title+time matching
  - Apply deduplication to merged events
  - Add fallback logic: if one source fails, use the other
  - Purpose: Ensure unified event list without duplicates and with error resilience
  - _Leverage: design.md event deduplication strategy_
  - _Requirements: 7, 10, 11_
  - _Depends on: Task 17a, Task 24 (for iCalUID support)_

- [x] 18. Implement CalendarSourceManager.createEvent() with source routing
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement `createEvent(request: CreateEventRequest, preferredSource?: 'eventkit' | 'google')`
  - Route to preferred source if specified, otherwise use first enabled source
  - Add fallback: if preferred source fails, try other enabled source
  - Purpose: Create events in appropriate calendar source
  - _Leverage: src/integrations/calendar-service.ts, src/integrations/google-calendar-service.ts_
  - _Requirements: 3, 10, 11_

- [x] 19. Implement CalendarSourceManager.deleteEvent() with source routing
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement `deleteEvent(eventId: string, source?: 'eventkit' | 'google')`
  - If source specified, delete from that source only
  - If source not specified, attempt to delete from both sources (event may exist in both)
  - Purpose: Delete events from appropriate calendar source
  - _Leverage: src/integrations/calendar-service.ts, src/integrations/google-calendar-service.ts_
  - _Requirements: 5, 10, 11_

- [x] 20a. Implement basic CalendarSourceManager.findAvailableSlots() with filtering
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement `findAvailableSlots(request: FindSlotsRequest)`
  - Use `getEvents()` to fetch events from all enabled sources (already merged/deduplicated)
  - Filter by working hours from config
  - Filter by `minDurationMinutes`/`maxDurationMinutes` parameters
  - Return basic `AvailableSlot[]` array
  - Purpose: Establish available slot detection with basic filtering
  - _Leverage: src/integrations/calendar-service.ts (findAvailableSlots logic)_
  - _Requirements: 7_
  - _Depends on: Task 17b_

- [x] 20b. Integrate suitability calculation into findAvailableSlots()
  - File: `src/integrations/calendar-source-manager.ts`
  - Import and use `calculateSuitability()` from CalendarService or working-cadence
  - Apply suitability scoring considering deep work days and meeting heavy days
  - Sort slots by suitability score
  - Return enhanced `AvailableSlot[]` in existing format
  - Purpose: Provide intelligent slot recommendations based on working rhythm
  - _Leverage: src/integrations/working-cadence.ts (calculateSuitability)_
  - _Requirements: 7_
  - _Depends on: Task 20a_

- [x] 21. Implement CalendarSourceManager sync methods (optional)
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement `syncCalendars()` to sync between EventKit and Google Calendar
  - Implement `getSyncStatus()` to return last sync time and errors
  - Only enable sync if both sources are enabled
  - Purpose: Optional bi-directional calendar sync
  - _Leverage: src/integrations/calendar-service.ts, src/integrations/google-calendar-service.ts_
  - _Requirements: 8_

- [x] 22. Implement CalendarSourceManager.healthCheck()
  - File: `src/integrations/calendar-source-manager.ts`
  - Implement `healthCheck()` to check availability of each source
  - Call `CalendarService.isAvailable()` and `GoogleCalendarService.isAvailable()`
  - Return object with health status for each source
  - Purpose: Monitor calendar source availability
  - _Leverage: src/integrations/calendar-service.ts, src/integrations/google-calendar-service.ts_
  - _Requirements: 10, 11_

- [x] 23. Create CalendarSourceManager unit tests in tests/integrations/calendar-source-manager.test.ts
  - File: `tests/integrations/calendar-source-manager.test.ts`
  - Test `detectAvailableSources()` for macOS and Linux
  - Test `enableSource()` and `disableSource()`
  - Test `getEvents()` with both sources enabled (merging and deduplication)
  - Test `getEvents()` with one source failing (fallback)
  - Test `createEvent()` with source routing and fallback
  - Test `deleteEvent()` with source routing
  - Test `findAvailableSlots()` with multi-source events
  - Test `healthCheck()`
  - Purpose: Ensure CalendarSourceManager reliability
  - _Leverage: tests/helpers/testUtils.ts, mocked CalendarService and GoogleCalendarService_
  - _Requirements: 2, 3, 5, 7, 9, 10, 11_

---

## Phase 2: Integration (既存コード拡張)

### 2.1 CalendarService Extension

- [x] 24. Add iCalUID extraction to CalendarService.fetchEvents() in src/integrations/calendar-service.ts
  - File: `src/integrations/calendar-service.ts`
  - Modify AppleScript in `fetchEvents()` to include `iCalendarUID of anEvent`
  - Parse iCalUID from AppleScript output
  - Add iCalUID to returned CalendarEvent objects
  - Purpose: Enable event deduplication using iCalendar UIDs
  - _Leverage: existing fetchEvents() AppleScript logic_
  - _Requirements: 2, 7_

- [x] 25. Extend CalendarEvent type definition with new fields
  - File: `src/integrations/calendar-service.ts` (or src/types/ if separated)
  - Add `source: 'eventkit' | 'google'` field (strict type, not just string)
  - Add `attendees?: string[]` field
  - Add `status?: 'confirmed' | 'tentative' | 'cancelled'` field
  - Add `iCalUID?: string` field for deduplication
  - All new fields are optional for backward compatibility
  - Purpose: Support multi-source events with additional metadata
  - _Leverage: existing CalendarEvent interface_
  - _Requirements: 2, 6, 7_

- [x] 26. Update CalendarService unit tests for iCalUID extraction
  - File: `tests/integrations/calendar-service.test.ts`
  - Add test for iCalUID extraction in `fetchEvents()`
  - Verify iCalUID is included in returned CalendarEvent objects
  - Purpose: Ensure iCalUID extraction works correctly
  - _Leverage: existing CalendarService test suite_
  - _Requirements: 2, 7_
  - _Note: Tests use mocks when EventKit is unavailable (non-macOS platforms)_

---

## Phase 3: MCP Tools (統一インターフェース)

### 3.1 Existing Tool Extensions

- [x] 27. Update list_calendar_events MCP tool to use CalendarSourceManager
  - File: `src/index.ts`
  - Replace `CalendarService` with `CalendarSourceManager` in tool implementation
  - Add optional `calendarId` parameter to Zod schema
  - Update tool description to mention "enabled sources (EventKit, Google Calendar, or both)"
  - Purpose: Enable multi-source event listing
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 2, 7_

- [x] 28. Update find_available_slots MCP tool to use CalendarSourceManager
  - File: `src/index.ts`
  - Replace `CalendarService` with `CalendarSourceManager` in tool implementation
  - Add optional `minDurationMinutes` and `maxDurationMinutes` parameters to Zod schema
  - Update tool description to mention "all enabled calendar sources"
  - Purpose: Find slots considering all calendar sources
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 7_

- [x] 29. Update create_calendar_event MCP tool to use CalendarSourceManager
  - File: `src/index.ts`
  - Replace `CalendarService` with `CalendarSourceManager` in tool implementation
  - Add optional `preferredSource` parameter to route to specific calendar
  - Purpose: Create events in appropriate calendar source
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 3_

- [x] 30. Update delete_calendar_event MCP tool to use CalendarSourceManager
  - File: `src/index.ts`
  - Replace `CalendarService` with `CalendarSourceManager` in tool implementation
  - Support deletion from both sources if source not specified
  - Purpose: Delete events from appropriate calendar source
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 5_

- [x] 31. Update respond_to_calendar_event MCP tool to support Google Calendar
  - File: `src/index.ts`
  - Extend tool to support Google Calendar event responses
  - Use `CalendarSourceManager` to route response to correct source
  - Purpose: Respond to invitations from any calendar source
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 6_

### 3.2 New MCP Tools

- [x] 32. Add list_calendar_sources MCP tool
  - File: `src/index.ts`
  - Create new tool: `list_calendar_sources`
  - No parameters required
  - Call `CalendarSourceManager.detectAvailableSources()`, `getEnabledSources()`, `healthCheck()`
  - Return object with availability, enabled status, and health for each source
  - Purpose: Allow users to see available and enabled calendar sources
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 9, 11_

- [x] 33. Add set_calendar_source MCP tool
  - File: `src/index.ts`
  - Create new tool: `set_calendar_source`
  - Parameters: `source: 'eventkit' | 'google'`, `enabled: boolean`
  - Call `CalendarSourceManager.enableSource()` or `disableSource()`
  - Update config using `ConfigManager.save()`
  - If enabling Google Calendar for first time, trigger OAuth flow
  - Purpose: Allow users to enable/disable calendar sources
  - _Leverage: src/integrations/calendar-source-manager.ts, src/config/config-manager.ts_
  - _Requirements: 9, 11_

- [x] 34. Add sync_calendar_sources MCP tool (optional)
  - File: `src/index.ts`
  - Create new tool: `sync_calendar_sources`
  - No parameters required
  - Check if both sources enabled, error if not
  - Call `CalendarSourceManager.syncCalendars()`
  - Return `SyncResult` with added/updated/deleted counts
  - Purpose: Manual sync between EventKit and Google Calendar
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 8_

- [x] 35. Add get_calendar_sync_status MCP tool (optional)
  - File: `src/index.ts`
  - Create new tool: `get_calendar_sync_status`
  - No parameters required
  - Call `CalendarSourceManager.getSyncStatus()`
  - Return last sync time, next sync time, and errors
  - Purpose: Check sync status between calendar sources
  - _Leverage: src/integrations/calendar-source-manager.ts_
  - _Requirements: 8_

---

## Phase 4: Testing & Documentation

### 4.1 Integration Tests

- [x] 36. Create Google Calendar integration tests in tests/integration/google-calendar-integration.test.ts
  - File: `tests/integration/google-calendar-integration.test.ts`
  - Test OAuth flow: getAuthorizationUrl → exchangeCodeForTokens → storeTokens
  - Test event CRUD operations with mocked Google Calendar API
  - Test token refresh flow when access token expires
  - Test error handling: rate limit (429), auth error (401), network error
  - Test retry logic with exponential backoff
  - Purpose: Ensure Google Calendar integration works end-to-end
  - _Leverage: tests/helpers/testUtils.ts, googleapis mock_
  - _Requirements: 1, 2, 3, 4, 5, 6, 10_

- [x] 37a. Create multi-source integration tests for event merging and deduplication
  - File: `tests/integration/multi-source-calendar.test.ts`
  - Test EventKit + Google Calendar event merging
  - Test event deduplication using iCalUID
  - Test event deduplication using title+time matching
  - Purpose: Ensure event merging and deduplication work correctly
  - _Leverage: tests/helpers/testUtils.ts, mocked CalendarService and GoogleCalendarService_
  - _Requirements: 2, 7_
  - _Note: Tests use mocked services for consistent CI/CD execution_

- [x] 37b. Create multi-source integration tests for fallback scenarios
  - File: `tests/integration/multi-source-calendar.test.ts` (continue from 37a)
  - Test fallback: Google fails → EventKit used
  - Test fallback: EventKit fails → Google used
  - Test both sources disabled (error)
  - Purpose: Ensure fallback mechanisms work correctly
  - _Leverage: tests/helpers/testUtils.ts, mocked services with failure injection_
  - _Requirements: 10, 11_

### 4.2 E2E Tests

- [x] 38. Create E2E test for Google Calendar setup flow in tests/e2e/google-calendar-setup.test.ts
  - File: `tests/e2e/google-calendar-setup.test.ts`
  - Test first-time setup: detectAvailableSources → enableSource('google') → OAuth flow
  - Test OAuth completion: authorization code → token exchange → token storage
  - Test config save: calendar.sources.google.enabled = true
  - Test first event fetch after setup
  - Purpose: Ensure smooth first-time user experience
  - _Leverage: tests/helpers/testUtils.ts, test Google Calendar account_
  - _Requirements: 1, 9, 11_
  - _Note: OAuth flow uses mocked responses with pre-authorized test tokens (no browser interaction required)_

- [x] 39. Create E2E test for multi-source usage in tests/e2e/multi-source-calendar.test.ts
  - File: `tests/e2e/multi-source-calendar.test.ts`
  - Test scenario: Both sources enabled on macOS
  - Test list_calendar_events returns events from both sources
  - Test find_available_slots considers events from both sources
  - Test create event in Google Calendar, verify it appears in list
  - Test create event in EventKit, verify it appears in list
  - Purpose: Ensure multi-source calendar usage works seamlessly
  - _Leverage: tests/helpers/testUtils.ts, real EventKit and test Google account_
  - _Requirements: 2, 3, 7_
  - _Note: EventKit tests use mocks when platform is not macOS (for CI/CD compatibility)_

- [x] 40. Create E2E test for error fallback in tests/e2e/calendar-fallback.test.ts
  - File: `tests/e2e/calendar-fallback.test.ts`
  - Test scenario: Both sources enabled, simulate Google Calendar API failure
  - Test list_calendar_events falls back to EventKit
  - Test warning message is displayed to user
  - Test find_available_slots still works with EventKit only
  - Purpose: Ensure graceful degradation on API failures
  - _Leverage: tests/helpers/testUtils.ts, Google API mock with failure injection_
  - _Requirements: 10, 11_

### 4.3 Documentation

- [x] 41. Update CONFIGURATION.md with Google Calendar setup instructions
  - File: `docs/CONFIGURATION.md`
  - Add "Google Calendar Integration" section
  - Document Google OAuth setup: client ID, client secret, redirect URI
  - Document configuration options: defaultCalendar, excludedCalendars, syncInterval
  - Add troubleshooting section for common OAuth errors
  - Purpose: Guide users through Google Calendar setup
  - _Leverage: existing CONFIGURATION.md structure_
  - _Requirements: 1, 9_

- [x] 42. Update README.md with Google Calendar feature
  - File: `README.md`
  - Add "Google Calendar Integration" to Features section
  - Mention platform support: macOS (EventKit + Google), Linux/Windows (Google only)
  - Add brief setup instructions with link to CONFIGURATION.md
  - Purpose: Inform users about new Google Calendar capability
  - _Leverage: existing README.md structure_
  - _Requirements: 1, 2, 3, 4, 5, 6, 7, 8, 9, 11_

- [x] 43. Update spec.md and status.md to reflect Google Calendar implementation
  - Files: `.claude/specs/spec.md`, `.claude/specs/status.md`
  - Update version to 0.7.9 (new feature release)
  - Add Google Calendar integration to feature list
  - Update MCP tools count (18 → 24 tools)
  - Update platform support table with Google Calendar availability
  - Purpose: Keep specification documents up-to-date
  - _Leverage: existing spec structure_
  - _Requirements: All_

---

## Summary

**Total Tasks**: 47 tasks across 4 phases

**Phase 1 (Foundation)**: Tasks 1-23 (25 tasks)
- Types, Config, OAuth, GoogleCalendarService, CalendarSourceManager
- No breaking changes to existing code
- Tasks 9, 17, 20 split into subtasks (a/b) for atomicity

**Phase 2 (Integration)**: Tasks 24-26 (3 tasks)
- CalendarService extension with iCalUID
- CalendarEvent type expansion

**Phase 3 (MCP Tools)**: Tasks 27-35 (9 tasks)
- Update existing tools to use CalendarSourceManager
- Add 4 new tools for source management

**Phase 4 (Testing & Docs)**: Tasks 36-43 (10 tasks)
- Integration tests (Task 37 split into 37a/37b), E2E tests, documentation updates
- Tests include mocking strategy for cross-platform CI/CD compatibility

**Dependencies**:
- Phase 2 depends on Phase 1 (Tasks 1-23)
- Phase 3 depends on Phase 1 and Phase 2 (Tasks 1-26)
- Phase 4 can proceed in parallel with Phase 3 for integration tests, but E2E tests depend on Phase 3 completion

**Risk Mitigation**:
- All tasks are atomic (1-3 files, 15-30 minutes)
- Each phase can be tested independently
- Rollback strategy: disable Google Calendar source in config
- No breaking changes to existing EventKit functionality

**Success Criteria**:
- All 47 tasks completed
- 95%+ test coverage for new code
- All 11 requirements verified
- Documentation complete and accurate
- Backward compatibility maintained

**Atomicity Improvements**:
- Task 9 split into 9a/9b: Basic listEvents + Recurring expansion/retry (validator feedback)
- Task 17 split into 17a/17b: Parallel fetching + Deduplication/fallback (validator feedback)
- Task 20 split into 20a/20b: Basic filtering + Suitability calculation (validator feedback)
- Task 37 split into 37a/37b: Event merging tests + Fallback scenario tests (validator feedback)
- All tasks now meet 15-30 minute completion time requirement
