# OAuth 2.1 認証仕様書

> **Version:** 1.0.0
> **Date:** 2025-12-26
> **Status:** Draft
> **Based on:** MCP Authorization Spec 2025-06-18, RFC 8414, RFC 7591, RFC 9728, RFC 8707

## 概要

本仕様書は、sage Remote MCPサーバーにOAuth 2.1認証を実装するための要件を定義します。これにより、Claude iOS/iPadOS/Webアプリケーションからsageへの安全な接続が可能になります。

### 対象読者

- sage開発者
- セキュリティレビュアー

### 参照規格

| RFC/仕様 | 名称 | 用途 |
|----------|------|------|
| OAuth 2.1 | draft-ietf-oauth-v2-1-13 | 基本認証フレームワーク |
| RFC 8414 | OAuth 2.0 Authorization Server Metadata | 認可サーバーメタデータ |
| RFC 7591 | OAuth 2.0 Dynamic Client Registration | 動的クライアント登録 |
| RFC 9728 | OAuth 2.0 Protected Resource Metadata | 保護リソースメタデータ |
| RFC 8707 | Resource Indicators for OAuth 2.0 | リソースインジケーター |
| RFC 7636 | PKCE | 公開クライアント向けセキュリティ拡張 |

---

## アーキテクチャ

### システム構成

```mermaid
sequenceDiagram
    participant Client as Claude Client<br/>(iOS/Web)
    participant OAuth as sage OAuth Server<br/>(Authorization)
    participant API as sage MCP API<br/>(Resources)

    Client->>API: 1. GET /mcp
    API-->>Client: 401 Unauthorized

    Client->>OAuth: 2. GET /.well-known/oauth-protected-resource
    OAuth-->>Client: Resource metadata

    Client->>OAuth: 3. GET /.well-known/oauth-authorization-server
    OAuth-->>Client: Authorization server metadata

    Client->>OAuth: 4. GET /authorize
    OAuth-->>Client: Authorization code

    Client->>OAuth: 5. POST /token
    OAuth-->>Client: Access token

    Client->>API: 6. GET /mcp + Bearer token
    API-->>Client: MCP response
```

### コンポーネント

1. **Protected Resource (MCP API)**: sage MCPエンドポイント (`/mcp`)
2. **Authorization Server**: OAuth 2.1認可サーバー（sageに内蔵）
3. **Client**: Claude iOS/iPadOS/Webアプリケーション

---

## 要件

### 要件21: OAuth 2.1 基盤

**ユーザーストーリー:** Claude iOS/iPadOS/Webからsageに接続するユーザーとして、OAuth 2.1による安全な認証を行いたい。Claudeアプリの標準的な認証フローで簡単にアクセスできるようにするため。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 21.1 | システムはOAuth 2.1 Authorization Code + PKCEフローを実装すること | MUST |
| 21.2 | PKCEはS256メソッドを使用すること（plainは不可） | MUST |
| 21.3 | すべての認可エンドポイントはHTTPS経由のみで提供すること | MUST |
| 21.4 | アクセストークンはBearer形式でAuthorizationヘッダーに含めること | MUST |
| 21.5 | アクセストークンの有効期限は1時間以内とすること | SHOULD |
| 21.6 | リフレッシュトークンを発行し、トークンローテーションを実装すること | SHOULD |

---

### 要件22: Protected Resource Metadata (RFC 9728)

**ユーザーストーリー:** MCPクライアントとして、sageサーバーの認可サーバー情報を自動的に発見したい。手動設定なしで接続できるようにするため。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 22.1 | `/.well-known/oauth-protected-resource`エンドポイントを実装すること | MUST |
| 22.2 | レスポンスに`resource`フィールド（サーバーURI）を含めること | MUST |
| 22.3 | レスポンスに`authorization_servers`配列を含めること | MUST |
| 22.4 | 401レスポンス時に`WWW-Authenticate`ヘッダーを返すこと | MUST |
| 22.5 | `WWW-Authenticate`に`resource_metadata`URIを含めること | MUST |

#### レスポンス形式

```json
{
  "resource": "https://sage.example.com",
  "authorization_servers": [
    "https://sage.example.com"
  ],
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"],
  "bearer_methods_supported": ["header"]
}
```

#### WWW-Authenticateヘッダー形式

```
WWW-Authenticate: Bearer realm="sage", resource_metadata="https://sage.example.com/.well-known/oauth-protected-resource"
```

---

