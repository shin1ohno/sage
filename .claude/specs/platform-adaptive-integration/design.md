# Design Document

> **Last Updated:** 2026-01-09

## Overview

Capability 適応型統合機能は、sage MCP サーバーが **EventKit 利用可否 + Sampling capability** をベースに最適な統合戦略を選択する機能です。

### 統合戦略（Simplified 2026-01-09）

```
EventKit Available?
  YES → Use EventKit for Calendar/Reminders
  NO  → Check Sampling support
        YES → Use Sampling (Native APIs via Claude)
        NO  → Use Google Calendar fallback
```

この機能により：
- **EventKit 有効環境**: EventKit（MCP）+ Google Calendar（MCP）の統合アクセス
- **Sampling 有効環境**: Google Calendar（MCP）+ Apple Calendar（Sampling）の両方にアクセス可能
- **Fallback 環境**: Google Calendar（MCP）のみの安全なアクセス
- ユーザーにとっては透過的でシームレスな体験を実現

**注意:** 現在 iOS Claude App は `capabilities.sampling` を送信していないため、Sampling 統合は動作しません。Anthropic 社への実装依頼が必要です。

## Steering Document Alignment

### Technical Standards (tech.md)

本設計は tech.md の以下の標準に準拠します：

1. **TypeScript Strict Mode**: すべての新規コンポーネントで strict mode を使用
2. **Zod Validation**: Platform detection と Sampling request の入力検証に Zod を使用
3. **Error Handling**: 明確なエラーメッセージと適切なエラー伝播（既存の `createErrorFromCatch` パターンを活用）
4. **Testing**: Jest with 98%+ coverage target（Sampling のモックを含む）
5. **Retry Pattern**: 既存の `retryWithBackoff` を Sampling リクエストに適用

### Project Structure (structure.md)

ファイル配置は structure.md のディレクトリ構造に従います：

- **Capability Detection**: `src/platform/detector.ts`（簡略化）
- **Sampling Service**: `src/services/sampling-service.ts`
- **Integration Strategy**: `src/services/integration-strategy-manager.ts`
- **Type Definitions**: `src/types/platform.ts`（簡略化）
- **Tool Handlers**: `src/tools/platform/handlers.ts`
- **Tests**: `tests/unit/platform/`, `tests/integration/platform/`

## Code Reuse Analysis

### Existing Components to Leverage

#### 1. CalendarSourceManager (src/integrations/calendar-source-manager.ts)
- **活用方法**: 既存のマルチソース管理ロジックをそのまま活用
- **拡張内容**: プラットフォーム情報を Context として渡し、Sampling ベースの統合を追加
- **再利用メソッド**: `detectAvailableSources()`, `getEvents()`, deduplication ロジック

#### 2. GoogleCalendarService (src/integrations/google-calendar-service.ts)
- **活用方法**: Google Calendar API 呼び出しをそのまま使用
- **変更内容**: なし（完全に再利用）
- **統合方法**: Sampling で Claude に `list_calendar_events(sources=['google'])` を実行させる

#### 3. CalendarService (src/integrations/calendar-service.ts)
- **活用方法**: macOS EventKit アクセスをそのまま使用
- **変更内容**: なし（完全に再利用）
- **統合方法**: Sampling で Claude に `list_calendar_events(sources=['eventkit'])` を実行させる

#### 4. ReminderManager (src/integrations/reminder-manager.ts)
- **活用方法**: 既存の Apple Reminders AppleScript ロジックを活用
- **変更内容**: なし（macOS での利用）
- **統合方法**: iOS では Sampling で Claude に native API を使わせる

#### 5. McpServer (from @modelcontextprotocol/sdk)
- **活用方法**: MCP Server の initialize ハンドラで clientInfo を取得
- **追加実装**: `onInitialize` コールバックを追加して clientInfo を保存
- **Sampling 呼び出し**: SDK の Sampling 機能を使用（`server.request('sampling/createMessage', params)`）

#### 6. Retry Utility (src/utils/retry.ts)
- **活用方法**: 既存の `retryWithBackoff()` を Sampling リクエストに適用
- **変更内容**: なし（完全に再利用）

### Integration Points

#### A. MCP SDK Integration
- **統合方法**: McpServer の `onInitialize` コールバックで clientInfo を取得
- **Sampling API**: `server.request('sampling/createMessage', { messages, maxTokens })` を使用
- **エラーハンドリング**: MCP エラーコード（-1 = user rejection, -32xxx = internal error）を処理

