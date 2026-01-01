# sage (賢者) - AIタスク管理アシスタント 実装ガイド

## プロジェクト概要

このプロジェクトは、Claude DesktopとClaude Code向けのMCPサーバーとして動作するAIタスク管理アシスタント「sage」の実装です。

## 重要なファイル

実装を開始する前に、以下の3つのspec文書を必ず参照してください：

### 📋 要件文書
**ファイル:** `.kiro/specs/claude-task-manager/requirements.md`

- 11の主要要件をEARS形式で定義
- 各要件にはユーザーストーリーと受け入れ基準が含まれています
- 実装時は必ず対応する要件番号を確認してください

### 🏗️ デザイン文書  
**ファイル:** `.kiro/specs/claude-task-manager/design.md`

- システムアーキテクチャと技術設計
- コンポーネント設計とインターフェース定義
- データモデル、エラーハンドリング、セキュリティ考慮事項
- 実装の詳細な技術仕様が記載されています

### ✅ 実装計画
**ファイル:** `.kiro/specs/claude-task-manager/tasks.md`

- 18の主要タスクと詳細サブタスク
- 各タスクは実装可能な単位に分割済み
- 要件への参照が含まれています
- **このファイルの順序に従って実装を進めてください**

## 実装指示

### 🚀 開始方法

1. **最初に必ず上記3つのファイルを読み込んでください**
2. **タスク1から順番に実装を開始してください**
3. **各タスクの要件参照を確認し、要件文書で詳細を確認してください**
4. **技術的な詳細はデザイン文書を参照してください**

### 📝 実装時の注意事項

#### 必須の参照順序
```
1. tasks.md で現在のタスクを確認
2. requirements.md で該当要件の詳細を確認  
3. design.md で技術仕様を確認
4. 実装開始
```

#### コード品質要件
- **TypeScript**を使用してください
- **MCP SDK** (`@modelcontextprotocol/sdk`) を使用してください
- **エラーハンドリング**を適切に実装してください
- **ユニットテスト**を含めてください

#### 外部統合
- **Apple Reminders**: プラットフォーム適応型統合
  - iOS/iPadOS: ネイティブ統合を優先
  - macOS: `node-applescript`を使用
- **カレンダー統合**: プラットフォーム適応型統合
  - iOS/iPadOS: ネイティブCalendar統合を優先
  - macOS: AppleScript経由でCalendar.app読み取り
  - Web: 代替手段（iCal URL、手動入力）
- **Notion統合**: Notion MCPサーバー経由で統合

### 🎯 推奨実装順序

**Phase 1: 基盤構築**
- タスク1: プロジェクト基盤とMCPサーバー基本構造
- タスク2: 設定管理システム
- タスク3: セットアップウィザード

**Phase 2: コア機能**
- タスク4: タスク分割エンジン
- タスク5: 優先度判定エンジン
- タスク6: 時間見積もりシステム
- タスク7: 関係者抽出システム
- タスク8: タスク分析統合システム

**Phase 3: 外部統合**
- タスク9: Apple Reminders統合（プラットフォーム適応型）
- タスク10: Notion MCP統合
- タスク11: カレンダー統合（プラットフォーム適応型）
- タスク12: リマインド管理システム
- タスク13: sync_to_notionツール（MCP経由）

**Phase 4: 完成**
- タスク14: 設定更新システム
- タスク15: エラーハンドリング
- タスク16: クロスプラットフォーム対応
- タスク17: テストスイート
- タスク18: ドキュメントとデプロイメント

### 🔧 技術スタック

