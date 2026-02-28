# タスク計画

## 元の要求
`./takt/tasks` の内容を順番に実行

## 分析結果

### 目的
sage MCPサーバーに「Meeting Intelligence Pipeline」機能を追加する。プリミーティングブリーフィング自動生成、ポストミーティングサマリー・アクションアイテム抽出、Slack統合、Google Driveトランスクリプト取得を実現する自動パイプラインを7レイヤー（22タスク）にわたって実装する。

### 参照資料の調査結果

タスク指示書（`.takt/tasks/meeting-intelligence-pipeline-layer{1-7}.md`）で参照資料として指定されている以下のファイルは**全て存在しない**：

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — **存在しない**
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — **存在しない**
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — **存在しない**

`.spec-workflow/` ディレクトリ自体がワークツリーに存在しない。ただし、タスク指示書7ファイル自体に型定義、インターフェース、実装ロジック、テスト項目が極めて詳細に記述されており、実装に必要な情報はタスク指示書内で自己完結している。**参照資料の不在による推測での代用は行わず、タスク指示書の記述を唯一の仕様として実装する。**

### スコープ

**新規ファイル（16ファイル）:**

| ファイル | レイヤー | 責務 |
|---------|---------|------|
| `src/types/pipeline-types.ts` | L1 | Zodスキーマ + パイプライン型定義 |
| `src/types/pipeline-config.ts` | L1 | MeetingIntelligence / Slack設定スキーマ |
| `src/utils/calendar-description-parser.ts` | L2 | HTML/テキストからNotionURL・アジェンダ・Meetリンク抽出 |
| `src/utils/slack-blocks.ts` | L2 | Slack Block Kitフォーマッター |
| `src/services/prompt-templates.ts` | L2 | 8つのデフォルトプロンプト + ファイルオーバーライド |
| `src/oauth/slack-oauth-handler.ts` | L3 | Slack OAuth 2.0ハンドラー（PKCE不要） |
| `src/integrations/slack-service.ts` | L3 | Slack APIクライアント（WebClient遅延初期化） |
| `src/integrations/google-drive-service.ts` | L4 | Gemini Meetトランスクリプト検索・取得 |
| `src/services/pipeline-state-store.ts` | L5 | パイプライン状態JSON永続化（デバウンス保存） |
| `src/services/channel-discovery.ts` | L5 | Slackチャンネル自動発見（手動→キャッシュ→LLM推論） |
| `src/services/briefing-generator.ts` | L5 | プリミーティングブリーフィング生成・送信 |
| `src/services/post-meeting-processor.ts` | L5 | ポストミーティング処理（ポーリング・サマリー抽出） |
| `src/services/pipeline-scheduler.ts` | L6 | パイプラインオーケストレーション（setInterval + p-queue） |
| `src/services/reloadable/slack-service-adapter.ts` | L7 | SlackService用ReloadableAdapter |
| `src/services/reloadable/pipeline-scheduler-adapter.ts` | L7 | PipelineScheduler用ReloadableAdapter |
| `src/services/reloadable/pipeline-state-store-adapter.ts` | L7 | PipelineStateStore用ReloadableAdapter |

**変更対象既存ファイル（7ファイル）:**

| ファイル | レイヤー | 変更内容 |
|---------|---------|---------|
| `package.json` | L1 | 4パッケージ追加 |
| `src/types/config.ts` | L1 | `meetingIntelligence?`, `slack?`追加、DEFAULT_CONFIG拡張 |
| `src/types/google-calendar-types.ts` | L1 | `conferenceData`フィールド追加（3箇所） |
| `src/oauth/google-oauth-handler.ts` | L1 | `drive.readonly`スコープ追加 |
| `src/config/loader.ts` | L1 | マイグレーション2件追加 |
| `src/cli/http-server-with-config.ts` | L3 | Slack OAuthコールバックルート追加 |
| `src/services/reloadable/index.ts` | L7 | 3アダプター登録 |

**新規テストファイル（約16ファイル）:** 各レイヤーの指示書に記載のテスト項目に基づき作成

**現在の実装状態:** 上記の新規ファイルは**全て未作成**、npmパッケージ4件は**全て未インストール**、既存ファイルの変更対象箇所は**全て未変更**。

### 実装アプローチ

**厳密にレイヤー順（Layer 1 → 7）で実装する。** 各レイヤーは前レイヤーに依存するため順序変更不可。

