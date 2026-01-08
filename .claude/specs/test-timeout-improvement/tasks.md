# Implementation Plan

## Task Overview

テストユーティリティを `tests/utils/` に作成し、既存の E2E テストを固定タイムアウトからイベント駆動方式に移行する。

## Steering Document Compliance

- **structure.md**: テストユーティリティは `tests/utils/` に配置（新規ディレクトリ）
- **tech.md**: TypeScript strict mode、Jest 29+、ESM (.js インポート)

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

## Tasks

### Phase 1: Test Utilities

- [x] 1. Create server-ready utility with waitForServerReady function
  - File: `tests/utils/server-ready.ts` (create new)
  - Implement `waitForServerReady(url, options)` function
  - Use Node.js built-in `fetch` for health endpoint polling
  - Add `WaitForServerReadyOptions` and `ServerReadyResult` interfaces
  - Include JSDoc comments with usage examples
  - Purpose: Enable event-based server startup detection
  - _Requirements: REQ-TIMEOUT-001, REQ-TIMEOUT-005_

- [x] 2. Add waitForServerStopped function to server-ready utility
  - File: `tests/utils/server-ready.ts` (modify)
  - Implement `waitForServerStopped(url, options)` function
  - Poll URL until connection is refused
  - Purpose: Enable event-based server shutdown detection
  - _Leverage: Task 1 の `waitForServerReady` パターン_
  - _Requirements: REQ-TIMEOUT-002, REQ-TIMEOUT-005_

- [x] 3. Create process-lifecycle utility with waitForProcessOutput function
  - File: `tests/utils/process-lifecycle.ts` (create new)
  - Implement `waitForProcessOutput(proc, pattern, options)` function
  - Monitor stdout/stderr for pattern match using EventEmitter
  - Add `WaitForOutputOptions` and `OutputMatchResult` interfaces
  - Handle process error/exit events
  - Include JSDoc comments with usage examples
  - Purpose: Enable event-based CLI process startup detection
  - _Requirements: REQ-TIMEOUT-003, REQ-TIMEOUT-005_

- [x] 4. Add waitForProcessExit and gracefulStop functions to process-lifecycle utility
  - File: `tests/utils/process-lifecycle.ts` (modify)
  - Implement `waitForProcessExit(proc, options)` function
  - Implement `gracefulStop(proc, options)` function with SIGINT → SIGKILL fallback
  - Add `WaitForExitOptions` and `ProcessExitResult` interfaces
  - Purpose: Enable event-based CLI process termination detection
  - _Leverage: Task 3 の EventEmitter パターン_
  - _Requirements: REQ-TIMEOUT-004, REQ-TIMEOUT-005_

- [x] 5. Create index.ts to export all utilities
  - File: `tests/utils/index.ts` (create new)
  - Re-export all functions from server-ready.ts and process-lifecycle.ts
  - Purpose: Provide single import point for test utilities
  - _Leverage: Task 1-4_
  - _Requirements: REQ-TIMEOUT-005_

### Phase 2: Test Migration

- [x] 6. Migrate remote-auth.test.ts to use waitForServerReady
  - File: `tests/e2e/remote-auth.test.ts` (modify)
  - Import `waitForServerReady` from `../utils/index.js`
  - Replace `jest.setTimeout(30000)` with per-test safety net (optional)
  - Add `waitForServerReady()` call after `createHTTPServerWithConfig()`
  - Keep `afterEach` timeout as safety net for cleanup
  - Purpose: Eliminate fixed startup delay in remote-auth tests
  - _Leverage: tests/utils/server-ready.ts_
  - _Requirements: REQ-TIMEOUT-001, REQ-TIMEOUT-006_

- [x] 7. Extract startHTTPServer helper from cli-modes.test.ts
  - File: `tests/e2e/cli-modes.test.ts` (modify)
  - Replace inline `startHTTPServer()` with `waitForProcessOutput()` usage
  - Import utilities from `../utils/index.js`
  - Remove fixed 10000ms timeout fallback (keep as optional safety net)
  - Purpose: Simplify and standardize CLI server startup detection
  - _Leverage: tests/utils/process-lifecycle.ts_
  - _Requirements: REQ-TIMEOUT-003, REQ-TIMEOUT-006_

- [x] 8. Update cli-modes.test.ts afterEach cleanup to use gracefulStop
  - File: `tests/e2e/cli-modes.test.ts` (modify)
  - Replace inline stop logic with `gracefulStop()` usage
  - Ensure proper cleanup of test config files after process exit
  - Purpose: Reliable process cleanup between tests
  - _Leverage: tests/utils/process-lifecycle.ts_
  - _Requirements: REQ-TIMEOUT-004, REQ-TIMEOUT-006_

- [x] 9. Update runCLI helper in cli-modes.test.ts
  - File: `tests/e2e/cli-modes.test.ts` (modify)
  - Replace fixed 5000ms timeout with `waitForProcessExit()` usage
  - Keep maxTimeout as safety net parameter
  - Purpose: Event-based CLI command completion detection
  - _Leverage: tests/utils/process-lifecycle.ts_
  - _Requirements: REQ-TIMEOUT-004, REQ-TIMEOUT-006_

- [x] 10. Migrate mcp-over-http.test.ts to use waitForServerReady
  - File: `tests/e2e/mcp-over-http.test.ts` (modify)
  - Import `waitForServerReady` from `../utils/index.js`
  - Replace `jest.setTimeout(15000)` with per-test safety net (optional)
  - Add explicit server readiness check where needed
  - Purpose: Eliminate fixed startup delay in MCP HTTP tests
  - _Leverage: tests/utils/server-ready.ts_
  - _Requirements: REQ-TIMEOUT-001, REQ-TIMEOUT-006_

### Phase 3: Validation

- [x] 11. Run all E2E tests and verify improvements
  - Files: All `tests/e2e/*.test.ts`
  - Run `npm test -- --testPathPattern=e2e`
  - Verify all tests pass
  - Confirm no fixed `setTimeout()` delays remain (grep for verification)
  - Measure and compare execution times
  - Purpose: Validate migration success and performance improvement
  - _Requirements: REQ-TIMEOUT-006_

## Dependency Graph

```
Task 1 → Task 2 → Task 5
Task 3 → Task 4 → Task 5
Task 5 → Tasks 6-10
Tasks 6-10 → Task 11
```

## Success Criteria

- [ ] All E2E tests pass (`npm test -- --testPathPattern=e2e`)
- [ ] No fixed `setTimeout()` delays in test files (grep verification)
- [ ] `jest.setTimeout()` only used as safety net (maxTimeout)
- [ ] Tests proceed immediately after event detection (log verification)