#### MCP Client依存関係
Notion MCPサーバーとの通信のため、MCP Client機能も必要です：

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "node-applescript": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.19.0",
    "jest": "^29.0.0",
    "@anthropic-ai/mcpb": "^0.1.0"
  }
}
```

**注意**: 
- Notion統合はMCP経由で行うため、`@notionhq/client`は不要です
- Google Calendar APIも使用しないため、`googleapis`は不要です
- `@modelcontextprotocol/sdk`にはClient機能も含まれています

### 📁 推奨プロジェクト構造

```
sage/
├── src/
│   ├── index.ts                    # MCP Server エントリーポイント
│   ├── config/
│   │   ├── loader.ts               # 設定ファイル読み込み
│   │   ├── validator.ts            # 設定値検証
│   │   └── types.ts                # 設定型定義
│   ├── setup/
│   │   ├── check-status.ts         # セットアップ状態確認
│   │   ├── wizard.ts               # セットアップウィザード
│   │   └── questions.ts            # 質問定義
│   ├── tools/
│   │   ├── analyze-tasks.ts        # タスク分析
│   │   ├── set-reminders.ts        # リマインド設定
│   │   ├── calendar-check.ts       # カレンダー空き時間
│   │   └── notion-sync.ts          # Notion同期
│   ├── integrations/
│   │   ├── apple-reminders.ts      # プラットフォーム適応型Apple Reminders連携
│   │   ├── calendar-service.ts     # プラットフォーム適応型カレンダー連携
│   │   └── notion-mcp.ts           # Notion MCP連携
│   ├── utils/
│   │   ├── priority.ts             # 優先度判定ロジック
│   │   ├── estimation.ts           # 所要時間見積もり
│   │   ├── stakeholders.ts         # 関係者抽出
│   │   └── datetime.ts             # 日時処理
│   └── types/
│       ├── task.ts                 # タスク型定義
│       └── config.ts               # 設定型定義
├── tests/
├── manifest.json                   # Desktop用 MCPB manifest
├── package.json
├── tsconfig.json
└── README.md
```

### 🎯 成功基準

各フェーズ完了時に以下を確認してください：

**Phase 1完了基準:**
- [ ] MCPサーバーが起動する
- [ ] セットアップウィザードが動作する
- [ ] 設定ファイルが正しく生成される

**Phase 2完了基準:**
- [ ] タスク分析が動作する
- [ ] 優先度判定が正しく機能する
- [ ] 時間見積もりが妥当な値を返す

**Phase 3完了基準:**
- [ ] Apple Remindersにタスクが作成される（プラットフォーム適応型）
- [ ] Notion MCP経由でNotionにページが作成される
- [ ] カレンダーから空き時間が検出される（プラットフォーム適応型）

**Phase 4完了基準:**
- [ ] 全機能が統合されて動作する
- [ ] エラーハンドリングが適切に機能する
- [ ] テストが全て通る

### 💡 実装のコツ

1. **TDD（テスト駆動開発）**: 必ずテストを先に書いてから実装する
2. **段階的実装**: 一度に全てを実装せず、タスク単位で進める
3. **エラーファースト**: エラーハンドリングを最初から考慮する
4. **設定ファースト**: ハードコードせず、設定ファイルを活用する

### 🧪 TDD開発プロセス

各機能の実装は以下のサイクルで進めてください：

```
1. RED: 失敗するテストを書く
2. GREEN: テストが通る最小限のコードを書く
3. REFACTOR: コードを改善する（テストは通ったまま）
```

#### TDDの実践手順

1. **テストファイルを先に作成**
   - `tests/unit/[component].test.ts`を作成
   - 期待する動作をテストケースとして記述

2. **テストを実行して失敗を確認**
   - `npm test`で失敗することを確認

3. **最小限の実装**
   - テストが通る最小限のコードを実装

4. **リファクタリング**
   - テストが通ることを確認しながらコードを改善

#### テストファイル構成

```
tests/
├── unit/                    # ユニットテスト
│   ├── priority.test.ts
│   ├── estimation.test.ts
│   ├── stakeholders.test.ts
│   ├── task-splitter.test.ts
│   ├── config-loader.test.ts
│   └── wizard.test.ts
├── integration/             # 統合テスト
│   ├── apple-reminders.test.ts
│   ├── notion-mcp.test.ts
│   └── google-calendar.test.ts
└── e2e/                     # E2Eテスト
    └── full-workflow.test.ts
