# Bug Analysis

## Root Cause Analysis

### Investigation Summary
Conducted comprehensive code review of GoogleCalendarService and related components. The root cause is confirmed: `listEvents()` method passes date strings directly to Google Calendar API without format validation or normalization, while the API strictly requires RFC3339 format.

**Key Findings**:
1. Current implementation assumes input is already RFC3339-formatted
2. Unit tests use RFC3339 format, hiding the real-world issue
3. Other methods (`createEvent`, `updateEvent`) handle date formatting properly
4. No date normalization utility exists in the codebase
5. The issue only surfaced after CalendarSourceManager integration (previously Google Calendar was disabled)

### Root Cause
**GoogleCalendarService.listEvents() method lacks input date normalization**

The method passes `request.startDate` and `request.endDate` directly to Google Calendar API's `timeMin` and `timeMax` parameters without validating or converting the format. Google Calendar API requires RFC3339 format (with time and timezone), but users and upstream callers provide simple ISO date strings (`YYYY-MM-DD`).

**Data Flow**:
```
User → list_calendar_events("2026-01-05", "2026-01-06")
  ↓
handleListCalendarEvents (src/tools/calendar/handlers.ts:237)
  ↓
CalendarSourceManager.getEvents("2026-01-05", "2026-01-06") (src/integrations/calendar-source-manager.ts:271)
  ↓
GoogleCalendarService.listEvents({ startDate: "2026-01-05", endDate: "2026-01-06" })
  ↓
this.calendarClient!.events.list({
  timeMin: "2026-01-05",  // ❌ Invalid for Google Calendar API
  timeMax: "2026-01-06"   // ❌ Invalid for Google Calendar API
})
  ↓
Google Calendar API → 400 Bad Request
```

### Contributing Factors
1. **Insufficient Input Validation**: No validation of date format at API boundary
2. **Test Gap**: Unit tests use RFC3339 format, not realistic user input
3. **Recent Integration**: Google Calendar support recently enabled, issue newly exposed
4. **No Date Utilities**: Project lacks date formatting utilities
5. **Documentation Gap**: ListEventsRequest interface doesn't specify required format

## Technical Details

### Affected Code Locations

#### Primary Issue
- **File**: `src/integrations/google-calendar-service.ts`
  - **Method**: `listEvents(request: ListEventsRequest)` - Lines 153-227
  - **Lines**: 171-172 - Direct parameter passing without normalization
  - **Issue**: No RFC3339 conversion before API call

**Problematic Code** (lines 169-176):
```typescript
await this.calendarClient!.events.list({
  calendarId: calendarId,
  timeMin: request.startDate,  // ❌ No format conversion
  timeMax: request.endDate,    // ❌ No format conversion
  maxResults: 250,
  pageToken: pageToken,
  singleEvents: true,
})
```

#### Related Working Code (Reference)
- **File**: `src/integrations/google-calendar-service.ts`
  - **Method**: `createEvent()` - Lines 242-345
  - **Lines**: 262-278 - Proper date handling for all-day vs timed events
  - **Status**: ✅ Correctly handles date formatting

**Working Example** from `createEvent()` (lines 262-278):
```typescript
if (request.isAllDay) {
  // All-day events use 'date' field (YYYY-MM-DD format)
  eventBody.start = {
    date: request.start.split('T')[0],  // Extract date part
  };
  eventBody.end = {
    date: request.end.split('T')[0],
  };
} else {
  // Timed events use 'dateTime' field (ISO 8601 with timezone)
  eventBody.start = {
    dateTime: request.start,  // Already in correct format
  };
  eventBody.end = {
    dateTime: request.end,
  };
}
```

### Data Flow Analysis

**Current Flow (Broken)**:
```
MCP Tool Input: "YYYY-MM-DD" (ISO date)
  ↓
Handler: Passes through unchanged
  ↓
CalendarSourceManager: Passes through unchanged
  ↓
GoogleCalendarService.listEvents(): No normalization
  ↓
Google Calendar API: Rejects (requires RFC3339)
  ↓
Error: 400 Bad Request
```

**Required Flow (Fixed)**:
```
MCP Tool Input: "YYYY-MM-DD" (ISO date)
  ↓
Handler: Passes through unchanged
  ↓
CalendarSourceManager: Passes through unchanged
  ↓
GoogleCalendarService.listEvents(): Normalizes to RFC3339
  ↓
  If "YYYY-MM-DD" format detected:
    → Convert to "YYYY-MM-DDT00:00:00Z"
  If already RFC3339:
    → Pass through unchanged
  ↓
Google Calendar API: Accepts RFC3339 format
  ↓
Success: Returns events
```

### Dependencies
- **googleapis**: v128.0.0 - Google Calendar API client library
- **Node.js Date API**: For date parsing and validation
- **TypeScript**: For type safety

### Why Tests Didn't Catch This
1. **Unit tests** (`tests/unit/google-calendar-service.test.ts`):
   - All test cases use RFC3339 format: `'2026-01-15T00:00:00Z'`
   - Lines 236, 254, 273, 307, 326, 337, etc.
   - Tests validate behavior, not real-world input format

