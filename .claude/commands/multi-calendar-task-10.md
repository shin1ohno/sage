# Task 10: Add getSelectedCalendarIds and updateSelectedCalendarIds

Execute Task 10 from the multi-calendar-resources specification.

## Task Details

**File:** `src/integrations/calendar-source-manager.ts`

**Objective:** Add methods to read and update user's calendar selection preferences.

**Requirements:** 2.2, 2.3

## Instructions

1. Read the current `src/integrations/calendar-source-manager.ts` file
2. Add `getSelectedCalendarIds(): string[]` method:
   - Read from config.calendar.sources.eventkit.selectedCalendars
   - Read from config.calendar.sources.google.selectedCalendars
   - Combine and return all selected calendar IDs
   - Return empty array if none selected (means "all calendars")
3. Add `updateSelectedCalendarIds(calendarIds: string[]): void` method:
   - Update config with new calendar selections
   - Note: Config persistence is caller's responsibility (ConfigManager.save())

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