### 要件23: Authorization Server Metadata (RFC 8414)

**ユーザーストーリー:** MCPクライアントとして、認可サーバーのエンドポイントと機能を自動的に発見したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 23.1 | `/.well-known/oauth-authorization-server`エンドポイントを実装すること | MUST |
| 23.2 | `issuer`フィールドを含めること | MUST |
| 23.3 | `authorization_endpoint`を含めること | MUST |
| 23.4 | `token_endpoint`を含めること | MUST |
| 23.5 | `registration_endpoint`を含めること（DCRサポート時） | SHOULD |
| 23.6 | `response_types_supported`に"code"を含めること | MUST |
| 23.7 | `grant_types_supported`に"authorization_code"と"refresh_token"を含めること | MUST |
| 23.8 | `code_challenge_methods_supported`に"S256"を含めること | MUST |
| 23.9 | `token_endpoint_auth_methods_supported`に"none"を含めること（公開クライアント用） | MUST |

#### レスポンス形式

```json
{
  "issuer": "https://sage.example.com",
  "authorization_endpoint": "https://sage.example.com/oauth/authorize",
  "token_endpoint": "https://sage.example.com/oauth/token",
  "registration_endpoint": "https://sage.example.com/oauth/register",
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"],
  "response_types_supported": ["code"],
  "response_modes_supported": ["query"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
  "code_challenge_methods_supported": ["S256"],
  "service_documentation": "https://github.com/shin1ohno/sage"
}
```

---

### 要件24: Dynamic Client Registration (RFC 7591)

**ユーザーストーリー:** Claude（MCPクライアント）として、sageサーバーに自動的に登録したい。手動でクライアントIDを設定する必要がないようにするため。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 24.1 | `/oauth/register`エンドポイントを実装すること | SHOULD |
| 24.2 | `client_name`を受け付けること | MUST |
| 24.3 | `redirect_uris`を受け付け、検証すること | MUST |
| 24.4 | Claude公式コールバックURL`https://claude.ai/api/mcp/auth_callback`を許可すること | MUST |
| 24.5 | 将来のURL`https://claude.com/api/mcp/auth_callback`も許可すること | SHOULD |
| 24.6 | 登録成功時に`client_id`を返すこと | MUST |
| 24.7 | 公開クライアントの場合は`client_secret`を返さないこと | MUST |
| 24.8 | DCRクライアント削除時にtoken endpointから`invalid_client`エラーを返すこと | MUST |

#### 登録リクエスト形式

```json
{
  "client_name": "Claude",
  "redirect_uris": [
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback"
  ],
  "response_types": ["code"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none"
}
```

#### 登録レスポンス形式

```json
{
  "client_id": "sage_client_abc123",
  "client_name": "Claude",
  "redirect_uris": [
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback"
  ],
  "response_types": ["code"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none",
  "client_id_issued_at": 1735200000
}
```

---

### 要件25: Authorization Endpoint

**ユーザーストーリー:** ユーザーとして、Claudeアプリからsageへのアクセスを承認したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 25.1 | `/oauth/authorize`エンドポイントを実装すること | MUST |
| 25.2 | `response_type=code`のみをサポートすること | MUST |
| 25.3 | `client_id`パラメータを必須とすること | MUST |
| 25.4 | `redirect_uri`パラメータを必須とし、登録済みURIと完全一致を検証すること | MUST |
| 25.5 | `code_challenge`パラメータを必須とすること | MUST |
| 25.6 | `code_challenge_method=S256`のみをサポートすること | MUST |
| 25.7 | `state`パラメータを必須とすること | MUST |
| 25.8 | `resource`パラメータを受け付けること（RFC 8707） | MUST |
| 25.9 | 認可コードは10分以内に期限切れとすること | MUST |
| 25.10 | 認可コードは1回のみ使用可能とすること | MUST |

#### 認可リクエスト形式

```
GET /oauth/authorize?
  response_type=code&
  client_id=sage_client_abc123&
  redirect_uri=https://claude.ai/api/mcp/auth_callback&
  scope=mcp:read%20mcp:write&
  state=xyz123&
  code_challenge=E9Mrozoa2owUednKM6ih7lyStWO9GF5bUxIAWXo-Z90&
  code_challenge_method=S256&
  resource=https://sage.example.com
```

#### 認可レスポンス（成功）

```
HTTP/1.1 302 Found
Location: https://claude.ai/api/mcp/auth_callback?
  code=SplxlOBeZQQYbIg4OtR57E&
  state=xyz123
```

