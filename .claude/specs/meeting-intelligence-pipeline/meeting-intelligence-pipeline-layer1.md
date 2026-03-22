# タスク指示書: Meeting Intelligence Pipeline — Layer 1: Foundation (Tasks 1-8)

## 概要

Meeting Intelligence Pipeline の基盤レイヤー。型定義、設定スキーマ、既存コードの拡張（CalendarEvent, Google OAuth scope, ConfigLoader migration）を実装する。後続の全レイヤー（2-11）がこのレイヤーに依存する。

## 参照資料

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — タスク定義（ソース・オブ・トゥルース）
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — 設計文書（Data Models セクション、Components and Interfaces セクション、Required Schema Changes セクション）
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — 要件文書（R1-R11）

## 作業内容

### Task 1: npm dependencies インストール

- **優先度:** 高
- **ファイル:** `package.json`
- **作業:** 以下4パッケージをインストール
  - `@slack/web-api`
  - `@slack/oauth`
  - `htmlparser2`
  - `p-queue`
- **注意:**
  - `p-queue` は ESM-only。プロジェクトは `"type": "module"` なので互換
  - 全パッケージが TypeScript 型を同梱。`@types/*` は不要
- **確認:** `npm install` 成功、`npm ls @slack/web-api @slack/oauth htmlparser2 p-queue` でインストール確認

---

### Task 2: pipeline-types.ts 作成

- **優先度:** 高
- **ファイル:** `src/types/pipeline-types.ts`（新規）
- **作業:** Zod スキーマと TypeScript 型を定義
- **定義する Zod スキーマ（設計文書 Data Models セクションの定義をそのまま使用）:**
  - `ActionItemSchema` — id, description, assignee?, assigneeEmail?, assigneeSlackId?, dueDate, source, meetingEventId, reminderCreated, createdAt
  - `MeetingProcessingStateSchema` — eventId, recurringEventId?, title, startTime, endTime, briefing (status enum + sentAt? + error?), postMeeting (status enum + pollStartedAt? + lastPollAt? + processedAt? + sources + error?), actionItems
  - `PipelineStateFileSchema` — version: z.literal(1), lastUpdated, meetings, channelMappings, dailyMetrics
- **定義する interface/type（設計文書 Components and Interfaces セクション）:**
  - `BriefingResult` = `{ status: 'sent'; messageTs: string } | { status: 'skipped'; reason: string }`
  - `PollResult` = `{ status: 'waiting' } | { status: 'ready'; transcript: string | null; notionNotes: string | null }`
  - `PostMeetingResult` — summary, actionItems, sourceLanguage, sources, sourceLinks
  - `BriefingContext` — slackChannelSummaries, notionDocSummaries, previousActionItems, attendees, agenda?, sourceLinks
  - `ActionItemWithStatus` — item: ActionItem, completed: boolean
  - `SourceLinks` — notionUrls, transcriptUrl?, slackChannelUrls?
  - `PipelineStatus` — isRunning, briefingsSentToday, postMeetingProcessedToday, actionItemsCreatedToday, errorsToday, pendingPostMeetingPolls
  - `CriticalPipelineError` — type, message, timestamp, details?
- **依存:** `CalendarEvent` は `src/types/google-calendar-types.ts` からインポート（BriefingContext 等で使用する場合）
- **パターン:** 既存の Zod パターン（`src/config/validation.ts`）を踏襲。全型を `z.infer<>` で導出

---

### Task 3: pipeline-config.ts 作成

- **優先度:** 高
- **ファイル:** `src/types/pipeline-config.ts`（新規）
- **作業:** 2つの Zod スキーマと派生型を定義
- **`MeetingIntelligenceConfigSchema`（設計文書 Data Models セクションをそのまま使用）:**
  - `enabled`: z.boolean().default(false)
  - `briefingWindow`: z.number().min(5).max(60).default(15)
  - `preMeetingPollInterval`: z.number().min(1).max(30).default(5)
  - `postMeetingPollInterval`: z.number().min(5).max(60).default(15)
  - `postMeetingTimeout`: z.number().min(1).max(48).default(24)
  - `postMeetingDelay`: z.number().min(0).max(120).default(30)
  - `meetingEndBuffer`: z.number().min(0).max(30).default(10)
  - `slackLookbackDays`: z.number().min(1).max(30).default(7)
  - `slackMessageBatchSize`: z.number().min(10).max(200).default(50)
  - `minimumAttendees`: z.number().min(2).default(2)
  - `excludePatterns`: z.array(z.object({ type: z.enum(['title', 'calendar']), pattern: z.string() })).default([])
  - `dailySummaryEnabled`: z.boolean().default(true)
  - `promptsDir`: z.string().default('~/.sage/prompts/')
- **`SlackIntegrationConfigSchema`:**
  - `enabled`: z.boolean().default(false)
  - `clientId`: z.string().optional()
  - `clientSecret`: z.string().optional()
  - `redirectUri`: z.string().optional()
- **エクスポート:** 両スキーマ + `MeetingIntelligenceConfig` + `SlackIntegrationConfig`（z.infer）

---

### Task 4: config.ts 拡張