```

### 📅 カレンダー プラットフォーム適応型統合

#### プラットフォーム検出とカレンダー統合方式選択

```typescript
// src/integrations/calendar-service.ts
class CalendarService {
  async detectCalendarPlatform(): Promise<CalendarPlatformInfo> {
    const userAgent = navigator?.userAgent || process.platform;
    
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      return {
        platform: userAgent.includes('iPad') ? 'ipados' : 'ios',
        availableMethods: ['native'],
        recommendedMethod: 'native',
        requiresPermission: true,
        hasNativeAccess: true
      };
    } else if (process.platform === 'darwin') {
      return {
        platform: 'macos',
        availableMethods: ['eventkit', 'caldav'],
        recommendedMethod: 'eventkit',
        requiresPermission: true,
        hasNativeAccess: true
      };
    } else {
      return {
        platform: 'web',
        availableMethods: ['ical_url', 'manual_input', 'outlook'],
        recommendedMethod: 'manual_input',
        requiresPermission: false,
        hasNativeAccess: false
      };
    }
  }
  
  async fetchEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const platform = await this.detectCalendarPlatform();
    
    switch (platform.recommendedMethod) {
      case 'native':
        return await this.fetchNativeEvents(startDate, endDate);
      case 'eventkit':
        return await this.fetchEventKitEvents(startDate, endDate);
      case 'ical_url':
        return await this.fetchICalEvents(startDate, endDate);
      case 'manual_input':
        return await this.requestManualInput(startDate, endDate);
      default:
        return [];
    }
  }
}
```

#### iOS/iPadOS ネイティブカレンダー統合
```typescript
async fetchNativeEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
  try {
    // Claude iOSアプリのネイティブCalendar統合を使用
    const events = await window.claude?.calendar?.getEvents({
      startDate,
      endDate,
      includeAllDayEvents: false
    });
    
    return events.map(event => ({
      id: event.id,
      title: event.title,
      start: event.startDate,
      end: event.endDate,
      isAllDay: event.isAllDay,
      source: 'native'
    }));
  } catch (error) {
    console.error('ネイティブカレンダー統合エラー:', error);
    return [];
  }
}
```

#### macOS EventKitカレンダー統合
```typescript
async fetchEventKitEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
  // AppleScriptObjC を使用して EventKit にアクセス
  // EventKit は繰り返しイベントを個々の発生（occurrence）に自動展開
  const { runApplescript } = await import('run-applescript');

  const script = `
    use framework "EventKit"
    use scripting additions

    set eventStore to current application's EKEventStore's alloc()'s init()
    set startDate to current application's NSDate's dateWithTimeIntervalSince1970:${Date.parse(startDate) / 1000}
    set endDate to current application's NSDate's dateWithTimeIntervalSince1970:${Date.parse(endDate) / 1000}

    set calendars to eventStore's calendarsForEntityType:0
    set predicate to eventStore's predicateForEventsWithStartDate:startDate endDate:endDate calendars:calendars
    set events to eventStore's eventsMatchingPredicate:predicate

    -- イベントを JSON 形式で返す
    ...
  `;

  const result = await runApplescript(script);
  const events = JSON.parse(result);

  return events.map((event: any) => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    isAllDay: event.isAllDay,
    source: 'eventkit'
  }));
}
```

#### 代替統合方法
```typescript
async fetchICalEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
  // iCal URL統合（会社のカレンダーがiCal URLを提供している場合）
  const config = await this.loadConfig();
  if (!config.integrations.googleCalendar.icalUrl) {
    return [];
  }
  
  try {
    const response = await fetch(config.integrations.googleCalendar.icalUrl);
    const icalData = await response.text();
    // iCalデータをパースしてイベントを抽出
    return this.parseICalData(icalData, startDate, endDate);
  } catch (error) {
    console.error('iCal統合エラー:', error);
    return [];
  }
}

