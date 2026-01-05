# Remote MCP Setup Guide

このガイドでは、iOS/iPadOS/Web クライアントから sage を使用するための Remote MCP Server のセットアップ手順を説明します。

## 重要: macOS が必須

**Remote MCP Server は macOS 上で実行する必要があります。**

sage は AppleScript を使用して Apple Reminders や Calendar と統合しているため、Remote MCP Server も macOS でなければ動作しません。Docker や Linux サーバー、Cloudflare Workers では実行できません。

## サポートされるトランスポート

**sage は HTTP Transport (`transport=http`) のみをサポートしています。**

- ✅ **HTTP Transport**: POST /mcp で同期的にリクエスト/レスポンスを処理
- ❌ **Streamable HTTP Transport (SSE)**: v0.7.7 で削除されました

すべてのクライアント（Claude iOS、Claude Desktop、Claude Code）は HTTP Transport を使用します。

## アーキテクチャ概要

```
┌─────────────────────┐     HTTPS      ┌─────────────────────┐
│   Claude iOS App    │ ──────────────→│  Remote MCP Server  │
│   Claude Web        │                │  (macOS 上で実行)    │
│   Other Clients     │                │                     │
└─────────────────────┘                └──────────┬──────────┘
                                                  │ AppleScript
                                       ┌──────────▼──────────┐
                                       │   Apple Reminders   │
                                       │   Calendar.app      │
                                       │   Notion (MCP経由)   │
                                       └─────────────────────┘
```

Remote MCP Server は HTTP/HTTPS 経由で MCP プロトコルを提供し、iOS/iPadOS/Web クライアントからの macOS 上の sage へのアクセスを可能にします。

---

## 前提条件

### サーバー要件（Remote MCP Server を実行する Mac）

- **OS**: **macOS** （必須 - AppleScript のため）
- **Node.js**: 18.0.0 以上
- **ポート**: 3000（デフォルト、変更可能）
- **ネットワーク**: クライアントからアクセス可能（ローカルネットワークまたはインターネット）

### クライアント要件

- Claude iOS App または Web ブラウザ
- サーバーへのネットワークアクセス

---

## セットアップ手順

### Step 1: sage をインストール

Remote MCP Server を実行する Mac で:

```bash
npm install -g @shin1ohno/sage
```

### Step 2: Encryption Key の設定（OAuth Persistence）

sage は OAuth トークンを暗号化して永続化します。サーバー再起動後も再認証不要でトークンが維持されます。

#### Encryption Key の管理方法

**方法1: 環境変数で指定（本番環境推奨）**

```bash
# 安全なランダムキーを生成（32文字以上）
openssl rand -hex 32

# 環境変数に設定
export SAGE_ENCRYPTION_KEY="your-generated-encryption-key-at-least-32-characters"
```

**方法2: 自動生成（開発環境）**

環境変数を設定しない場合、sage は自動的にキーを生成して `~/.sage/oauth_encryption_key` に保存します。

```bash
# キーなしで起動 - 自動生成される
npx @shin1ohno/sage --remote

# 生成されたキーの場所を確認
ls -l ~/.sage/oauth_encryption_key
# -rw------- 1 user staff 64 Jan 6 10:00 /Users/user/.sage/oauth_encryption_key
```

#### 暗号化キーのベストプラクティス

1. **本番環境では必ず `SAGE_ENCRYPTION_KEY` 環境変数を使用**
   - 自動生成されたキーはサーバーの再インストール時に失われます
   - 環境変数で管理すれば、サーバー移行時にトークンを維持できます

2. **キーは安全に保管**
   - パスワードマネージャーに保存
   - サーバー設定管理ツール（Ansible、Terraform等）で管理
   - 決して git にコミットしない

3. **pm2 や launchd で環境変数を設定**
   ```bash
   # pm2の例
   pm2 start "npx @shin1ohno/sage --remote" --name sage-remote \
     --env SAGE_ENCRYPTION_KEY="your-key-here"

   # launchd の例（EnvironmentVariables に追加）
   <key>SAGE_ENCRYPTION_KEY</key>
   <string>your-key-here</string>
   ```