#### B. Existing Tool Handlers
- **統合方法**: `handleListCalendarEvents` と `handleSetReminder` に Platform Context を注入
- **変更内容**:
  - Platform Context から platform 情報を取得
  - プラットフォームに応じて Sampling 経由または MCP 直接実行を選択
- **後方互換性**: Sampling 非対応クライアントは既存の MCP-only モードで動作

#### C. Context Factory Pattern
- **統合方法**: 既存の Context factory functions（`createCalendarToolsContext` など）に Platform Context を追加
- **実装**: Global state に `platformInfo` を追加、初期化時に設定

## Architecture

### System Architecture

```mermaid
graph TD
    Client[Claude Client iOS/Mac/Web] -->|1. Initialize with clientInfo| MCPServer[MCP Server]
    MCPServer -->|2. Detect platform| PlatformDetector[Platform Detector]
    PlatformDetector -->|3. Store platform info| PlatformContext[Platform Context]

    Client -->|4. Call list_calendar_events| ToolHandler[Tool Handler]
    ToolHandler -->|5. Get platform info| PlatformContext
    ToolHandler -->|6. Select strategy| StrategyManager[Integration Strategy Manager]

    StrategyManager -->|7a. iOS: Use Sampling| SamplingService[Sampling Service]
    StrategyManager -->|7b. Mac: Use MCP directly| CalendarSourceManager[Calendar Source Manager]

    SamplingService -->|8. Send sampling request| Client
    Client -->|9. Execute native + MCP| NativeAPI[Native iOS API]
    Client -->|10. Call MCP tools| ToolHandler
    ToolHandler -->|11. Call services| GoogleCalendarService[Google Calendar Service]

    Client -->|12. Return merged results| SamplingService
    SamplingService -->|13. Parse and validate| ToolHandler
    ToolHandler -->|14. Return to user| Client

    CalendarSourceManager -->|Uses| GoogleCalendarService
    CalendarSourceManager -->|Uses| EventKitService[EventKit Service]
```

### Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant ClaudeClient
    participant MCPServer
    participant PlatformDetector
    participant ToolHandler
    participant SamplingService
    participant CalendarService

    User->>ClaudeClient: Connect to sage MCP
    ClaudeClient->>MCPServer: initialize(clientInfo)
    MCPServer->>PlatformDetector: detectPlatform(clientInfo)
    PlatformDetector-->>MCPServer: PlatformInfo

    User->>ClaudeClient: "Show my calendar events"
    ClaudeClient->>MCPServer: list_calendar_events()
    MCPServer->>ToolHandler: handle(request, platformInfo)

    alt Platform is iOS/iPad
        ToolHandler->>SamplingService: createSamplingRequest(platform, params)
        SamplingService->>ClaudeClient: sampling/createMessage(instruction)
        ClaudeClient-->>User: Approve sampling request?
        User-->>ClaudeClient: Approve
        ClaudeClient->>ClaudeClient: Fetch native iOS calendar
        ClaudeClient->>MCPServer: list_calendar_events(sources=['google'])
        MCPServer->>CalendarService: getEvents(google)
        CalendarService-->>MCPServer: Google events
        MCPServer-->>ClaudeClient: Google events
        ClaudeClient->>ClaudeClient: Merge native + Google events
        ClaudeClient-->>SamplingService: Merged results
        SamplingService->>ToolHandler: parseSamplingResponse(results)
    else Platform is macOS
        ToolHandler->>CalendarService: getEvents(['eventkit', 'google'])
        CalendarService-->>ToolHandler: Merged events
    end

    ToolHandler-->>MCPServer: Deduplicated events
    MCPServer-->>ClaudeClient: Final results
    ClaudeClient-->>User: Display events
```

## Components and Interfaces

### Component 1: Capability Detector

**Purpose**: MCP initialize メッセージから Sampling capability を抽出

**Location**: `src/platform/detector.ts`

**Interface**:
```typescript
interface ClientCapabilities {
  sampling?: {};
  roots?: {};
  // ... other capabilities
}

export interface ClientCapabilityInfo {
  supportsSampling: boolean;
  availableIntegrations: {
    calendar: {
      google: boolean;
      eventkit: boolean;
      sampling: boolean;
    };
    reminders: {
      applescript: boolean;
      sampling: boolean;
    };
  };
}

export class CapabilityDetector {
  /**
   * Detect Sampling capability from MCP capabilities
   * Requirement: 1.1-1.4
   */
  static detectCapabilities(
    capabilities: ClientCapabilities
  ): { supportsSampling: boolean };

