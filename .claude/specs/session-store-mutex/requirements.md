# Requirements Document: Session Store Mutex

## Introduction

This feature addresses race conditions in the OAuth persistent stores (`PersistentSessionStore`, `PersistentRefreshTokenStore`, `PersistentClientStore`) that cause ENOENT errors during concurrent file write operations. The issue manifests when multiple save operations execute simultaneously, leading to temp file conflicts in the atomic write pattern.

### Problem Analysis

The current implementation uses an atomic write pattern in `EncryptionService.encryptToFile()`:
1. Write encrypted data to `{filePath}.tmp`
2. Rename temp file to final path

When concurrent writes occur:
- Write A creates `file.tmp` and starts writing
- Write B also tries to create/write to `file.tmp`
- Write A finishes and renames `file.tmp` to `file.enc`
- Write B tries to rename `file.tmp` which no longer exists → **ENOENT error**

### Affected Components

| Store | Save Pattern | Issue |
|-------|--------------|-------|
| PersistentSessionStore | Fire-and-forget | Multiple rapid operations cause concurrent saves |
| PersistentRefreshTokenStore | Debounced (1s) | Multiple debounce windows can overlap |
| PersistentClientStore | Immediate | Concurrent registrations cause overlapping saves |

## Alignment with Product Vision

This feature supports Sage's reliability and production-readiness goals by:
- Ensuring OAuth data persistence is reliable across server restarts
- Eliminating intermittent test failures caused by race conditions
- Providing a robust foundation for multi-user OAuth session management

## Requirements

### Requirement 1: File Write Serialization (FR-1)

**User Story:** As a system administrator, I want OAuth data to be persisted reliably, so that user sessions survive server restarts without data corruption.

#### Acceptance Criteria

1. WHEN multiple save operations are requested concurrently THEN the system SHALL serialize them to execute one at a time
2. IF a save operation is in progress THEN subsequent save requests SHALL wait for completion before executing
3. WHEN a save operation completes THEN the system SHALL release the lock and allow pending saves to proceed
4. IF the waiting queue exceeds 10 pending operations OR wait time exceeds 5 seconds THEN the system SHALL log a warning (not block indefinitely)

### Requirement 2: Per-File Mutex Implementation (FR-2)

**User Story:** As a developer, I want each encrypted file to have its own mutex, so that writes to different files can proceed in parallel.

#### Acceptance Criteria

1. WHEN saving to different storage files THEN operations SHALL proceed independently without blocking each other
2. IF saving session data THEN only other session saves SHALL be blocked, not client or token saves
3. WHEN the EncryptionService is used THEN it SHALL provide a file-specific locking mechanism

### Requirement 3: Integration with Existing Stores (FR-3)

**User Story:** As a developer, I want the mutex to integrate seamlessly with existing persistent stores, so that no API changes are required for consumers.

#### Acceptance Criteria

1. WHEN integrating the mutex THEN the public API of PersistentSessionStore, PersistentRefreshTokenStore, and PersistentClientStore SHALL remain unchanged
2. IF a store calls saveToStorage THEN it SHALL automatically acquire and release the appropriate mutex
3. WHEN loadFromStorage is called THEN it SHALL also respect the mutex to prevent read-during-write issues

### Requirement 4: Graceful Shutdown Support (FR-4)

**User Story:** As a system operator, I want pending saves to complete during shutdown, so that no data is lost when stopping the server.

#### Acceptance Criteria

1. WHEN flush() is called THEN the system SHALL wait for any pending mutex operations to complete
2. IF shutdown occurs during a save THEN the system SHALL complete the current save before terminating
3. WHEN the mutex has queued operations THEN flush() SHALL process them in order

## Non-Functional Requirements

### Performance

- NFR-1: Mutex acquisition overhead SHALL be less than 1ms for uncontended locks
- NFR-2: Lock waiting time SHALL be logged if exceeding 100ms for debugging purposes
- NFR-3: The mutex implementation SHALL not introduce memory leaks for long-running processes

### Security

- NFR-4: The mutex SHALL not expose any sensitive OAuth data through error messages or logs
- NFR-5: Lock state SHALL not be accessible to external code beyond the EncryptionService

### Reliability

- NFR-6: The mutex SHALL prevent ENOENT errors that occurred in CI environments
- NFR-7: Deadlock scenarios SHALL be prevented through proper lock ordering
- NFR-8: If a mutex operation fails, the error SHALL be propagated to the caller (not silently ignored)

### Testability

- NFR-9: The mutex behavior SHALL be testable through concurrent operation tests
- NFR-10: Tests SHALL be able to verify that writes are properly serialized
