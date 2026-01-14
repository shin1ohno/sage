# Implementation Plan: Multi-Calendar Resources

## Task Overview

複数のカレンダーリソースを同時に参照可能にする機能を実装します。既存の `CalendarSourceManager` を拡張し、カレンダーリソースレベルでの選択・フィルタリング機能を追加します。

## Steering Document Compliance

- 型定義は `src/types/` に配置
- サービスロジックは `src/integrations/` に配置
- MCPツールハンドラは `src/tools/calendar/` に配置
- テストは `tests/` に配置
- 既存のコードパターン（リトライロジック、ログ出力）を踏襲

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

## Tasks

### Phase 1: 型定義とインターフェース

- [ ] 1. Add CalendarResource interface to src/types/calendar.ts
  - File: `src/types/calendar.ts`
  - Add `CalendarResource` interface with id, name, source, color, isPrimary, isWritable, accessRole fields
  - Export the new interface
  - Purpose: Establish type definition for calendar resource representation
  - _Leverage: existing type patterns in src/types/calendar.ts_
  - _Requirements: 1.3, 4.1_

- [ ] 2. Extend CalendarEvent interface with calendar metadata fields
  - File: `src/types/calendar.ts`
  - Add optional fields: `calendarId`, `calendarName`, `calendarColor` to CalendarEvent
  - Purpose: Enable events to carry source calendar information
  - _Leverage: existing CalendarEvent interface_
  - _Requirements: 4.1, 4.2_

- [ ] 3. Extend config types with selectedCalendars field
  - File: `src/types/config.ts`
  - Add `selectedCalendars?: string[]` to `EventKitSourceConfig` and `GoogleCalendarSourceConfig`
  - Purpose: Enable persisting user's calendar selection preferences
  - _Leverage: existing CalendarSources interface_
  - _Requirements: 2.3_

- [ ] 4. Add CalendarResource validation schema
  - File: `src/config/validation.ts`
  - Add `CalendarResourceSchema` using Zod
  - Add `calendarIds` parameter to relevant input schemas
  - Purpose: Enable input validation for new calendar-related parameters
  - _Leverage: existing Zod schema patterns_
  - _Requirements: 2.1, 3.1, 5.2_

### Phase 2: EventKit カレンダー一覧取得

- [ ] 5. Add listCalendars method to CalendarService
  - File: `src/integrations/calendar-service.ts`
  - Add `async listCalendars(): Promise<CalendarResource[]>` method
  - Implement AppleScript to fetch calendar list from EventKit
  - Include error handling with retry logic
  - Purpose: Enable fetching available calendars from EventKit
  - _Leverage: existing AppleScript patterns in calendar-service.ts, retryWithBackoff utility_
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 6. Add unit tests for CalendarService.listCalendars
  - File: `tests/integrations/calendar-service.test.ts`
  - Add tests for listCalendars success case
  - Add tests for error handling (permission denied, AppleScript failure)
  - Purpose: Ensure EventKit calendar listing is reliable
  - _Leverage: existing test patterns in calendar-service.test.ts_
  - _Requirements: 1.1, 1.2_

### Phase 3: CalendarSourceManager 拡張

- [ ] 7. Add listCalendarResources method to CalendarSourceManager
  - File: `src/integrations/calendar-source-manager.ts`
  - Add `async listCalendarResources(): Promise<CalendarResource[]>` method
  - Fetch from both EventKit and Google Calendar in parallel using Promise.allSettled
  - Merge results with source identification
  - Purpose: Provide unified calendar resource listing across all sources
  - _Leverage: existing GoogleCalendarService.listCalendars(), CalendarService.listCalendars()_
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 8. Add calendar resource caching to CalendarSourceManager
  - File: `src/integrations/calendar-source-manager.ts`
  - Add private cache Map with TTL (5 minutes)
  - Add cache invalidation on config change
  - Purpose: Meet 2-second performance requirement for resource listing
  - _Leverage: existing caching patterns_
  - _Requirements: NFR Performance_

- [ ] 9. Extend getEvents to accept calendarIds array
  - File: `src/integrations/calendar-source-manager.ts`
  - Modify `getEvents` signature: `calendarId?: string` → `calendarIds?: string[]`
  - Filter events from specified calendars only
  - Maintain backward compatibility (single string still works)
  - Purpose: Enable filtering events by specific calendars
  - _Leverage: existing getEvents implementation_
  - _Requirements: 3.1, 3.2_

- [ ] 10. Add getSelectedCalendarIds and updateSelectedCalendarIds methods
  - File: `src/integrations/calendar-source-manager.ts`
  - Add `getSelectedCalendarIds(): string[]` to read from config
  - Add `updateSelectedCalendarIds(calendarIds: string[]): void` to update config
  - Purpose: Enable reading/updating user's calendar selection
  - _Leverage: existing config access patterns_
  - _Requirements: 2.2, 2.3_

