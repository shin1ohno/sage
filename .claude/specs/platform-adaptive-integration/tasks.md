# Implementation Plan

## Task Overview

プラットフォーム適応型統合機能の実装を、27の Atomic Tasks に分解しました。各タスクは15-30分で完了可能な粒度で、1-3ファイルのみに触れます。

実装は4つのフェーズに分かれています：
1. **Phase 1: Foundation** (Tasks 1-7) - 型定義とコアコンポーネント
2. **Phase 2: Integration** (Tasks 8-15) - MCP Server統合とツールハンドラ拡張
3. **Phase 3: Testing** (Tasks 16-23) - ユニット、統合、E2Eテスト
4. **Phase 4: Documentation** (Tasks 24-27) - ドキュメントとモック

## Steering Document Compliance

- **structure.md**: 新規ディレクトリ `src/platform/`, `src/types/platform.ts` を作成
- **tech.md**: TypeScript Strict Mode、Zod validation、Jest、retryWithBackoff パターンを活用

## Atomic Task Requirements

各タスクは以下の基準を満たしています：
- **File Scope**: 1-3ファイルのみに触れる
- **Time Boxing**: 15-30分で完了可能
- **Single Purpose**: 1つのテスト可能な成果物
- **Specific Files**: 正確なファイルパスを指定
- **Agent-Friendly**: 明確な入出力、最小限のコンテキスト切り替え

## Tasks

### Phase 1: Foundation (Type Definitions and Core Components)

- [ ] 1. Create platform types in src/types/platform.ts
  - File: src/types/platform.ts (new)
  - Define `DetectedPlatform`, `PlatformInfo`, `SamplingRequest`, `SamplingResponse` interfaces
  - Add `ClientInfo` and `ClientCapabilities` types from MCP SDK
  - Purpose: Establish type safety for platform detection and Sampling
  - _Requirements: 1.1-1.7, 2.1-2.7_

- [ ] 2. Create PlatformDetector class in src/platform/detector.ts
  - File: src/platform/detector.ts (new)
  - Create directory: src/platform/
  - Implement `detectPlatform(clientInfo, capabilities): DetectedPlatform` static method
  - Add platform detection logic (iOS/iPad/macOS/web/unknown from clientInfo.name)
  - Purpose: Core platform detection functionality
  - _Leverage: Inspired by existing CalendarService.detectPlatform()_
  - _Requirements: 1.1-1.5_

- [ ] 3. Add getAvailableIntegrations method to PlatformDetector
  - File: src/platform/detector.ts (continue from task 2)
  - Implement `getAvailableIntegrations(platform, config): PlatformInfo['availableIntegrations']`
  - Check Google OAuth, EventKit availability, native iOS support based on platform
  - Purpose: Determine which integrations are available on each platform
  - _Leverage: CalendarSourceManager.detectAvailableSources()_
  - _Requirements: 7.2-7.4_

- [ ] 4. Create SamplingService class in src/services/sampling-service.ts
  - File: src/services/sampling-service.ts (new)
  - Define class with constructor taking McpServer instance
  - Add `sendSamplingRequest(request): Promise<SamplingResponse>` method skeleton
  - Add `validateSamplingResponse(response): void` method with Zod schema
  - Purpose: Sampling request handling infrastructure
  - _Leverage: retryWithBackoff from src/utils/retry.ts_
  - _Requirements: 2.1-2.7, 6.7_

- [ ] 5. Implement SamplingService.sendSamplingRequest with retry
  - File: src/services/sampling-service.ts (continue from task 4)
  - Implement MCP SDK call: `server.request('sampling/createMessage', params)`
  - Wrap with `retryWithBackoff()` for transient errors
  - Add error handling for user rejection (code -1) and method not found (code -32601)
  - Purpose: Robust Sampling request with retry logic
  - _Leverage: retryWithBackoff, createErrorFromCatch_
  - _Requirements: 2.5, 6.1-6.2, 6.7_