---

### 要件26: Token Endpoint

**ユーザーストーリー:** MCPクライアントとして、認可コードをアクセストークンに交換したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 26.1 | `/oauth/token`エンドポイントを実装すること | MUST |
| 26.2 | `grant_type=authorization_code`をサポートすること | MUST |
| 26.3 | `grant_type=refresh_token`をサポートすること | SHOULD |
| 26.4 | `code_verifier`を検証すること（PKCE） | MUST |
| 26.5 | `resource`パラメータを検証すること（RFC 8707） | MUST |
| 26.6 | アクセストークンに`aud`（audience）クレームを含めること | MUST |
| 26.7 | トークンレスポンスに`expires_in`を含めること | MUST |
| 26.8 | リフレッシュトークン使用時にトークンローテーションを行うこと | SHOULD |
| 26.9 | 削除されたクライアントには`invalid_client`エラーを返すこと | MUST |

#### トークンリクエスト形式（認可コード交換）

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=SplxlOBeZQQYbIg4OtR57E&
client_id=sage_client_abc123&
redirect_uri=https://claude.ai/api/mcp/auth_callback&
code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXY&
resource=https://sage.example.com
```

#### トークンレスポンス形式

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "8xLOxBtZp8",
  "scope": "mcp:read mcp:write"
}
```

#### トークンリクエスト形式（リフレッシュ）

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=8xLOxBtZp8&
client_id=sage_client_abc123
```

---

### 要件27: Token Validation

**ユーザーストーリー:** sageサーバーとして、受信したアクセストークンを検証したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 27.1 | Authorizationヘッダーからトークンを抽出すること | MUST |
| 27.2 | トークンの署名を検証すること | MUST |
| 27.3 | トークンの有効期限を検証すること | MUST |
| 27.4 | トークンの`aud`（audience）が自サーバーと一致することを検証すること | MUST |
| 27.5 | 無効なトークンには401を返すこと | MUST |
| 27.6 | スコープ不足には403を返すこと | MUST |
| 27.7 | クライアントのトークンを上流サービスに転送しないこと（Confused Deputy防止） | MUST |

---

### 要件28: Consent UI

**ユーザーストーリー:** ユーザーとして、Claudeにsageへのアクセスを許可する前に、どのような権限が求められているか確認したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 28.1 | 認可エンドポイントで同意画面を表示すること | MUST |
| 28.2 | クライアント名（Claude）を表示すること | MUST |
| 28.3 | 要求されているスコープを人間が理解できる形式で表示すること | MUST |
| 28.4 | 「許可」と「拒否」ボタンを提供すること | MUST |
| 28.5 | 拒否時は`error=access_denied`でリダイレクトすること | MUST |
| 28.6 | 同意画面はHTTPS経由でのみ提供すること | MUST |

#### 同意画面表示内容

```
┌─────────────────────────────────────────┐
│           sage 認可リクエスト            │
├─────────────────────────────────────────┤
│                                         │
│  "Claude" があなたの sage アカウントへの │
│  アクセスを要求しています。             │
│                                         │
│  要求されている権限:                    │
│  ✓ タスク分析 (mcp:read)               │
│  ✓ リマインダー作成 (mcp:write)         │
│                                         │
│  ┌─────────┐    ┌─────────┐            │
│  │  許可   │    │  拒否   │            │
│  └─────────┘    └─────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

---

### 要件29: User Authentication

**ユーザーストーリー:** sageサーバー管理者として、OAuth認可を行うユーザーを認証したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 29.1 | ユーザー認証メカニズムを提供すること | MUST |
| 29.2 | シンプルな認証方式（事前設定パスワード）をサポートすること | MUST |
| 29.3 | 認証情報は設定ファイルに保存すること | MUST |
| 29.4 | パスワードはハッシュ化して保存すること | SHOULD |
| 29.5 | ログイン試行回数制限を実装すること | SHOULD |

#### 認証フロー

1. ユーザーが認可エンドポイントにアクセス
2. 未認証の場合、ログイン画面を表示
3. ユーザーがパスワードを入力
4. 認証成功後、同意画面を表示
5. 同意後、認可コードを発行

---

### 要件30: Security Requirements

