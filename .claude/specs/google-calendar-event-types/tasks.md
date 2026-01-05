# Implementation Plan

## Task Overview

この実装は、Google Calendar API v3の全6つのイベントタイプ(`default`, `outOfOffice`, `focusTime`, `workingLocation`, `birthday`, `fromGmail`)をsageでサポートするための作業です。

実装は7つの主要コンポーネントに分かれており、各コンポーネントを小さなアトミックタスクに分解しています。各タスクは15-30分で完了可能な粒度に設計されています。

## Steering Document Compliance

- **structure.md**: ファイル配置規則に従い、`src/types/`, `src/integrations/`, `src/tools/`, `src/config/`, `tests/unit/`に配置
- **tech.md**: TypeScript Strict Mode、Zod validation、Jest testing、retryWithBackoffパターンを活用

## Atomic Task Requirements

各タスクは以下の基準を満たしています:
- **File Scope**: 1-3ファイルのみに触れる
- **Time Boxing**: 15-30分で完了可能
- **Single Purpose**: 1つのテスト可能な成果物
- **Specific Files**: 正確なファイルパスを指定
- **Agent-Friendly**: 明確な入出力、最小限のコンテキスト切り替え

## Tasks

### Phase 1: Type Definitions (Component 1)

- [x] 1. Create event type discriminated union in src/types/google-calendar-types.ts
  - File: src/types/google-calendar-types.ts
  - Add `GoogleCalendarEventType` type alias with 6 event types
  - Define `OutOfOfficeProperties`, `FocusTimeProperties`, `WorkingLocationProperties`, `BirthdayProperties` interfaces
  - Create `EventTypeSpecificProperties` discriminated union
  - Purpose: Establish TypeScript type safety for all event types
  - _Leverage: Existing GoogleCalendarEvent, CalendarEvent interfaces_
  - _Requirements: 1, 2, 3, 4, 6.2, 6.3, 8.1_

- [x] 2. Extend GoogleCalendarEvent interface with event type fields
  - File: src/types/google-calendar-types.ts
  - Add optional `eventType?: GoogleCalendarEventType` field to GoogleCalendarEvent
  - Add optional type-specific properties fields (outOfOfficeProperties?, focusTimeProperties?, etc.)
  - Purpose: Support all event type data from Google Calendar API
  - _Leverage: Existing GoogleCalendarEvent interface (lines 11-44)_
  - _Requirements: 1, 2, 3, 4, 5, 6.2_

- [x] 3. Extend CalendarEvent interface with event type support
  - File: src/types/google-calendar-types.ts
  - Add optional `eventType?: GoogleCalendarEventType` field to CalendarEvent interface
  - Add optional `typeSpecificProperties?: EventTypeSpecificProperties` field
  - Purpose: Provide unified format with event type information (backward compatible)
  - _Leverage: Existing CalendarEvent interface (lines 110-123)_
  - _Requirements: 6.2, 6.3, 9.3, 9.4_

### Phase 2: Validation (Component 3)

- [x] 4. Create Zod schemas for event type properties in src/config/validation.ts
  - File: src/config/validation.ts
  - Add `OutOfOfficePropertiesSchema` with autoDeclineMode enum validation
  - Add `FocusTimePropertiesSchema` with autoDeclineMode and chatStatus validation
  - Add `WorkingLocationPropertiesSchema` with type-specific property validation using refine()
  - Add `BirthdayPropertiesSchema` with type enum validation
  - Purpose: Runtime validation of event type-specific properties
  - _Leverage: Existing Zod validation patterns in src/config/validation.ts_
  - _Requirements: 1, 2, 3, 4, 8.2_

- [x] 5. Create CreateEventRequestSchema with event type validation
  - File: src/config/validation.ts
  - Extend existing request schema with `eventType?` field
  - Add optional event type properties fields
  - Add refine() to validate type-property matching (e.g., outOfOffice → outOfOfficeProperties)
  - Add refine() to reject fromGmail event creation
  - Add refine() to enforce all-day constraint for birthday/workingLocation
  - Purpose: Comprehensive validation of event creation requests
  - _Leverage: Existing validation schemas_
  - _Requirements: 4.4, 5.4, 6.4, 6.5, 8.2, 8.3_

