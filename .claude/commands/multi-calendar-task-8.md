# Task 8: Add calendar resource caching to CalendarSourceManager

Execute Task 8 from the multi-calendar-resources specification.

## Task Details

**File:** `src/integrations/calendar-source-manager.ts`

**Objective:** Add caching for calendar resource listing to meet 2-second performance requirement.

**Requirements:** NFR Performance

## Instructions

1. Read the current `src/integrations/calendar-source-manager.ts` file
2. Add private cache: `private resourceCache?: { data: CalendarResource[], timestamp: number }`
3. Add cache TTL constant: `private static CACHE_TTL_MS = 5 * 60 * 1000` (5 minutes)
4. Update `listCalendarResources()` to:
   - Check cache validity before fetching
   - Update cache after successful fetch
5. Add method to invalidate cache when needed

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
