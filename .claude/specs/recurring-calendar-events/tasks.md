# Implementation Plan

## Task Overview

定期イベント（Recurring Events）機能を実装するためのタスクリストです。既存のGoogle Calendar統合を拡張し、RRULEベースの繰り返しイベントの作成・更新・削除をサポートします。

## Steering Document Compliance

- **Types**: `src/types/google-calendar-types.ts`に追加
- **Validation**: `src/config/validation.ts`に追加
- **Service**: `src/integrations/google-calendar-service.ts`を拡張
- **Handlers**: `src/tools/calendar/handlers.ts`を拡張
- **Tool Definitions**: `src/tools/shared/calendar-tools.ts`を拡張

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

## Tasks

### Phase 1: Type Definitions

- [x] 1. Add RecurrenceScope type to google-calendar-types.ts
  - File: `src/types/google-calendar-types.ts`
  - Add `RecurrenceScope` type: `'thisEvent' | 'thisAndFuture' | 'allEvents'`
  - Add `recurrence?: string[]` to `GoogleCalendarEvent` interface
  - Export new types
  - Purpose: Establish type safety for recurrence operations
  - _Leverage: existing type patterns in src/types/google-calendar-types.ts (lines 16-22)_
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

- [x] 2. Add recurrence fields to CalendarEvent type
  - File: `src/types/google-calendar-types.ts`
  - Add `recurrence?: string[]` field to `CalendarEvent` interface
  - Add `recurringEventId?: string` field to `CalendarEvent` interface
  - Add `recurrenceDescription?: string` field to `CalendarEvent` interface
  - Purpose: Include recurrence info in unified CalendarEvent
  - _Leverage: existing CalendarEvent interface in src/types/google-calendar-types.ts_
  - _Requirements: 6.1, 6.2, 6.3_

### Phase 2: RRULE Validation

- [x] 3. Create RRULE validation utilities
  - File: `src/utils/recurrence-validator.ts` (new)
  - Implement `parseRRULE(rrule: string): ParsedRRULE | null`
  - Implement `validateRecurrenceRules(rules: string[]): ValidationResult`
  - Check FREQ is present and valid (DAILY/WEEKLY/MONTHLY/YEARLY)
  - Check INTERVAL is positive integer
  - Check COUNT/UNTIL are mutually exclusive
  - Check BYDAY contains valid day codes
  - Purpose: Validate RRULE syntax before API calls
  - _Leverage: src/config/validation.ts for validation patterns_
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 4. Create describeRecurrence utility
  - File: `src/utils/recurrence-validator.ts` (continue)
  - Implement `describeRecurrence(rules: string[]): string`
  - Generate Japanese descriptions for RRULE patterns
  - Handle FREQ, INTERVAL, BYDAY, BYMONTHDAY, COUNT, UNTIL
  - Purpose: Provide human-readable recurrence descriptions
  - _Leverage: parseRRULE from task 3_
  - _Requirements: 6.3_

- [x] 5. Add Zod schema for recurrence validation
  - File: `src/config/validation.ts`
  - Add `RecurrenceRuleSchema` for RRULE string validation
  - Extend `CreateEventRequestSchema` with `recurrence?: string[]`
  - Add `validateRecurrence(rules: string[])` function
  - Purpose: Integrate RRULE validation with Zod
  - _Leverage: existing Zod patterns in src/config/validation.ts (lines 200-250)_
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 6. Add unit tests for recurrence validator
  - File: `tests/unit/recurrence-validator.test.ts` (new)
  - Test valid RRULE parsing (DAILY, WEEKLY, MONTHLY, YEARLY)
  - Test invalid RRULE detection (missing FREQ, invalid values)
  - Test COUNT/UNTIL exclusivity
  - Test describeRecurrence output for various patterns
  - Purpose: Ensure validator reliability
  - _Leverage: tests/unit/config-validation.test.ts for test patterns_
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

### Phase 3: Service Layer - Create

- [x] 7. Extend GoogleCalendarService.createEvent for recurrence
  - File: `src/integrations/google-calendar-service.ts`
  - Add `recurrence` to event body if provided in request
  - Pass through to Google Calendar API
  - Purpose: Enable recurring event creation
  - _Leverage: existing createEvent method (lines 521-629)_
  - _Requirements: 1.1, 1.2_

- [x] 8. Update convertGoogleToCalendarEvent for recurrence
  - File: `src/types/google-calendar-types.ts`
  - Extract `recurrence` array from Google event
  - Extract `recurringEventId` from Google event
  - Call `describeRecurrence()` to generate description
  - Purpose: Include recurrence info in response
  - _Leverage: existing convertGoogleToCalendarEvent function (lines 200-250)_
  - _Requirements: 6.1, 6.2, 6.3_

