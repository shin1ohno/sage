# Task 12: Add unit tests for CalendarSourceManager extensions

Execute Task 12 from the multi-calendar-resources specification.

## Task Details

**File:** `tests/integrations/calendar-source-manager.test.ts`

**Objective:** Add unit tests for all new CalendarSourceManager functionality.

**Requirements:** 1.1, 3.1, 3.3

## Instructions

1. Read the current `tests/integrations/calendar-source-manager.test.ts` file
2. Add test cases for:
   - `listCalendarResources()`: Success with both sources
   - `listCalendarResources()`: Partial failure (one source fails)
   - `listCalendarResources()`: Cache hit and miss
   - `getEvents()` with calendarIds array
   - `getSelectedCalendarIds()` and `updateSelectedCalendarIds()`
   - `findAvailableSlots()` with calendarIds
3. Mock CalendarService and GoogleCalendarService appropriately
4. Follow existing test patterns

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
