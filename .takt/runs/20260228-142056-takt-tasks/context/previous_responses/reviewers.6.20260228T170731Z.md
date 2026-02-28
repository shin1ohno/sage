## arch-review
全検証が完了しました。レビュー結果をまとめます。

---

## アーキテクチャレビュー結果

### 結果: **APPROVE**

### サマリー

前回の2件のREJECT指摘（ARCH-016, ARCH-019）は適切に修正されている。`DailySummaryService` から `ConfigLoader.load()` 直接呼び出しが除去され、コンストラクタDI経由で `workingHoursEnd` を受け取る正しいパターンに修正。`PipelineStateStore` の `setBriefingStatus` / `setPostMeetingStatus` は `string` から Zodスキーマ由来のenum型を含む正確な型パラメータに変更され、`as` キャストも除去。全呼び出し元（`PipelineScheduler`, `BriefingGenerator`, `PostMeetingProcessor`）が正しい型で引数を渡していることを確認済み。

### 確認した観点

- [x] 構造・設計
- [x] コード品質
- [x] 変更スコープ
- [x] テストカバレッジ
- [x] デッドコード
- [x] 呼び出しチェーン検証
- [x] 契約文字列のハードコード散在

### 前回指摘の追跡

| finding_id | 前回状態 | 今回状態 | 検証結果 |
|------------|---------|---------|---------|
| ARCH-007 | resolved | resolved | `src/utils/html.ts` に `escapeHtml` が集約済み。変更なし |
| ARCH-016 | new | **resolved** | `src/services/daily-summary-service.ts` — `ConfigLoader` importなし。コンストラクタで `workingHoursEnd: string` を受け取り（L21）。`PipelineScheduler` コンストラクタ（L45-46）経由で渡される。ファクトリ `createPipelineScheduler` が `config.calendar.workingHours.end` を注入（`pipeline-scheduler-adapter.ts:52`）。テストも `'18:00'` を直接渡す形に更新済み |
| ARCH-019 | new | **resolved** | `src/services/pipeline-state-store.ts:109` — `setBriefingStatus` の型が `Partial<MeetingProcessingState['briefing']> & Pick<MeetingProcessingState['briefing'], 'status'>` に変更済み。L123の `setPostMeetingStatus` も同様。`as` キャストなし。全7箇所の呼び出し元（`pipeline-scheduler.ts:142,147,150,158`, `briefing-generator.ts:90`, `post-meeting-processor.ts:221`, `pipeline-scheduler.ts:174,195,213,228,242`）が全てenum値（`'gathering'`, `'sent'`, `'skipped'`, `'failed'`, `'waiting'`, `'polling'`, `'processed'`, `'timeout'`）を渡しておりスキーマと一致 |

### 検証詳細

**呼び出しチェーン検証（ARCH-016）:**
- `new PipelineScheduler(...)` は2箇所: `createPipelineScheduler` (adapter:45) とテスト (test:72)
- 両方とも `workingHoursEnd` を7番目の引数として渡している
- `createPipelineScheduler` は `config.calendar.workingHours.end` を渡す — `CalendarConfig.workingHours.end` は `string` 型（config.ts:33）でデフォルト値 `'18:00'`（config.ts:203）

**型安全性検証（ARCH-019）:**
- Zodスキーマ `MeetingProcessingStateSchema` の `briefing.status` は `z.enum(['pending', 'gathering', 'sent', 'skipped', 'failed'])`
- `postMeeting.status` は `z.enum(['pending', 'waiting', 'polling', 'processed', 'timeout', 'failed'])`
- 型パラメータ `Pick<..., 'status'>` により `status` フィールドが必須かつenum型に制約される
- 全呼び出し元がリテラル文字列を渡しており、コンパイル時に型チェックされる

**デッドコード:**
- 変更ファイル4件にて未使用import・未使用変数・未使用関数なし
- `ConfigLoader` の残存参照は `src/services/working-cadence.ts` のみ（変更スコープ外、別サービスの正当な使用）

**テストカバレッジ:**
- `daily-summary-service.test.ts`: enabled/disabled、送信済みガード、時刻判定、日次リセット — 4テスト
- `pipeline-scheduler.test.ts`: start/stop、ステータス、フィルタリング、ブリーフィング生成 — 7テスト
- `pipeline-state-store.test.ts`: load/save/flush、briefing/postMeeting status、action items、channel mapping、prune — 10テスト
- 全テスト通過（130 suites, 2768 tests）