  /**
   * Get available integrations based on Sampling support + EventKit availability
   * Requirement: 7.2-7.4
   */
  static getAvailableIntegrations(
    supportsSampling: boolean,
    config: UserConfig
  ): ClientCapabilityInfo['availableIntegrations'];
}
```

**Dependencies**: `UserConfig` from `src/types/config.ts`

**Simplification**: Removed platform inference logic, only check `capabilities.sampling`

### Component 2: Sampling Service

**Purpose**: MCP Sampling リクエストの構築、送信、レスポンスパース

**Location**: `src/services/sampling-service.ts`

**Interface**:
```typescript
export interface SamplingMessage {
  role: 'user';
  content: {
    type: 'text';
    text: string;
  };
}

export interface SamplingRequest {
  messages: SamplingMessage[];
  systemPrompt?: string;
  maxTokens: number;
}

export interface SamplingResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  stopReason?: string;
}

export class SamplingService {
  constructor(private server: McpServer);

  /**
   * Send sampling request to Claude client
   * Requirement: 2.1-2.4
   * @throws McpError if client doesn't support sampling
   * @throws McpError if user rejects request
   *
   * NOTE: This method only SENDS the instruction to Claude.
   * Claude executes the entire workflow (MCP tools + native APIs + merging)
   * and returns the FINAL result. MCP server does NOT parse or merge.
   */
  async sendSamplingRequest(
    request: SamplingRequest
  ): Promise<SamplingResponse>;
}
```

**Dependencies**:
- `McpServer` from `@modelcontextprotocol/sdk`
- `CalendarEvent` from `src/types/google-calendar-types.ts`
- `retryWithBackoff` from `src/utils/retry.ts`

**Reuses**: Retry pattern from existing utils

### Component 3: Integration Strategy Manager

**Purpose**: プラットフォームごとの統合戦略を決定し、適切な Sampling メッセージを構築

**Location**: `src/services/integration-strategy-manager.ts`

**Interface**:
```typescript
export interface IntegrationStrategy {
  useSampling: boolean;
  samplingMessage?: string;
  mcpToolsToCall?: string[];
  nativeIntegrations?: string[];
}

export class IntegrationStrategyManager {
  /**
   * Build sampling message for calendar events
   * Requirement: 5.1-5.4
   *
   * Example output:
   * "Please execute the following steps:
   *  1. Call the list_calendar_events MCP tool with parameters:
   *     { startDate: '2026-01-01', endDate: '2026-01-31', sources: ['google'] }
   *  2. If native Calendar API is available, fetch events for the same date range
   *  3. Merge both sets of events, removing duplicates by iCalUID
   *  4. Return the merged events as a JSON array with this structure:
   *     [{ id, title, start, end, isAllDay, source: 'google'|'native-ios', iCalUID }]"
   */
  buildCalendarSamplingMessage(
    params: { startDate: string; endDate: string }
  ): string;

  /**
   * Build sampling message for reminder creation
   * Requirement: 5.1-5.4
   *
   * Example output:
   * "Please execute the following:
   *  1. If native Reminders API is available, create a reminder with:
   *     - Title: '{params.title}'
   *     - Due Date: '{params.dueDate}' (if provided)
   *     - Notes: '{params.notes}' (if provided)
   *  2. Return the result as JSON: { success: boolean, reminderId?: string, error?: string }"
   */
  buildReminderSamplingMessage(
    params: { title: string; dueDate?: string; notes?: string }
  ): string;
}
```

**Dependencies**: `CalendarEvent` from `src/types/google-calendar-types.ts`

**Reuses**: None（新規ロジック）

### Component 4: Capability Context

**Purpose**: グローバルな Capability 情報を保持し、ツールハンドラに注入

**Location**: `src/index.ts`（既存ファイルに追加）

**Implementation**:
```typescript
// src/index.ts に追加

import { CapabilityDetector } from './platform/detector.js';

// Global state に追加
let supportsSampling: boolean = false;

// MCP Server 初期化時に capabilities を取得
const server = new McpServer({
  name: SERVER_NAME,
  version: VERSION
}, {
  capabilities: {}
});

// Initialize ハンドラを追加して Capability 検出
server.setRequestHandler('initialize', async (request) => {
  const capabilities = request.params.capabilities;

  // Capability detection
  const detected = CapabilityDetector.detectCapabilities(capabilities);
  supportsSampling = detected.supportsSampling;

  mcpLogger.info({
    supportsSampling
  }, 'Capabilities detected on initialize');

  return {
    protocolVersion: '2025-06-18',
    capabilities: {},
    serverInfo: {
      name: SERVER_NAME,
      version: VERSION
    }
  };
});