### Phase 3: Event Conversion (Component 5)

- [x] 6. Create detectEventType() helper function in src/types/google-calendar-types.ts
  - File: src/types/google-calendar-types.ts
  - Add private function `detectEventType(googleEvent: GoogleCalendarEvent): GoogleCalendarEventType`
  - Check for eventType field in Google API response
  - Fallback detection logic: check for type-specific properties
  - Default to 'default' if no eventType detected
  - Purpose: Auto-detect event type from Google Calendar API response
  - _Leverage: None (new utility function)_
  - _Requirements: 6.2_

- [x] 7. Create extractTypeSpecificProperties() helper function in src/types/google-calendar-types.ts
  - File: src/types/google-calendar-types.ts
  - Add private function `extractTypeSpecificProperties(googleEvent: GoogleCalendarEvent, eventType: GoogleCalendarEventType): EventTypeSpecificProperties | undefined`
  - Extract outOfOfficeProperties, focusTimeProperties, workingLocationProperties, birthdayProperties based on eventType
  - Return undefined for 'default' and 'fromGmail' types
  - Purpose: Extract type-specific properties from Google Calendar event
  - _Leverage: None (new utility function)_
  - _Requirements: 6.3_

- [x] 8. Extend convertGoogleToCalendarEvent() with event type support
  - File: src/types/google-calendar-types.ts
  - Update existing convertGoogleToCalendarEvent() function (lines 131-146)
  - Call detectEventType() to determine eventType
  - Call extractTypeSpecificProperties() to get type-specific data
  - Add eventType and typeSpecificProperties to returned CalendarEvent
  - Preserve all existing fields (backward compatibility)
  - Purpose: Convert Google Calendar events to unified format with event type info
  - _Leverage: Existing convertGoogleToCalendarEvent() function_
  - _Requirements: 6.2, 6.3, 8.4, 9.3_

### Phase 4: GoogleCalendarService Extensions (Component 2)

- [x] 9. Extend ListEventsRequest interface in src/integrations/google-calendar-service.ts
  - File: src/integrations/google-calendar-service.ts
  - Add `eventTypes?: GoogleCalendarEventType[]` field to ListEventsRequest interface (lines 22-26)
  - Update JSDoc comments to document new parameter
  - Purpose: Support event type filtering in list requests
  - _Leverage: Existing ListEventsRequest interface_
  - _Requirements: 7.1_

- [x] 10. Extend CreateEventRequest interface in src/integrations/google-calendar-service.ts
  - File: src/integrations/google-calendar-service.ts
  - Add `eventType?: GoogleCalendarEventType` field to CreateEventRequest interface (lines 31-46)
  - Add optional type-specific properties fields
  - Update JSDoc comments
  - Purpose: Support event type specification in create requests
  - _Leverage: Existing CreateEventRequest interface_
  - _Requirements: 1, 2, 3, 4, 6.4_

- [x] 11. Add validateEventTypeProperties() private method in GoogleCalendarService
  - File: src/integrations/google-calendar-service.ts
  - Add private method `validateEventTypeProperties(eventType: GoogleCalendarEventType, request: CreateEventRequest): void`
  - Use CreateEventRequestSchema.parse() to validate
  - Throw descriptive Zod validation errors
  - Purpose: Runtime validation of event type and properties
  - _Leverage: CreateEventRequestSchema from src/config/validation.ts_
  - _Requirements: 6.5, 8.2, 8.3_

- [x] 12. Add buildEventTypePayload() private method in GoogleCalendarService
  - File: src/integrations/google-calendar-service.ts
  - Add private method `buildEventTypePayload(request: CreateEventRequest): Partial<calendar_v3.Schema$Event>`
  - Build eventType field
  - Build outOfOfficeProperties, focusTimeProperties, workingLocationProperties, birthdayProperties based on eventType
  - Return partial Google Calendar API payload
  - Purpose: Transform event type data to Google Calendar API format
  - _Leverage: None (new utility method)_
  - _Requirements: 1, 2, 3, 4_

