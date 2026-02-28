## arch-review
全ファイルのレビューが完了しました。レポートをまとめます。

---

# アーキテクチャレビュー

## 結果: REJECT

## サマリー

Meeting Intelligence Pipeline の大規模な追加変更。全体的な設計（サービス分割、DI、型定義）は良好だが、2件のブロッキング問題を検出。(1) `DailySummaryService` が `ConfigLoader.load()` を直接呼び出しDIパターンに違反、(2) `PipelineStateStore` のステータス設定メソッドがenum型ではなく `string` を受け入れ型安全性を損なっている。

## 確認した観点
- [x] 構造・設計
- [x] コード品質
- [x] 変更スコープ
- [x] テストカバレッジ
- [x] デッドコード
- [x] 呼び出しチェーン検証
- [x] 契約文字列のハードコード散在

## 変更スコープ

| 項目 | 値 |
|------|------|
| スコープサイズ | Large（新規ソース約3,500行 + 変更約500行） |
| 変更ファイル | 10 (modified) + 22 (new source) + 20+ (new tests) |
| 論理的まとまり | Meeting Intelligence Pipeline 一式。まとまりあり |

## 前回指摘の追跡

| finding_id | 状態 | 根拠 |
|------------|------|------|
| ARCH-007 | resolved | `src/utils/html.ts` に `escapeHtml` 抽出済み。`tests/unit/slack-oauth-callback.test.ts:10` で `import { escapeHtml } from '../../src/utils/html.js'` に置換。ローカル定義なし |

## ブロッキング問題

### ARCH-016 (new): `DailySummaryService` が `ConfigLoader.load()` を直接呼び出し — DIパターン違反

**ファイル:** `src/services/daily-summary-service.ts:48`

**問題:** `DailySummaryService.checkAndSend()` 内で `ConfigLoader.load()` を直接呼び出し、設定ファイルからworkingHoursを取得している。パイプライン内の他の全サービス（`PipelineScheduler`, `BriefingGenerator`, `PostMeetingProcessor` 等）はコンストラクタ経由で設定を受け取るDIパターンを採用しているが、このサービスだけが設定ファイルを直接読み込んでいる。

```typescript
// 現在 (NG): hidden dependency
async checkAndSend(enabled: boolean, getStatus: () => PipelineStatus): Promise<void> {
  ...
  const config = await ConfigLoader.load(); // DIを迂回してディスクI/O
  const workingHoursEnd = config.calendar.workingHours.end;
```

**影響:**
- コンストラクタに現れない隠れた依存（テスト困難）
- 毎ポーリングサイクル（デフォルト15分ごと）に不要なファイルI/O
- サービス層が設定ファイルローダーに直接依存（レイヤー違反）

**修正案:** `workingHoursEnd` をコンストラクタまたはメソッドパラメータで受け取る

```typescript
export class DailySummaryService {
  private readonly slackService: SlackService;
  private readonly workingHoursEnd: string;
  private sent = false;
  private date = '';

  constructor(slackService: SlackService, workingHoursEnd: string) {
    this.slackService = slackService;
    this.workingHoursEnd = workingHoursEnd;
  }

  async checkAndSend(enabled: boolean, getStatus: () => PipelineStatus): Promise<void> {
    ...
    const [endHour, endMinute] = this.workingHoursEnd.split(':').map(Number);
```

呼び出し元（`PipelineScheduler`）のコンストラクタ内で `this.dailySummaryService = new DailySummaryService(slackService, config.workingHoursEnd ?? '18:00');` のように渡す。

---

### ARCH-019 (new): `PipelineStateStore` のステータス設定メソッドが `string` 型を受け入れ、型安全性を損なう

**ファイル:** `src/services/pipeline-state-store.ts:109, 123`

**問題:** `setBriefingStatus` と `setPostMeetingStatus` の `status` パラメータが `string` 型で定義されている。Zodスキーマでは `z.enum(['pending', 'gathering', 'sent', 'skipped', 'failed'])` 等の限定値が定義されているにも関わらず、メソッドシグネチャが任意の文字列を受け入れる。結果を `as MeetingProcessingState['briefing']` でキャストして型ミスマッチを隠蔽している。

```typescript
// 現在 (NG): status: string は任意の文字列を受け入れる
setBriefingStatus(eventId: string, status: { status: string; sentAt?: string; error?: string }): void {
  ...
  meeting.briefing = {
    ...meeting.briefing,
    ...status,
  } as MeetingProcessingState['briefing']; // キャストで型チェック回避
```

**影響:**
- `setBriefingStatus(id, { status: 'invalid_value' })` がコンパイルエラーなく通る
- 不正な値がステートファイルに書き込まれた場合、次回 `load()` でスキーマバリデーション失敗 → ステート全消失
- `save()` はバリデーションなし（`JSON.stringify` のみ）なので不正値が永続化される

