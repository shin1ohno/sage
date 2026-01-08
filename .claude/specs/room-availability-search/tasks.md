# Implementation Plan: Room Availability Search

## Task Overview

Google Calendar の Freebusy API と CalendarList API を活用して、会議室の空き状況検索機能を実装します。既存の `GoogleCalendarService` パターンを踏襲し、新しい `GoogleCalendarRoomService` を作成します。

## Steering Document Compliance

- **structure.md**: `src/integrations/` にサービスクラス、`src/types/` に型定義を配置
- **tech.md**: TypeScript strict mode、Zod バリデーション、retryWithBackoff パターンを使用

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

## Tasks

### Phase 1: Types and Interfaces

- [x] 1. Add room resource types to google-calendar-types.ts
  - File: `src/types/google-calendar-types.ts`
  - Add `RoomResource` interface (id, name, email, capacity, features, building, floor, description)
  - Add `RoomResourceFilter` interface (minCapacity, building, floor, features)
  - Add `RoomAvailabilityRequest` interface (startTime, endTime, durationMinutes, filters)
  - Add `RoomAvailability` interface (room, isAvailable, busyPeriods)
  - Add `SingleRoomAvailability` interface (extends RoomAvailability with requestedPeriod)
  - Purpose: Type safety for room availability feature
  - _Leverage: existing interfaces in `src/types/google-calendar-types.ts`_
  - _Requirements: 1.9_

- [x] 2. Add Zod validation schemas for room search parameters
  - File: `src/config/validation.ts`
  - Add `roomAvailabilityRequestSchema` with startTime (required), endTime (optional), durationMinutes (optional), filters
  - Add `checkRoomAvailabilitySchema` with roomId, startTime, endTime (all required)
  - Add custom refinement: either endTime or durationMinutes must be specified
  - Purpose: Runtime validation of MCP tool inputs
  - _Leverage: existing Zod patterns in `src/config/validation.ts`_
  - _Requirements: 1.1, 1.2, 2.1_

### Phase 2: Core Service Implementation

- [x] 3. Create GoogleCalendarRoomService class skeleton
  - File: `src/integrations/google-calendar-room-service.ts` (new file)
  - Create class with constructor accepting `GoogleCalendarService`
  - Add method signatures: `searchRoomAvailability()`, `checkRoomAvailability()`
  - Add private method signatures: `fetchRoomResources()`, `queryFreebusy()`, `sortByCapacityMatch()`
  - Import types from `google-calendar-types.ts`
  - Purpose: Establish service structure
  - _Leverage: `src/integrations/google-calendar-service.ts` class structure_
  - _Requirements: 1.1, 2.1_

- [x] 4. Implement fetchRoomResources private method
  - File: `src/integrations/google-calendar-room-service.ts`
  - Use CalendarList API to fetch calendars with `minAccessRole: 'freeBusyReader'`
  - Filter calendars to identify room resources (by naming pattern or metadata)
  - Apply filters: minCapacity, building, floor, features
  - Return `RoomResource[]`
  - Purpose: Discover available meeting rooms in the organization
  - _Leverage: `GoogleCalendarService.getCalendarClient()` for API access_
  - _Requirements: 1.5, 1.6, 1.7, 1.8_

- [x] 5. Implement queryFreebusy private method
  - File: `src/integrations/google-calendar-room-service.ts`
  - Use Freebusy API to query room availability
  - Accept roomIds array, startTime, endTime
  - Handle pagination for >50 rooms (batch into multiple requests)
  - Use `retryWithBackoff` for API resilience
  - Return busy periods for each room
  - Purpose: Get real-time availability data from Google Calendar
  - _Leverage: `src/utils/retry.ts` for retry logic_
  - _Requirements: 1.1, 2.1_

- [x] 6. Implement sortByCapacityMatch private method
  - File: `src/integrations/google-calendar-room-service.ts`
  - Sort by `|requiredCapacity - actualCapacity|` ascending
  - Secondary sort by room name alphabetically
  - Handle case when minCapacity is not specified (sort by name only)
  - Purpose: Return rooms in user-friendly order
  - _Requirements: 1.4_

- [x] 7. Implement searchRoomAvailability public method
  - File: `src/integrations/google-calendar-room-service.ts`
  - Validate input with Zod schema
  - Calculate endTime from durationMinutes if needed
  - Call `fetchRoomResources()` with filters
  - Call `queryFreebusy()` with room IDs
  - Combine results into `RoomAvailability[]`
  - Apply `sortByCapacityMatch()`
  - Purpose: Main entry point for room search
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.9, 1.10_

