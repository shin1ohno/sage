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

## Capability Detection Reality

### Actual Client Capabilities in Production

実際の運用環境では、以下のクライアント能力が観察されています：

| Environment | Sampling Support | EventKit Available | Integration Strategy |
|-------------|------------------|-------------------|---------------------|
| iOS Claude App | ❓ Expected (未実装) | ❌ No | Google Calendar (fallback) |
| Desktop Claude (macOS) | ✅ Yes | ✅ Yes | EventKit + Google Calendar |
| Claude Code (macOS) | ✅ Yes | ✅ Yes | EventKit + Google Calendar |
| Web (claude.ai) | ❌ No | ❌ No | Google Calendar only |

**重要な発見:**
- **iOS Claude App は現在 `capabilities.sampling` を送信していない** (2026-01-09時点)
- プラットフォーム判定よりも **EventKit 利用可否 + Sampling capability** で統合方式を決定する方が確実
- Platform type (iOS/macOS/web) の判定は不要

### EventKit-Based Integration Strategy (Implemented 2026-01-09)

**問題:** iOS Claude App が `capabilities.sampling` を送信しないため、プラットフォーム推論だけでは判定できない。

**解決策:** EventKit 利用可否 + Sampling capability をベースに統合戦略を決定する。

```typescript
// Runtime dispatch logic
const shouldUseSampling =
  supportsSampling && !isEventKitAvailable();

if (shouldUseSampling) {
  // Use Sampling to request native integration
  return handleWithSampling(...);
} else {
  // Use EventKit (macOS) or fallback (Google Calendar)
  return handleWithoutSampling(...);
}
```

**判定フロー:**

```
┌─────────────────────────────────────────┐
│ Tool Call (set_reminder, list_events)  │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Check: EventKit Available?              │
│ (config.calendar.sources.eventkit.enabled) │
└─────────────────────────────────────────┘
         YES ↓              ↓ NO
    ┌─────────┐      ┌──────────────┐
    │ EventKit│      │ Check Sampling│
    │ Handler │      │   Support?    │
    └─────────┘      └──────────────┘
                       YES ↓    ↓ NO
                  ┌──────────┐ ┌─────────┐
                  │ Sampling │ │Fallback │
                  │ Handler  │ │(Google) │
                  └──────────┘ └─────────┘
```

**利点:**
- ✅ プラットフォーム推論の複雑さを回避
- ✅ Config ベースで制御可能（`eventkit.enabled`）
- ✅ iOS/iPadOS/Desktop/Web すべてで正しく動作
- ✅ 将来 iOS が `sampling: true` を送信すれば自動的に動作

**現在の制限:**
- iOS Claude App が `capabilities.sampling = true` を送信していないため、現時点では Sampling 統合が動作しない
- Anthropic 社に実装依頼が必要

## Terminology

- **MCP Sampling**: MCP プロトコルの `sampling/createMessage` 機能。サーバーから Claude に対してプロンプトを送信し、Claude の実行結果（ネイティブ API 呼び出しの結果など）を受け取る仕組み。ユーザーの明示的な承認が必要。
- **Capability Detection**: MCP の `initialize` メッセージから `capabilities.sampling` の有無を読み取り、Sampling サポートを判別する処理。
- **EventKit**: macOS/iOS のカレンダー・リマインダーにアクセスするためのネイティブフレームワーク。macOS では AppleScript 経由でアクセス可能。iOS/iPad では Sampling を通じて Claude アプリが代わりにアクセス。sage では `config.calendar.sources.eventkit.enabled` で制御。
- **Native Integration**: iOS/iPad の Claude アプリが持つ、OS のカレンダーやリマインダーに直接アクセスする機能。MCP サーバーは Sampling を通じて Claude にネイティブ機能の使用を指示する。
- **Integration Strategy**: EventKit 利用可否 + Sampling サポートに基づいて、最適なカレンダー/リマインダーアクセス方法を選択する戦略。EventKit が使える場合は EventKit、使えず Sampling サポートがある場合は Sampling、両方使えない場合は Google Calendar にフォールバック。
- **Graceful Fallback**: Native API が使用できない環境でも、エラーを返さずに Google Calendar MCP のみで動作を継続する仕組み。

## Data Models

