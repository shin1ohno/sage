# アーキテクチャレビュー

## 結果: REJECT

## サマリー
Meeting Intelligence Pipeline の大規模追加。全体設計は良好だが、2件のブロッキング問題を検出。`DailySummaryService` が `ConfigLoader.load()` を直接呼び出しDIパターンに違反、`PipelineStateStore` のステータス設定メソッドが enum 型でなく `string` を受け入れ型安全性を損なっている。

## 確認した観点
- [x] 構造・設計
- [x] コード品質
- [x] 変更スコープ
- [x] テストカバレッジ
- [x] デッドコード
- [x] 呼び出しチェーン検証

## 今回の指摘（new）

| # | finding_id | スコープ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | ARCH-016 | スコープ内 | `src/services/daily-summary-service.ts:48` | `ConfigLoader.load()` を直接呼び出しDIパターン違反。パイプライン内の他全サービスはコンストラクタ経由で設定を受け取るが、このサービスだけ設定ファイルを直接読み込む。隠れた依存＋毎ポーリング不要ファイルI/O | `workingHoursEnd: string` をコンストラクタパラメータで受け取る。`PipelineScheduler` 側で `new DailySummaryService(slackService, config.workingHoursEnd)` のように渡す |
| 2 | ARCH-019 | スコープ内 | `src/services/pipeline-state-store.ts:109,123` | `setBriefingStatus` / `setPostMeetingStatus` の `status` パラメータが `string` 型。Zodスキーマでは enum だが任意文字列を受け入れ、`as MeetingProcessingState['briefing']` キャストで型チェック回避。不正値が `save()` で永続化されると次回 `load()` でスキーマ検証失敗→ステート全消失 | パラメータ型を `Partial<MeetingProcessingState['briefing']> & Pick<MeetingProcessingState['briefing'], 'status'>` に変更し `as` キャスト除去。`setPostMeetingStatus` も同様 |

## 解消済み（resolved）

| finding_id | 解消根拠 |
|------------|----------|
| ARCH-007 | `src/utils/html.ts` に `escapeHtml` 抽出済み。`tests/unit/slack-oauth-callback.test.ts:10` で import に置換。ローカル定義 0 件（grep 確認済み） |

## REJECT判定条件
- ARCH-016（new）: 新規ファイルで導入されたDIパターン違反。修正は2分程度
- ARCH-019（new）: 新規ファイルで導入された型安全性の欠落。修正は2分程度