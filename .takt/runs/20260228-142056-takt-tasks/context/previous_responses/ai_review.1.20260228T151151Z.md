レビューを完了しました。以下が判定結果です。

---

## 判定: REJECT

### ブロッキング問題一覧

#### finding_id: AI-001 — 未使用パッケージ `@slack/oauth` の追加
- **状態**: `new`
- **ファイル**: `package.json:50`
- **問題**: `@slack/oauth` が dependencies に追加されているが、`src/` 内のどこからも import されていない。plan にも「Task 12 で『`@slack/oauth` は使わない』と明記」と記載がある。未使用の依存パッケージはバンドルサイズを増やし、攻撃対象面を広げる。
- **修正案**: `package.json` と `package-lock.json` から `@slack/oauth` を削除する（`npm uninstall @slack/oauth`）。

---

#### finding_id: AI-002 — フォールバック値の濫用（`slack-oauth-handler.ts`）
- **状態**: `new`
- **ファイル**: `src/oauth/slack-oauth-handler.ts:102-106`
- **問題**: Slack API のトークン交換レスポンスで `teamId`, `authedUserId`, `botUserId`, `scope` に `|| ''` フォールバックを使用している。`data.ok === true` かつ `data.access_token` が存在する場合、これらの値が欠落しているのは異常事態であり、空文字で飲み込むべきではない。特に `teamId` と `authedUserId` はその後の処理（DM送信先等）で必須。
- **修正案**: `access_token` 同様に存在チェックを行い、欠落時は `throw new Error(...)` とする。

```typescript
if (!data.team?.id || !data.authed_user?.id) {
  throw new Error('Slack token exchange failed: missing team or user ID');
}
```

---

#### finding_id: AI-003 — フォールバック値の濫用（`slack-service.ts`）
- **状態**: `new`
- **ファイル**: `src/integrations/slack-service.ts:140, 185, 209-210, 236-237`
- **問題**: `msg.ts || ''`, `ch.id || ''`, `ch.name || ''`, `result.user.id || ''` 等、Slack API レスポンスの必須フィールドに `|| ''` でフォールバックしている。`ts` が空文字のメッセージ、`id` が空文字のチャンネルは後続処理で静かに壊れる。
- **修正案**: API レスポンスの `msg.ts`, `ch.id`, `result.user.id` は必須として扱い、存在しないエントリは `.filter()` で除外するパターンにする。

```typescript
// 例: messages
return (result.messages || [])
  .filter((msg): msg is typeof msg & { ts: string } => Boolean(msg.ts))
  .map((msg) => ({
    ts: msg.ts,
    user: msg.user,
    text: msg.text,
    threadTs: msg.thread_ts,
    replyCount: msg.reply_count,
  }));
```

---

#### finding_id: AI-004 — `as never[]` 型キャスト
- **状態**: `new`
- **ファイル**: `src/integrations/slack-service.ts:104`
- **問題**: `blocks: blocks as never[]` は型安全性を完全に無視する危険なキャスト。`SlackBlock` 型と `@slack/web-api` の `Block` 型の不一致を隠蔽している。
- **修正案**: `@slack/web-api` の `KnownBlock` 型に合わせるか、`blocks` パラメータの型を `@slack/web-api` からインポートした型に揃える。もしくは最低限 `as unknown[]` にする。

---

#### finding_id: AI-005 — `as unknown as` 型キャスト（ダブルキャスト）
- **状態**: `new`
- **ファイル**: `src/services/post-meeting-processor.ts:229`
- **問題**: `} as unknown as Parameters<PipelineStateStore['setPostMeetingStatus']>[1]);` は型の不整合を隠蔽するダブルキャスト。根本原因は `setPostMeetingStatus` のパラメータ型に `sources` フィールドが含まれていないこと。コメントでも「Cast needed because...」と認めている。
- **修正案**: `PipelineStateStore.setPostMeetingStatus` の引数型に `sources` フィールドを追加して型を正しく定義する。

---

#### finding_id: AI-006 — デッドコード：`transcriptUrl: transcript ? undefined : undefined`
- **状態**: `new`
- **ファイル**: `src/services/post-meeting-processor.ts:199`
- **問題**: `transcript ? undefined : undefined` は三項演算子の両枝が `undefined` であり、条件分岐が無意味。`transcriptUrl` は常に `undefined` になる。意図は transcript が存在する場合に URL を設定することだったと思われるが、実装されていない。
- **修正案**: transcript URL の取得ロジックが未実装なら、このフィールドを省略する。将来の実装が必要なら、フィールド自体を削除し、必要になった時点で追加する。

---

#### finding_id: AI-007 — 未使用パラメータ `_workingCadenceService`
- **状態**: `new`
- **ファイル**: `src/services/pipeline-scheduler.ts:45`
- **問題**: `PipelineScheduler` のコンストラクタが `_workingCadenceService: WorkingCadenceService` パラメータを受け取るが、クラス内で一切使用されていない。`_` プレフィックスで未使用を示しているが、不要なパラメータ・依存は削除すべき。
- **修正案**: コンストラクタから `_workingCadenceService` パラメータを削除し、呼び出し元（`pipeline-scheduler-adapter.ts:47-54`）からも対応する引数を削除する。`PipelineSchedulerDeps` インターフェースからも `workingCadenceService` を削除する。

