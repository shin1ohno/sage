# タスク指示書: Meeting Intelligence Pipeline — Layer 3: Slack Integration (Tasks 12-14)

## 概要

Meeting Intelligence Pipeline の Slack 統合レイヤー。Slack OAuth ハンドラー、HTTP サーバーへの OAuth コールバックルート追加、Slack API クライアントサービスを実装する。後続レイヤーの BriefingGenerator / PostMeetingProcessor / ChannelDiscovery がこのレイヤーの SlackService に依存する。

## 参照資料

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — タスク定義（ソース・オブ・トゥルース）
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — 設計文書（Components and Interfaces セクション: SlackOAuthHandler, SlackService）
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — 要件文書（R1, R5, R6）

## 作業内容

### Task 12: SlackOAuthHandler 作成

- **優先度:** 高
- **ファイル:** `src/oauth/slack-oauth-handler.ts`（新規）
- **作業:** `GoogleOAuthHandler` (`src/oauth/google-oauth-handler.ts`) のパターンを踏襲し、Slack 用の OAuth 2.0 ハンドラーを作成する。**PKCE は不要**（Slack は PKCE 非対応）

#### SlackTokens インターフェース
```typescript
export interface SlackTokens {
  accessToken: string;
  teamId: string;
  authedUserId: string;
  botUserId: string;
  scope: string;
  expiresAt?: number;
}
```

#### SlackOAuthHandler クラス
```typescript
export class SlackOAuthHandler {
  constructor(config: { clientId: string; clientSecret: string; redirectUri: string }, encryptionKey?: string)
  getAuthorizationUrl(state: string): string
  async exchangeCodeForToken(code: string): Promise<SlackTokens>
  async getStoredTokens(): Promise<SlackTokens | null>
  async storeTokens(tokens: SlackTokens): Promise<void>
  async revokeToken(token: string): Promise<void>
}
```

#### 実装詳細

- **コンストラクタ:**
  - `EncryptionService` を初期化（GoogleOAuthHandler L69-78 と同じパターン）
  - トークン保存先: `~/.sage/slack_tokens.enc`

- **`getAuthorizationUrl(state)`:**
  - Slack OAuth URL を生成: `https://slack.com/oauth/v2/authorize`
  - Query params: `client_id`, `scope`, `redirect_uri`, `state`
  - Required scopes: `chat:write,channels:history,channels:read,groups:history,groups:read,im:write,users:read`
  - **PKCE なし**（code_challenge/code_verifier 不要）

- **`exchangeCodeForToken(code)`:**
  - Slack API `https://slack.com/api/oauth.v2.access` に POST
  - Body: `code`, `client_id`, `client_secret`, `redirect_uri`
  - レスポンスから `access_token`, `team.id`, `authed_user.id`, `bot_user_id`, `scope` を取得
  - **`@slack/oauth` は使わない** — 直接 HTTP リクエストを使う（シンプルなため）
  - エラー時は Error を throw

- **`getStoredTokens()`:**
  - `EncryptionService.decryptFromFile()` で復号（GoogleOAuthHandler L278-305 と同じパターン）
  - ファイル未存在時は `null` を返す

- **`storeTokens(tokens)`:**
  - `EncryptionService.encryptToFile()` で暗号化保存（GoogleOAuthHandler L247-268 と同じパターン）

- **`revokeToken(token)`:**
  - Slack API `https://slack.com/api/auth.revoke` に POST（token を含む）
  - ローカルファイルも削除

- **依存:** `EncryptionService` (`src/oauth/encryption-service.ts`), `node:https` or `fetch`
- **パターン:** `GoogleOAuthHandler` を厳密に踏襲（PKCE 部分を除く）
- **要件:** R1.1, R1.2, R1.6

---

### Task 13: Slack OAuth コールバックルート追加

- **優先度:** 高
- **ファイル:** `src/cli/http-server-with-config.ts`（変更）
- **作業:** 既存の Google OAuth コールバックルート（L382-395）の直後に、Slack OAuth コールバックルートを追加

#### 変更箇所 1: クラスプロパティ追加
`HTTPServerWithConfigImpl` クラス（L109）に Slack 関連のプロパティを追加:
```typescript
// Slack OAuth handler
private slackOAuthHandler: SlackOAuthHandler | null = null;
```