- [ ] 6. Create IntegrationStrategyManager in src/services/integration-strategy-manager.ts
  - File: src/services/integration-strategy-manager.ts (new)
  - Define class with methods: `getCalendarStrategy()`, `getReminderStrategy()`
  - Add skeleton methods: `buildCalendarSamplingMessage()`, `buildReminderSamplingMessage()`
  - Purpose: Strategy pattern for platform-specific integrations
  - _Requirements: 3.1-3.3, 4.1-4.3_

- [ ] 7. Implement Sampling message templates in IntegrationStrategyManager
  - File: src/services/integration-strategy-manager.ts (continue from task 6)
  - Implement `buildCalendarSamplingMessage()` with detailed instructions for iOS/macOS
  - Implement `buildReminderSamplingMessage()` with platform-specific steps
  - Add input sanitization for user-provided parameters (title, notes)
  - Purpose: Generate clear, actionable Sampling instructions for Claude
  - _Requirements: 5.1-5.4, Security: Input Sanitization_

### Phase 2: Integration (MCP Server and Tool Handlers)

- [ ] 8. Add platform detection to MCP Server initialization in src/index.ts
  - File: src/index.ts (modify existing)
  - Import `PlatformDetector` and `DetectedPlatform`
  - Add global state: `let detectedPlatform: DetectedPlatform | null = null`
  - Add `server.setRequestHandler('initialize', ...)` to detect platform on init
  - Purpose: Capture clientInfo and detect platform when MCP connects
  - _Leverage: Existing MCP Server setup in src/index.ts_
  - _Requirements: 1.1, 1.6_

- [ ] 9. Add PlatformContext to Context factory functions in src/index.ts
  - File: src/index.ts (continue from task 8)
  - Define `PlatformContext` interface with `getPlatformInfo(): DetectedPlatform | null`
  - Extend `createCalendarToolsContext()` to include PlatformContext
  - Extend `createReminderTodoContext()` to include PlatformContext
  - Purpose: Inject platform info into tool handlers
  - _Leverage: Existing Context factory pattern_
  - _Requirements: 1.6_

- [ ] 10. Create handleListCalendarEventsWithSampling in src/tools/calendar/handlers.ts
  - File: src/tools/calendar/handlers.ts (modify existing)
  - Add new function `handleListCalendarEventsWithSampling(args, context, platform)`
  - Instantiate SamplingService and IntegrationStrategyManager
  - Build Sampling message and send request
  - Handle user rejection (code -1) with fallback to MCP-only
  - Return Claude's response directly (no parsing)
  - Purpose: Sampling-based calendar events for iOS/iPad
  - _Leverage: Existing handleListCalendarEvents logic_
  - _Requirements: 2.1-2.2, 3.1, 6.2_

- [ ] 11. Modify handleListCalendarEvents to use platform detection
  - File: src/tools/calendar/handlers.ts (continue from task 10)
  - Update function signature to accept `PlatformContext`
  - Add platform check: if iOS/iPad + Sampling support, call `handleListCalendarEventsWithSampling()`
  - Otherwise, call existing MCP-only logic
  - Purpose: Platform-aware calendar events tool
  - _Leverage: Existing handleListCalendarEvents (rename to handleListCalendarEventsMcpOnly)_
  - _Requirements: 2.1, 3.1-3.2_

- [ ] 12. Create handleSetReminderWithSampling in src/tools/reminders/handlers.ts
  - File: src/tools/reminders/handlers.ts (modify existing)
  - Add new function `handleSetReminderWithSampling(args, context, platform)`
  - Build Sampling message for reminder creation
  - Send Sampling request with error handling
  - Return Claude's response directly
  - Purpose: Sampling-based reminder creation for iOS/iPad
  - _Leverage: Existing handleSetReminder logic_
  - _Requirements: 2.3, 4.1_

- [ ] 13. Modify handleSetReminder to use platform detection
  - File: src/tools/reminders/handlers.ts (continue from task 12)
  - Update function signature to accept `PlatformContext`
  - Add platform check: if iOS/iPad + Sampling, use `handleSetReminderWithSampling()`
  - If web, return error: "Reminders not supported on web platform"
  - Otherwise, use existing AppleScript-based logic
  - Purpose: Platform-aware reminder creation
  - _Leverage: Existing handleSetReminder_
  - _Requirements: 2.3-2.4, 4.1-4.3_

