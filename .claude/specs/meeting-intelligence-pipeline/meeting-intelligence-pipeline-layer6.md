# タスク指示書: Meeting Intelligence Pipeline — Layer 6: PipelineScheduler (Tasks 20.1-20.2)

## 概要

Meeting Intelligence Pipeline のオーケストレーションレイヤー。PipelineScheduler は、Pre-meeting briefing と Post-meeting processing を自動的にスケジューリング・実行するサービス。CalendarSourceManager からイベントを取得し、BriefingGenerator / PostMeetingProcessor へ処理を委譲する。

## 参照資料

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — タスク定義（ソース・オブ・トゥルース）
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — 設計文書（PipelineScheduler セクション）
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — 要件文書（R8）

## 作業内容

### Task 20.1: PipelineScheduler — Pre-meeting scheduling and lifecycle

- **優先度:** 高
- **ファイル:** `src/services/pipeline-scheduler.ts`（新規）
- **作業:** PipelineScheduler クラスのコンストラクタ、`start()`, `stop()`, `isRunning()`, `getStatus()`, および Pre-meeting polling ロジックを実装

### Task 20.2: PipelineScheduler — Post-meeting scheduling and notifications

- **優先度:** 高
- **ファイル:** `src/services/pipeline-scheduler.ts`（Task 20.1 の続き）
- **作業:** Post-meeting polling（p-queue）、Post-meeting delay/buffer ロジック、Initial enable（今日の過去会議）、Daily summary、Critical error notification を追加

---

## PipelineScheduler クラス

```typescript
export class PipelineScheduler {
  constructor(
    calendarSourceManager: CalendarSourceManager,
    briefingGenerator: BriefingGenerator,
    postMeetingProcessor: PostMeetingProcessor,
    stateStore: PipelineStateStore,
    workingCadenceService: WorkingCadenceService,
    slackService: SlackService,
    config: MeetingIntelligenceConfig
  )

  start(): void
  stop(): void
  isRunning(): boolean
  getStatus(): PipelineStatus
}
```

---

## 実装詳細

### コンストラクタ

- 全依存サービスを受け取り保持
- `running: boolean` フラグを `false` で初期化
- `preMeetingInterval: NodeJS.Timeout | null` を `null` で初期化
- `postMeetingInterval: NodeJS.Timeout | null` を `null` で初期化
- `postMeetingQueue: PQueue` を `import PQueue from 'p-queue'` で初期化（concurrency: 1）
- `pendingPostMeetingEvents: Map<string, { event: CalendarEvent; pollStartedAt: Date }>` — Post-meeting polling 対象の会議を管理
- `dailySummarySent: boolean` — 当日の Daily summary 送信済みフラグ（false で初期化）
- `dailySummaryDate: string` — Daily summary 送信日（'' で初期化）

### `start()`

1. `running` を `true` にする
2. `stateStore.load()` を呼ぶ（await — start() は `async` にする）
3. **Initial enable**: 今日の既に終了した会議を Post-meeting polling に登録する（`registerTodaysPastMeetings()`）
4. **Pre-meeting interval**: `setInterval` で `preMeetingPollInterval` 分ごとに `checkUpcomingMeetings()` を実行
5. **Post-meeting interval**: `setInterval` で `postMeetingPollInterval` 分ごとに `processPostMeetingQueue()` を実行
6. 最初のポーリングを即時実行: `checkUpcomingMeetings()` を呼ぶ
7. ログ: `Pipeline scheduler started`

### `stop()`

1. `running` を `false` にする
2. Pre-meeting interval を `clearInterval` でクリア（`preMeetingInterval = null`）
3. Post-meeting interval を `clearInterval` でクリア（`postMeetingInterval = null`）
4. **p-queue のジョブはそのまま完了まで継続** — `postMeetingQueue.clear()` は呼ばない
5. `stateStore.flush()` を呼ぶ（await — stop() は `async` にする）
6. ログ: `Pipeline scheduler stopped`

### `isRunning(): boolean`

