# Bug Report

## Bug Summary
Remote MCP server (mcp-handler.ts) ignores `calendar.sources` configuration and always uses EventKit. GoogleCalendarService is never initialized, and CalendarSourceManager is not used in remote mode despite being available.

## Bug Details

### Expected Behavior
When Google Calendar is enabled in config:
1. User sets `calendar.sources.google.enabled: true` via `update_config` MCP tool
2. User disables EventKit with `calendar.sources.eventkit.enabled: false`
3. User authenticates with Google OAuth and stores tokens at `~/.sage/google_oauth_tokens.enc`
4. Server initializes both CalendarService and GoogleCalendarService
5. CalendarSourceManager uses GoogleCalendarService based on config
6. `list_calendar_events` returns events from Google Calendar with `source: "google"`

### Actual Behavior
After proper Google Calendar setup:
1. Config file correctly shows `google.enabled: true` and `eventkit.enabled: false`
2. OAuth tokens are successfully stored at `~/.sage/google_oauth_tokens.enc`
3. Server restarts successfully
4. `list_calendar_events` still returns events from EventKit with `method: "eventkit"`
5. Created events have EventKit ID format: `218F62EC-7F99-49A0-8344-1C75CB06F13D:CC71BAD3-AAC9-454E-A456-ACDADCBA8FEF`
6. pm2 logs show **no Google Calendar API activity** (no authentication attempts, no API calls)

### Steps to Reproduce
1. Set up Google Calendar integration:
   ```bash
   # On remote server
   export GOOGLE_CLIENT_ID="734303066448-r8lel26pbliq263j4a2ac2jd3sdlaogb.apps.googleusercontent.com"
   export GOOGLE_CLIENT_SECRET="GOCSPX-XXXXXXXXXXXXXXXXXXXX"
   pm2 restart sage-remote
   ```

2. Complete OAuth authentication:
   ```bash
   node /tmp/google-oauth.js
   # Follow OAuth flow, tokens stored successfully
   ```

3. Update config to enable Google Calendar:
   ```bash
   # Via MCP tool
   update_config --section calendar --updates '{"sources":{"eventkit":{"enabled":false},"google":{"enabled":true,"defaultCalendar":"primary","excludedCalendars":[],"syncInterval":300,"enableNotifications":true}}}'
   ```

4. Verify config file:
   ```bash
   cat ~/.sage/config.json
   # Shows correct settings: google.enabled=true, eventkit.enabled=false
   ```

5. Restart server:
   ```bash
   pm2 restart sage-remote
   ```

6. Test calendar listing:
   ```bash
   # Via MCP tool
   list_calendar_events --startDate 2025-01-05 --endDate 2025-01-06
   # Returns: "method": "eventkit" ❌
   # Expected: "source": "google" ✅
   ```

7. Check logs:
   ```bash
   pm2 logs sage-remote --lines 100 | grep -i "google\|calendar"
   # Shows: No Google Calendar API activity
   ```

### Environment
- **Version**: sage v0.8.6
- **Platform**: Linux (remote server at mcp.ohno.be)
- **Configuration**:
  - Server: Remote MCP Server (HTTP transport)
  - Calendar Sources: Google Calendar enabled, EventKit disabled
  - OAuth Tokens: Present at `~/.sage/google_oauth_tokens.enc`
  - Environment Variables: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set in pm2

## Impact Assessment

### Severity
- [ ] Critical - System unusable
- [x] High - Major functionality broken
- [ ] Medium - Feature impaired but workaround exists
- [ ] Low - Minor issue or cosmetic

### Affected Users
All users using sage Remote MCP Server who want to use Google Calendar API:
- Users connecting to deployed sage instances via HTTP transport
- Users on non-macOS platforms (Linux, Windows) where EventKit is unavailable
- Users wanting to access Google Calendar specifically (e.g., work calendar like sh1@mercari.com)

### Affected Features
- Google Calendar API integration completely non-functional in remote mode
- Calendar source selection (CalendarSourceManager) ignored
- Configuration `calendar.sources` setting has no effect
- Multi-source calendar support broken in remote mode
- Users forced to use EventKit even when explicitly disabled

## Additional Context

### Configuration Files
**Remote server config** (`~/.sage/config.json`):
```json
{
  "calendar": {
    "sources": {
      "eventkit": {
        "enabled": false
      },
      "google": {
        "enabled": true,
        "defaultCalendar": "primary",
        "excludedCalendars": [],
        "syncInterval": 300,
        "enableNotifications": true
      }
    }
  }
}
```

**OAuth tokens** (present and valid):
```bash
$ ls -l ~/.sage/google_oauth_tokens.enc
-rw------- 1 user user 512 Jan 5 12:00 /home/user/.sage/google_oauth_tokens.enc
```