- [x] 13. Update createEvent() to support event types in GoogleCalendarService
  - File: src/integrations/google-calendar-service.ts
  - Update createEvent() method (lines 262-358)
  - Call validateEventTypeProperties() before API call
  - Call buildEventTypePayload() to build eventType-specific fields
  - Merge eventType payload into eventBody
  - Use existing retryWithBackoff logic (no changes)
  - Purpose: Enable event type creation via Google Calendar API
  - _Leverage: Existing createEvent() method, retryWithBackoff utility_
  - _Requirements: 1.1, 2.1, 3.1, 4.4, 6.4_

- [x] 14. Update listEvents() to support event type filtering in GoogleCalendarService
  - File: src/integrations/google-calendar-service.ts
  - Update listEvents() method (lines 173-247)
  - After receiving events from API, filter by eventTypes parameter (client-side)
  - Use existing convertGoogleToCalendarEvent() for conversion (now includes eventType)
  - Keep existing pagination and retry logic unchanged
  - Purpose: Enable event type filtering in list operations
  - _Leverage: Existing listEvents() method, convertGoogleToCalendarEvent()_
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 15. Update updateEvent() to enforce event type restrictions in GoogleCalendarService
  - File: src/integrations/google-calendar-service.ts
  - Update updateEvent() method (lines 375-520)
  - Fetch existing event to determine current eventType
  - Validate update fields against eventType restrictions (birthday: summary/colorId/reminders/date only; fromGmail: limited fields)
  - Reject disallowed field updates with descriptive error
  - Purpose: Enforce Google Calendar API event type update restrictions
  - _Leverage: Existing updateEvent() method_
  - _Requirements: 4.5, 5.3, 6.6_

### Phase 5: Calendar Handler Extensions (Component 4)

- [x] 16. Extend ListCalendarEventsInput in src/tools/calendar/handlers.ts
  - File: src/tools/calendar/handlers.ts
  - Add `eventTypes?: string[]` field to ListCalendarEventsInput interface (lines 44-48)
  - Update JSDoc comments
  - Purpose: Accept event type filter parameter in MCP tool
  - _Leverage: Existing ListCalendarEventsInput interface_
  - _Requirements: 7.1_

- [x] 17. Extend CreateCalendarEventInput in src/tools/calendar/handlers.ts
  - File: src/tools/calendar/handlers.ts
  - Add `eventType?: string` field to CreateCalendarEventInput interface (lines 64-73)
  - Add event type-specific fields (autoDeclineMode?, declineMessage?, chatStatus?, workingLocationType?, workingLocationLabel?, birthdayType?)
  - Update JSDoc comments
  - Purpose: Accept event type and properties in MCP tool
  - _Leverage: Existing CreateCalendarEventInput interface_
  - _Requirements: 1, 2, 3, 4, 6.4_

- [x] 18. Update handleListCalendarEvents() to pass eventTypes filter
  - File: src/tools/calendar/handlers.ts
  - Update handleListCalendarEvents() function (lines 205-273)
  - Parse eventTypes parameter from args
  - Pass eventTypes to calendarSourceManager.getEvents()
  - Include eventType and typeSpecificProperties in response mapping
  - Purpose: Enable event type filtering via MCP tool
  - _Leverage: Existing handleListCalendarEvents() function_
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 19. Update handleCreateCalendarEvent() to support event types
  - File: src/tools/calendar/handlers.ts
  - Update handleCreateCalendarEvent() function (create new version)
  - Parse eventType and type-specific properties from args
  - Build CreateEventRequest with eventType and properties
  - Call calendarSourceManager.createEvent() (routes to GoogleCalendarService for non-default types)
  - Include eventType in response
  - Purpose: Enable event type creation via MCP tool
  - _Leverage: Existing handler pattern_
  - _Requirements: 1, 2, 3, 4, 6.4_

### Phase 6: Working Location Aware Scheduling (Component 7)