- **優先度:** 高
- **ファイル:** `src/types/config.ts`（変更）
- **作業:**
  1. import 追加: `import type { MeetingIntelligenceConfig, SlackIntegrationConfig } from './pipeline-config.js';`
  2. `UserConfig` interface（L7-19）に追加: `meetingIntelligence?: MeetingIntelligenceConfig;`
  3. `IntegrationsConfig` interface（L130-134）に追加: `slack?: SlackIntegrationConfig;`
- **やらないこと:** `DEFAULT_CONFIG` の変更（Task 8 で対応）

---

### Task 5: CalendarEvent conferenceData 拡張

- **優先度:** 高
- **ファイル:** `src/types/google-calendar-types.ts`（変更）
- **作業:** 2箇所の変更
  1. **`GoogleCalendarEvent` interface（L115-185）** に `conferenceData` フィールドを追加（Google Calendar API のレスポンスに含まれるフィールド）:
     ```typescript
     conferenceData?: {
       conferenceId?: string;
       conferenceSolution?: { name: string };
       entryPoints?: { entryPointType: string; uri: string }[];
     };
     ```
  2. **`CalendarEvent` interface（L252-305）** に同じ `conferenceData` フィールドを追加（`attendeesDetailed?` の後）:
     ```typescript
     /** Conference data for Google Meet transcript matching */
     conferenceData?: {
       conferenceId?: string;
       conferenceSolution?: { name: string };
       entryPoints?: { entryPointType: string; uri: string }[];
     };
     ```

---

### Task 6: Google Calendar event mapping に conferenceData を追加

- **優先度:** 高
- **ファイル:** `src/types/google-calendar-types.ts`（変更）
- **作業:** `convertGoogleToCalendarEvent` 関数（L389-451）の return オブジェクト（L426-450, `attendeesDetailed` の後）に追加:
  ```typescript
  // Conference data for Meet transcript matching
  conferenceData: googleEvent.conferenceData ? {
    conferenceId: googleEvent.conferenceData.conferenceId,
    conferenceSolution: googleEvent.conferenceData.conferenceSolution
      ? { name: googleEvent.conferenceData.conferenceSolution.name }
      : undefined,
    entryPoints: googleEvent.conferenceData.entryPoints?.map((ep) => ({
      entryPointType: ep.entryPointType,
      uri: ep.uri,
    })),
  } : undefined,
  ```
- **前提:** Task 5 で `GoogleCalendarEvent` に `conferenceData` フィールドが追加されていること

---

### Task 7: drive.readonly scope 追加

- **優先度:** 高
- **ファイル:** `src/oauth/google-oauth-handler.ts`（変更）
- **作業:** `GOOGLE_CALENDAR_SCOPES` 配列（L49-53）に1行追加:
  ```typescript
  export const GOOGLE_CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/directory.readonly',
    'https://www.googleapis.com/auth/drive.readonly',  // ← 追加
  ];
  ```

---

### Task 8: ConfigLoader migration 追加

- **優先度:** 高
- **ファイル:** `src/config/loader.ts`（変更）、`src/types/config.ts`（変更）
- **作業1 — loader.ts:**
  1. import 追加: `MeetingIntelligenceConfigSchema`, `SlackIntegrationConfigSchema` を `pipeline-config.ts` からインポート
  2. `load()` メソッド内、既存 `calendar.sources` マイグレーション（L59-67）の直後に追加:
     ```typescript
     // Migrate config if meetingIntelligence is missing
     if (!parsed.meetingIntelligence) {
       parsed.meetingIntelligence = MeetingIntelligenceConfigSchema.parse({});
       migrated = true;
     }

     // Migrate config if integrations.slack is missing
     if (!parsed.integrations?.slack) {
       if (!parsed.integrations) {
         parsed.integrations = { ...DEFAULT_CONFIG.integrations };
       }
       parsed.integrations.slack = SlackIntegrationConfigSchema.parse({});
       migrated = true;
     }
     ```
- **作業2 — config.ts の DEFAULT_CONFIG:**
  - `integrations` セクション（L276-296）に `slack` のデフォルト追加:
    ```typescript
    slack: {
      enabled: false,
    },
    ```
  - トップレベル（`preferences` の後）に `meetingIntelligence` のデフォルト追加:
    ```typescript
    meetingIntelligence: {
      enabled: false,
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
    },
    ```
- **パターン:** 既存の `calendar.sources` マイグレーション（L59-67）を厳密に踏襲

---

## テスト

- Task 2, 3: Zod スキーマのバリデーションテスト（デフォルト値、min/max、parse/safeParse）
- Task 4: 既存の config 関連テストが引き続きパスすることを確認
- Task 5, 6: `convertGoogleToCalendarEvent` に conferenceData 付きイベントを渡すテスト
- Task 7: scope 配列に `drive.readonly` が含まれることの確認テスト
- Task 8: migration テスト（meetingIntelligence/slack が未定義の config を load → デフォルト値が設定される）
- **テストファイル配置:** `tests/unit/` 配下
- **既存テスト:** 全既存テストがパスすることを確認（`npm test`）

## 横断的懸念事項

- **ESM import:** 全 import は `.js` 拡張子付き（例: `import { foo } from './pipeline-config.js'`）
- **エクスポート:** 新規ファイルのエクスポートを `src/types/index.ts` に追加する必要がある場合は追加

## Open Questions

なし（Task 5 で `GoogleCalendarEvent` にも `conferenceData` を追加する必要があることを確認済み）