// Context factory に追加
interface CapabilityContext {
  getSupportsSampling: () => boolean;
}

// 既存の Context に CapabilityContext を追加
function createCalendarToolsContext(): CalendarToolsContext & CapabilityContext {
  return {
    // ... existing methods
    getSupportsSampling: () => supportsSampling,
  };
}
```

**Dependencies**: `CapabilityDetector` from `src/platform/detector.ts`

**Reuses**: 既存の Context factory pattern

### Component 5: Capability-Aware Tool Handlers

**Purpose**: 既存のツールハンドラを拡張し、Capability Context に応じた動作を実装

**Location**:
- `src/tools/calendar/handlers.ts`（既存ファイルを拡張）
- `src/tools/reminders/handlers.ts`（既存ファイルを拡張）
- `src/tools/platform/handlers.ts`（新規：get_platform_info ツール）

**Modified Interface** (`handleListCalendarEvents`):
```typescript
export async function handleListCalendarEvents(
  args: z.infer<typeof listCalendarEventsSchema>,
  context: CalendarToolsContext & CapabilityContext
): Promise<ToolResponse> {
  const supportsSampling = context.getSupportsSampling();
  const isEventKitAvailable = context.isEventKitAvailable();

  // If Sampling is supported and EventKit is not available, use Sampling
  if (supportsSampling && !isEventKitAvailable) {
    return await handleListCalendarEventsWithSampling(args, context);
  }

  // Otherwise, use existing MCP-only logic (EventKit + Google Calendar)
  return await handleListCalendarEventsMcpOnly(args, context);
}

/**
 * Handle calendar events with Sampling
 *
 * This sends a Sampling request instructing Claude to:
 * 1. Call list_calendar_events MCP tool with sources=['google']
 * 2. Access native Calendar API if available
 * 3. Merge results by iCalUID
 * 4. Return final merged events
 *
 * NOTE: MCP server does NOT parse or merge. Claude does everything.
 */
async function handleListCalendarEventsWithSampling(
  args: z.infer<typeof listCalendarEventsSchema>,
  context: CalendarToolsContext & CapabilityContext
): Promise<ToolResponse> {
  const samplingService = new SamplingService(/* MCP server instance */);
  const strategyManager = new IntegrationStrategyManager();

  // Build instruction message for Claude (no platform-specific assumptions)
  const instruction = strategyManager.buildCalendarSamplingMessage({
    startDate: args.startDate,
    endDate: args.endDate
  });

  try {
    // Send Sampling request (Claude executes everything and returns final result)
    const response = await samplingService.sendSamplingRequest({
      messages: [{
        role: 'user',
        content: { type: 'text', text: instruction }
      }],
      maxTokens: 4000
    });

    // Simply return Claude's response (already merged and formatted)
    return {
      content: response.content,
      isError: false
    };
  } catch (error) {
    if (error.code === -1) {  // User rejection
      return {
        content: [{
          type: 'text',
          text: 'Sampling requires your approval. ' +
                'Operation cancelled. Falling back to Google Calendar only.'
        }],
        isError: false
      };
    }
    throw error;
  }
}
```

**New Tool** (`get_platform_info`):
```typescript
// src/tools/platform/handlers.ts
export async function handleGetPlatformInfo(
  args: {},
  context: CapabilityContext & { getConfig: () => UserConfig | null }
): Promise<ToolResponse> {
  const supportsSampling = context.getSupportsSampling();
  const config = context.getConfig();

  const capabilityInfo: ClientCapabilityInfo = {
    supportsSampling,
    availableIntegrations: CapabilityDetector.getAvailableIntegrations(
      supportsSampling,
      config!
    )
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(capabilityInfo, null, 2)
    }]
  };
}
```

**Dependencies**:
- `SamplingService` from `src/services/sampling-service.ts`
- `IntegrationStrategyManager` from `src/services/integration-strategy-manager.ts`
- Existing `CalendarSourceManager`, `ReminderManager`

**Reuses**: 既存のツールハンドラロジック、MCP-only モードとして完全に再利用

## Data Models

### ClientCapabilityInfo (Simplified)
```typescript
// src/types/platform.ts （簡略化）
export interface ClientCapabilityInfo {
  supportsSampling: boolean;
  availableIntegrations: {
    calendar: {
      google: boolean;
      eventkit: boolean;
      sampling: boolean;  // Native Calendar via Sampling
    };
    reminders: {
      applescript: boolean;
      sampling: boolean;  // Native Reminders via Sampling
    };
  };
}
```

**Simplification Rationale:**
- ❌ Removed: `platform`, `clientName`, `clientVersion`, `detectionConfidence`
- ✅ Kept: `supportsSampling` (only capability we actually use)
- ✅ Kept: `availableIntegrations` (determined by `supportsSampling` + `isEventKitAvailable()`)

### CalendarEvent (extended from existing)
```typescript
// src/types/google-calendar-types.ts に追加
interface CalendarEvent {
  // ... existing fields
  source: 'google' | 'eventkit' | 'native-ios';  // 新規フィールド
}
```

### SamplingRequest/Response (new)
```typescript
// src/types/platform.ts に追加
export interface SamplingRequest {
  method: 'sampling/createMessage';
  params: {
    messages: Array<{
      role: 'user';
      content: { type: 'text'; text: string };
    }>;
    systemPrompt?: string;
    maxTokens: number;
  };
}