#### 変更箇所 2: start() メソッドに初期化追加
Google OAuth 初期化ブロック（L198-222）の直後に追加:
```typescript
// Initialize Slack OAuth handler if configured
if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
  const { SlackOAuthHandler } = await import('../oauth/slack-oauth-handler.js');
  const slackRedirectUri = process.env.SLACK_REDIRECT_URI
    || `http://${this.effectiveHost}:${this.effectivePort}/oauth/slack/callback`;
  this.slackOAuthHandler = new SlackOAuthHandler({
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    redirectUri: slackRedirectUri,
  });
  cliLogger.info({ redirectUri: slackRedirectUri }, 'Slack OAuth enabled');
}
```

#### 変更箇所 3: handleRequest() にルート追加
Google OAuth callback ルート（L382-395）の直後に追加:
```typescript
// Slack OAuth callback endpoint (no auth required - receives redirect from Slack)
if (path === '/oauth/slack/callback' && method === 'GET') {
  if (this.slackOAuthHandler) {
    this.handleSlackOAuthCallback(req, res).catch((error) => {
      cliLogger.error({ err: error }, 'Slack OAuth callback failed');
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Internal Server Error</h1>');
    });
  } else {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Slack OAuth not configured' }));
  }
  return;
}
```

#### 変更箇所 4: handleSlackOAuthCallback メソッド追加
```typescript
private async handleSlackOAuthCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Slack Authorization Failed</h1><p>${error}</p>`);
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Missing authorization code</h1>');
    return;
  }

  const tokens = await this.slackOAuthHandler!.exchangeCodeForToken(code);
  await this.slackOAuthHandler!.storeTokens(tokens);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Slack Authorization Successful!</h1><p>You can close this window.</p>');
}
```

- **import 追加:** `SlackOAuthHandler` は dynamic import で行う（start() 内で `await import()`）— Slack が未設定の環境でインポートエラーを避けるため
- **パターン:** 既存の Google OAuth コールバック（L382-395）を厳密に踏襲
- **要件:** R1.1

---

### Task 14: SlackService 作成

- **優先度:** 高
- **ファイル:** `src/integrations/slack-service.ts`（新規）
- **作業:** Slack API クライアントサービスを作成

#### ローカル型定義
```typescript
export interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  threadTs?: string;
  replyCount?: number;
  replies?: SlackMessage[];
}

export interface SlackChannel {
  id: string;
  name: string;
  purpose?: string;
  numMembers?: number;
}

export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  email?: string;
}

export interface ChannelHistoryOptions {
  limit: number;
  includeThreads: boolean;
}
```

#### SlackService クラス
```typescript
export class SlackService {
  constructor(oauthHandler: SlackOAuthHandler)

  // Slack DM に Block Kit メッセージを送信
  async sendDirectMessage(blocks: SlackBlock[]): Promise<void>

  // チャンネル履歴を取得（oldest 以降）
  async getChannelHistory(channelId: string, oldest: string, options: ChannelHistoryOptions): Promise<SlackMessage[]>

  // スレッドのリプライを取得
  async getThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]>

  // Bot が参加しているチャンネル一覧
  async listBotChannels(): Promise<SlackChannel[]>

  // メールアドレスで Slack ユーザーを検索
  async lookupUser(email: string): Promise<SlackUser | null>

  // 接続状態を返す
  isConnected(): boolean
}
```

#### 実装詳細

- **コンストラクタ:**
  - `SlackOAuthHandler` を受け取り、トークンを取得して `@slack/web-api` の `WebClient` を初期化
  - `connected: boolean` フラグを管理

- **`sendDirectMessage(blocks)`:**
  - `chat.postMessage` で `channel: authedUserId`（DM） に送信
  - `SlackBlock[]` をそのまま `blocks` パラメータに渡す
  - `retryWithBackoff` でラップ

- **`getChannelHistory(channelId, oldest, options)`:**
  - `conversations.history` で `oldest` 以降のメッセージを取得
  - `options.limit` で件数制限
  - `options.includeThreads` が true の場合:
    - `reply_count > 0` のメッセージに対して `getThreadReplies` を呼ぶ
    - **Rate-limit adaptive:** `getThreadReplies` で 429 を受けたら残りのスレッド取得を中止し、取得済みメッセージで返す
  - `retryWithBackoff` でラップ