- [ ] 14. Create get_platform_info tool in src/tools/platform/handlers.ts
  - File: src/tools/platform/handlers.ts (new)
  - Create directory: src/tools/platform/
  - Implement `handleGetPlatformInfo(args, context)` function
  - Call `PlatformDetector.getAvailableIntegrations()` to get integration status
  - Return JSON with platform, clientName, supportsSampling, availableIntegrations
  - Purpose: Allow users to query platform capabilities
  - _Requirements: 7.1-7.7_

- [ ] 15. Register get_platform_info tool in src/index.ts
  - File: src/index.ts (modify existing)
  - Import `handleGetPlatformInfo` from src/tools/platform/handlers.ts
  - Add tool definition with name: "get_platform_info", description, empty input schema
  - Register tool handler in MCP server
  - Purpose: Make get_platform_info tool available to Claude
  - _Leverage: Existing tool registration pattern_
  - _Requirements: 7.1_

### Phase 3: Testing (Unit, Integration, E2E)

- [ ] 16. Create PlatformDetector unit tests in tests/unit/platform/detector.test.ts
  - File: tests/unit/platform/detector.test.ts (new)
  - Create directory: tests/unit/platform/
  - Test `detectPlatform()` with iOS, macOS, web, unknown clientInfo
  - Test Sampling capability detection
  - Test `getAvailableIntegrations()` with different platforms and configs
  - Purpose: Verify platform detection logic
  - _Requirements: 8 (Testing Strategy)_

- [ ] 17. Create SamplingService unit tests in tests/unit/services/sampling-service.test.ts
  - File: tests/unit/services/sampling-service.test.ts (new)
  - Mock McpServer.request()
  - Test `sendSamplingRequest()` success case
  - Test user rejection (code -1) error handling
  - Test method not found (code -32601) error handling
  - Test `validateSamplingResponse()` with valid and invalid responses
  - Purpose: Verify Sampling service reliability
  - _Requirements: 8 (Testing Strategy)_

- [ ] 18. Create IntegrationStrategyManager unit tests
  - File: tests/unit/services/integration-strategy-manager.test.ts (new)
  - Test `buildCalendarSamplingMessage()` for iOS/macOS
  - Test `buildReminderSamplingMessage()` for iOS/macOS
  - Verify message includes platform info, tool names, parameters
  - Test input sanitization (XSS, special characters)
  - Purpose: Verify Sampling message construction
  - _Requirements: 5.1-5.4, Security_

- [ ] 19. Create tool handler unit tests in tests/unit/tools/calendar/handlers.test.ts
  - File: tests/unit/tools/calendar/handlers.test.ts (modify existing)
  - Mock PlatformContext with iOS platform
  - Test `handleListCalendarEvents()` routing to Sampling path
  - Mock SamplingService.sendSamplingRequest()
  - Verify correct Sampling message is sent
  - Test fallback to MCP-only on user rejection
  - Purpose: Verify tool handler platform awareness
  - _Leverage: Existing handler tests_
  - _Requirements: 2.1-2.2, 3.1_

- [ ] 20. Create integration test for iOS platform in tests/integration/platform/ios-calendar.test.ts
  - File: tests/integration/platform/ios-calendar.test.ts (new)
  - Create directory: tests/integration/platform/
  - Mock platform as iOS with Sampling support
  - Mock SamplingService response with merged events
  - Call `handleListCalendarEvents()` and verify Sampling is used
  - Verify response contains events from both sources
  - Purpose: End-to-end iOS calendar integration test
  - _Leverage: Existing integration test patterns_
  - _Requirements: 8 (Integration Testing)_

- [ ] 21. Create integration test for macOS platform
  - File: tests/integration/platform/macos-calendar.test.ts (new)
  - Mock platform as macOS
  - Mock CalendarSourceManager
  - Call `handleListCalendarEvents()` and verify MCP-only path is used
  - Verify Sampling is NOT called
  - Purpose: Verify macOS uses existing MCP-only logic
  - _Requirements: 3.2, 8 (Integration Testing)_

