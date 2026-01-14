# Task 15: Update list_calendar_events handler with calendarIds

Execute Task 15 from the multi-calendar-resources specification.

## Task Details

**File:** `src/tools/calendar/handlers.ts`

**Objective:** Add `calendarIds` parameter support to `list_calendar_events` handler.

**Requirements:** 3.1

## Instructions

1. Read the current `src/tools/calendar/handlers.ts` file
2. Find the `handleListCalendarEvents` function (or equivalent)
3. Add `calendarIds?: string[]` to input parameters
4. Update Zod validation schema to include `calendarIds`
5. Pass `calendarIds` to `CalendarSourceManager.getEvents()`
6. Ensure backward compatibility (calendarIds is optional)

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
