# Sage Architecture Documentation

## Overview

sage (賢者) は、macOS 専用の AI タスク管理アシスタントです。AppleScript を使用して Apple Reminders、Calendar と統合し、Notion とは MCP 経由で連携します。

| 環境 | 実行方式 | 説明 |
|------|----------|------|
| **Desktop MCP** | Claude Desktop/Code | macOS 上で直接実行 |
| **Remote MCP** | iOS/iPadOS/Web からアクセス | macOS 上の Remote MCP Server 経由 |

**重要**: Remote MCP Server も macOS 上で実行する必要があります（AppleScript のため）。

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Claude Clients                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │Claude Desktop│  │ Claude Code  │  │  Claude iOS  │  │  Claude Web  ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘│
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────┘
          │ stdio           │ stdio           │ HTTPS           │ HTTPS
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Transport Layer                                  │
│  ┌────────────────────────────┐  ┌────────────────────────────────────┐│
│  │    Local MCP Transport     │  │      Remote MCP Transport          ││
│  │    (stdio)                 │  │      (HTTP/HTTPS + JSON-RPC)       ││
│  └────────────┬───────────────┘  └──────────────────┬─────────────────┘│
└───────────────┼──────────────────────────────────────┼──────────────────┘
                │                                      │
                ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Platform Adapter Layer                            │
│  ┌────────────────────────────┐  ┌────────────────────────────────────┐│
│  │       MCPAdapter           │  │      RemoteMCPAdapter              ││
│  │   - File system access     │  │   - Cloud storage                  ││
│  │   - AppleScript execution  │  │   - Remote service calls           ││
│  │   - Local config storage   │  │   - Session management             ││
│  └────────────┬───────────────┘  └──────────────────┬─────────────────┘│
└───────────────┼──────────────────────────────────────┼──────────────────┘
                │                                      │
                └──────────────────┬───────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Sage Core                                      │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      Task Analyzer                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │ │
│  │  │  Priority   │  │    Time     │  │ Stakeholder │               │ │
│  │  │   Engine    │  │  Estimator  │  │  Extractor  │               │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                   TODO List Manager                                │ │
│  │  - Multi-source aggregation                                       │ │
│  │  - Task synchronization                                           │ │
│  │  - Conflict resolution                                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Task Splitter                                   │ │
│  │  - Complex task detection                                         │ │
│  │  - Subtask generation                                             │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Integration Layer                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Apple Reminders │  │   Notion MCP     │  │  Calendar Service    │  │
│  │  Service         │  │   Service        │  │                      │  │
│  │                  │  │                  │  │                      │  │
│  │  - AppleScript   │  │  - MCP Client    │  │  - EventKit          │  │
│  │  - Remote proxy  │  │  - DB operations │  │  - iCal parsing      │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Transport Layer

#### Local MCP Transport (stdio)

Claude Desktop/Code との通信に使用される標準的な MCP トランスポート。

```typescript
// src/index.ts
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Remote MCP Transport (HTTP)

iOS/iPadOS/Web クライアントとの通信に使用される HTTP ベースのトランスポート。

**サポートされるトランスポート:**
- ✅ **HTTP Transport**: POST /mcp で同期的にリクエスト/レスポンスを処理
- ❌ **Streamable HTTP Transport (SSE)**: v0.7.7 で削除されました

```typescript
// src/cli/http-server-with-config.ts
class HTTPServerWithConfigImpl {
  // JSON-RPC over HTTP (synchronous)
  private processMCPRequest(req: IncomingMessage, res: ServerResponse): void;

  // Authentication (OAuth2 / JWT)
  private async verifyAuthentication(req: IncomingMessage): Promise<AuthResult>;
}
```

### 2. Platform Adapter Layer

プラットフォーム固有の機能を抽象化し、統一されたインターフェースを提供します。

```
src/platform/
├── types.ts              # PlatformAdapter interface
├── detector.ts           # Platform detection logic
├── adapter-factory.ts    # Adapter factory
└── adapters/
    ├── mcp-adapter.ts        # Desktop/Code adapter
    └── remote-mcp-adapter.ts # Remote client adapter
```

#### PlatformType

```typescript
type PlatformType = 'desktop_mcp' | 'remote_mcp';
```

#### Capabilities

| Capability | desktop_mcp | remote_mcp |
|------------|-------------|------------|
| file_system | Yes | No |
| external_process | Yes | No |
| mcp_integration | Yes | No |
| remote_access | No | Yes |
| cloud_storage | No | Yes |

### 3. Sage Core

プラットフォーム非依存のビジネスロジック。

```
src/core/
└── sage-core.ts          # Main entry point

src/tools/
└── analyze-tasks.ts      # Task analysis tool

src/utils/
├── priority.ts           # Priority calculation
├── estimation.ts         # Time estimation
├── stakeholders.ts       # Stakeholder extraction
└── task-splitter.ts      # Task splitting
```

#### Task Analysis Flow

```
Input Text
    │
    ▼
┌─────────────────┐
│  Text Parser    │  Extract individual tasks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Priority Engine │  P0-P3 based on rules
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Time Estimator  │  Minutes estimation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Stakeholder     │  Extract mentions
│ Extractor       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Task Splitter   │  Break complex tasks
└────────┬────────┘
         │
         ▼
    Analysis Result