### ClientCapabilityInfo (Simplified)
```typescript
interface ClientCapabilityInfo {
  supportsSampling: boolean; // Whether client supports sampling/createMessage
  availableIntegrations: {
    calendar: {
      google: boolean;    // Google Calendar via MCP
      eventkit: boolean;  // EventKit via MCP (macOS only)
      sampling: boolean;  // Native Calendar via Sampling (iOS/iPad only)
    };
    reminders: {
      applescript: boolean; // Apple Reminders via AppleScript MCP (macOS)
      sampling: boolean;    // Native Reminders via Sampling (iOS/iPad only)
    };
  };
}
```

**Simplification Rationale:**
- ❌ Removed: `platform`, `clientName`, `clientVersion`, `detectionConfidence`, `transportMode`
- ✅ Kept: `supportsSampling` (only capability we actually use)
- ✅ Kept: `availableIntegrations` (determined by `supportsSampling` + `isEventKitAvailable()`)
- Platform type inference is not used in runtime dispatch logic

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

### Requirement 1: MCP クライアント Capability の検出

**User Story:** As a sage MCP server, I want to detect the client's Sampling capability from MCP initialize message, so that I can provide appropriate integration strategies.

**Simplification Rationale:** Platform type (iOS/macOS/web) inference is unnecessary. Only Sampling capability + EventKit availability determine the integration strategy.

#### Acceptance Criteria

1. WHEN MCP server receives initialize request THEN system SHALL extract `capabilities.sampling` from the request
2. WHEN client capabilities include "sampling" object THEN system SHALL mark client as Sampling-capable
3. WHEN client capabilities do NOT include "sampling" object THEN system SHALL mark client as NOT Sampling-capable
4. WHEN Sampling capability is detected THEN system SHALL store `supportsSampling: boolean` for tool request context
5. WHEN integration strategy is needed THEN system SHALL check `supportsSampling && !isEventKitAvailable()` to determine whether to use Sampling

### Requirement 2: Sampling を使った統合戦略の指示

**User Story:** As a sage MCP server, I want to instruct Claude to use appropriate integration methods via Sampling, so that calendar and reminder operations work seamlessly.

#### Acceptance Criteria

1. WHEN list_calendar_events tool is called AND `supportsSampling && !isEventKitAvailable()` THEN system SHALL use Sampling to request Claude: "Fetch Google Calendar events via list_calendar_events MCP tool with source filter, and Apple Calendar events via native Calendar API if available, then merge results by iCalUID"
2. WHEN list_calendar_events tool is called AND `isEventKitAvailable()` THEN system SHALL use MCP-only: "Fetch events from all enabled sources (EventKit, Google Calendar) via list_calendar_events MCP tool"
3. WHEN set_reminder tool is called AND `supportsSampling && !isEventKitAvailable()` THEN system SHALL use Sampling to request Claude: "Create reminder using native Reminders API if available with title, due date, and notes"
4. WHEN set_reminder tool is called AND `isEventKitAvailable()` THEN system SHALL use existing set_reminder MCP tool with AppleScript backend
5. WHEN Sampling request fails with user rejection (error code -1) THEN system SHALL fallback to MCP-only approach with informative error message
6. WHEN Sampling request fails with method not found (error code -32601) THEN system SHALL return error: "Sampling not supported by this Claude client."
7. WHEN Sampling request succeeds THEN system SHALL process Claude's response and return merged results to user
8. IF client does not support Sampling AND EventKit is not available THEN system SHALL use Google Calendar MCP-only approach

**Note:** Sampling instructions are flexible and work regardless of the actual platform (iOS/iPad/macOS/web). Claude will use native APIs if available, or fallback to MCP-only gracefully.

### Requirement 3: カレンダー統合戦略

**User Story:** As a sage user, I want to access both Google Calendar (via MCP) and Apple Calendar (via EventKit or native integration) seamlessly, so that I can see all my events regardless of source.

#### Acceptance Criteria

1. WHEN EventKit is available AND user lists events THEN system SHALL use MCP: "EventKit + Google Calendar"
2. WHEN EventKit is NOT available AND Sampling is supported AND user lists events THEN system SHALL use Sampling: "MCP for Google + Native for Apple if available"
3. WHEN neither EventKit nor Sampling is available THEN system SHALL use MCP: "Google Calendar only"
4. WHEN multiple sources are used THEN system SHALL deduplicate events using iCalUID matching (handled by Claude in Sampling path)
5. IF MCP Google Calendar fails THEN system SHALL still request other sources (EventKit or native via Sampling)
6. IF all sources fail THEN system SHALL return clear error with troubleshooting steps
7. WHEN events from multiple sources are merged THEN system SHALL preserve source attribution (source: "google" | "eventkit" | "native-ios")

