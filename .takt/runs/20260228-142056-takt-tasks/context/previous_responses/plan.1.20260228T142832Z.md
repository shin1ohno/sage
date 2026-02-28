全ファイルの調査が完了しました。計画を整理します。

## 分析結果と実装計画

### タスク概要

`./takt/tasks` には Meeting Intelligence Pipeline の実装タスクが7レイヤー（22タスク）にわたって定義されています。プリミーティングブリーフィング生成、ポストミーティングサマリー抽出、Slack統合、Google Drive統合（Gemini Meet トランスクリプト取得）を実現するパイプラインを、sage MCPサーバーに追加する大規模機能です。

### 参照資料の状況

**参照資料が存在しません。** 各レイヤーの指示書で指定されている以下のファイルはワークツリー内に存在しません：

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — **存在しない**
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — **存在しない**
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — **存在しない**

`.spec-workflow/` ディレクトリ自体が存在しません。ただし、タスク指示書（`.takt/tasks/` 内の7ファイル）自体に型定義、インターフェース、実装詳細、テスト項目が詳細に記述されており、実装に必要な情報は指示書内で自己完結しています。

### 現在のコードベース状態

| カテゴリ | 状態 |
|---------|------|
| 新規ファイル（16ファイル） | **全て未作成** |
| npm依存 (`@slack/web-api`, `@slack/oauth`, `htmlparser2`, `p-queue`) | **全て未インストール** |
| 変更対象既存ファイル | 全て存在・変更可能 |
| 基盤パターン (`ReloadableService`, `retryWithBackoff`, `createLogger`, `SamplingService`) | **全て利用可能** |
| `conferenceData` フィールド | `GoogleCalendarEvent` / `CalendarEvent` ともに**未定義** |
| `drive.readonly` スコープ | `GOOGLE_CALENDAR_SCOPES` に**未追加** |
| `meetingIntelligence` / `slack` 設定 | `UserConfig` / `IntegrationsConfig` / `DEFAULT_CONFIG` に**未定義** |

### 実行順序と依存関係

```
Layer 1 (Tasks 1-8): Foundation — 型、設定、既存コード拡張
    ↓
Layer 2 (Tasks 9-11): Utilities — パーサー、フォーマッター、プロンプト
    ↓
Layer 3 (Tasks 12-14): Slack Integration — OAuth、SlackService
    ↓
Layer 4 (Task 15): Google Drive — トランスクリプト取得
    ↓
Layer 5 (Tasks 16-19): Core Pipeline — StateStore, ChannelDiscovery, Briefing, PostMeeting
    ↓
Layer 6 (Tasks 20.1-20.2): Scheduler — PipelineScheduler
    ↓
Layer 7 (Tasks 21-22): Hot-Reload — Reloadable Adapters
```

各レイヤーは前のレイヤーに依存しており、**厳密にこの順序で実装する必要があります**。

### レイヤーごとの実装方針

#### Layer 1: Foundation (Tasks 1-8)
- **Task 1**: `npm install @slack/web-api @slack/oauth htmlparser2 p-queue` を実行
- **Task 2**: `src/types/pipeline-types.ts` 新規作成 — Zodスキーマ + TypeScript型
- **Task 3**: `src/types/pipeline-config.ts` 新規作成 — 設定スキーマ
- **Task 4**: `src/types/config.ts` 変更 — `UserConfig.meetingIntelligence?`, `IntegrationsConfig.slack?` 追加
- **Task 5**: `src/types/google-calendar-types.ts` 変更 — `conferenceData` フィールド追加（2箇所）
- **Task 6**: 同ファイル — `convertGoogleToCalendarEvent` にマッピング追加
- **Task 7**: `src/oauth/google-oauth-handler.ts` 変更 — `drive.readonly` スコープ追加
- **Task 8**: `src/config/loader.ts` + `src/types/config.ts` 変更 — マイグレーション追加 + DEFAULT_CONFIG拡張

**テスト**: Zodバリデーション、conferenceDataマッピング、スコープ確認、マイグレーションテスト

#### Layer 2: Utilities (Tasks 9-11)
- **Task 9**: `src/utils/calendar-description-parser.ts` 新規 — `extractNotionUrls`, `extractAgenda`, `extractMeetLink` 純粋関数
- **Task 10**: `src/utils/slack-blocks.ts` 新規 — Block Kit フォーマッター4関数
- **Task 11**: `src/services/prompt-templates.ts` 新規 — 8つのデフォルトプロンプト、ファイルオーバーライド対応

