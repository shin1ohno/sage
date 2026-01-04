# Phase 3: index.ts分割とmcp-handler.ts重複解消 - 実装計画

## 概要

### 現状
- `src/index.ts`: 2,826行（24個のMCPツール + サービス初期化 + サーバー起動）
- `src/cli/mcp-handler.ts`: 2,813行（20個のツール定義が重複）
- 合計: 5,639行の重複を含むコード

### 目標
1. ツールハンドラーを機能別ファイルに分割
2. index.tsとmcp-handler.tsで共通のツール定義を使用
3. 各ファイルを500行以下に削減

---

## ツールカテゴリ分類

### 1. Setup Tools (セットアップ関連)
| ツール名 | 行数目安 | 説明 |
|---------|---------|------|
| check_setup_status | ~80 | 設定状態確認 |
| start_setup_wizard | ~60 | ウィザード開始 |
| answer_wizard_question | ~110 | 質問応答 |
| save_config | ~80 | 設定保存 |

### 2. Config Tools (設定管理)
| ツール名 | 行数目安 | 説明 |
|---------|---------|------|
| update_config | ~100 | 設定更新 |

### 3. Task Tools (タスク管理)
| ツール名 | 行数目安 | 説明 |
|---------|---------|------|
| analyze_tasks | ~200 | タスク分析 |
| detect_duplicates | ~100 | 重複検出 |
| update_task_status | ~80 | ステータス更新 |
| sync_tasks | ~200 | タスク同期 |

### 4. Calendar Tools (カレンダー)
| ツール名 | 行数目安 | 説明 |
|---------|---------|------|
| list_calendar_events | ~150 | イベント一覧 |
| find_available_slots | ~200 | 空き時間検索 |
| create_calendar_event | ~100 | イベント作成 |
| delete_calendar_event | ~70 | イベント削除 |
| delete_calendar_events_batch | ~90 | バッチ削除 |
| respond_to_calendar_event | ~100 | 出欠返答 |
| respond_to_calendar_events_batch | ~80 | バッチ返答 |
| get_working_cadence | ~80 | 作業リズム取得 |

### 5. Reminder Tools (リマインダー)
| ツール名 | 行数目安 | 説明 |
|---------|---------|------|
| set_reminder | ~200 | リマインダー設定 |

### 6. Todo Tools (ToDo管理)
| ツール名 | 行数目安 | 説明 |
|---------|---------|------|
| list_todos | ~120 | ToDo一覧 |

### 7. Integration Tools (外部連携)
| ツール名 | 行数目安 | 説明 |
|---------|---------|------|
| sync_to_notion | ~100 | Notion同期 |

---

## 実装フェーズ

### Phase 3.1: 基盤整備 (1セッション)

**目標**: ツール登録の共通インターフェースを作成

**タスク**:
1. `src/tools/types.ts` - ツール定義の共通型
2. `src/tools/registry.ts` - ツール登録ヘルパー
3. テスト作成

**成果物**:
```
src/tools/
├── types.ts          # ToolDefinition, ToolHandler型
└── registry.ts       # registerTool, createToolResponse
```

### Phase 3.2: Setup Tools抽出 (1セッション)

**目標**: セットアップ関連ツールを分離

**タスク**:
1. `src/tools/setup/` ディレクトリ作成
2. 4つのセットアップツールを移行
3. index.tsから該当コードを削除
4. テスト確認

**成果物**:
```
src/tools/setup/
├── index.ts              # エクスポート
├── check-status.ts       # check_setup_status
├── wizard.ts             # start_setup_wizard, answer_wizard_question
└── save-config.ts        # save_config
```

### Phase 3.3: Task Tools抽出 (1セッション)

**目標**: タスク管理ツールを分離

**タスク**:
1. `src/tools/tasks/` ディレクトリ作成
2. 4つのタスクツールを移行
3. テスト確認

**成果物**:
```
src/tools/tasks/
├── index.ts              # エクスポート
├── analyze.ts            # analyze_tasks
├── duplicates.ts         # detect_duplicates
├── status.ts             # update_task_status
└── sync.ts               # sync_tasks
```

### Phase 3.4: Calendar Tools抽出 (1-2セッション)

**目標**: カレンダーツールを分離（最大グループ）