- `running` フラグを返す

### `getStatus(): PipelineStatus`

- `PipelineStateStore.getState()` から `dailyMetrics` を取得
- 当日の日付チェック: `dailyMetrics.date` が今日の YYYY-MM-DD（UTC）と一致するか確認。一致しない場合は全メトリクスを 0 として返す
- `pendingPostMeetingPolls`: `pendingPostMeetingEvents.size` を返す
- 返却値:
  ```typescript
  {
    isRunning: this.running,
    briefingsSentToday: dailyMetrics.briefingsSent (or 0),
    postMeetingProcessedToday: dailyMetrics.postMeetingProcessed (or 0),
    actionItemsCreatedToday: dailyMetrics.actionItemsCreated (or 0),
    errorsToday: dailyMetrics.errors (or 0),
    pendingPostMeetingPolls: this.pendingPostMeetingEvents.size,
  }
  ```

---

### Pre-meeting ロジック

#### `checkUpcomingMeetings()` (private async)

1. `if (!this.running) return`
2. `CalendarSourceManager.getEvents(now, now + briefingWindow)` で直近の会議を取得
   - `startDate`: 現在時刻（ISO 8601）
   - `endDate`: 現在時刻 + `config.briefingWindow` 分（ISO 8601）
3. 取得した各イベントに対してフィルタリング（`shouldProcessMeeting(event)` で判定）
4. フィルタを通過したイベントを **順番に**（for-of ループ）処理:
   a. `stateStore.getBriefingStatus(event.id)` で既存ステータスを確認
   b. 既に `sent` or `skipped` ステータスの場合はスキップ
   c. `stateStore.setBriefingStatus(event.id, { status: 'gathering' })` を設定。さらに `stateStore` の meeting に `title`, `startTime`, `endTime`, `recurringEventId` を設定
   d. `deadline` = `new Date(event.start)`（会議開始時刻）
   e. `briefingGenerator.generateBriefing(event, deadline)` を呼ぶ
   f. 結果に基づいてステータス更新:
      - `sent` → `setBriefingStatus(event.id, { status: 'sent', sentAt: new Date().toISOString() })` + dailyMetrics.briefingsSent++
      - `skipped` → `setBriefingStatus(event.id, { status: 'skipped' })`
   g. **Post-meeting 登録**: 会議を `pendingPostMeetingEvents` に追加（終了後に処理するため）。ただし既に登録済みの場合はスキップ
5. エラーハンドリング: 個別のイベント処理で例外が発生した場合:
   - `setBriefingStatus(event.id, { status: 'failed', error: error.message })`
   - dailyMetrics.errors++
   - critical error チェック（`handleCriticalError(error)`）
   - **他のイベント処理は続行**（ループを break しない）
6. ログ: ポーリング開始・各イベント処理結果

#### `shouldProcessMeeting(event: CalendarEvent): boolean` (private)

以下すべてを満たす場合に `true`:

1. `event.isAllDay === false` — All-day イベントは除外
2. `(event.attendees?.length ?? 0) >= config.minimumAttendees` — 最低参加者数チェック
3. `!matchesExcludePattern(event)` — 除外パターンにマッチしない

除外パターンチェック (`matchesExcludePattern`):
- `config.excludePatterns` の各パターンを評価
- `type: 'title'` の場合:
  - パターンが `/` で始まり `/` で終わる場合 → 正規表現マッチ: `new RegExp(pattern.slice(1, -1)).test(event.title)`
  - それ以外 → サブストリングマッチ: `event.title.toLowerCase().includes(pattern.toLowerCase())`
- `type: 'calendar'` の場合:
  - `event.calendar?.toLowerCase().includes(pattern.toLowerCase())`
- **declined meetings は処理対象に含める**（R3.9: 除外しない）

---

### Post-meeting ロジック

#### Post-meeting delay と buffer の計算