### Phase 4: Service Layer - Update

- [x] 9. Add scope parameter to GoogleCalendarService.updateEvent
  - File: `src/integrations/google-calendar-service.ts`
  - Add optional `scope?: RecurrenceScope` parameter (backward compatible)
  - Implement `determineUpdateScope()` helper function
  - Purpose: Support scope-based updates
  - _Leverage: existing updateEvent method (lines 690-886)_
  - _Requirements: 2.1, 2.4, 3.1, 4.1_

- [x] 10. Implement updateSingleInstance logic
  - File: `src/integrations/google-calendar-service.ts`
  - When `scope === 'thisEvent'`, patch the specific instance
  - Use instance eventId directly
  - Purpose: Update single occurrence only
  - _Leverage: existing patch logic in updateEvent (lines 829-877)_
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 11. Implement updateAllEvents logic
  - File: `src/integrations/google-calendar-service.ts`
  - When `scope === 'allEvents'`, get parent event using `recurringEventId`
  - Patch the parent event
  - Purpose: Update entire series
  - _Leverage: existing getEvent (lines 631-688) and patch logic_
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 12. Implement splitAndUpdateSeries for thisAndFuture
  - File: `src/integrations/google-calendar-service.ts`
  - Add `splitRecurringSeries()` private method
  - Update parent event RRULE with UNTIL before selected instance
  - Create new recurring event starting from selected instance
  - Purpose: Split series for "this and future" updates
  - _Leverage: existing createEvent and updateEvent methods_
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

### Phase 5: Service Layer - Delete

- [x] 13. Add scope parameter to GoogleCalendarService.deleteEvent
  - File: `src/integrations/google-calendar-service.ts`
  - Add optional `scope?: RecurrenceScope` parameter (backward compatible)
  - Implement `determineDeleteScope()` helper function
  - Purpose: Support scope-based deletions
  - _Leverage: existing deleteEvent method (lines 888-971)_
  - _Requirements: 5.1, 5.5_

- [x] 14. Implement delete with scope logic
  - File: `src/integrations/google-calendar-service.ts`
  - `thisEvent`: Delete specific instance
  - `thisAndFuture`: Update parent RRULE with UNTIL, no new series
  - `allEvents`: Delete parent event (deletes all instances)
  - Purpose: Handle all delete scopes
  - _Leverage: existing delete and update logic_
  - _Requirements: 5.2, 5.3, 5.4_

### Phase 6: Source Manager Integration

- [x] 15. Extend CalendarSourceManager for recurrence routing
  - File: `src/integrations/calendar-source-manager.ts`
  - Add recurrence check in createEvent method
  - Return error for non-Google Calendar recurrence requests
  - Purpose: Route recurring events to Google Calendar only
  - _Leverage: existing CalendarSourceManager.createEvent_
  - _Requirements: 1.4_

### Phase 7: Handler Extensions

- [x] 16. Extend handleCreateCalendarEvent for recurrence
  - File: `src/tools/calendar/handlers.ts`
  - Add `recurrence?: string[]` to input interface
  - Validate recurrence rules using validator
  - Check Google Calendar is available for recurrence
  - Pass recurrence to service
  - Purpose: Enable recurring event creation via MCP
  - _Leverage: existing handleCreateCalendarEvent (lines 680-924)_
  - _Requirements: 1.1, 1.4_

- [x] 17. Extend handleUpdateCalendarEvent for scope
  - File: `src/tools/calendar/handlers.ts`
  - Add `updateScope?: RecurrenceScope` to input interface
  - Pass scope to service updateEvent
  - Purpose: Enable scoped updates via MCP
  - _Leverage: existing handleUpdateCalendarEvent (lines 1055-1258)_
  - _Requirements: 2.1, 2.4, 3.1, 4.1, 4.4_

- [x] 18. Extend handleDeleteCalendarEvent for scope
  - File: `src/tools/calendar/handlers.ts`
  - Add `deleteScope?: RecurrenceScope` to input interface
  - Pass scope to service deleteEvent
  - Purpose: Enable scoped deletions via MCP
  - _Leverage: existing handleDeleteCalendarEvent_
  - _Requirements: 5.1, 5.5_

### Phase 8: Tool Definitions

- [x] 19. Update create_calendar_event in src/index.ts
  - File: `src/index.ts`
  - Add `recurrence` parameter to create_calendar_event schema
  - Update tool description to mention recurrence
  - Purpose: Expose recurrence parameter in MCP (stdio mode)
  - _Leverage: existing create_calendar_event tool definition_
  - _Requirements: 1.1_

