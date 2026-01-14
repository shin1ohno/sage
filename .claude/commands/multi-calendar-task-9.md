# Task 9: Extend getEvents to accept calendarIds array

Execute Task 9 from the multi-calendar-resources specification.

## Task Details

**File:** `src/integrations/calendar-source-manager.ts`

**Objective:** Modify `getEvents` to accept `calendarIds?: string[]` instead of single `calendarId?: string`.

**Requirements:** 3.1, 3.2

## Instructions

1. Read the current `src/integrations/calendar-source-manager.ts` file
2. Change `getEvents` signature:
   - From: `getEvents(startDate: string, endDate: string, calendarId?: string)`
   - To: `getEvents(startDate: string, endDate: string, calendarIds?: string[])`
3. Update implementation to:
   - Accept array of calendar IDs
   - Filter events from specified calendars only
   - Maintain backward compatibility (handle empty array as "all calendars")
4. Update calls to underlying services appropriately

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
