# Task 13: Add list_calendar_resources MCP tool definition

Execute Task 13 from the multi-calendar-resources specification.

## Task Details

**File:** `src/tools/calendar/index.ts`

**Objective:** Define the `list_calendar_resources` MCP tool schema.

**Requirements:** 1.1

## Instructions

1. Read the current `src/tools/calendar/index.ts` file
2. Add tool definition for `list_calendar_resources`:
   - Name: "list_calendar_resources"
   - Description: "List all available calendar resources from enabled sources"
   - Input schema with optional `source` parameter: `enum: ["eventkit", "google", "all"]`
3. Export the new tool definition
4. Follow existing tool definition patterns

## Context Files

- Spec: `.claude/specs/multi-calendar-resources/requirements.md`
- Design: `.claude/specs/multi-calendar-resources/design.md`
- Tasks: `.claude/specs/multi-calendar-resources/tasks.md`
