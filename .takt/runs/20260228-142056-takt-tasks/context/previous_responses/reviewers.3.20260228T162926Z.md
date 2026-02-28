## arch-review
レビューに必要な全ファイルの確認が完了しました。以下がアーキテクチャレビューの結果です。

---

# アーキテクチャレビュー

## 結果: REJECT

## サマリー

前回の2件（ARCH-002, ARCH-006）は全て解消済み。しかし、今回の変更で`escapeHtml`関数の3箇所目の重複コピーが導入された（ARCH-007）。全体的なモジュール構成・責務分離・テストカバレッジは良好。

## 確認した観点

- [x] 構造・設計
- [x] コード品質
- [x] 変更スコープ
- [x] テストカバレッジ
- [x] デッドコード
- [x] 呼び出しチェーン検証
- [x] 契約文字列のハードコード散在

## 変更スコープ

- 変更行数: ~2,600行（新規18ファイル + 修正10ファイル）
- スコープサイズ: Large
- 変更は論理的にまとまっている（Meeting Intelligence Pipeline全体）
- 新規コンポーネント: services 9件、integrations 2件、utils 3件、types 2件、reloadable adapters 3件、OAuth handler 1件

## 今回の指摘（new）

| # | finding_id | スコープ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | ARCH-007 | 変更起因 | `src/cli/http-server-with-config.ts:110-117` | `escapeHtml()`が今回の変更で新たに追加されたが、同一の実装が`src/oauth/google-oauth-callback-handler.ts:341-348`と`src/oauth/oauth-handler.ts:680-687`にも存在する（計3箇所）。全て同じロジック（`&`, `<`, `>`, `"`, `'` のHTMLエンティティ置換）。DRY違反 | `src/utils/html.ts`に`export function escapeHtml(text: string): string`を作成し、`http-server-with-config.ts`ではそれをインポートする。他2ファイル（変更対象外）は今回のスコープ外として別途対応 |

## 解消済み（resolved）

| finding_id | 解消根拠 |
|------------|----------|
| ARCH-001 | `pipeline-scheduler.ts` 289行。`meeting-filter.ts`/`daily-summary-service.ts`/`pipeline-critical-error-handler.ts`に抽出済み |
| ARCH-002 | `post-meeting-processor.ts` 286行（`wc -l`で確認）。`parseExtractResponse()`を`llm-response-parser.ts`に、`deduplicateActionItems()`を`action-item-builder.ts`に移動完了 |
| ARCH-003 | `slack-blocks.ts`に`formatMessageBlocks()`共通関数を導入済み。`formatBriefing`/`formatPostMeetingReport`はラッパーとして機能 |
| ARCH-004 | `extractJsonFromLlmResponse()`を`llm-response-parser.ts`に集約済み。`action-item-builder.ts:14`と`llm-response-parser.ts:31`で使用確認 |
| ARCH-005 | `SlackIntegrationConfigSchema`は`enabled`のみ。環境変数は`process.env`から直接取得、二重経路なし |
| ARCH-006 | `pendingSlackStates`・`createSlackOAuthState()`・state検証ブロックが`http-server-with-config.ts`から削除済み（grepで確認: 0件）。代わりに`SlackOAuthHandler`クラスを使用する正しいCSRF保護を持つ実装に置き換え |

## 非ブロッキング（Warning / 提案）

| # | 種別 | 場所 | 問題 | 提案 |
|---|------|------|------|------|
| 1 | Warning | `src/cli/http-server-with-config.ts`（907行） | 300行制限を大幅超過。今回+70行追加でさらに増加 | 大規模リファクタリングが必要（ルートハンドラー分離、OAuth処理分離等）。今回のスコープ外だが、技術的負債として記録 |
| 2 | Warning | `src/types/google-calendar-types.ts:185,311` | `conferenceData`のインライン型定義が`GoogleCalendarEvent`と`CalendarEvent`で同一構造 | `ConferenceData`インターフェースを抽出して共有する案。ただしAPI型とアプリ型の意図的分離の可能性あり |
| 3 | Warning | `briefing-generator.ts`, `post-meeting-processor.ts`, `channel-discovery.ts`, `action-item-builder.ts` | `systemPrompt: 'You are a meeting intelligence assistant.'`と`maxTokens: 4096`が6箇所以上で繰り返し | 定数に抽出（例: `PIPELINE_SYSTEM_PROMPT`, `PIPELINE_MAX_TOKENS`）するか、`PromptTemplateManager`のデフォルトパラメータにする |