会議が Post-meeting 処理対象になるタイミング:
```
eligibleTime = event.end + meetingEndBuffer(分) + postMeetingDelay(分)
```
- `meetingEndBuffer` (default: 10分): 会議が延長する可能性を考慮
- `postMeetingDelay` (default: 30分): Gemini transcript アップロード時間を考慮

#### `registerForPostMeeting(event: CalendarEvent)` (private)

1. `pendingPostMeetingEvents` に `event.id` をキーとして追加
2. `stateStore.setPostMeetingStatus(event.id, { status: 'waiting', pollStartedAt: new Date().toISOString() })`
3. ログ: `Registered meeting for post-meeting polling: ${event.title}`

#### `processPostMeetingQueue()` (private async)

1. `if (!this.running && this.postMeetingQueue.size === 0 && this.postMeetingQueue.pending === 0) return`
2. `const now = new Date()`
3. `pendingPostMeetingEvents` をイテレート:
   a. **eligibleTime チェック**: `event.end + meetingEndBuffer + postMeetingDelay` が now より前かどうか
   b. まだ eligibleTime に達していない場合はスキップ
   c. **timeout チェック**: `pollStartedAt + postMeetingTimeout(時間)` が now より前の場合:
      - `stateStore.setPostMeetingStatus(event.id, { status: 'timeout' })`
      - `pendingPostMeetingEvents.delete(event.id)`
      - dailyMetrics.errors++
      - ログ: `Post-meeting polling timed out for: ${event.title}`
      - continue
   d. eligibleTime に達している場合、`postMeetingQueue.add()` でジョブをエンキュー:
      ```typescript
      this.postMeetingQueue.add(async () => {
        await this.pollAndProcessPostMeeting(event);
      });
      ```
4. **Daily summary チェック**: `checkDailySummary()` を呼ぶ

#### `pollAndProcessPostMeeting(event: CalendarEvent)` (private async)

1. `stateStore.setPostMeetingStatus(event.id, { status: 'polling', lastPollAt: new Date().toISOString() })`
2. `const pollResult = await postMeetingProcessor.poll(event)`
3. `if (pollResult.status === 'waiting')` → return（次回ポーリングで再試行）
4. `if (pollResult.status === 'ready')`:
   a. `const result = await postMeetingProcessor.process(event, pollResult.transcript, pollResult.notionNotes)`
   b. `stateStore.setPostMeetingStatus(event.id, { status: 'processed', processedAt: new Date().toISOString(), sources: result.sources })`
   c. dailyMetrics.postMeetingProcessed++
   d. dailyMetrics.actionItemsCreated += result.actionItems.length
   e. `pendingPostMeetingEvents.delete(event.id)`
   f. ログ: `Post-meeting processing completed for: ${event.title}`
5. エラーハンドリング:
   - `stateStore.setPostMeetingStatus(event.id, { status: 'failed', error: error.message })`
   - dailyMetrics.errors++
   - critical error チェック（`handleCriticalError(error)`）
   - ログ: `Post-meeting processing failed for: ${event.title}`

#### `registerTodaysPastMeetings()` (private async)

1. `startDate` = 今日の 00:00:00 UTC（ISO 8601）
2. `endDate` = 現在時刻（ISO 8601）
3. `CalendarSourceManager.getEvents(startDate, endDate)` で今日の終了済み会議を取得
4. 取得した各イベントに対して:
   a. `shouldProcessMeeting(event)` でフィルタ
   b. 既に `stateStore.getPostMeetingStatus(event.id)` にステータスがある場合はスキップ（再起動時の重複防止）
   c. `registerForPostMeeting(event)` で登録
5. ログ: `Registered ${count} past meetings for post-meeting polling`

---

### Daily Summary

#### `checkDailySummary()` (private async)

1. `if (!config.dailySummaryEnabled) return`
2. 現在日付を `YYYY-MM-DD` で取得
3. `dailySummarySent` が `true` かつ `dailySummaryDate` が今日の場合 → return（既に送信済み）
4. 日付が変わった場合 → `dailySummarySent = false`, dailyMetrics をリセット
5. 勤務終了時刻チェック:
   - `const config = await ConfigLoader.load()`
   - `workingHours.end` を取得（例: "18:00"）
   - 現在時刻がユーザーの勤務終了時刻を過ぎているかチェック（config.user.timezone を考慮）
   - 過ぎていない場合 → return
