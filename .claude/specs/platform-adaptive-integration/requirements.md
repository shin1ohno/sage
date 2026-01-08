# Requirements Document

## Introduction

現在の sage は、macOS 上で EventKit を使用してカレンダーとリマインダーにアクセスすることを前提としています。Remote MCP 経由で iOS/iPad から接続する場合、macOS の EventKit に依存するため、結局 Mac 上でサーバーを動かす必要があり、プラットフォーム非依存という Remote MCP の利点を十分に活かせていません。

一方で、iOS/iPad の Claude アプリは、OS のカレンダーやリマインダーにネイティブアクセスする機能を持っています。また、Google Calendar は既に MCP 経由で利用可能です。

この機能により、sage は以下を実現します：

- **プラットフォーム検出**: MCP クライアント情報からプラットフォーム（iOS/iPad/Mac/Web）を判別
- **MCP Sampling**: サーバーから Claude に対して「このプラットフォームではこの方法を使ってください」と指示
- **統合戦略**: 各プラットフォームで利用可能なカレンダー/リマインダーアクセス方法を組み合わせ
- **透過的 UX**: ユーザーにとってはシームレスな体験を提供

これにより、sage は真のマルチプラットフォーム AI タスク管理アシスタントとして機能します。

## Terminology

- **MCP Sampling**: MCP プロトコルの `sampling/createMessage` 機能。サーバーから Claude に対してプロンプトを送信し、Claude の実行結果（ネイティブ API 呼び出しの結果など）を受け取る仕組み。ユーザーの明示的な承認が必要。
- **Platform Detection**: MCP の `initialize` メッセージから `clientInfo.name` を読み取り、接続元のプラットフォーム（iOS/iPad/Mac/Web）を判別する処理。
- **Native Integration**: iOS/iPad の Claude アプリが持つ、OS のカレンダーやリマインダーに直接アクセスする機能。MCP サーバーは Sampling を通じて Claude にネイティブ機能の使用を指示する。
- **Integration Strategy**: プラットフォームごとに最適なカレンダー/リマインダーアクセス方法を組み合わせる戦略。例：iOS では「Google Calendar は MCP、Apple Calendar はネイティブ」。

## Data Models

### PlatformInfo
```typescript
interface PlatformInfo {
  platform: 'ios' | 'ipados' | 'macos' | 'desktop' | 'web' | 'unknown';
  clientName: string;        // clientInfo.name from MCP initialize
  clientVersion: string;     // clientInfo.version from MCP initialize
  supportsSampling: boolean; // Whether client supports sampling/createMessage
  availableIntegrations: {
    calendar: {
      google: boolean;    // Google Calendar via MCP
      eventkit: boolean;  // EventKit via MCP (macOS only)
      native: boolean;    // Native iOS Calendar (iOS/iPad only)
    };
    reminders: {
      applescript: boolean; // Apple Reminders via AppleScript MCP (macOS)
      native: boolean;      // Native iOS Reminders (iOS/iPad only)
    };
  };
}
```

### CalendarEvent (extended)
```typescript
interface CalendarEvent {
  id: string;
  title: string;
  start: string;  // ISO 8601
  end: string;    // ISO 8601
  isAllDay: boolean;
  source: 'google' | 'eventkit' | 'native-ios';  // Integration source
  iCalUID?: string;  // For deduplication
  // ... other fields
}
```

### SamplingRequest
```typescript
interface SamplingRequest {
  method: 'sampling/createMessage';
  params: {
    messages: Array<{
      role: 'user';
      content: {
        type: 'text';
        text: string;  // Platform-specific instruction
      };
    }>;
    systemPrompt?: string;
    maxTokens: number;
  };
}
```

## Alignment with Product Vision

product.md の目標「エンジニアの生産性を向上させる AI タスク管理アシスタント」に以下の点で貢献します：

1. **Remote Access の実用性向上**: iOS/iPad からの Remote MCP アクセスが実用的になります
2. **プラットフォーム拡張**: macOS 以外のプラットフォームでもフル機能を利用可能
3. **カレンダー統合の強化**: 複数ソース（Google + Apple）を透過的に統合
4. **開発者体験の向上**: Mac を常時起動しなくても iOS から全機能にアクセス可能

## Requirements

### Requirement 1: MCP クライアント情報の取得とプラットフォーム検出

**User Story:** As a sage MCP server, I want to detect the client platform from MCP initialize message, so that I can provide platform-specific integration strategies.