**ユーザーストーリー:** セキュリティ担当者として、OAuth実装が安全であることを確認したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 30.1 | すべてのOAuthエンドポイントはHTTPS経由のみで提供すること | MUST |
| 30.2 | Implicit Grant（response_type=token）をサポートしないこと | MUST |
| 30.3 | トークンをURLクエリパラメータに含めないこと | MUST |
| 30.4 | CSRF対策としてstateパラメータを検証すること | MUST |
| 30.5 | redirect_uriは完全一致で検証すること | MUST |
| 30.6 | オープンリダイレクト脆弱性を防止すること | MUST |
| 30.7 | トークンは暗号化して保存すること | SHOULD |
| 30.8 | 認可コードは使用後に無効化すること | MUST |
| 30.9 | リフレッシュトークンは使用後にローテーションすること | SHOULD |

---

### 要件31: Claude固有の互換性

**ユーザーストーリー:** Claude iOS/Webユーザーとして、標準的なClaudeの認証フローでsageに接続したい。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 31.1 | Claudeコールバック`https://claude.ai/api/mcp/auth_callback`を許可すること | MUST |
| 31.2 | 将来のコールバック`https://claude.com/api/mcp/auth_callback`を許可すること | SHOULD |
| 31.3 | Dynamic Client Registrationでclient_name="Claude"を受け付けること | MUST |
| 31.4 | HTTP Transport (POST /mcp) と併用可能であること | MUST |
| 31.5 | 全エンドポイントでBearer認証を受け付けること | MUST |
| 31.6 | localhost callbackを動的ポートで許可すること（CLI対応） | SHOULD |

---

### 要件32: Static Token サポート（CLIアクセス用）

**ユーザーストーリー:** Claude Code等のCLIツールユーザーとして、OAuth認可フローなしでsageに接続したい。ブラウザを使用せずにCLIから直接アクセスできるようにするため。

#### 受け入れ基準

| ID | 要件 | 優先度 |
|----|------|--------|
| 32.1 | OAuth2モードでも静的JWTトークンを受け付けるオプションを提供すること | SHOULD |
| 32.2 | `--generate-token` CLIオプションでBearerトークンを生成できること | SHOULD |
| 32.3 | 静的トークンはOAuthトークンと同様にBearerヘッダーで送信すること | MUST |
| 32.4 | 静的トークンは別のシークレットで署名すること | MUST |
| 32.5 | 静的トークンの有効期限を設定可能にすること | SHOULD |

#### 設定例

```json
{
  "auth": {
    "type": "oauth2",
    "issuer": "https://sage.example.com",
    "allowStaticTokens": true,
    "staticTokenSecret": "your-secret-key-at-least-32-characters",
    "users": [...]
  }
}
```

#### CLIでのトークン生成

```bash
# Bearerトークンを生成
npx @shin1ohno/sage --generate-token

# 出力例:
# Bearer token generated successfully.
# Token: eyJhbGciOiJIUzI1NiIs...
# Expires in: 3600 seconds
#
# Usage with Claude Code:
#   claude mcp add --transport http sage "http://your-server:3000/mcp" \
#     --header "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### localhost callback サポート

CLIツール（Claude Code等）は動的ポートでlocalhostにコールバックを受け取ることがあります：

```
http://localhost:12345/callback
http://127.0.0.1:54321/callback
```

これらのURIは、クライアントがlocalhost URIを1つでも登録していれば許可されます。

---

## スコープ定義

| スコープ | 説明 | 含まれるツール |
|----------|------|----------------|
| `mcp:read` | 読み取り専用アクセス | `check_setup_status`, `list_todos`, `list_calendar_events`, `find_available_slots`, `detect_duplicates` |
| `mcp:write` | 読み書きアクセス | 上記 + `analyze_tasks`, `set_reminder`, `sync_to_notion`, `create_calendar_event`, `respond_to_calendar_event` |
| `mcp:admin` | 管理者アクセス | 上記 + `start_setup_wizard`, `save_config`, `update_config`, `delete_calendar_event` |

---

## エンドポイント一覧

| エンドポイント | メソッド | 認証 | 説明 |
|----------------|----------|------|------|
| `/.well-known/oauth-protected-resource` | GET | 不要 | Protected Resource Metadata |
| `/.well-known/oauth-authorization-server` | GET | 不要 | Authorization Server Metadata |
| `/oauth/register` | POST | 不要 | Dynamic Client Registration |
| `/oauth/authorize` | GET | Session | 認可エンドポイント |
| `/oauth/token` | POST | 不要 | トークンエンドポイント |
| `/oauth/login` | GET/POST | 不要 | ユーザーログイン |
| `/mcp` | GET/POST | Bearer | MCP API |

---

## エラーレスポンス

### 認可エラー（リダイレクト）

```
https://claude.ai/api/mcp/auth_callback?
  error=access_denied&
  error_description=The+user+denied+the+request&
  state=xyz123
