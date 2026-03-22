# タスク指示書: Meeting Intelligence Pipeline — Layer 2: Utilities (Tasks 9-11)

## 概要

Meeting Intelligence Pipeline のユーティリティレイヤー。カレンダー説明文のパーサー、Slack Block Kit フォーマッター、プロンプトテンプレートマネージャーを実装する。全てステートレスまたは軽量なモジュールで、後続レイヤーの BriefingGenerator / PostMeetingProcessor / ChannelDiscovery から利用される。

## 参照資料

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — タスク定義（ソース・オブ・トゥルース）
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — 設計文書（Components and Interfaces セクション: CalendarDescriptionParser, SlackBlockKitFormatter, PromptTemplateManager）
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — 要件文書（R3, R4, R8, R9, R11）

## 作業内容

### Task 9: CalendarDescriptionParser ユーティリティ作成

- **優先度:** 高
- **ファイル:** `src/utils/calendar-description-parser.ts`（新規）
- **作業:** 3つの純粋関数をエクスポートするユーティリティモジュールを作成

#### `extractNotionUrls(description: string): string[]`
- `htmlparser2` で HTML をパースし `<a>` タグの `href` 属性を収集
- `notion.so` または `notion.site` ドメインにマッチする URL のみフィルタ
- Plain text fallback: URL 正規表現（`https?://...`）で全 URL を抽出し同じドメインフィルタを適用
- HTML か plain text かの判定: `<` を含むかどうかで簡易判定
- 空文字列・undefined 入力時は空配列を返す
- 重複 URL を除去して返す

#### `extractAgenda(description: string): string | null`
- HTML の場合: htmlparser2 でテキストコンテンツを抽出し、"Agenda" / "アジェンダ" / "議題" セクション（大文字小文字不問）以降のテキストを返す
- Plain text の場合: 同様にキーワードマッチでセクションを特定
- セクションが見つからない場合は `null` を返す
- HTML タグを除去したプレーンテキストとして返す

#### `extractMeetLink(description: string): string | null`
- HTML の場合: `<a>` タグの `href` から `meet.google.com` を含む URL を抽出
- Plain text の場合: URL 正規表現で `meet.google.com` URL を抽出
- 見つからない場合は `null` を返す

- **依存:** `htmlparser2`（Task 1 でインストール済み）
- **パターン:** 既存の `src/utils/` のユーティリティファイル（純粋関数エクスポート）を踏襲
- **要件:** R3.2, R4.2, R11.4

---

### Task 10: SlackBlockKitFormatter ユーティリティ作成

- **優先度:** 高
- **ファイル:** `src/utils/slack-blocks.ts`（新規）
- **作業:** 4つのフォーマッター関数と `SlackBlock` 型をエクスポートするユーティリティモジュールを作成

#### `SlackBlock` 型定義（ファイル内にローカル定義）
```typescript
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
```

#### `formatBriefing(title: string, time: string, content: string, sourceLinks: SourceLinks): SlackBlock[]`
- `header` ブロック: 会議タイトル + 時刻
- `section` ブロック: LLM 生成コンテンツ（mrkdwn 形式）
- `context` ブロック: ソースリンク（Notion ページ、Slack チャンネル）を mrkdwn リンク形式（`<url|display text>`）で表示
- 50 ブロック制限: コンテンツが超える場合は `section` ブロックを切り詰め、`context` ブロック（ソースリンク）を確保

#### `formatPostMeetingReport(title: string, time: string, content: string, sourceLinks: SourceLinks): SlackBlock[]`
- `formatBriefing` と同様の構造
- ソースリンクに `transcriptUrl` がある場合はそれも含む

#### `formatDailySummary(status: PipelineStatus): SlackBlock[]`
- `header` ブロック: "📊 Daily Pipeline Summary"
- `section` ブロック: メトリクスレポート（briefingsSentToday, postMeetingProcessedToday, actionItemsCreatedToday, errorsToday, pendingPostMeetingPolls）

#### `formatCriticalError(error: CriticalPipelineError): SlackBlock[]`
- `header` ブロック: "⚠️ Pipeline Error"
- `section` ブロック: エラーメッセージ + タイプ + タイムスタンプ
- details がある場合は追加の `section` ブロック

- **依存:** `SourceLinks`, `PipelineStatus`, `CriticalPipelineError` を `src/types/pipeline-types.ts` からインポート
- **パターン:** 純粋なフォーマッティングユーティリティ。外部 API 呼び出しなし
- **50 ブロック制限:** 全関数で出力が Slack の 50 ブロック上限を超えないよう、コンテンツを切り詰める
- **要件:** R3.3, R4.7, R8.5, R8.8

---

### Task 11: PromptTemplateManager サービス作成

- **優先度:** 高
- **ファイル:** `src/services/prompt-templates.ts`（新規）
- **作業:** `PromptTemplateManager` クラスと `PromptName` 型をエクスポートするサービスモジュールを作成

#### `PromptName` 型定義
```typescript
export type PromptName =
  | 'channel_discovery'
  | 'slack_summarize_batch'
  | 'slack_summarize_aggregate'
  | 'notion_search'
  | 'briefing_generate'
  | 'post_meeting_extract'
  | 'action_item_dedup'
  | 'assignee_resolve';
```