```

### 4. Integration Layer

外部サービスとの連携を担当します。

```
src/integrations/
├── apple-reminders.ts    # Apple Reminders via AppleScript
├── notion-mcp.ts         # Notion via MCP protocol
├── calendar-service.ts   # Calendar integration
├── todo-list-manager.ts  # Unified TODO management
└── task-synchronizer.ts  # Multi-source sync
```

#### Notion MCP Integration

sage は Notion MCP Server のクライアントとして動作します。

```
┌─────────────┐     MCP Client      ┌─────────────────┐
│    sage     │ ──────────────────→ │  Notion MCP     │
│             │                     │  Server         │
└─────────────┘                     └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │   Notion API    │
                                    └─────────────────┘
```

### 5. Remote Infrastructure

```
src/remote/
├── remote-mcp-server.ts  # HTTP server
├── cloud-config.ts       # Cloud configuration sync
└── hybrid-integration.ts # Multi-platform coordination
```

#### Hybrid Integration

複数プラットフォーム間での設定・データ同期を管理します。

```typescript
class HybridIntegrationManager {
  // Platform-specific capabilities
  detectCapabilities(platform: Platform): Capabilities;

  // Coordination planning
  planCoordination(platforms: Platform[]): CoordinationPlan;

  // Conflict resolution
  resolveConflict(local: Task, remote: Task): Task;
}
```

## Data Models

### Task

```typescript
interface Task {
  title: string;
  description?: string;
  deadline?: string;
  priority?: Priority;
  estimatedMinutes?: number;
  stakeholders?: string[];
  source?: 'reminders' | 'notion' | 'manual';
  status?: 'pending' | 'in_progress' | 'completed';
}

type Priority = 'P0' | 'P1' | 'P2' | 'P3';
```

### UserConfig

```typescript
interface UserConfig {
  user: UserProfile;
  calendar: CalendarConfig;
  priorityRules: PriorityRules;
  estimation: EstimationConfig;
  integrations: IntegrationsConfig;
  // ... see src/types/config.ts
}
```

## Security

### Authentication

Remote MCP Server は複数の認証方式をサポート:

| 方式 | 用途 |
|------|------|
| JWT | 推奨。有効期限付きトークン |
| API Key | シンプルな認証 |
| IP Whitelist | ネットワーク制限 |

### Notion Database Restrictions

セキュリティのため、Notion 統合では以下の制限を実施:

1. **設定された database ID のみアクセス可能**
2. **database ID 形式の検証**
3. **不正アクセス時のエラーハンドリング**

### AppleScript Sandboxing

AppleScript 実行は macOS のセキュリティ機構により保護:

- ユーザー承認が必要
- Reminders/Calendar へのアクセス権限を明示的に要求

## File Structure

```
sage/
├── src/
│   ├── index.ts                    # MCP Server entry point
│   ├── core/
│   │   └── sage-core.ts            # Core business logic
│   ├── config/
│   │   ├── loader.ts               # Config loading
│   │   ├── validator.ts            # Config validation
│   │   └── storage/                # Platform-specific storage
│   ├── platform/
│   │   ├── types.ts                # Platform interfaces
│   │   ├── detector.ts             # Platform detection
│   │   └── adapters/               # Platform adapters
│   ├── tools/
│   │   └── analyze-tasks.ts        # Task analysis
│   ├── integrations/
│   │   ├── apple-reminders.ts      # Apple Reminders
│   │   ├── notion-mcp.ts           # Notion MCP
│   │   ├── calendar-service.ts     # Calendar
│   │   └── todo-list-manager.ts    # TODO management
│   ├── remote/
│   │   ├── remote-mcp-server.ts    # HTTP server
│   │   ├── cloud-config.ts         # Cloud sync
│   │   └── hybrid-integration.ts   # Multi-platform
│   ├── utils/
│   │   ├── priority.ts             # Priority logic
│   │   ├── estimation.ts           # Time estimation
│   │   ├── stakeholders.ts         # Stakeholder extraction
│   │   └── task-splitter.ts        # Task splitting
│   └── types/
│       ├── task.ts                 # Task types
│       └── config.ts               # Config types
├── tests/
│   ├── unit/                       # Unit tests
│   ├── integration/                # Integration tests
│   └── e2e/                        # End-to-end tests
├── docs/                           # Documentation
└── manifest.json                   # MCP manifest
```

## Extending Sage

### Adding a New Integration

1. `src/integrations/` にサービスファイルを作成
2. 統合インターフェースを実装
3. `src/types/config.ts` に設定スキーマを追加
4. `TodoListManager` を更新
5. テストを追加

### Adding a New Platform

1. `src/platform/adapters/` にアダプターを作成
2. `PlatformAdapter` インターフェースを実装
3. `src/platform/types.ts` の `PlatformType` を更新
4. `src/platform/detector.ts` に検出ロジックを追加
5. テストを追加

## Testing

```bash
# All tests
npm test

# Unit tests only
npm test -- --testPathPattern="unit"

# Integration tests
npm test -- --testPathPattern="integration"

# E2E tests
npm test -- --testPathPattern="e2e"

# Coverage report
npm test -- --coverage
```

## Performance Considerations

### Local MCP

- stdio 通信は低レイテンシ
- AppleScript 実行は数百ミリ秒かかる場合がある

### Remote MCP

- HTTP オーバーヘッドを考慮
- 接続プーリングで効率化
- リトライ機構でネットワーク障害に対応

## Related Documentation

- [Local MCP Setup](SETUP-LOCAL.md)
- [Remote MCP Setup](SETUP-REMOTE.md)
- [Configuration Guide](CONFIGURATION.md)
- [Troubleshooting](TROUBLESHOOTING.md)
