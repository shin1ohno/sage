# タスク指示書: Meeting Intelligence Pipeline — Layer 7: Hot-Reload Integration (Tasks 21-22)

## 概要

Meeting Intelligence Pipeline のサービスを hot-reload アーキテクチャに統合する。既存の `ReloadableService` パターンに従い、SlackService, PipelineScheduler, PipelineStateStore の3つのアダプターを作成し、`src/services/reloadable/index.ts` に登録する。

## 参照資料

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — タスク定義（ソース・オブ・トゥルース）
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — 設計文書
- `src/services/reloadable/working-cadence-adapter.ts` — 踏襲すべきパターン
- `src/types/hot-reload.ts` — ReloadableService インターフェース
- `src/services/reloadable/index.ts` — アダプター登録先

## 作業内容

### Task 21: Reloadable Adapters 作成（3ファイル新規）

- **優先度:** 高
- **ファイル:**
  - `src/services/reloadable/slack-service-adapter.ts`（新規）
  - `src/services/reloadable/pipeline-scheduler-adapter.ts`（新規）
  - `src/services/reloadable/pipeline-state-store-adapter.ts`（新規）

### Task 22: アダプター登録

- **優先度:** 高
- **ファイル:** `src/services/reloadable/index.ts`（変更）

---

## 踏襲パターン: WorkingCadenceAdapter

各アダプターは `src/services/reloadable/working-cadence-adapter.ts` のパターンを**正確に**踏襲する:

```typescript
// 1. Factory function type を export
export type XxxFactory = (config: UserConfig, ...deps) => XxxService;

// 2. Default factory function を export
export function createXxx(config: UserConfig, ...deps): XxxService { ... }

// 3. Adapter class を export（implements ReloadableService）
export class XxxAdapter implements ReloadableService {
  readonly name = 'XxxService';
  readonly dependsOnSections: readonly string[] = ['section'];

  private instance: XxxService | null = null;
  private factory: XxxFactory;

  constructor(factoryOrInstance: XxxFactory | XxxService) { ... }
  getInstance(): XxxService | null { return this.instance; }
  async shutdown(): Promise<void> { ... }
  async reinitialize(config: UserConfig): Promise<void> { ... }
}
```

---

## Adapter 1: SlackServiceAdapter

### ファイル: `src/services/reloadable/slack-service-adapter.ts`

```typescript
import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { SlackService } from '../../integrations/slack-service.js';
import { SlackOAuthHandler } from '../../oauth/slack-oauth-handler.js';
import { createLogger } from '../../utils/logger.js';
```

**設定:**
- `readonly name = 'SlackService'`
- `readonly dependsOnSections: readonly string[] = ['integrations']`

**Factory function:**
```typescript
export type SlackServiceFactory = (config: UserConfig) => SlackService;

export function createSlackService(config: UserConfig): SlackService {
  const slackConfig = config.integrations?.slack;
  if (!slackConfig?.clientId || !slackConfig?.clientSecret) {
    throw new Error('Slack integration not configured: missing clientId or clientSecret');
  }
  const oauthHandler = new SlackOAuthHandler({
    clientId: slackConfig.clientId,
    clientSecret: slackConfig.clientSecret,
    redirectUri: slackConfig.redirectUri || 'http://localhost:54321/oauth/slack/callback',
  });
  return new SlackService(oauthHandler);
}
```

**shutdown():**
- `this.instance = null` のみ（SlackService は明示的な shutdown 不要）

**reinitialize(config):**
- `this.instance = this.factory(config)`
- Slack が未設定（clientId/clientSecret なし）の場合は `instance = null` にして warn ログを出し、例外は throw しない（Slack はオプショナル機能のため）

---

## Adapter 2: PipelineSchedulerAdapter

### ファイル: `src/services/reloadable/pipeline-scheduler-adapter.ts`

```typescript
import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { PipelineScheduler } from '../pipeline-scheduler.js';
import type { CalendarSourceManager } from '../../integrations/calendar-source-manager.js';
import type { BriefingGenerator } from '../briefing-generator.js';
import type { PostMeetingProcessor } from '../post-meeting-processor.js';
import type { PipelineStateStore } from '../pipeline-state-store.js';
import type { WorkingCadenceService } from '../working-cadence.js';
import type { SlackService } from '../../integrations/slack-service.js';
import { MeetingIntelligenceConfigSchema } from '../../types/pipeline-config.js';
import { createLogger } from '../../utils/logger.js';
```

