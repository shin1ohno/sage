# Implementation Plan: update-calendar-event

## Task Overview

`update_calendar_event` MCP ツールを実装する。既存の `GoogleCalendarService.updateEvent()` を活用し、ハンドラ追加と MCP 登録を行う。

## Steering Document Compliance

- **structure.md**: ハンドラは `src/tools/calendar/handlers.ts`、共有定義は `src/tools/shared/`、テストは `tests/unit/` と `tests/integration/`
- **tech.md**: TypeScript strict mode、Zod バリデーション、Jest テスト

## Atomic Task Requirements

各タスクは以下の基準を満たす:
- **File Scope**: 1-3 ファイル
- **Time Boxing**: 15-30分
- **Single Purpose**: 1つのテスト可能なアウトカム
- **Specific Files**: 具体的なファイルパス指定
- **Agent-Friendly**: 明確な入出力

## Tasks

### Phase 1: 共有ツール定義

- [ ] 1. Create shared tool definition file
  - **File**: `src/tools/shared/calendar-tools.ts` (新規作成)
  - Define `updateCalendarEventTool` using `defineTool()` pattern from `room-tools.ts`
  - Include Zod schema with all input fields: eventId, title, startDate, endDate, location, notes, attendees, alarms, roomId, removeRoom, autoDeclineMode, declineMessage, chatStatus, calendarName
  - Export tool definition
  - **Purpose**: Establish shared tool definition for both stdio and remote modes
  - _Leverage: `src/tools/shared/room-tools.ts`, `src/tools/shared/types.ts`_
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 2. Update shared tools index export
  - **File**: `src/tools/shared/index.ts` (修正)
  - Add export for `updateCalendarEventTool` from `calendar-tools.ts`
  - **Purpose**: Make shared definition accessible from index
  - _Leverage: `src/tools/shared/index.ts`_
  - _Requirements: 8.3_

### Phase 2: ハンドラ実装

- [ ] 3. Add UpdateCalendarEventInput interface
  - **File**: `src/tools/calendar/handlers.ts` (修正)
  - Add `UpdateCalendarEventInput` interface after existing input types (around line 100)
  - Include all fields: eventId, title, startDate, endDate, location, notes, attendees, alarms, roomId, removeRoom, autoDeclineMode, declineMessage, chatStatus, calendarName, source
  - **Purpose**: Type-safe input handling for the handler
  - _Leverage: `CreateCalendarEventInput` pattern in same file_
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

- [ ] 4. Implement handleUpdateCalendarEvent function
  - **File**: `src/tools/calendar/handlers.ts` (修正)
  - Add function after `handleDeleteCalendarEventsBatch` (around line 1018)
  - Implement: config check, service initialization, input validation
  - Handle room addition/change/removal via attendees array
  - Call `GoogleCalendarService.updateEvent()` with converted request
  - Return success response with updated event details
  - **Purpose**: Core business logic for event updates
  - _Leverage: `handleCreateCalendarEvent`, `handleDeleteCalendarEvent` patterns_
  - _Requirements: 1.1-1.3, 2.1-2.4, 3.1-3.4, 4.1-4.2, 5.1-5.2, 6.1-6.3, 7.1-7.4_

- [ ] 5. Export handleUpdateCalendarEvent from handlers
  - **File**: `src/tools/calendar/handlers.ts` (修正)
  - Ensure function is exported (should be automatic with `export async function`)
  - Verify export is accessible
  - **Purpose**: Make handler available for tool registration
  - _Leverage: existing export pattern_
  - _Requirements: 8.1, 8.2_

### Phase 3: MCP ツール登録

- [ ] 6. Register update_calendar_event in index.ts (stdio mode)
  - **File**: `src/index.ts` (修正)
  - Import `updateCalendarEventTool` from shared definitions
  - Import `handleUpdateCalendarEvent` from handlers
  - Add `server.tool()` registration using shared definition's name, description, schema.shape
  - Place after `delete_calendar_events_batch` registration
  - **Purpose**: Enable tool in stdio mode (Claude Desktop local)
  - _Leverage: `searchRoomAvailabilityTool` registration pattern_
  - _Requirements: 8.1_

