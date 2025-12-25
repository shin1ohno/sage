# Remote MCP Setup Guide

このガイドでは、iOS/iPadOS/Web クライアントから sage を使用するための Remote MCP Server のセットアップ手順を説明します。

## アーキテクチャ概要

```
┌─────────────────────┐     HTTPS      ┌─────────────────────┐
│   Claude iOS App    │ ──────────────→│  Remote MCP Server  │
│   Claude Web        │                │  (macOS/Cloud)      │
│   Other Clients     │                │                     │
└─────────────────────┘                └──────────┬──────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │   sage Core Logic   │
                                       │  ┌────────────────┐ │
                                       │  │Apple Reminders │ │
                                       │  │Calendar        │ │
                                       │  │Notion          │ │
                                       │  └────────────────┘ │
                                       └─────────────────────┘
```

Remote MCP Server は HTTP/HTTPS 経由で MCP プロトコルを提供し、iOS/iPadOS/Web クライアントからのアクセスを可能にします。

---

## 前提条件

### サーバー要件

- **OS**: macOS（Apple Reminders/Calendar統合に必要）または Linux（Notion のみ）
- **Node.js**: 18.0.0 以上
- **ポート**: 3000（デフォルト、変更可能）
- **ネットワーク**: クライアントからアクセス可能（ローカルネットワークまたはインターネット）

### クライアント要件

- Claude iOS App または Web ブラウザ
- サーバーへのネットワークアクセス

---

## デプロイメント方法の選択

