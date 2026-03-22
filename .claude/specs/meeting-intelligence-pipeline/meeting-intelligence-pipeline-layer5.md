# タスク指示書: Meeting Intelligence Pipeline — Layer 5: Core Pipeline Services (Tasks 16-19.2)

## 概要

Meeting Intelligence Pipeline のコアパイプラインサービスレイヤー。PipelineStateStore、ChannelDiscovery、BriefingGenerator、PostMeetingProcessor を実装する。全て Layer 1-4 のコンポーネントに依存し、後続の Layer 6（PipelineScheduler）がこのレイヤーのサービスに依存する。

## 参照資料

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — タスク定義（ソース・オブ・トゥルース）
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — 設計文書（Components and Interfaces セクション: PipelineStateStore, ChannelDiscovery, BriefingGenerator, PostMeetingProcessor）
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — 要件文書（R3, R4, R5, R6, R10）

## 作業内容

### Task 16: PipelineStateStore 作成

- **優先度:** 高
- **ファイル:** `src/services/pipeline-state-store.ts`（新規）
- **作業:** Pipeline state の永続化サービスを作成

#### PipelineStateStore クラス

```typescript
export class PipelineStateStore {
  constructor(configDir?: string)  // デフォルト: ~/.sage/

  // Briefing status
  getBriefingStatus(eventId: string): MeetingProcessingState | null
  setBriefingStatus(eventId: string, status: { status: string; sentAt?: string; error?: string }): void

  // Post-meeting status
  getPostMeetingStatus(eventId: string): MeetingProcessingState | null
  setPostMeetingStatus(eventId: string, status: { status: string; pollStartedAt?: string; lastPollAt?: string; processedAt?: string; sources?: { transcript: boolean; notionNotes: boolean }; error?: string }): void

  // Action items
  getActionItemsForRecurring(recurringEventId: string, lastOnly: boolean): ActionItem[]
  recordActionItems(eventId: string, items: ActionItem[]): void

  // Channel mappings
  getChannelMapping(meetingPattern: string): string[] | null
  setChannelMapping(meetingPattern: string, channelIds: string[]): void

  // Maintenance
  pruneOldEntries(retentionDays: number): void
  save(): Promise<void>  // debounced
  load(): Promise<void>
  flush(): Promise<void>  // immediate save（shutdown 用）

  // State access
  getState(): PipelineStateFile
  getMeeting(eventId: string): MeetingProcessingState | null
}
```

#### 実装詳細

- **コンストラクタ:**
  - `configDir` のデフォルトは `~/.sage/`（`os.homedir()` で展開）
  - ファイルパス: `{configDir}/pipeline-state.json`
  - 内部状態: `PipelineStateFile` 型のオブジェクト（初期値: `{ version: 1, lastUpdated: '', meetings: {}, channelMappings: {}, dailyMetrics: { date: '', briefingsSent: 0, postMeetingProcessed: 0, actionItemsCreated: 0, errors: 0 } }`）
  - `saveDebounceTimer: NodeJS.Timeout | null = null`
  - `saveDebounceMs = 1000`

- **`load()`:**
  - `fs.readFile` で JSON ファイルを読み込み
  - `PipelineStateFileSchema.safeParse()` でバリデーション
  - バリデーション成功時: state にセット
  - バリデーション失敗時（パースエラー or スキーマ不一致）:
    - 古いファイルを `{path}.backup.{timestamp}` にリネーム
    - 新しい空の state で初期化
    - ログ出力（warn）
  - ファイルが存在しない場合（ENOENT）: 新しい空の state で初期化

- **`save()`:**
  - デバウンスパターン: `PersistentRefreshTokenStore.scheduleSave()` を踏襲
  - `clearTimeout` → `setTimeout(async () => { ... }, saveDebounceMs)`
  - タイマー内で `fs.writeFile` で JSON 書き出し（`JSON.stringify(state, null, 2)`）
  - `state.lastUpdated` を現在の ISO 8601 UTC に更新

- **`flush()`:**
  - タイマーをクリア
  - `fs.writeFile` で即時書き出し