- [x] 20. Extend TimeSlot interface with working location context
  - File: src/integrations/calendar-source-manager.ts (or src/types/index.ts if TimeSlot is defined there)
  - Add `workingLocation?: { type: 'homeOffice' | 'officeLocation' | 'customLocation' | 'unknown'; label?: string }` field to TimeSlot interface
  - Purpose: Annotate time slots with working location information
  - _Leverage: Existing TimeSlot interface_
  - _Requirements: 3.7_

- [x] 21. Extend FindAvailableSlotsRequest with location preferences
  - File: src/integrations/calendar-source-manager.ts
  - Add `preferredWorkingLocation?: 'homeOffice' | 'officeLocation' | 'any'` field
  - Add `respectBlockingEventTypes?: boolean` field (default: true)
  - Purpose: Accept location preference and blocking behavior in find slots requests
  - _Leverage: Existing FindAvailableSlotsRequest interface_
  - _Requirements: 3.7, 7.5_

- [x] 22. Add filterBlockingEvents() private method in CalendarSourceManager
  - File: src/integrations/calendar-source-manager.ts
  - Add private method `filterBlockingEvents(events: CalendarEvent[], respectBlockingEventTypes: boolean): CalendarEvent[]`
  - Filter events with eventType in ['default', 'outOfOffice', 'focusTime']
  - Treat EventKit events (eventType=undefined) as 'default' (blocking)
  - Exclude workingLocation, birthday, fromGmail from blocking
  - Purpose: Determine which events block available time slots
  - _Leverage: None (new utility method)_
  - _Requirements: 7.5_

- [x] 23. Add annotateWithWorkingLocation() private method in CalendarSourceManager
  - File: src/integrations/calendar-source-manager.ts
  - Add private method `annotateWithWorkingLocation(slots: TimeSlot[], workingLocationEvents: CalendarEvent[]): TimeSlot[]`
  - Use timezone-aware date comparison (new Date().toISOString().split('T')[0])
  - Match slots to workingLocation events by date
  - Extract workingLocation type and label from typeSpecificProperties
  - Default to { type: 'unknown' } if no match
  - Purpose: Annotate time slots with working location information
  - _Leverage: None (new utility method)_
  - _Requirements: 3.7_

- [x] 24. Add filterByLocationPreference() private method in CalendarSourceManager
  - File: src/integrations/calendar-source-manager.ts
  - Add private method `filterByLocationPreference(slots: TimeSlot[], preferredLocation?: 'homeOffice' | 'officeLocation' | 'any'): TimeSlot[]`
  - Return all slots if preferredLocation is 'any' or undefined
  - Prioritize matching slots first, then other slots
  - Purpose: Sort time slots by working location preference
  - _Leverage: None (new utility method)_
  - _Requirements: 3.7_

- [x] 25. Update findAvailableSlots() to use working location filtering
  - File: src/integrations/calendar-source-manager.ts
  - Update findAvailableSlots() method
  - Call filterBlockingEvents() to respect outOfOffice/focusTime blocking
  - Filter workingLocation events separately
  - Call annotateWithWorkingLocation() to add location context
  - Call filterByLocationPreference() to sort by preference
  - Purpose: Integrate working location awareness into slot finding
  - _Leverage: Existing findAvailableSlots() method_
  - _Requirements: 3.7, 7.5_

### Phase 7: Working Cadence Integration (Component 6)

- [x] 26. Add analyzeFocusTimeEvents() private method in WorkingCadenceService
  - File: src/services/working-cadence.ts
  - Add private method `analyzeFocusTimeEvents(events: CalendarEvent[]): { focusTimeBlocks: Array<{day: string; duration: number}> }`
  - Filter events with eventType='focusTime'
  - Calculate total focus time per day of week
  - Return focus time statistics
  - Purpose: Extract focus time statistics from calendar events
  - _Leverage: None (new utility method)_
  - _Requirements: 7.6_