- [ ] 11. Extend FindSlotsRequest with calendarIds parameter
  - File: `src/integrations/calendar-source-manager.ts`
  - Add `calendarIds?: string[]` to `FindSlotsRequest` interface
  - Update `findAvailableSlots` to use calendarIds when fetching events
  - Purpose: Enable filtering available slots by specific calendars
  - _Leverage: existing findAvailableSlots implementation_
  - _Requirements: 5.1, 5.2_

- [ ] 12. Add unit tests for CalendarSourceManager extensions
  - File: `tests/integrations/calendar-source-manager.test.ts`
  - Test listCalendarResources with mock services
  - Test getEvents with calendarIds array
  - Test cache behavior
  - Test partial source failure handling
  - Purpose: Ensure multi-calendar functionality is reliable
  - _Leverage: existing test patterns_
  - _Requirements: 1.1, 3.1, 3.3_

### Phase 4: MCPツール実装

- [ ] 13. Add list_calendar_resources MCP tool definition
  - File: `src/tools/calendar/index.ts`
  - Define tool schema with source filter parameter
  - Export tool definition
  - Purpose: Expose calendar resource listing via MCP
  - _Leverage: existing tool definition patterns_
  - _Requirements: 1.1_

- [ ] 14. Implement list_calendar_resources handler
  - File: `src/tools/calendar/handlers.ts`
  - Add handler function for list_calendar_resources
  - Call CalendarSourceManager.listCalendarResources()
  - Format response with resources and source availability
  - Purpose: Handle MCP requests for calendar resource listing
  - _Leverage: existing handler patterns_
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 15. Update list_calendar_events handler with calendarIds support
  - File: `src/tools/calendar/handlers.ts`
  - Add calendarIds parameter to input schema
  - Pass calendarIds to CalendarSourceManager.getEvents()
  - Purpose: Enable filtering events by calendar via MCP
  - _Leverage: existing handleListCalendarEvents implementation_
  - _Requirements: 3.1_

- [ ] 16. Update find_available_slots handler with calendarIds support
  - File: `src/tools/calendar/handlers.ts`
  - Add calendarIds parameter to input schema
  - Pass calendarIds to CalendarSourceManager.findAvailableSlots()
  - Purpose: Enable filtering slots by calendar via MCP
  - _Leverage: existing handleFindAvailableSlots implementation_
  - _Requirements: 5.2_

- [ ] 17. Update create_calendar_event handler with target calendar validation
  - File: `src/tools/calendar/handlers.ts`
  - Add validation for target calendar writability
  - Return error with alternatives if target is not writable
  - Purpose: Ensure events are only created on writable calendars
  - _Leverage: existing handleCreateCalendarEvent implementation_
  - _Requirements: 6.2, 6.3_

- [ ] 18. Register list_calendar_resources tool in MCP server
  - File: `src/index.ts`
  - Add list_calendar_resources to tool registration
  - Wire up handler to CalendarToolsContext
  - Purpose: Make calendar resource listing available via MCP server
  - _Leverage: existing tool registration patterns_
  - _Requirements: 1.1_

### Phase 5: 統合テスト

- [ ] 19. Add integration tests for list_calendar_resources MCP tool
  - File: `tests/tools/calendar/handlers.test.ts`
  - Test tool with mock CalendarSourceManager
  - Test source filtering
  - Test error handling for unavailable sources
  - Purpose: Ensure MCP tool works correctly end-to-end
  - _Leverage: existing handler test patterns_
  - _Requirements: 1.1, 1.2_

- [ ] 20. Add integration tests for calendarIds filtering
  - File: `tests/tools/calendar/handlers.test.ts`
  - Test list_calendar_events with calendarIds
  - Test find_available_slots with calendarIds
  - Test create_calendar_event with target calendar validation
  - Purpose: Ensure calendar filtering works correctly via MCP
  - _Leverage: existing handler test patterns_
  - _Requirements: 3.1, 5.2, 6.3_

## Task Dependencies

```
Phase 1: Types (1-4) - No dependencies
    ↓
Phase 2: EventKit (5-6) - Depends on Phase 1
    ↓
Phase 3: CalendarSourceManager (7-12) - Depends on Phase 1, 2
    ↓
Phase 4: MCP Tools (13-18) - Depends on Phase 3
    ↓
Phase 5: Integration Tests (19-20) - Depends on Phase 4
```

## Success Criteria

- [ ] `list_calendar_resources` ツールで全ソースのカレンダー一覧を取得できる
- [ ] `list_calendar_events` で特定カレンダーのみのイベントを取得できる
- [ ] `find_available_slots` で特定カレンダーのみを考慮した空き時間検索ができる
- [ ] `create_calendar_event` で宛先カレンダーを指定できる
- [ ] 一部ソースが利用不可でも他のソースからは正常に取得できる
- [ ] カレンダーリソース一覧取得が2秒以内に完了する
- [ ] 全テストがパスする
