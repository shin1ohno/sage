# Requirements Document

## Introduction

E2E テストおよび CLI テストにおいて、サーバーの起動/停止や子プロセスの状態検知を固定タイムアウトではなくイベントベースの検知に改善する。これにより、テストの信頼性向上と実行時間の短縮を実現する。

## Alignment with Product Vision

- **品質向上**: CI/CD パイプラインでのテスト失敗を減少させ、開発サイクルを高速化
- **保守性向上**: タイムアウト値の調整が不要になり、環境依存性を削減
- **tech.md 準拠**: Jest テストフレームワークの適切な使用パターンを確立

## Requirements

### Requirement 1: Server Startup Detection [REQ-TIMEOUT-001]

**User Story:** As a developer, I want tests to detect server readiness via events, so that tests are reliable regardless of system load.

#### Acceptance Criteria

1. WHEN `HTTPServerWithConfig.start()` is called THEN the Promise SHALL resolve only after the server is accepting connections
2. IF server startup fails THEN the Promise SHALL reject with a descriptive error
3. WHEN waiting for server readiness THEN the test SHALL poll `GET /health` endpoint instead of using fixed timeout
4. IF `GET /health` endpoint returns HTTP 200 THEN server SHALL be considered ready
5. WHEN server is ready THEN test execution SHALL proceed immediately without additional delay

### Requirement 2: Server Shutdown Detection [REQ-TIMEOUT-002]

**User Story:** As a developer, I want tests to detect server shutdown completion, so that port conflicts are avoided between tests.

#### Acceptance Criteria

1. WHEN `HTTPServerWithConfig.stop()` is called THEN the Promise SHALL resolve only after all connections are closed
2. IF the server has active SSE connections THEN stop() SHALL close them gracefully before resolving
3. WHEN server is stopped THEN the port SHALL be immediately available for reuse
4. IF stop() times out (maximum 5s) THEN it SHALL force-close connections and resolve

### Requirement 3: CLI Process Startup Detection [REQ-TIMEOUT-003]

**User Story:** As a developer, I want CLI tests to detect process readiness via output parsing, so that tests are deterministic and responsive.

#### Acceptance Criteria

1. WHEN spawning CLI process THEN test SHALL wait for specific ready indicator in stdout/stderr
2. IF ready indicator matches pattern `/started in HTTP mode/` THEN process SHALL be considered ready
3. WHEN ready indicator is detected THEN test execution SHALL proceed immediately
4. IF ready indicator is not detected within 30s THEN test SHALL fail with timeout error
5. WHEN process emits error event THEN test SHALL fail immediately with the error

### Requirement 4: CLI Process Termination Detection [REQ-TIMEOUT-004]

**User Story:** As a developer, I want CLI tests to detect process termination via exit events, so that cleanup is reliable.

#### Acceptance Criteria

1. WHEN SIGINT is sent to process THEN test SHALL wait for 'close' event before proceeding
2. IF process exit code is 0 THEN shutdown SHALL be considered successful
3. IF process exit code is non-zero THEN test SHALL receive the exit code for assertion
4. WHEN 'close' event is received THEN any cleanup SHALL proceed immediately
5. IF process doesn't exit within 10s after SIGINT THEN SIGKILL SHALL be sent

### Requirement 5: Test Utilities [REQ-TIMEOUT-005]

**User Story:** As a developer, I want reusable test utilities for server/process lifecycle management, so that test code is DRY.

#### Acceptance Criteria

1. WHEN `waitForServerReady(url, options)` is called THEN it SHALL poll the URL until success or timeout
2. IF polling succeeds THEN Promise SHALL resolve with response time in milliseconds
3. WHEN `waitForProcessOutput(proc, pattern, options)` is called THEN it SHALL resolve when pattern matches
4. IF pattern matches THEN Promise SHALL resolve with the matched output string
5. WHEN utilities are used THEN they SHALL support configurable timeout as maximum bound (not delay)

### Requirement 6: Test Migration [REQ-TIMEOUT-006]

**User Story:** As a developer, I want existing tests to use the new event-based patterns, so that test reliability is improved.

#### Acceptance Criteria

1. WHEN `remote-auth.test.ts` is updated THEN it SHALL use `waitForServerReady()` utility
2. WHEN `cli-modes.test.ts` is updated THEN it SHALL use `waitForProcessOutput()` utility
3. WHEN `mcp-over-http.test.ts` is updated THEN it SHALL use event-based detection
4. IF jest.setTimeout() is still needed THEN it SHALL be set to maximum bound only (safety net)
5. WHEN tests pass THEN average execution time SHALL be reduced compared to fixed timeout approach

## Non-Functional Requirements

### Performance
- Server readiness detection SHALL complete within 100ms after server is accepting connections
- Polling interval SHALL be configurable with default of 50ms
- Maximum timeout SHALL be 30s for CI environment safety

### Security
- Test utilities SHALL bind to localhost (127.0.0.1) only
- Test servers SHALL use ephemeral ports to avoid conflicts
- No sensitive data SHALL be logged during test execution

### Reliability
- Flaky test rate SHALL be 0% (eliminate fixed timeout failures)
- Port conflicts SHALL be 0 (proper shutdown detection)

### Usability
- Error messages SHALL include specific failure reason (e.g., "Server not ready after 30s: connection refused")
- Debug output SHALL be available via `DEBUG=test:*` environment variable
- Utilities SHALL provide clear JSDoc documentation

### Maintainability
- Utility functions SHALL be placed in `tests/utils/` for reuse
- Each utility SHALL have JSDoc comments with usage examples

### Compatibility
- Node.js: 18+ (EventEmitter, ChildProcess API)
- Jest: 29+ (async/await support)
- Existing tests: backward compatible (gradual migration possible)