- **`getBriefingStatus(eventId)` / `setBriefingStatus(eventId, status)`:**
  - `state.meetings[eventId]` から取得 / 更新
  - `setBriefingStatus` で meeting エントリが存在しない場合は新規作成（デフォルト値付き）
  - `setBriefingStatus` 後に `save()` を呼ぶ

- **`getPostMeetingStatus(eventId)` / `setPostMeetingStatus(eventId, status)`:**
  - 同上パターン
  - `setPostMeetingStatus` 後に `save()` を呼ぶ

- **`getActionItemsForRecurring(recurringEventId, lastOnly)`:**
  - `state.meetings` を走査し `recurringEventId` が一致するエントリを収集
  - `lastOnly === true` の場合: `startTime` が最新のエントリの `actionItems` のみ返す
  - `lastOnly === false` の場合: 全エントリの `actionItems` を結合して返す

- **`recordActionItems(eventId, items)`:**
  - `state.meetings[eventId].actionItems` に追加
  - `save()` を呼ぶ

- **`getChannelMapping(meetingPattern)` / `setChannelMapping(meetingPattern, channelIds)`:**
  - `state.channelMappings[meetingPattern]` から取得 / 設定
  - `setChannelMapping` 後に `save()` を呼ぶ

- **`pruneOldEntries(retentionDays)`:**
  - `state.meetings` を走査し、`startTime` が `retentionDays` 日以上前のエントリを削除
  - 削除後に `save()` を呼ぶ

- **依存:** `fs/promises` (node:fs/promises), `path` (node:path), `os` (node:os), `PipelineStateFileSchema` / `MeetingProcessingState` / `ActionItem` / `PipelineStateFile` (`src/types/pipeline-types.ts`), `createLogger` (`src/utils/logger.ts`)
- **パターン:** `PersistentRefreshTokenStore` (`src/oauth/persistent-refresh-token-store.ts`) のデバウンス保存パターン
- **要件:** R10.1, R10.2, R10.3, R10.4, R10.5, R10.6, R10.7

---

### Task 17: ChannelDiscovery 作成

- **優先度:** 高
- **ファイル:** `src/services/channel-discovery.ts`（新規）
- **作業:** 会議に関連する Slack チャンネルを自動発見するサービスを作成

#### ChannelDiscovery クラス

```typescript
export class ChannelDiscovery {
  constructor(
    slackService: SlackService,
    samplingService: SamplingService,
    stateStore: PipelineStateStore,
    promptTemplateManager: PromptTemplateManager
  )

  async discoverChannels(event: CalendarEvent): Promise<string[]>
  getManualMappings(meetingPattern: string): string[]
  setManualMapping(meetingPattern: string, channelIds: string[]): void
}
```

#### 実装詳細

- **`discoverChannels(event)`:**
  1. **手動マッピングチェック:** `manualMappings` (Map<string, string[]>) を走査。イベントタイトルが:
     - `/pattern/` 形式のパターン → 正規表現マッチ
     - それ以外 → substring マッチ（`event.title.toLowerCase().includes(pattern.toLowerCase())`）
     - マッチした場合はそのチャンネル ID 配列を返す（手動マッピングは常に優先）
  2. **キャッシュチェック:** `stateStore.getChannelMapping(cacheKey)` で確認
     - `cacheKey`: `event.recurringEventId || event.title`
     - キャッシュヒット時はその値を返す
  3. **LLM 推論:**
     - `slackService.listBotChannels()` で Bot 参加チャンネル一覧を取得
     - `promptTemplateManager.getPrompt('channel_discovery', { title, description, attendees, channels })` でプロンプト生成
     - `samplingService.sendSamplingRequest()` で LLM に問い合わせ
     - レスポンスからチャンネル ID を抽出（JSON パース or テキストから ID 抽出）
     - 結果を `stateStore.setChannelMapping(cacheKey, channelIds)` でキャッシュ
     - チャンネルが見つからない場合は空配列を返す

- **`getManualMappings(meetingPattern)`:**
  - `manualMappings.get(meetingPattern)` を返す。なければ空配列

- **`setManualMapping(meetingPattern, channelIds)`:**
  - `manualMappings.set(meetingPattern, channelIds)`