### Requirement 4: Reminders 統合戦略

**User Story:** As a sage user, I want to create reminders using the best available integration method, so that reminders appear in my Apple Reminders app.

#### Acceptance Criteria

1. WHEN EventKit is available AND user sets reminder THEN system SHALL use existing AppleScript-based MCP tool
2. WHEN EventKit is NOT available AND Sampling is supported AND user sets reminder THEN system SHALL instruct Claude to use native Reminders API if available
3. WHEN neither EventKit nor Sampling is available THEN system SHALL return error: "Reminders not supported. Please enable EventKit or use a Sampling-capable Claude client."
4. WHEN reminder creation succeeds THEN system SHALL return success with reminder ID
5. WHEN reminder creation fails THEN system SHALL provide fallback: "Create manually in Apple Reminders app: [reminder details]"
6. IF user approves Sampling request THEN system SHALL execute reminder creation
7. IF user rejects Sampling request THEN system SHALL abort with user-friendly message

### Requirement 5: Sampling リクエストのテンプレートとメッセージ構築

**User Story:** As a sage MCP server, I want to construct clear and actionable Sampling messages for Claude, so that Claude understands exactly what actions to take.

#### Acceptance Criteria

1. WHEN constructing Sampling message for calendar THEN system SHALL include: available methods (MCP + native if available), expected merge behavior
2. WHEN constructing Sampling message THEN system SHALL use clear, imperative language: "Please fetch...", "Use native integration if available...", "Merge results by..."
3. WHEN Sampling message includes user parameters THEN system SHALL pass through: date range, event filters, reminder details
4. IF Sampling message exceeds 2000 tokens THEN system SHALL truncate and summarize
5. WHEN Sampling succeeds THEN system SHALL return Claude's response directly (Claude handles merging and formatting)
6. WHEN Sampling message is constructed THEN system SHALL NOT include platform-specific assumptions (e.g., "You are running on iOS")

### Requirement 6: エラーハンドリングとフォールバック

**User Story:** As a sage user, I want clear error messages when integration fails, so that I know what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN client does not support Sampling AND EventKit is not available THEN system SHALL fallback to Google Calendar MCP-only mode
2. WHEN user rejects Sampling request THEN system SHALL return: "Sampling requires user approval. Operation cancelled. Falling back to Google Calendar only."
3. WHEN MCP Google Calendar fails AND no other sources available THEN system SHALL return: "All calendar sources unavailable. Check: 1) Google OAuth token, 2) Network connectivity"
4. WHEN Sampling response is empty THEN system SHALL log raw response and return: "Empty response from Claude. Please retry."
5. WHEN native integration is requested but unavailable THEN system SHALL gracefully fallback to MCP-only without error
6. IF error occurs during Sampling THEN system SHALL not crash server, return graceful error to user

### Requirement 7: Capability 情報の MCP リソース公開

**User Story:** As a Claude user, I want to query what integrations are available, so that I understand sage's capabilities.

#### Acceptance Criteria

1. WHEN user calls get_platform_info MCP tool THEN system SHALL return: Sampling support status, available integrations
2. WHEN EventKit is enabled THEN response SHALL include: "EventKit (MCP), Google Calendar (MCP), Apple Reminders (MCP)"
3. WHEN EventKit is NOT enabled AND Sampling is supported THEN response SHALL include: "Google Calendar (MCP), Apple Calendar (Sampling), Apple Reminders (Sampling)"
4. WHEN neither EventKit nor Sampling is available THEN response SHALL include: "Google Calendar (MCP only)"
5. IF Sampling is not supported THEN response SHALL include note: "Sampling-based integration unavailable"
6. WHEN configuration changes THEN get_platform_info SHALL reflect updated source availability
7. WHEN user has not authenticated Google THEN response SHALL indicate: "Google Calendar: Not authenticated (run authenticate_google)"

## Non-Functional Requirements

### Performance

- Capability detection: < 5ms (simple boolean check)
- Sampling request construction: < 50ms
- Sampling round-trip (including Claude): < 3 seconds (user approval required)
- EventKit availability check: < 1ms (config lookup)

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