```
Layer 1 (Tasks 1-8): Foundation
    ↓ 型・設定・スコープが後続全てに必要
Layer 2 (Tasks 9-11): Utilities
    ↓ パーサー・フォーマッターがL5に必要
Layer 3 (Tasks 12-14): Slack Integration
    ↓ SlackServiceがL5-6に必要
Layer 4 (Task 15): Google Drive
    ↓ GoogleDriveServiceがL5に必要
Layer 5 (Tasks 16-19): Core Pipeline
    ↓ StateStore・Generator・ProcessorがL6に必要
Layer 6 (Tasks 20.1-20.2): Scheduler
    ↓ PipelineSchedulerがL7に必要
Layer 7 (Tasks 21-22): Hot-Reload
```

各レイヤー内のタスクはTask番号順に実装する。各タスク完了時にテストを作成・実行し、全既存テストもパスすることを確認する。

## 実装ガイドライン

### 全レイヤー共通
- **ESM import**: ローカルファイルは `.js` 拡張子必須（例: `import { foo } from './pipeline-config.js'`）
- **ロギング**: `createLogger('component-name')` を統一使用
- **エラーハンドリング**: 外部API呼び出しには `retryWithBackoff` を必ず使用
- **Zodパターン**: `src/config/validation.ts` の既存パターンを踏襲。型は `z.infer<>` で導出
- **テストパターン**: 依存注入 + モックオブジェクトで外部依存を分離

### Layer 1 固有
- `package.json` の4パッケージは `npm install` で追加。`p-queue` はESM-only、プロジェクトは `"type": "module"` なので互換性あり
- `config.ts` の `DEFAULT_CONFIG` 変更は Task 8 で行う（Task 4 では型定義のみ）
- `loader.ts` のマイグレーションは既存の `calendar.sources` マイグレーション（L59-67）パターンを厳密に踏襲

### Layer 2 固有
- Task 9, 10 は純粋関数エクスポート、Task 11 はクラスベース
- `htmlparser2` でHTML判定は `<` の有無で簡易判定
- Slack Block Kit出力は全関数で50ブロック上限を遵守

### Layer 3 固有
- `SlackOAuthHandler` は `GoogleOAuthHandler` パターンを踏襲するが**PKCEは不要**（Slack非対応）
- `@slack/oauth` はTask 1でインストールするがTask 12で「使わない」と明記。直接HTTPリクエストを使用
- `SlackService` のWebClient初期化は遅延（最初のAPI呼び出し時）
- HTTP serverへの `SlackOAuthHandler` import は dynamic import（`await import()`）で行う

### Layer 4 固有
- `findTranscript` は2段階検索: conferenceId → イベントタイトルフォールバック
- `event.conferenceData` が undefined の場合は即座に `null` 返却（API呼び出しなし）
- スコープチェックは `ensureDriveClient()` 内で行い、`isAvailable()` フラグを更新

### Layer 5 固有
- `PipelineStateStore` のデバウンス保存は `PersistentRefreshTokenStore.scheduleSave()` パターンを踏襲
- `BriefingGenerator` のSlackメッセージ要約は2ステージ（バッチ要約 → 統合要約）
- `PostMeetingProcessor` のアクションアイテム重複排除はLLMコンテキストに既存アイテムを含める方式
- SamplingService エラーはcatchしてグレースフルにdegradation（空コンテキストで続行）

### Layer 6 固有
- `setInterval` ベースのポーリング。`start()` / `stop()` でライフサイクル管理
- Post-meeting処理は `p-queue`（concurrency: 1）でシリアライズ
- eligibleTime = `event.end + meetingEndBuffer + postMeetingDelay`
- `stop()` 時に `postMeetingQueue.clear()` は呼ばない（進行中ジョブは完了まで継続）

### Layer 7 固有
- `WorkingCadenceAdapter` のパターンを**正確に**踏襲
- 登録順序: PipelineStateStore → SlackService → PipelineScheduler（依存関係順）
- PipelineSchedulerAdapter は `shutdown()` で必ず `stop()` を呼ぶ（タイマー重複防止）
- Slack未設定時は `instance = null` で warn ログ、例外は throw しない（オプショナル機能）

## 確認事項

1. **参照資料の不在**: `.spec-workflow/specs/meeting-intelligence-pipeline/` が存在しない。タスク指示書の記述のみで実装を進める方針とするが、意図の食い違いリスクがある。別途スペックファイルの提供が可能であれば提供を推奨する
2. **`@slack/oauth` パッケージ**: Task 1でインストール指示があるがTask 12で「使わない」と明記。不要依存としてインストールを省略するか、指示書通りインストールのみ行うか判断が必要。指示書に従いインストールのみ行う方針とする
3. **テスト実行時間**: 推定16以上の新規テストファイル追加により、テストスイート全体の実行時間が増加する。`isolatedModules: true` が設定済みであることを前提とする