- [x] 27. Add enhanceDeepWorkDetection() private method in WorkingCadenceService
  - File: src/services/working-cadence.ts
  - Add private method `enhanceDeepWorkDetection(config: CalendarConfig, focusTimeBlocks: Array<{day: string; duration: number}>): string[]`
  - Combine config.deepWorkDays with days that have ≥4h focusTime events
  - Return enhanced list of deep work days
  - Purpose: Improve Deep Work Day detection using focusTime events
  - _Leverage: None (new utility method)_
  - _Requirements: 7.6_

- [x] 28. Update getWorkingCadence() to integrate focusTime analysis
  - File: src/services/working-cadence.ts
  - Update getWorkingCadence() method (lines 108-150)
  - Load calendar events from CalendarSourceManager
  - Call analyzeFocusTimeEvents() to get focus time statistics
  - Call enhanceDeepWorkDetection() to improve day type detection
  - Update recommendations to consider focusTime events
  - Purpose: Integrate focusTime events into Working Cadence analysis
  - _Leverage: Existing getWorkingCadence() method_
  - _Requirements: 2.7, 7.6_

### Phase 8: Unit Tests - Type Definitions and Conversion

- [x] 29. Create test file for event type conversion in tests/unit/google-calendar-types.test.ts
  - File: tests/unit/google-calendar-types.test.ts (new file)
  - Test detectEventType() with all 6 event types
  - Test extractTypeSpecificProperties() for each type
  - Test convertGoogleToCalendarEvent() preserves existing fields (backward compatibility)
  - Test convertGoogleToCalendarEvent() adds eventType and typeSpecificProperties
  - Purpose: Verify event type detection and conversion logic
  - _Leverage: Jest testing framework, existing test patterns_
  - _Requirements: 6.2, 6.3, 8.4, 9.3_

### Phase 9: Unit Tests - Validation

- [x] 30. Create test file for Zod schemas in tests/unit/event-type-validator.test.ts
  - File: tests/unit/event-type-validator.test.ts (new file)
  - Test OutOfOfficePropertiesSchema accepts valid values, rejects invalid autoDeclineMode
  - Test FocusTimePropertiesSchema validates chatStatus enum
  - Test WorkingLocationPropertiesSchema validates type-property matching (homeOffice requires homeOffice: true)
  - Test BirthdayPropertiesSchema validates type enum
  - Test CreateEventRequestSchema type-property matching refinement
  - Test CreateEventRequestSchema rejects fromGmail creation
  - Test CreateEventRequestSchema enforces all-day constraint for birthday/workingLocation
  - Purpose: Verify Zod schema validation rules
  - _Leverage: Jest, Zod testing patterns_
  - _Requirements: 8.2, 8.3_

### Phase 10: Unit Tests - GoogleCalendarService

- [x] 31. Add tests for createEvent() with outOfOffice type in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test creates outOfOffice event with autoDeclineMode
  - Test creates outOfOffice event with custom declineMessage
  - Test rejects invalid autoDeclineMode values
  - Mock Google Calendar API events.insert() response
  - Purpose: Verify outOfOffice event creation
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 32. Add tests for createEvent() with focusTime type in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test creates focusTime event with chatStatus
  - Test creates focusTime event with autoDeclineMode
  - Test rejects invalid chatStatus values
  - Mock Google Calendar API events.insert() response
  - Purpose: Verify focusTime event creation
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 33. Add tests for createEvent() with workingLocation type in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test creates homeOffice workingLocation event
  - Test creates officeLocation workingLocation event with buildingId
  - Test creates customLocation workingLocation event
  - Test rejects mismatched type and properties
  - Test enforces all-day constraint
  - Mock Google Calendar API events.insert() response
  - Purpose: Verify workingLocation event creation
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 34. Add tests for createEvent() with birthday type in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test creates birthday event with yearly recurrence
  - Test enforces all-day constraint
  - Mock Google Calendar API events.insert() response
  - Purpose: Verify birthday event creation
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 4.4_

- [x] 35. Add test for createEvent() rejecting fromGmail type in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test rejects fromGmail creation with descriptive error
  - Verify error message matches Zod validation error
  - Purpose: Verify fromGmail creation is properly rejected
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 5.4_

