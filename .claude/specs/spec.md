# Sage - AI Task Manager Specification

**Project**: sage (賢者)
**Version**: 0.7.8
**Status**: ✅ **Production Ready**
**Last Updated**: 2026-01-03

---

## Overview

sageは、Claude DesktopとClaude Code向けのMCPサーバーとして実装されるAIアシスタントです。タスク管理、優先順位付け、リマインド設定、カレンダー統合を自動化し、個人の作業パターンを学習してパーソナライズされたタスク整理とスケジューリング推奨を提供します。

### Target Users
- Mercariエンジニア（個人貢献者およびエンジニアリングマネージャー）
- 将来的には全社展開を計画

### Platform Support

| Platform | Status | Access Method |
|----------|--------|---------------|
| Desktop MCP (macOS) | ✅ Production | Direct MCP (Stdio) |
| iOS/iPadOS | ✅ Production | Remote MCP Server |
| Web | ✅ Production | Remote MCP Server |

---

## Specification Documents

### 📋 Requirements
- **[requirements.md](./requirements.md)** - 32個の要件定義（EARS記法）
  - 要件1-20: コア機能
  - 要件21-31: OAuth 2.1認証（[oauth-spec.md](./oauth-spec.md)参照）
  - 要件32: 勤務リズム管理

### 🏗️ Design
- **[architecture.md](./architecture.md)** - システムアーキテクチャ
- **[components.md](./components.md)** - コンポーネント設計
- **[data-models.md](./data-models.md)** - データモデル定義
- **[integrations.md](./integrations.md)** - 外部統合仕様
- **[security.md](./security.md)** - セキュリティ設計

### 📝 Tasks
- **[tasks.md](./tasks.md)** - 47個の実装タスク（すべて完了）

### 🧪 Testing
- **[testing.md](./testing.md)** - テスト戦略とカバレッジ

### 🔐 Additional Specifications
- **[oauth-spec.md](./oauth-spec.md)** - OAuth 2.1詳細仕様
- **[mcp-over-sse-spec.md](./mcp-over-sse-spec.md)** - SSE Transport仕様

---

## Current Status

### Implementation Progress

| Phase | Status | Progress |
|-------|--------|----------|
| Requirements | ✅ Complete | 32/32 requirements defined |
| Design | ✅ Complete | All design documents finalized |
| Tasks | ✅ Complete | 47/47 tasks implemented |
| Testing | ✅ Complete | 48 suites, 914 tests (100% pass) |
| Documentation | ✅ Complete | All docs up-to-date |

### Test Coverage

```
Test Suites: 48 passed, 48 total ✅
Tests: 913 passed, 1 skipped, 914 total
Coverage: 97.8%
Platform: Cross-platform (macOS: real EventKit, Linux: mocked)
```

### MCP Tools (18 implemented)

1. `check_setup_status` - Setup status check
2. `start_setup_wizard` - Initialize setup wizard
3. `answer_wizard_question` - Answer setup questions
4. `save_config` - Save configuration
5. `update_config` - Update configuration
6. `analyze_tasks` - Analyze and prioritize tasks
7. `set_reminder` - Set reminders (Apple Reminders/Notion)
8. `find_available_slots` - Find calendar availability
9. `list_todos` - List TODO items
10. `update_task_status` - Update task status
11. `sync_to_notion` - Sync to Notion database
12. `list_calendar_events` - List calendar events
13. `create_calendar_event` - Create calendar event
14. `delete_calendar_event` - Delete calendar event
15. `delete_calendar_events_batch` - Batch delete events
16. `respond_to_calendar_event` - Respond to event invitation
17. `respond_to_calendar_events_batch` - Batch respond to events
18. `get_working_cadence` - Get working rhythm info

---

