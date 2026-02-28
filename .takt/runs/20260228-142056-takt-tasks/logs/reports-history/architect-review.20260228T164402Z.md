# アーキテクチャレビュー

## 結果: REJECT

## サマリー
前回の2件（ARCH-002, ARCH-006）は全て解消済み。今回の変更で`escapeHtml`関数の3箇所目の重複コピーが導入された（ARCH-007）。

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
| 1 | ARCH-007 | スコープ内 | `src/cli/http-server-with-config.ts:110-117` | `escapeHtml()`が今回の変更で新たに追加されたが、同一の実装が`src/oauth/google-oauth-callback-handler.ts:341-348`と`src/oauth/oauth-handler.ts:680-687`にも存在する（計3箇所、全て同一ロジック）。DRY違反 | `src/utils/html.ts`に`export function escapeHtml(text: string): string`を作成し、`http-server-with-config.ts`ではそれをインポートする。他2ファイル（変更対象外）は今回スコープ外 |

## 解消済み（resolved）

| finding_id | 解消根拠 |
|------------|----------|
| ARCH-001 | `pipeline-scheduler.ts` 289行。抽出済みモジュール3件が正常にインポート・使用確認 |
| ARCH-002 | `post-meeting-processor.ts` 286行（`wc -l`で確認、300行以下）。`parseExtractResponse()`→`llm-response-parser.ts`、`deduplicateActionItems()`→`action-item-builder.ts`に移動完了 |
| ARCH-003 | `slack-blocks.ts`に`formatMessageBlocks()`共通関数導入済み |
| ARCH-004 | `extractJsonFromLlmResponse()`を`llm-response-parser.ts`に集約済み |
| ARCH-005 | `SlackIntegrationConfigSchema`は`enabled`のみ、環境変数は`process.env`から直接取得 |
| ARCH-006 | `pendingSlackStates`・`createSlackOAuthState()`・state検証ブロック削除済み（grep 0件で確認）。`SlackOAuthHandler`による正しい実装に置換 |

## REJECT判定条件
- `new`: ARCH-007（`escapeHtml` DRY違反 — 今回の変更で3箇所目の重複コピーを導入）