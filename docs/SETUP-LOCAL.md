# Local MCP Setup Guide

このガイドでは、Claude Desktop または Claude Code で sage をセットアップする手順を説明します。

## 前提条件

- **OS**: macOS（Apple Reminders/Calendar統合に必要）
- **Node.js**: 18.0.0 以上
- **Claude Desktop** または **Claude Code** がインストール済み

### Node.js のインストール確認

```bash
node --version
# v18.0.0 以上が表示されること
```

Node.js がインストールされていない場合:

```bash
# Homebrew を使用
brew install node

# または nvm を使用
nvm install 18
nvm use 18
```

---

## Claude Code でのセットアップ

### Step 1: sage を追加

ターミナルで以下のコマンドを実行:

```bash
claude mcp add sage -- npx -y @shin1ohno/sage
```

### Step 2: 追加を確認

```bash
claude mcp list
```

出力例:
```
sage: npx -y @shin1ohno/sage
```

### Step 3: Claude Code を再起動

Claude Code を一度閉じて再度開きます。

### Step 4: セットアップウィザードを実行

Claude Code で以下のように入力:

```
sageのセットアップを開始してください
```

または、直接ツールを呼び出す:

```
check_setup_status を実行
```

### 完了

これで Claude Code から sage が使用可能になりました。

---

## Claude Desktop でのセットアップ

### Step 1: 設定ファイルの場所を確認

Claude Desktop の設定ファイルは以下の場所にあります:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Step 2: 設定ファイルを開く

**方法A: Finder から開く**

1. Finder を開く
2. メニューバーの「移動」→「フォルダへ移動...」を選択
3. `~/Library/Application Support/Claude/` と入力して Enter
4. `claude_desktop_config.json` をテキストエディタで開く

**方法B: ターミナルから開く**

```bash
# VS Code で開く
code ~/Library/Application\ Support/Claude/claude_desktop_config.json

# または nano で開く
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

# または vim で開く
vim ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Step 3: 設定ファイルを編集

ファイルが存在しない、または空の場合は新規作成します。

**新規作成の場合:**

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

**既存の設定がある場合:**

`mcpServers` オブジェクトに sage を追加:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "...",
      "args": ["..."]
    },
    "sage": {
      "command": "npx",
      "args": ["-y", "@shin1ohno/sage"]
    }
  }
}
```

### Step 4: ファイルを保存

エディタでファイルを保存します。

### Step 5: JSON の検証

設定ファイルが正しい JSON 形式であることを確認:

```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
```

エラーが表示される場合は、JSON 構文を修正してください。

### Step 6: Claude Desktop を再起動

1. Claude Desktop を完全に終了（メニューバーのアイコンも確認）
2. Claude Desktop を再度起動

### Step 7: sage の動作確認

Claude Desktop で以下のように入力:

```
check_setup_status を実行して、sage のセットアップ状態を確認してください
```

成功すると、セットアップ状態が表示されます。

---

## 初期設定

### セットアップウィザードの実行

sage を初めて使用する際は、セットアップウィザードで初期設定を行います。

Claude に以下のように依頼:

```
sage のセットアップウィザードを開始してください
```

ウィザードでは以下の質問に答えます:

1. **お名前** - タスクの関係者として認識するため
2. **タイムゾーン** - 期限の計算に使用（デフォルト: Asia/Tokyo）
3. **勤務時間** - カレンダー統合に使用
4. **マネージャー名** - 優先度判定に使用（任意）
5. **Apple Reminders のデフォルトリスト** - リマインダーの保存先

### 設定の保存

ウィザード完了後、設定を保存:

```
設定を保存してください
```

設定は `~/.sage/config.json` に保存されます。

---

## Notion 統合の設定（任意）

Notion を使用してタスクを管理する場合は、追加の設定が必要です。

### Step 1: Notion MCP サーバーを追加

**Claude Code の場合:**

```bash
claude mcp add notion -- npx -y @modelcontextprotocol/server-notion
```

**Claude Desktop の場合:**

`claude_desktop_config.json` に追加:

```json
{
  "mcpServers": {
    "sage": {
      "command": "npx",
      "args": ["-y", "@shin1ohno/sage"]
    },
    "notion": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-notion"],
      "env": {
        "NOTION_API_KEY": "your-notion-api-key"
      }
    }
  }
}
```

### Step 2: Notion API Key を取得

1. [Notion Integrations](https://www.notion.so/my-integrations) にアクセス
2. 「New integration」をクリック
3. 名前を入力（例: "sage"）
4. 「Submit」をクリック
5. 表示された API Key をコピー

### Step 3: データベースを準備

1. Notion でタスク管理用のデータベースを作成
2. データベースページを開く
3. 右上の「...」→「Connections」→ 作成した integration を追加
4. URL からデータベース ID を取得（`notion.so/` の後の32文字）

例: `https://notion.so/myworkspace/abc123def456...` の場合、`abc123def456...` がデータベース ID

### Step 4: sage の設定を更新

Claude に以下のように依頼:

```
sage の設定で Notion 統合を有効にしてください。データベース ID は "your-database-id" です。
```

---

## Apple Reminders / Calendar のアクセス許可

sage が Apple Reminders や Calendar にアクセスする際、初回は権限の確認ダイアログが表示されます。

### アクセス許可の手順

1. sage からリマインダー作成を依頼
2. macOS からアクセス許可のダイアログが表示される
3. 「OK」または「許可」をクリック

### 手動で権限を確認・変更

1. 「システム環境設定」→「セキュリティとプライバシー」→「プライバシー」
2. 左側のリストから「リマインダー」または「カレンダー」を選択
3. Terminal または使用しているターミナルアプリにチェックを入れる

---

## 動作確認

セットアップが完了したら、以下のコマンドで動作を確認:

### タスク分析のテスト

```
以下のタスクを分析してください:
- 明日までにレポートを提出
- 来週の会議の準備
- 田中さんへの返信
```

### リマインダー作成のテスト

```
「テストリマインダー」を明日の10時にリマインドしてください
```

### カレンダー確認のテスト

```
今週の空き時間を探してください
```

---

## アンインストール

### Claude Code の場合

```bash
claude mcp remove sage
```

### Claude Desktop の場合

1. `claude_desktop_config.json` を開く
2. `sage` のエントリを削除
3. ファイルを保存
4. Claude Desktop を再起動

### 設定ファイルの削除（任意）

```bash
rm -rf ~/.sage
```

---

## 次のステップ

- [設定ガイド](CONFIGURATION.md) - 詳細な設定オプション
- [トラブルシューティング](TROUBLESHOOTING.md) - 問題が発生した場合