2. **Integration tests** don't call actual Google Calendar API
   - Mock responses bypass format validation

3. **E2E tests** focus on HTTP server setup, not Google Calendar API

## Impact Analysis

### Direct Impact
- **Google Calendar API completely unusable**: All event listing fails
- **Multi-source calendar broken**: When Google Calendar enabled, entire tool fails
- **User Experience**: Confusing error message doesn't indicate date format issue
- **Workaround**: Users must disable Google Calendar entirely

### Indirect Impact
- **Trust**: New Google Calendar feature appears broken
- **Testing Gap**: Highlights need for integration tests with actual API
- **Documentation**: Interface documentation needs format specification
- **Future Issues**: Other methods might have similar hidden issues

### Risk Assessment
**If not fixed**:
- Google Calendar integration remains unusable
- Users cannot use sage on non-macOS platforms (no EventKit fallback)
- Reputation damage for newly released feature
- Increased support burden with unclear error messages

## Solution Approach

### Fix Strategy
**Implement input normalization in GoogleCalendarService.listEvents() method**

Add a private helper method to normalize date strings to RFC3339 format before passing to Google Calendar API. This approach:
- ✅ Keeps fix localized to one file
- ✅ Follows defensive programming (validate at boundary)
- ✅ Maintains backwards compatibility (accepts both formats)
- ✅ Minimal code changes
- ✅ Easy to test

**Implementation Steps**:
1. Add private helper method `normalizeToRFC3339(dateString: string): string`
2. Detect if input is simple date format (`YYYY-MM-DD`)
3. Convert to RFC3339 format with UTC timezone (`YYYY-MM-DDT00:00:00Z`)
4. If already RFC3339, pass through unchanged
5. Apply normalization to both `timeMin` and `timeMax` parameters

### Alternative Solutions Considered

#### Alternative 1: Normalize at Handler Level
**Approach**: Add normalization in `handleListCalendarEvents()` (handlers.ts)

**Pros**:
- Ensures consistent format across all calendar sources
- Could benefit other services in future

**Cons**:
- ❌ Handler should stay source-agnostic
- ❌ EventKit doesn't need RFC3339 format
- ❌ Violates separation of concerns
- ❌ Doesn't follow existing pattern

**Rejected**: GoogleCalendarService should handle its own API requirements

#### Alternative 2: Normalize at CalendarSourceManager Level
**Approach**: Add normalization in CalendarSourceManager.getEvents()

**Pros**:
- Central location for format handling

**Cons**:
- ❌ Manager should be format-agnostic
- ❌ Different sources have different requirements
- ❌ Increases coupling

**Rejected**: Service-specific formatting belongs in the service

#### Alternative 3: Create Shared Date Utility
**Approach**: Create `src/utils/date-formatter.ts` with normalization functions

**Pros**:
- Reusable across project
- Consistent date handling

**Cons**:
- ❌ Over-engineering for single use case
- ❌ Can refactor later if more uses emerge
- ❌ Delays fix implementation

**Decision**: Start with localized fix, extract utility if more uses appear

### Risks and Trade-offs

**Risks of Selected Solution**:
1. **Timezone Assumptions**: Using UTC (`Z`) might not match user's local timezone
   - **Mitigation**: UTC is safe for date boundaries; Google Calendar handles timezone display
   - **Note**: Start of day 00:00:00 in UTC is acceptable for date-based queries

2. **Format Detection**: Simple regex might miss edge cases
   - **Mitigation**: Test against common formats
   - **Fallback**: If not `YYYY-MM-DD`, pass through unchanged

3. **Breaking Changes**: If callers depend on current behavior
   - **Mitigation**: Current behavior is broken, so no valid dependencies exist
   - **Note**: Unit tests already use RFC3339 format

**Trade-offs**:
- **Simplicity vs Robustness**: Choosing simple regex detection over full date parsing
  - Benefit: Fast, no external dependencies
  - Risk: Might not catch all edge cases (acceptable for MVP fix)

- **Localized vs Centralized**: Keeping normalization in GoogleCalendarService
  - Benefit: Quick fix, follows existing patterns
  - Risk: Code duplication if other services need it (can refactor later)

## Implementation Plan

### Changes Required

#### 1. Add Date Normalization Helper Method
- **File**: `src/integrations/google-calendar-service.ts`
- **Location**: After `authenticate()` method, before `listEvents()` method (around line 111)
- **Modification**: Add new private method

```typescript
/**
 * Normalize date string to RFC3339 format required by Google Calendar API
 *
 * Converts simple ISO date format (YYYY-MM-DD) to RFC3339 format with UTC timezone.
 * If input is already in RFC3339 format, returns unchanged.
 *
 * @param dateString - Date string in YYYY-MM-DD or RFC3339 format
 * @returns Date string in RFC3339 format (YYYY-MM-DDT00:00:00Z)
 */
private normalizeToRFC3339(dateString: string): string {
  // Check if already in RFC3339 format (contains 'T' and timezone)
  if (dateString.includes('T')) {
    return dateString;
  }

  // Convert YYYY-MM-DD to YYYY-MM-DDT00:00:00Z
  // Using 00:00:00 UTC ensures we capture all events on the date
  return `${dateString}T00:00:00Z`;
}
```