- [x] 36. Add tests for listEvents() with event type filtering in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test returns only focusTime events when eventTypes=["focusTime"]
  - Test returns outOfOffice + focusTime when eventTypes=["outOfOffice", "focusTime"]
  - Test returns all event types when eventTypes is not provided
  - Test handles empty result when no events match filter
  - Mock Google Calendar API events.list() response with multiple event types
  - Purpose: Verify event type filtering in list operations
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 37. Add tests for updateEvent() with event type restrictions in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test allows updating summary of birthday event
  - Test rejects updating location of birthday event
  - Test allows updating colorId of fromGmail event
  - Test rejects updating start/end of fromGmail event
  - Mock Google Calendar API events.get() and events.patch() responses
  - Purpose: Verify event type update restrictions
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 4.5, 5.3, 6.6_

### Phase 11: Unit Tests - Working Cadence and Backward Compatibility

- [x] 38. Add tests for Working Cadence with focusTime in tests/unit/working-cadence.test.ts
  - File: tests/unit/working-cadence.test.ts (extend existing)
  - Test detects Deep Work Day when ≥4h focusTime events exist
  - Test combines config.deepWorkDays with focusTime analysis
  - Test recommends scheduling focusTime on low-meeting days
  - Mock CalendarSourceManager.getEvents() to return focusTime events
  - Purpose: Verify focusTime integration into Working Cadence
  - _Leverage: Existing WorkingCadenceService test suite_
  - _Requirements: 7.6_

- [x] 39. Add backward compatibility tests in tests/unit/google-calendar-service.test.ts
  - File: tests/unit/google-calendar-service.test.ts (extend existing)
  - Test handles CalendarEvent without eventType field (undefined)
  - Test defaults to 'default' eventType when creating events without specifying type
  - Test maintains all existing CalendarEvent fields in responses
  - Purpose: Verify backward compatibility with existing code
  - _Leverage: Existing GoogleCalendarService test suite_
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

### Phase 12: Unit Tests - Working Location Aware Scheduling

- [x] 40. Add tests for filterBlockingEvents() in tests/unit/calendar-source-manager.test.ts
  - File: tests/unit/calendar-source-manager.test.ts (extend existing or create new)
  - Test respects outOfOffice events as blocking time
  - Test respects focusTime events as blocking time
  - Test respects default events (meetings) as blocking time
  - Test does NOT treat workingLocation events as blocking time
  - Test does NOT treat birthday events as blocking time
  - Test does NOT treat fromGmail events as blocking time
  - Test allows overriding blocking behavior with respectBlockingEventTypes=false
  - Purpose: Verify event type blocking semantics
  - _Leverage: Jest testing framework_
  - _Requirements: 7.5_

- [x] 41. Add tests for annotateWithWorkingLocation() in tests/unit/calendar-source-manager.test.ts
  - File: tests/unit/calendar-source-manager.test.ts (extend existing or create new)
  - Test annotates time slots with working location type
  - Test handles slots on days without workingLocation events (type: 'unknown')
  - Test includes workingLocation label in slot metadata
  - Test timezone-aware date matching
  - Purpose: Verify working location annotation logic
  - _Leverage: Jest testing framework_
  - _Requirements: 3.7_

- [x] 42. Add tests for filterByLocationPreference() in tests/unit/calendar-source-manager.test.ts
  - File: tests/unit/calendar-source-manager.test.ts (extend existing or create new)
  - Test prioritizes homeOffice slots when preferredWorkingLocation="homeOffice"
  - Test prioritizes officeLocation slots when preferredWorkingLocation="officeLocation"
  - Test returns all slots when preferredWorkingLocation="any"
  - Purpose: Verify location preference filtering
  - _Leverage: Jest testing framework_
  - _Requirements: 3.7_

### Phase 13: Integration Tests