- [ ] 22. Create E2E test for platform adaptive integration
  - File: tests/e2e/platform-adaptive-integration.test.ts (new)
  - Mock MCP Server initialize with iOS clientInfo
  - Verify platform detection in global state
  - Mock Sampling response
  - Call list_calendar_events tool and verify complete flow
  - Verify response format matches expected structure
  - Purpose: Full workflow validation
  - _Requirements: 8 (E2E Testing)_

- [ ] 23. Create error handling tests in tests/unit/tools/calendar/error-handling.test.ts
  - File: tests/unit/tools/calendar/error-handling.test.ts (new)
  - Test all 6 error scenarios from design.md
  - Test client without Sampling support
  - Test user rejection
  - Test all calendar sources unavailable
  - Test platform detection failure
  - Test empty Sampling response
  - Test MCP SDK errors (-32601, etc.)
  - Purpose: Comprehensive error handling verification
  - _Requirements: 6.1-6.7_

### Phase 4: Documentation and Mocks

- [ ] 24. Create Sampling response mocks in tests/mocks/sampling-responses.ts
  - File: tests/mocks/sampling-responses.ts (new)
  - Create directory: tests/mocks/ (if not exists)
  - Export `mockSamplingCalendarResponse` with sample events
  - Export `mockSamplingReminderResponse` with success result
  - Export `mockUserRejectionError` (code -1)
  - Export `mockMethodNotFoundError` (code -32601)
  - Purpose: Reusable mocks for all Sampling tests
  - _Leverage: Existing test mocks pattern_
  - _Requirements: 8 (Mock Strategy)_

- [ ] 25. Create platform detection mocks in tests/mocks/client-info.ts
  - File: tests/mocks/client-info.ts (new)
  - Export `iOSClientInfo`, `macOSClientInfo`, `webClientInfo`
  - Export `samplingCapabilities`, `noSamplingCapabilities`
  - Export helper: `createMockPlatformContext(platform)`
  - Purpose: Reusable platform mocks for all tests
  - _Requirements: 8 (Mock Strategy)_

- [ ] 26. Update CHANGELOG.md with platform-adaptive-integration feature
  - File: CHANGELOG.md (modify existing)
  - Add new section for version 0.9.0
  - List new features: Platform Detection, MCP Sampling support, iOS/iPad native integration
  - List new tool: get_platform_info
  - List breaking changes: None (fully backward compatible)
  - Purpose: Document feature for users
  - _Requirements: Documentation_

- [ ] 27. Add platform-adaptive-integration to README.md
  - File: README.md (modify existing)
  - Add section: "Platform-Adaptive Integration"
  - Explain iOS/iPad native + Google Calendar integration
  - Add usage example for get_platform_info tool
  - Add troubleshooting: Sampling approval required
  - Purpose: User-facing documentation
  - _Leverage: Existing README structure_
  - _Requirements: Documentation_

## Implementation Order

**Recommended execution order:**

1. **Phase 1** (Tasks 1-7): Foundation - can be done in parallel after Task 1
2. **Phase 2** (Tasks 8-15): Integration - must be sequential (8→9→10→11, 12→13, 14→15)
3. **Phase 3** (Tasks 16-23): Testing - can be done in parallel, but Task 24-25 (mocks) should be done first
4. **Phase 4** (Tasks 24-27): Documentation - can be done in parallel

**Critical Path**: 1 → 2 → 4 → 8 → 10 → 11 (minimum viable implementation)

## Success Criteria

- [ ] All 27 tasks completed
- [ ] Test coverage ≥ 98% (including Sampling paths)
- [ ] All tests pass (unit, integration, E2E)
- [ ] No breaking changes to existing APIs
- [ ] Documentation updated
- [ ] Backward compatibility maintained (MCP-only mode works)

## Notes

- Each task references specific requirement numbers for traceability
- Leverage annotations show which existing code is reused
- Tasks are designed to be completable by automated agents with minimal context switching
- File paths are absolute and specific to avoid ambiguity
