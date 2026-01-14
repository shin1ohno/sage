# Implementation Plan: Test Performance Optimization

## Task Overview

6つのテストパフォーマンス改善施策を順次実行し、各施策の効果を定量的に測定する。各施策は独立して測定し、最終的に比較レポートを作成する。

## Steering Document Compliance

- **structure.md**: tests/ ディレクトリ構造を維持、jest.config.js の命名規則に従う
- **tech.md**: Test Time < 30 seconds を目標、既存のカバレッジ閾値を維持

## Tasks

### Phase 0: ベースライン測定

- [ ] 0.1. 測定スクリプトを作成
  - File: scripts/measure-test-performance.sh
  - /usr/bin/time -v を使用してCPU/メモリを測定
  - 結果をJSON形式で出力
  - Purpose: 一貫した測定方法を確立
  - _Requirements: 1.1, 1.2_

- [ ] 0.2. ベースライン測定を実行（3回）
  - Command: `npm run test` を3回実行
  - 結果を results/baseline.json に保存
  - Purpose: 改善前の基準値を記録
  - _Requirements: 1.1, 1.3_

### Phase 1: isolatedModules有効化

- [ ] 1.1. jest.config.js にisolatedModules設定を追加
  - File: jest.config.js
  - ts-jest の tsconfig に `isolatedModules: true` を追加
  - Purpose: 型チェックをスキップしてトランスフォーム高速化
  - _Leverage: jest.config.js (既存設定)_
  - _Requirements: 2.1_

- [ ] 1.2. isolatedModules有効でテスト実行・測定
  - Command: `npm run test` を3回実行
  - 結果を results/isolated-modules.json に保存
  - Purpose: 型チェックスキップの効果を測定
  - _Requirements: 2.2, 2.3_

- [ ] 1.3. isolatedModules設定を元に戻す
  - File: jest.config.js
  - 次の施策測定のため設定をリセット
  - Purpose: 独立した測定を保証
  - _Requirements: 2.3_

### Phase 2: maxWorkers調整

- [ ] 2.1. maxWorkers=50% で測定
  - Command: `npm run test -- --maxWorkers=50%` を3回実行
  - 結果を results/max-workers-50.json に保存
  - Purpose: ワーカー数削減の効果を測定
  - _Requirements: 3.1_

- [ ] 2.2. maxWorkers=2 で測定
  - Command: `npm run test -- --maxWorkers=2` を3回実行
  - 結果を results/max-workers-2.json に保存
  - Purpose: 最小並列度の効果を測定
  - _Requirements: 3.2_

- [ ] 2.3. --runInBand（直列実行）で測定
  - Command: `npm run test -- --runInBand` を3回実行
  - 結果を results/run-in-band.json に保存
  - Purpose: 並列オーバーヘッド完全排除の効果を測定
  - _Requirements: 3.4_

### Phase 3: グローバルセットアップ活用

- [ ] 3.1. 共通モックを抽出してsetupファイルを作成
  - File: tests/setup-global-mocks.ts
  - googleapis, run-applescript のモックを一元化
  - Purpose: 各テストファイルでの重複モック定義を削減
  - _Leverage: tests/unit/google-calendar-service.test.ts (モック定義)_
  - _Requirements: 4.1_

- [ ] 3.2. jest.config.js にsetupFilesAfterEnvを追加
  - File: jest.config.js
  - `setupFilesAfterEnv: ['<rootDir>/tests/setup-global-mocks.ts']` を追加
  - Purpose: 全テストで共通セットアップを使用
  - _Requirements: 4.1_