#### Acceptance Criteria

1. WHEN MCP server receives initialize request THEN system SHALL extract clientInfo.name and clientInfo.version
2. WHEN clientInfo.name contains "iOS" or "iPad" or "mobile" THEN system SHALL detect platform as "ios" or "ipados"
3. WHEN clientInfo.name contains "ai" or "Desktop" THEN system SHALL detect platform as "macos" or "desktop"
4. WHEN clientInfo.name contains "web" THEN system SHALL detect platform as "web"
5. IF platform detection fails THEN system SHALL default to "unknown" and log warning
6. WHEN platform is detected THEN system SHALL store platform info for tool request context
7. WHEN client capabilities include "sampling" THEN system SHALL mark client as Sampling-capable

### Requirement 2: Sampling を使った統合戦略の指示

**User Story:** As a sage MCP server, I want to instruct Claude to use platform-appropriate integration methods via Sampling, so that calendar and reminder operations work seamlessly across platforms.

#### Acceptance Criteria

1. WHEN list_calendar_events tool is called on iOS/iPad THEN system SHALL use Sampling to request Claude: "Fetch Google Calendar events via list_calendar_events MCP tool with source filter, and Apple Calendar events via native iOS Calendar API, then merge results by iCalUID"
2. WHEN list_calendar_events tool is called on macOS THEN system SHALL use Sampling to request Claude: "Fetch events from all enabled sources (list_calendar_events with sources=['eventkit', 'google']) via MCP tool, system will handle deduplication"
3. WHEN set_reminder tool is called on iOS/iPad THEN system SHALL use Sampling to request Claude: "Create reminder using native iOS Reminders API with title, due date, and notes"
4. WHEN set_reminder tool is called on macOS THEN system SHALL use existing set_reminder MCP tool with AppleScript backend
5. WHEN Sampling request fails with user rejection THEN system SHALL fallback to MCP-only approach with informative error message
6. WHEN Sampling request succeeds THEN system SHALL process Claude's response and return merged results to user
7. IF client does not support Sampling THEN system SHALL return error: "Platform-adaptive integration requires Claude client with Sampling support"

### Requirement 3: プラットフォーム別カレンダー統合戦略

**User Story:** As a sage user on iOS/iPad, I want to access both Google Calendar (via MCP) and Apple Calendar (via native integration) seamlessly, so that I can see all my events regardless of source.

#### Acceptance Criteria

1. WHEN platform is iOS/iPad AND user lists events THEN system SHALL provide strategy: "MCP for Google + Native for Apple"
2. WHEN platform is macOS AND user lists events THEN system SHALL provide strategy: "MCP for both EventKit and Google"
3. WHEN platform is web AND user lists events THEN system SHALL provide strategy: "MCP for Google Calendar only"
4. WHEN multiple sources are used THEN system SHALL deduplicate events using iCalUID matching
5. IF MCP Google Calendar fails THEN system SHALL still request native Apple Calendar access (iOS) or EventKit (macOS)
6. IF all sources fail THEN system SHALL return clear error with troubleshooting steps
7. WHEN events from multiple sources are merged THEN system SHALL preserve source attribution (source: "google" | "apple")

### Requirement 4: プラットフォーム別 Reminders 統合戦略

**User Story:** As a sage user on iOS/iPad, I want to create reminders using native iOS integration, so that reminders appear in my Apple Reminders app immediately.

#### Acceptance Criteria

1. WHEN platform is iOS/iPad AND user sets reminder THEN system SHALL instruct Claude to use native iOS Reminders API
2. WHEN platform is macOS AND user sets reminder THEN system SHALL use existing AppleScript-based MCP tool
3. WHEN platform is web THEN system SHALL return error: "Reminders not supported on web platform. Please use iOS/iPad or macOS."
4. WHEN reminder creation succeeds via native API THEN system SHALL return success with reminder ID
5. WHEN reminder creation fails THEN system SHALL provide fallback: "Create manually in Apple Reminders app: [reminder details]"
6. IF user approves Sampling request THEN system SHALL execute reminder creation
7. IF user rejects Sampling request THEN system SHALL abort with user-friendly message

### Requirement 5: Sampling リクエストのテンプレートとメッセージ構築

**User Story:** As a sage MCP server, I want to construct clear and actionable Sampling messages for Claude, so that Claude understands exactly what actions to take on which platform.

