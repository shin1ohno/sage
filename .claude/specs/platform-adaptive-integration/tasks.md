# Implementation Plan

## Task Overview

Capability 適応型統合機能の実装を、簡略化された Atomic Tasks に分解しました。各タスクは15-30分で完了可能な粒度で、1-3ファイルのみに触れます。

**Simplification Rationale (2026-01-09):**
- Platform type inference (iOS/macOS/web) is unnecessary
- Only `supportsSampling` + `isEventKitAvailable()` are used for runtime dispatch
- Removed: client name pattern matching, transport mode detection, platform detection confidence

実装は4つのフェーズに分かれています：
1. **Phase 1: Foundation** (Tasks 1-7) - 型定義とコアコンポーネント (簡略化)
2. **Phase 2: Integration** (Tasks 8-15) - MCP Server統合とツールハンドラ拡張
3. **Phase 3: Testing** (Tasks 16-23) - ユニット、統合、E2Eテスト (簡略化)
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

- [x] 1. Create capability types in src/types/platform.ts (Simplified)
  - File: src/types/platform.ts (new)
  - Define `ClientCapabilityInfo`, `SamplingRequest`, `SamplingResponse` interfaces
  - Add `ClientCapabilities` type from MCP SDK
  - Purpose: Establish type safety for capability detection and Sampling
  - **Simplification**: Removed `DetectedPlatform` (platform, clientName, clientVersion, detectionConfidence)
  - _Requirements: 1.1-1.4, 2.1-2.7_

- [x] 2. Create CapabilityDetector class in src/platform/detector.ts (Simplified)
  - File: src/platform/detector.ts (new)
  - Create directory: src/platform/
  - Implement `detectCapabilities(capabilities): { supportsSampling: boolean }` static method
  - Simple check: `capabilities.sampling !== undefined`
  - Purpose: Core capability detection functionality
  - **Simplification**: Removed client name pattern matching, transport mode detection
  - _Requirements: 1.1-1.4_

- [x] 3. Add getAvailableIntegrations method to CapabilityDetector (Simplified)
  - File: src/platform/detector.ts (continue from task 2)
  - Implement `getAvailableIntegrations(supportsSampling, config): ClientCapabilityInfo['availableIntegrations']`
  - Check EventKit availability, Sampling support
  - Purpose: Determine which integrations are available based on capability + config
  - **Simplification**: No platform-based inference, only capability + config check
  - _Requirements: 7.2-7.4_

- [x] 4. Create SamplingService class in src/services/sampling-service.ts
  - File: src/services/sampling-service.ts (new)
  - Define class with constructor taking McpServer instance
  - Add `sendSamplingRequest(request): Promise<SamplingResponse>` method skeleton
  - Add `validateSamplingResponse(response): void` method with Zod schema
  - Purpose: Sampling request handling infrastructure
  - _Leverage: retryWithBackoff from src/utils/retry.ts_
  - _Requirements: 2.1-2.7, 6.7_

- [x] 5. Implement SamplingService.sendSamplingRequest with retry
  - File: src/services/sampling-service.ts (continue from task 4)
  - Implement MCP SDK call: `server.request('sampling/createMessage', params)`
  - Wrap with `retryWithBackoff()` for transient errors
  - Add error handling for user rejection (code -1) and method not found (code -32601)
  - Purpose: Robust Sampling request with retry logic
  - _Leverage: retryWithBackoff, createErrorFromCatch_
  - _Requirements: 2.5, 6.1-6.2, 6.7_

- [x] 6. Create IntegrationStrategyManager in src/services/integration-strategy-manager.ts
  - File: src/services/integration-strategy-manager.ts (new)
  - Define class with methods: `getCalendarStrategy()`, `getReminderStrategy()`
  - Add skeleton methods: `buildCalendarSamplingMessage()`, `buildReminderSamplingMessage()`
  - Purpose: Strategy pattern for platform-specific integrations
  - _Requirements: 3.1-3.3, 4.1-4.3_

- [x] 7. Implement Sampling message templates in IntegrationStrategyManager (Simplified)
  - File: src/services/integration-strategy-manager.ts (continue from task 6)
  - Implement `buildCalendarSamplingMessage()` without platform-specific assumptions
  - Implement `buildReminderSamplingMessage()` with flexible "if available" instructions
  - Add input sanitization for user-provided parameters (title, notes)
  - Purpose: Generate clear, actionable Sampling instructions for Claude
  - **Simplification**: No "You are running on iOS/macOS" assumptions
  - _Requirements: 5.1-5.6, Security: Input Sanitization_

