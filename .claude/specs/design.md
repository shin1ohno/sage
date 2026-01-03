# Sage - Design Document

**Version**: 0.7.8
**Status**: ✅ Complete
**Last Updated**: 2026-01-03

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Component Design](#component-design)
3. [Data Models](#data-models)
4. [Integration Design](#integration-design)
5. [Security Design](#security-design)
6. [API Design](#api-design)

---

## System Architecture

> 詳細は [architecture.md](./architecture.md) を参照

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Clients                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │  Desktop   │  │   Code     │  │  iOS/iPadOS/Web    │   │
│  │    MCP     │  │    CLI     │  │   (Remote MCP)     │   │
│  └─────┬──────┘  └─────┬──────┘  └──────────┬─────────┘   │
└────────┼───────────────┼────────────────────┼───────────────┘
         │               │                    │
         │ Stdio         │ Stdio              │ HTTPS/SSE
         │               │                    │
┌────────▼───────────────▼────────────────────▼───────────────┐
│                      Sage MCP Server                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              MCP Protocol Handler                     │  │
│  │  • Tool Registry (18 tools)                          │  │
│  │  • Request/Response Processing                       │  │
│  │  • Error Handling                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Platform Abstraction Layer               │  │
│  │  • MCPAdapter (Desktop/Code - Stdio)                 │  │
│  │  • RemoteMCPAdapter (iOS/Web - HTTP/SSE)            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Core Services                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│  │  │   Task      │  │  Calendar   │  │  Reminder   │ │  │
│  │  │  Analyzer   │  │   Service   │  │   Manager   │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│  │  │    TODO     │  │   Config    │  │   Working   │ │  │
│  │  │   Manager   │  │   Manager   │  │   Cadence   │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Integration Layer                        │  │
│  │  • Apple Reminders (AppleScript)                     │  │
│  │  • Calendar.app (EventKit)                           │  │
│  │  • Notion (MCP Protocol)                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Authentication Layer                     │  │
│  │  • OAuth 2.1 Server (PKCE, Dynamic Registration)    │  │
│  │  • JWT Token Service                                 │  │
│  │  • Session Management                                │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Apple     │      │  Calendar   │      │   Notion    │
│  Reminders  │      │    .app     │      │     API     │
└─────────────┘      └─────────────┘      └─────────────┘
```

### Layer Responsibilities

#### 1. MCP Protocol Handler
- Tool registration and discovery
- Request parsing and validation
- Response formatting
- Error handling and retry logic

#### 2. Platform Abstraction Layer
- Platform detection (macOS, Linux, unknown)
- Transport selection (Stdio, HTTP/SSE)
- Platform-specific feature availability

#### 3. Core Services Layer
- Business logic implementation
- Data processing and analysis
- Cross-platform compatibility

#### 4. Integration Layer
- External system communication
- AppleScript/EventKit execution
- MCP client management

#### 5. Authentication Layer
- OAuth 2.1 authorization flow
- Token generation and validation
- Session lifecycle management

---

## Component Design

> 詳細は [components.md](./components.md) を参照

### Core Components

#### 1. Task Analyzer (`src/tools/analyze-tasks.ts`)
**Responsibility**: Task analysis, prioritization, time estimation

**Key Methods**:
- `analyzeTasks(input: string)`: Main entry point
- `splitTasks(input: string)`: Task separation
- `estimateTime(task: Task)`: Time estimation
- `extractStakeholders(task: Task)`: Stakeholder identification

**Dependencies**:
- TaskSplitter
- PriorityEngine
- TimeEstimator
- StakeholderExtractor

#### 2. Calendar Service (`src/integrations/calendar-service.ts`)
**Responsibility**: Calendar operations via EventKit

**Key Methods**:
- `listEvents(request: ListEventsRequest)`: List events
- `createEvent(request: CreateEventRequest)`: Create event
- `deleteEvent(eventId: string)`: Delete event
- `respondToEvent(request: RespondRequest)`: Respond to invitation

**Platform Support**: macOS only (EventKit)

#### 3. Reminder Manager (`src/integrations/reminder-manager.ts`)
**Responsibility**: Reminder routing (Apple Reminders vs Notion)

**Key Methods**:
- `setReminder(task: Task)`: Route based on deadline
- `routeToAppleReminders(task: Task)`: 7-day rule
- `routeToNotion(task: Task)`: 8+ days or no deadline

**Integration Strategy**:
```typescript
if (deadline <= 7 days) {
  → Apple Reminders (native notifications)
} else {
  → Notion (project management)
}
```

#### 4. OAuth Server (`src/oauth/oauth-server.ts`)
**Responsibility**: OAuth 2.1 authentication flow

**Key Methods**:
- `authorize(request: AuthorizeRequest)`: Authorization endpoint
- `token(request: TokenRequest)`: Token endpoint
- `register(request: RegisterRequest)`: Dynamic client registration
- `validateToken(token: string)`: Token validation

**Compliance**: OAuth 2.1, RFC 8414, RFC 7591, RFC 9728

#### 5. MCP Handler (`src/cli/mcp-handler.ts`)
**Responsibility**: HTTP/SSE transport for Remote MCP

**Key Methods**:
- `handleToolsList()`: List available tools
- `handleToolCall(request: ToolCallRequest)`: Execute tool
- `handleSSEConnection(req, res)`: SSE stream management

**Transport**: HTTP POST + SSE GET

---

## Data Models

> 詳細は [data-models.md](./data-models.md) を参照

### Core Types

#### Task
```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  estimatedMinutes: number;
  deadline?: string;
  stakeholders: string[];
  status: 'not_started' | 'in_progress' | 'completed';
  source: 'user_input' | 'apple_reminders' | 'notion';
  createdAt: string;
  updatedAt: string;
}
```

#### CalendarEvent
```typescript
interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  isAllDay: boolean;
  calendar: string;
  location?: string;
  source: 'eventkit' | 'web';
}
```

#### Config
```typescript
interface SageConfig {
  user: {
    name: string;
    timezone: string;
  };
  calendar: {
    workingHours: {
      start: string; // HH:MM
      end: string; // HH:MM
    };
    deepWorkDays: string[];
    meetingHeavyDays: string[];
  };
  reminders: {
    appleRemindersListName: string;
    shortTermThresholdDays: number;
  };
  notion: {
    databaseId: string;
  };
  priority: {
    rules: PriorityRule[];
  };
}
```

#### OAuth Types
```typescript
interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: string;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  expiresAt: string;
}

interface AccessToken {
  token: string;
  clientId: string;
  scope: string[];
  expiresAt: string;
}
```

---

## Integration Design

> 詳細は [integrations.md](./integrations.md) を参照

### 1. Apple Reminders Integration

**Technology**: AppleScript via `run-applescript`

**Operations**:
- Create reminder with due date
- List reminders from specific list
- Update reminder status
- Delete reminder

**Limitations**:
- macOS only
- Requires accessibility permissions
- No batch operations

### 2. Calendar.app Integration

**Technology**: EventKit via AppleScriptObjC

**Operations**:
- List events (with recurring event expansion)
- Create events (with alarms)
- Delete events (single or batch)
- Respond to invitations

**Advantages**:
- Direct EventKit access
- Recurring event support
- Calendar permissions integration

### 3. Notion Integration

**Technology**: MCP Protocol

**Operations**:
- Create page in database
- Query database
- Update page properties

**Configuration**:
```json
{
  "notion": {
    "databaseId": "abc123...",
    "workspace": "My Workspace"
  }
}
```

---

## Security Design

> 詳細は [security.md](./security.md) を参照

### Authentication

#### Local MCP (Desktop/Code)
- No authentication (local process trust)
- File system permissions for config

#### Remote MCP (iOS/Web)
- OAuth 2.1 with PKCE (S256)
- JWT access tokens (24h expiry)
- Refresh tokens with rotation
- Cookie-based session (SSE reconnection)

### Authorization

**Scope System**:
- `tasks:read` - Read task data
- `tasks:write` - Create/update tasks
- `calendar:read` - Read calendar events
- `calendar:write` - Modify calendar events
- `reminders:read` - Read reminders
- `reminders:write` - Create/update reminders

### Data Protection

**At Rest**:
- Config files: `~/.sage/config.json` (600 permissions)
- Tokens: In-memory only (no persistence)
- Logs: No sensitive data

**In Transit**:
- HTTPS required for Remote MCP
- TLS 1.2+ only
- Certificate validation enforced

---

## API Design

### MCP Tools (18 total)

#### Setup & Configuration
1. `check_setup_status` - Check if setup is complete
2. `start_setup_wizard` - Initialize setup wizard
3. `answer_wizard_question` - Answer setup question
4. `save_config` - Save configuration
5. `update_config` - Update configuration

#### Task Management
6. `analyze_tasks` - Analyze and prioritize tasks
7. `list_todos` - List TODO items
8. `update_task_status` - Update task status
9. `sync_to_notion` - Sync task to Notion

#### Reminders
10. `set_reminder` - Create reminder (auto-routed)

#### Calendar
11. `find_available_slots` - Find calendar availability
12. `list_calendar_events` - List events
13. `create_calendar_event` - Create event
14. `delete_calendar_event` - Delete event
15. `delete_calendar_events_batch` - Batch delete
16. `respond_to_calendar_event` - Respond to invitation
17. `respond_to_calendar_events_batch` - Batch respond

#### Working Cadence
18. `get_working_cadence` - Get working rhythm info

### Error Handling

**Error Response Format**:
```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context"
  }
}
```

**Common Error Codes**:
- `PLATFORM_NOT_SUPPORTED` - Feature unavailable on platform
- `INTEGRATION_UNAVAILABLE` - External integration not available
- `VALIDATION_ERROR` - Input validation failed
- `AUTH_REQUIRED` - Authentication required
- `PERMISSION_DENIED` - Insufficient permissions

---

## Design Principles

### 1. Platform Abstraction
- Single codebase for all platforms
- Platform-specific features gracefully degrade
- Consistent API across platforms

### 2. Fail-Safe Design
- Retry with exponential backoff
- Graceful degradation on integration failure
- Detailed error messages for debugging

### 3. User Experience
- Minimal configuration required
- Intelligent defaults
- Natural language input processing

### 4. Security First
- OAuth 2.1 best practices
- PKCE for public clients
- Secure token storage

### 5. Testability
- Dependency injection
- Platform detection mockable
- Integration tests with fixtures

---

## Performance Considerations

### Response Time Targets
- Task analysis: < 2s
- Calendar operations: < 1s
- Reminder creation: < 500ms
- Config updates: < 100ms

### Scalability
- Stateless design (except OAuth sessions)
- Horizontal scaling for Remote MCP
- Rate limiting: 100 req/min per client

### Resource Usage
- Memory: < 100MB typical
- CPU: < 5% idle, < 30% under load
- Disk: Config files only (< 1MB)

---

## Maintenance & Monitoring

### Logging
- Structured logging (JSON)
- Log levels: ERROR, WARN, INFO, DEBUG
- No sensitive data in logs

### Metrics
- Request count by tool
- Response time percentiles
- Error rate by type
- OAuth token issuance rate

### Health Checks
- `/health` endpoint
- Calendar integration status
- Notion integration status
- Config file validity

---

**See Also**:
- [spec.md](./spec.md) - Main specification
- [requirements.md](./requirements.md) - Detailed requirements
- [tasks.md](./tasks.md) - Implementation tasks
- [testing.md](./testing.md) - Testing strategy