- [ ] 3.3. 個別テストファイルからモック定義を削除
  - Files: tests/unit/*.test.ts (該当ファイル)
  - googleapis, run-applescript の jest.mock を削除
  - Purpose: 重複排除による起動時間短縮
  - _Requirements: 4.2_

- [ ] 3.4. グローバルセットアップ有効でテスト実行・測定
  - Command: `npm run test` を3回実行
  - 結果を results/global-setup.json に保存
  - Purpose: 共通モック一元化の効果を測定
  - _Requirements: 4.2, 4.3_

- [ ] 3.5. グローバルセットアップ変更を元に戻す
  - Files: jest.config.js, tests/setup-global-mocks.ts, tests/unit/*.test.ts
  - 全ての変更をリバート
  - Purpose: 次の施策測定のため設定をリセット
  - _Requirements: 4.3_

### Phase 4: @swc/jest移行

- [ ] 4.1. @swc/jestパッケージをインストール
  - Command: `npm install -D @swc/jest @swc/core`
  - Purpose: SWCベースのトランスフォーマーを導入
  - _Requirements: 5.1_

- [ ] 4.2. jest.config.js をSWC用に変更
  - File: jest.config.js
  - transformを `'^.+\\.(t|j)sx?$': ['@swc/jest']` に変更
  - presetを削除
  - Purpose: ts-jestからswc/jestへ切り替え
  - _Leverage: jest.config.js (既存設定)_
  - _Requirements: 5.1, 5.4_

- [ ] 4.3. @swc/jest有効でテスト実行・測定
  - Command: `npm run test` を3回実行
  - 結果を results/swc-jest.json に保存
  - Purpose: SWCトランスフォームの効果を測定
  - _Requirements: 5.2, 5.3_

- [ ] 4.4. @swc/jest変更を元に戻す
  - Files: jest.config.js, package.json
  - ts-jest設定に戻し、@swc/*をアンインストール
  - Purpose: 次の施策測定のため設定をリセット
  - _Requirements: 5.3_

### Phase 5: テストファイル分割

- [ ] 5.1. google-calendar-service.test.tsを分析して分割計画を作成
  - File: tests/unit/google-calendar-service.test.ts
  - describe ブロックごとに論理グループを特定
  - Purpose: 効果的な分割方法を決定
  - _Requirements: 6.1_

- [ ] 5.2. google-calendar-service-auth.test.ts を作成
  - File: tests/unit/google-calendar-service-auth.test.ts
  - 認証関連のdescribeブロックを移動
  - Purpose: 認証テストを独立ファイルに分離
  - _Leverage: tests/unit/google-calendar-service.test.ts_
  - _Requirements: 6.1, 6.2_

- [ ] 5.3. google-calendar-service-events.test.ts を作成
  - File: tests/unit/google-calendar-service-events.test.ts
  - イベント操作関連のdescribeブロックを移動
  - Purpose: イベントテストを独立ファイルに分離
  - _Leverage: tests/unit/google-calendar-service.test.ts_
  - _Requirements: 6.1, 6.2_

- [ ] 5.4. google-calendar-service-calendars.test.ts を作成
  - File: tests/unit/google-calendar-service-calendars.test.ts
  - カレンダー操作関連のdescribeブロックを移動
  - Purpose: カレンダーテストを独立ファイルに分離
  - _Leverage: tests/unit/google-calendar-service.test.ts_
  - _Requirements: 6.1, 6.2_

- [ ] 5.5. 分割後のテスト実行・測定
  - Command: `npm run test` を3回実行
  - 結果を results/file-split.json に保存
  - Purpose: ファイル分割による並列効率化の効果を測定
  - _Requirements: 6.2, 6.3_

- [ ] 5.6. 分割変更を元に戻す
  - Files: tests/unit/google-calendar-service*.test.ts
  - 分割ファイルを削除、元のファイルを復元
  - Purpose: 次の施策測定のため設定をリセット
  - _Requirements: 6.2_

### Phase 6: Vitest移行

- [ ] 6.1. Vitestパッケージをインストール
  - Command: `npm install -D vitest @vitest/coverage-v8`
  - Purpose: Vitestフレームワークを導入
  - _Requirements: 7.1_

- [ ] 6.2. vitest.config.ts を作成
  - File: vitest.config.ts
  - ESMネイティブ設定、カバレッジ閾値を移行
  - Purpose: Jest設定をVitest形式に変換
  - _Leverage: jest.config.js (既存設定)_
  - _Requirements: 7.1, 7.4_

- [ ] 6.3. package.json にVitestスクリプトを追加
  - File: package.json
  - `"test:vitest": "vitest run"` を追加
  - Purpose: Vitestでのテスト実行を可能にする
  - _Requirements: 7.1_

- [ ] 6.4. テストファイルのJest固有APIを修正
  - Files: tests/**/*.test.ts
  - jest.mock → vi.mock, jest.fn → vi.fn など
  - Purpose: Vitest APIへの互換性対応
  - _Requirements: 7.3_

- [ ] 6.5. Vitest有効でテスト実行・測定
  - Command: `npm run test:vitest` を3回実行
  - 結果を results/vitest.json に保存
  - Purpose: Vitestフレームワークの効果を測定
  - _Requirements: 7.2, 7.4_

- [ ] 6.6. Vitest変更を元に戻す
  - Files: vitest.config.ts, package.json, tests/**/*.test.ts
  - 全ての変更をリバート
  - Purpose: 元の状態に復元
  - _Requirements: 7.3_

### Phase 7: 結果レポート作成

- [ ] 7.1. 全測定結果を集計して比較表を作成
  - Input: results/*.json
  - Output: SESSION_PROGRESS.md に比較表を追加
  - Purpose: 全施策の効果を一覧で比較
  - _Requirements: 8.1, 8.2_

- [ ] 7.2. 推奨事項をまとめる
  - Input: 比較結果と互換性情報
  - Output: SESSION_PROGRESS.md に推奨事項を追加
  - Purpose: 採用すべき施策を明確にする
  - _Requirements: 8.3_