**修正案:** Zodスキーマから導出された型を使用する

```typescript
setBriefingStatus(
  eventId: string,
  status: Partial<MeetingProcessingState['briefing']> & Pick<MeetingProcessingState['briefing'], 'status'>,
): void {
  this.ensureMeeting(eventId);
  const meeting = this.state.meetings[eventId];
  meeting.briefing = { ...meeting.briefing, ...status };
  this.save();
}

setPostMeetingStatus(
  eventId: string,
  status: Partial<MeetingProcessingState['postMeeting']> & Pick<MeetingProcessingState['postMeeting'], 'status'>,
): void {
  this.ensureMeeting(eventId);
  const meeting = this.state.meetings[eventId];
  meeting.postMeeting = { ...meeting.postMeeting, ...status };
  this.save();
}
```

これにより `as` キャストが不要になり、無効なステータス値がコンパイル時に検出される。

---

## 非ブロッキング（Warning / 提案）

### W-001: `http-server-with-config.ts` が963行（変更前837行）

変更前から300行を大幅に超過していた既存問題。今回のSlack OAuth追加（~120行）で更に増加。Slack OAuth関連の3メソッド（`handleSlackOAuthAuthorize`, `handleSlackOAuthCallback`, `cleanupExpiredSlackOAuthStates`）を `src/cli/slack-oauth-routes.ts` 等に抽出可能だが、全体の修正にはファイル構造の再設計が必要でありタスクスコープを逸脱。

### W-002: `GOOGLE_CALENDAR_SCOPES` 定数名が実態と不一致

`src/oauth/google-oauth-handler.ts:49-54`: `drive.readonly` スコープが追加されたが、定数名が `GOOGLE_CALENDAR_SCOPES` のまま。`GOOGLE_API_SCOPES` や `GOOGLE_OAUTH_SCOPES` が適切。

### W-003: `PostMeetingProcessor.config` が `public readonly`

`src/services/post-meeting-processor.ts:33`: `readonly config: MeetingIntelligenceConfig` に `private` 修飾子がない。同パイプライン内の `PipelineScheduler` は `private readonly config` としている。一貫性のため `private` にすべき。

### W-004: `PromptTemplateManager.loadOverride` が `readFileSync` を使用

`src/services/prompt-templates.ts:153`: サーバープロセス内で同期ファイルI/O。実害は小さい（ローカルファイルの小さなテキスト、ポーリング間隔は分単位）が、非同期化が望ましい。

### W-005: `handleCriticalError` が `SlackTokenRevokedError` 検出時にSlack通知を試行

`src/services/pipeline-critical-error-handler.ts:42-45`: Slackトークン失効を検出した際にSlack経由で通知しようとするが、トークンが無効なため送信は失敗する。ログへの出力のみにフォールバックするが、論理的に矛盾。代替通知手段（ファイル出力等）の検討を推奨。

---

## frontend-review
プロジェクト構造の確認が完了しました。

## レビュー結果

このプロジェクトは**フロントエンドを含みません**。

- `.tsx` / `.jsx` ファイルは存在しない
- React, Vue, Angular, Svelte 等のフロントエンドフレームワークへの依存がない
- `src/` ディレクトリはすべてバックエンド（CLI, サービス, OAuth ハンドラー, MCP ツール等）で構成されている
- 変更内容（Slack OAuth統合、設定マイグレーション、カレンダーイベント型拡張、テストファイル修正）もすべてバックエンドコード

HTMLレスポンスを直接書き出している箇所（`http-server-with-config.ts` 内の `res.end('<h1>...</h1>')` ）がありますが、これはOAuthコールバックの最小限のレスポンスであり、フロントエンドアプリケーションではありません。`escapeHtml` による適切なサニタイズも行われています。

**判定: APPROVE**

フロントエンドコンポーネント、状態管理、データフェッチパターン、アクセシビリティ等のフロントエンド専門レビュー観点に該当するコードが存在しないため、問題なしとして承認します。

---

## security-review
全ファイルの確認が完了しました。レビュー結果をまとめます。

## セキュリティレビュー結果

### 判定: **APPROVE**

### 変更差分の確認

今回の変更は、前回のQAレビュー（QA-015）修正のみです：
- `tests/unit/slack-oauth-callback.test.ts:10` — ローカルの `escapeHtml` 関数定義（DRY違反）を `import { escapeHtml } from '../../src/utils/html.js'` に置換

### セキュリティ観点の評価

| カテゴリ | 結果 | 備考 |
|---------|------|------|
| インジェクション (XSS) | ✅ | テストが本番と同じ `escapeHtml` を使用するようになり、セキュリティテストの信頼性が向上 |
| 認証・認可 | ✅ | 変更なし。Slack OAuth CSRF保護（state生成・照合・ワンタイム消費・期限チェック）は維持 |
| データ保護 | ✅ | 変更なし。トークン暗号化保存、ログに機密情報なし |
| 依存関係 | ✅ | 変更なし |

