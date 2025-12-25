# Troubleshooting Guide

sage の問題を解決するためのガイドです。

## 目次

- [インストール・セットアップの問題](#インストールセットアップの問題)
- [MCP 接続の問題](#mcp-接続の問題)
- [Apple Reminders の問題](#apple-reminders-の問題)
- [カレンダーの問題](#カレンダーの問題)
- [Notion 統合の問題](#notion-統合の問題)
- [Remote MCP の問題](#remote-mcp-の問題)
- [パフォーマンスの問題](#パフォーマンスの問題)
- [ログの確認方法](#ログの確認方法)

---

## インストール・セットアップの問題

### Node.js が見つからない

**症状:**
```
command not found: node
```

**解決策:**

1. Node.js をインストール:
```bash
# Homebrew
brew install node

# または nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

2. バージョンを確認:
```bash
node --version  # v18.0.0 以上
npm --version
```

---

### npx コマンドが失敗する

**症状:**
```
npm ERR! could not determine executable to run
```

**解決策:**

1. npm キャッシュをクリア:
```bash
npm cache clean --force
```

2. グローバルインストールを試す:
```bash
npm install -g @shin1ohno/sage
sage --version
```

---

### 設定ファイルが作成されない

**症状:**
- `~/.sage/config.json` が存在しない
- セットアップウィザードが完了しない

**解決策:**

1. ディレクトリを手動作成:
```bash
mkdir -p ~/.sage
```

2. 権限を確認:
```bash
ls -la ~/.sage
# drwxr-xr-x ... であること
```

3. セットアップウィザードを再実行:
```
sage のセットアップウィザードを開始してください
```

---

## MCP 接続の問題

### sage がツールリストに表示されない

**Claude Desktop の場合:**

1. 設定ファイルの構文を確認:
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
```

2. JSON が正しい形式か確認:
```json
{
  "mcpServers": {
    "sage": {
      "command": "npx",
      "args": ["-y", "@shin1ohno/sage"]
    }
  }
}
```

3. Claude Desktop を完全に再起動:
   - メニューバーの Claude アイコンを右クリック → 終了
   - Claude Desktop を再起動

**Claude Code の場合:**

1. MCP 一覧を確認:
```bash
claude mcp list
```

2. sage が表示されない場合は再追加:
```bash
claude mcp remove sage
claude mcp add sage -- npx -y @shin1ohno/sage
```

---

### "Server disconnected" エラー

**症状:**
```
MCP Server "sage" disconnected
```

**解決策:**

1. sage を単独で実行してエラーを確認:
```bash
npx @shin1ohno/sage
# Ctrl+C で終了
```

2. エラーメッセージがあれば対処

3. Node.js バージョンを確認:
```bash
node --version  # v18.0.0 以上
```

---

### "Permission denied" エラー

**症状:**
```
EACCES: permission denied
```

**解決策:**

```bash
# npm のパーミッションを修正
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# または、nvm を使用して Node.js を再インストール
```

---

## Apple Reminders の問題

### リマインダーが作成されない

**症状:**
- `set_reminder` を実行してもリマインダーが作成されない
- エラーメッセージなし

**解決策:**

1. AppleScript の実行権限を確認:
```bash
osascript -e 'tell application "Reminders" to get name of default list'
```

2. 権限ダイアログが表示されたら「OK」をクリック

3. システム環境設定で権限を確認:
   - システム環境設定 → セキュリティとプライバシー → プライバシー
   - 「リマインダー」を選択
   - Terminal（または使用しているターミナル）にチェック

---

### "User canceled" エラー

**症状:**
```
Error: User canceled
```

**解決策:**

権限ダイアログを許可してください。

既に拒否してしまった場合:
1. システム環境設定 → セキュリティとプライバシー → プライバシー → リマインダー
2. Terminal のチェックを外す
3. チェックを再度入れる
4. ターミナルを再起動

---

### 指定したリストが見つからない

**症状:**
```
List "仕事" not found
```

**解決策:**

1. リスト名を確認:
```bash
osascript -e 'tell application "Reminders" to get name of every list'
```

2. 設定を更新:
```
sage の設定で appleReminders.defaultList を "正しいリスト名" に更新してください
```

---

## カレンダーの問題

### カレンダーイベントが取得できない

**症状:**
- `find_available_slots` が空の結果を返す
- カレンダー統合が動作しない

**解決策:**

1. AppleScript でカレンダーにアクセスできるか確認:
```bash
osascript -e 'tell application "Calendar" to get name of every calendar'
```

2. 権限を確認:
   - システム環境設定 → セキュリティとプライバシー → プライバシー → カレンダー
   - Terminal にチェック

3. Calendar.app が起動しているか確認（バックグラウンドでもOK）

---

### タイムゾーンがずれる

**症状:**
- 予定の時刻が正しく表示されない

**解決策:**

1. 設定でタイムゾーンを確認:
```bash
cat ~/.sage/config.json | grep -A2 timeZone
```

2. タイムゾーンを更新:
```
sage の設定で calendar.timeZone を "Asia/Tokyo" に更新してください
```

---

## Notion 統合の問題

### Notion に接続できない

**症状:**
```
Error: Notion MCP server not available
```

**解決策:**

1. Notion MCP サーバーが設定されているか確認:

**Claude Code:**
```bash
claude mcp list | grep notion
```

**Claude Desktop:**
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | grep -A5 notion
```

2. Notion MCP サーバーを追加:

**Claude Code:**
```bash
claude mcp add notion -- npx -y @modelcontextprotocol/server-notion
```

3. NOTION_API_KEY が設定されているか確認

---

### "Database not found" エラー

**症状:**
```
Error: Database not found or access denied
```

**解決策:**

1. データベース ID が正しいか確認:
   - Notion でデータベースを開く
   - URL から ID を取得: `notion.so/workspace/xxx` の `xxx` 部分

2. Integration がデータベースに接続されているか確認:
   - データベースページを開く
   - 右上の「...」→「Connections」
   - 作成した Integration を追加

3. 設定を更新:
```
sage の設定で notion.databaseId を "正しいID" に更新してください
```

---

### "Unauthorized" エラー

**症状:**
```
Error: Unauthorized
```

**解決策:**

1. NOTION_API_KEY が正しいか確認:
   - [Notion Integrations](https://www.notion.so/my-integrations) で確認
   - 「Show」をクリックして API Key を再取得

2. 環境変数を更新:

**Claude Desktop:**
```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-notion"],
      "env": {
        "NOTION_API_KEY": "secret_xxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Remote MCP の問題

### サーバーに接続できない

**症状:**
```
Connection refused
```

**解決策:**

1. サーバーが起動しているか確認:
```bash
curl http://localhost:3000/health
```

2. ファイアウォールを確認:
```bash
# ポートが開いているか確認
sudo lsof -i :3000
```

3. 正しい IP アドレス/ホスト名を使用しているか確認:
```bash
# Mac の IP アドレス
ipconfig getifaddr en0
```

---

### 認証エラー

**症状:**
```
401 Unauthorized
```

**解決策:**

1. トークンが正しいか確認:
```bash
# トークンを再生成
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-secret-key"}'
```

2. トークンの有効期限を確認

3. Authorization ヘッダーの形式を確認:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

### SSL/TLS エラー

**症状:**
```
SSL certificate problem
```

**解決策:**

1. HTTPS を使用している場合、証明書が有効か確認:
```bash
openssl s_client -connect your-domain.com:443
```

2. 自己署名証明書の場合、クライアントで許可:
```bash
# 開発環境のみ
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

---

## パフォーマンスの問題

### 応答が遅い

**症状:**
- タスク分析に時間がかかる
- リマインダー作成が遅い

**解決策:**

1. AppleScript の実行は数百ミリ秒かかることがあります（正常）

2. 多数のタスクを一度に処理する場合は分割:
```
# 良い例
10個のタスクを分析してください

# 避ける
100個のタスクを一度に分析してください
```

3. Remote MCP の場合、ネットワーク遅延を確認:
```bash
ping your-server.com
```

---

### メモリ使用量が高い

**症状:**
- Node.js プロセスのメモリ使用量が高い

**解決策:**

1. Node.js のバージョンを最新に更新

2. プロセスを再起動:
```bash
# pm2 を使用している場合
pm2 restart sage-remote
```

---

## ログの確認方法

### sage のログ

```bash
# 開発モードで詳細ログを表示
DEBUG=sage:* npx @shin1ohno/sage
```

### Claude Desktop のログ

```bash
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log
```

### Remote MCP Server のログ

```bash
# Docker の場合
docker logs -f sage-remote

# pm2 の場合
pm2 logs sage-remote
```

---

## サポート

問題が解決しない場合:

1. [GitHub Issues](https://github.com/shin1ohno/sage/issues) で検索
2. 新しい Issue を作成する際は以下を含めてください:
   - OS とバージョン
   - Node.js バージョン
   - エラーメッセージ（全文）
   - 再現手順

---

## 関連ドキュメント

- [Local MCP Setup](SETUP-LOCAL.md)
- [Remote MCP Setup](SETUP-REMOTE.md)
- [Configuration Guide](CONFIGURATION.md)
