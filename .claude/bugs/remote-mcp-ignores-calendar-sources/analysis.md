# Bug Analysis

## Root Cause Analysis

### Investigation Summary
Conducted comprehensive comparison between local MCP implementation (src/index.ts) and remote MCP implementation (src/cli/mcp-handler.ts). The remote implementation does not use the CalendarSourceManager architecture that was designed for multi-source calendar support.

**Key Finding**: Remote MCP handler has architectural divergence from local MCP handler:
- Local MCP uses extracted handlers from `src/tools/calendar/handlers.ts` (✅ Uses CalendarSourceManager)
- Remote MCP has inline tool implementations (❌ Directly uses CalendarService)

### Root Cause
**The remote MCP handler (`src/cli/mcp-handler.ts`) bypasses CalendarSourceManager and directly uses CalendarService for all calendar operations.**

Evidence:
1. **initializeServices() Incomplete**: Lines 157-172 only initialize CalendarService
   - Missing: GoogleCalendarService initialization
   - Missing: CalendarSourceManager initialization
2. **Direct CalendarService Usage**: Line 819 directly calls `this.calendarService.listEvents()`
   - Should use: `this.calendarSourceManager.getEvents()`
3. **Service Properties Missing**: Lines 114-126 declare services but CalendarSourceManager not included
4. **All Calendar Tools Affected**: list_calendar_events, find_available_slots, create_calendar_event, respond_to_calendar_event, delete_calendar_event all bypass CalendarSourceManager

### Contributing Factors
1. **Architectural Inconsistency**: Two different implementations for local vs remote mode
2. **Code Duplication**: Calendar tools implemented twice (handlers vs inline)
3. **Missing Integration**: CalendarSourceManager exists but not integrated into remote mode
4. **Test Gap**: No E2E tests verifying calendar source selection in remote mode

## Technical Details

### Affected Code Locations

#### Problem Area 1: Service Initialization
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 114-126 (property declarations), 157-172 (initializeServices method)
- **Current Code**:
  ```typescript
  private calendarService: CalendarService | null = null;
  // Missing: private calendarSourceManager: CalendarSourceManager | null = null;
  // Missing: private googleCalendarService: GoogleCalendarService | null = null;

  private initializeServices(userConfig: UserConfig): void {
    this.reminderManager = new ReminderManager({...});
    this.calendarService = new CalendarService();  // Only EventKit
    // Missing: GoogleCalendarService initialization
    // Missing: CalendarSourceManager initialization
    this.notionService = new NotionMCPService();
    // ...
  }
  ```
- **Issue**: CalendarSourceManager and GoogleCalendarService never created

#### Problem Area 2: list_calendar_events Tool
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 742-874 (tool registration), 819 (direct CalendarService call)
- **Current Code**:
  ```typescript
  const result = await this.calendarService!.listEvents({
    startDate,
    endDate,
    calendarName,
  });
  ```
- **Issue**: Bypasses CalendarSourceManager, always uses EventKit

#### Problem Area 3: find_available_slots Tool
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 562-740 (tool registration), 659 (direct CalendarService call)
- **Current Code**:
  ```typescript
  const events = await this.calendarService!.fetchEvents(searchStart, searchEnd);
  ```
- **Issue**: Bypasses CalendarSourceManager

#### Problem Area 4: create_calendar_event Tool
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 1456-1611 (tool registration), 1543 (CalendarEventCreatorService)
- **Current Code**:
  ```typescript
  const result = await this.calendarEventCreatorService!.createEvent({...});
  ```
- **Issue**: CalendarEventCreatorService uses EventKit directly, should use CalendarSourceManager

#### Problem Area 5: respond_to_calendar_event and delete_calendar_event Tools
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 1180-1327 (respond), 1613-1740 (delete)
- **Issue**: Use CalendarEventResponseService and CalendarEventDeleterService which don't support source selection

### Data Flow Analysis

