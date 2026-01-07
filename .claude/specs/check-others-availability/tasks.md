# Tasks: check-others-availability

## Task Overview

他のユーザーのカレンダー空き状況を確認する機能の実装。Google Calendar Freebusy API を使用して、複数ユーザーの空き状況を確認し、共通空き時間を特定する。

## Implementation Tasks

### Task 1: Add Type Definitions
**Status:** completed
**File:** `src/types/google-calendar-types.ts`
**Requirements:** 1.1, 1.4, 1.5, 2.1, 2.5

Add new type definitions for people availability:

```typescript
// PersonAvailability - 個人の空き状況
interface PersonAvailability {
  email: string;
  displayName?: string;
  isAvailable: boolean;
  busyPeriods: BusyPeriod[];
  error?: string;
}

// PeopleAvailabilityResult - check_people_availability の結果
interface PeopleAvailabilityResult {
  people: PersonAvailability[];
  timeRange: { start: string; end: string };
}

// CommonFreeSlot - 共通空き時間スロット
interface CommonFreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

// ResolvedParticipant - 名前解決結果
interface ResolvedParticipant {
  query: string;
  email: string;
  displayName?: string;
  error?: string;
}

// CommonAvailabilityResult - find_common_availability の結果
interface CommonAvailabilityResult {
  commonSlots: CommonFreeSlot[];
  participants: ResolvedParticipant[];
  timeRange: { start: string; end: string };
}
```

**Acceptance Criteria:**
- [ ] Types exported from google-calendar-types.ts
- [ ] BusyPeriod type reused from existing definitions
- [ ] All fields match design.md specifications

---

### Task 2: Add Validation Schemas
**Status:** completed
**File:** `src/config/validation.ts`
**Requirements:** 1.2, 1.3, 2.6

Add Zod validation schemas:

```typescript
// CheckPeopleAvailabilitySchema
const CheckPeopleAvailabilitySchema = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
  startTime: z.string(),
  endTime: z.string(),
});

// FindCommonAvailabilitySchema
const FindCommonAvailabilitySchema = z.object({
  participants: z.array(z.string()).min(1).max(20),
  startTime: z.string(),
  endTime: z.string(),
  minDurationMinutes: z.number().min(1).optional().default(30),
  includeMyCalendar: z.boolean().optional().default(true),
});
```

**Acceptance Criteria:**
- [ ] Schemas validate email format
- [ ] Schemas enforce 1-20 participant limit
- [ ] Default values set correctly

---

### Task 3: Implement GoogleCalendarService.checkPeopleAvailability
**Status:** completed
**File:** `src/integrations/google-calendar-service.ts`
**Requirements:** 1.1, 1.4, 1.5, 1.6, 3.1, 3.2

Implement the core method to check multiple people's availability:

```typescript
async checkPeopleAvailability(
  emails: string[],
  startTime: string,
  endTime: string
): Promise<PeopleAvailabilityResult>
```

**Implementation Notes:**
- Reuse `getCalendarClient()` pattern from existing methods
- Use Freebusy API similar to `GoogleCalendarRoomService.queryFreebusy()`
- Handle permission errors per-person (partial success)
- Batch requests in groups of 50 (API limit)

**Acceptance Criteria:**
- [ ] Returns busy periods for each person
- [ ] Handles permission denied gracefully
- [ ] Uses retryWithBackoff for API calls
- [ ] Batch processes requests over 50 calendars

---

### Task 4: Implement Common Availability Algorithm
**Status:** completed
**File:** `src/integrations/google-calendar-service.ts`
**Requirements:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6

Implement the algorithm to find common free time slots:

```typescript
async findCommonAvailability(
  emails: string[],
  startTime: string,
  endTime: string,
  minDurationMinutes?: number
): Promise<CommonAvailabilityResult>
```

**Algorithm:**
1. Get busy periods for all users via checkPeopleAvailability
2. Start with the full time range as "free"
3. Subtract each user's busy periods
4. Split remaining free time into slots
5. Filter by minDurationMinutes
6. Sort by start time

**Acceptance Criteria:**
- [ ] Correctly calculates intersection of free times
- [ ] Returns slots sorted by start time
- [ ] Filters by minimum duration
- [ ] Returns empty list with message when no common time

---

### Task 5: Create Tool Definitions
**Status:** completed
**File:** `src/tools/shared/availability-tools.ts` (new file)
**Requirements:** 1.1, 2.1, 4.1

Create MCP tool definitions using the `defineTool` pattern:

```typescript
// check_people_availability tool
export const checkPeopleAvailabilityTool = defineTool(
  'check_people_availability',
  'Check availability of people by their email addresses...',
  CheckPeopleAvailabilityInputSchema
);

// find_common_availability tool
export const findCommonAvailabilityTool = defineTool(
  'find_common_availability',
  'Find common free time slots among multiple people...',
  FindCommonAvailabilityInputSchema
);
```

