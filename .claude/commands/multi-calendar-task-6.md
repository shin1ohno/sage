# Task 6: Add unit tests for CalendarService.listCalendars

Execute Task 6 from the multi-calendar-resources specification.

## Task Details

**File:** `tests/integrations/calendar-service.test.ts`

**Objective:** Add unit tests for the new `listCalendars()` method.

**Requirements:** 1.1, 1.2

## Instructions

1. Read the current `tests/integrations/calendar-service.test.ts` file
2. Add test cases for:
   - Success case: Returns array of CalendarResource objects
   - Error handling: Permission denied returns empty array
   - Error handling: AppleScript failure triggers retry
3. Mock AppleScript execution appropriately
4. Follow existing test patterns in the file

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