**pm2 ecosystem.config.js**:
```javascript
module.exports = {
  apps: [{
    name: 'sage-remote',
    script: './dist/index.js',
    args: '--remote',
    env: {
      GOOGLE_CLIENT_ID: '734303066448-r8lel26pbliq263j4a2ac2jd3sdlaogb.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'GOCSPX-XXXXXXXXXXXXXXXXXXXX',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/oauth/callback'
    }
  }]
}
```

### Evidence
Test event created via `create_calendar_event`:
```json
{
  "eventId": "218F62EC-7F99-49A0-8344-1C75CB06F13D:CC71BAD3-AAC9-454E-A456-ACDADCBA8FEF",
  "source": "eventkit"
}
```
This ID format confirms EventKit usage (EventKit uses UUID:UUID format, Google Calendar uses alphanumeric IDs).

### Related Code
- `src/cli/mcp-handler.ts` - Remote MCP handler (uses CalendarService directly)
- `src/tools/calendar/handlers.ts` - Calendar tool handlers (uses CalendarSourceManager correctly)
- `src/integrations/calendar-source-manager.ts` - Multi-source manager (not used in remote mode)

## Initial Analysis

### Suspected Root Cause
Code investigation reveals architectural inconsistency between local and remote MCP implementations:

#### 1. **Local MCP Implementation** (`src/index.ts`):
- Uses extracted tool handlers from `src/tools/calendar/handlers.ts`
- Handlers correctly use `CalendarSourceManager`
- CalendarSourceManager initialized with both CalendarService and GoogleCalendarService
- Respects `calendar.sources` configuration

#### 2. **Remote MCP Implementation** (`src/cli/mcp-handler.ts`):
- Lines 742-874: `list_calendar_events` tool directly uses `this.calendarService.listEvents()`
- **Does NOT use CalendarSourceManager**
- Lines 157-172: `initializeServices()` only creates CalendarService
- **GoogleCalendarService never initialized**
- **CalendarSourceManager never initialized**

**Specific problematic code** (src/cli/mcp-handler.ts:819):
```typescript
const result = await this.calendarService!.listEvents({
  startDate,
  endDate,
  calendarName,
});
```

**What it should be**:
```typescript
const result = await this.calendarSourceManager!.getEvents(
  startDate,
  endDate,
  calendarId
);
```

**initializeServices issue** (src/cli/mcp-handler.ts:157-172):
```typescript
private initializeServices(userConfig: UserConfig): void {
  this.reminderManager = new ReminderManager({...});
  this.calendarService = new CalendarService(); // Only EventKit
  // Missing: this.googleCalendarService = new GoogleCalendarService();
  // Missing: this.calendarSourceManager = new CalendarSourceManager({...});
  this.notionService = new NotionMCPService();
  // ...
}
```

### Affected Components
- `src/cli/mcp-handler.ts` - Remote MCP handler implementation
  - Lines 114-126: Service initialization properties
  - Lines 157-172: initializeServices method
  - Lines 742-874: list_calendar_events tool
  - Lines 562-740: find_available_slots tool
  - Lines 1456-1611: create_calendar_event tool
  - Lines 1180-1327: respond_to_calendar_event tool
  - Lines 1613-1740: delete_calendar_event tool

### Why This Wasn't Caught
1. Local MCP mode works correctly (uses proper handlers)
2. Remote MCP mode has separate implementation
3. No integration tests for remote mode calendar operations
4. E2E tests focus on HTTP server startup, not tool behavior

## Proposed Fix

### High-Level Approach
Refactor remote MCP handler to use CalendarSourceManager like local mode does:

1. Add CalendarSourceManager and GoogleCalendarService to mcp-handler.ts state
2. Modify initializeServices to create CalendarSourceManager with both services
3. Replace direct CalendarService calls with CalendarSourceManager calls
4. Use extracted handlers from `src/tools/calendar/handlers.ts` where possible
5. Ensure consistency between local and remote implementations

### Files to Modify
1. `src/cli/mcp-handler.ts` - Main refactoring
2. `tests/e2e/cli-modes.test.ts` - Add calendar source selection tests

### Complexity Estimate
- **Lines of code**: ~300 lines across 1-2 files
- **Risk level**: Medium (affects remote MCP server, but local mode unaffected)
- **Testing requirements**: E2E tests for remote mode + manual verification

---

**Report Status**: ✅ Resolved
**Resolution Date**: 2026-01-05
**Fix Version**: v0.8.7 (commits b61b1c6, 6f5619f)
**Fix Summary**: Integrated CalendarSourceManager into Remote MCP server. All 8 calendar tools now use extracted handlers that respect `calendar.sources` configuration. GoogleCalendarService properly initialized.
**Verification**:
- Production MCP testing confirmed CalendarSourceManager is used
- Code review verified all handlers use createCalendarToolsContext()
- All automated tests passing (calendar-related)
- Error pattern changed from EventKit-only to multi-source attempt