export interface SamplingResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  stopReason?: 'endTurn' | 'maxTokens' | 'stopSequence';
}
```

## Error Handling

### Error Scenarios

#### 1. Client Does Not Support Sampling
**Scenario**: Client の capabilities に `sampling` が含まれていない

**Handling**:
```typescript
if (!platform.supportsSampling) {
  return {
    content: [{
      type: 'text',
      text: 'Platform-adaptive integration requires a Claude client with Sampling support. ' +
            'Falling back to MCP-only mode. ' +
            'To use native iOS integrations, please use Claude iOS/iPadOS app.'
    }],
    isError: false  // Warning, not error
  };
}
```

**User Impact**: ユーザーには警告が表示され、MCP-only モードで動作

#### 2. User Rejects Sampling Request
**Scenario**: Claude が Sampling リクエストを表示し、ユーザーが拒否

**Handling**:
```typescript
try {
  const response = await samplingService.sendSamplingRequest(request);
} catch (error) {
  if (error.code === -1) {  // User rejection
    return {
      content: [{
        type: 'text',
        text: 'Platform-adaptive integration requires your approval to access ' +
              'native calendar/reminders. Operation cancelled. ' +
              'You can retry or use MCP-only mode.'
      }],
      isError: false
    };
  }
  throw error;
}
```

**User Impact**: 明確なメッセージでキャンセル理由を説明

#### 3. All Calendar Sources Unavailable
**Scenario**: MCP Google Calendar も失敗、native iOS も失敗

**Handling**:
```typescript
if (googleCalendarFailed && nativeIosFailed) {
  return {
    content: [{
      type: 'text',
      text: 'All calendar sources unavailable. Please check:\n' +
            '1. Google OAuth token: Run authenticate_google\n' +
            '2. iOS Calendar permissions: Enable in Settings > Privacy\n' +
            '3. Network connectivity'
    }],
    isError: true
  };
}
```

**User Impact**: チェックリスト形式で明確なトラブルシューティング手順

#### 4. Platform Detection Fails
**Scenario**: clientInfo が予期しない形式

**Handling**:
```typescript
if (platform.platform === 'unknown') {
  mcpLogger.warn({
    clientInfo,
    detectedPlatform: platform
  }, 'Platform detection returned unknown');

  // Fallback to MCP-only mode
  return await handleMcpOnlyMode(args, context);
}
```

**User Impact**: ユーザーには影響なし（自動的に MCP-only モードで動作）

#### 5. Sampling Response Format Invalid
**Scenario**: Claude の返答が予期しない形式（空の content など）

**Handling**:
```typescript
// Validate response structure (NOT parse content)
if (!response.content || response.content.length === 0) {
  mcpLogger.error({
    rawResponse: response
  }, 'Empty sampling response');

  return {
    content: [{
      type: 'text',
      text: 'Received empty response from platform-adaptive integration. ' +
            'Please retry or check your calendar permissions.'
    }],
    isError: true
  };
}

