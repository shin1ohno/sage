# Task 14: Implement list_calendar_resources handler

Execute Task 14 from the multi-calendar-resources specification.

## Task Details

**File:** `src/tools/calendar/handlers.ts`

**Objective:** Implement the handler function for `list_calendar_resources` MCP tool.

**Requirements:** 1.1, 1.2, 1.3

## Instructions

1. Read the current `src/tools/calendar/handlers.ts` file
2. Add `handleListCalendarResources` function:
   - Accept optional `source` filter parameter
   - Call `CalendarSourceManager.listCalendarResources()`
   - Filter results by source if specified
   - Format response with resources array and source availability status
3. Export the handler function
4. Follow existing handler patterns

## Response Format

```typescript
{
  resources: CalendarResource[],
  sources: {
    eventkit: { available: boolean, error?: string },
    google: { available: boolean, error?: string }
  }
}
```

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