**タスク**:
1. `src/tools/calendar/` ディレクトリ作成
2. 8つのカレンダーツールを移行
3. テスト確認

**成果物**:
```
src/tools/calendar/
├── index.ts              # エクスポート
├── list-events.ts        # list_calendar_events
├── available-slots.ts    # find_available_slots
├── create-event.ts       # create_calendar_event
├── delete-event.ts       # delete_calendar_event, batch
├── respond-event.ts      # respond_to_calendar_event, batch
└── working-cadence.ts    # get_working_cadence
```

### Phase 3.5: Reminder & Todo Tools抽出 (1セッション)

**目標**: リマインダーとToDoツールを分離

**成果物**:
```
src/tools/reminders/
├── index.ts              # エクスポート
└── set-reminder.ts       # set_reminder

src/tools/todos/
├── index.ts              # エクスポート
└── list-todos.ts         # list_todos
```

### Phase 3.6: Integration Tools抽出 (1セッション)

**目標**: 外部連携ツールを分離

**成果物**:
```
src/tools/integrations/
├── index.ts              # エクスポート
└── notion-sync.ts        # sync_to_notion
```

### Phase 3.7: mcp-handler.ts統合 (1-2セッション)

**目標**: mcp-handler.tsを共通ツール定義を使用するよう更新

**タスク**:
1. mcp-handler.tsの各ツールを共通定義に置き換え
2. HTTP固有のラッパーのみ残す
3. テスト確認
4. 重複コード削除

### Phase 3.8: 最終整理 (1セッション)

**目標**: index.tsを最小化し、エントリーポイントとしての役割のみに

**タスク**:
1. index.tsからツール定義を完全に削除
2. サービス初期化をcontainer.tsに移行
3. index.tsはサーバー起動のみに
4. 全テスト確認

**最終的なindex.ts構造**:
```typescript
// src/index.ts (~100行)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";
import { initializeServices } from "./services/init.js";

async function main() {
  const config = await loadConfig();
  const services = initializeServices(config);
  const server = new McpServer({ name: "sage", version: VERSION });

  registerAllTools(server, services);

  await server.connect(new StdioServerTransport());
}
```

---

## リスク軽減策

### 1. 段階的移行
- 1ツールカテゴリずつ移行
- 各フェーズ後にテスト全通過を確認
- 問題発生時はrevert可能

### 2. 後方互換性
- ツール名は変更しない
- APIレスポンス形式は維持
- 既存テストはすべて通過させる

### 3. レビューポイント
- 各フェーズ完了後にコミット
- テスト実行結果を確認
- 行数削減を計測

---

## 期待される成果

### 定量的改善
| 指標 | Before | After |
|------|--------|-------|
| index.ts | 2,826行 | ~100行 |
| mcp-handler.ts | 2,813行 | ~500行 |
| 最大ファイルサイズ | 2,826行 | ~300行 |
| 重複コード | ~2,000行 | 0行 |

### 定性的改善
- 各ツールが独立したファイルで管理
- 新規ツール追加が容易に
- テストが書きやすくなる
- コードナビゲーションの改善

---

## 優先順位

1. **Phase 3.1** (基盤) - 必須、他のすべての前提
2. **Phase 3.2** (Setup) - 比較的シンプル、練習として最適
3. **Phase 3.4** (Calendar) - 最大グループ、早めに着手
4. **Phase 3.3** (Tasks) - 中程度の複雑さ
5. **Phase 3.5-3.6** (Reminder/Todo/Integration) - 小規模
6. **Phase 3.7** (mcp-handler統合) - 依存関係あり
7. **Phase 3.8** (最終整理) - 全フェーズ完了後

---

## 所要時間見積もり

| フェーズ | セッション数 | 累計 |
|---------|-------------|------|
| 3.1 基盤整備 | 1 | 1 |
| 3.2 Setup | 1 | 2 |
| 3.3 Tasks | 1 | 3 |
| 3.4 Calendar | 1-2 | 4-5 |
| 3.5 Reminder/Todo | 1 | 5-6 |
| 3.6 Integration | 1 | 6-7 |
| 3.7 mcp-handler | 1-2 | 7-9 |
| 3.8 最終整理 | 1 | 8-10 |

**合計: 8-10セッション**