**ファイルサイズ:**
- `daily-summary-service.ts`: 65行 ✅
- `pipeline-scheduler-adapter.ts`: 143行 ✅
- `pipeline-state-store.ts`: 236行（200行超だが300行未満、現時点では1責務に収まっている）
- `pipeline-scheduler.ts`: 290行（200行超だが300行未満、オーケストレーター責務として妥当）

### Warning（非ブロッキング）

| # | 場所 | 内容 |
|---|------|------|
| W-1 | `briefing-generator.ts:90` と `pipeline-scheduler.ts:147` | `setBriefingStatus(event.id, { status: 'sent' })` が BriefingGenerator と PipelineScheduler の両方で呼ばれる。PostMeetingProcessor:221 と PipelineScheduler:228 にも同様のパターン。状態管理の責務が二重化しているが、修正にはスコープ外ファイルの変更が必要なため、今回は記録のみ |

### 変更スコープ

- 変更量: Small（4ファイルの局所修正 + テスト2ファイル更新）
- 変更内容は論理的にまとまっている（前回REJECT指摘の修正のみ）
- スコープ宣言と実際の変更が一致

---

## frontend-review
レビューが完了しました。

## レビュー結果: **APPROVE**

### 判定理由

このプロジェクト（`@shin1ohno/sage`）は**MCPサーバー（バックエンド）**であり、フロントエンドコンポーネントを含みません。

確認した事実:
- `.tsx` / `.jsx` ファイルは存在しない
- React / Vue / Angular / Svelte のインポートは一切ない
- `package.json` にフロントエンドフレームワークの依存はない
- 変更対象ファイル（`src/cli/http-server-with-config.ts`, `src/config/loader.ts`, `src/types/config.ts` 等）はすべてNode.jsバックエンドコード
- `src/utils/html.ts` の `escapeHtml` はサーバーサイドHTMLレスポンス用ユーティリティ
- `src/utils/slack-blocks.ts` はSlack Block Kit APIペイロード構築（サーバーサイド）

フロントエンド開発の観点でレビューすべき対象がないため、**問題なし（APPROVE）** として次に進みます。

---

## security-review
セキュリティレビューに必要な情報がすべて揃いました。全変更ファイルを精査し、結果をまとめます。

---

# セキュリティレビュー

## 結果: APPROVE

## 重大度: None

## レビュー対象

変更ファイル（modified）:
- `src/cli/http-server-with-config.ts`
- `src/config/loader.ts`
- `src/oauth/google-oauth-handler.ts`
- `src/services/reloadable/index.ts`
- `src/types/config.ts`
- `src/types/google-calendar-types.ts`

新規ファイル（untracked）:
- `src/oauth/slack-oauth-handler.ts`
- `src/integrations/slack-service.ts`
- `src/integrations/google-drive-service.ts`
- `src/services/pipeline-scheduler.ts`
- `src/services/pipeline-state-store.ts`
- `src/services/daily-summary-service.ts`
- `src/services/briefing-generator.ts`
- `src/services/post-meeting-processor.ts`
- `src/services/channel-discovery.ts`
- `src/services/meeting-filter.ts`
- `src/services/prompt-templates.ts`
- `src/services/action-item-builder.ts`
- `src/services/pipeline-critical-error-handler.ts`
- `src/services/reloadable/pipeline-scheduler-adapter.ts`
- `src/services/reloadable/pipeline-state-store-adapter.ts`
- `src/services/reloadable/slack-service-adapter.ts`
- `src/utils/html.ts`
- `src/utils/calendar-description-parser.ts`
- `src/types/pipeline-config.ts`
- `src/types/pipeline-types.ts`

## チェック結果

| カテゴリ | 結果 | 備考 |
|---------|------|------|
| インジェクション（SQL/コマンド/XSS） | ✅ | XSS対策: `escapeHtml()`による出力エスケープ済み。SQLなし。コマンド実行なし |
| 認証・認可 | ✅ | Slack OAuth: CSRF保護（state: randomUUID, ワンタイム消費, 10分期限）。Google OAuth: PKCE S256維持 |
| データ保護 | ✅ | Slack/Googleトークン: `EncryptionService`で暗号化保存。ログに機密情報なし。HTTP応答にスタックトレース非露出 |
| 暗号化 | ✅ | `EncryptionService`使用。暗号鍵は環境変数（`SAGE_ENCRYPTION_KEY`）由来 |
| ファイル操作 | ✅ | パス構築は`path.join(homedir(), '.sage', ...)`のみ。ユーザー入力由来のパスなし |
| 依存関係 | ✅ | `@slack/web-api@7.14.1`, `htmlparser2@10.1.0`, `p-queue@9.1.0`追加。既知脆弱性なし |
| 入力バリデーション | ✅ | 設定値: Zodスキーマで`min`/`max`制約。パイプライン状態: `PipelineStateFileSchema`で検証 |
| エラーハンドリング | ✅ | HTTP応答に内部情報非露出。`handleCriticalError`のスタックトレースはユーザー自身へのSlack DMのみ |
| OWASP Top 10 | ✅ | 主要カテゴリの問題なし |