- [x] 20. Update create_calendar_event in mcp-handler.ts
  - File: `src/cli/mcp-handler.ts`
  - Add `recurrence` parameter to create_calendar_event schema
  - Update tool description to mention recurrence
  - Purpose: Expose recurrence parameter in MCP (remote mode)
  - _Leverage: existing create_calendar_event tool definition_
  - _Requirements: 1.1_

- [x] 21. Update update_calendar_event tool definition
  - File: `src/tools/shared/calendar-tools.ts`
  - Add `updateScope` parameter to schema
  - Update tool description for recurring events
  - Purpose: Expose updateScope parameter in MCP
  - _Leverage: existing updateCalendarEventTool (lines 15-75)_
  - _Requirements: 2.1, 3.1, 4.1_

- [x] 22. Update delete_calendar_event in src/index.ts
  - File: `src/index.ts`
  - Add `deleteScope` parameter to delete_calendar_event schema
  - Update tool description for recurring events
  - Purpose: Expose deleteScope parameter in MCP (stdio mode)
  - _Leverage: existing delete_calendar_event tool definition_
  - _Requirements: 5.1_

- [x] 23. Update delete_calendar_event in mcp-handler.ts
  - File: `src/cli/mcp-handler.ts`
  - Add `deleteScope` parameter to delete_calendar_event schema
  - Update tool description for recurring events
  - Purpose: Expose deleteScope parameter in MCP (remote mode)
  - _Leverage: existing delete_calendar_event tool definition_
  - _Requirements: 5.1_

### Phase 9: Testing

- [x] 24. Add recurrence validator unit tests
  - File: `tests/unit/recurrence-validator.test.ts` (if not complete in task 6)
  - Comprehensive tests for all validation scenarios
  - Purpose: Ensure complete test coverage for validator
  - _Leverage: tests/unit/config-validation.test.ts_
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 25. Add handler recurrence tests
  - File: `tests/unit/tools/calendar-handlers.test.ts`
  - Test recurrence parameter handling in create handler
  - Test Google Calendar requirement for recurrence
  - Purpose: Ensure create handler reliability
  - _Leverage: tests/unit/tools/calendar-handlers.test.ts_
  - _Requirements: 1.4_

- [x] 26. Add handler scope tests
  - File: `tests/unit/tools/calendar-handlers.test.ts`
  - Test updateScope parameter handling
  - Test deleteScope parameter handling
  - Purpose: Ensure scope handling reliability
  - _Leverage: tests/unit/tools/calendar-handlers.test.ts_
  - _Requirements: 2.4, 4.4, 5.5_

- [x] 27. Add GoogleCalendarService recurrence tests
  - File: `tests/unit/google-calendar-service.test.ts`
  - Test createEvent with recurrence
  - Test determineUpdateScope and determineDeleteScope
  - Purpose: Ensure service layer reliability
  - _Leverage: tests/unit/google-calendar-service.test.ts_
  - _Requirements: 1.1, 2.1, 4.1, 5.1_

- [x] 28. Add integration tests for recurring events
  - File: `tests/integration/google-calendar-recurrence.test.ts` (new)
  - Test end-to-end recurring event creation
  - Test single instance modification
  - Test series split (thisAndFuture)
  - Test series deletion
  - Purpose: Validate full flow with mocked API
  - _Leverage: tests/integration/google-calendar-integration.test.ts_
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

### Phase 10: Documentation

- [x] 29. Update TROUBLESHOOTING.md for recurrence
  - File: `docs/TROUBLESHOOTING.md`
  - Add "定期イベントの問題" section
  - Document common RRULE errors
  - Document Google Calendar requirement
  - Document scope behavior
  - Purpose: Help users troubleshoot recurrence issues
  - _Leverage: existing troubleshooting format in docs/TROUBLESHOOTING.md_
  - _Requirements: NFR Usability_

## Task Dependencies

```
Phase 1 (Types): 1 → 2
Phase 2 (Validation): 3 → 4 → 5 → 6
Phase 3 (Create): 7 → 8 (depends on Phase 2: task 4)
Phase 4 (Update): 9 → 10, 11, 12
Phase 5 (Delete): 13 → 14
Phase 6 (Source Manager): 15 (after Phase 3)
Phase 7 (Handlers): 16, 17, 18 (after Phase 4-6)
Phase 8 (Tools): 19, 20, 21, 22, 23 (after Phase 7)
Phase 9 (Tests): 24, 25, 26, 27, 28 (after Phase 7-8)
Phase 10 (Docs): 29 (after Phase 9)
```

## Test Results

_To be updated after implementation_

```
Build: ⏳ Pending
Unit Tests: ⏳ Pending
Integration Tests: ⏳ Pending
```