### 解消済み (resolved)

| finding_id | 状態 | 解消根拠 |
|------------|------|----------|
| SEC-001 | resolved | `src/utils/html.ts:8-15` に共通 `escapeHtml()` 抽出済み。テストファイルも同一関数をimportするよう修正され、本番とテストの一貫性が確保された |
| SEC-002 | resolved | Google OAuth CSRF保護は変更なし |
| SEC-003 | resolved | Slack OAuth CSRF保護（`src/cli/http-server-with-config.ts:851-944`）は変更なし |

### 警告（非ブロッキング）

- `src/services/channel-discovery.ts:102`, `src/services/meeting-filter.ts:43` — config由来パターンで `new RegExp()` 使用。ReDoSリスク低（外部入力ではない）だが、将来的に `re2` またはタイムアウト付き実行を推奨
- `src/cli/http-server-with-config.ts:233` — Slack OAuthデフォルトredirect URIがHTTP。本番では `SLACK_REDIRECT_URI` で HTTPS指定必須

### 根拠

今回の変更はテストファイル1件のimport置換のみであり、本番コードのセキュリティポスチャに影響を与えません。むしろ、テストが本番と同一の `escapeHtml` 実装を使うことで、XSSエスケープのテスト信頼性が向上しています。新たなセキュリティ脆弱性は検出されませんでした。

---

## qa-review
全ての確認が完了しました。レビュー結果をまとめます。

---

# QAレビュー

## 結果: APPROVE

## サマリー
前回唯一のREJECT指摘（QA-015: `escapeHtml`のDRY違反/テストカバレッジ欠如）が正しく解消されている。`tests/unit/slack-oauth-callback.test.ts:10` で `src/utils/html.ts` からの直接importに置換され、ローカルコピーは完全に削除済み。変更ファイル全体に新たなブロッキング問題なし。

## 確認した観点
| 観点 | 結果 | 備考 |
|------|------|------|
| テストカバレッジ | ✅ | `src/utils/html.ts:escapeHtml` がテストから直接importされ使用されている。新規プロダクションコード（Slack OAuth, config migration, reloadable adapters, conferenceData mapping）にそれぞれ対応テストあり |
| テスト品質 | ⚠️ | 前回Warning継続: 状態検証テストのセマンティクス不一致（下記参照） |
| `any` 型 | ✅ | 変更ファイルに `as any` / `: any` なし。`google-oauth-handler.ts` では既存の `as any` を `CodeChallengeMethod.S256` に改善 |
| エラーハンドリング | ✅ | Slack OAuthの各パスでエラーをログ付きハンドリング。空catchなし |
| ログとモニタリング | ✅ | `cliLogger.info`/`warn`/`error` が各フローで適切に使用 |
| 保守性 | ✅ | DRY違反解消。`escapeHtml` は単一箇所（`src/utils/html.ts`）で定義 |
| 未使用コード | ✅ | 変更による新たな未使用import/変数/関数なし |

## 前回指摘の追跡

### 解消済み（resolved）
| finding_id | 状態 | 解消根拠 |
|------------|------|----------|
| QA-015 | resolved | `tests/unit/slack-oauth-callback.test.ts:10` — `import { escapeHtml } from '../../src/utils/html.js';` に置換済み。ローカルの `escapeHtml` 関数定義（旧L12-19）は完全に削除。テスト内の `escapeHtml` 使用箇所（L15, L21, L22, L25, L125）は `src/utils/html.ts:8-15` のエクスポート関数を直接使用。回帰検出も可能 |
| QA-013 | resolved | 前回resolvedのまま維持 |
| QA-014 | resolved | 前回resolvedのまま維持 |

## 警告（Warning）
| # | カテゴリ | 場所 | 内容 |
|---|---------|------|------|
| 1 | テスト品質 | `tests/unit/slack-oauth-callback.test.ts:60-68` | 「expired state」テストがMap値を `Date.now() - 1000`（expiresAt概念）として設定し `Date.now() > storedExpiry!` で検証しているが、実装（`http-server-with-config.ts:910`）の条件は `Date.now() - stateCreatedAt > SLACK_STATE_TIMEOUT_MS`（createdAt概念）。テストは通るが実装の正確なタイムアウトロジックのモデルではないため、リグレッション検出効果が限定的 |

## APPROVE判定根拠
- 前回の唯一のREJECT対象（QA-015）が正しく解消済み
- `new` または `persists` のブロッキング問題: **0件**
- 変更ファイル内に REJECT 基準（`any` 型、DRY違反、未使用コード、空catch、未テスト振る舞い等）に該当する問題なし