**Current Flow (Remote MCP - WRONG)**:
```
Client → HTTP Server → mcp-handler.ts
  → list_calendar_events tool
    → this.calendarService.listEvents()  ❌ Direct EventKit call
      → EventKit (macOS) or error (other platforms)
```

**Expected Flow (Should Match Local MCP)**:
```
Client → HTTP Server → mcp-handler.ts
  → list_calendar_events tool
    → this.calendarSourceManager.getEvents()  ✅ Multi-source manager
      → Check config.calendar.sources
        → If google.enabled: GoogleCalendarService.listEvents()
        → If eventkit.enabled: CalendarService.listEvents()
      → Deduplicate and merge results
```

**Correct Flow (Local MCP - REFERENCE)**:
```
Client → StdioServer → index.ts
  → handleListCalendarEvents (from handlers.ts)
    → calendarSourceManager.getEvents()  ✅ Correct
      → Respects config.calendar.sources
      → Uses GoogleCalendarService when enabled
```

### Dependencies
- `src/integrations/calendar-source-manager.ts` - Exists but not used in remote mode
- `src/integrations/google-calendar-service.ts` - Exists but not initialized in remote mode
- `src/integrations/calendar-service.ts` - Used directly (wrong pattern)
- `src/tools/calendar/handlers.ts` - Contains correct implementations but not reused

## Impact Analysis

### Direct Impact
- **Google Calendar Integration Broken**: Users cannot use Google Calendar API in remote mode
- **Configuration Ignored**: `calendar.sources` setting has no effect
- **Platform Limitation**: Linux/Windows users stuck with unavailable EventKit
- **Multi-Source Support Non-Functional**: Cannot use multiple calendar sources simultaneously

### Indirect Impact
- **User Trust**: Feature advertised in docs but doesn't work
- **Architecture Debt**: Duplicate implementations create maintenance burden
- **Testing Reliability**: Local tests pass but remote mode broken
- **Future Development**: Any CalendarSourceManager improvements won't apply to remote mode

### Risk Assessment
**If not fixed**:
- Google Calendar integration unusable for remote/iOS/web users
- Code divergence worsens over time
- Bug reports for "Google Calendar not working" will continue
- Remote mode becomes second-class citizen with missing features

## Solution Approach

### Fix Strategy
**Refactor remote MCP handler to use CalendarSourceManager architecture**:

#### Phase 1: Add CalendarSourceManager to Remote MCP Handler
1. Add CalendarSourceManager and GoogleCalendarService to mcp-handler.ts properties
2. Initialize both services in initializeServices() method
3. Create CalendarSourceManager with proper config
4. Update context creation methods to include CalendarSourceManager

#### Phase 2: Refactor Calendar Tools to Use Handlers
**Option A (Recommended)**: Use extracted handlers from `src/tools/calendar/handlers.ts`
- Replace inline tool implementations with handler function calls
- Create CalendarToolsContext in mcp-handler.ts
- Reuse existing tested handler code
- Ensures consistency between local and remote implementations

**Option B (Alternative)**: Update inline implementations
- Keep inline tool code but replace CalendarService with CalendarSourceManager
- More code changes required
- Risk of divergence from local implementation

#### Phase 3: Remove Legacy Calendar Service Dependencies
1. Update CalendarEventCreatorService to use CalendarSourceManager
2. Update CalendarEventResponseService to support multi-source
3. Update CalendarEventDeleterService to support multi-source
4. Or replace these services with CalendarSourceManager methods

### Selected Solution: **Option A (Use Extracted Handlers)**
Rationale:
- ✅ Minimal code changes (reuse existing handlers)
- ✅ Ensures consistency with local MCP mode
- ✅ Leverages already-tested code from handlers.ts
- ✅ Reduces maintenance burden (single implementation)
- ✅ Follows existing refactoring pattern (handlers already extracted)

### Alternative Solutions Considered

**Alternative 1**: Keep separate implementations, add CalendarSourceManager to remote only
- ❌ Rejected: Continues code duplication, increases maintenance burden
- ❌ Risk: Implementations may drift apart over time

