# Task 4: Add CalendarResource validation schema

Execute Task 4 from the multi-calendar-resources specification.

## Task Details

**File:** `src/config/validation.ts`

**Objective:** Add Zod validation schemas:
- `CalendarResourceSchema` for CalendarResource type
- Add `calendarIds` parameter to relevant input schemas

**Requirements:** 2.1, 3.1, 5.2

## Instructions

1. Read the current `src/config/validation.ts` file
2. Add `CalendarResourceSchema` using Zod following existing patterns
3. Update `ListEventsInputSchema` (if exists) to include `calendarIds?: string[]`
4. Update `FindSlotsInputSchema` (if exists) to include `calendarIds?: string[]`

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
