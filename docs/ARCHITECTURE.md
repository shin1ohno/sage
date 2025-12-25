# Sage Architecture Documentation

## Overview

Sage (賢者) is a multi-platform AI task management assistant that integrates with Apple Reminders, Notion, and Calendar services. It is designed to work across:

- **Desktop/Code MCP**: Full-featured MCP server for Claude Desktop and Claude Code
- **iOS/iPadOS Skills**: Native integration via Claude Skills (future)
- **Web Skills**: Lightweight web-compatible version (future)
- **Remote MCP**: HTTP-based MCP server for remote access

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Client                           │
│  (Desktop / Code / iOS / Web)                               │
└─────────────────────┬───────────────────────────────────────┘
                      │ MCP Protocol
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Platform Adapter Layer                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ MCP Adapter │ │ iOS Skills  │ │ Web Skills Adapter     ││
│  │  (Desktop)  │ │   Adapter   │ │                        ││
│  └──────┬──────┘ └──────┬──────┘ └───────────┬────────────┘│
└─────────┼───────────────┼───────────────────┼──────────────┘
          │               │                   │
          ▼               ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      Sage Core                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                 Task Analyzer                           ││
│  │  - Priority Engine                                      ││
│  │  - Time Estimator                                       ││
│  │  - Stakeholder Extractor                               ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │              TODO List Manager                          ││
│  │  - Multi-source sync                                    ││
│  │  - Conflict resolution                                  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Integration Layer                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐│
│  │    Apple     │ │    Notion    │ │     Calendar         ││
│  │  Reminders   │ │   MCP        │ │   Service            ││
│  │  Service     │ │   Service    │ │                      ││
│  └──────────────┘ └──────────────┘ └──────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Platform Adapter Layer

The adapter layer provides platform abstraction, allowing the same core logic to work across different environments.

**Files:**
- `src/platform/adapters/mcp-adapter.ts` - Desktop/Code MCP adapter
- `src/platform/adapters/skills-adapter-ios.ts` - iOS/iPadOS Skills adapter
- `src/platform/adapters/skills-adapter-web.ts` - Web Skills adapter
- `src/platform/adapter-factory.ts` - Factory for creating adapters

### 2. Sage Core

The core business logic for task management, independent of platform.

**Files:**
- `src/core/sage-core.ts` - Main entry point
- `src/tools/analyze-tasks.ts` - Task analysis tool
- `src/utils/priority.ts` - Priority calculation engine
- `src/utils/estimation.ts` - Time estimation system
- `src/utils/stakeholders.ts` - Stakeholder extraction

### 3. Integration Layer

Platform-specific integrations for external services.

**Files:**
- `src/integrations/apple-reminders.ts` - Apple Reminders (AppleScript)
- `src/integrations/notion-mcp.ts` - Notion via MCP
- `src/integrations/calendar-service.ts` - Calendar integration
- `src/integrations/todo-list-manager.ts` - Unified TODO management

### 4. Remote MCP Server

HTTP-based MCP server for remote access scenarios.

**Files:**
- `src/remote/remote-mcp-server.ts` - HTTP server implementation

## Data Flow

### Task Analysis Flow

1. User provides text input (email, meeting notes, etc.)
2. `TaskAnalyzer.analyzeFromText()` is called
3. Text is parsed to extract individual tasks
4. For each task:
   - `PriorityEngine.determinePriority()` calculates priority
   - `TimeEstimator.estimateDuration()` estimates time
   - `StakeholderExtractor.extractStakeholders()` finds stakeholders
5. Results are compiled and returned

### Reminder Creation Flow

1. Analyzed task is passed to reminder system
2. `ReminderManager.setReminder()` determines best reminder times
3. Based on deadline proximity:
   - < 7 days: Apple Reminders
   - >= 8 days: Notion (optional)
4. Platform-specific service creates the reminder

## Configuration

Configuration is stored in `~/.sage/config.json` and follows the schema defined in `src/types/config.ts`.

Key configuration sections:
- `user` - User profile and timezone
- `priorityRules` - Custom priority conditions
- `estimation` - Time estimation keywords
- `integrations` - Service-specific settings

## Security Considerations

### Notion Integration
- Database IDs are strictly validated
- Only configured databases can be accessed
- API keys are never stored in config files

### Remote MCP Server
- JWT token authentication
- API key authentication
- IP whitelist support
- CORS configuration

### AppleScript
- Sandboxed execution
- Permission prompts for Reminders/Calendar access

## Extending Sage

### Adding a New Integration

1. Create service file in `src/integrations/`
2. Implement the integration interface
3. Add configuration schema to `src/types/config.ts`
4. Update `TodoListManager` to use new source
5. Add tests in `tests/unit/`

### Adding a New Platform Adapter

1. Create adapter in `src/platform/adapters/`
2. Implement `PlatformAdapter` interface
3. Register in `AdapterFactory`
4. Add platform-specific tests

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern="priority"

# Run with coverage
npm test -- --coverage
```

## Deployment

### Docker

```bash
# Build image
docker build -t sage-mcp-server .

# Run container
docker run -p 3000:3000 sage-mcp-server
```

### MCP Installation

```bash
# Install globally
npm install -g @shin1ohno/sage

# Or use npx
npx @shin1ohno/sage
```