- **依存:** `SlackService` (`src/integrations/slack-service.ts`), `SamplingService` (`src/services/sampling-service.ts`), `PipelineStateStore` (Task 16), `PromptTemplateManager` (`src/services/prompt-templates.ts`), `CalendarEvent` (`src/types/google-calendar-types.ts`), `createLogger`
- **要件:** R6.1, R6.2, R6.3, R6.4, R6.5

---

### Task 18.1 / 18.2: BriefingGenerator 作成

- **優先度:** 高
- **ファイル:** `src/services/briefing-generator.ts`（新規）
- **作業:** プリミーティングブリーフィングの生成サービスを作成。データ収集（18.1）とブリーフィング組立・配信（18.2）を一つのクラスで実装

#### BriefingGenerator クラス

```typescript
export class BriefingGenerator {
  constructor(
    slackService: SlackService,
    channelDiscovery: ChannelDiscovery,
    samplingService: SamplingService,
    stateStore: PipelineStateStore,
    reminderManager: ReminderManager,
    promptTemplateManager: PromptTemplateManager,
    config: MeetingIntelligenceConfig
  )

  // 公開メソッド
  async generateBriefing(event: CalendarEvent, deadline: Date): Promise<BriefingResult>

  // プライベートメソッド
  private async gatherContext(event: CalendarEvent): Promise<BriefingContext>
  private async summarizeChannelMessages(channelId: string, channelName: string, oldest: string): Promise<{ channelName: string; summary: string }>
}
```

#### 実装詳細

- **`gatherContext(event)` (private, Task 18.1):**
  1. **並列データ収集** (Promise.all):
     - `channelDiscovery.discoverChannels(event)` → チャンネル ID 配列
     - Notion ドキュメント検索: `extractNotionUrls(event.description)` で明示的 URL を取得 + `samplingService.sendSamplingRequest()` で `notion_search` プロンプトを使って全文検索
     - 前回アクションアイテム: `stateStore.getActionItemsForRecurring(event.recurringEventId, true)` で取得（recurringEventId がある場合のみ）
  2. **チャンネルメッセージ取得 & 要約** (チャンネル解決後):
     - 各チャンネルに対して `summarizeChannelMessages()` を呼ぶ
  3. **アジェンダ抽出:** `extractAgenda(event.description)`
  4. **BriefingContext を構築して返す**

- **`summarizeChannelMessages(channelId, channelName, oldest)` (private):**
  - `slackService.getChannelHistory(channelId, oldest, { limit: config.slackMessageBatchSize * 10, includeThreads: true })` でメッセージ取得
  - メッセージが空の場合: `{ channelName, summary: 'No recent activity' }` を返す
  - **2 ステージ要約:**
    1. メッセージを `config.slackMessageBatchSize` 件ずつバッチに分割
    2. 各バッチを並列で `samplingService.sendSamplingRequest()` (`slack_summarize_batch` プロンプト) で要約
    3. バッチ要約を統合: `samplingService.sendSamplingRequest()` (`slack_summarize_aggregate` プロンプト) で単一要約に

- **`generateBriefing(event, deadline)` (public, Task 18.2):**
  1. `gatherContext(event)` で全データ収集
  2. `samplingService.sendSamplingRequest()` で `briefing_generate` プロンプトを使ってブリーフィング生成
  3. **デッドラインチェック:** `new Date() > deadline` なら `{ status: 'skipped', reason: 'deadline passed' }` を返す
  4. `formatBriefing(event.title, event.start, content, context.sourceLinks)` でフォーマット
  5. `slackService.sendDirectMessage(blocks)` で送信
  6. `stateStore.setBriefingStatus(event.id, { status: 'sent', sentAt: new Date().toISOString() })` で状態更新
  7. 返り値: `{ status: 'sent', messageTs: '' }`（messageTs は SlackService からの戻り値がないため空文字列）
  8. **エラー時:** `{ status: 'skipped', reason: error.message }` を返す

- **依存:** `SlackService`, `ChannelDiscovery` (Task 17), `SamplingService`, `PipelineStateStore` (Task 16), `ReminderManager`, `PromptTemplateManager`, `CalendarEvent`, `BriefingResult`, `BriefingContext`, `MeetingIntelligenceConfig`, `extractNotionUrls`, `extractAgenda` (`src/utils/calendar-description-parser.ts`), `formatBriefing` (`src/utils/slack-blocks.ts`), `createLogger`
- **要件:** R3.1, R3.2, R3.3, R3.4, R3.5, R3.11, R5.1, R5.2, R5.3, R5.4