6. `const status = this.getStatus()`
7. `const blocks = formatDailySummary(status)`
8. `await slackService.sendDirectMessage(blocks)`
9. `dailySummarySent = true`, `dailySummaryDate = 今日の日付`
10. ログ: `Daily summary sent`

---

### Critical Error Notification

#### `handleCriticalError(error: unknown)` (private async)

1. Critical error の判定:
   - `SlackTokenRevokedError` のインスタンスチェック（`import { SlackTokenRevokedError } from '../integrations/slack-service.js'`）
   - エラーメッセージに `'scope not granted'` or `'UNAUTHENTICATED'` or `'invalid_grant'` が含まれる場合
   - **上記に該当しない場合は return**（通常エラーは Daily summary でまとめて報告）
2. Critical error の場合:
   ```typescript
   const criticalError: CriticalPipelineError = {
     type: error instanceof SlackTokenRevokedError ? 'slack_auth' : 'google_auth',
     message: error instanceof Error ? error.message : String(error),
     timestamp: new Date().toISOString(),
   };
   ```
3. `const blocks = formatCriticalError(criticalError)`
4. `await slackService.sendDirectMessage(blocks)` — try/catch でラップ（Slack 自体が 401 の場合は送信できない）
5. ログ: `Critical error notification sent: ${criticalError.type}`

---

### dailyMetrics の更新

PipelineStateStore の `dailyMetrics` を直接更新する。PipelineStateStore の `getState()` で内部状態への参照を取得し、`dailyMetrics` フィールドを更新後に `save()` を呼ぶ。

```typescript
private incrementMetric(metric: keyof PipelineStateFile['dailyMetrics'], value: number = 1): void {
  const state = this.stateStore.getState();
  const today = new Date().toISOString().split('T')[0];

  // 日付が変わっていたらリセット
  if (state.dailyMetrics.date !== today) {
    state.dailyMetrics.date = today;
    state.dailyMetrics.briefingsSent = 0;
    state.dailyMetrics.postMeetingProcessed = 0;
    state.dailyMetrics.actionItemsCreated = 0;
    state.dailyMetrics.errors = 0;
  }

  if (metric !== 'date') {
    (state.dailyMetrics[metric] as number) += value;
  }
  this.stateStore.save();
}
```

---

## 依存関係

- `CalendarSourceManager` (`src/integrations/calendar-source-manager.ts`): `getEvents(startDate, endDate)` — CalendarEvent[] を返す
- `BriefingGenerator` (`src/services/briefing-generator.ts`): `generateBriefing(event, deadline)` — BriefingResult を返す
- `PostMeetingProcessor` (`src/services/post-meeting-processor.ts`): `poll(event)` — PollResult, `process(event, transcript, notionNotes)` — PostMeetingResult
- `PipelineStateStore` (`src/services/pipeline-state-store.ts`): 状態管理（getBriefingStatus, setBriefingStatus, setPostMeetingStatus, getState, save, flush, load）
- `WorkingCadenceService` (`src/services/working-cadence.ts`): 勤務時間情報（直接メソッドは使わず、ConfigLoader 経由で workingHours を取得）
- `SlackService` (`src/integrations/slack-service.ts`): `sendDirectMessage(blocks)`, `SlackTokenRevokedError`
- `ConfigLoader` (`src/config/loader.ts`): `ConfigLoader.load()` で UserConfig を取得（Daily summary の勤務時間チェック用）
- `MeetingIntelligenceConfig` (`src/types/pipeline-config.ts`): 設定値
- `PipelineStatus`, `CriticalPipelineError` (`src/types/pipeline-types.ts`)
- `CalendarEvent` (`src/types/google-calendar-types.ts`)
- `formatDailySummary`, `formatCriticalError` (`src/utils/slack-blocks.ts`)
- `p-queue`: `import PQueue from 'p-queue'` — `^9.1.0`（dependencies に既存）
- `createLogger` (`src/utils/logger.ts`)