4. **キーファイルのバックアップ（自動生成を使用する場合）**
   ```bash
   # バックアップ
   cp ~/.sage/oauth_encryption_key ~/.sage/oauth_encryption_key.backup

   # リストア
   cp ~/.sage/oauth_encryption_key.backup ~/.sage/oauth_encryption_key
   ```

#### 暗号化されたデータの保存場所

OAuth データは `~/.sage/` ディレクトリに保存されます：

| ファイル | 内容 | 暗号化 |
|---------|------|-------|
| `oauth_encryption_key` | 暗号化キー（自動生成時のみ） | なし（600パーミッション） |
| `oauth_refresh_tokens.enc` | リフレッシュトークン | AES-256-GCM |
| `oauth_clients.enc` | クライアント登録情報 | AES-256-GCM |
| `oauth_sessions.enc` | ユーザーセッション | AES-256-GCM |

### Step 3: Remote MCP Server を起動

sage は **OAuth 2.1** を完全実装しており、Claude iOS App と安全に連携できます。

#### 方法1: OAuth 2.0 認証（推奨）

```bash
# ~/.sage/remote-config.json を作成
cat > ~/.sage/remote-config.json << 'EOF'
{
  "remote": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "type": "oauth2",
      "issuer": "https://your-domain.com",
      "accessTokenExpiry": "1h",
      "refreshTokenExpiry": "30d",
      "allowedRedirectUris": [
        "https://claude.ai/api/mcp/auth_callback"
      ],
      "users": [
        {
          "username": "your-username",
          "passwordHash": "your-bcrypt-password-hash"
        }
      ],
      "scopes": {
        "mcp:read": "Read access to MCP resources",
        "mcp:write": "Write access to MCP resources"
      }
    },
    "cors": {
      "allowedOrigins": ["https://claude.ai"]
    }
  }
}
EOF

# 起動
npx @shin1ohno/sage --remote
```

#### 方法2: 環境変数を使用

```bash
export SAGE_REMOTE_MODE=true
export SAGE_AUTH_SECRET="your-secure-secret-key-at-least-32-chars"
export SAGE_PORT=3000

npx @shin1ohno/sage --remote
```

#### 方法3: 認証なし（ローカルネットワーク専用）

```bash
cat > ~/.sage/remote-config.json << 'EOF'
{
  "remote": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "type": "none"
    },
    "cors": {
      "allowedOrigins": ["*"]
    }
  }
}
EOF

npx @shin1ohno/sage --remote
```

> **⚠️ セキュリティ警告**: 認証なしモードはローカルネットワーク内でのみ使用してください。
> インターネット経由でアクセスする場合は必ず OAuth 2.0 認証を有効にしてください。

### Step 4: Mac の IP アドレスを確認

```bash
# Wi-Fi の IP アドレスを確認
ipconfig getifaddr en0

# 例: 192.168.1.100
```

### Step 5: ファイアウォールの設定

macOS のファイアウォールでポート 3000 を許可:

1. 「システム設定」→「ネットワーク」→「ファイアウォール」
2. 「オプション...」をクリック
3. 必要に応じて設定を調整

### Step 6: 認証トークンを取得

#### 方法1: CLI で生成（推奨）

```bash
# Bearer トークンを生成
npx @shin1ohno/sage --generate-token

# 出力例:
# Bearer token generated successfully.
#
# Token: eyJhbGciOiJIUzI1NiIs...
# Expires in: 3600 seconds
#
# Usage with Claude Code:
#   claude mcp add --transport http sage "http://your-server:3000/mcp" \
#     --header "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 方法2: API で生成

```bash
# トークン生成（サーバーが起動している状態で）
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-secure-secret-key-at-least-32-chars"}'
```

レスポンス例:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "24h"
}
```

### Step 7: クライアントから接続

iOS/iPadOS の Claude App で Remote MCP Server を設定:

**URL**: `http://192.168.1.100:3000/mcp`
**Authorization**: `Bearer eyJhbGciOiJIUzI1NiIs...`

---

## バックグラウンド実行

Mac を閉じても Remote MCP Server の実行を継続する場合:

