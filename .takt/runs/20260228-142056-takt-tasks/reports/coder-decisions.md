# 決定ログ

## 1. p-queue の動的 import による Jest ESM 互換性対応

- **背景**: `p-queue` v7+ は ESM-only パッケージであり、Jest + ts-jest 環境では静的 `import` でモジュール解決に失敗する。`transformIgnorePatterns` で `.js` ファイルを変換対象にしても ts-jest は `.js` を処理しないため解決しなかった。
- **検討した選択肢**:
  1. `transformIgnorePatterns` で ESM パッケージを変換対象に含める
  2. `PipelineScheduler.start()` 内で `const { default: PQueue } = await import('p-queue')` として動的 import する
  3. `p-queue` を使わず独自の並行制御を実装する
- **理由**: 選択肢2を採用。動的 import はランタイムでのみモジュール解決されるため、Jest の静的解析を回避できる。`postMeetingQueue` の型を `PQueue` クラスから nullable インターフェース `{ add: ...; size: number; pending: number } | null` に変更し、型レベルでの PQueue 依存も除去した。`transformIgnorePatterns` への追加も defense-in-depth として併用。

## 2. PipelineScheduler コンストラクタの未使用 WorkingCadenceService パラメータ

- **背景**: タスク仕様では `WorkingCadenceService` を `PipelineScheduler` に注入するが、現時点の実装では勤務時間判定機能が未使用。TypeScript の `noUnusedLocals` / `noUnusedParameters` でビルドエラーが発生した。
- **検討した選択肢**:
  1. `@ts-ignore` でエラーを抑制する
  2. クラスプロパティとして保持しダミー参照を追加する
  3. コンストラクタパラメータ名を `_workingCadenceService` にしてプロパティ保持しない
- **理由**: 選択肢3を採用。TypeScript は `_` プレフィックス付きパラメータを未使用でも許容する。コンストラクタシグネチャはタスク仕様を満たしつつ、不要なプロパティ宣言やダミーコードを避けられる。

## 3. PostMeetingProcessor.process() のシグネチャ変更

- **背景**: タスク仕様では `process(event, pollResult)` の2引数だが、実装では `transcript` と `notionNotes` を個別に受け取る3引数 `process(event, transcript, notionNotes)` になっていた。`PipelineScheduler` から呼び出す際に型エラーが発生した。
- **検討した選択肢**:
  1. `PostMeetingProcessor.process()` を `PollResult` オブジェクトを受け取るよう変更する
  2. 呼び出し側で `pollResult.transcript` と `pollResult.notionNotes` を展開して渡す
- **理由**: 選択肢2を採用。`PipelineScheduler.pollAndProcessPostMeeting()` で `process(event, pollResult.transcript, pollResult.notionNotes)` として呼び出すよう修正。明示的なパラメータの方が可読性が高く、既存の `PostMeetingProcessor` の実装を変更せずに済む。

## 4. テスト用 deadline の far-future 日付への変更

- **背景**: `BriefingGenerator` のテストで deadline を `2026-02-28T09:00:00Z` に固定していたが、システム時刻がこの日時を超えると `new Date() > deadline` が `true` となり、`status: 'sent'` を期待するテストが `status: 'skipped'` で失敗するようになった。
- **検討した選択肢**:
  1. `jest.useFakeTimers()` で全テストの時刻を固定する
  2. deadline を `2099-12-31T23:59:59Z` のような十分に未来の日付に変更する
  3. deadline を `Date.now() + 3600000` のような相対値にする
- **理由**: 選択肢2を採用。`jest.useFakeTimers()` は全テストに波及する副作用があり設定が煩雑になる。far-future の固定日付は意図が明確で、テストの可読性を損なわずに時刻依存のフレーキネスを排除できる。

## 5. channel-discovery テストの mock リセット方式

- **背景**: `jest.clearAllMocks()` はモック呼び出し履歴のみクリアし、`mockReturnValue` で設定した戻り値はリセットしない。「cache hit」テストで `getChannelMapping.mockReturnValue(['C_CACHED'])` を設定した後、後続の LLM inference テスト等でもキャッシュヒットして失敗していた。
- **検討した選択肢**:
  1. `jest.resetAllMocks()` に変更する（全実装がリセットされるため、宣言時のデフォルト値も消える）
  2. `beforeEach` 内で各モックのデフォルト戻り値を明示的に再設定する
  3. テストの実行順序を変更してリーク影響を回避する
- **理由**: 選択肢2を採用。`beforeEach` 内で `mockStateStore.getChannelMapping.mockReturnValue(null)` 等を明示的に設定することで、テスト間の状態リークを防止。`resetAllMocks` はトップレベルで設定したデフォルト値も消去するため、全モックの再設定が必要になり冗長。明示的リセットは各テストの前提条件が読みやすい。