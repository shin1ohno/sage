## arch-review
依存方向も正しい（types ← services ← cli、逆方向なし）。全ての確認が完了しました。

---

# アーキテクチャレビュー

## 結果: APPROVE

## サマリー
前回のREJECT理由であったARCH-007（`escapeHtml` DRY違反）は適切に解消済み。`src/utils/html.ts`への抽出とインポート置換を確認。今回の変更全体（SEC-003 CSRF対策、QA-013/QA-014テスト改善、google-oauth-handlerの`as any`除去）にブロッキング問題は検出されなかった。

## 確認した観点
- [x] 構造・設計（ファイル分割・行数・モジュール構成・依存方向）
- [x] コード品質（`any`型・TODO・空catch・eslint-disable）
- [x] 変更スコープの適切性
- [x] テストカバレッジ
- [x] デッドコード
- [x] 呼び出しチェーン検証
- [x] 契約文字列のハードコード散在

## 前回指摘の追跡

| finding_id | 前回状態 | 今回状態 | 根拠 |
|------------|----------|----------|------|
| ARCH-001 | resolved | resolved | 変更なし |
| ARCH-002 | resolved | resolved | `post-meeting-processor.ts` 286行、`parseExtractResponse()`→`llm-response-parser.ts`、`deduplicateActionItems()`→`action-item-builder.ts`に維持 |
| ARCH-003 | resolved | resolved | 変更なし |
| ARCH-004 | resolved | resolved | 変更なし |
| ARCH-005 | resolved | resolved | 変更なし |
| ARCH-006 | resolved | resolved | 変更なし |
| ARCH-007 | new(REJECT) | resolved | `src/utils/html.ts`に`escapeHtml`関数を抽出（15行）、`src/cli/http-server-with-config.ts:29`で`import { escapeHtml } from '../utils/html.js'`に置換。`src/oauth/`ディレクトリにローカル`function escapeHtml`定義は0件（grepで確認） |

## 今回の検証結果

### ファイルサイズ（全新規ファイル300行以下 ✓）

| ファイル | 行数 | 判定 |
|---------|------|------|
| pipeline-scheduler.ts | 289 | OK |
| post-meeting-processor.ts | 286 | OK |
| briefing-generator.ts | 264 | OK |
| slack-service.ts | 258 | OK |
| pipeline-state-store.ts | 236 | OK |
| reloadable/index.ts | 201 | OK（200行微超、既存パターンの延長） |
| その他全新規ファイル | <200 | OK |

### コード品質チェック
- `any`型: 新規/変更ファイルに0件 ✓
- `as any`: `google-oauth-handler.ts`から`as any`を**除去**（`CodeChallengeMethod.S256`に置換）✓
- TODOコメント: 新規/変更ファイルに0件 ✓
- 空catch: 全て適切なフォールバック処理付き（ログ出力＋代替動作）✓
- `eslint-disable`: 新規/変更ファイルに0件 ✓

### 依存方向
- `src/types/` → 他のsrc内モジュールへの依存なし ✓
- `src/services/` → `cli/`への依存なし ✓
- 循環依存なし ✓

### 変更スコープ
- 変更行数: ~120行（http-server-with-config.ts差分）+ 小規模な型追加
- 前回指摘のfix4件は全て論理的にまとまった修正

## Warning（非ブロッキング）

### WARN-001: `http-server-with-config.ts` 963行（既存問題）
- 変更前から~843行あり、今回の変更で+120行。300行制限を大幅超過
- God Class的な責務集中（HTTP管理、認証、Google OAuth、Slack OAuth、MCP、CORS、ヘルスチェック）
- **タスクスコープを大きく逸脱するリファクタリングのため非ブロッキング**
- 提案: 将来的にSlack OAuth callback handling / Google OAuth callback handling / MCP endpoint handling をそれぞれ独立クラスに抽出すること