### 方法1: nohup を使用

```bash
nohup npx @shin1ohno/sage --remote > ~/.sage/server.log 2>&1 &

# ログを確認
tail -f ~/.sage/server.log
```

### 方法2: pm2 を使用（推奨）

```bash
# pm2 をインストール
npm install -g pm2

# sage を起動
pm2 start "npx @shin1ohno/sage --remote" --name sage-remote

# 自動起動を設定
pm2 save
pm2 startup

# ログを確認
pm2 logs sage-remote

# 停止
pm2 stop sage-remote

# 再起動
pm2 restart sage-remote
```

### 方法3: launchd を使用（macOS ネイティブ）

```bash
# plist ファイルを作成
cat > ~/Library/LaunchAgents/com.sage.remote.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sage.remote</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>@shin1ohno/sage</string>
        <string>--remote</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SAGE_AUTH_SECRET</key>
        <string>your-secure-secret-key</string>
        <key>SAGE_PORT</key>
        <string>3000</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/sage-remote.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/sage-remote.error.log</string>
</dict>
</plist>
EOF

# 読み込んで起動
launchctl load ~/Library/LaunchAgents/com.sage.remote.plist

# 停止
launchctl unload ~/Library/LaunchAgents/com.sage.remote.plist
```

---

## 認証方式

Remote MCP Server は複数の認証方式をサポートしています。

| 認証方式 | Claude iOS | Claude Desktop | curl / カスタム | セキュリティ |
|---------|-----------|----------------|-----------------|-------------|
| OAuth 2.0 | ✅ 推奨 | ✅ | ✅ | 最高 |
| JWT | ❌ | ✅ | ✅ | 高 |
| API Key | ❌ | ✅ | ✅ | 中 |
| なし | ✅ | ✅ | ✅ | なし |

---

### OAuth 2.0 認証（推奨）

sage は **OAuth 2.1** を完全実装しており、Claude iOS App と安全に連携できます。

#### サポートする OAuth 仕様

| 仕様 | RFC | 状態 |
|------|-----|------|
| OAuth 2.1 Authorization Code + PKCE | RFC 7636 | ✅ 実装済み |
| Authorization Server Metadata | RFC 8414 | ✅ 実装済み |
| Protected Resource Metadata | RFC 9728 | ✅ 実装済み |
| Dynamic Client Registration | RFC 7591 | ✅ 実装済み |
| JWT Bearer Tokens | RS256 | ✅ 実装済み |

#### OAuth 2.0 基本設定

```json
{
  "remote": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "type": "oauth2",
      "issuer": "https://your-domain.com",
      "accessTokenExpiry": "1h",
      "refreshTokenExpiry": "30d",
      "allowedRedirectUris": [
        "https://claude.ai/api/mcp/auth_callback"
      ],
      "users": [
        {
          "username": "admin",
          "passwordHash": "$2b$10$..."
        }
      ],
      "scopes": {
        "mcp:read": "Read access to MCP resources",
        "mcp:write": "Write access to MCP resources",
        "mcp:admin": "Administrative access"
      }
    },
    "cors": {
      "allowedOrigins": ["https://claude.ai"]
    }
  }
}
```

#### OAuth 設定項目の詳細

| 項目 | 必須 | デフォルト | 説明 |
|------|------|-----------|------|
| `type` | ✅ | - | `"oauth2"` を指定 |
| `issuer` | ✅ | - | OAuth issuer URL（HTTPS推奨） |
| `accessTokenExpiry` | ❌ | `"1h"` | アクセストークンの有効期限 |
| `refreshTokenExpiry` | ❌ | `"30d"` | リフレッシュトークンの有効期限 |
| `allowedRedirectUris` | ❌ | Claude URLs | 許可するリダイレクトURI |
| `users` | ✅ | - | 認証可能なユーザーリスト |
| `scopes` | ❌ | 標準スコープ | カスタムスコープ定義 |
| `allowStaticTokens` | ❌ | `false` | 静的トークンも受け付けるか |
| `staticTokenSecret` | ❌ | - | 静的トークン用シークレット（32文字以上） |