**設定:**
- `readonly name = 'PipelineScheduler'`
- `readonly dependsOnSections: readonly string[] = ['meetingIntelligence']`

**依存サービス:**
PipelineScheduler は多数の依存を持つため、setter で依存を注入する:

```typescript
private calendarSourceManager?: CalendarSourceManager;
private briefingGenerator?: BriefingGenerator;
private postMeetingProcessor?: PostMeetingProcessor;
private stateStore?: PipelineStateStore;
private workingCadenceService?: WorkingCadenceService;
private slackService?: SlackService;

setDependencies(deps: {
  calendarSourceManager?: CalendarSourceManager;
  briefingGenerator?: BriefingGenerator;
  postMeetingProcessor?: PostMeetingProcessor;
  stateStore?: PipelineStateStore;
  workingCadenceService?: WorkingCadenceService;
  slackService?: SlackService;
}): void { ... }
```

**Factory function:**
```typescript
export type PipelineSchedulerFactory = (
  config: UserConfig,
  deps: {
    calendarSourceManager: CalendarSourceManager;
    briefingGenerator: BriefingGenerator;
    postMeetingProcessor: PostMeetingProcessor;
    stateStore: PipelineStateStore;
    workingCadenceService: WorkingCadenceService;
    slackService: SlackService;
  }
) => PipelineScheduler;

export function createPipelineScheduler(
  config: UserConfig,
  deps: { ... }
): PipelineScheduler {
  const miConfig = MeetingIntelligenceConfigSchema.parse(config.meetingIntelligence ?? {});
  return new PipelineScheduler(
    deps.calendarSourceManager,
    deps.briefingGenerator,
    deps.postMeetingProcessor,
    deps.stateStore,
    deps.workingCadenceService,
    deps.slackService,
    miConfig
  );
}
```

**shutdown():**
- **重要**: 既存 PipelineScheduler の `stop()` を呼び出してタイマーをクリアする
```typescript
async shutdown(): Promise<void> {
  if (this.instance) {
    await this.instance.stop();
  }
  this.instance = null;
}
```

**reinitialize(config):**
- pipeline が有効でない場合（`config.meetingIntelligence?.enabled !== true`）→ `instance = null` で warn ログ、return
- 依存サービスが不足している場合 → `instance = null` で warn ログ、return
- 依存が揃っている場合 → `this.instance = this.factory(config, deps)` → `await this.instance.start()`

---

## Adapter 3: PipelineStateStoreAdapter

### ファイル: `src/services/reloadable/pipeline-state-store-adapter.ts`

```typescript
import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { PipelineStateStore } from '../pipeline-state-store.js';
import { createLogger } from '../../utils/logger.js';
```

**設定:**
- `readonly name = 'PipelineStateStore'`
- `readonly dependsOnSections: readonly string[] = ['meetingIntelligence']`

**Factory function:**
```typescript
export type PipelineStateStoreFactory = (config: UserConfig) => PipelineStateStore;

export function createPipelineStateStore(_config: UserConfig): PipelineStateStore {
  return new PipelineStateStore();
}
```

**shutdown():**
- `this.instance?.flush()` を呼んで pending save をフラッシュ
- `this.instance = null`

**reinitialize(config):**
- `this.instance = this.factory(config)`
- `await this.instance.load()` — ディスクから state をリロード

---

## Task 22: index.ts への登録

### ファイル: `src/services/reloadable/index.ts`（変更）

**追加する export:**
```typescript
export {
  SlackServiceAdapter,
  SlackServiceFactory,
  createSlackService,
} from './slack-service-adapter.js';

export {
  PipelineSchedulerAdapter,
  PipelineSchedulerFactory,
  createPipelineScheduler,
} from './pipeline-scheduler-adapter.js';

export {
  PipelineStateStoreAdapter,
  PipelineStateStoreFactory,
  createPipelineStateStore,
} from './pipeline-state-store-adapter.js';
```

**ServiceInstances インターフェースへの追加:**
```typescript
export interface ServiceInstances {
  // ... existing entries ...
  slackService?: SlackServiceAdapter;
  pipelineScheduler?: PipelineSchedulerAdapter;
  pipelineStateStore?: PipelineStateStoreAdapter;
}
```