// Simply return Claude's response (already merged and formatted by Claude)
return {
  content: response.content,
  isError: false
};
```

**User Impact**: 構造的な問題のみをチェック、内容は Claude が保証

#### 6. MCP SDK Errors
**Scenario**: MCP SDK が予期しないエラーを返す

**Handling**:
```typescript
try {
  await server.request('sampling/createMessage', params);
} catch (mcpError) {
  if (mcpError.code === -32601) {  // Method not found
    return {
      content: [{
        type: 'text',
        text: 'Your MCP client does not support Sampling. ' +
              'Please upgrade to the latest Claude app.'
      }],
      isError: true
    };
  }

  // Use existing error handling pattern
  throw createErrorFromCatch(mcpError);
}
```

**User Impact**: MCP 固有のエラーコードを人間が読める形に変換

## Testing Strategy

### Unit Testing

#### CapabilityDetector Tests (`tests/unit/platform/detector.test.ts`)
```typescript
describe('CapabilityDetector', () => {
  describe('detectCapabilities', () => {
    it('should detect Sampling capability when capabilities.sampling exists', () => {
      const result = CapabilityDetector.detectCapabilities({ sampling: {} });
      expect(result.supportsSampling).toBe(true);
    });

    it('should not detect Sampling capability when capabilities.sampling is missing', () => {
      const result = CapabilityDetector.detectCapabilities({});
      expect(result.supportsSampling).toBe(false);
    });
  });

  describe('getAvailableIntegrations', () => {
    it('should return eventkit integrations when EventKit is available', () => {
      const config = { calendar: { sources: { eventkit: { enabled: true } } } };
      const result = CapabilityDetector.getAvailableIntegrations(false, config);
      expect(result.calendar.eventkit).toBe(true);
      expect(result.calendar.sampling).toBe(false);
    });

    it('should return sampling integrations when Sampling is supported and EventKit is not available', () => {
      const config = { calendar: { sources: { eventkit: { enabled: false } } } };
      const result = CapabilityDetector.getAvailableIntegrations(true, config);
      expect(result.calendar.eventkit).toBe(false);
      expect(result.calendar.sampling).toBe(true);
    });
  });
});
```

#### SamplingService Tests (`tests/unit/services/sampling-service.test.ts`)
```typescript
describe('SamplingService', () => {
  let mockServer: jest.Mocked<McpServer>;
  let service: SamplingService;

  beforeEach(() => {
    mockServer = {
      request: jest.fn()
    } as any;
    service = new SamplingService(mockServer);
  });

  describe('sendSamplingRequest', () => {
    it('should send sampling request and return response', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Events: []' }]
      };
      mockServer.request.mockResolvedValue(mockResponse);

      const result = await service.sendSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
        maxTokens: 1000
      });

      expect(result).toEqual(mockResponse);
      expect(mockServer.request).toHaveBeenCalledWith(
        'sampling/createMessage',
        expect.objectContaining({ maxTokens: 1000 })
      );
    });

    it('should throw on user rejection', async () => {
      mockServer.request.mockRejectedValue({ code: -1, message: 'User rejected' });

      await expect(service.sendSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
        maxTokens: 1000
      })).rejects.toThrow();
    });
  });

  describe('validateSamplingResponse', () => {
    it('should validate response has content', () => {
      const response = {
        content: [{
          type: 'text',
          text: JSON.stringify([
            { id: '1', title: 'Event 1', start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z', isAllDay: false, source: 'native-ios' }
          ])
        }]
      };

      expect(() => service.validateSamplingResponse(response)).not.toThrow();
    });

    it('should throw if response is empty', () => {
      const response = { content: [] };
      expect(() => service.validateSamplingResponse(response)).toThrow('Empty sampling response');
    });
  });
});
```

### Integration Testing

#### Capability-Aware Calendar Events (`tests/integration/platform/calendar-events.test.ts`)
```typescript
describe('Capability-Aware Calendar Events', () => {
  it('should use Sampling when supportsSampling=true and EventKit unavailable', async () => {
    // Mock Sampling support, EventKit unavailable
    const context = {
      getConfig: () => ({
        calendar: { sources: { eventkit: { enabled: false } } }
      }),
      getSupportsSampling: () => true,
      isEventKitAvailable: () => false,
      getCalendarSourceManager: () => mockCalendarSourceManager
    };

    // Mock SamplingService
    const mockSamplingService = {
      sendSamplingRequest: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify([/* events */]) }]
      })
    };

    // Test tool handler
    const result = await handleListCalendarEvents(
      { startDate: '2026-01-01', endDate: '2026-01-31' },
      context
    );

    expect(mockSamplingService.sendSamplingRequest).toHaveBeenCalled();
    expect(result.isError).toBe(false);
  });

  it('should use MCP-only when EventKit is available', async () => {
    const context = {
      getConfig: () => ({
        calendar: { sources: { eventkit: { enabled: true } } }
      }),
      getSupportsSampling: () => false,
      isEventKitAvailable: () => true,
      getCalendarSourceManager: () => mockCalendarSourceManager
    };

    const result = await handleListCalendarEvents(
      { startDate: '2026-01-01', endDate: '2026-01-31' },
      context
    );

    // Should NOT use Sampling, directly call CalendarSourceManager
    expect(mockCalendarSourceManager.getEvents).toHaveBeenCalled();
  });
});
```

### End-to-End Testing

#### Full Workflow Test (`tests/e2e/platform-adaptive-integration.test.ts`)
```typescript
describe('Capability Adaptive Integration E2E', () => {
  it('should detect Sampling capability, use Sampling, and return merged events', async () => {
    // 1. Initialize MCP server
    const server = new McpServer({ name: 'sage', version: VERSION });

    // 2. Mock initialize with Sampling capability
    const initializeResult = await server.initialize({
      protocolVersion: '2025-06-18',
      capabilities: { sampling: {} }
    });

    // 3. Verify capability detection
    expect(supportsSampling).toBe(true);

    // 4. Mock EventKit as unavailable
    const config = { calendar: { sources: { eventkit: { enabled: false } } } };

    // 5. Call list_calendar_events tool
    const eventsResult = await server.callTool('list_calendar_events', {
      startDate: '2026-01-01',
      endDate: '2026-01-31'
    });

    // 6. Verify Sampling was used (mock internal state)
    expect(mockSamplingService.sendSamplingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.objectContaining({
              text: expect.stringContaining('native Calendar API is available')
            })
          })
        ])
      })
    );

    // 7. Verify merged results
    expect(eventsResult.content[0].text).toContain('source');
  });
});
```

### Mock Strategy

#### Sampling Response Mocks
```typescript
// tests/mocks/sampling-responses.ts
export const mockSamplingCalendarResponse = {
  content: [{
    type: 'text',
    text: JSON.stringify([
      {
        id: 'native-1',
        title: 'Team Standup',
        start: '2026-01-07T09:00:00Z',
        end: '2026-01-07T09:30:00Z',
        isAllDay: false,
        source: 'native-ios',
        iCalUID: 'native-1@icloud.com'
      }
    ])
  }]
};

