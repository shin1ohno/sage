# Task 17: Update create_calendar_event handler with target calendar validation

Execute Task 17 from the multi-calendar-resources specification.

## Task Details

**File:** `src/tools/calendar/handlers.ts`

**Objective:** Add validation for target calendar writability in event creation.

**Requirements:** 6.2, 6.3

## Instructions

1. Read the current `src/tools/calendar/handlers.ts` file
2. Find the `handleCreateCalendarEvent` function (or equivalent)
3. Add validation logic:
   - If `calendarId` is specified, check if it's writable
   - Use `listCalendarResources()` to get calendar info
   - If not writable, return error with list of writable alternatives
4. If no `calendarId` specified, use default calendar from config

## Error Response Format

```typescript
{
  error: "Calendar 'xyz' is not writable",
  writableCalendars: CalendarResource[]  // alternatives
}
```

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