#### OAuth2 + Static Token ハイブリッド設定（CLI対応）

Claude Code などの CLI ツールは OAuth フローが使えないため、静的トークンを併用できます：

```json
{
  "remote": {
    "auth": {
      "type": "oauth2",
      "issuer": "https://your-domain.com",
      "users": [...],
      "allowStaticTokens": true,
      "staticTokenSecret": "your-secret-key-at-least-32-characters"
    }
  }
}
```

この設定で：
- **Claude iOS/Web**: OAuth 2.0 フローで認証
- **Claude Code/CLI**: `--generate-token` で生成した静的トークンで認証

両方のトークンが同じ `/mcp` エンドポイントで受け付けられます。

#### パスワードハッシュの生成

ユーザーのパスワードは bcrypt でハッシュ化して保存します：

```bash
# Node.js で生成
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(console.log)"

# または npx を使用
npx -y bcrypt-cli hash "your-password"

# 出力例: $2b$10$X5a6J8K9L0M1N2O3P4Q5R.abcdefghijklmnopqrstuvwxyz012345
```

#### 複数ユーザーの設定

```json
{
  "auth": {
    "type": "oauth2",
    "issuer": "https://sage.example.com",
    "users": [
      {
        "username": "admin",
        "passwordHash": "$2b$10$...",
        "scopes": ["mcp:read", "mcp:write", "mcp:admin"]
      },
      {
        "username": "readonly",
        "passwordHash": "$2b$10$...",
        "scopes": ["mcp:read"]
      }
    ]
  }
}
```

#### OAuth エンドポイント

サーバー起動後、以下のエンドポイントが利用可能になります：

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/.well-known/oauth-protected-resource` | GET | Protected Resource Metadata |
| `/.well-known/oauth-authorization-server` | GET | Authorization Server Metadata |
| `/oauth/register` | POST | Dynamic Client Registration |
| `/oauth/authorize` | GET | 認可エンドポイント |
| `/oauth/token` | POST | トークンエンドポイント |
| `/oauth/login` | GET/POST | ユーザーログイン |

#### Claude iOS App での OAuth 接続

1. Claude App を開く
2. 設定 → MCP Servers
3. 「Add Server」をタップ
4. 以下を入力:
   - **名前**: sage
   - **Server URL**: `https://your-domain.com/mcp`

5. 認証フローが開始され、ログイン画面が表示されます
6. 設定したユーザー名とパスワードでログイン
7. 認可を許可すると、自動的にトークンが取得されます

---

### JWT 認証

カスタムクライアントや API 経由でのアクセスに適しています。

**設定:**
```json
{
  "auth": {
    "type": "jwt",
    "secret": "your-secret-key-at-least-32-characters",
    "expiresIn": "24h"
  }
}
```

**トークンの取得:**
```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-secret-key-at-least-32-characters"}'
```

**クライアントでの使用:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

### API Key 認証

シンプルな認証方式です。開発やテスト環境に適しています。

**設定:**
```json
{
  "auth": {
    "type": "api_key",
    "keys": [
      "key1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "key2-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
    ]
  }
}
```

**クライアントでの使用:**
```
X-API-Key: key1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 認証なし

ローカルネットワーク内でのテスト用です。

**設定:**
```json
{
  "auth": {
    "type": "none"
  }
}
```

> **⚠️ セキュリティ警告**: インターネットに公開する場合は絶対に使用しないでください。

---

### IP ホワイトリスト（併用可能）

他の認証方式と組み合わせて、特定の IP アドレスからのアクセスのみ許可できます。

**設定:**
```json
{
  "auth": {
    "type": "oauth2",
    "issuer": "https://sage.example.com",
    "users": [...],
    "ipWhitelist": [
      "192.168.1.0/24",
      "10.0.0.0/8"
    ]
  }
}
```

**CIDR 表記の例:**
| 表記 | 許可される IP 範囲 |
|------|-------------------|
| `192.168.1.0/24` | 192.168.1.0 〜 192.168.1.255 |
| `10.0.0.0/8` | 10.0.0.0 〜 10.255.255.255 |
| `192.168.1.100/32` | 192.168.1.100 のみ |

---

## HTTPS の設定（推奨）

インターネット経由でアクセスする場合は HTTPS を使用してください。

### 方法1: Caddy をリバースプロキシとして使用

```bash
# Caddy をインストール
brew install caddy