export const mockSamplingReminderResponse = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      success: true,
      reminderId: 'reminder-123'
    })
  }]
};

export const mockUserRejectionError = {
  code: -1,
  message: 'User rejected sampling request'
};
```

#### Capability Detection Mocks
```typescript
// tests/mocks/client-capabilities.ts
export const samplingCapabilities = {
  sampling: {}
};

export const noSamplingCapabilities = {};

export function createMockCapabilityContext(supportsSampling: boolean, eventKitEnabled: boolean) {
  return {
    getSupportsSampling: () => supportsSampling,
    isEventKitAvailable: () => eventKitEnabled,
    getConfig: () => ({
      calendar: {
        sources: {
          eventkit: { enabled: eventKitEnabled }
        }
      }
    })
  };
}
```

## Performance Considerations

### Optimization Strategies

1. **Capability Detection Caching**: `supportsSampling` は initialize 時に一度だけ検出し、グローバル state にキャッシュ
2. **EventKit Availability Check**: Config lookup のみ (< 1ms)
3. **Lazy Sampling Service Initialization**: SamplingService は初回使用時に初期化
4. **Parallel MCP Calls**: Google Calendar を MCP 経由で取得する際、他の処理と並列実行可能

### Performance Targets (from requirements.md)

- Capability detection: < 5ms ✓ (simple boolean check)
- EventKit availability check: < 1ms ✓ (config lookup)
- Sampling request construction: < 50ms ✓ (文字列テンプレート生成)
- Sampling request send (MCP server side): < 100ms ✓ (network call)

**Note**: Sampling round-trip time は **user approval を含む**ため、MCP server ではコントロール不可能。
ユーザー承認には数秒〜数十秒かかる可能性がある。

Event merge and deduplication は **Claude 側で実行**されるため、MCP server の performance target には含まれない。

## Security Considerations

### Security Measures

1. **No Sensitive Data in Sampling Messages**: OAuth tokens や API keys を Sampling プロンプトに含めない
2. **Input Sanitization**: ユーザー入力（event titles, reminder notes）を Sampling メッセージに含める前にサニタイズ
3. **Response Validation**: Sampling レスポンスを Zod スキーマで検証してから使用
4. **MCP Error Code Handling**: MCP エラーコードから機密情報を除去してユーザーに返す

### Validation Example
```typescript
// src/services/sampling-service.ts
import { z } from 'zod';

const SamplingResponseSchema = z.object({
  content: z.array(z.object({
    type: z.literal('text'),
    text: z.string()
  })).min(1, 'Sampling response must have at least one content item'),
  stopReason: z.enum(['endTurn', 'maxTokens', 'stopSequence']).optional()
});