## 構造評価（ポジティブ）

- **モジュール分割**: 各サービスが単一責務（PipelineScheduler=オーケストレーション、BriefingGenerator=ブリーフィング生成、PostMeetingProcessor=後処理等）
- **依存方向**: services → integrations → types の方向が正しく守られている
- **DI パターン**: 全サービスがコンストラクタインジェクションで依存を受け取る
- **型安全**: Zodスキーマで設定検証、型推論で整合性を担保
- **テストカバレッジ**: 全18新規ファイルに対応するテストファイルが存在
- **Reloadableパターン**: 既存のアダプターパターンに準拠した3つの新規アダプター
- **ConfigLoader拡張**: `meetingIntelligence`と`integrations.slack`のマイグレーション追加に対応するテスト完備

## REJECT判定条件

- `new`: ARCH-007（`escapeHtml` DRY違反 — 今回の変更で3箇所目の重複コピーを導入）

---

## frontend-review
プロジェクトの構造を確認しました。

## 判定結果

**APPROVE** ✅

### 根拠

このプロジェクト（`@shin1ohno/sage`）は **MCP サーバー**（Claude Desktop / Claude Code 向けの AI タスク管理アシスタント）であり、**フロントエンドコードを含みません**。

確認した事実:
- `.tsx` / `.jsx` / `.vue` / `.svelte` ファイル: **なし**
- `src/` 配下の `.html` / `.css` ファイル: **なし**
- `package.json` のスクリプト: `tsc` によるビルド、`jest` によるテスト、`tsx` による開発実行のみ
- プロジェクトの性質: Node.js バックエンド（MCP サーバー + CLI ツール）

前回の修正内容（`http-server-with-config.ts`、`post-meeting-processor.ts`、`google-oauth-handler.ts`、各種ユーティリティ・テスト）も全てバックエンド/サーバーサイドのコードです。

フロントエンドの観点でレビューすべき対象がないため、**問題なし**として承認します。

---

## security-review
すべての確認が完了しました。セキュリティレビューの結果をまとめます。

---

# セキュリティレビュー

## 結果: REJECT

## 重大度: High

## チェック結果
| カテゴリ | 結果 | 備考 |
|---------|------|------|
| インジェクション (XSS) | ✅ | SEC-001 解消継続確認済み — `escapeHtml()` が行110-118に存在し、行866で適用 |
| 認証・認可 (CSRF) | ❌ | SEC-003 Slack OAuth CSRF 未対策 |
| データ保護 | ✅ | トークン暗号化保存（`EncryptionService` 使用）、ログに機密情報なし |
| 依存関係 | ✅ | `@slack/web-api ^7.14.1`, `htmlparser2 ^10.1.0`, `p-queue ^9.1.0` — メジャーパッケージ |
| 暗号化 | ✅ | `CodeChallengeMethod.S256` 使用、PKCE 適切 |

## ブロッキング問題

### SEC-003 — Slack OAuth コールバックに CSRF state パラメータ検証がない [new]

**場所**: `src/cli/http-server-with-config.ts:852-888` (`handleSlackOAuthCallback`)

**問題**: 今回のdiffで追加された `handleSlackOAuthCallback` メソッドが、OAuth コールバックの `state` パラメータを一切検証していない。