# Caddyfile を作成
cat > ~/Caddyfile << 'EOF'
your-domain.com {
    reverse_proxy localhost:3000
}
EOF

# Caddy を起動
caddy run --config ~/Caddyfile
```

### 方法2: ngrok を使用（開発・テスト用）

```bash
# ngrok をインストール
brew install ngrok

# トンネルを作成
ngrok http 3000
```

---

## クライアント設定

### Claude iOS App での設定

sage は OAuth 2.0 を完全実装しており、Claude iOS App と安全に連携できます。

#### 方法1: OAuth 2.0 認証（推奨）

HTTPS 経由でインターネットからアクセスする場合の設定です。

1. Claude App を開く
2. 設定 → MCP Servers
3. 「Add Server」をタップ
4. 以下を入力:
   - **名前**: sage
   - **Server URL**: `https://your-domain.com/mcp`
5. 「追加」をタップ
6. 認証画面が表示されるので、設定したユーザー名とパスワードでログイン
7. 認可を許可すると接続完了

> **ポイント**: OAuth 2.0 を使用する場合、sage は Dynamic Client Registration (RFC 7591) をサポートしているため、Client ID や Client Secret を手動で入力する必要はありません。

#### 方法2: ローカルネットワーク（認証なし）

ローカルネットワーク内でテストする場合の設定です。

1. Claude App を開く
2. 設定 → MCP Servers
3. 「Add Server」をタップ
4. 以下を入力:
   - **名前**: sage
   - **Server URL**: `http://192.168.x.x:3000/mcp`（Mac の IP アドレス）
5. 「追加」をタップ

**Mac の IP アドレス確認方法:**
```bash
ipconfig getifaddr en0
```

> **⚠️ セキュリティ注意**: 認証なしモードはローカルネットワーク内でのみ使用してください。

### Claude Code での設定

Claude Code (CLI) から Remote MCP Server に接続する方法です。

#### Step 1: サーバー設定を更新（OAuth2 + Static Token）

```json
{
  "remote": {
    "auth": {
      "type": "oauth2",
      "issuer": "https://your-domain.com",
      "users": [...],
      "allowStaticTokens": true,
      "staticTokenSecret": "your-secret-key-at-least-32-characters"
    }
  }
}
```

#### Step 2: Bearer トークンを生成

```bash
npx @shin1ohno/sage --generate-token
```

#### Step 3: Claude Code に MCP サーバーを追加

```bash
claude mcp add --transport http sage \
  "https://your-domain.com/mcp" \
  --header "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### Step 4: 動作確認

```bash
claude
# Claude Code を起動後、sage のツールが使えることを確認
```

> **ヒント**: ローカルネットワーク内であれば `http://192.168.x.x:3000/mcp` も使用可能です。

---

### Claude Desktop での設定

別の Mac から Remote MCP Server に接続する場合の設定方法です。

**Step 1: 設定ファイルを開く**

```bash
# VS Code で開く
code ~/Library/Application\ Support/Claude/claude_desktop_config.json

# または nano で開く
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Step 2: Remote MCP Server を追加**

```json
{
  "mcpServers": {
    "sage-remote": {
      "url": "http://192.168.x.x:3000/mcp"
    }
  }
}
```

> **注意**: `192.168.x.x` を Remote MCP Server を実行している Mac の IP アドレスに置き換えてください。

**既存の設定がある場合:**

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "...",
      "args": ["..."]
    },
    "sage-remote": {
      "url": "http://192.168.x.x:3000/mcp"
    }
  }
}
```

**Step 3: Claude Desktop を再起動**

1. Claude Desktop を完全に終了
2. Claude Desktop を再度起動

**Step 4: 動作確認**

Claude Desktop で以下のように入力:

```
check_setup_status を実行してください
```

