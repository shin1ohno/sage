# Task 1: Add CalendarResource interface

Execute Task 1 from the multi-calendar-resources specification.

## Task Details

**File:** `src/types/calendar.ts`

**Objective:** Add `CalendarResource` interface with the following fields:
- `id: string` - Calendar unique identifier
- `name: string` - Display name
- `source: 'eventkit' | 'google'` - Source type
- `color?: string` - Calendar color (hex)
- `isPrimary?: boolean` - Whether this is the primary calendar
- `isWritable?: boolean` - Whether events can be created
- `accessRole?: 'owner' | 'writer' | 'reader' | 'freeBusyReader'` - Access role

**Requirements:** 1.3, 4.1

## Instructions

1. Read the current `src/types/calendar.ts` file
2. Add the `CalendarResource` interface following existing type patterns
3. Export the new interface
4. Ensure the interface aligns with design document at `.claude/specs/multi-calendar-resources/design.md`

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