## ファクトチェック詳細

### XSS防御確認
- `src/utils/html.ts:8-15`: `escapeHtml()`が `&`, `<`, `>`, `"`, `'` をエスケープ
- `src/cli/http-server-with-config.ts:903`: Slack OAuthエラー応答で `escapeHtml(error)` を使用
- 他のHTML応答は全て静的文字列（ユーザー入力を含まない）

### Slack OAuth CSRF保護確認
- `src/cli/http-server-with-config.ts:877`: `randomUUID()`でstate生成
- `src/cli/http-server-with-config.ts:917-921`: stateの存在検証
- `src/cli/http-server-with-config.ts:924`: ワンタイム消費（即座にdelete）
- `src/cli/http-server-with-config.ts:927-930`: 10分のタイムアウト検証
- `src/cli/http-server-with-config.ts:875`: `cleanupExpiredSlackOAuthStates()`でメモリリーク防止

### トークン保護確認
- `src/oauth/slack-oauth-handler.ts:48`: トークン保存パス `~/.sage/slack_tokens.enc`（暗号化ファイル）
- `src/oauth/slack-oauth-handler.ts:151-152`: `encryptionService.encryptToFile()`で暗号化保存
- `src/oauth/slack-oauth-handler.ts:125`: ログにはteamIdのみ記録（トークン値は非出力）

### ハードコードされたクレデンシャルの不在確認
- `src/cli/http-server-with-config.ts:232`: `process.env.SLACK_CLIENT_ID`, `process.env.SLACK_CLIENT_SECRET`から取得
- `src/services/reloadable/slack-service-adapter.ts:26-28`: 同様に環境変数から取得、不在時はエラー

### `any`型の除去確認
- `src/oauth/google-oauth-handler.ts:128-129`: `as any`キャスト除去、`CodeChallengeMethod.S256`で型安全化 ✅

## 解消済み（resolved）

| finding_id | 状態 | 解消根拠 |
|------------|------|----------|
| SEC-001 | resolved | `src/utils/html.ts:8-15` に共通 `escapeHtml()` 抽出済み。テストも同一関数をimport |
| SEC-002 | resolved | Google OAuth CSRF保護は変更なし（既存実装維持） |
| SEC-003 | resolved | Slack OAuth CSRF保護（`src/cli/http-server-with-config.ts:870-944`）は適切に実装維持 |

## 警告（非ブロッキング）

1. **ReDoS リスク（低）** — `src/services/channel-discovery.ts:102`, `src/services/meeting-filter.ts:43` — config由来パターンで `new RegExp()` 使用。config は自身で管理するため実害は低いが、将来的に `re2` パッケージの導入を推奨

2. **HTTP デフォルト redirect URI** — `src/cli/http-server-with-config.ts:233`, `src/services/reloadable/slack-service-adapter.ts:31` — Slack OAuthデフォルトredirect URIが `http://` で始まる。ローカル開発では問題ないが、リモートデプロイ時は `SLACK_REDIRECT_URI` 環境変数で `https://` を指定すること

3. **Google Drive API クエリの不完全なエスケープ** — `src/integrations/google-drive-service.ts:76, 84-86` — `conferenceId` は未エスケープでクエリに埋め込み、`escapedTitle` はシングルクオートのみエスケープ（バックスラッシュ未処理）。データはGoogle Calendar API由来のため、セキュリティ上の実害リスクは低い（クエリは認証ユーザー自身のDrive内に限定）が、悪意あるミーティングタイトルでクエリ構文エラーやの不正な検索結果を招く可能性がある。将来的にパラメータのサニタイズ強化を推奨

---

## qa-review
全ての確認が完了しました。レビュー結果をまとめます。

---

# QAレビュー

## 結果: APPROVE