#### `PromptTemplateManager` クラス
```typescript
export class PromptTemplateManager {
  constructor(promptsDir?: string)  // デフォルト: ~/.sage/prompts/
  getPrompt(name: PromptName, variables: Record<string, string>): string
  reloadTemplates(): void
}
```

#### デフォルトプロンプト（8つ、定数としてハードコード）
- `channel_discovery`: 会議タイトル・参加者からSlackチャンネルを推論するプロンプト
- `slack_summarize_batch`: Slackメッセージバッチを要約するプロンプト
- `slack_summarize_aggregate`: バッチ要約を統合するプロンプト
- `notion_search`: 会議に関連するNotionドキュメントを検索するプロンプト
- `briefing_generate`: ブリーフィングを生成するプロンプト
- `post_meeting_extract`: ポストミーティングサマリー・アクションアイテムを抽出するプロンプト
- `action_item_dedup`: アクションアイテムの重複排除プロンプト
- `assignee_resolve`: 担当者名をメール/Slackユーザーに解決するプロンプト

各プロンプトは `{{variable}}` プレースホルダーを使用可能。内容は実用的な英語テンプレート（後続レイヤーで実際に MCP Sampling に渡す際に使用される）。

#### 動作仕様
- **`getPrompt(name, variables)`:**
  1. `readFileSync` で `{promptsDir}/{name}.md` を読み込み（override ファイル）
  2. ファイルが存在しなければ（`try-catch` で ENOENT を catch）デフォルトプロンプトを使用
  3. `content.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')` で変数を置換
  4. 結果を返す
- **`reloadTemplates()`:** 現在はキャッシュしないため no-op（将来のキャッシュ導入時のインターフェース予約）
- **パス解決:** `promptsDir` が `~` で始まる場合、`os.homedir()` で展開する

- **依存:** `readFileSync` (node:fs), `homedir` (node:os), `join` (node:path)
- **パターン:** `src/services/` 配下のクラスベースサービス
- **要件:** R9.6

---

## テスト

- **テストファイル配置:** `tests/unit/` 配下
- **テストファイル:**
  - `tests/unit/calendar-description-parser.test.ts` — Task 9 のテスト
  - `tests/unit/slack-blocks.test.ts` — Task 10 のテスト
  - `tests/unit/prompt-templates.test.ts` — Task 11 のテスト

### Task 9 テスト項目
- `extractNotionUrls`: HTML 入力で Notion URL を抽出
- `extractNotionUrls`: Plain text 入力で Notion URL を抽出
- `extractNotionUrls`: Notion 以外の URL を除外
- `extractNotionUrls`: 空文字列入力で空配列を返す
- `extractNotionUrls`: 重複 URL を除去
- `extractNotionUrls`: `notion.site` ドメインも対応
- `extractAgenda`: HTML から Agenda セクションを抽出
- `extractAgenda`: Plain text から Agenda セクションを抽出
- `extractAgenda`: Agenda セクションが無い場合 null を返す
- `extractAgenda`: 日本語キーワード（議題、アジェンダ）でも抽出
- `extractMeetLink`: HTML から Google Meet リンクを抽出
- `extractMeetLink`: Plain text から Google Meet リンクを抽出
- `extractMeetLink`: Meet リンクが無い場合 null を返す
- 不正な HTML でもクラッシュしない

### Task 10 テスト項目
- `formatBriefing`: header + section + context ブロックを生成
- `formatBriefing`: sourceLinks の Notion URL を mrkdwn リンクで表示
- `formatBriefing`: sourceLinks が空でも動作
- `formatPostMeetingReport`: transcriptUrl がある場合にリンクを含む
- `formatDailySummary`: 全メトリクスを含むブロックを生成
- `formatCriticalError`: エラー情報を含むブロックを生成
- `formatCriticalError`: details がある場合に追加セクションを含む
- 全関数: 出力が 50 ブロック以下であることを確認
- 長いコンテンツ: 50 ブロックを超える場合に切り詰め

### Task 11 テスト項目
- `getPrompt`: デフォルトプロンプトを返す（override ファイルなし）
- `getPrompt`: 変数置換が正しく動作する
- `getPrompt`: 未定義変数は空文字に置換
- `getPrompt`: override ファイルが存在する場合はそちらを使用（`jest.mock('node:fs')` で `readFileSync` をモック）
- `getPrompt`: override ファイルが存在しない場合はデフォルトにフォールバック
- 8つの PromptName すべてにデフォルトプロンプトが存在
- `reloadTemplates`: エラーを投げない

### 既存テスト
- **全既存テストがパスすることを確認:** `npm test`

## 横断的懸念事項

- **ESM import:** 全 import は `.js` 拡張子付き（例: `import { SourceLinks } from '../types/pipeline-types.js'`）
- **エクスポート:** 新規ファイルは `src/types/index.ts` への追加不要（ユーティリティ/サービスは直接 import される）
- **純粋関数 vs クラス:** Task 9, 10 は純粋関数エクスポート。Task 11 はクラスベース（パス状態を保持するため）

## Open Questions

なし
