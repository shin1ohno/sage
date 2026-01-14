# Task 19: Add integration tests for list_calendar_resources

Execute Task 19 from the multi-calendar-resources specification.

## Task Details

**File:** `tests/tools/calendar/handlers.test.ts`

**Objective:** Add integration tests for the `list_calendar_resources` MCP tool.

**Requirements:** 1.1, 1.2

## Instructions

1. Read the current `tests/tools/calendar/handlers.test.ts` file
2. Add test cases for `list_calendar_resources`:
   - Returns calendars from all sources
   - Filters by source when specified
   - Handles unavailable source gracefully
   - Returns proper source availability status
3. Mock CalendarSourceManager appropriately
4. Follow existing handler test patterns

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