/**
 * Validate sampling response structure
 * NOTE: We do NOT parse or validate the CONTENT of the response.
 * Claude is responsible for formatting the response correctly.
 * We only check that the response has the expected MCP structure.
 */
validateSamplingResponse(response: SamplingResponse): void {
  try {
    SamplingResponseSchema.parse(response);
  } catch (error) {
    throw new Error(`Invalid sampling response structure: ${error.message}`);
  }
}

/**
 * Send sampling request
 * Validates response structure but does NOT parse content
 */
async sendSamplingRequest(request: SamplingRequest): Promise<SamplingResponse> {
  const response = await retryWithBackoff(async () => {
    return await this.server.request('sampling/createMessage', request.params);
  });

  // Validate structure only
  this.validateSamplingResponse(response);

  return response;
}
```

## Deployment Considerations

### Backward Compatibility

- 既存の MCP-only モードは完全に保持
- Sampling 非対応クライアントは自動的に MCP-only モードで動作
- 既存のツール API（input schema）は変更なし

### Configuration Changes

新しい設定項目は不要。既存の config.json をそのまま使用。

### Migration Path

1. **Phase 1**: PlatformDetector と基本インフラを実装（Sampling なし）
2. **Phase 2**: SamplingService と IntegrationStrategyManager を実装
3. **Phase 3**: ツールハンドラを段階的に拡張（まず list_calendar_events、次に set_reminder）
4. **Phase 4**: get_platform_info ツールを追加

各フェーズでテストカバレッジ 98% を維持。

---

## EventKit-Based Implementation (Added 2026-01-09)

### Problem Statement

iOS Claude App が `capabilities.sampling` を送信しないため、プラットフォーム推論だけでは判定できない問題が発生。

### Solution: EventKit Availability-Based Dispatch

プラットフォーム推論の複雑さを回避し、**EventKit 利用可否** で統合戦略を決定する。

#### Implementation Location

`src/cli/mcp-handler.ts` の `registerTools()` メソッド内で runtime dispatch を実装：

```typescript
// Check EventKit availability
private isEventKitAvailable(): boolean {
  return this.config?.calendar?.sources?.eventkit?.enabled ?? false;
}

// Runtime dispatch in tool registration
async (args) => {
  // Use Sampling when EventKit is unavailable but Sampling is supported
  const shouldUseSampling =
    this.detectedPlatform?.supportsSampling && !this.isEventKitAvailable();

  if (shouldUseSampling) {
    return handleSetReminderWithSampling(input, context, samplingContext, platform);
  } else {
    return handleSetReminder(context, input);
  }
}
```

#### Decision Logic

```
┌─────────────────────────────────────┐
│ config.calendar.sources.eventkit   │
│         .enabled?                   │
└─────────────────────────────────────┘
    ↓ true              ↓ false
┌─────────┐      ┌──────────────────┐
│ EventKit│      │ Check Sampling?  │
│ Handler │      └──────────────────┘
└─────────┘       ↓ true    ↓ false
            ┌──────────┐ ┌──────────┐
            │ Sampling │ │ Fallback │
            │ Handler  │ │ (Google) │
            └──────────┘ └──────────┘
```

### Affected Components

1. **mcp-handler.ts**
   - Added `isEventKitAvailable()` method
   - Modified `set_reminder` tool registration with runtime dispatch
   - Modified `list_calendar_events` tool registration with runtime dispatch

2. **Platform Detection**
   - HTTP + Sampling → iOS inference (optional, not critical)
   - Primary decision: EventKit availability

### Benefits

- ✅ Avoids platform inference complexity
- ✅ Config-based control (`eventkit.enabled`)
- ✅ Works correctly on all platforms (iOS/iPadOS/Desktop/Web)
- ✅ Future-proof: Auto-enables when iOS sends `sampling: true`

### Current Limitations

- iOS Claude App does not send `capabilities.sampling = true` (as of 2026-01-09)
- Requires Anthropic to implement MCP capability extension
- Proposed extension: `capabilities.experimental.nativeIntegrations`

### Recommendation for Anthropic

Submit issue/PR to MCP specification repository:
- Add `capabilities.experimental.nativeIntegrations` field
- iOS/iPad clients should send:
  ```json
  {
    "capabilities": {
      "sampling": {},
      "experimental": {
        "nativeIntegrations": {
          "calendar": true,
          "reminders": true
        }
      }
    }
  }
  ```
