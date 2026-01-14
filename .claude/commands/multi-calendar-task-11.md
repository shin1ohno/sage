# Task 11: Extend FindSlotsRequest with calendarIds

Execute Task 11 from the multi-calendar-resources specification.

## Task Details

**File:** `src/integrations/calendar-source-manager.ts`

**Objective:** Add `calendarIds?: string[]` to `FindSlotsRequest` interface and update `findAvailableSlots`.

**Requirements:** 5.1, 5.2

## Instructions

1. Read the current `src/integrations/calendar-source-manager.ts` file
2. Add `calendarIds?: string[]` to `FindSlotsRequest` interface
3. Update `findAvailableSlots()` method to:
   - Pass `calendarIds` to `getEvents()` call
   - Use `getSelectedCalendarIds()` if calendarIds not specified
4. Ensure slot calculation considers only events from specified calendars

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