**事実確認**:
1. `SlackOAuthHandler.getAuthorizationUrl(state: string)` は state パラメータを受け取り認可URLに含める仕組みが実装済み (`src/oauth/slack-oauth-handler.ts:58-66`)
2. しかし `handleSlackOAuthCallback` は URL から `code` と `error` のみを読み取り、`state` を読み取っていない (`http-server-with-config.ts:860-861`)
3. state の生成・保存・照合メカニズムが存在しない（`pendingSlackStates` は grep で0件）
4. 同じコードベースの Google OAuth コールバック（`src/oauth/google-oauth-callback-handler.ts:71-97`）は state 検証を適切に実装している：
   - state の存在チェック (行71)
   - `pendingAuthStore.findByState(state)` でセッション照合 (行82)
   - ワンタイム消費 `pendingAuthStore.remove(state)` (行97)
5. 認可開始エンドポイント（`/oauth/slack/authorize` 等）も存在しない

**リスク**: OAuth CSRF 攻撃（RFC 6749 Section 10.12）。攻撃者が自身のSlackワークスペースの認可コードを含むコールバックURLを被害者に踏ませることで、攻撃者のSlackトークンを被害者のインスタンスに保存させることが可能。

**修正案**: Google OAuth コールバックハンドラーと同じパターンで state 検証を実装する：
1. 認可開始エンドポイント（例: `/oauth/slack/authorize`）を追加し、`crypto.randomUUID()` で state を生成、有効期限付きで保存、`slackOAuthHandler.getAuthorizationUrl(state)` を呼び出してリダイレクト
2. `handleSlackOAuthCallback` で `url.searchParams.get('state')` を読み取り、保存済み state と照合、不一致/欠落時は 400 を返す

```typescript
// handleSlackOAuthCallback に追加すべき検証:
const state = url.searchParams.get('state');
if (!state) {
  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Missing state parameter</h1>');
  return;
}
const session = this.pendingSlackAuthStore.findByState(state);
if (!session) {
  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Invalid or expired state</h1>');
  return;
}
this.pendingSlackAuthStore.remove(state);
```

## 解消済み（resolved）
| finding_id | 状態 | 解消根拠 |
|------------|------|----------|
| SEC-001 | resolved | `escapeHtml()` が `src/cli/http-server-with-config.ts:110-118` に存在。行866で `${escapeHtml(error)}` として適用。5文字(`&<>"'`)エスケープ確認 |
| SEC-002 | resolved | Google OAuth CSRF は `src/oauth/google-oauth-callback-handler.ts:71-97` で適切に実装済み。今回の変更に影響なし |

## 警告（非ブロッキング）
- `src/cli/http-server-with-config.ts:240` — Slack OAuth のデフォルト redirect URI が HTTP（`http://${this.effectiveHost}:${this.effectivePort}/oauth/slack/callback`）。本番環境では `SLACK_REDIRECT_URI` 環境変数で HTTPS を指定必須。Google OAuth（行253）にも同じパターンが存在（前回警告の継続）
- `src/oauth/google-oauth-handler.ts:53` — `drive.readonly` スコープが `GOOGLE_CALENDAR_SCOPES` に追加。Google Meet トランスクリプトマッチング用途で正当性はあるが、権限スコープの拡大。`google-drive-service.ts:42` でスコープ存在チェックが実装されているため実害リスクは低い

---

## qa-review
全てのファクトチェックが完了しました。レビュー結果をまとめます。

---

# QAレビュー

## 結果: REJECT

## サマリー

前回の6件の指摘（QA-007〜QA-012）は全て実コードで解消を確認。しかし、ARCH-002リファクタリングで `action-item-builder.ts` に移動された `deduplicateActionItems` 関数にテストが存在せず、また新規テストファイル内に `any` 型が残存しているため、REJECTとする。

## 確認した観点