### WARN-002: `conferenceData` インライン型定義の重複
- `src/types/google-calendar-types.ts:185-189`（`GoogleCalendarEvent`内）と`src/types/google-calendar-types.ts:311-315`（`CalendarEvent`内）で同一構造のインライン型を定義
- 提案: `ConferenceData` インターフェースを抽出し、両方で参照する

### WARN-003: `tests/unit/slack-oauth-callback.test.ts` のescapeHtmlインラインコピー
- テストファイル内（line 12-19）で`escapeHtml`をインライン定義。`src/utils/html.ts`からインポートすべき
- テストファイルのためWarning扱い

### WARN-004: `tests/unit/slack-oauth-callback.test.ts` のstate validation テストが実装と異なるセマンティクス
- テスト（line 59）では`expiresAt`（未来タイムスタンプ）をMapに格納するが、実装（line 862）では`createdAt`（現在タイムスタンプ）を格納
- テストは概念（状態の一回使用・期限切れ検出）を検証しているが、実装の正確な動作を再現していない
- テストファイルのためWarning扱い

---

## frontend-review
プロジェクトの全体像を確認しました。

## フロントエンドレビュー結果

**判定: APPROVE**

### 根拠

このプロジェクト（`@shin1ohno/sage`）は **MCP（Model Context Protocol）サーバー** であり、フロントエンドコードを含みません。

確認した事実：

| 確認項目 | 結果 |
|---------|------|
| フロントエンドフレームワーク（React, Vue, Angular, Svelte等）の依存 | なし |
| `.tsx` / `.jsx` ファイル | 0件 |
| `app/routes/`、`features/`、`shared/components/` 等のフロントエンド構造 | なし |
| プロジェクト種別 | Node.js CLIツール / MCPサーバー |
| 変更対象 | CLI HTTPサーバー、設定ローダー、OAuthハンドラー、サービス層、型定義、ユニットテスト |

変更されたファイルはすべてバックエンド/CLI層のコードであり、フロントエンド開発の観点でレビューすべき対象がありません。

**フロントエンド観点での問題はありません。**

---

## security-review
全ての変更ファイルの確認が完了しました。前回のレポートと現在のコードを照合し、セキュリティレビュー結果をまとめます。

---

## セキュリティレビュー結果

全変更ファイル（Modified 10件 + Untracked 44件）を精査しました。

### 前回の指摘状態確認

**SEC-003（Slack OAuth CSRF）の解消検証:**

`src/cli/http-server-with-config.ts` の実コードを行単位で確認:
- 行131-133: `pendingSlackOAuthStates` Map + 10分タイムアウト定数 ✅
- 行851-868: `/oauth/slack/authorize` エンドポイント — `crypto.randomUUID()` で state 生成 → Map に timestamp 付き保存 → `getAuthorizationUrl(state)` でリダイレクト ✅
- 行890-893: state パラメータ欠落チェック → 400 ✅
- 行898-904: 保存済み state との照合 → 不一致時 400 ✅
- 行907: ワンタイム消費（`delete`） ✅
- 行910-914: 10分有効期限チェック ✅
- 行937-943: `cleanupExpiredSlackOAuthStates()` 期限切れ掃除 ✅

SEC-003 は完全に解消されています。Google OAuth（`google-oauth-callback-handler.ts:71-97`）と同等のパターンで CSRF 防御が実装されています。

### 今回の全変更に対するセキュリティチェック