---

### Task 19.1 / 19.2: PostMeetingProcessor 作成

- **優先度:** 高
- **ファイル:** `src/services/post-meeting-processor.ts`（新規）
- **作業:** ポストミーティング処理サービスを作成。ポーリング（19.1）と処理・配信（19.2）を一つのクラスで実装

#### PostMeetingProcessor クラス

```typescript
export class PostMeetingProcessor {
  constructor(
    driveService: GoogleDriveService,
    samplingService: SamplingService,
    slackService: SlackService,
    reminderManager: ReminderManager,
    stateStore: PipelineStateStore,
    promptTemplateManager: PromptTemplateManager,
    config: MeetingIntelligenceConfig
  )

  // ポーリング
  async poll(event: CalendarEvent): Promise<PollResult>

  // 処理と配信
  async process(event: CalendarEvent, transcript: string | null, notionNotes: string | null): Promise<PostMeetingResult>
}
```

#### 実装詳細

- **`poll(event)` (Task 19.1):**
  1. **並列ソースチェック** (Promise.all):
     - `driveService.findTranscript(event)` → DriveFile | null。見つかれば `driveService.getFileContent(file.id)` でテキスト取得
     - Notion ノート検索: `extractNotionUrls(event.description)` で明示的 URL + `samplingService.sendSamplingRequest()` (`notion_search` プロンプト) で全文検索
  2. 両方とも見つからない場合: `{ status: 'waiting' }`
  3. 少なくとも 1 つ見つかった場合: `{ status: 'ready', transcript, notionNotes }`

- **`process(event, transcript, notionNotes)` (Task 19.2):**
  1. **サマリー & アクションアイテム抽出:**
     - `samplingService.sendSamplingRequest()` で `post_meeting_extract` プロンプトを使用
     - transcript が優先、notionNotes は補助（R4.5）
     - レスポンスから summary と action items をパース（JSON 形式を期待）
  2. **重複排除:**
     - `stateStore.getActionItemsForRecurring(event.recurringEventId, false)` で既存アイテムを取得
     - 既存アイテムを `action_item_dedup` プロンプトのコンテキストに含める（R4.10）
  3. **担当者解決:**
     - LLM が抽出した担当者名 → `event.attendees` のメールアドレスにマッチ
     - マッチしたメールで `slackService.lookupUser(email)` → Slack ユーザー ID を取得
     - 解決できない名前はそのまま保持
  4. **デフォルト期日:**
     - `event.recurringEventId` がある場合: 次回開催日の前日（ここでは簡易的に event.start + 7 日で代替。CalendarSourceManager の次回インスタンス検索は後続レイヤーで統合）
     - ワンオフ: 会議日 + 7 日
  5. **リマインダー作成:**
     - 各アクションアイテムに対して `reminderManager.createReminder()` を呼ぶ
     - `delegateToNotion === true` のレスポンスがあった場合: ログ出力（Notion 作成は呼び出し元で処理される想定）
  6. **Slack DM 送信:**
     - `formatPostMeetingReport(event.title, event.start, summary, sourceLinks)` でフォーマット
     - `slackService.sendDirectMessage(blocks)` で送信
  7. **状態記録:**
     - `stateStore.recordActionItems(event.id, actionItems)`
     - `stateStore.setPostMeetingStatus(event.id, { status: 'processed', processedAt: new Date().toISOString(), sources: { transcript: !!transcript, notionNotes: !!notionNotes } })`
  8. **返り値:** `PostMeetingResult`

- **依存:** `GoogleDriveService` (`src/integrations/google-drive-service.ts`), `SamplingService`, `SlackService`, `ReminderManager`, `PipelineStateStore` (Task 16), `PromptTemplateManager`, `CalendarEvent`, `PollResult`, `PostMeetingResult`, `ActionItem`, `MeetingIntelligenceConfig`, `extractNotionUrls` (`src/utils/calendar-description-parser.ts`), `formatPostMeetingReport` (`src/utils/slack-blocks.ts`), `createLogger`
- **要件:** R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R4.7, R4.8, R4.9, R4.10, R4.11