## サマリー
前回のQAレビュー（APPROVE）以降に実施されたARCH-016（DailySummaryServiceのDI化）およびARCH-019（PipelineStateStoreの型安全化）の修正が適切にテストされている。テストファイルも同期更新されており、既存テストの破壊はない。全変更ファイルにブロッキング問題なし。

## 確認した観点
| 観点 | 結果 | 備考 |
|------|------|------|
| テストカバレッジ | ✅ | 全ての新規サービスファイル（20+）に対応するテストファイルが存在。ARCH-016/019修正のテストも更新済み（`daily-summary-service.test.ts`, `pipeline-scheduler.test.ts` でコンストラクタ引数変更を反映、`pipeline-state-store.test.ts` で型安全なステータスオブジェクト渡しを確認） |
| テスト品質 | ✅ | 各サービスの正常系・異常系を網羅。SlackService: トークン失効検出3パターン、レート制限停止。GoogleDriveService: conferenceId/title 2段階フォールバック。PipelineScheduler: all-day除外、参加者数フィルタ、送信済みスキップ。PipelineStateStore: ENOENT/不正JSON/スキーマバリデーション失敗のリカバリ |
| テスト戦略 | ✅ | 適切な単体テスト中心。Zodスキーマの境界値テスト（`pipeline-config.test.ts`: briefingWindow min/max, minimumAttendees min）、config migration テスト（`config-loader.test.ts`: meetingIntelligence/slack 欠落時の自動マイグレーション） |
| エラーハンドリング | ✅ | 全 `catch` ブロックにログ付き処理あり（空catch なし）。`action-item-builder.ts:119` は JSON.parse 失敗時に `logger.warn` + フォールバック、`channel-discovery.ts:115` は `logger.debug` + regex フォールバック、`pipeline-state-store.ts:60` は `logger.warn` + バックアップ作成 |
| ログとモニタリング | ✅ | `createLogger` で各サービスにスコープ付きロガー。PipelineScheduler: start/stop ログ。SlackOAuthHandler: authorization開始/完了/失敗ログ。DailySummaryService: 送信失敗ログ |
| 保守性 | ✅ | DI パターン適用済み（ARCH-016）。`as any` 除去済み（google-oauth-handler.ts で `CodeChallengeMethod.S256` enum使用）。型安全なステータス更新（ARCH-019）。変更ファイル内に `any` 型なし |

## 今回の指摘（new）
なし

## 継続指摘（persists）
なし

## 解消済み（resolved）
| finding_id | 解消根拠 |
|------------|----------|
| QA-015 | 前回 resolved のまま維持。`tests/unit/slack-oauth-callback.test.ts:10` で `src/utils/html.ts` から直接 import |
| QA-013 | 前回 resolved のまま維持 |
| QA-014 | 前回 resolved のまま維持 |

## 警告（Warning）
| # | カテゴリ | 場所 | 内容 |
|---|---------|------|------|
| 1 | テスト品質 | `tests/unit/slack-oauth-callback.test.ts:60-68` | 前回Warning継続。「expired state」テストで Map に設定する値が `expiresAt`（有効期限）概念で、実装（`http-server-with-config.ts:920`付近）の `createdAt`（作成時刻） + `SLACK_STATE_TIMEOUT_MS` による判定ロジックと意味的に一致していない。テスト自体は Map 操作パターンの検証であり実装を直接テストしていないため、リグレッション検出への影響は限定的 |

## APPROVE判定根拠
- ARCH-016（DI化）修正: `DailySummaryService` コンストラクタが `workingHoursEnd: string` を受け取り、テスト（`daily-summary-service.test.ts:38,44,54,67`）で `'18:00'`/`'00:00'`/`'23:59'` を直接渡す形に更新済み。`PipelineScheduler` テスト（`pipeline-scheduler.test.ts:79`）でも `'18:00'` を渡す形に更新済み
- ARCH-019（型安全化）修正: `setBriefingStatus`/`setPostMeetingStatus` が `Partial<...> & Pick<..., 'status'>` 型を受け取り、テスト（`pipeline-state-store.test.ts:110,122,138`）で `{ status: 'sent', sentAt: '...' }` 等のオブジェクトを渡す形に更新済み
- 全20+新規サービスファイルに対応テストが存在し、エラーパスも含むカバレッジ
- `new` または `persists` のブロッキング問題: **0件**
- 変更ファイル内に REJECT 基準（`any` 型、DRY違反、未使用コード、空catch、未テスト振る舞い等）に該当する問題なし