#### Acceptance Criteria

1. WHEN constructing Sampling message for iOS calendar THEN system SHALL include: platform info, available methods (MCP + native), expected merge behavior
2. WHEN constructing Sampling message for macOS calendar THEN system SHALL include: enabled sources, MCP tool names, deduplication strategy
3. WHEN constructing Sampling message THEN system SHALL use clear, imperative language: "Please fetch...", "Use native integration for...", "Merge results by..."
4. WHEN Sampling message includes user parameters THEN system SHALL pass through: date range, event filters, reminder details
5. IF Sampling message exceeds 2000 tokens THEN system SHALL truncate and summarize
6. WHEN Sampling succeeds THEN system SHALL parse Claude's response for structured data (events array, reminder ID)
7. IF Claude's response is unstructured text THEN system SHALL extract information using pattern matching

### Requirement 6: エラーハンドリングとフォールバック

**User Story:** As a sage user, I want clear error messages when platform-adaptive integration fails, so that I know what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN client does not support Sampling THEN system SHALL return error: "Your Claude client does not support platform-adaptive integration. Please use Claude Desktop, Claude iOS, or Claude iPadOS."
2. WHEN user rejects Sampling request THEN system SHALL return: "Platform-adaptive integration requires user approval. Operation cancelled."
3. WHEN MCP Google Calendar fails AND native integration fails THEN system SHALL return: "All calendar sources unavailable. Check: 1) Google OAuth token, 2) Calendar permissions"
4. WHEN platform is "unknown" THEN system SHALL fallback to MCP-only mode with warning
5. IF Sampling parsing fails THEN system SHALL log raw response and return: "Failed to parse Claude response. Please retry."
6. WHEN native integration is requested but unavailable THEN system SHALL provide clear setup instructions
7. IF error occurs during Sampling THEN system SHALL not crash server, return graceful error to user

### Requirement 7: プラットフォーム情報の MCP リソース公開

**User Story:** As a Claude user, I want to query which platform I'm connecting from and what integrations are available, so that I understand sage's capabilities on my platform.

#### Acceptance Criteria

1. WHEN user calls get_platform_info MCP tool THEN system SHALL return: detected platform, available integrations, Sampling support status
2. WHEN platform is iOS/iPad THEN response SHALL include: "Google Calendar (MCP), Apple Calendar (native), Apple Reminders (native)"
3. WHEN platform is macOS THEN response SHALL include: "EventKit (MCP), Google Calendar (MCP), Apple Reminders (MCP)"
4. WHEN platform is web THEN response SHALL include: "Google Calendar (MCP only)"
5. IF Sampling is not supported THEN response SHALL include warning: "Platform-adaptive integration unavailable"
6. WHEN configuration changes THEN get_platform_info SHALL reflect updated source availability
7. WHEN user has not authenticated Google THEN response SHALL indicate: "Google Calendar: Not authenticated (run authenticate_google)"

## Non-Functional Requirements

### Performance

- Platform detection: < 10ms
- Sampling request construction: < 50ms
- Sampling round-trip (including Claude): < 3 seconds (user approval required)
- Event merge and deduplication: < 100ms for 100 events

### Security

- Never expose MCP internals in Sampling messages
- Validate all Claude responses before processing
- Do not include sensitive data (OAuth tokens) in Sampling prompts
- Sanitize user input before including in Sampling messages

### Reliability

- Graceful degradation when Sampling unavailable (fallback to MCP-only)
- Retry Sampling requests once on transient errors
- Maintain existing MCP-only functionality for backward compatibility
- Test coverage: 98%+ including Sampling paths

### Usability

- Clear error messages for each failure mode
- Informative platform info output from get_platform_info
- User-friendly Sampling request messages (visible to user)
- Comprehensive logging for debugging platform-specific issues

### Testing Strategy

- **Test Coverage**: Minimum 98% coverage including Sampling paths
- **Unit Testing**: Mock clientInfo with different platform values to test platform detection
- **Integration Testing**: Test actual Sampling message construction and parsing
- **iOS Integration Testing**: Mock Sampling responses as if Claude used native APIs
- **macOS Integration Testing**: Mock CalendarService and GoogleCalendarService
- **Error Testing**: Verify graceful error handling for Sampling failures and user rejections
- **E2E Testing**: Verify end-to-end flow with mocked Claude responses
- **CI Enforcement**: CI pipeline SHALL fail if test coverage drops below 98%