---

## テスト

- **テストファイル配置:** `tests/unit/` 配下
- **テストファイル:** `tests/unit/pipeline-scheduler.test.ts`

### テスト項目

#### コンストラクタ・ライフサイクル
- `isRunning()`: 初期状態で `false` を返す
- `start()`: `running` を `true` にし、`stateStore.load()` を呼び、pre-meeting と post-meeting interval を開始
- `stop()`: `running` を `false` にし、interval をクリアし、`stateStore.flush()` を呼ぶ
- `stop()`: p-queue の進行中ジョブは完了まで継続する（`postMeetingQueue.clear()` が呼ばれないことを確認）
- `getStatus()`: 正しい PipelineStatus を返す

#### Meeting フィルタリング
- `shouldProcessMeeting()`: all-day イベントを除外
- `shouldProcessMeeting()`: 参加者数が minimumAttendees 未満のイベントを除外
- `shouldProcessMeeting()`: excludePatterns のタイトルサブストリングにマッチするイベントを除外
- `shouldProcessMeeting()`: excludePatterns のタイトル正規表現にマッチするイベントを除外
- `shouldProcessMeeting()`: excludePatterns のカレンダー名にマッチするイベントを除外
- `shouldProcessMeeting()`: declined meeting は処理対象に含める

#### Pre-meeting polling
- `checkUpcomingMeetings()`: briefingWindow 内の会議を取得し BriefingGenerator を呼ぶ
- `checkUpcomingMeetings()`: 既に `sent` ステータスの会議をスキップ
- `checkUpcomingMeetings()`: briefing 成功時に dailyMetrics.briefingsSent を更新
- `checkUpcomingMeetings()`: エラー時に dailyMetrics.errors を更新し、他のイベント処理を続行

#### Post-meeting polling
- `registerForPostMeeting()`: イベントを pendingPostMeetingEvents に追加し stateStore を更新
- `processPostMeetingQueue()`: eligibleTime に達したイベントのみ p-queue にエンキュー
- `processPostMeetingQueue()`: timeout に達したイベントを timeout ステータスにし Map から削除
- `pollAndProcessPostMeeting()`: poll が `waiting` を返した場合は Map から削除しない
- `pollAndProcessPostMeeting()`: poll が `ready` を返した場合に process を呼び、成功時に metrics を更新

#### Initial enable
- `registerTodaysPastMeetings()`: 今日の終了済み会議を post-meeting polling に登録
- `registerTodaysPastMeetings()`: 既にステータスがある会議をスキップ

#### Daily summary
- `checkDailySummary()`: 勤務終了後に formatDailySummary + sendDirectMessage を呼ぶ
- `checkDailySummary()`: 同日中に2回呼ばれても1回しか送信しない
- `checkDailySummary()`: dailySummaryEnabled が false の場合は送信しない

#### Critical error notification
- `handleCriticalError()`: SlackTokenRevokedError で critical error notification を送信
- `handleCriticalError()`: scope エラーで critical error notification を送信
- `handleCriticalError()`: 通常エラーでは notification を送信しない

### テストのモックパターン

