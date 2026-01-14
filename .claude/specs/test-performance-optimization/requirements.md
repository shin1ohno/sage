# Requirements Document: Test Performance Optimization

## Introduction

sageプロジェクトのテスト実行パフォーマンスを改善する。現在、96個のテストファイルの実行に過大なCPU/メモリ負荷と時間がかかっている。6つの改善施策を順次適用し、各施策の効果を定量的に測定・比較する。

## Alignment with Product Vision

tech.mdに記載されている以下の目標に直接貢献する：
- **Test Time**: < 30 seconds (full suite) ← 現状は大幅に超過
- **Build Time**: < 10 seconds

現状の問題：
- 小さなテストファイル1つでも35-36秒かかる
- ts-jest + ESM変換のオーバーヘッドが主因
- googlepaisパッケージ（109MB）のロードコスト

## Requirements

### Requirement 1: ベースライン測定

**User Story:** As a developer, I want to measure current test performance metrics, so that I can compare improvements quantitatively.

#### Acceptance Criteria

1. WHEN running `npm run test` THEN the system SHALL record total execution time, CPU usage, and memory peak
2. WHEN measurement is complete THEN the system SHALL store results in a structured format for comparison
3. IF multiple runs are performed THEN the system SHALL calculate average and standard deviation

### Requirement 2: isolatedModules有効化

**User Story:** As a developer, I want to enable isolatedModules in ts-jest, so that TypeScript type checking is skipped during transformation for faster execution.

#### Acceptance Criteria

1. WHEN `isolatedModules: true` is set in jest.config.js THEN ts-jest SHALL skip type checking during transformation
2. WHEN tests are run THEN the system SHALL complete faster than baseline
3. IF isolatedModules breaks tests THEN the system SHALL document the failure and revert

### Requirement 3: maxWorkers調整

**User Story:** As a developer, I want to optimize Jest worker count, so that parallel execution overhead is reduced.

#### Acceptance Criteria

1. WHEN `maxWorkers` is set to 50% THEN Jest SHALL use half of available CPU cores
2. WHEN `maxWorkers` is set to 2 THEN Jest SHALL use exactly 2 workers
3. IF reduced workers improve performance THEN the system SHALL adopt the optimal setting
4. WHEN comparing serial vs parallel THEN the system SHALL measure both `--runInBand` and default parallel modes

### Requirement 4: グローバルセットアップ活用

**User Story:** As a developer, I want to centralize common mocks in setupFilesAfterEnv, so that each test file doesn't repeat mock initialization.

#### Acceptance Criteria

1. WHEN common mocks (googleapis, run-applescript) are moved to setup file THEN individual test files SHALL not need to define them
2. WHEN tests are run THEN the mock setup time SHALL be reduced
3. IF global setup breaks test isolation THEN the system SHALL document the issue and provide workaround

### Requirement 5: @swc/jest移行

**User Story:** As a developer, I want to replace ts-jest with @swc/jest, so that TypeScript transformation is 5-10x faster.

#### Acceptance Criteria

1. WHEN @swc/jest is configured THEN all existing tests SHALL pass without modification
2. WHEN tests are run with @swc/jest THEN transformation time SHALL be significantly reduced
3. IF @swc/jest has compatibility issues THEN the system SHALL document specific failures
4. WHEN ESM modules need transformation THEN @swc/jest SHALL handle transformIgnorePatterns correctly

### Requirement 6: テストファイル分割

**User Story:** As a developer, I want to split large test files into smaller ones, so that parallel execution is more efficient.

#### Acceptance Criteria

1. WHEN google-calendar-service.test.ts (3384 lines) is split THEN each resulting file SHALL have fewer than 500 lines
2. WHEN split files are run THEN total test count SHALL remain the same
3. IF file splitting improves parallel execution THEN the system SHALL document the improvement

### Requirement 7: Vitest移行

**User Story:** As a developer, I want to migrate from Jest to Vitest, so that ESM support is native and overall performance is improved.

#### Acceptance Criteria

1. WHEN Vitest is configured THEN all existing tests SHALL pass with minimal modification
2. WHEN tests are run with Vitest THEN execution time SHALL be significantly reduced
3. IF Vitest migration requires test modifications THEN the system SHALL document required changes
4. WHEN ESM modules are imported THEN Vitest SHALL handle them natively without transformIgnorePatterns

### Requirement 8: 結果レポート

**User Story:** As a developer, I want a comprehensive comparison report, so that I can make informed decisions about which optimizations to adopt.

#### Acceptance Criteria

1. WHEN all optimizations are tested THEN the system SHALL produce a comparison table
2. WHEN comparing metrics THEN the table SHALL include: execution time, CPU usage, memory peak, improvement percentage
3. IF some optimizations conflict THEN the system SHALL note compatibility issues

## Non-Functional Requirements

### Performance
- 各測定は3回実行し、平均値を採用する
- 測定前にJestキャッシュをクリアして公平性を確保する
- CPU/メモリ測定には `/usr/bin/time -v` または同等のツールを使用する

### Reliability
- 各施策適用前に現在の設定をバックアップする
- 施策が失敗した場合は元の設定に戻せること
- 測定結果はSESSION_PROGRESS.mdに記録する

### Compatibility
- 既存のCI/CDパイプラインとの互換性を維持する
- GitHub Actionsでのテスト実行に影響を与えないこと
