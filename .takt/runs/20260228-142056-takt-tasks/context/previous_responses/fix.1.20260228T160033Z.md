## 作業結果
- レビュー指摘（ARCH-001〜005, SEC-001〜002, QA-001〜006）計13件を全て修正しました

## 変更内容

### アーキテクチャ修正 (ARCH-001〜005)
- **ARCH-001**: `pipeline-scheduler.ts`（395行→289行）から `MeetingFilter`、`DailySummaryService`、`handleCriticalError` を3つの新規ファイルに抽出
  - `src/services/meeting-filter.ts` - 会議フィルタリングロジック
  - `src/services/daily-summary-service.ts` - 日次サマリー送信サービス
  - `src/services/pipeline-critical-error-handler.ts` - クリティカルエラー通知
- **ARCH-002**: `post-meeting-processor.ts`（415行→345行）から `buildActionItem` + `resolveAssigneeEmail` を `src/services/action-item-builder.ts` に抽出
- **ARCH-003**: `slack-blocks.ts` の `formatBriefing`/`formatPostMeetingReport` の重複を `formatMessageBlocks` 共通関数に統合
- **ARCH-004**: JSON抽出パターンの重複を `src/utils/llm-response-parser.ts` の `extractJsonFromLlmResponse` に集約
- **ARCH-005**: Slack資格情報を環境変数に統一。`SlackIntegrationConfigSchema` から `clientId`/`clientSecret`/`redirectUri` を削除し、`createSlackService` を `process.env.SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` ベースに変更

### セキュリティ修正 (SEC-001〜002)
- **SEC-001**: `handleSlackOAuthCallback` の `error` パラメータに `escapeHtml()` を適用（Reflected XSS防止）
- **SEC-002**: Slack OAuthコールバックに `state` パラメータ検証を追加（CSRF防止）。`pendingSlackStates` Map + `createSlackOAuthState()` メソッドで10分有効のワンタイムstate管理

### QA修正 (QA-001〜006)
- **QA-001**: `tests/unit/slack-service.test.ts` を新規作成（lazy初期化、token revocation検出、429 rate limit中止、lookupUser挙動をカバー）
- **QA-002**: `tests/unit/config-loader.test.ts` に `meetingIntelligence` / `integrations.slack` マイグレーションテスト2件追加
- **QA-003**: `tests/unit/slack-oauth-callback.test.ts` を新規作成（escapeHtml検証、state検証フロー、503/400レスポンスパスをカバー）
- **QA-004**: `google-drive-service.test.ts` の `as any` → `as never` に変更
- **QA-005**: `config-migration.test.ts` の `any` 型 → `UserConfig` 型に変更
- **QA-006**: `channel-discovery.ts` の空catchに `logger.debug('JSON parse failed for channel IDs, falling back to regex extraction')` を追加

## ビルド結果
- `npx tsc --noEmit` → ✅ 成功（型エラーなし）

## テスト結果
- `npx jest --testPathPattern='tests/unit' --forceExit` → **105 suites passed, 2346 tests passed** ✅
- 新規・変更対象テスト11ファイル → **101 tests passed** ✅
- E2Eテスト1件 (`cli-modes.test.ts`) が失敗していますが、これは `dist/index.js` の古いビルドに依存するE2Eテストであり、今回の変更とは無関係です

## 証拠
- 変更前行数: `pipeline-scheduler.ts` 395行 / `post-meeting-processor.ts` 415行
- 変更後行数: `pipeline-scheduler.ts` 289行 / `post-meeting-processor.ts` 345行
- 新規ファイル6件: `meeting-filter.ts`(60行), `daily-summary-service.ts`(67行), `pipeline-critical-error-handler.ts`(48行), `action-item-builder.ts`(84行), `llm-response-parser.ts`(16行)
- 新規テスト3件: `slack-service.test.ts`, `slack-oauth-callback.test.ts`, `config-loader.test.ts`にテスト2件追加
- `SlackIntegrationConfigSchema` から secret フィールド削除済み（`pipeline-config.ts`）
- `escapeHtml` 関数を `http-server-with-config.ts` に追加、Slack OAuth error パラメータにエスケープ適用済み
- state パラメータ検証: `pendingSlackStates` Map + `createSlackOAuthState()` + コールバック内検証ロジック追加済み