### Phase 2: Integration (MCP Server and Tool Handlers)

- [x] 8. Add capability detection to MCP Server initialization in src/index.ts (Simplified)
  - File: src/index.ts (modify existing)
  - Import `CapabilityDetector`
  - Add global state: `let supportsSampling: boolean = false`
  - Add `server.setRequestHandler('initialize', ...)` to detect capability on init
  - Purpose: Capture capabilities and detect Sampling support when MCP connects
  - **Simplification**: Only store `supportsSampling`, no platform type
  - _Leverage: Existing MCP Server setup in src/index.ts_
  - _Requirements: 1.1, 1.4_

- [x] 9. Add CapabilityContext to Context factory functions in src/index.ts (Simplified)
  - File: src/index.ts (continue from task 8)
  - Define `CapabilityContext` interface with `getSupportsSampling(): boolean`
  - Extend `createCalendarToolsContext()` to include CapabilityContext
  - Extend `createReminderTodoContext()` to include CapabilityContext
  - Purpose: Inject capability info into tool handlers
  - **Simplification**: Only provide `supportsSampling`, no platform object
  - _Leverage: Existing Context factory pattern_
  - _Requirements: 1.4_

- [x] 10. Create handleListCalendarEventsWithSampling in src/tools/calendar/handlers.ts (Simplified)
  - File: src/tools/calendar/handlers.ts (modify existing)
  - Add new function `handleListCalendarEventsWithSampling(args, context)`
  - Instantiate SamplingService and IntegrationStrategyManager
  - Build Sampling message (no platform parameter needed) and send request
  - Handle user rejection (code -1) with fallback to Google Calendar only
  - Return Claude's response directly (no parsing)
  - Purpose: Sampling-based calendar events
  - **Simplification**: No platform parameter, flexible Sampling message
  - _Leverage: Existing handleListCalendarEvents logic_
  - _Requirements: 2.1-2.2, 3.2, 6.2_

- [x] 11. Modify handleListCalendarEvents to use capability detection (Simplified)
  - File: src/tools/calendar/handlers.ts (continue from task 10)
  - Update function signature to accept `CapabilityContext`
  - Add check: if `supportsSampling && !isEventKitAvailable()`, call `handleListCalendarEventsWithSampling()`
  - Otherwise, call existing MCP-only logic (EventKit + Google Calendar)
  - Purpose: Capability-aware calendar events tool
  - **Simplification**: Only check capability + EventKit, no platform type
  - _Leverage: Existing handleListCalendarEvents_
  - _Requirements: 2.1-2.2, 3.1-3.2_

- [x] 12. Create handleSetReminderWithSampling in src/tools/reminders/handlers.ts (Simplified)
  - File: src/tools/reminders/handlers.ts (modify existing)
  - Add new function `handleSetReminderWithSampling(args, context)`
  - Build Sampling message for reminder creation (no platform parameter)
  - Send Sampling request with error handling
  - Return Claude's response directly
  - Purpose: Sampling-based reminder creation
  - **Simplification**: No platform parameter, flexible "if available" message
  - _Leverage: Existing handleSetReminder logic_
  - _Requirements: 2.3, 4.2_

- [x] 13. Modify handleSetReminder to use capability detection (Simplified)
  - File: src/tools/reminders/handlers.ts (continue from task 12)
  - Update function signature to accept `CapabilityContext`
  - Add check: if `supportsSampling && !isEventKitAvailable()`, use `handleSetReminderWithSampling()`
  - Otherwise, use existing AppleScript-based logic (EventKit)
  - If neither available, return error
  - Purpose: Capability-aware reminder creation
  - **Simplification**: Only check capability + EventKit, no platform type
  - _Leverage: Existing handleSetReminder_
  - _Requirements: 2.3-2.4, 4.1-4.3_

- [x] 14. Create get_platform_info tool in src/tools/platform/handlers.ts (Simplified)
  - File: src/tools/platform/handlers.ts (new)
  - Create directory: src/tools/platform/
  - Implement `handleGetPlatformInfo(args, context)` function
  - Call `CapabilityDetector.getAvailableIntegrations()` to get integration status
  - Return JSON with supportsSampling, availableIntegrations
  - Purpose: Allow users to query capability and integration status
  - **Simplification**: No platform/clientName/clientVersion in response
  - _Requirements: 7.1-7.7_