async requestManualInput(startDate: string, endDate: string): Promise<CalendarEvent[]> {
  // 手動入力フォールバック
  return [{
    id: 'manual-input-prompt',
    title: '⚠️ カレンダー統合が利用できません。手動で予定を入力してください。',
    start: startDate,
    end: startDate,
    isAllDay: true,
    source: 'manual_input'
  }];
}
```

### 🍎 Apple Reminders プラットフォーム適応型統合

#### プラットフォーム検出と統合方式選択

```typescript
// src/integrations/apple-reminders.ts
class AppleRemindersService {
  async detectPlatform(): Promise<PlatformInfo> {
    // User-Agentやその他の情報からプラットフォームを検出
    const userAgent = navigator?.userAgent || process.platform;
    
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      return {
        platform: userAgent.includes('iPad') ? 'ipados' : 'ios',
        hasNativeIntegration: true,
        supportsAppleScript: false,
        recommendedMethod: 'native'
      };
    } else if (process.platform === 'darwin') {
      return {
        platform: 'macos',
        hasNativeIntegration: false,
        supportsAppleScript: true,
        recommendedMethod: 'applescript'
      };
    }
    
    return {
      platform: 'unknown',
      hasNativeIntegration: false,
      supportsAppleScript: false,
      recommendedMethod: 'fallback'
    };
  }
  
  async createReminder(request: ReminderRequest): Promise<ReminderResult> {
    const platform = await this.detectPlatform();
    
    switch (platform.recommendedMethod) {
      case 'native':
        return await this.createNativeReminder(request);
      case 'applescript':
        return await this.createAppleScriptReminder(request);
      default:
        return await this.createFallbackReminder(request);
    }
  }
}
```

#### iOS/iPadOS ネイティブ統合
```typescript
async createNativeReminder(request: ReminderRequest): Promise<ReminderResult> {
  try {
    // Claude iOSアプリのネイティブReminders統合を使用
    // 具体的な実装はClaude iOSアプリのAPIに依存
    const result = await window.claude?.reminders?.create({
      title: request.title,
      notes: request.notes,
      dueDate: request.dueDate,
      list: request.list || 'Today'
    });
    
    return {
      success: true,
      method: 'native',
      reminderId: result.id,
      platformInfo: await this.detectPlatform()
    };
  } catch (error) {
    return {
      success: false,
      method: 'native',
      error: `ネイティブ統合エラー: ${error.message}`,
      platformInfo: await this.detectPlatform()
    };
  }
}
```

#### macOS AppleScript統合
```typescript
async createAppleScriptReminder(request: ReminderRequest): Promise<ReminderResult> {
  const applescript = require('node-applescript');
  
  const script = `
    tell application "Reminders"
      set myList to list "${request.list || 'Today'}"
      set newReminder to make new reminder at end of myList
      set name of newReminder to "${request.title}"
      ${request.notes ? `set body of newReminder to "${request.notes}"` : ''}
      ${request.dueDate ? `set due date of newReminder to date "${request.dueDate}"` : ''}
      return id of newReminder
    end tell
  `;
  
  return new Promise((resolve) => {
    applescript.execString(script, (error: any, result: any) => {
      if (error) {
        resolve({
          success: false,
          method: 'applescript',
          error: `AppleScript エラー: ${error.message}`,
          platformInfo: await this.detectPlatform()
        });
      } else {
        resolve({
          success: true,
          method: 'applescript',
          reminderId: result,
          platformInfo: await this.detectPlatform()
        });
      }
    });
  });
}
```

### 🔗 Notion MCP統合の詳細

#### MCP接続方式
sageは別のMCPサーバー（Notion MCP）と通信する必要があります。これは以下の方法で実現します：

1. **MCP Client機能**: sageがMCPクライアントとしてNotion MCPサーバーに接続
2. **Tool呼び出し**: Notion MCPのツールを呼び出してページ作成・更新
3. **エラーハンドリング**: MCP通信エラーの適切な処理

#### 実装例
```typescript
// src/integrations/notion-mcp.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class NotionMCPService {
  private client: Client;
  private transport: StdioClientTransport;
  
  async connect() {
    // Notion MCPサーバーに接続
    this.transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-notion']
    });
    
    this.client = new Client({
      name: 'sage-notion-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await this.client.connect(this.transport);
  }
  
  async createPage(request: NotionPageRequest) {
    // Notion MCPのcreate_pageツールを呼び出し
    const result = await this.client.request({
      method: 'tools/call',
      params: {
        name: 'create_page',
        arguments: {
          database_id: request.databaseId,
          properties: request.properties
        }
      }
    });
    return result;
  }
  
  async disconnect() {
    if (this.client) {
      await this.client.close();
    }
  }
}
```

#### 設定要件
- Notion MCPサーバーが事前に設定・起動されている必要があります
- sageの設定ファイルにNotion MCPサーバーの接続情報を含める必要があります
- 環境変数`NOTION_API_KEY`がNotion MCPサーバー用に設定されている必要があります

#### Notion MCP設定例
```json
// ~/.sage/config.json の integrations.notion セクション
{
  "integrations": {
    "notion": {
      "enabled": true,
      "threshold": 8,
      "unit": "days",
      "databaseId": "your-database-id",
      "mcpServerName": "notion",
      "mcpCommand": "npx",
      "mcpArgs": ["-y", "@modelcontextprotocol/server-notion"]
    }
  }
}
```

### 🚨 重要な注意事項

- **カレンダー統合**: プラットフォーム適応型統合
  - iOS/iPadOS: ネイティブCalendar統合の利用可能性を確認
  - macOS: AppleScriptのCalendar.app実行権限が必要
  - Web: 代替手段（iCal URL、手動入力）の実装
  - 会社のGoogle Calendar APIは使用不可の前提
- **Apple Reminders**: プラットフォーム適応型統合
  - iOS/iPadOS: ネイティブ統合の利用可能性を確認
  - macOS: AppleScriptの実行権限が必要
  - Web: フォールバック処理の実装
- **Notion MCP**: 事前にNotion MCPサーバーの設定が必要
  - `NOTION_API_KEY`環境変数の設定
  - Notion MCPサーバーの動作確認
- **MCP通信**: sageがサーバーとクライアント両方の役割を持つ
- **ファイルパス**: `~/.sage/config.json`を使用
- **エラーメッセージ**: ユーザーフレンドリーな日本語メッセージ
- **タイムゾーン**: 日本時間 (Asia/Tokyo) を考慮
- **文字エンコーディング**: UTF-8で適切に処理

## 質問やサポートが必要な場合

実装中に不明な点があれば、以下を明確にして質問してください：

1. **現在実装中のタスク番号**
2. **参照している要件番号**
3. **具体的な技術的課題**
4. **期待する動作と実際の動作**

このガイドに従って実装を進めることで、要件を満たす高品質なsageシステムを構築できます。

---

**実装開始**: tasks.mdのタスク1から開始してください！

---

## Spec文書の書き方ガイド

このプロジェクトでは、仕様文書を関心事ごとに分割して管理しています。

### Spec構造

```
.kiro/specs/claude-task-manager/
├── requirements.md          # 要件定義（EARS形式）
├── architecture.md          # アーキテクチャ概要
├── components.md            # コンポーネント設計
├── data-models.md           # データモデル定義
├── integrations.md          # 外部統合仕様
├── oauth-spec.md           # OAuth 2.1仕様
├── security.md             # セキュリティ仕様
├── testing.md              # テスト戦略
└── tasks.md               # 実装タスクリスト
```

### 各ファイルの役割

#### requirements.md
- **目的**: ユーザーストーリーと受け入れ基準の定義
- **形式**: EARS（Easy Approach to Requirements Syntax）
- **内容**: 要件番号、ユーザーストーリー、受け入れ基準

#### architecture.md
- **目的**: システム全体のアーキテクチャ設計
- **内容**:
  - システム概要
  - プラットフォーム対応状況
  - マルチプラットフォーム構成図（Mermaid）
  - レイヤー構成
  - パフォーマンス最適化
  - 国際化対応

#### components.md
- **目的**: 個別コンポーネントの詳細設計
- **内容**:
  - コンポーネント一覧（表形式）
  - 各コンポーネントのインターフェース定義（TypeScript）
  - コンポーネント依存関係図（Mermaid）

#### data-models.md
- **目的**: データ構造とモデルの定義
- **内容**:
  - Core Models（Task, UserConfigなど）
  - Configuration Models
  - Analysis Models
  - MCP Models
  - 設定ファイル例（JSON）

#### integrations.md
- **目的**: 外部サービス統合の仕様
- **内容**:
  - CLIインターフェース
  - Remote MCP Server設定
  - Apple Reminders統合
  - Calendar統合
  - Notion統合
  - エラーハンドリング

#### oauth-spec.md
- **目的**: OAuth 2.1認証の詳細仕様
- **内容**:
  - 認証フロー（Mermaidシーケンス図）
  - エンドポイント定義
  - セキュリティ要件
  - 実装タスク

#### security.md
- **目的**: セキュリティ要件とベストプラクティス
- **内容**:
  - データ保護
  - API セキュリティ
  - 入力検証
  - OAuth 2.1 セキュリティ
  - セキュリティチェックリスト

#### testing.md
- **目的**: テスト戦略とサンプルコード
- **内容**:
  - テストピラミッド
  - ユニットテスト例
  - 統合テスト例
  - E2Eテスト例
  - モック・スタブ
  - テストベストプラクティス

### Spec執筆のベストプラクティス

#### 1. 関心事の分離
各ファイルは単一の責任を持つようにする：
- ❌ **悪い例**: architecture.mdに実装タスクを含める
- ✅ **良い例**: 実装タスクはtasks.mdに分離

#### 2. Mermaid図の活用
複雑な関係を視覚化する：
```markdown
\```mermaid
graph TD
    A[Component A] --> B[Component B]
    B --> C[Component C]
\```
```