| カテゴリ | 結果 | 確認内容 |
|---------|------|---------|
| インジェクション (XSS) | ✅ | `escapeHtml()` が `src/utils/html.ts` に共通化、行886で `${escapeHtml(error)}` 適用。5文字(`&<>"'`)エスケープ確認 |
| インジェクション (SQL/コマンド) | ✅ | SQL/コマンド構築なし。Google Drive API クエリは API 経由（`google-drive-service.ts:76,85`）、`event.title` のシングルクォートエスケープ済み（行84） |
| 認証・認可 (CSRF) | ✅ | SEC-003 解消済み。state 生成→保存→照合→ワンタイム消費→期限チェック実装 |
| 認証 (トークン管理) | ✅ | Slack トークンは `EncryptionService` で暗号化保存（`slack-oauth-handler.ts:44-48`）。`client_secret` は環境変数から取得（行45, http-server-with-config.ts:237）。ハードコードなし |
| データ保護 | ✅ | ログに機密情報（トークン、シークレット）出力なし。エラーメッセージは内部詳細を露出しない（`http-server-with-config.ts:933`: "Internal Server Error" のみ） |
| 暗号化 | ✅ | `EncryptionService` 使用、`SAGE_ENCRYPTION_KEY` 環境変数から取得 |
| 依存関係 | ✅ | `@slack/web-api`, `htmlparser2`, `p-queue` — メジャーパッケージ、既知脆弱性なし |
| エラーハンドリング | ✅ | Slack OAuth コールバック失敗時に 500 + 汎用メッセージ（行932-933）。スタックトレース非露出 |
| OWASP A01-A10 | ✅ | 主要チェック項目クリア |

### 指摘追跡

| # | finding_id | 状態 | 解消根拠 |
|---|------------|------|----------|
| 1 | SEC-001 | resolved | `src/utils/html.ts:8-15` に `escapeHtml()` 共通関数、`src/cli/http-server-with-config.ts:29` でインポート、行886で Slack OAuth error パラメータに適用。XSS 防止確認 |
| 2 | SEC-002 | resolved | Google OAuth CSRF は `src/oauth/google-oauth-callback-handler.ts:71-97` で state 検証実装済み。今回の変更に影響なし |
| 3 | SEC-003 | resolved | `src/cli/http-server-with-config.ts:851-943` — `/oauth/slack/authorize` エンドポイント新設、`crypto.randomUUID()` による state 生成、`pendingSlackOAuthStates` Map で管理、コールバックで state 照合・ワンタイム消費・10分有効期限チェック。全条件充足 |

### 警告（非ブロッキング）

1. **ReDoS リスク（低）** — `src/services/channel-discovery.ts:102` と `src/services/meeting-filter.ts:43` で `new RegExp(pattern)` を使用。パターンは config ファイル由来（外部ユーザー入力ではない）のため実害リスクは低いが、将来的に `re2` ライブラリまたはタイムアウト付き実行の検討を推奨
2. **HTTP デフォルト URI（継続）** — `src/cli/http-server-with-config.ts:233` の Slack OAuth デフォルト redirect URI が `http://`。本番では `SLACK_REDIRECT_URI` 環境変数で HTTPS を指定すること
3. **State Map サイズ制限なし** — `pendingSlackOAuthStates` Map にサイズ上限なし。10分で期限切れ＋authorize 時に掃除されるため、ローカルツールとして実害リスクは低い。将来的にレート制限の検討を推奨
4. **OAuth state のログ出力** — `src/cli/http-server-with-config.ts:865` で state 値がログに出力。ローカルログのため実害リスクは低いが、本番化時はログレベル調整を推奨
5. **`drive.readonly` スコープ追加** — `src/oauth/google-oauth-handler.ts:53` で Google OAuth に `drive.readonly` スコープ追加。`google-drive-service.ts:42` でスコープ存在チェック実装済みのため意図的な権限拡大

## 判定: **APPROVE**

前回ブロッキングだった SEC-003（Slack OAuth CSRF 未対策）が適切に修正され、全ての REJECT 基準をクリアしています。新規追加ファイル群にも認証・認可、インジェクション、データ保護の観点でブロッキングとなるセキュリティ脆弱性は検出されませんでした。

---

## qa-review
全ての情報が揃いました。レビュー結果をまとめます。

---

## QAレビュー

## 結果: REJECT