- [ ] 7. Register update_calendar_event in mcp-handler.ts (remote mode)
  - **File**: `src/cli/mcp-handler.ts` (修正)
  - Import `updateCalendarEventTool` from shared definitions
  - Import `handleUpdateCalendarEvent` from handlers
  - Add tool to `TOOL_DEFINITIONS` array using `toJsonSchema()`
  - Add case in `handleToolCall` switch statement
  - **Purpose**: Enable tool in remote mode (Claude iOS/Web)
  - _Leverage: `searchRoomAvailabilityTool` registration pattern_
  - _Requirements: 8.2_

### Phase 4: ユニットテスト

- [ ] 8. Create unit test file for update handler
  - **File**: `tests/unit/update-calendar-event.test.ts` (新規作成)
  - Set up test structure with Jest describe blocks
  - Mock `GoogleCalendarService` and `CalendarToolsContext`
  - Add test for basic title update
  - Add test for date/time update
  - **Purpose**: Verify basic update functionality
  - _Leverage: `tests/unit/google-calendar-room-service.test.ts` patterns_
  - _Requirements: 1.1, 2.1_

- [ ] 9. Add room management tests
  - **File**: `tests/unit/update-calendar-event.test.ts` (修正)
  - Add test for room addition (roomId specified)
  - Add test for room change (existing room replaced)
  - Add test for room removal (removeRoom: true)
  - Add test for room error when not Google source
  - **Purpose**: Verify room handling logic
  - _Leverage: existing test patterns_
  - _Requirements: 3.1-3.4_

- [ ] 10. Add error handling tests
  - **File**: `tests/unit/update-calendar-event.test.ts` (修正)
  - Add test for event not found (404)
  - Add test for config not set
  - Add test for event type restrictions (birthday, fromGmail)
  - Add test for date validation (start > end)
  - **Purpose**: Verify error scenarios
  - _Leverage: existing test patterns_
  - _Requirements: 1.3, 2.4, 6.1-6.3_

### Phase 5: 統合テスト

- [ ] 11. Create integration test file
  - **File**: `tests/integration/update-calendar-event.test.ts` (新規作成)
  - Set up integration test structure
  - Add test for full update flow with mocked Google API
  - Add test for room addition flow
  - Add test for source parameter handling
  - **Purpose**: Verify end-to-end tool behavior
  - _Leverage: `tests/integration/room-availability.test.ts` patterns_
  - _Requirements: 7.1-7.4, 8.1-8.2_

### Phase 6: Tool Parity 検証

- [ ] 12. Verify tool parity test passes
  - **File**: `tests/unit/tool-parity.test.ts` (検証のみ)
  - Run `npm test -- tool-parity` to verify both modes have matching tools
  - Fix any parity issues if test fails
  - **Purpose**: Ensure stdio and remote modes are in sync
  - _Leverage: existing parity test_
  - _Requirements: 8.3_

### Phase 7: 最終検証

- [ ] 13. Run full test suite and fix issues
  - **Files**: All test files
  - Run `npm test` to execute full test suite
  - Fix any failing tests
  - Ensure coverage thresholds are met
  - **Purpose**: Verify all tests pass
  - _Requirements: All_

- [ ] 14. Build and verify no TypeScript errors
  - **Files**: All source files
  - Run `npm run build` to compile TypeScript
  - Fix any type errors
  - **Purpose**: Ensure production build succeeds
  - _Requirements: All_

## Task Dependencies

```
1 → 2 (shared definitions)
3 → 4 → 5 (handler implementation)
1,2,5 → 6,7 (tool registration - can be parallel)
5 → 8 → 9 → 10 (unit tests - sequential)
6,7 → 11 (integration tests)
6,7 → 12 (parity verification)
10,11,12 → 13 → 14 (final verification)
```

## Estimated Total: 14 tasks
