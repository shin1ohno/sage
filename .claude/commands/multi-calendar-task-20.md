# Task 20: Add integration tests for calendarIds filtering

Execute Task 20 from the multi-calendar-resources specification.

## Task Details

**File:** `tests/tools/calendar/handlers.test.ts`

**Objective:** Add integration tests for calendarIds filtering in MCP tools.

**Requirements:** 3.1, 5.2, 6.3

## Instructions

1. Read the current `tests/tools/calendar/handlers.test.ts` file
2. Add test cases for:
   - `list_calendar_events` with calendarIds parameter
   - `find_available_slots` with calendarIds parameter
   - `create_calendar_event` with non-writable calendar (error case)
   - `create_calendar_event` with valid writable calendar
3. Mock services appropriately
4. Follow existing handler test patterns

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