## Architecture Highlights

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                         MCP Layer                            │
│  (18 Tools: setup, analyze, calendar, reminders, etc.)      │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                     Platform Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Desktop    │  │    Remote    │  │  iOS/Web     │     │
│  │  MCP Stdio   │  │  MCP Server  │  │  via Remote  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                      Core Services                           │
│  • Task Analyzer    • Priority Engine   • Time Estimator    │
│  • Calendar Service • Reminder Manager  • TODO Manager      │
│  • Notion MCP       • OAuth Server      • Config Manager    │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                    Integrations                              │
│  • Apple Reminders (AppleScript)                             │
│  • Calendar.app (EventKit via AppleScriptObjC)              │
│  • Notion (MCP Protocol)                                     │
└──────────────────────────────────────────────────────────────┘
```

### Authentication Flow (Remote MCP)

```
┌─────────┐                ┌──────────────┐                ┌─────────┐
│ Claude  │   1. OAuth     │     sage     │   2. Session   │ Browser │
│ iOS/Web │───────────────>│ Remote MCP   │───────────────>│  Auth   │
└─────────┘                │   Server     │                └─────────┘
     │                     └──────────────┘                      │
     │                            │                              │
     │       3. Auth Code         │      4. Token Exchange       │
     │<───────────────────────────┼──────────────────────────────┘
     │                            │
     │       5. Access Token      │
     │<───────────────────────────┤
     │                            │
     │    6. MCP Requests         │
     │───────────────────────────>│
     │    (Bearer Token)          │
     │                            │
     │    7. SSE Stream           │
     │<═══════════════════════════│
     │    (Cookie Auth)           │
```

---

## Key Features

### 1. Task Management
- ✅ Automatic task analysis and prioritization (P0-P3)
- ✅ Time estimation (25-minute intervals)
- ✅ Stakeholder identification
- ✅ Task splitting for complex items

### 2. Calendar Integration
- ✅ EventKit integration (macOS)
- ✅ Event listing, creation, deletion
- ✅ Event invitation responses
- ✅ Batch operations
- ✅ Recurring event support

### 3. Reminder Management
- ✅ Apple Reminders integration (7-day rule)
- ✅ Notion integration (8+ days or no deadline)
- ✅ Automatic routing based on deadline

### 4. Remote Access
- ✅ OAuth 2.1 authentication (PKCE S256)
- ✅ SSE (Server-Sent Events) transport
- ✅ Cookie-based session management
- ✅ Cross-platform compatibility

### 5. Working Cadence
- ✅ Deep Work Days tracking
- ✅ Meeting Heavy Days detection
- ✅ Work hours management
- ✅ Scheduling recommendations

---

## Technologies

### Core Stack
- **Language**: TypeScript 5.x
- **Runtime**: Node.js 18+
- **Protocol**: MCP (Model Context Protocol)
- **Build**: npm, Jest

### Integrations
- **Apple Reminders**: AppleScript
- **Calendar**: EventKit (AppleScriptObjC)
- **Notion**: MCP Protocol
- **OAuth**: jsonwebtoken, pkce-challenge

### Testing
- **Framework**: Jest
- **Coverage**: 97.8%
- **Strategy**: Unit + Integration + E2E

---

## Development Guidelines

### Code Style
- TypeScript strict mode
- Zod for input validation
- EARS notation for requirements
- TDD approach for features

### Testing Strategy
1. Unit tests for core logic
2. Integration tests for services
3. E2E tests for workflows
4. Platform-specific mocking for CI/CD

### Documentation Standards
- EARS format for requirements
- Mermaid diagrams for architecture
- Code examples in documentation
- Inline comments for complex logic

---

## Deployment

### Local MCP (Desktop/Code)
```json
{
  "mcpServers": {
    "sage": {
      "command": "node",
      "args": ["/path/to/sage/dist/index.js"]
    }
  }
}
```

### Remote MCP (iOS/Web)
```bash
# Start server
node dist/index.js --remote --port 3000

# With OAuth
export SAGE_AUTH_SECRET="your-secret-key"
node dist/index.js --remote --config ~/.sage/remote-config.json
```

---

## Future Enhancements

### Planned Features
- [ ] Machine learning for task priority prediction
- [ ] Multi-user support for teams
- [ ] Slack/Teams integration
- [ ] Voice interface support

### Technical Debt
- [ ] Worker process graceful shutdown warning
- [ ] Duplicate task auto-removal (task-synchronizer)
- [ ] Direct MCP Server calls (notion-mcp)

---

## Resources

### Documentation
- [SETUP-LOCAL.md](../../docs/SETUP-LOCAL.md) - Local setup guide
- [SETUP-REMOTE.md](../../docs/SETUP-REMOTE.md) - Remote server setup
- [CONFIGURATION.md](../../docs/CONFIGURATION.md) - Configuration reference
- [TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md) - Common issues

### External References
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [EARS Requirements](https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax)

---

**Maintained by**: @shin1ohno
**License**: [TBD]
**Repository**: [TBD]