```typescript
// p-queue のモック（ESM default export）
jest.mock('p-queue', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    add: jest.fn((fn: () => Promise<void>) => fn()),
    size: 0,
    pending: 0,
    clear: jest.fn(),
  })),
}));

// CalendarSourceManager のモック
const mockCalendarSourceManager = {
  getEvents: jest.fn().mockResolvedValue([]),
};

// BriefingGenerator のモック
const mockBriefingGenerator = {
  generateBriefing: jest.fn().mockResolvedValue({ status: 'sent', messageTs: '123' }),
};

// PostMeetingProcessor のモック
const mockPostMeetingProcessor = {
  poll: jest.fn().mockResolvedValue({ status: 'waiting' }),
  process: jest.fn().mockResolvedValue({
    summary: 'test',
    actionItems: [],
    sourceLanguage: 'en',
    sources: { transcript: true, notionNotes: false },
    sourceLinks: { notionUrls: [] },
  }),
};

// PipelineStateStore のモック
const mockStateStore = {
  load: jest.fn().mockResolvedValue(undefined),
  save: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
  getBriefingStatus: jest.fn().mockReturnValue(null),
  setBriefingStatus: jest.fn(),
  getPostMeetingStatus: jest.fn().mockReturnValue(null),
  setPostMeetingStatus: jest.fn(),
  getState: jest.fn().mockReturnValue({
    version: 1,
    lastUpdated: '',
    meetings: {},
    channelMappings: {},
    dailyMetrics: {
      date: new Date().toISOString().split('T')[0],
      briefingsSent: 0,
      postMeetingProcessed: 0,
      actionItemsCreated: 0,
      errors: 0,
    },
  }),
  getMeeting: jest.fn().mockReturnValue(null),
};

// WorkingCadenceService のモック
const mockWorkingCadenceService = {};

// SlackService のモック
const mockSlackService = {
  sendDirectMessage: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
};

// ConfigLoader のモック
jest.mock('../../src/config/loader.js', () => ({
  ConfigLoader: {
    load: jest.fn().mockResolvedValue({
      user: { name: 'Test', timezone: 'Asia/Tokyo' },
      calendar: {
        workingHours: { start: '09:00', end: '18:00' },
      },
    }),
  },
}));

// MeetingIntelligenceConfig テスト用デフォルト値
const testConfig: MeetingIntelligenceConfig = {
  enabled: true,
  briefingWindow: 15,
  preMeetingPollInterval: 5,
  postMeetingPollInterval: 15,
  postMeetingTimeout: 24,
  postMeetingDelay: 30,
  meetingEndBuffer: 10,
  slackLookbackDays: 7,
  slackMessageBatchSize: 50,
  minimumAttendees: 2,
  excludePatterns: [],
  dailySummaryEnabled: true,
  promptsDir: '~/.sage/prompts/',
};
```

### 既存テスト
- **全既存テストがパスすることを確認:** `npm test`

## 横断的懸念事項

- **ESM import:** 全 import は `.js` 拡張子付き（例: `import PQueue from 'p-queue'` は拡張子不要 — npm パッケージのため）
- **ロギング:** `createLogger('pipeline-scheduler')` を使用
- **タイマー管理:** `setInterval` の戻り値を保持し、`stop()` で `clearInterval` する。`unref()` は不要（サーバープロセス内で動作するため）
- **p-queue:** `import PQueue from 'p-queue'` — ESM default import。concurrency: 1 で初期化
- **時間計算:** 全て UTC で計算。`new Date()` をそのまま使用
- **stateStore の meeting 初期化**: `setBriefingStatus` / `setPostMeetingStatus` 呼び出し前に、meeting エントリの `title`, `startTime`, `endTime`, `recurringEventId` を設定する。PipelineStateStore は `getMeeting(eventId)` が null の場合に `createDefaultMeetingState` で空のエントリを作成するが、metadata は設定されない。PipelineScheduler 側で以下のように設定する:
  ```typescript
  private ensureMeetingMetadata(event: CalendarEvent): void {
    const meeting = this.stateStore.getMeeting(event.id);
    if (!meeting || !meeting.title) {
      // setBriefingStatus/setPostMeetingStatus が内部で createDefaultMeetingState を呼ぶので、
      // その後に getState().meetings[event.id] を直接更新する
      const state = this.stateStore.getState();
      if (state.meetings[event.id]) {
        state.meetings[event.id].title = event.title;
        state.meetings[event.id].startTime = event.start;
        state.meetings[event.id].endTime = event.end;
        if (event.recurringEventId) {
          state.meetings[event.id].recurringEventId = event.recurringEventId;
        }
      }
    }
  }
  ```

## Open Questions

なし