- **`getThreadReplies(channelId, threadTs)`:**
  - `conversations.replies` で取得
  - `retryWithBackoff` でラップ
  - 429 エラー時は `Error` を throw（呼び出し元の `getChannelHistory` が catch してスレッド取得を中止）

- **`listBotChannels()`:**
  - `conversations.list` で `types: 'public_channel,private_channel'` を指定
  - Bot が参加しているチャンネルのみ返される
  - キャッシュなし
  - `retryWithBackoff` でラップ

- **`lookupUser(email)`:**
  - `users.lookupByEmail` で検索
  - 見つからない場合は `null` を返す（エラーではなく）
  - `retryWithBackoff` でラップ

- **`isConnected()`:**
  - `connected` フラグを返す

- **401 エラー検知:**
  - 全 API 呼び出しで 401 (token_revoked/invalid_auth) を検知
  - 検知時に `connected = false` に設定
  - 特定のエラー（例: `SlackTokenRevokedError`）を throw — 呼び出し元（PipelineScheduler）が検知して critical error notification を送信

- **WebClient 初期化の遅延:**
  - コンストラクタでは `oauthHandler` のみ保持
  - 最初の API 呼び出し時に `oauthHandler.getStoredTokens()` でトークンを取得し `WebClient` を初期化
  - トークンがない場合は `connected = false` で `Error` を throw

- **依存:** `@slack/web-api` (WebClient), `SlackOAuthHandler`, `retryWithBackoff` (`src/utils/retry.ts`), logger (`src/utils/logger.ts`)
- **パターン:** 既存の `src/integrations/` のサービスパターン
- **要件:** R1.3, R1.4, R5.1, R5.2, R5.4, R6.5

---

## テスト

- **テストファイル配置:** `tests/unit/` 配下
- **テストファイル:**
  - `tests/unit/slack-oauth-handler.test.ts` — Task 12 のテスト
  - `tests/unit/slack-service.test.ts` — Task 14 のテスト
  - Task 13（HTTP サーバー変更）のテストは既存の E2E テストと共存するため、ユニットテストは不要（ルーティングロジックのみの変更）

### Task 12 テスト項目
- `getAuthorizationUrl`: 正しい Slack OAuth URL を生成（client_id, scope, redirect_uri, state を含む）
- `getAuthorizationUrl`: PKCE パラメータ（code_challenge）を含まない
- `exchangeCodeForToken`: 正しい API エンドポイントに POST する（`fetch` / `https` をモック）
- `exchangeCodeForToken`: レスポンスから SlackTokens を正しくパース
- `exchangeCodeForToken`: API エラー時に Error を throw
- `getStoredTokens`: 暗号化されたトークンを復号して返す（EncryptionService をモック）
- `getStoredTokens`: ファイル未存在時に null を返す
- `storeTokens`: トークンを暗号化して保存する（EncryptionService をモック）
- `revokeToken`: Slack API にリボーク要求を送信

### Task 14 テスト項目
- `sendDirectMessage`: `chat.postMessage` を正しいパラメータで呼ぶ（WebClient をモック）
- `sendDirectMessage`: retryWithBackoff でラップされている
- `getChannelHistory`: `conversations.history` を呼ぶ
- `getChannelHistory`: includeThreads=true 時にスレッドのリプライを取得
- `getChannelHistory`: スレッド取得中の 429 エラーで残りのスレッド取得を中止
- `getThreadReplies`: `conversations.replies` を呼ぶ
- `listBotChannels`: `conversations.list` を正しい types パラメータで呼ぶ
- `lookupUser`: `users.lookupByEmail` を呼ぶ
- `lookupUser`: ユーザーが見つからない場合に null を返す
- `isConnected`: 初期状態と接続後の状態を正しく返す
- 401 エラー時に `connected` が false になる

### 既存テスト
- **全既存テストがパスすることを確認:** `npm test`

## 横断的懸念事項

- **ESM import:** 全 import は `.js` 拡張子付き（例: `import { SlackOAuthHandler } from '../oauth/slack-oauth-handler.js'`）
- **エクスポート:** `src/oauth/index.ts` に `SlackOAuthHandler` のエクスポートを追加する必要がある場合は追加
- **ロギング:** `cliLogger` または `createLogger('slack')` を使用
- **エラーハンドリング:** `retryWithBackoff` を全 API 呼び出しに使用。401 は即座に検知して `connected = false`

## Open Questions

なし
