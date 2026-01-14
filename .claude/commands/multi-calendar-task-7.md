# Task 7: Add listCalendarResources to CalendarSourceManager

Execute Task 7 from the multi-calendar-resources specification.

## Task Details

**File:** `src/integrations/calendar-source-manager.ts`

**Objective:** Add `async listCalendarResources(): Promise<CalendarResource[]>` method.

**Requirements:** 1.1, 1.2, 1.3

## Instructions

1. Read the current `src/integrations/calendar-source-manager.ts` file
2. Import `CalendarResource` type
3. Add `listCalendarResources()` method that:
   - Fetches calendars from EventKit and Google Calendar in parallel using `Promise.allSettled()`
   - Merges results with source identification
   - Handles partial failures (one source fails, other continues)
   - Returns combined array of CalendarResource
4. Use existing `GoogleCalendarService.listCalendars()` and new `CalendarService.listCalendars()`

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
