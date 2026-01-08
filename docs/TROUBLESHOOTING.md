# Troubleshooting Guide

sage の問題を解決するためのガイドです。

## 目次

- [インストール・セットアップの問題](#インストールセットアップの問題)
- [MCP 接続の問題](#mcp-接続の問題)
- [Apple Reminders の問題](#apple-reminders-の問題)
- [カレンダーの問題](#カレンダーの問題)
- [Notion 統合の問題](#notion-統合の問題)
- [Remote MCP の問題](#remote-mcp-の問題)
- [定期イベントの問題](#定期イベントの問題)
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

## 定期イベントの問題

### RRULE の構文エラー

**症状:**
```
Invalid RRULE syntax
FREQ is required in RRULE
Invalid rule part format
```

**原因:**

RRULE（Recurrence Rule）は iCalendar RFC5545 の仕様に従った厳密な構文が必要です。

**一般的なエラーと解決策:**

#### 1. FREQ が指定されていない

**エラー例:**
```
INTERVAL=2;BYDAY=MO,WE,FR
```

**解決策:**

FREQ は必須です。必ず含めてください。

```
# 正しい例
FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR
```

#### 2. 無効な FREQ 値

**エラー例:**
```
FREQ=DAILY_WORK  # 無効
FREQ=Week        # 無効（小文字は不可）
```

**解決策:**

FREQ は以下のいずれかである必要があります（大文字）：
- `DAILY` - 毎日
- `WEEKLY` - 毎週
- `MONTHLY` - 毎月
- `YEARLY` - 毎年

```
# 正しい例
FREQ=DAILY
FREQ=WEEKLY
FREQ=MONTHLY
FREQ=YEARLY
```

#### 3. 無効な INTERVAL 値

**エラー例:**
```
FREQ=WEEKLY;INTERVAL=0      # ゼロは不可
FREQ=WEEKLY;INTERVAL=-1     # 負の値は不可
FREQ=WEEKLY;INTERVAL=abc    # 数値でない
```

**解決策:**

INTERVAL は 1 以上の正の整数である必要があります。

```
# 正しい例
FREQ=WEEKLY;INTERVAL=1   # 毎週
FREQ=WEEKLY;INTERVAL=2   # 2週間ごと
FREQ=MONTHLY;INTERVAL=3  # 3ヶ月ごと
```

#### 4. COUNT と UNTIL の併用

**エラー例:**
```
FREQ=WEEKLY;COUNT=10;UNTIL=20251231
```

**エラーメッセージ:**
```
COUNT and UNTIL are mutually exclusive
```

**解決策:**

COUNT（回数指定）と UNTIL（終了日指定）は同時に使用できません。どちらか一方のみを使用してください。

```
# 正しい例1: 回数指定
FREQ=WEEKLY;COUNT=10

# 正しい例2: 終了日指定
FREQ=WEEKLY;UNTIL=20251231
```

#### 5. 無効な BYDAY 値

**エラー例:**
```
FREQ=WEEKLY;BYDAY=Monday      # 英語フルスペルは不可
FREQ=WEEKLY;BYDAY=MON         # 3文字は不可（2文字のみ）
FREQ=WEEKLY;BYDAY=Mo          # 小文字は不可
```

**解決策:**

BYDAY は以下の2文字コードを使用してください（大文字）：
- `MO` - 月曜日
- `TU` - 火曜日
- `WE` - 水曜日
- `TH` - 木曜日
- `FR` - 金曜日
- `SA` - 土曜日
- `SU` - 日曜日

```
# 正しい例
FREQ=WEEKLY;BYDAY=MO              # 毎週月曜日
FREQ=WEEKLY;BYDAY=MO,WE,FR        # 毎週月水金
FREQ=MONTHLY;BYDAY=1MO            # 毎月第1月曜日
FREQ=MONTHLY;BYDAY=-1FR           # 毎月最終金曜日
```

#### 6. 無効な BYMONTHDAY 値

**エラー例:**
```
FREQ=MONTHLY;BYMONTHDAY=0     # ゼロは不可
FREQ=MONTHLY;BYMONTHDAY=32    # 32日は存在しない
FREQ=MONTHLY;BYMONTHDAY=-32   # -32は範囲外
```

**解決策:**

BYMONTHDAY は以下の範囲の値を使用してください：
- 正の値: 1〜31（月の1日目から31日目）
- 負の値: -1〜-31（月の最終日から逆算）

```
# 正しい例
FREQ=MONTHLY;BYMONTHDAY=15        # 毎月15日
FREQ=MONTHLY;BYMONTHDAY=1,15      # 毎月1日と15日
FREQ=MONTHLY;BYMONTHDAY=-1        # 毎月最終日
```

#### 7. 無効な UNTIL 日付形式

**エラー例:**
```
FREQ=DAILY;UNTIL=2025-12-31      # ハイフン付きは不可
FREQ=DAILY;UNTIL=12/31/2025      # スラッシュ形式は不可
FREQ=DAILY;UNTIL=2025年12月31日  # 日本語は不可
```

**解決策:**

UNTIL は以下の形式を使用してください：
- `YYYYMMDD` 形式（推奨）
- `YYYYMMDDTHHMMSSZ` 形式（UTC時刻付き）
- ISO 8601 形式（例：`2025-12-31T23:59:59Z`）

```
# 正しい例
FREQ=DAILY;UNTIL=20251231             # YYYYMMDD形式（推奨）
FREQ=DAILY;UNTIL=20251231T235959Z     # 時刻付き
FREQ=DAILY;UNTIL=2025-12-31T23:59:59Z # ISO 8601形式
```

---

### Google Calendar が必要

**症状:**
```
Recurring events require Google Calendar authentication
Google Calendar is not available
```

**原因:**

定期イベント（RRULE）機能は Google Calendar API を使用します。
以下の理由により、定期イベントには Google Calendar 認証が必須です：

1. **RRULE 展開の複雑性**: 定期イベントの個々の発生（occurrence）への展開は複雑
2. **タイムゾーン処理**: 正確なタイムゾーン処理が必要
3. **例外処理**: 特定日の除外や変更のサポート
4. **API の限界**: macOS Calendar.app の AppleScript は定期イベントの作成に制限あり

**解決策:**

Google Calendar 認証を実行してください：

```
authenticate_google を実行してください
```

認証後、以下の定期イベント機能が利用可能になります：

1. **定期イベントの作成**: `create_calendar_event` に `recurrence` パラメータを指定
2. **定期イベントの更新**: `update_calendar_event` で RRULE を変更
3. **個別発生の更新**: 定期イベントの特定日のみを変更（`thisAndFollowing` オプション）
4. **イベント一覧の取得**: `list_calendar_events` で定期イベントを含む全イベントを取得

**注意事項:**

- Google Calendar 認証なしでも、通常の単発イベントは作成可能です
- macOS の Calendar.app でも定期イベントは表示されます（Google Calendar と同期済みの場合）
- 定期イベントの編集には Google Calendar 認証が必要です

---

### singleEvents スコープの動作

**症状:**
- 定期イベントが1つのイベントとして返される
- 個別の発生（occurrence）が表示されない

**原因:**

`list_calendar_events` の `singleEvents` パラメータの動作：

- `singleEvents: true`（デフォルト）:
  - 定期イベントの各発生を個別のイベントとして返す
  - 例：毎週月曜日の定期イベント → 各月曜日が個別イベントとして返る
  - ユーザーフレンドリーだが、大量の発生がある場合はパフォーマンスに影響

- `singleEvents: false`:
  - 定期イベントを1つのイベントとして返す
  - `recurrence` フィールドに RRULE が含まれる
  - プログラムで RRULE を処理する場合に使用

**解決策:**

目的に応じて `singleEvents` を設定してください：

```
# 個別の発生を表示したい場合（推奨）
list_calendar_events({
  startDate: "2025-01-01T00:00:00+09:00",
  endDate: "2025-01-31T23:59:59+09:00",
  singleEvents: true  // デフォルト
})

# 定期イベントのルールを取得したい場合
list_calendar_events({
  startDate: "2025-01-01T00:00:00+09:00",
  endDate: "2025-01-31T23:59:59+09:00",
  singleEvents: false
})
```

**ベストプラクティス:**

1. **カレンダー表示**: `singleEvents: true` を使用
2. **RRULE 編集**: `singleEvents: false` でルールを取得後、`update_calendar_event` で更新
3. **パフォーマンス**: 長期間（3ヶ月以上）の場合は `singleEvents: false` を検討

---

### 定期イベントの特定発生の変更

**症状:**
- 定期イベント全体が変更されてしまう
- 特定日のみを変更したい

**解決策:**

`update_calendar_event` の `updateScope` パラメータを使用してください：

#### 1. 特定日のみ変更

```
# 特定日の会議時刻を変更（他の発生には影響なし）
update_calendar_event({
  eventId: "event-id_20250115T100000Z",  # 特定発生のID（_YYYYMMDDTHHMMSSZサフィックス）
  startDate: "2025-01-15T11:00:00+09:00", # 新しい開始時刻
  endDate: "2025-01-15T12:00:00+09:00",
  updateScope: "thisInstance"  # この発生のみ
})
```

#### 2. この日以降すべて変更

```
# この日以降の会議場所を変更
update_calendar_event({
  eventId: "event-id_20250115T100000Z",
  location: "新しい会議室",
  updateScope: "thisAndFollowing"  # この発生と以降すべて
})
```

#### 3. すべての発生を変更

```
# 定期イベント全体の時刻を変更
update_calendar_event({
  eventId: "event-id",  # 基本イベントID（サフィックスなし）
  startDate: "2025-01-08T11:00:00+09:00",
  endDate: "2025-01-08T12:00:00+09:00",
  updateScope: "allEvents"  # すべての発生
})
```

**注意事項:**

- 特定発生の ID は `list_calendar_events` の `recurringEventId` フィールドで確認できます
- `thisInstance` で変更した発生は、元の定期イベントから独立したイベントになります
- `thisAndFollowing` は元の定期イベントを分割します

---

### RRULE の例とパターン

**毎日:**
```
FREQ=DAILY                        # 毎日
FREQ=DAILY;INTERVAL=2             # 2日ごと
FREQ=DAILY;COUNT=30               # 30回（30日間）
FREQ=DAILY;UNTIL=20251231         # 2025年12月31日まで
```

**毎週:**
```
FREQ=WEEKLY;BYDAY=MO              # 毎週月曜日
FREQ=WEEKLY;BYDAY=MO,WE,FR        # 毎週月水金
FREQ=WEEKLY;INTERVAL=2;BYDAY=TU   # 2週間ごとの火曜日
```

**毎月:**
```
FREQ=MONTHLY;BYMONTHDAY=15        # 毎月15日
FREQ=MONTHLY;BYDAY=1MO            # 毎月第1月曜日
FREQ=MONTHLY;BYDAY=-1FR           # 毎月最終金曜日
FREQ=MONTHLY;BYMONTHDAY=-1        # 毎月最終日
```

**毎年:**
```
FREQ=YEARLY                       # 毎年同じ日
FREQ=YEARLY;BYMONTHDAY=1;BYMONTH=1 # 毎年1月1日
```

**日本語での説明表示:**

sage は RRULE を日本語で説明します：

```
FREQ=WEEKLY;BYDAY=MO,WE,FR
→ "毎週月・水・金曜日"

FREQ=MONTHLY;INTERVAL=2;BYDAY=1MO
→ "2ヶ月ごとの第1月曜日"

FREQ=DAILY;COUNT=30
→ "毎日（30回）"

FREQ=WEEKLY;UNTIL=20251231
→ "毎週（2025年12月31日まで）"
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