**createAllReloadableAdapters() への追加:**

import 追加:
```typescript
import { SlackServiceAdapter, createSlackService } from './slack-service-adapter.js';
import { PipelineSchedulerAdapter, createPipelineScheduler } from './pipeline-scheduler-adapter.js';
import { PipelineStateStoreAdapter, createPipelineStateStore } from './pipeline-state-store-adapter.js';
```

関数末尾（`return adapters;` の前）に追加:
```typescript
// PipelineStateStore adapter
const stateStoreAdapter = existingServices?.pipelineStateStore
  ?? new PipelineStateStoreAdapter(createPipelineStateStore);
if (!existingServices?.pipelineStateStore) {
  stateStoreAdapter.reinitialize(config);
}
adapters.push(stateStoreAdapter);

// SlackService adapter
const slackAdapter = existingServices?.slackService
  ?? new SlackServiceAdapter(createSlackService);
if (!existingServices?.slackService) {
  slackAdapter.reinitialize(config);
}
adapters.push(slackAdapter);

// PipelineScheduler adapter
// Note: Dependencies must be set externally before reinitialize works
const schedulerAdapter = existingServices?.pipelineScheduler
  ?? new PipelineSchedulerAdapter(createPipelineScheduler);
if (!existingServices?.pipelineScheduler) {
  // PipelineScheduler needs external dependency injection before start
  // It will be initialized with null instance until dependencies are set
  schedulerAdapter.reinitialize(config);
}
adapters.push(schedulerAdapter);
```

**登録順序の理由:**
1. PipelineStateStore: 依存なし → 先に登録
2. SlackService: integrations config のみに依存
3. PipelineScheduler: 他のすべてのサービスに依存 → 最後に登録

---

## テスト

### テストファイル

- `tests/unit/slack-service-adapter.test.ts`（新規）
- `tests/unit/pipeline-scheduler-adapter.test.ts`（新規）
- `tests/unit/pipeline-state-store-adapter.test.ts`（新規）

### テスト項目

#### SlackServiceAdapter
- `name` が `'SlackService'` を返す
- `dependsOnSections` が `['integrations']` を返す
- `getInstance()` が初期状態で `null` を返す
- `reinitialize()` でファクトリが呼ばれてインスタンスが設定される
- `reinitialize()` で Slack 未設定時に `null` をセットし例外を throw しない
- `shutdown()` でインスタンスが `null` になる
- コンストラクタにインスタンスを渡した場合にそれを `getInstance()` で返す

#### PipelineSchedulerAdapter
- `name` が `'PipelineScheduler'` を返す
- `dependsOnSections` が `['meetingIntelligence']` を返す
- `getInstance()` が初期状態で `null` を返す
- `shutdown()` で既存インスタンスの `stop()` が呼ばれる
- `reinitialize()` で pipeline 無効時に `null` をセットし warn ログ
- `reinitialize()` で依存不足時に `null` をセットし warn ログ
- `reinitialize()` で依存が揃った状態で正常に `start()` まで呼ばれる
- `setDependencies()` で依存が正しくセットされる

#### PipelineStateStoreAdapter
- `name` が `'PipelineStateStore'` を返す
- `dependsOnSections` が `['meetingIntelligence']` を返す
- `getInstance()` が初期状態で `null` を返す
- `reinitialize()` でファクトリが呼ばれ `load()` が呼ばれる
- `shutdown()` で `flush()` が呼ばれてからインスタンスが `null` になる
- コンストラクタにインスタンスを渡した場合にそれを `getInstance()` で返す

### 既存テスト
- **全既存テストがパスすることを確認:** `npm test`

---

## 横断的懸念事項

- **ESM import:** ローカルファイルは `.js` 拡張子付き
- **ロガー:** `createLogger('SlackServiceAdapter')`, `createLogger('PipelineSchedulerAdapter')`, `createLogger('PipelineStateStoreAdapter')`
- **既存アダプターを変更しない:** 新規アダプターの追加のみ
- **ServiceRegistry の `reinitializeForSections`**: `shutdown()` → `reinitialize()` の順で呼ばれるため、PipelineSchedulerAdapter の `shutdown()` が `stop()` を確実に呼ぶことが重要（タイマー重複防止）

## Open Questions

なし
