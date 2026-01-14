# Task 5: Add listCalendars method to CalendarService

Execute Task 5 from the multi-calendar-resources specification.

## Task Details

**File:** `src/integrations/calendar-service.ts`

**Objective:** Add `async listCalendars(): Promise<CalendarResource[]>` method to fetch calendars from EventKit via AppleScript.

**Requirements:** 1.1, 1.2, 1.3

## Instructions

1. Read the current `src/integrations/calendar-service.ts` file
2. Import `CalendarResource` type from `../types/calendar.ts`
3. Add `listCalendars()` method that:
   - Uses AppleScript to fetch calendar list from EventKit
   - Extracts id, name, isWritable for each calendar
   - Returns array of CalendarResource with source='eventkit'
4. Use existing retry logic (`retryWithBackoff`) for error handling
5. Handle permission errors gracefully (return empty array, log warning)

## AppleScript Reference (from design.md)

```applescript
use framework "EventKit"
use framework "Foundation"
set eventStore to current application's EKEventStore's alloc()'s init()
set calendars to eventStore's calendarsForEntityType:0
-- Extract id, name, isWritable from each calendar
```

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