## サマリー
前回の2件の指摘（QA-013, QA-014）は実コードで解消を確認。しかし、新規テストファイル `slack-oauth-callback.test.ts` 内で `escapeHtml` 関数がローカルに再定義されており、ARCH-007修正で抽出された `src/utils/html.ts` の実際のエクスポート関数がテストされていない。DRY違反かつテストカバレッジの欠落としてREJECTとする。

## 確認した観点
| 観点 | 結果 | 備考 |
|------|------|------|
| テストカバレッジ | ❌ | `src/utils/html.ts:escapeHtml` のエクスポート関数がテストで直接使用されていない（ローカル複製をテスト） |
| テスト品質 | ⚠️ | 状態検証テスト（L39-77）がMap API操作のみテスト、実装のタイムアウトロジックと不一致 |
| エラーハンドリング | ✅ | SEC-003のSlack OAuth各パスでエラーをログ付きハンドリング。空catchなし |
| ログとモニタリング | ✅ | 新規エンドポイントで `cliLogger.info`/`warn`/`error` を適切に使用 |
| 保守性 | ✅ | `deduplicateActionItems` テスト追加、`daily-summary-service` テスト簡素化 |

## 今回の指摘（new）
| # | finding_id | カテゴリ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | QA-015 | DRY違反 / テストカバレッジ | `tests/unit/slack-oauth-callback.test.ts:12-19` | `escapeHtml` 関数がローカルにコピーされている（`src/utils/html.ts:8-15` と文字単位で同一）。ARCH-007修正で `escapeHtml` を `src/utils/html.ts` に抽出してDRY違反を解消したにも関わらず、新規テストファイルで即座に重複を再導入。結果として `src/utils/html.ts` のエクスポート関数は **どのテストからも直接importされておらず**、誰かが `src/utils/html.ts` を変更してもテストはローカルコピーを使い続けるため回帰検出不能。ポリシー「本質的に同じロジックの重複（DRY違反）」→ REJECT | L12-19のローカル関数定義を削除し、`import { escapeHtml } from '../../src/utils/html.js';` に置換する。テスト内の `escapeHtml` 使用箇所（L25, L31, L134）は変更不要 |

## 警告（Warning）
| # | カテゴリ | 場所 | 内容 |
|---|---------|------|------|
| 1 | テスト品質 | `tests/unit/slack-oauth-callback.test.ts:69-77` | 「expired state」テストが `Date.now() > storedExpiry` を検証しているが、実装（`http-server-with-config.ts:910`）の条件は `Date.now() - stateCreatedAt > SLACK_STATE_TIMEOUT_MS`。テストのMapには `Date.now() - 1000`（expiresAt概念）を格納しているが、実装は `Date.now()`（createdAt）を格納する。テストが検証する条件と実装の条件が異なるため、タイムアウトロジックのリグレッション検出効果が低い |

## 継続指摘（persists）
なし

## 解消済み（resolved）
| finding_id | 解消根拠 |
|------------|----------|
| QA-013 | `tests/unit/action-item-builder.test.ts:121-223` に `deduplicateActionItems` の describe ブロックが追加。4テスト: (1) LLMが正常にunique配列を返す→その配列を返す (2) JSONパース失敗→全newItems返す (3) uniqueフィールドなし→全newItems返す (4) promptTemplateManagerに正しいパラメータが渡される。L9で `deduplicateActionItems` を直接インポートして使用 |
| QA-014 | `tests/unit/daily-summary-service.test.ts:66-76` で `jest.useFakeTimers()` + `jest.setSystemTime()` パターンを使用。`as [any]` および `eslint-disable` コメントは完全に除去。ファイル全体に `any` 型なし（grep確認済み） |

## REJECT判定条件
- `new` が1件（QA-015）
- QA-015: `escapeHtml` のDRY違反 + `src/utils/html.ts` のエクスポート関数の直接テスト欠如（ポリシー「本質的に同じロジックの重複（DRY違反）」→ REJECT）
- ブロッキング問題が1件あるため **REJECT**