| 方法 | 難易度 | ユースケース |
|------|--------|-------------|
| [ローカル Mac](#ローカル-mac-でのセットアップ) | 簡単 | 自宅内での使用 |
| [Docker](#docker-でのセットアップ) | 中程度 | サーバーでの運用 |
| [Cloudflare Workers](#cloudflare-workers-でのセットアップ) | 中程度 | グローバルアクセス |

---

## ローカル Mac でのセットアップ

自宅の Mac で Remote MCP Server を実行し、同じネットワーク内の iOS/iPadOS デバイスからアクセスする方法です。

### Step 1: sage をインストール

```bash
npm install -g @shin1ohno/sage
```

### Step 2: Remote MCP Server を起動

```bash
# 環境変数を設定して起動
export SAGE_REMOTE_MODE=true
export SAGE_AUTH_SECRET="your-secure-secret-key"
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
      "type": "jwt",
      "secret": "your-secure-secret-key-at-least-32-chars",
      "expiresIn": "24h"
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

### Step 3: Mac の IP アドレスを確認

```bash
# Wi-Fi の IP アドレスを確認
ipconfig getifaddr en0

# 例: 192.168.1.100
```

### Step 4: ファイアウォールの設定

macOS のファイアウォールでポート 3000 を許可:

1. 「システム環境設定」→「セキュリティとプライバシー」→「ファイアウォール」
2. 「ファイアウォールオプション...」をクリック
3. 「+」ボタンでアプリケーションを追加するか、「外部からの接続をすべてブロック」のチェックを外す

### Step 5: 認証トークンを取得

サーバー起動時にログに表示される JWT トークンを使用するか、以下で生成:

```bash
# トークン生成（サーバーが起動している状態で）
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-secure-secret-key"}'
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

### Step 7: バックグラウンド実行（任意）

Mac を閉じても実行を継続する場合:

```bash
# nohup を使用
nohup npx @shin1ohno/sage --remote > ~/.sage/server.log 2>&1 &

# または pm2 を使用
npm install -g pm2
pm2 start "npx @shin1ohno/sage --remote" --name sage-remote
pm2 save
pm2 startup
```

---

## Docker でのセットアップ

Docker を使用してサーバー環境で実行する方法です。

### Step 1: リポジトリをクローン

```bash
git clone https://github.com/shin1ohno/sage.git
cd sage
```

### Step 2: 環境変数ファイルを作成

```bash
cat > .env << 'EOF'
# Authentication
SAGE_AUTH_SECRET=your-secure-secret-key-at-least-32-characters
SAGE_AUTH_TYPE=jwt

# Server
SAGE_PORT=3000
SAGE_HOST=0.0.0.0

# Notion (optional)
NOTION_API_KEY=your-notion-api-key
NOTION_DATABASE_ID=your-database-id

# CORS
SAGE_CORS_ORIGINS=*
EOF
```

### Step 3: Docker イメージをビルド

```bash
docker build -t sage-mcp-server .
```

### Step 4: コンテナを起動

```bash
docker run -d \
  --name sage-remote \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  sage-mcp-server
```

### Step 5: ログを確認

```bash
docker logs -f sage-remote
```

### Step 6: 動作確認

```bash
curl http://localhost:3000/health
# {"status":"ok","version":"0.1.0"}
```

---

## docker-compose でのセットアップ

複数のサービスを一緒に管理する場合に便利です。

### Step 1: docker-compose.yml を確認

```yaml
version: '3.8'

services:
  sage-remote:
    build: .
    ports:
      - "3000:3000"
    environment:
      - SAGE_AUTH_SECRET=${SAGE_AUTH_SECRET}
      - SAGE_AUTH_TYPE=jwt
      - SAGE_PORT=3000
      - NOTION_API_KEY=${NOTION_API_KEY}
    restart: unless-stopped
    volumes:
      - sage-config:/root/.sage

volumes:
  sage-config:
```

### Step 2: 起動

```bash
# 環境変数を設定
export SAGE_AUTH_SECRET="your-secure-secret-key"
export NOTION_API_KEY="your-notion-api-key"

# 起動
docker-compose up -d

# ログ確認
docker-compose logs -f
```

---

## Cloudflare Workers でのセットアップ

グローバルにアクセス可能な環境で実行する方法です。

### 注意事項

Cloudflare Workers では以下の制限があります:

- **Apple Reminders/Calendar は使用不可**（AppleScript が実行できないため）
- **Notion 統合のみ利用可能**
- ファイルシステムへのアクセス不可

### Step 1: Wrangler をインストール

```bash
npm install -g wrangler
```

### Step 2: Cloudflare にログイン

```bash
wrangler login
```

### Step 3: シークレットを設定

```bash
wrangler secret put SAGE_AUTH_SECRET
# プロンプトでシークレットキーを入力

wrangler secret put NOTION_API_KEY
# プロンプトで Notion API Key を入力
```

### Step 4: デプロイ

```bash
wrangler deploy
```

### Step 5: 動作確認

```bash
curl https://sage-remote.<your-subdomain>.workers.dev/health
```

---

## 認証方式

Remote MCP Server は複数の認証方式をサポートしています。

### JWT 認証（推奨）

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

## HTTPS の設定

本番環境では HTTPS を使用することを強く推奨します。

### 方法1: リバースプロキシ（推奨）

Nginx や Caddy をリバースプロキシとして使用:

**Caddy の例:**

```bash
# Caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

```bash
caddy run
```

### 方法2: Let's Encrypt 証明書を直接使用

```bash
# certbot で証明書を取得
sudo certbot certonly --standalone -d your-domain.com

# 環境変数で設定
export SAGE_SSL_CERT=/etc/letsencrypt/live/your-domain.com/fullchain.pem
export SAGE_SSL_KEY=/etc/letsencrypt/live/your-domain.com/privkey.pem

npx @shin1ohno/sage --remote
```

---

## クライアント設定

### Claude iOS App での設定

1. Claude App を開く
2. 設定 → MCP Servers
3. 「Add Server」をタップ
4. 以下を入力:
   - **Name**: sage
   - **URL**: `https://your-domain.com/mcp`
   - **Authorization**: `Bearer <your-token>`
5. 「Save」をタップ
6. 「Test Connection」で接続を確認

### Claude Web での設定

（Claude Web の MCP サポートが利用可能になった場合）

1. Claude Web を開く
2. Settings → Integrations → MCP Servers
3. 「Add Server」をクリック
4. サーバー情報を入力
5. 保存して接続テスト

---

## セキュリティのベストプラクティス

### 1. 強力なシークレットキーを使用

```bash
# 安全なランダムキーを生成
openssl rand -base64 32
```

### 2. HTTPS を必須にする

本番環境では常に HTTPS を使用してください。

### 3. IP ホワイトリストを設定

可能であれば、アクセス元の IP アドレスを制限してください。

### 4. トークンの有効期限を設定

JWT トークンには適切な有効期限を設定してください。

### 5. ログを監視

```bash
# ログを確認
docker logs -f sage-remote | grep -E "(error|warn|auth)"
```

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

Remote MCP Server が macOS 以外で実行されている場合、Apple Reminders は使用できません。macOS で実行してください。

---

## 次のステップ

- [設定ガイド](CONFIGURATION.md) - 詳細な設定オプション
- [アーキテクチャ](ARCHITECTURE.md) - システム設計の詳細
- [トラブルシューティング](TROUBLESHOOTING.md) - 問題解決ガイド