#### 2. Apply Normalization in listEvents()
- **File**: `src/integrations/google-calendar-service.ts`
- **Method**: `listEvents()`
- **Lines**: 171-172
- **Modification**: Wrap date parameters with normalization

**Before**:
```typescript
timeMin: request.startDate,
timeMax: request.endDate,
```

**After**:
```typescript
timeMin: this.normalizeToRFC3339(request.startDate),
timeMax: this.normalizeToRFC3339(request.endDate),
```

#### 3. Add Unit Tests
- **File**: `tests/unit/google-calendar-service.test.ts`
- **Location**: Inside `describe('listEvents')` block
- **Modification**: Add test cases for date format normalization

```typescript
it('should normalize simple date format (YYYY-MM-DD) to RFC3339', async () => {
  mockCalendarClient.events.list.mockResolvedValueOnce({
    data: { items: [] },
  });

  await service.listEvents({
    startDate: '2026-01-15',  // Simple format
    endDate: '2026-01-16',
  });

  expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
    expect.objectContaining({
      timeMin: '2026-01-15T00:00:00Z',  // Normalized to RFC3339
      timeMax: '2026-01-16T00:00:00Z',
    })
  );
});

it('should pass through RFC3339 format unchanged', async () => {
  mockCalendarClient.events.list.mockResolvedValueOnce({
    data: { items: [] },
  });

  await service.listEvents({
    startDate: '2026-01-15T10:00:00+09:00',  // Already RFC3339
    endDate: '2026-01-16T10:00:00+09:00',
  });

  expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
    expect.objectContaining({
      timeMin: '2026-01-15T10:00:00+09:00',  // Unchanged
      timeMax: '2026-01-16T10:00:00+09:00',
    })
  );
});
```

#### 4. Update Interface Documentation
- **File**: `src/integrations/google-calendar-service.ts`
- **Interface**: `ListEventsRequest` (lines 21-25)
- **Modification**: Add format documentation

**Before**:
```typescript
export interface ListEventsRequest {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  calendarId?: string;
}
```

**After**:
```typescript
export interface ListEventsRequest {
  startDate: string; // ISO 8601 date (YYYY-MM-DD) or RFC3339 (YYYY-MM-DDTHH:MM:SSZ)
  endDate: string; // ISO 8601 date (YYYY-MM-DD) or RFC3339 (YYYY-MM-DDTHH:MM:SSZ)
  calendarId?: string; // Calendar ID (optional, defaults to 'primary')
}
```

### Testing Strategy

#### Unit Tests
1. **Format Normalization Tests** (new):
   - Test simple date format conversion: `"2026-01-15"` → `"2026-01-15T00:00:00Z"`
   - Test RFC3339 passthrough: `"2026-01-15T10:00:00+09:00"` → unchanged
   - Test edge case: `"2026-01-15T00:00:00Z"` → unchanged

2. **Existing Tests** (should still pass):
   - All current `listEvents()` tests use RFC3339 format
   - Should pass without modification

#### Integration Testing
1. **Manual Testing via MCP**:
   ```typescript
   // Test with simple date format (real-world usage)
   list_calendar_events({
     startDate: "2026-01-05",
     endDate: "2026-01-06"
   })
   // Expected: Returns events (no Bad Request error)
   ```

2. **Verify Error is Fixed**:
   - Before fix: "Bad Request" error
   - After fix: Events returned successfully

#### Regression Testing
- Verify EventKit still works (unaffected)
- Verify CalendarSourceManager integration (no changes)
- Verify other Google Calendar methods still work:
  - `createEvent()` - Should be unaffected
  - `updateEvent()` - Should be unaffected
  - `deleteEvent()` - Should be unaffected

### Rollback Plan

**If fix causes issues**:
1. **Git revert**: Single commit, easy to revert
   ```bash
   git revert <commit-hash>
   ```

2. **Disable Google Calendar**: Temporary workaround
   ```typescript
   calendar.sources.google.enabled = false
   ```

3. **Monitoring**: Check for new errors in logs
   - Watch for format-related errors
   - Monitor API success rate

**Risk**: Low - Fix is localized, well-tested, and follows defensive programming

### Deployment Verification

**Post-deployment Checks**:
1. Test with simple date format via MCP
2. Test with RFC3339 format (should still work)
3. Verify no errors in production logs
4. Confirm events are returned correctly

**Success Criteria**:
- ✅ `list_calendar_events` works with simple date format
- ✅ No "Bad Request" errors
- ✅ Events returned from Google Calendar
- ✅ Existing tests pass
- ✅ No regressions in related features

---

**Analysis Status**: Complete
**Next Step**: Get user approval, then proceed to `/bug-fix` phase