**テスト**: HTML/テキストパース、50ブロック制限、変数置換、デフォルトプロンプト存在確認

#### Layer 3: Slack Integration (Tasks 12-14)
- **Task 12**: `src/oauth/slack-oauth-handler.ts` 新規 — `GoogleOAuthHandler`パターン踏襲、PKCE不要
- **Task 13**: `src/cli/http-server-with-config.ts` 変更 — `/oauth/slack/callback` ルート追加
- **Task 14**: `src/integrations/slack-service.ts` 新規 — WebClient遅延初期化、401検知

**テスト**: OAuth URLパラメータ、トークン交換、API呼び出し、429スレッド取得中止

#### Layer 4: Google Drive (Task 15)
- **Task 15**: `src/integrations/google-drive-service.ts` 新規 — トランスクリプト検索（conferenceId → タイトルフォールバック）

**テスト**: スコープチェック、検索戦略2段階、エクスポート

#### Layer 5: Core Pipeline (Tasks 16-19)
- **Task 16**: `src/services/pipeline-state-store.ts` 新規 — JSONファイル永続化、デバウンス保存
- **Task 17**: `src/services/channel-discovery.ts` 新規 — 手動マッピング → キャッシュ → LLM推論
- **Task 18**: `src/services/briefing-generator.ts` 新規 — 2ステージSlack要約、ブリーフィング生成・送信
- **Task 19**: `src/services/post-meeting-processor.ts` 新規 — ポーリング、サマリー抽出、アクションアイテム重複排除

**テスト**: 状態管理、並列データ収集、デッドラインチェック、エラーグレースフルデグラデーション

#### Layer 6: Scheduler (Tasks 20.1-20.2)
- **Task 20**: `src/services/pipeline-scheduler.ts` 新規 — setIntervalベースのpre/post-meetingポーリング、p-queueでpost-meetingジョブ管理、dailySummary、criticalエラー通知

**テスト**: ライフサイクル管理、ミーティングフィルタリング、eligibleTime計算、timeout処理

#### Layer 7: Hot-Reload (Tasks 21-22)
- **Task 21**: 3つのReloadableAdapter新規作成 — `WorkingCadenceAdapter`パターン踏襲
- **Task 22**: `src/services/reloadable/index.ts` 変更 — 3アダプター登録

**テスト**: ライフサイクル、設定変更時の再初期化、依存注入

### 横断的懸念事項

| 事項 | 対応 |
|------|------|
| ESM import | 全ローカルimportに `.js` 拡張子必須 |
| ロギング | `createLogger('component-name')` 統一 |
| エラーハンドリング | 全API呼び出しに `retryWithBackoff` 使用 |
| テストパターン | 依存注入 + モックオブジェクト |
| Zodパターン | `src/config/validation.ts` の既存パターン踏襲 |
| デバウンス保存 | `PersistentRefreshTokenStore.scheduleSave()` パターン踏襲 |

### 潜在的リスク

1. **参照資料の不在**: 設計文書・要件文書が存在しないため、タスク指示書の記述のみに基づく実装になる。意図の食い違いリスクがある
2. **`@slack/oauth` の使用有無**: Task 1 でインストールするが Task 12 で「使わない」と明記。dependencies に残すかどうかの判断が必要
3. **SamplingService の依存**: Layer 5-6 で MCP Sampling を多用するが、LLM が利用不可な環境でのフォールバック動作を確認する必要がある
4. **テストスイートの肥大化**: 22タスク × 各テストで大量のテストファイルが追加される。既存テストの実行時間への影響を確認する必要がある
5. **`http-server-with-config.ts` の行数**: 既に大きなファイルにさらにルートを追加する（Layer 3 Task 13）

### 確認事項（ユーザーへの質問）

1. **参照資料の不在について**: `.spec-workflow/specs/meeting-intelligence-pipeline/` ディレクトリが存在しません。タスク指示書（`.takt/tasks/` 内の7ファイル）の内容のみで実装を進めてよいですか？
2. **`@slack/oauth` パッケージ**: Task 12 で「`@slack/oauth` は使わない」と明記されていますが、Task 1 でインストール対象に含まれています。インストールのみ行い使用しない方針でよいですか？
3. **全7レイヤーの一括実装**: 22タスク全てを順番に実装しますか？または特定のレイヤーまでで区切りますか？