- [x] 43. Create integration test for end-to-end outOfOffice workflow in tests/integration/google-calendar-event-types.test.ts
  - File: tests/integration/google-calendar-event-types.test.ts (new file)
  - Test: Create outOfOffice event → List with filter → Update → Delete
  - Mock Google Calendar API responses for all operations
  - Verify outOfOfficeProperties are preserved throughout workflow
  - Purpose: Verify complete outOfOffice event lifecycle
  - _Leverage: Existing integration test patterns_
  - _Requirements: 1_

- [x] 44. Create integration test for focusTime and Working Cadence in tests/integration/google-calendar-event-types.test.ts
  - File: tests/integration/google-calendar-event-types.test.ts (extend)
  - Test: Create focusTime events on Monday → Call getWorkingCadence() → Verify Monday is detected as Deep Work Day
  - Mock CalendarSourceManager and Google Calendar API
  - Purpose: Verify focusTime integration with Working Cadence
  - _Leverage: Existing integration test patterns_
  - _Requirements: 2.7, 7.6_

- [x] 45. Create integration test for workingLocation and find_available_slots in tests/integration/google-calendar-event-types.test.ts
  - File: tests/integration/google-calendar-event-types.test.ts (extend)
  - Test: Create workingLocation event (homeOffice) → Call findAvailableSlots with preferredWorkingLocation="homeOffice" → Verify slots are annotated
  - Mock CalendarSourceManager and Google Calendar API
  - Purpose: Verify workingLocation integration with slot finding
  - _Leverage: Existing integration test patterns_
  - _Requirements: 3.7, 7.5_

- [x] 46. Create integration test for CalendarSourceManager multi-source merging in tests/integration/google-calendar-event-types.test.ts
  - File: tests/integration/google-calendar-event-types.test.ts (extend)
  - Test: Create focusTime event in Google Calendar → List via CalendarSourceManager → Verify eventType is preserved
  - Test: EventKit events are marked as eventType='default'
  - Test: Deduplication works correctly with eventType field
  - Mock both EventKit and Google Calendar services
  - Purpose: Verify multi-source calendar merging with event types
  - _Leverage: Existing CalendarSourceManager integration tests_
  - _Requirements: 6.1_

### Phase 14: E2E Tests (Optional - can be done in parallel with other phases)

- [x] 47. Create E2E test for list_calendar_events with eventTypes filter in tests/e2e/calendar-event-types-mcp.test.ts
  - File: tests/e2e/calendar-event-types-mcp.test.ts (new file)
  - Test: Call MCP tool list_calendar_events with eventTypes=["focusTime"]
  - Verify response contains only focusTime events
  - Verify eventType field is included in response
  - Use actual MCP server and HTTP transport
  - Purpose: Verify MCP tool integration with event type filtering
  - _Leverage: Existing E2E test patterns from tests/e2e/_
  - _Requirements: 7.1, 7.2_

- [x] 48. Create E2E test for create_calendar_event with eventType in tests/e2e/calendar-event-types-mcp.test.ts
  - File: tests/e2e/calendar-event-types-mcp.test.ts (extend)
  - Test: Call MCP tool create_calendar_event with eventType="outOfOffice" and autoDeclineMode
  - Verify event is created in Google Calendar (mock or actual API)
  - Verify response includes typeSpecificProperties
  - Use actual MCP server and HTTP transport
  - Purpose: Verify MCP tool integration with event type creation
  - _Leverage: Existing E2E test patterns_
  - _Requirements: 1, 6.4_

### Phase 15: Documentation and Cleanup

- [x] 49. Update README.md with event type examples (optional)
  - File: README.md
  - Add section explaining supported event types
  - Include examples for creating each event type via MCP tools
  - Purpose: Document new event type features for users
  - _Leverage: Existing README structure_
  - _Requirements: Usability (Non-Functional)_

- [x] 50. Run full test suite and verify 98%+ coverage
  - File: N/A (command: npm test)
  - Run `npm test` to execute all unit, integration, and E2E tests
  - Run `npm run test:coverage` to verify 98%+ coverage
  - Fix any failing tests or coverage gaps
  - Purpose: Ensure all tests pass and coverage target is met
  - _Leverage: Jest testing framework, existing test scripts_
  - _Requirements: 8 (Non-Functional: Test Coverage)_