> **ヒント**: 同じ Mac で sage を使用する場合は、Remote MCP Server を経由せず、
> [Local MCP Setup](SETUP-LOCAL.md) の方法で直接接続することを推奨します。

---

## セキュリティのベストプラクティス

### 1. OAuth 2.0 を使用（推奨）

インターネット経由でアクセスする場合は必ず OAuth 2.0 認証を使用してください：

```json
{
  "auth": {
    "type": "oauth2",
    "issuer": "https://your-domain.com",
    "users": [...]
  }
}
```

### 2. 強力なパスワードを使用

OAuth ユーザーのパスワードには強力なものを設定してください：

```bash
# 安全なランダムパスワードを生成
openssl rand -base64 24

# bcrypt ハッシュを生成
npx -y bcrypt-cli hash "your-strong-password"
```

### 3. HTTPS を必ず使用

インターネット経由でアクセスする場合は必ず HTTPS を使用してください。OAuth 2.0 のセキュリティは HTTPS に依存しています。

### 4. IP ホワイトリストを設定

可能であれば、アクセス元の IP アドレスを制限してください：

```json
{
  "auth": {
    "type": "oauth2",
    "ipWhitelist": ["192.168.1.0/24"]
  }
}
```

### 5. トークンの有効期限を適切に設定

アクセストークンは短く、リフレッシュトークンは適切な長さに設定してください：

```json
{
  "auth": {
    "type": "oauth2",
    "accessTokenExpiry": "1h",
    "refreshTokenExpiry": "7d"
  }
}
```

### 6. スコープを適切に設定

ユーザーごとに必要最小限のスコープを設定してください：

```json
{
  "users": [
    {
      "username": "readonly-user",
      "passwordHash": "...",
      "scopes": ["mcp:read"]
    }
  ]
}
```

### 7. Mac のスリープを防止

Remote MCP Server を実行している Mac がスリープすると接続が切れます:
- システム設定 → バッテリー → 電源アダプタ
- 「ディスプレイがオフのときにコンピュータを自動的にスリープさせない」を有効に

### 8. ログイン試行回数の制限

sage は自動的にログイン試行回数を制限しています（5回/15分）。ブルートフォース攻撃から保護されています。

---

## トラブルシューティング

### 接続できない

1. サーバーが起動しているか確認
   ```bash
   curl http://localhost:3000/health
   ```

2. ファイアウォールの設定を確認
   ```bash
   sudo lsof -i :3000
   ```

3. IP アドレスが正しいか確認
   ```bash
   ipconfig getifaddr en0
   ```

### 認証エラー

#### OAuth 2.0 の場合

1. **issuer URL が正しいか確認**
   ```bash
   curl https://your-domain.com/.well-known/oauth-authorization-server
   ```

2. **パスワードハッシュが正しいか確認**
   ```bash
   # 新しいハッシュを生成して比較
   npx -y bcrypt-cli hash "your-password"
   ```

3. **redirect_uri が許可リストに含まれているか確認**
   - `allowedRedirectUris` に `https://claude.ai/api/mcp/auth_callback` が含まれていること

4. **HTTPS が正しく設定されているか確認**
   - OAuth 2.0 は HTTPS を前提としています

5. **ログイン試行回数を超えていないか確認**
   - 5回失敗すると15分間ロックされます
   - サーバーを再起動するとリセットされます

#### JWT / API Key の場合

1. トークンが有効か確認
2. シークレットキーが一致しているか確認
3. トークンの有効期限を確認

#### 共通

```bash
# サーバーログを確認
tail -f ~/.sage/server.log
```

### Apple Reminders が動作しない

1. Remote MCP Server が macOS 上で実行されているか確認
2. AppleScript の権限が付与されているか確認:
   - システム設定 → プライバシーとセキュリティ → オートメーション
   - Terminal（または使用しているターミナル）の Reminders/Calendar へのアクセスを許可

---

## 次のステップ

- [Local MCP Setup](SETUP-LOCAL.md) - Claude Desktop/Code での直接使用
- [Configuration Guide](CONFIGURATION.md) - 詳細な設定オプション
- [Troubleshooting](TROUBLESHOOTING.md) - 問題解決ガイド
