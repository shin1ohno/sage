# Requirements: Remote Google OAuth Authentication

## Overview

リモートサーバーで実行されるsage MCPサーバーに対して、ユーザーがローカルブラウザからGoogle OAuth認証を完了できるようにする機能。サーバーが直接OAuthコールバックを受け取ることで、認証コードがLLMを経由しないセキュアな実装を実現する。

## Problem Statement

現在の `authenticate_google` ツールは以下の問題がある：
1. コールバックサーバーがサーバーの `localhost:3000` で起動する
2. ブラウザがサーバー上で開こうとする（ヘッドレス環境では失敗）
3. GoogleのリダイレクトURIが `localhost` を指しているため、リモートサーバーでは機能しない

## Solution Approach

**サーバー直接コールバック方式**を採用：
1. サーバーに `/oauth/google/callback` エンドポイントを追加
2. Google Cloud Console で「Webアプリケーション」タイプのOAuthクライアントを設定
3. リダイレクトURIをサーバーのパブリックURL（例: `https://mcp.example.com/oauth/google/callback`）に設定
4. 認証コードはGoogleからサーバーに直接送信され、LLMを経由しない

## User Stories

### US-1: Remote OAuth Initiation
As a Claude Code user running sage on a remote server,
I want to initiate Google OAuth authentication from Claude,
so that I can authenticate without needing direct server access.

### US-2: Browser-Based Authentication
As a user,
I want to open the authorization URL in my local browser,
so that I can securely authenticate with my Google account.

### US-3: Automatic Token Exchange
As a user,
I want the server to automatically receive the callback and exchange tokens,
so that the process is seamless and secure.

### US-4: Token Persistence
As a user,
I want my tokens to be securely stored on the server,
so that I don't need to re-authenticate frequently.

### US-5: Setup Documentation
As a server administrator,
I want clear documentation on OAuth client setup,
so that I can correctly configure Google Cloud Console.

## Functional Requirements

### FR-1: OAuth Callback Endpoint
- サーバーが `/oauth/google/callback` HTTPエンドポイントを公開すること
- エンドポイントは `code` と `state` パラメータを受け取ること
- 成功時はHTMLページで「認証完了」を表示すること
- 失敗時はHTMLページでエラーを表示すること

### FR-2: Authorization URL Generation
- `authenticate_google` ツールが認証URLを生成すること
- URLには PKCE (code_challenge) が含まれること
- `state` パラメータにセッション識別子を含めること
- `redirect_uri` は環境変数 `GOOGLE_REDIRECT_URI` から取得すること
- レスポンスにURLを返し、ユーザーがローカルブラウザで開けること

### FR-3: Pending Auth Session Management
- 認証開始時にセッション情報（code_verifier, state, timestamp）を保存すること
- セッションは設定可能な有効期限を持つこと（デフォルト: 10分）
- 期限切れセッションは自動的に削除されること
- セッション情報はサーバー再起動後も永続化されること

### FR-4: Token Exchange
- コールバック受信時、`state` でセッションを検索すること
- `code_verifier` を使用してトークンを交換すること
- トークンは暗号化して保存すること
- 交換失敗時は適切なエラーメッセージを表示すること

### FR-5: Authentication Status Check
- `authenticate_google` ツールで認証状態を確認できること
- 保留中の認証セッションがある場合、その状態を返すこと
- 認証完了後は成功ステータスを返すこと

### FR-6: Documentation
- README.md にGoogle OAuth設定手順を追加すること
- 「Webアプリケーション」タイプのクライアント作成手順を記載すること
- 必要な環境変数の一覧と説明を記載すること
- リダイレクトURI設定の例を記載すること

## Non-Functional Requirements

### NFR-1: Security
- PKCE (S256) を必須とすること
- `state` パラメータで CSRF を防止すること
- 認証コードは一度しか使用できないこと
- セッション情報は暗号化して保存すること
- 認証コードがLLMを経由しないこと

### NFR-2: Usability
- 認証URLは簡単にコピーできる形式で表示すること
- エラーメッセージは日本語で分かりやすく表示すること
- ブラウザに表示される完了/エラーページは視覚的に分かりやすいこと

### NFR-3: Reliability
- ネットワーク障害時は適切なリトライ処理を行うこと
- タイムアウト時は明確なエラーを返すこと
- 部分的な失敗からの復旧が可能であること

### NFR-4: Compatibility
- 既存のローカル認証フロー（localhost callback）と共存すること
- 環境変数 `GOOGLE_REDIRECT_URI` で動作モードを自動判定すること
- ローカル開発時は既存フローを使用可能なこと

## Acceptance Criteria

### AC-1: Authorization URL Generation
```
GIVEN: Google OAuth credentials are configured with public redirect URI
WHEN: User calls authenticate_google
THEN: System returns authorization URL with server's callback URL
AND: URL contains valid PKCE parameters
AND: Session is stored for later code exchange
```

### AC-2: Server Callback Reception
```
GIVEN: User has completed Google authentication in browser
WHEN: Google redirects to server's callback endpoint
THEN: Server receives authorization code directly (not via LLM)
AND: Server validates state parameter
AND: Server exchanges code for tokens using stored code_verifier
AND: Browser displays success page
```

### AC-3: Session Expiration
```
GIVEN: Auth session was created more than 10 minutes ago
WHEN: Google redirects with callback
THEN: System returns error page indicating session expired
AND: User is prompted to start authentication again
```

### AC-4: Authentication Status
```
GIVEN: User initiated authentication but hasn't completed
WHEN: User calls authenticate_google again
THEN: System shows pending authentication status
AND: Provides the same authorization URL
```

### AC-5: Documentation Completeness
```
GIVEN: User wants to set up Google OAuth
WHEN: User reads the documentation
THEN: Documentation explains OAuth client type selection
AND: Documentation lists required redirect URIs
AND: Documentation explains all environment variables
AND: Documentation includes troubleshooting section
```

## Out of Scope

- OAuth 2.0 以外の認証方式
- Google 以外のOAuthプロバイダー
- トークンの手動管理インターフェース
- マルチユーザー認証の同時処理
- Device Authorization Flow（将来の拡張として検討）

## Dependencies

- 既存の `GoogleOAuthHandler` クラス
- 既存の `EncryptionService` クラス
- 既存の PKCE 実装 (`src/oauth/pkce.ts`)
- HTTPサーバー（`src/cli/http-server.ts`）

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth クライアントID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth クライアントシークレット |
| `GOOGLE_REDIRECT_URI` | Yes | コールバックURL（例: `https://mcp.example.com/oauth/google/callback`） |
| `SAGE_ENCRYPTION_KEY` | Yes | トークン暗号化キー |

## Glossary

| Term | Definition |
|------|------------|
| PKCE | Proof Key for Code Exchange - OAuth 2.0の拡張仕様 |
| code_verifier | PKCEで使用するランダムな秘密文字列 |
| code_challenge | code_verifierのSHA-256ハッシュ（Base64URL） |
| state | CSRF防止用のランダムトークン |
| Webアプリケーション | Google OAuthクライアントタイプの一つ。パブリックURLへのリダイレクトが可能 |
