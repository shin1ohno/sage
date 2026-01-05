# Bug Report

## Bug Summary
Google Calendar API returns "Bad Request" error when listing calendar events because date parameters are passed in simple ISO date format (YYYY-MM-DD) instead of required RFC3339 format with time and timezone.

## Bug Details

### Expected Behavior
When listing Google Calendar events:
1. User calls `list_calendar_events` with startDate and endDate in ISO 8601 date format
2. GoogleCalendarService converts dates to RFC3339 format with time and timezone
3. Google Calendar API accepts the request and returns events
4. Events are successfully retrieved and displayed

### Actual Behavior
When calling `list_calendar_events`:
1. User provides dates like "2026-01-05" and "2026-01-06"
2. GoogleCalendarService passes these directly to Google Calendar API as-is
3. Google Calendar API rejects the request with "Bad Request" error
4. Error propagates: "All calendar sources failed: Failed to list events from Google Calendar: Failed after 3 attempts: Bad Request"

### Steps to Reproduce
1. Configure sage with Google Calendar enabled:
   ```bash
   # Via update_config MCP tool
   calendar.sources.google.enabled = true
   ```
2. Authenticate with Google OAuth (tokens stored successfully)
3. Call list_calendar_events via MCP:
   ```typescript
   list_calendar_events({
     startDate: "2026-01-05",
     endDate: "2026-01-06"
   })
   ```
4. Observe error: "Bad Request"

### Environment
- **Version**: sage v0.8.7
- **Platform**: Linux (remote MCP server at mcp.ohno.be)
- **Configuration**:
  - Google Calendar enabled
  - Valid OAuth tokens present
  - GoogleCalendarService initialized correctly
  - CalendarSourceManager using GoogleCalendarService

## Impact Assessment

### Severity
- [ ] Critical - System unusable
- [x] High - Major functionality broken
- [ ] Medium - Feature impaired but workaround exists
- [ ] Low - Minor issue or cosmetic

### Affected Users
All users attempting to use Google Calendar API integration:
- Remote MCP server users with Google Calendar configured
- Users on non-macOS platforms where EventKit is unavailable
- Any user wanting to access Google Calendar events

### Affected Features
- Google Calendar event listing completely broken
- `list_calendar_events` tool fails when Google Calendar is enabled
- `find_available_slots` tool fails (depends on event listing)
- Multi-source calendar support unusable for Google Calendar
- Forces users to disable Google Calendar and use EventKit only

## Additional Context

### Error Messages
```
Error: カレンダーイベントの取得に失敗しました: All calendar sources failed: Failed to list events from Google Calendar: Failed after 3 attempts: Bad Request
```

Full error chain:
1. CalendarSourceManager.getEvents() → calls GoogleCalendarService.listEvents()
2. GoogleCalendarService.listEvents() → calls Google Calendar API
3. Google Calendar API → returns 400 Bad Request
4. Retry logic attempts 3 times → all fail
5. Error bubbles up to user

### Screenshots/Media
N/A

### Related Issues
- Related to recently fixed bug: remote-mcp-ignores-calendar-sources
- CalendarSourceManager integration is working correctly
- GoogleCalendarService initialization is correct
- OAuth authentication is successful
- **Only issue**: Date format incompatibility

### API Documentation Reference
Google Calendar API requires RFC3339 format for `timeMin` and `timeMax` parameters:

**Required Format**:
```
YYYY-MM-DDTHH:MM:SS±HH:MM  (with timezone offset)
or
YYYY-MM-DDTHH:MM:SSZ       (UTC)
```

**Examples**:
- ✅ Correct: `"2026-01-05T00:00:00+09:00"` (JST)
- ✅ Correct: `"2026-01-05T00:00:00Z"` (UTC)
- ❌ Wrong: `"2026-01-05"` (date only - causes Bad Request)

**RFC3339 Requirements**:
1. Must include time component (HH:MM:SS)
2. Must include timezone designator (Z or ±HH:MM)
3. Seconds are mandatory (cannot omit)
4. T separator required between date and time

## Initial Analysis

### Suspected Root Cause
GoogleCalendarService.listEvents() method passes date strings directly to Google Calendar API without normalization to RFC3339 format.

**Current Code Flow**:
```
User input: "2026-01-05"
  ↓
CalendarSourceManager.getEvents(startDate, endDate, calendarId)
  ↓
GoogleCalendarService.listEvents({ startDate, endDate, calendarId })
  ↓
this.calendarClient!.events.list({
  timeMin: request.startDate,  // ❌ "2026-01-05" (invalid)
  timeMax: request.endDate,    // ❌ "2026-01-06" (invalid)
  ...
})
  ↓
Google Calendar API → 400 Bad Request
```

**What should happen**:
```
User input: "2026-01-05"
  ↓
GoogleCalendarService.listEvents() normalizes dates
  ↓
this.calendarClient!.events.list({
  timeMin: "2026-01-05T00:00:00Z",  // ✅ Valid RFC3339
  timeMax: "2026-01-06T00:00:00Z",  // ✅ Valid RFC3339
  ...
})
```

### Affected Components
- **File**: `src/integrations/google-calendar-service.ts`
  - **Method**: `listEvents(request: ListEventsRequest)` - Lines 153-227
  - **Lines**: 169-176 - events.list() API call with date parameters
  - **Issue**: No date normalization before API call

**Specific problematic code** (lines 169-176):
```typescript
return (
  await this.calendarClient!.events.list({
    calendarId: calendarId,
    timeMin: request.startDate,  // ❌ Passes raw date string
    timeMax: request.endDate,    // ❌ Passes raw date string
    maxResults: 250,
    pageToken: pageToken,
    singleEvents: true,
  })
).data;
```

### Why This Wasn't Caught
1. Google Calendar integration was recently added
2. Remote MCP server was using EventKit only (bug just fixed)
3. No integration tests with actual Google Calendar API
4. Unit tests don't validate API parameter format
5. Date format validation not implemented

---

**Report Status**: Ready for Analysis Phase
**Next Step**: Execute `/bug-analyze` to design solution and implementation plan