**Alternative 2**: Merge local and remote MCP handlers completely
- ❌ Rejected: Large refactoring, high risk, not necessary
- ❌ Risk: May break existing functionality

**Alternative 3**: Add abstraction layer over both implementations
- ❌ Rejected: Over-engineering, adds complexity
- ❌ Risk: Third implementation to maintain

### Risks and Trade-offs

**Risks of Selected Solution**:
1. **Breaking Changes**: Behavior changes for remote calendar tools
   - Mitigation: E2E tests, staged rollout
2. **Context Creation Complexity**: Need to create proper CalendarToolsContext
   - Mitigation: Follow existing pattern from local MCP
3. **Service Lifecycle**: CalendarSourceManager initialization timing
   - Mitigation: Lazy initialization pattern already used

**Trade-offs**:
- **Code Simplification**: Remove ~600 lines of duplicate calendar tool code
- **Consistency**: Same behavior in local and remote mode
- **Testing**: Single code path to test and maintain

## Implementation Plan

### Changes Required

#### 1. Add CalendarSourceManager Import and Properties
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: Add after line 19
- **Modification**:
  ```typescript
  import { CalendarSourceManager } from '../integrations/calendar-source-manager.js';
  import { GoogleCalendarService } from '../integrations/google-calendar-service.js';
  import type { CalendarToolsContext } from '../tools/calendar/handlers.js';
  import {
    handleListCalendarEvents,
    handleFindAvailableSlots,
    handleCreateCalendarEvent,
    handleDeleteCalendarEvent,
    handleDeleteCalendarEventsBatch,
    handleRespondToCalendarEvent,
    handleRespondToCalendarEventsBatch,
    handleListCalendarSources,
  } from '../tools/calendar/handlers.js';
  ```
- **Lines**: Add to properties (after line 118)
  ```typescript
  private calendarSourceManager: CalendarSourceManager | null = null;
  private googleCalendarService: GoogleCalendarService | null = null;
  ```

#### 2. Update initializeServices Method
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 157-172
- **Modification**:
  ```typescript
  private initializeServices(userConfig: UserConfig): void {
    this.reminderManager = new ReminderManager({
      appleRemindersThreshold: 7,
      notionThreshold: userConfig.integrations.notion.threshold,
      defaultList: userConfig.integrations.appleReminders.defaultList,
      notionDatabaseId: userConfig.integrations.notion.databaseId,
    });

    this.calendarService = new CalendarService();
    this.googleCalendarService = new GoogleCalendarService();
    this.calendarSourceManager = new CalendarSourceManager({
      calendarService: this.calendarService,
      googleCalendarService: this.googleCalendarService,
      config: userConfig,
    });

    this.notionService = new NotionMCPService();
    this.todoListManager = new TodoListManager();
    this.taskSynchronizer = new TaskSynchronizer();
    this.calendarEventResponseService = new CalendarEventResponseService();
    this.calendarEventCreatorService = new CalendarEventCreatorService();
    this.calendarEventDeleterService = new CalendarEventDeleterService();
    this.workingCadenceService = new WorkingCadenceService();
  }
  ```

#### 3. Add CalendarToolsContext Creation Method
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: Add after line 227
- **Modification**:
  ```typescript
  /**
   * Create CalendarToolsContext for calendar tool handlers
   */
  private createCalendarToolsContext(): CalendarToolsContext {
    return {
      getConfig: () => this.config,
      getCalendarSourceManager: () => this.calendarSourceManager,
      getCalendarEventResponseService: () => this.calendarEventResponseService,
      getGoogleCalendarService: () => this.googleCalendarService,
      getWorkingCadenceService: () => this.workingCadenceService,
      setWorkingCadenceService: (service: WorkingCadenceService) => {
        this.workingCadenceService = service;
      },
      initializeServices: (config: UserConfig) => this.initializeServices(config),
    };
  }
  ```

