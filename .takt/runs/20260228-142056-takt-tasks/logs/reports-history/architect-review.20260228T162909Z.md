# アーキテクチャレビュー

## 結果: REJECT

## サマリー
前回5件中4件は解消済み。ARCH-002（post-meeting-processor.ts 300行超過）は345行で残存。SEC-002修正で導入された `createSlackOAuthState()` が未接続デッドコード（ARCH-006）。

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
| 1 | ARCH-006 | スコープ内 | `src/cli/http-server-with-config.ts:143,859-864,885-906` | `createSlackOAuthState()`がプロダクションコードから一切呼ばれない。`pendingSlackStates` Mapは常に空で、`handleSlackOAuthCallback`のstate検証は常に"Invalid state parameter"で拒否。`HTTPServerWithConfig`インターフェースにも含まれず外部からもアクセス不可 | L143(`pendingSlackStates`宣言)、L859-864(`createSlackOAuthState`メソッド)、L885-906(callback内state検証ブロック)を削除。callbackは`code`/`error`検証のみにする。OAuth開始エンドポイント追加時にCSRF保護を一緒に実装 |

## 継続指摘（persists）

| # | finding_id | 前回根拠 | 今回根拠 | 問題 | 修正案 |
|---|------------|----------|----------|------|--------|
| 1 | ARCH-002 | `src/services/post-meeting-processor.ts`(415行) | `src/services/post-meeting-processor.ts`(345行、300行制限超過) | `buildActionItem`抽出で415→345行に縮小したが不十分。前回と異なるアプローチ: (1) `parseExtractResponse()`(L290-311, 22行)を`src/utils/llm-response-parser.ts`に移動（既に`extractJsonFromLlmResponse`を使用しており同一責務）、(2) `deduplicateActionItems()`(L316-343, 28行)を`src/services/action-item-builder.ts`に移動（`SamplingService`と`PromptTemplateManager`を引数で受け取る形に）。合計~50行抽出で~295行、300行以下を達成 | 左記2関数を既存の関連モジュールへ移動 |

## 解消済み（resolved）

| finding_id | 解消根拠 |
|------------|----------|
| ARCH-001 | `pipeline-scheduler.ts` 289行。`meeting-filter.ts`/`daily-summary-service.ts`/`pipeline-critical-error-handler.ts`に抽出済み、全て正常にインポート・使用確認 |
| ARCH-003 | `slack-blocks.ts`に`formatMessageBlocks()`共通関数を導入、`formatBriefing`/`formatPostMeetingReport`はラッパーに統合済み |
| ARCH-004 | `extractJsonFromLlmResponse()`を`llm-response-parser.ts`に集約、`post-meeting-processor.ts` L296,L337で使用確認 |
| ARCH-005 | `SlackIntegrationConfigSchema`は`enabled`のみ。`slack-service-adapter.ts`/`http-server-with-config.ts`とも`process.env`から取得、二重経路解消 |

## REJECT判定条件
- `persists`: ARCH-002（345行 > 300行制限）
- `new`: ARCH-006（`createSlackOAuthState` + `pendingSlackStates` デッドコード）