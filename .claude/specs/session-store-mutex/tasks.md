# Implementation Plan: Session Store Mutex

## Task Overview

This implementation adds a file-level mutex to the `EncryptionService` to prevent race conditions during concurrent encrypted file operations. The implementation follows a bottom-up approach: first creating the mutex utility, then integrating it into the encryption service, and finally validating with tests.

## Steering Document Compliance

- **structure.md**: New files placed in `src/oauth/` alongside existing encryption service
- **tech.md**: Pure TypeScript implementation, no external dependencies, proper error handling

## Atomic Task Requirements

**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

## Tasks

- [x] 1. Create FileMutex class with core interfaces
  - File: `src/oauth/file-mutex.ts` (new)
  - Define `FileMutexMetrics` interface for monitoring
  - Define internal `MutexState` interface
  - Implement `FileMutex` class with `withLock<T>()` method
  - Include path normalization for consistent lock identification
  - Purpose: Provide core mutex functionality for file operations
  - _Leverage: None (new standalone utility)_
  - _Requirements: FR-1, FR-2, NFR-1_

- [x] 2. Add metrics tracking and warning logs to FileMutex
  - File: `src/oauth/file-mutex.ts` (continue from task 1)
  - Implement `getMetrics()` method returning `FileMutexMetrics`
  - Add queue depth warning when > 10 pending operations
  - Add wait time warning when > 5 seconds
  - Add debug logging for > 100ms wait times
  - Purpose: Enable monitoring and debugging of mutex performance
  - _Leverage: `src/oauth/file-mutex.ts` from task 1_
  - _Requirements: FR-1 AC-4, NFR-2, NFR-3_

- [x] 3. Create FileMutex unit tests - basic functionality
  - File: `tests/unit/oauth/file-mutex.test.ts` (new)
  - Test single operation acquires and releases lock
  - Test sequential operations execute in order
  - Test lock is released even when operation throws error
  - Test error propagates to caller correctly
  - Purpose: Validate core mutex behavior
  - _Leverage: `src/oauth/file-mutex.ts`, existing test patterns in `tests/unit/oauth/`_
  - _Requirements: NFR-8, NFR-9_

- [x] 4. Create FileMutex unit tests - concurrency
  - File: `tests/unit/oauth/file-mutex.test.ts` (continue from task 3)
  - Test multiple concurrent operations on same file serialize correctly
  - Test operations on different files execute in parallel
  - Test metrics are tracked accurately (wait times, queue depth)
  - Test queue warnings trigger at correct threshold
  - Purpose: Validate concurrent operation handling
  - _Leverage: `tests/unit/oauth/file-mutex.test.ts` from task 3_
  - _Requirements: FR-1, FR-2, NFR-9, NFR-10_

- [x] 5. Integrate FileMutex into EncryptionService
  - File: `src/oauth/encryption-service.ts` (modify)
  - Add `private fileMutex: FileMutex` instance
  - Wrap `encryptToFile()` body with `this.fileMutex.withLock()`
  - Wrap `decryptFromFile()` body with `this.fileMutex.withLock()`
  - Add import for FileMutex
  - Purpose: Serialize file operations transparently
  - _Leverage: `src/oauth/file-mutex.ts`, `src/oauth/encryption-service.ts`_
  - _Requirements: FR-3, NFR-6_

- [x] 6. Add mutex metrics to EncryptionService health status
  - File: `src/oauth/encryption-service.ts` (continue from task 5)
  - Extend `getHealthStatus()` to include mutex metrics
  - Add `getMutexMetrics()` method for direct access
  - Purpose: Expose mutex state for monitoring
  - _Leverage: `src/oauth/encryption-service.ts` from task 5_
  - _Requirements: NFR-2_

- [x] 7. Update EncryptionService unit tests for mutex behavior
  - File: `tests/unit/encryption-service.test.ts` (modify existing)
  - Add test for concurrent `encryptToFile()` calls don't cause ENOENT
  - Add test for health status includes mutex metrics
  - Purpose: Validate mutex integration doesn't break existing functionality
  - _Leverage: `tests/unit/encryption-service.test.ts`_
  - _Requirements: FR-3, NFR-6_

- [x] 8. Add concurrent operation integration test
  - File: `tests/integration/oauth-persistence.test.ts` (modify existing)
  - Add test: create 10 sessions concurrently, all persist without error
  - Add test: concurrent create/read/delete operations complete without race conditions
  - Remove or reduce artificial delays that were workarounds for race conditions
  - Purpose: Validate end-to-end mutex behavior in realistic scenarios
  - _Leverage: `tests/integration/oauth-persistence.test.ts`_
  - _Requirements: FR-1, NFR-6, NFR-10_

- [x] 9. Add waitForPending method to FileMutex for graceful shutdown
  - File: `src/oauth/file-mutex.ts` (modify)
  - Add `waitForPending(): Promise<void>` method that resolves when all queued operations complete
  - Add `hasPendingOperations(): boolean` method to check queue status
  - Purpose: Support graceful shutdown by allowing callers to wait for pending operations
  - _Leverage: `src/oauth/file-mutex.ts`_
  - _Requirements: FR-4_

- [x] 10. Integrate waitForPending into EncryptionService
  - File: `src/oauth/encryption-service.ts` (modify)
  - Add `waitForPendingWrites(): Promise<void>` method calling `fileMutex.waitForPending()`
  - Purpose: Expose graceful shutdown capability to persistent stores
  - _Leverage: `src/oauth/encryption-service.ts`, `src/oauth/file-mutex.ts`_
  - _Requirements: FR-4_

- [x] 11. Export FileMutex from oauth module index
  - File: `src/oauth/index.ts` (modify)
  - Add export for `FileMutex` class
  - Add export for `FileMutexMetrics` interface
  - Purpose: Make mutex available for potential external use
  - _Leverage: `src/oauth/index.ts`_
  - _Requirements: FR-3_

## Task Dependencies

```
Task 1 → Task 2 → Task 5 → Task 6
    ↓       ↓         ↓
Task 3 → Task 4    Task 9 → Task 10
    ↓
Task 7 → Task 8 → Task 11
```

**Parallel paths:**
- Path A: Tasks 1 → 2 → 5 → 6 → 9 → 10 (core implementation + graceful shutdown)
- Path B: Tasks 1 → 3 → 4 → 7 → 8 (testing)
- Task 11: Can run after Task 1 (just exports)

## Completion Criteria

- All unit tests pass (`npm test`)
- No ENOENT errors in concurrent operation tests
- Build succeeds (`npm run build`)
- Existing OAuth persistence tests continue to pass
