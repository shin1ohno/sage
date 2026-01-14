# Task 2: Extend CalendarEvent interface with calendar metadata

Execute Task 2 from the multi-calendar-resources specification.

## Task Details

**File:** `src/types/calendar.ts`

**Objective:** Add optional calendar metadata fields to CalendarEvent interface:
- `calendarId?: string` - Source calendar ID
- `calendarName?: string` - Source calendar display name
- `calendarColor?: string` - Source calendar color

**Requirements:** 4.1, 4.2

## Instructions

1. Read the current `src/types/calendar.ts` file
2. Find the CalendarEvent interface (may be in calendar-service.ts)
3. Add the optional fields for calendar metadata
4. Ensure backward compatibility (all fields optional)

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
