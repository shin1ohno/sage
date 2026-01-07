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

### 会議室検索で結果が返らない

**症状:**
- `search_room_availability` が空の結果を返す
- Google Calendar UI では会議室が表示されるのに、sage では検索できない

**原因:**

sage の会議室検索は、**ユーザーのカレンダーリストに追加された会議室のみ**を検索対象とします。
Google Workspace の会議室リソースは、デフォルトではユーザーのカレンダーリストに含まれていません。

**解決策:**

会議室をカレンダーリストに追加してください:

1. [Google Calendar](https://calendar.google.com) を開く

2. 左サイドバーの「他のカレンダー」の横にある「+」をクリック

3. 「Browse resources」を選択

4. 組織の会議室リソースが表示されるので、使用したい会議室にチェックを入れる

5. 追加後、sage で `search_room_availability` を実行すると、その会議室が検索対象になります

**複数の会議室を追加する場合:**

Browse resources から複数の会議室にチェックを入れてください。
追加した会議室は、左サイドバーの「他のカレンダー」セクションに表示されます。

**注意事項:**
- この設定は各ユーザーが個別に行う必要があります
- Browse resources に会議室が表示されない場合は、Google Workspace 管理者に確認してください

---

### ディレクトリ検索で結果が返らない

**症状:**
- `search_directory_people` が空の結果を返す
- "People API が有効になっていません" エラーが表示される
- "組織のディレクトリへのアクセスが拒否されました" エラーが表示される

**原因と解決策:**

#### 1. People API が有効になっていない

**症状:**
```
People API が有効になっていません。Google Cloud Console で有効化してください
```

**解決策:**

1. [Google Cloud Console](https://console.cloud.google.com) を開く

2. プロジェクトを選択（sage で使用している OAuth クライアントのプロジェクト）

3. 「API とサービス」→「ライブラリ」を選択

4. 「People API」を検索

5. 「有効にする」をクリック

#### 2. OAuth スコープが不足している

**症状:**
```
People API へのアクセス権限がありません。authenticate_google を実行して再認証してください
```

**解決策:**

sage を更新後、`authenticate_google` を実行して再認証してください。
これにより、新しい `directory.readonly` スコープが追加されます。

```
authenticate_google を実行してください
```

#### 3. 組織のディレクトリ共有が無効

**症状:**
```
組織のディレクトリへのアクセスが拒否されました。Google Workspace 管理者にディレクトリ共有の設定を確認してください。
```

**解決策:**

この問題は、組織の Google Workspace 管理者が設定を変更する必要があります。

1. Google Workspace 管理者に連絡

2. 以下の設定を確認してもらう:
   - [Admin Console](https://admin.google.com) → ディレクトリ → 共有設定
   - 「ディレクトリのユーザー情報の共有」が有効になっているか確認

3. 設定が有効になったら、sage で再度 `search_directory_people` を試す

#### 4. 検索クエリが短すぎる

**症状:**
- 検索結果が見つからない

**解決策:**

検索クエリはある程度の長さが必要です。1文字での検索は機能しない場合があります。
2文字以上のクエリを使用してください。

```
# 良い例
search_directory_people({ query: "田中" })

# 避ける
search_directory_people({ query: "田" })
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
# pm2 の場合
pm2 logs sage-remote

# launchd の場合
tail -f /tmp/sage-remote.log
tail -f /tmp/sage-remote.error.log

# nohup の場合
tail -f ~/.sage/server.log
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