| 観点 | 結果 | 備考 |
|------|------|------|
| テストカバレッジ | ❌ | `deduplicateActionItems`（action-item-builder.ts:94-123）にテストなし |
| テスト品質 | ⚠️ | `daily-summary-service.test.ts:75` に `as [any]` 型アサーション |
| エラーハンドリング | ✅ | 全新規ファイルでエラーをログ付きでハンドリング。空catchなし |
| ログとモニタリング | ✅ | 全新規ファイルで `createLogger()` を統一使用 |
| 保守性 | ✅ | リファクタリング後のファイルサイズ適切。TODO/FIXMEなし |

## 今回の指摘（new）

| # | finding_id | カテゴリ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | QA-013 | テストカバレッジ | `src/services/action-item-builder.ts:94-123` | 新規モジュールのエクスポート関数 `deduplicateActionItems` にテストが存在しない。`action-item-builder.test.ts` は `resolveAssigneeEmail` と `buildActionItem` のみカバー。`post-meeting-processor.test.ts:34` は `getActionItemsForRecurring` が常に `[]` を返すモックのため、L149 の `if (existingItems.length > 0)` 条件が真にならず dedup パスは一切通らない。関数はLLMレスポンスのJSONパース・フォールバック・配列フィルタリングを含む | `tests/unit/action-item-builder.test.ts` に `deduplicateActionItems` のテストを追加。最低限: (1) LLMが正常にunique配列を返す → その配列が返る (2) LLMレスポンスのJSONパースが失敗 → 元のnewItems全件が返る (3) samplingService がthrow → 元のnewItems全件が返る（`catch` ブロック L152-157 のフォールバック） |
| 2 | QA-014 | 型安全性 | `tests/unit/daily-summary-service.test.ts:74-75` | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `return new realDate(...(args as [any]))` — 新規テストファイル内の `any` 型使用。ポリシー「`any` 型の使用」→ REJECT | `as [any]` を `as [string]` に置き換え、`eslint-disable` コメントを削除。このテスト内での Date コンストラクタ呼び出しは文字列引数のみ（`'2026-03-01T10:00:00Z'`）。または `jest.useFakeTimers().setSystemTime(new Date('2026-03-01T10:00:00Z'))` でDateモック自体を簡素化する |

## 解消済み（resolved）

| finding_id | 解消根拠 |
|------------|----------|
| QA-007 | `tests/unit/meeting-filter.test.ts` が10テストケースで存在。regex（L60-66）、substring（L76-82）、calendarフィルタ（L92-98）、空excludePatterns（L108-112）をカバー |
| QA-008 | `tests/unit/daily-summary-service.test.ts` が4テストケースで存在。enabled=false（L47-50）、already-sent guard（L52-63）、就業時間前（L65-86）、就業時間後（L88-95）をカバー |
| QA-009 | `tests/unit/pipeline-critical-error-handler.test.ts` が5テストケースで存在。SlackTokenRevokedError（L25-29）、auth/scopeエラー（L31-41）、非クリティカルエラー（L43-47）、Slack送信失敗（L49-53）をカバー |
| QA-010 | `tests/unit/action-item-builder.test.ts` が10テストケースで存在。resolveAssigneeEmail（L24-46：5テスト）、buildActionItem（L48-116：5テスト）をカバー |
| QA-011 | `tests/unit/llm-response-parser.test.ts` が8テストケースで存在。extractJsonFromLlmResponse（L11-39：5テスト）、parseExtractResponse（L41-70：3テスト）をカバー |
| QA-012 | `src/oauth/google-oauth-handler.ts:10` — `CodeChallengeMethod` を `google-auth-library` からインポート。L126 — `code_challenge_method: CodeChallengeMethod.S256` を使用。`as any` 完全削除確認済み |

## REJECT判定条件

- `new` が2件（QA-013, QA-014）
- QA-013: 新規モジュールの公開関数 `deduplicateActionItems` に対するテスト欠如（ポリシー「テストがない新しい振る舞い」→ REJECT）
- QA-014: 新規テストファイル内の `any` 型使用（ポリシー「`any` 型の使用」→ REJECT）
- ブロッキング問題が2件あるため **REJECT**