```

### トークンエラー

```json
{
  "error": "invalid_grant",
  "error_description": "The authorization code has expired"
}
```

### APIエラー

| ステータス | エラー | 説明 |
|------------|--------|------|
| 401 | `invalid_token` | トークンが無効または期限切れ |
| 401 | `invalid_client` | クライアントが削除された（DCR再登録が必要） |
| 403 | `insufficient_scope` | スコープ不足 |
| 400 | `invalid_request` | リクエスト形式が不正 |

---

## 実装タスク

### タスク38: OAuth 2.1 基盤実装

- [ ] 38.1 OAuthサーバー基盤クラスの作成
- [ ] 38.2 JWTアクセストークン生成・検証
- [ ] 38.3 PKCE (S256) 実装
- [ ] 38.4 認可コード管理（生成・保存・検証・無効化）
- [ ] 38.5 リフレッシュトークン管理

### タスク39: メタデータエンドポイント実装

- [ ] 39.1 `/.well-known/oauth-protected-resource` 実装
- [ ] 39.2 `/.well-known/oauth-authorization-server` 実装
- [ ] 39.3 WWW-Authenticateヘッダー生成

### タスク40: Dynamic Client Registration実装

- [ ] 40.1 `/oauth/register` エンドポイント実装
- [ ] 40.2 クライアント情報永続化
- [ ] 40.3 redirect_uri検証
- [ ] 40.4 クライアント削除対応

### タスク41: Authorization Endpoint実装

- [ ] 41.1 `/oauth/authorize` エンドポイント実装
- [ ] 41.2 ユーザーログイン画面
- [ ] 41.3 同意画面
- [ ] 41.4 認可コード発行

### タスク42: Token Endpoint実装

- [ ] 42.1 `/oauth/token` エンドポイント実装
- [ ] 42.2 authorization_code grant
- [ ] 42.3 refresh_token grant
- [ ] 42.4 PKCE code_verifier検証
- [ ] 42.5 resource パラメータ検証

### タスク43: HTTPサーバー統合

- [ ] 43.1 OAuthエンドポイントをHTTPサーバーに追加
- [ ] 43.2 Bearer認証ミドルウェア更新
- [ ] 43.3 既存JWT認証との互換性維持
- [ ] 43.4 全エンドポイントでのBearer認証

### タスク44: テスト

- [ ] 44.1 メタデータエンドポイントテスト
- [ ] 44.2 DCRテスト
- [ ] 44.3 認可フローE2Eテスト
- [ ] 44.4 トークン検証テスト
- [ ] 44.5 セキュリティテスト

### タスク45: Static Token サポート（CLIアクセス用）

- [x] 45.1 `--generate-token` CLIオプションの追加
- [x] 45.2 OAuth2設定への`allowStaticTokens`/`staticTokenSecret`追加
- [x] 45.3 トークン検証ロジックの更新（OAuth + Static Token両方を試行）
- [x] 45.4 localhost callback動的ポートサポート
- [ ] 45.5 Static Tokenテスト

---

## 設定ファイル拡張

### ~/.sage/remote-config.json

```json
{
  "remote": {
    "enabled": true,
    "port": 443,
    "host": "0.0.0.0",
    "auth": {
      "type": "oauth2",
      "issuer": "https://sage.example.com",
      "accessTokenExpiry": "1h",
      "refreshTokenExpiry": "30d",
      "allowedRedirectUris": [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.com/api/mcp/auth_callback",
        "http://localhost/callback"
      ],
      "users": [
        {
          "username": "admin",
          "passwordHash": "$2b$10$..."
        }
      ],
      "scopes": {
        "mcp:read": "読み取り専用アクセス",
        "mcp:write": "読み書きアクセス",
        "mcp:admin": "管理者アクセス"
      },
      "allowStaticTokens": true,
      "staticTokenSecret": "your-secret-key-at-least-32-characters"
    },
    "cors": {
      "allowedOrigins": ["https://claude.ai", "https://claude.com"]
    }
  }
}
```

---

## 参考資料

1. [MCP Authorization Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
2. [Building Custom Connectors via Remote MCP Servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
3. [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
4. [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
5. [RFC 7591 - OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
6. [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
7. [RFC 8707 - Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707)
8. [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
