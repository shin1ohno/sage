# Remote MCP Setup Guide

このガイドでは、iOS/iPadOS/Web クライアントから sage を使用するための Remote MCP Server のセットアップ手順を説明します。

## 重要: macOS が必須

**Remote MCP Server は macOS 上で実行する必要があります。**

sage は AppleScript を使用して Apple Reminders や Calendar と統合しているため、Remote MCP Server も macOS でなければ動作しません。Docker や Linux サーバー、Cloudflare Workers では実行できません。

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

### Step 2: Remote MCP Server を起動

```bash
# 環境変数を設定して起動
export SAGE_REMOTE_MODE=true
export SAGE_AUTH_SECRET="your-secure-secret-key-at-least-32-chars"
export SAGE_PORT=3000

npx @shin1ohno/sage --remote
```

または、設定ファイルを使用:

```bash
# ~/.sage/remote-config.json を作成
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

# 起動
npx @shin1ohno/sage --remote --config ~/.sage/remote-config.json
```

> **注意**: Claude iOS App は OAuth 2.0 認証のみサポートしているため、
> 現在は `"type": "none"` で認証なしモードを使用してください。
> ローカルネットワーク内でのみ使用することを推奨します。

### Step 3: Mac の IP アドレスを確認

```bash
# Wi-Fi の IP アドレスを確認
ipconfig getifaddr en0

# 例: 192.168.1.100
```

### Step 4: ファイアウォールの設定

macOS のファイアウォールでポート 3000 を許可:

1. 「システム設定」→「ネットワーク」→「ファイアウォール」
2. 「オプション...」をクリック
3. 必要に応じて設定を調整

### Step 5: 認証トークンを取得

サーバー起動時にログに表示される JWT トークンを使用するか、以下で生成:

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

### Step 6: クライアントから接続

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

> **⚠️ Claude iOS App の制限**
>
> Claude iOS App は現在 **OAuth 2.0 認証のみ**をサポートしています。
> sage は OAuth 2.0 を実装していないため、Claude iOS から使用する場合は
> **認証なしモード（`"type": "none"`）**を使用してください。
>
> 以下の JWT / API Key 認証は、カスタムクライアントや curl 等での使用を想定しています。

### 認証なし（Claude iOS 用）

Claude iOS App から使用する場合はこの設定を使用してください。

**設定:**
```json
{
  "auth": {
    "type": "none"
  }
}
```

**セキュリティ注意:** ローカルネットワーク内でのみ使用してください。

### JWT 認証（カスタムクライアント用）

最も安全で柔軟な認証方式です。

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

**クライアントでの使用:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### API Key 認証

シンプルな認証方式です。

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

### IP ホワイトリスト

特定の IP アドレスからのアクセスのみ許可します。

**設定:**
```json
{
  "auth": {
    "type": "jwt",
    "secret": "...",
    "ipWhitelist": [
      "192.168.1.0/24",
      "10.0.0.0/8"
    ]
  }
}
```

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

> **重要**: Claude iOS App は現在 **OAuth 2.0 認証のみ**をサポートしています。
> sage は OAuth 2.0 を実装していないため、**認証なしモード**で使用してください。
> ローカルネットワーク内でのみ使用することを推奨します。

1. Claude App を開く
2. 設定 → MCP Servers（またはカスタムコネクタ）
3. 「Add Server」をタップ
4. 以下を入力:
   - **名前**: sage
   - **リモートMCPサーバーURL**: `http://192.168.x.x:3000/mcp`（Mac の IP アドレス）
   - **OAuth Client ID**: （空欄のまま）
   - **OAuth クライアントシークレット**: （空欄のまま）
5. 「追加」をタップ

**Mac の IP アドレス確認方法:**
```bash
ipconfig getifaddr en0
```

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

### 1. 強力なシークレットキーを使用

```bash
# 安全なランダムキーを生成
openssl rand -base64 32
```

### 2. HTTPS を使用

ローカルネットワーク外からアクセスする場合は必ず HTTPS を使用してください。

### 3. IP ホワイトリストを設定

可能であれば、アクセス元の IP アドレスを制限してください。

### 4. トークンの有効期限を設定

JWT トークンには適切な有効期限を設定してください。

### 5. Mac のスリープを防止

Remote MCP Server を実行している Mac がスリープすると接続が切れます:
- システム設定 → バッテリー → 電源アダプタ
- 「ディスプレイがオフのときにコンピュータを自動的にスリープさせない」を有効に

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

1. トークンが有効か確認
2. シークレットキーが一致しているか確認
3. トークンの有効期限を確認

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