- [x] 15. Register get_platform_info tool in src/index.ts
  - File: src/index.ts (modify existing)
  - Import `handleGetPlatformInfo` from src/tools/platform/handlers.ts
  - Add tool definition with name: "get_platform_info", description, empty input schema
  - Register tool handler in MCP server
  - Purpose: Make get_platform_info tool available to Claude
  - _Leverage: Existing tool registration pattern_
  - _Requirements: 7.1_

### Phase 3: Testing (Unit, Integration, E2E)

- [x] 16. Create CapabilityDetector unit tests in tests/unit/platform/detector.test.ts (Simplified)
  - File: tests/unit/platform/detector.test.ts (new)
  - Create directory: tests/unit/platform/
  - Test `detectCapabilities()` with and without `capabilities.sampling`
  - Test `getAvailableIntegrations()` with different `supportsSampling` and config values
  - Purpose: Verify capability detection logic
  - **Simplification**: No platform inference tests, only boolean capability check
  - _Requirements: 8 (Testing Strategy)_

- [x] 17. Create SamplingService unit tests in tests/unit/services/sampling-service.test.ts
  - File: tests/unit/services/sampling-service.test.ts (new)
  - Mock McpServer.request()
  - Test `sendSamplingRequest()` success case
  - Test user rejection (code -1) error handling
  - Test method not found (code -32601) error handling
  - Test `validateSamplingResponse()` with valid and invalid responses
  - Purpose: Verify Sampling service reliability
  - _Requirements: 8 (Testing Strategy)_

- [x] 18. Create IntegrationStrategyManager unit tests (Simplified)
  - File: tests/unit/services/integration-strategy-manager.test.ts (new)
  - Test `buildCalendarSamplingMessage()` without platform parameter
  - Test `buildReminderSamplingMessage()` without platform parameter
  - Verify message includes flexible "if available" instructions
  - Verify message does NOT include platform-specific assumptions
  - Test input sanitization (XSS, special characters)
  - Purpose: Verify Sampling message construction
  - **Simplification**: No platform-specific message variations
  - _Requirements: 5.1-5.6, Security_

- [x] 19. Create tool handler unit tests in tests/unit/tools/calendar/handlers.test.ts (Simplified)
  - File: tests/unit/tools/calendar/handlers.test.ts (modify existing)
  - Mock CapabilityContext with `supportsSampling=true, isEventKitAvailable=false`
  - Test `handleListCalendarEvents()` routing to Sampling path
  - Mock SamplingService.sendSamplingRequest()
  - Verify correct Sampling message is sent
  - Test fallback to Google Calendar only on user rejection
  - Purpose: Verify tool handler capability awareness
  - **Simplification**: Only test capability-based routing, not platform-based
  - _Leverage: Existing handler tests_
  - _Requirements: 2.1-2.2, 3.2_

- [x] 20. Create integration test for Sampling path in tests/integration/platform/sampling-calendar.test.ts (Simplified)
  - File: tests/integration/platform/sampling-calendar.test.ts (new)
  - Create directory: tests/integration/platform/
  - Mock `supportsSampling=true`, EventKit unavailable
  - Mock SamplingService response with merged events
  - Call `handleListCalendarEvents()` and verify Sampling is used
  - Verify response contains events from multiple sources
  - Purpose: End-to-end Sampling calendar integration test
  - **Simplification**: No platform-specific tests, only capability-based
  - _Leverage: Existing integration test patterns_
  - _Requirements: 8 (Integration Testing)_

- [x] 21. Create integration test for EventKit path in tests/integration/platform/eventkit-calendar.test.ts (Simplified)
  - File: tests/integration/platform/eventkit-calendar.test.ts (new)
  - Mock EventKit available, `supportsSampling=false`
  - Mock CalendarSourceManager
  - Call `handleListCalendarEvents()` and verify MCP-only path is used
  - Verify Sampling is NOT called
  - Purpose: Verify EventKit path uses existing MCP-only logic
  - **Simplification**: Test capability-based routing, not platform type
  - _Requirements: 3.1, 8 (Integration Testing)_

- [x] 22. Create E2E test for capability adaptive integration (Simplified)
  - File: tests/e2e/platform-adaptive-integration.test.ts (new)
  - Mock MCP Server initialize with Sampling capability
  - Verify `supportsSampling` in global state
  - Mock EventKit as unavailable
  - Mock Sampling response
  - Call list_calendar_events tool and verify complete flow
  - Verify response format matches expected structure
  - Purpose: Full workflow validation
  - **Simplification**: Test capability detection, not platform detection
  - _Requirements: 8 (E2E Testing)_

- [x] 23. Create error handling tests in tests/unit/tools/calendar/error-handling.test.ts
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

