# 変更スコープ宣言

## タスク
Meeting Intelligence Pipeline の全7レイヤー（22タスク）を実装: 型定義、設定、Slack/Drive統合、パイプラインコア、スケジューラー、Hot-Reload

## ステータス
**実装完了** — ビルド通過 (`tsc --noEmit` クリーン)、テスト通過 (2702 passed, 1 skipped, 1 pre-existing E2E failure)

## 変更一覧
| 種別 | ファイル |
|------|---------|
| 作成 | `src/types/pipeline-types.ts` |
| 作成 | `src/types/pipeline-config.ts` |
| 作成 | `src/utils/calendar-description-parser.ts` |
| 作成 | `src/utils/slack-blocks.ts` |
| 作成 | `src/services/prompt-templates.ts` |
| 作成 | `src/oauth/slack-oauth-handler.ts` |
| 作成 | `src/integrations/slack-service.ts` |
| 作成 | `src/integrations/google-drive-service.ts` |
| 作成 | `src/services/pipeline-state-store.ts` |
| 作成 | `src/services/channel-discovery.ts` |
| 作成 | `src/services/briefing-generator.ts` |
| 作成 | `src/services/post-meeting-processor.ts` |
| 作成 | `src/services/pipeline-scheduler.ts` |
| 作成 | `src/services/reloadable/slack-service-adapter.ts` |
| 作成 | `src/services/reloadable/pipeline-scheduler-adapter.ts` |
| 作成 | `src/services/reloadable/pipeline-state-store-adapter.ts` |
| 変更 | `package.json` (htmlparser2, @slack/web-api 追加) |
| 変更 | `package-lock.json` |
| 変更 | `jest.config.js` (p-queue, eventemitter3 を transformIgnorePatterns に追加) |
| 変更 | `src/types/config.ts` (meetingIntelligence, slack 設定追加) |
| 変更 | `src/types/google-calendar-types.ts` (conferenceData 追加) |
| 変更 | `src/oauth/google-oauth-handler.ts` (drive.readonly scope 追加) |
| 変更 | `src/config/loader.ts` (設定マイグレーション追加) |
| 変更 | `src/cli/http-server-with-config.ts` (Slack OAuth コールバック追加) |
| 変更 | `src/services/reloadable/index.ts` (3アダプター統合) |
| 作成 | `tests/unit/pipeline-types.test.ts` |
| 作成 | `tests/unit/pipeline-config.test.ts` |
| 作成 | `tests/unit/conference-data-mapping.test.ts` |
| 作成 | `tests/unit/config-migration.test.ts` |
| 作成 | `tests/unit/calendar-description-parser.test.ts` |
| 作成 | `tests/unit/slack-blocks.test.ts` |
| 作成 | `tests/unit/prompt-templates.test.ts` |
| 作成 | `tests/unit/slack-oauth-handler.test.ts` |
| 作成 | `tests/unit/google-drive-service.test.ts` |
| 作成 | `tests/unit/pipeline-state-store.test.ts` |
| 作成 | `tests/unit/channel-discovery.test.ts` |
| 作成 | `tests/unit/briefing-generator.test.ts` |
| 作成 | `tests/unit/post-meeting-processor.test.ts` |
| 作成 | `tests/unit/pipeline-scheduler.test.ts` |
| 作成 | `tests/unit/slack-service-adapter.test.ts` |
| 作成 | `tests/unit/pipeline-scheduler-adapter.test.ts` |
| 作成 | `tests/unit/pipeline-state-store-adapter.test.ts` |

## 推定規模
Large (16 new source files, 9 modified files, 15 new test files)

## 影響範囲
- 型システム全体 (UserConfig, IntegrationsConfig, CalendarEvent)
- OAuth 認証 (Google scope拡張, Slack OAuth追加)
- 設定マイグレーション (ConfigLoader)
- Hot-Reload アーキテクチャ (3アダプター追加)
- HTTP サーバー (Slack OAuthコールバック追加)
- Jest 設定 (ESM-only パッケージ対応)