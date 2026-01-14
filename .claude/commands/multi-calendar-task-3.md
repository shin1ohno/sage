# Task 3: Extend config types with selectedCalendars

Execute Task 3 from the multi-calendar-resources specification.

## Task Details

**File:** `src/types/config.ts`

**Objective:** Add `selectedCalendars?: string[]` field to:
- `EventKitSourceConfig` interface
- `GoogleCalendarSourceConfig` interface

**Requirements:** 2.3

## Instructions

1. Read the current `src/types/config.ts` file
2. Add `selectedCalendars?: string[]` to `EventKitSourceConfig`
3. Add `selectedCalendars?: string[]` to `GoogleCalendarSourceConfig`
4. Ensure default config handles missing field gracefully

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