- [x] 24. Create Sampling response mocks in tests/mocks/sampling-responses.ts (No Change)
  - File: tests/mocks/sampling-responses.ts (new)
  - Create directory: tests/mocks/ (if not exists)
  - Export `mockSamplingCalendarResponse` with sample events
  - Export `mockSamplingReminderResponse` with success result
  - Export `mockUserRejectionError` (code -1)
  - Export `mockMethodNotFoundError` (code -32601)
  - Purpose: Reusable mocks for all Sampling tests
  - _Leverage: Existing test mocks pattern_
  - _Requirements: 8 (Mock Strategy)_

- [x] 25. Create capability detection mocks in tests/mocks/client-capabilities.ts (Simplified)
  - File: tests/mocks/client-capabilities.ts (new)
  - Export `samplingCapabilities`, `noSamplingCapabilities`
  - Export helper: `createMockCapabilityContext(supportsSampling, eventKitEnabled)`
  - Purpose: Reusable capability mocks for all tests
  - **Simplification**: No client info mocks (iOSClientInfo, macOSClientInfo, etc.)
  - _Requirements: 8 (Mock Strategy)_

- [x] 26. Update CHANGELOG.md with capability-adaptive-integration feature (Simplified)
  - File: CHANGELOG.md (modify existing)
  - Add new section for version 0.9.0
  - List new features: Capability Detection, MCP Sampling support, Flexible native integration
  - List new tool: get_platform_info (returns capability info)
  - List breaking changes: None (fully backward compatible)
  - Purpose: Document feature for users
  - **Simplification**: Focus on capability-based approach, not platform detection
  - _Requirements: Documentation_

- [x] 27. Add capability-adaptive-integration to README.md (Simplified)
  - File: README.md (modify existing)
  - Add section: "Capability-Adaptive Integration"
  - Explain EventKit + Google Calendar + Sampling-based native integration
  - Add usage example for get_platform_info tool
  - Add troubleshooting: Sampling approval required
  - Purpose: User-facing documentation
  - **Simplification**: Describe capability-based strategy, not platform-specific details
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

---

## Bug Fixes and Improvements

### Bug Fix: iOS Platform Detection and Runtime Dispatch (2026-01-09)

**Bug ID:** `ios-mcp-server-platform-unknown-sampling`

**Problem:**
- iOS Claude App が `capabilities.sampling` を送信していない
- プラットフォーム推論だけでは iOS を判定できない
- Sampling 版ハンドラーが登録されない

**Solution: EventKit Availability-Based Dispatch**

- [x] **Fix 1**: Enhance platform detection logic
  - File: `src/platform/detector.ts` (Lines 147-168)
  - Added HTTP + Sampling → iOS inference (optional, not critical)
  - Modified: 2026-01-09

- [x] **Fix 2**: Add EventKit availability check
  - File: `src/cli/mcp-handler.ts` (Lines 567-573)
  - Added `isEventKitAvailable()` method
  - Checks `config.calendar.sources.eventkit.enabled`
  - Modified: 2026-01-09

- [x] **Fix 3**: Implement EventKit-based runtime dispatch for set_reminder
  - File: `src/cli/mcp-handler.ts` (Lines 935-966)
  - Changed condition: `supportsSampling && !isEventKitAvailable()`
  - Removed platform-based condition (`platform === 'ios'`)
  - Modified: 2026-01-09

- [x] **Fix 4**: Implement EventKit-based runtime dispatch for list_calendar_events
  - File: `src/cli/mcp-handler.ts` (Lines 1031-1053)
  - Same pattern as Fix 3
  - Modified: 2026-01-09

- [x] **Fix 5**: Update platform detection tests
  - File: `tests/unit/platform-detector.test.ts` (Lines 349-392)
  - Added 4 new tests for transportHint-based detection
  - Removed obsolete "ai" keyword test
  - Modified: 2026-01-09

- [x] **Fix 6**: Remove obsolete test in platform/detector.test.ts
  - File: `tests/unit/platform/detector.test.ts` (Line 134-140)
  - Removed "ai" keyword detection test
  - Modified: 2026-01-09

**Test Results:**
- ✅ All tests passing (108 suites, 2563 tests)
- ✅ Test coverage maintained at 98%+

**Implementation Details:**
- Primary decision: EventKit availability (not platform)
- Secondary: Sampling capability support
- Fallback: Google Calendar integration

**Future Work:**
- Submit MCP capability extension proposal to Anthropic
- Suggested field: `capabilities.experimental.nativeIntegrations`