**Acceptance Criteria:**
- [ ] Tools follow existing defineTool pattern
- [ ] Descriptions are clear and actionable
- [ ] Input schemas match validation schemas
- [ ] Tools exported via index.ts

---

### Task 6: Implement Handlers
**Status:** completed
**File:** `src/tools/calendar/handlers.ts`
**Requirements:** 1.1-1.6, 2.1-2.6, 3.1-3.3, 4.1-4.3

Add handler functions for both tools:

```typescript
export async function handleCheckPeopleAvailability(
  ctx: CalendarToolsContext,
  args: CheckPeopleAvailabilityInput
): Promise<ToolResponse>

export async function handleFindCommonAvailability(
  ctx: CalendarToolsContext,
  args: FindCommonAvailabilityInput
): Promise<ToolResponse>
```

**Implementation Notes:**
- `handleFindCommonAvailability` resolves names via GooglePeopleService
- Names containing `@` are treated as emails
- Include user's own calendar when `includeMyCalendar` is true

**Acceptance Criteria:**
- [ ] Proper error handling with Japanese messages
- [ ] Name resolution via People API
- [ ] Mixed name/email input supported
- [ ] Results include resolved participant info

---

### Task 7: Register MCP Tools
**Status:** completed
**Files:** `src/index.ts`, `src/cli/mcp-handler.ts`
**Requirements:** 1.1, 2.1

Register the new tools in both stdio and remote modes:

**In src/index.ts:**
- Add tool definitions to `server.setRequestHandler`
- Add handlers to the tool call switch

**In src/cli/mcp-handler.ts:**
- Add tools to remote MCP handler
- Add handlers to the tool call switch

**Acceptance Criteria:**
- [ ] Tools available in stdio mode
- [ ] Tools available in remote mode
- [ ] Tools appear in `mcp list` output

---

### Task 8: Add Unit Tests - Service Methods
**Status:** completed
**File:** `tests/unit/google-calendar-service-availability.test.ts` (new file)
**Requirements:** 1.1-1.6, 2.1-2.6

Test GoogleCalendarService availability methods:

**Test Cases:**
- checkPeopleAvailability with valid emails
- checkPeopleAvailability with permission denied for some users
- checkPeopleAvailability with empty email list
- checkPeopleAvailability batching (over 50 emails)
- findCommonAvailability algorithm correctness
- findCommonAvailability with no common slots
- findCommonAvailability minimum duration filter

**Acceptance Criteria:**
- [ ] All methods have unit tests
- [ ] Edge cases covered
- [ ] Mock Freebusy API responses

---

### Task 9: Add Unit Tests - Handlers
**Status:** completed
**File:** `tests/unit/tools/availability-handlers.test.ts` (new file)
**Requirements:** 1.1-1.6, 2.1-2.6, 4.1-4.3

Test handler functions:

**Test Cases:**
- handleCheckPeopleAvailability success case
- handleCheckPeopleAvailability validation errors
- handleFindCommonAvailability with names (needs People API mock)
- handleFindCommonAvailability with emails
- handleFindCommonAvailability with mixed input
- Error handling for missing config

**Acceptance Criteria:**
- [ ] Handler tests follow existing patterns
- [ ] Context mocking matches other handler tests
- [ ] Japanese error messages tested

---

### Task 10: Add Integration Tests
**Status:** completed
**File:** `tests/integration/people-availability.test.ts` (new file)
**Requirements:** 1.1, 2.1, 4.1

End-to-end integration tests:

**Test Cases:**
- check_people_availability tool response format
- find_common_availability tool response format
- Validation error responses
- Partial failure handling

**Acceptance Criteria:**
- [ ] Tests verify MCP tool response structure
- [ ] Tests can run without real Google API (mocked)
- [ ] Response format matches design.md

---

## Task Dependencies

```
Task 1 (Types) ─────┬─→ Task 3 (Service) ─→ Task 4 (Algorithm) ─┬─→ Task 6 (Handlers) ─→ Task 7 (Register)
                    │                                           │
Task 2 (Validation) ┴─────────────────────→ Task 5 (Tools) ─────┘

Task 8 (Service Tests) ← Task 3, Task 4
Task 9 (Handler Tests) ← Task 6
Task 10 (Integration Tests) ← Task 7
```

## Completion Checklist

- [ ] Task 1: Type definitions added
- [ ] Task 2: Validation schemas added
- [ ] Task 3: checkPeopleAvailability implemented
- [ ] Task 4: findCommonAvailability implemented
- [ ] Task 5: Tool definitions created
- [ ] Task 6: Handlers implemented
- [ ] Task 7: Tools registered in both modes
- [ ] Task 8: Service unit tests passing
- [ ] Task 9: Handler unit tests passing
- [ ] Task 10: Integration tests passing
- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual testing with real Google Calendar