---

#### finding_id: AI-008 — 未使用メソッド `getReminderManager()` / `reloadTemplates()` / `isConnected()` / `isAvailable()`
- **状態**: `new`
- **ファイル**:
  - `src/services/briefing-generator.ts:52-54` — `getReminderManager()`: grep で src/ 内に呼び出し元なし（テストのみ）
  - `src/services/prompt-templates.ts:171-173` — `reloadTemplates()`: 空の no-op メソッド。src/ 内に呼び出し元なし
  - `src/integrations/slack-service.ts:250-252` — `isConnected()`: src/ 内に呼び出し元なし
  - `src/integrations/google-drive-service.ts:156-158` — `isAvailable()`: src/ 内に呼び出し元なし
- **問題**: これらは「対称性のため」「将来の拡張のため」に追加された未使用のパブリックメソッド。現在呼び出されていないコードはデッドコード。
- **修正案**: これら4つのメソッドと対応するテストを削除する。必要になった時点で追加すればよい。

---

#### finding_id: AI-009 — 未使用プロンプトテンプレート `assignee_resolve`
- **状態**: `new`
- **ファイル**: `src/services/prompt-templates.ts:18, 125-141`
- **問題**: `PromptName` 型に `'assignee_resolve'` が定義され、`DEFAULT_PROMPTS` にテンプレートが登録されているが、src/ 内のどこからも `getPrompt('assignee_resolve', ...)` が呼ばれていない。`PostMeetingProcessor.buildActionItem` では独自の `resolveAssigneeEmail` メソッドで名前解決しており、このテンプレートは使われていない。
- **修正案**: `PromptName` から `'assignee_resolve'` を削除し、`DEFAULT_PROMPTS` から対応するエントリを削除する。

---

#### finding_id: AI-010 — 説明コメント（What/How コメント）
- **状態**: `new`
- **ファイル**: `src/utils/calendar-description-parser.ts:51-52`
- **問題**: `// suppress unused variable warning` + `void lastTag;` — `lastTag` 変数が `onclosetag` コールバック内で代入されるが使用されていない。コメントで未使用を抑制するのではなく、変数自体を削除すべき。
- **修正案**: `lastTag` 変数宣言（L33）と `lastTag = name;`（L36, L49）の代入、および `void lastTag;`（L52）をすべて削除する。

---

#### finding_id: AI-011 — オブジェクトの直接変更（`PipelineStateStore.getState()` 経由のミュテーション）
- **状態**: `new`
- **ファイル**:
  - `src/services/pipeline-scheduler.ts:386-404` — `incrementMetric()` が `this.stateStore.getState()` の戻り値を直接変更
  - `src/services/pipeline-scheduler.ts:406-426` — `ensureMeetingMetadata()` が同様に直接変更
  - `src/services/pipeline-state-store.ts:181-183` — `getState()` が内部 `this.state` をそのまま返す
- **問題**: `PipelineStateStore.getState()` は内部状態のリファレンスをそのまま返しており、外部からの直接変更を許している。`PipelineScheduler` は返されたオブジェクトを直接変更して `state.dailyMetrics.briefingsSent = 0` 等としている。これはカプセル化の破壊であり、状態管理の責務が `PipelineStateStore` の外に漏洩している。
- **修正案**: 以下のいずれかを選択:
  - A) `PipelineStateStore` にメトリクス更新やミーティング登録のための専用メソッドを追加し、`PipelineScheduler` からの直接変更を止める
  - B) `getState()` を `getStateCopy()` にして `structuredClone` で返す（ただしパフォーマンスコスト）

---

### Warning（非ブロッキング）

#### WARN-001 — `http-server-with-config.ts:854` XSS 脆弱性の可能性
- **ファイル**: `src/cli/http-server-with-config.ts:854`
- **問題**: `res.end(\`<h1>Slack Authorization Failed</h1><p>${error}</p>\`)` で `error` パラメータ（Slack からのコールバッククエリパラメータ）を HTML エスケープせずにレスポンスに埋め込んでいる。ただし、セキュリティレビューのスコープなので参考情報として記録。

#### WARN-002 — `@slack/oauth` の `redirectUri` フォールバック
- **ファイル**: `src/services/reloadable/slack-service-adapter.ts:32`
- **問題**: `redirectUri: slackConfig.redirectUri || 'http://localhost:54321/oauth/slack/callback'` — ハードコードされたフォールバック URL。`http-server-with-config.ts:231` でも別のフォールバック形式（`http://${this.effectiveHost}:${this.effectivePort}/oauth/slack/callback`）がある。2箇所でフォールバックの書き方が違う。

---

### 判定理由

11件のブロッキング問題を検出。フォールバック値の濫用（AI-002, AI-003）、型安全性の回避（AI-004, AI-005）、デッドコード/未使用コード（AI-001, AI-006, AI-007, AI-008, AI-009, AI-010）、オブジェクト直接変更（AI-011）が主な問題パターン。

いずれもAI生成コードに典型的なパターン：
- **フォールバックで不確実性を隠す**（AI-002, AI-003）
- **「念のため」「対称性のため」の未使用コード生成**（AI-008, AI-009）
- **型キャストで型エラーを隠す**（AI-004, AI-005）
- **内部状態の直接変更を許すAPI設計**（AI-011）