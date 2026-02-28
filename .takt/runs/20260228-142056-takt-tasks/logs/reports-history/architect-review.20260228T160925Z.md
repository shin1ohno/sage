# アーキテクチャレビュー

## 結果: REJECT

## サマリー
Meeting Intelligence Pipeline の新規実装（ソース2,968行 + テスト2,225行）。設計方針は良好だが、ファイルサイズ超過2件・DRY違反2件・資格情報の二重経路1件がブロッキング。

## 確認した観点
- [x] 構造・設計
- [x] コード品質
- [x] 変更スコープ（Large: ~5,363行、論理的にまとまっている）
- [x] テストカバレッジ（17ファイル/129テスト、新規振る舞いに対するカバレッジあり）
- [x] デッドコード
- [x] 呼び出しチェーン検証

## 今回の指摘（new）

| # | finding_id | スコープ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | ARCH-001 | スコープ内 | `src/services/pipeline-scheduler.ts`（395行） | 300行超過。ライフサイクル管理・会議フィルタリング・日次サマリー・エラーハンドリング等6責務が混在 | `MeetingFilter`（`shouldProcessMeeting`+`matchesExcludePattern`, L170-214）と `DailySummaryService`（`checkDailySummary`, L320-355）を別ファイルに抽出。`handleCriticalError`もエラーハンドラーに抽出すれば300行以下に収まる |
| 2 | ARCH-002 | スコープ内 | `src/services/post-meeting-processor.ts`（415行） | 300行超過。ポーリング・LLMパース・アクションアイテム構築・アサイニー解決の4責務が混在 | `ActionItemBuilder`（`buildActionItem`+`resolveAssigneeEmail`, L352-414）を `src/services/action-item-builder.ts` に抽出。JSON抽出はARCH-004と合わせてユーティリティ化 |
| 3 | ARCH-003 | スコープ内 | `src/utils/slack-blocks.ts:84-101, 106-123` | `formatBriefing`と`formatPostMeetingReport`が絵文字（`📋`vs`📝`）以外完全同一のDRY違反 | 共通関数 `formatMessageBlocks(emoji, title, time, content, sourceLinks)` を抽出し、両関数はそれを呼ぶだけにする |
| 4 | ARCH-004 | スコープ内 | `src/services/post-meeting-processor.ts:294, 338` | markdownコードブロックからJSON抽出するパターン（regex→parse→catch fallback）が同一ファイル内2箇所に重複 | `extractJsonFromLlmResponse(text): unknown` を `src/utils/llm-response-parser.ts` に抽出。`channel-discovery.ts`のJSONパースも将来統合可能 |
| 5 | ARCH-005 | スコープ内 | `src/cli/http-server-with-config.ts:227-232` + `src/services/reloadable/slack-service-adapter.ts:25-26` | Slack資格情報が環境変数（HTTPサーバー）とconfig（アダプター）の二重経路。`SlackIntegrationConfigSchema`のデフォルトは`clientId: undefined`のため、アダプター経由の`createSlackService`は常に失敗→SlackService=null→パイプライン全体が起動不能 | `createSlackService`で`process.env.SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`にフォールバック（Google OAuthパターンに統一）。`SlackIntegrationConfig`からsecretフィールドを削除し環境変数を唯一のソースにする |

## 継続指摘（persists）
なし（初回レビュー）

## 解消済み（resolved）
なし（初回レビュー）

## REJECT判定条件
- `new` が5件（ARCH-001〜ARCH-005）→ REJECT