- [x] 8. Implement checkRoomAvailability public method
  - File: `src/integrations/google-calendar-room-service.ts`
  - Validate input with Zod schema
  - Fetch single room metadata
  - Query freebusy for the specific room
  - Return `SingleRoomAvailability` with requestedPeriod
  - Handle room not found error
  - Purpose: Quick availability check for known room
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

### Phase 3: MCP Tool Integration

- [x] 9. Add search_room_availability MCP tool definition
  - File: `src/index.ts`
  - Add tool to server.setRequestHandler for tools/list
  - Define inputSchema with startTime, endTime, durationMinutes, minCapacity, building, floor, features
  - Add description explaining usage
  - Purpose: Expose room search to MCP clients
  - _Leverage: existing MCP tool patterns in `src/index.ts`_
  - _Requirements: 1.1-1.10_

- [x] 10. Add check_room_availability MCP tool definition
  - File: `src/index.ts`
  - Add tool to server.setRequestHandler for tools/list
  - Define inputSchema with roomId, startTime, endTime (all required)
  - Add description explaining usage
  - Purpose: Expose room check to MCP clients
  - _Leverage: existing MCP tool patterns in `src/index.ts`_
  - _Requirements: 2.1-2.4_

- [x] 11. Implement search_room_availability tool handler
  - File: `src/index.ts` (or `src/tools/room/handlers.ts` if tools are split)
  - Instantiate GoogleCalendarRoomService
  - Call searchRoomAvailability with parsed arguments
  - Format response for MCP
  - Handle errors with user-friendly messages
  - Purpose: Connect MCP tool to service
  - _Leverage: existing tool handler patterns_
  - _Requirements: 1.1-1.10_

- [x] 12. Implement check_room_availability tool handler
  - File: `src/index.ts` (or `src/tools/room/handlers.ts` if tools are split)
  - Instantiate GoogleCalendarRoomService
  - Call checkRoomAvailability with parsed arguments
  - Format response for MCP
  - Handle errors with user-friendly messages
  - Purpose: Connect MCP tool to service
  - _Leverage: existing tool handler patterns_
  - _Requirements: 2.1-2.4_

### Phase 4: Testing

- [x] 13. Add unit tests for room type validation schemas
  - File: `tests/unit/config/validation.test.ts` (or new file)
  - Test roomAvailabilityRequestSchema valid/invalid cases
  - Test checkRoomAvailabilitySchema valid/invalid cases
  - Test refinement: endTime or durationMinutes required
  - Purpose: Ensure input validation works correctly
  - _Leverage: existing validation tests in `tests/unit/config/`_
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 14. Add unit tests for GoogleCalendarRoomService
  - File: `tests/unit/integrations/google-calendar-room-service.test.ts` (new file)
  - Mock googleapis CalendarList and Freebusy APIs
  - Test fetchRoomResources with various filters
  - Test queryFreebusy with mock responses
  - Test sortByCapacityMatch algorithm
  - Purpose: Verify service logic in isolation
  - _Leverage: existing mocking patterns in `tests/unit/integrations/`_
  - _Requirements: 1.1-1.10, 2.1-2.4_

- [x] 15. Add unit tests for searchRoomAvailability method
  - File: `tests/unit/integrations/google-calendar-room-service.test.ts`
  - Test with endTime specified
  - Test with durationMinutes specified
  - Test with various filters (capacity, building, floor, features)
  - Test empty result case
  - Test error handling (Google API errors)
  - Purpose: Verify main search functionality
  - _Requirements: 1.1-1.10_

- [x] 16. Add unit tests for checkRoomAvailability method
  - File: `tests/unit/integrations/google-calendar-room-service.test.ts`
  - Test room available case
  - Test room busy case with busy periods
  - Test room not found case
  - Purpose: Verify room check functionality
  - _Requirements: 2.1-2.4_

- [x] 17. Add integration tests for room MCP tools
  - File: `tests/integration/room-availability.test.ts` (new file)
  - Test search_room_availability tool end-to-end
  - Test check_room_availability tool end-to-end
  - Mock Google API at HTTP level
  - Purpose: Verify MCP tool integration
  - _Leverage: existing integration test patterns_
  - _Requirements: All_

### Phase 5: Integration with Existing Features

- [x] 18. Update create_calendar_event to support room booking
  - File: `src/index.ts` (or relevant handler file)
  - Add optional `roomId` parameter to create_calendar_event inputSchema
  - When roomId specified, add room as attendee with resource type
  - Set event location to room name
  - Purpose: Enable room booking through existing event creation
  - _Leverage: existing create_calendar_event implementation_
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 19. Add tests for room booking in create_calendar_event
  - File: `tests/unit/` or `tests/integration/` (existing event tests)
  - Test event creation with roomId
  - Test room added as attendee
  - Test location set correctly
  - Purpose: Verify room booking integration
  - _Requirements: 3.1-3.4_
