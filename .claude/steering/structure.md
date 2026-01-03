# Project Structure Steering Document

## Directory Structure

```
sage/
├── src/                          # Source code
│   ├── index.ts                  # Main entry point, MCP tool definitions
│   ├── version.ts                # Version constant (sync with package.json)
│   ├── cli/                      # CLI and HTTP server
│   │   ├── http-server-with-config.ts  # Remote MCP HTTP server
│   │   ├── mcp-handler.ts        # MCP request handler
│   │   ├── parser.ts             # CLI argument parser
│   │   └── ...
│   ├── config/                   # Configuration management
│   │   ├── config-manager.ts     # Config CRUD operations
│   │   ├── loader.ts             # Config file loading
│   │   └── validation.ts         # Zod schemas for config
│   ├── core/                     # Core business logic
│   │   ├── task-analyzer.ts      # Task analysis engine
│   │   ├── priority-engine.ts    # Priority determination
│   │   └── time-estimator.ts     # Time estimation
│   ├── integrations/             # External service integrations
│   │   ├── calendar-service.ts   # EventKit calendar operations
│   │   ├── google-calendar-service.ts  # Google Calendar API
│   │   ├── calendar-source-manager.ts  # Multi-source orchestration
│   │   ├── apple-reminders.ts    # Apple Reminders via AppleScript
│   │   ├── notion-mcp.ts         # Notion via MCP
│   │   └── working-cadence.ts    # Working rhythm features
│   ├── oauth/                    # OAuth 2.1 implementation
│   │   ├── oauth-server.ts       # OAuth endpoints
│   │   ├── token-service.ts      # JWT token management
│   │   └── google-oauth-handler.ts  # Google OAuth flow
│   ├── platform/                 # Platform abstraction
│   │   ├── detector.ts           # Platform detection
│   │   └── adapters/             # Platform-specific adapters
│   ├── services/                 # Application services
│   ├── setup/                    # Setup wizard
│   │   └── wizard.ts             # Interactive setup
│   ├── types/                    # TypeScript type definitions
│   │   ├── config.ts             # Configuration types
│   │   └── google-calendar-types.ts  # Google Calendar types
│   └── utils/                    # Utility functions
│       └── retry.ts              # Retry with backoff
├── tests/                        # Test suites
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── integrations/             # Integration service tests
│   ├── e2e/                      # End-to-end tests
│   └── helpers/                  # Test utilities
├── docs/                         # User documentation
│   ├── SETUP-LOCAL.md            # Local MCP setup guide
│   ├── SETUP-REMOTE.md           # Remote MCP setup guide
│   ├── CONFIGURATION.md          # Configuration reference
│   └── TROUBLESHOOTING.md        # Common issues
├── .claude/                      # Claude Code configuration
│   ├── specs/                    # Specification documents
│   │   ├── spec.md               # Main spec hub
│   │   ├── requirements.md       # EARS requirements
│   │   ├── design.md             # Design overview
│   │   ├── tasks.md              # Implementation tasks
│   │   └── ...
│   └── steering/                 # Steering documents (this)
└── dist/                         # Compiled output (gitignored)
```

## Naming Conventions

### Files
| Type | Convention | Example |
|------|------------|---------|
| TypeScript source | kebab-case | `calendar-service.ts` |
| Test files | `*.test.ts` | `calendar-service.test.ts` |
| Type definitions | `*-types.ts` | `google-calendar-types.ts` |
| Config files | kebab-case | `config-manager.ts` |

### Code
| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `CalendarSourceManager` |
| Interfaces | PascalCase | `CalendarEvent` |
| Functions | camelCase | `determinePriority()` |
| Constants | SCREAMING_SNAKE_CASE | `PRIORITY_KEYWORDS` |
| Variables | camelCase | `eventList` |
| Type parameters | T, K, V | `Promise<T>` |

### MCP Tools
- Tool names: snake_case (`analyze_tasks`, `list_calendar_events`)
- Parameter names: camelCase in schema (`startDate`, `calendarName`)

## Module Patterns

### Export Pattern
```typescript
// Prefer named exports
export class CalendarService { ... }
export function createCalendarEvent() { ... }
export type CalendarEvent = { ... };

// Avoid default exports except for main entry
export default server;  // Only in index.ts
```

### Import Pattern
```typescript
// Group imports: external, internal, types
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CalendarService } from './integrations/calendar-service.js';
import type { CalendarEvent } from './types/calendar.js';
```

### Dependency Injection
```typescript
// Services receive dependencies via constructor
class CalendarSourceManager {
  constructor(
    private calendarService: CalendarService,
    private googleCalendarService: GoogleCalendarService,
    private configManager: ConfigManager
  ) {}
}
```

## Testing Patterns

### Test File Location
- Unit tests: `tests/unit/<module>.test.ts`
- Integration tests: `tests/integration/<feature>.test.ts`
- E2E tests: `tests/e2e/<workflow>.test.ts`

### Test Structure (AAA Pattern)
```typescript
describe('CalendarService', () => {
  describe('listEvents', () => {
    it('should return events within date range', async () => {
      // Arrange
      const service = new CalendarService();
      const startDate = '2026-01-01';

      // Act
      const events = await service.listEvents({ startDate, endDate });

      // Assert
      expect(events).toHaveLength(3);
    });
  });
});
```

### Platform Mocking
```typescript
// Mock AppleScript on non-macOS platforms
jest.mock('run-applescript', () => ({
  runAppleScript: jest.fn().mockResolvedValue('[]')
}));
```

## Documentation Standards

### Spec Documents (`.claude/specs/`)
- **Format**: EARS notation for requirements
- **Diagrams**: Mermaid
- **Language**: Japanese (code comments in English)

### Code Comments
- Language: English
- JSDoc for public APIs
- Inline comments for complex logic only

### User Documentation (`docs/`)
- Language: English (with Japanese examples where relevant)
- Step-by-step guides
- Configuration reference tables

## Version Management

### Locations to Update
When bumping version:
1. `package.json` - `"version": "x.x.x"`
2. `src/version.ts` - `export const VERSION = 'x.x.x'`
3. `.claude/specs/spec.md` - Version header
4. `.claude/specs/status.md` - Version and changelog

### Git Tags
- Format: `vX.X.X` (e.g., `v0.8.0`)
- Create after version bump commit