#### 3. TypeScriptインターフェースの活用
型定義で仕様を明確にする：
```typescript
interface ComponentInterface {
  method(param: ParamType): ReturnType;
}
```

#### 4. 例とテンプレートの提供
実装者が理解しやすいように：
- 設定ファイル例
- コード例
- APIリクエスト/レスポンス例

#### 5. 表形式の活用
比較や一覧には表を使用：
```markdown
| 項目 | 説明 | 例 |
|-----|------|---|
| ...  | ...  | ... |
```

#### 6. セクション構造の統一
各ファイルは以下の構造を基本とする：
1. タイトル
2. 目的・概要
3. 詳細説明
4. 例・サンプル
5. 注意事項

### Spec更新時の注意点

#### 変更時のチェックリスト
- [ ] 関連する他のspecファイルも更新したか？
- [ ] requirements.mdとの整合性は取れているか？
- [ ] tasks.mdに実装タスクを追加したか？
- [ ] 図は最新の状態か？（特にMermaid図）
- [ ] 例やサンプルコードは動作するか？

#### バージョン管理
各specファイルの冒頭に更新日を記載：
```markdown
> **Last Updated**: 2025-01-01
```

### Spec分割のメリット

1. **可読性**: 必要な情報を素早く見つけられる
2. **保守性**: 変更時の影響範囲が明確
3. **並行作業**: 複数人で異なるspecファイルを編集可能
4. **再利用性**: 各specを独立して参照可能

### Spec統合の流れ

実装時は以下の順序でspecを参照：
1. `requirements.md` - 何を実現するか
2. `architecture.md` - 全体構成の理解
3. `components.md` - 該当コンポーネントの設計
4. `data-models.md` - データ構造の確認
5. `integrations.md` - 外部サービス統合方法
6. `security.md` - セキュリティ要件
7. `testing.md` - テスト方法