---

## テスト

- **テストファイル配置:** `tests/unit/` 配下
- **テストファイル:**
  - `tests/unit/pipeline-state-store.test.ts` — Task 16 のテスト
  - `tests/unit/channel-discovery.test.ts` — Task 17 のテスト
  - `tests/unit/briefing-generator.test.ts` — Task 18.1/18.2 のテスト
  - `tests/unit/post-meeting-processor.test.ts` — Task 19.1/19.2 のテスト

### Task 16 テスト項目
- `load`: ファイルが存在しない場合に空の state で初期化
- `load`: 正しい JSON ファイルを読み込んで state にセット
- `load`: 不正な JSON でバックアップを作成し空 state で初期化
- `load`: スキーマバリデーション失敗でバックアップを作成し空 state で初期化
- `save`: デバウンスされた書き込み（1000ms 後）
- `flush`: 即時書き込み
- `getBriefingStatus / setBriefingStatus`: 状態の取得と設定
- `setBriefingStatus`: 存在しない eventId で新規エントリ作成
- `getPostMeetingStatus / setPostMeetingStatus`: 状態の取得と設定
- `getActionItemsForRecurring`: lastOnly=true で最新のみ返す
- `getActionItemsForRecurring`: lastOnly=false で全て返す
- `recordActionItems`: アクションアイテムを追加
- `getChannelMapping / setChannelMapping`: マッピングの取得と設定
- `pruneOldEntries`: 古いエントリを削除

### Task 17 テスト項目
- `discoverChannels`: 手動マッピングが最優先
- `discoverChannels`: 正規表現パターンのマッチ
- `discoverChannels`: キャッシュヒット時はキャッシュを返す
- `discoverChannels`: LLM 推論でチャンネルを発見
- `discoverChannels`: 発見結果をキャッシュに保存
- `discoverChannels`: チャンネルが見つからない場合に空配列を返す
- `getManualMappings / setManualMapping`: マッピングの取得と設定

### Task 18.1/18.2 テスト項目
- `gatherContext`: 並列でデータ収集（Promise.all）
- `gatherContext`: Slack メッセージの 2 ステージ要約
- `gatherContext`: ソースが欠けていてもエラーにならない
- `generateBriefing`: ブリーフィングを生成して Slack DM で送信
- `generateBriefing`: デッドライン超過時に skipped を返す
- `generateBriefing`: 状態を更新する
- `generateBriefing`: エラー時に skipped を返す

### Task 19.1/19.2 テスト項目
- `poll`: 並列でソースをチェック
- `poll`: 両方見つからない場合に waiting を返す
- `poll`: 少なくとも 1 つ見つかった場合に ready を返す
- `poll`: EventKit イベント（conferenceData なし）でトランスクリプト検索をスキップ
- `process`: サマリーとアクションアイテムを抽出
- `process`: 担当者を解決（attendees メール → Slack ユーザー）
- `process`: 重複排除で既存アイテムを LLM コンテキストに含める
- `process`: リマインダーを作成
- `process`: Slack DM を送信
- `process`: 状態を記録

### 既存テスト
- **全既存テストがパスすることを確認:** `npm test`

## 横断的懸念事項

- **ESM import:** 全 import は `.js` 拡張子付き
- **ロギング:** `createLogger('pipeline-state')`, `createLogger('channel-discovery')`, `createLogger('briefing')`, `createLogger('post-meeting')` を使用
- **SamplingService の使い方:**
  ```typescript
  const response = await samplingService.sendSamplingRequest({
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    maxTokens: 4096,
    systemPrompt: 'You are a meeting intelligence assistant.',
  });
  const result = response.content.text;
  ```
- **エラーハンドリング:** SamplingService のエラー（SamplingError）は catch してログ出力し、グレースフルに degradation する（例: LLM が使えない場合は空のコンテキストで続行）
- **テストのモックパターン:** 全ての外部依存（SlackService, SamplingService, GoogleDriveService, ReminderManager）はモックオブジェクトとして注入

## Open Questions

なし