#### 4. Replace list_calendar_events Tool with Handler
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 742-874
- **Modification**: Replace entire tool implementation with:
  ```typescript
  // list_calendar_events - uses extracted handler
  this.registerTool(
    {
      name: 'list_calendar_events',
      description:
        'List calendar events for a specified period. Returns events with details including calendar name and location.',
      inputSchema: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Start date in ISO 8601 format (e.g., 2025-01-15)',
          },
          endDate: {
            type: 'string',
            description: 'End date in ISO 8601 format (e.g., 2025-01-20)',
          },
          calendarId: {
            type: 'string',
            description: 'Optional: filter events by calendar ID',
          },
        },
        required: ['startDate', 'endDate'],
      },
    },
    async (args) =>
      handleListCalendarEvents(this.createCalendarToolsContext(), {
        startDate: args.startDate as string,
        endDate: args.endDate as string,
        calendarId: args.calendarId as string | undefined,
      })
  );
  ```

#### 5. Replace find_available_slots Tool with Handler
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 562-740
- **Modification**: Replace entire tool implementation with handler call (similar pattern to #4)

#### 6. Replace create_calendar_event Tool with Handler
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 1456-1611
- **Modification**: Replace with handler call

#### 7. Replace respond_to_calendar_event Tool with Handler
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 1180-1327
- **Modification**: Replace with handler call

#### 8. Replace delete_calendar_event Tools with Handlers
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: 1613-1859
- **Modification**: Replace both delete_calendar_event and delete_calendar_events_batch with handler calls

#### 9. Add list_calendar_sources Tool
- **File**: `src/cli/mcp-handler.ts`
- **Lines**: Add after delete tools
- **Modification**:
  ```typescript
  // list_calendar_sources - uses extracted handler
  this.registerTool(
    {
      name: 'list_calendar_sources',
      description: 'List available and enabled calendar sources.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async () => handleListCalendarSources(this.createCalendarToolsContext())
  );
  ```

### Testing Strategy

**Unit Tests** (Optional - handlers already tested):
- Verify CalendarSourceManager initialization in mcp-handler
- Test context creation includes all required services

**E2E Tests** (Required):
- **File**: `tests/e2e/cli-modes.test.ts`
- Add test case:
  ```typescript
  describe('Calendar Source Selection in Remote Mode', () => {
    it('should respect calendar.sources configuration', async () => {
      // Start server with Google Calendar enabled
      // Call list_calendar_events via HTTP
      // Verify response indicates Google Calendar was used
    });
  });
  ```

**Manual Verification** (Required):
1. Build locally: `npm run build`
2. Start remote server: `node dist/index.js --remote --port 3300`
3. Configure Google Calendar via update_config tool
4. Call list_calendar_events
5. Verify `source: "google"` in response
6. Check logs for Google Calendar API activity

**Regression Testing**:
- Verify all existing E2E tests pass
- Test local MCP mode still works: `npx @shin1ohno/sage`
- Verify EventKit still works when enabled

### Rollback Plan

**If refactoring causes issues**:
1. Git tag before changes: `git tag pre-calendar-refactor`
2. Rollback: `git checkout pre-calendar-refactor`
3. Alternative: Keep old inline implementations as fallback (add feature flag)

**If CalendarSourceManager has issues**:
1. Debug CalendarSourceManager independently
2. Fix root cause in calendar-source-manager.ts
3. Tests in tests/e2e/multi-source-calendar.test.ts provide reference

**Communication**:
- Document breaking changes in CHANGELOG.md
- Update Remote MCP Server docs if behavior changes
- Notify users via release notes

## Expected Outcomes

### After Fix
- ✅ Google Calendar works in remote mode
- ✅ calendar.sources configuration respected
- ✅ Consistent behavior between local and remote mode
- ✅ ~600 lines of duplicate code removed
- ✅ Single maintenance path for calendar features

### Verification Criteria
1. `list_calendar_events` returns `source: "google"` when configured
2. pm2 logs show Google Calendar API authentication and requests
3. Events created via Google Calendar API have correct ID format
4. All E2E tests pass
5. Local MCP mode unaffected
