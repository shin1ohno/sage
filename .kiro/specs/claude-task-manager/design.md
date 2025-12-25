# デザイン文書

## 概要

sageは、Claude DesktopとClaude Code向けのMCPサーバーとして実装されるAIタスク管理アシスタントです。個人の作業パターンを学習し、タスクの分析、優先順位付け、スケジューリング、リマインド管理を自動化します。

システムは以下の主要コンポーネントで構成されます：
- セットアップウィザード（初回設定）
- タスク分析エンジン（優先度・時間見積もり・関係者抽出）
- タスク分割エンジン（複雑タスクの分解）
- 外部統合（Apple Reminders、Notion、Google Calendar）
- 設定管理システム

## アーキテクチャ

### システム構成図

```
┌─────────────────────────────────────────────────┐
│                Claude Client                    │
│         (Desktop / Code / claude.ai)            │
└──────────────────┬──────────────────────────────┘
                   │ MCP Protocol (stdio)
                   ↓
┌─────────────────────────────────────────────────┐
│              sage MCP Server                    │
│  ┌───────────────────────────────────────────┐  │
│  │         Setup & Config Layer              │  │
│  │  - SetupWizard                            │  │
│  │  - ConfigManager                          │  │
│  │  - ConfigValidator                        │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │           Core Analysis Layer             │  │
│  │  - TaskSplitter                           │  │
│  │  - TaskAnalyzer                           │  │
│  │  - PriorityEngine                         │  │
│  │  - TimeEstimator                          │  │
│  │  - StakeholderExtractor                   │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │        Integration Layer                  │  │
│  │  - ReminderManager                        │  │
│  │  - CalendarService                        │  │
│  │  - NotionMCPService                       │  │
│  │  - AppleRemindersService                  │  │
│  └───────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│         ~/.sage/config.json                     │
│         (ユーザー設定ファイル)                    │
└─────────────────────────────────────────────────┘
```

### レイヤー構成

#### 1. MCP Interface Layer
- MCPプロトコルの実装
- ツール定義とリクエストハンドリング
- エラーハンドリングと応答フォーマット

#### 2. Setup & Config Layer
- 初回セットアップウィザード
- 設定ファイルの読み書き
- 設定値の検証とバリデーション

#### 3. Core Analysis Layer
- タスクの分割と整理
- 優先度判定ロジック
- 時間見積もりアルゴリズム
- 関係者抽出エンジン

#### 4. Integration Layer
- 外部サービスとの統合
- MCP経由でのNotion連携
- Apple RemindersとGoogle Calendarの直接API統合
- データ変換とマッピング

## コンポーネントと インターフェース

### 1. SetupWizard

**責任:** 初回セットアップの対話的ウィザード

```typescript
interface SetupWizard {
  checkStatus(): Promise<SetupStatus>;
  startWizard(mode?: 'full' | 'quick'): Promise<WizardSession>;
  answerQuestion(sessionId: string, questionId: string, answer: any): Promise<AnswerResult>;
  saveConfig(sessionId: string, confirm: boolean): Promise<SaveResult>;
}

interface WizardSession {
  sessionId: string;
  currentStep: number;
  totalSteps: number;
  question: Question;
  progress: number;
  answers: Record<string, any>;
}

interface Question {
  id: string;
  text: string;
  type: 'text' | 'select' | 'multiselect' | 'time' | 'days';
  options?: string[];
  defaultValue?: any;
  helpText?: string;
  validation?: ValidationRule[];
}
```

### 2. TaskSplitter

**責任:** 複雑なタスクや複数タスクの分割

```typescript
interface TaskSplitter {
  splitTasks(input: string): Promise<SplitResult>;
  analyzeComplexity(task: Task): Promise<ComplexityAnalysis>;
}

interface SplitResult {
  originalInput: string;
  splitTasks: Task[];
  splitReason: string;
  recommendedOrder: number[];
  dependencies: TaskDependency[];
}

interface ComplexityAnalysis {
  isComplex: boolean;
  complexity: 'simple' | 'medium' | 'complex' | 'project';
  suggestedSplits?: SubTask[];
  reasoning: string;
}

interface TaskDependency {
  taskIndex: number;
  dependsOn: number[];
  type: 'sequential' | 'parallel' | 'conditional';
}
```

### 3. TaskAnalyzer

**責任:** タスクの包括的分析

```typescript
interface TaskAnalyzer {
  analyzeTasks(tasks: Task[], config: UserConfig): Promise<AnalyzedTask[]>;
}

interface AnalyzedTask {
  original: Task;
  priority: Priority;
  estimatedMinutes: number;
  stakeholders: string[];
  suggestedReminders: Reminder[];
  suggestedTimeSlot?: TimeSlot;
  reasoning: AnalysisReasoning;
  tags: string[];
}

interface AnalysisReasoning {
  priorityReason: string;
  estimationReason: string;
  stakeholderReason: string;
  schedulingReason?: string;
}
```

### 4. PriorityEngine

**責任:** 優先度判定ロジック

```typescript
interface PriorityEngine {
  determinePriority(task: Task, rules: PriorityRules): Priority;
  evaluateConditions(task: Task, conditions: PriorityCondition[]): boolean;
}

interface PriorityCondition {
  type: 'deadline' | 'keyword' | 'stakeholder' | 'blocking' | 'custom';
  operator: '<' | '>' | '=' | 'contains' | 'matches';
  value: any;
  unit?: 'hours' | 'days' | 'weeks';
  description: string;
  weight?: number;
}

type Priority = 'P0' | 'P1' | 'P2' | 'P3';
```

### 5. TimeEstimator

**責任:** 所要時間見積もり

```typescript
interface TimeEstimator {
  estimateDuration(task: Task, config: EstimationConfig): number;
  analyzeKeywords(text: string): ComplexityKeywords;
}

interface EstimationConfig {
  simpleTaskMinutes: number;
  mediumTaskMinutes: number;
  complexTaskMinutes: number;
  projectTaskMinutes: number;
  keywordMapping: Record<string, string[]>;
  userAdjustments?: Record<string, number>;
}

interface ComplexityKeywords {
  simple: string[];
  medium: string[];
  complex: string[];
  project: string[];
  matched: string[];
}
```

### 6. StakeholderExtractor

**責任:** 関係者の識別と抽出

```typescript
interface StakeholderExtractor {
  extractStakeholders(task: Task, teamConfig: TeamConfig): string[];
  findMentions(text: string): string[];
  matchTeamMembers(text: string, team: TeamMember[]): TeamMember[];
}

interface TeamMember {
  name: string;
  role: 'manager' | 'lead' | 'team' | 'collaborator';
  keywords: string[];
  priority?: number;
}
```

### 7. AppleRemindersService

**責任:** プラットフォーム適応型Apple Reminders統合

```typescript
interface AppleRemindersService {
  createReminder(request: ReminderRequest): Promise<ReminderResult>;
  detectPlatform(): Promise<PlatformInfo>;
  isAvailable(): Promise<boolean>;
}

interface PlatformInfo {
  platform: 'ios' | 'ipados' | 'macos' | 'web' | 'unknown';
  hasNativeIntegration: boolean;
  supportsAppleScript: boolean;
  recommendedMethod: 'native' | 'applescript' | 'fallback';
}

interface ReminderRequest {
  title: string;
  notes?: string;
  dueDate?: string;
  list?: string;
  priority?: 'low' | 'medium' | 'high';
  alarms?: AlarmConfig[];
}

interface AlarmConfig {
  type: 'absolute' | 'relative';
  datetime?: string;
  offsetMinutes?: number;
}

interface ReminderResult {
  success: boolean;
  method: 'native' | 'applescript' | 'fallback';
  reminderId?: string;
  error?: string;
  platformInfo?: PlatformInfo;
}
```
```

### 8. CalendarService

**責任:** プラットフォーム適応型カレンダー統合と空き時間検出

```typescript
interface CalendarService {
  findAvailableSlots(request: SlotRequest, config: CalendarConfig): Promise<AvailableSlot[]>;
  fetchEvents(startDate: string, endDate: string): Promise<CalendarEvent[]>;
  calculateSuitability(slot: TimeSlot, config: CalendarConfig): SlotSuitability;
  detectCalendarPlatform(): Promise<CalendarPlatformInfo>;
  isCalendarAccessible(): Promise<boolean>;
}

interface CalendarPlatformInfo {
  platform: 'ios' | 'ipados' | 'macos' | 'web' | 'unknown';
  availableMethods: CalendarMethod[];
  recommendedMethod: CalendarMethod;
  requiresPermission: boolean;
  hasNativeAccess: boolean;
}

type CalendarMethod = 'native' | 'applescript' | 'caldav' | 'ical_url' | 'manual_input' | 'outlook';

interface SlotRequest {
  taskDuration: number;
  preferredDays?: string[];
  avoidDays?: string[];
  startDate?: string;
  endDate?: string;
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
}

interface AvailableSlot {
  start: string;
  end: string;
  durationMinutes: number;
  suitability: 'excellent' | 'good' | 'acceptable';
  reason: string;
  conflicts: string[];
  dayType: 'deep-work' | 'meeting-heavy' | 'normal';
  source: CalendarMethod;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  source: CalendarMethod;
}
```

**責任:** リマインド設定と管理

```typescript
interface ReminderManager {
  setReminder(request: ReminderRequest, config: UserConfig): Promise<ReminderResult>;
  determineDestination(task: Task, config: UserConfig): 'apple' | 'notion';
  calculateReminderTimes(deadline: string, types: string[]): ReminderTime[];
}

interface ReminderRequest {
  taskTitle: string;
  reminderType: string;
  targetDate?: string;
  list?: string;
  priority?: Priority;
}

interface ReminderResult {
  success: boolean;
  destination: 'apple_reminders' | 'notion_mcp';
  reminderId?: string;
  reminderUrl?: string;
  error?: string;
}

### 9. ReminderManager

**責任:** リマインド設定と管理

```typescript
interface ReminderManager {
  setReminder(request: ReminderRequest, config: UserConfig): Promise<ReminderResult>;
  determineDestination(task: Task, config: UserConfig): 'apple' | 'notion';
  calculateReminderTimes(deadline: string, types: string[]): ReminderTime[];
}

interface ReminderRequest {
  taskTitle: string;
  reminderType: string;
  targetDate?: string;
  list?: string;
  priority?: Priority;
}

interface ReminderResult {
  success: boolean;
  destination: 'apple_reminders' | 'notion_mcp';
  method?: 'native' | 'applescript' | 'fallback';
  reminderId?: string;
  reminderUrl?: string;
  error?: string;
}
```

**責任:** Notion MCP経由でのNotion統合

```typescript
interface NotionMCPService {
  createPage(request: NotionPageRequest): Promise<NotionPageResult>;
  searchPages(query: string): Promise<NotionPage[]>;
  updatePage(pageId: string, updates: NotionPageUpdates): Promise<NotionPageResult>;
  isAvailable(): Promise<boolean>;
}

interface NotionPageRequest {
  databaseId: string;
  title: string;
  properties: Record<string, any>;
  content?: NotionBlock[];
}

interface NotionPageResult {
  success: boolean;
  pageId?: string;
  pageUrl?: string;
  error?: string;
}

interface NotionBlock {
  type: 'paragraph' | 'heading' | 'bulleted_list_item';
  content: string;
}
```

## データモデル

### Core Models

```typescript
interface Task {
  title: string;
  description?: string;
  deadline?: string;
  dependencies?: string[];
  status?: TaskStatus;
  tags?: string[];
  metadata?: Record<string, any>;
}

type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';

interface UserConfig {
  version: string;
  createdAt: string;
  lastUpdated: string;
  user: UserProfile;
  calendar: CalendarConfig;
  priorityRules: PriorityRules;
  estimation: EstimationConfig;
  reminders: RemindersConfig;
  team: TeamConfig;
  integrations: IntegrationsConfig;
  preferences: PreferencesConfig;
}

interface UserProfile {
  name: string;
  email?: string;
  timezone: string;
  role?: string;
}

interface CalendarConfig {
  workingHours: {
    start: string;
    end: string;
  };
  meetingHeavyDays: string[];
  deepWorkDays: string[];
  deepWorkBlocks: DeepWorkBlock[];
  timeZone: string;
}

interface DeepWorkBlock {
  day: string;
  startHour: number;
  endHour: number;
  description: string;
}
```

### Configuration Models

```typescript
interface PriorityRules {
  p0Conditions: PriorityCondition[];
  p1Conditions: PriorityCondition[];
  p2Conditions: PriorityCondition[];
  defaultPriority: Priority;
}

interface RemindersConfig {
  defaultTypes: string[];
  weeklyReview: {
    enabled: boolean;
    day: string;
    time: string;
    description: string;
  };
  customRules: ReminderRule[];
}

interface ReminderRule {
  condition: string;
  reminders: string[];
  description?: string;
}

interface TeamConfig {
  manager?: TeamMember;
  frequentCollaborators: TeamMember[];
  departments: string[];
}

interface IntegrationsConfig {
  appleReminders: AppleRemindersConfig;
  notion: NotionConfig;
  googleCalendar: GoogleCalendarConfig;
}

interface AppleRemindersConfig {
  enabled: boolean;
  threshold: number;
  unit: 'days' | 'hours';
  defaultList: string;
  lists: Record<string, string>;
  platformAdaptive: boolean; // プラットフォーム適応型統合
  preferNativeIntegration: boolean; // iOS/iPadOSでネイティブ統合を優先
  appleScriptFallback: boolean; // macOSでAppleScript使用
}

interface NotionConfig {
  enabled: boolean;
  threshold: number;
  unit: 'days' | 'hours';
  databaseId: string;
  databaseUrl?: string;
  mcpServerName: string; // MCP経由でのNotion接続用
  propertyMappings?: Record<string, string>;
}

interface GoogleCalendarConfig {
  enabled: boolean;
  method: CalendarMethod;
  platformAdaptive: boolean;
  // ネイティブ統合用
  preferNativeAccess: boolean;
  // AppleScript用
  appleScriptFallback: boolean;
  // 代替手段用
  icalUrl?: string;
  outlookIntegration?: boolean;
  manualInputFallback: boolean;
  // 従来のAPI設定（使用されない可能性が高い）
  defaultCalendar?: string;
  conflictDetection: boolean;
  lookAheadDays: number;
}
```

## エラーハンドリング

### エラー分類

```typescript
enum ErrorType {
  SETUP_ERROR = 'SETUP_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTEGRATION_ERROR = 'INTEGRATION_ERROR',
  ANALYSIS_ERROR = 'ANALYSIS_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR'
}

interface SageError {
  type: ErrorType;
  code: string;
  message: string;
  details?: any;
  recoverable: boolean;
  suggestions?: string[];
}
```

### エラーハンドリング戦略

1. **Graceful Degradation**: 一部の機能が失敗しても、他の機能は継続動作
2. **Retry Logic**: ネットワークエラーや一時的な障害に対する自動リトライ
3. **User-Friendly Messages**: 技術的なエラーをユーザーにわかりやすく説明
4. **Recovery Suggestions**: エラー解決のための具体的な提案

```typescript
class ErrorHandler {
  static handle(error: Error, context: string): SageError {
    // エラー分類とユーザーフレンドリーなメッセージ生成
  }
  
  static shouldRetry(error: SageError): boolean {
    // リトライ可能かどうかの判定
  }
  
  static getSuggestions(error: SageError): string[] {
    // エラー解決のための提案生成
  }
}
```

## テスト戦略

### テストピラミッド

```
    ┌─────────────────┐
    │   E2E Tests     │  ← 統合テスト（少数）
    │   (5-10%)       │
    ├─────────────────┤
    │ Integration     │  ← API統合テスト（中程度）
    │ Tests (20-30%)  │
    ├─────────────────┤
    │  Unit Tests     │  ← 単体テスト（多数）
    │  (60-70%)       │
    └─────────────────┘
```

### テスト分類

#### 1. Unit Tests
- 各コンポーネントの単体テスト
- ビジネスロジックの検証
- エッジケースのテスト

```typescript
describe('PriorityEngine', () => {
  describe('determinePriority', () => {
    it('should return P0 for tasks with 24h deadline', () => {
      // テスト実装
    });
    
    it('should return P0 for tasks with urgent keywords', () => {
      // テスト実装
    });
    
    it('should return P1 for manager requests', () => {
      // テスト実装
    });
  });
});
```

#### 2. Integration Tests
- 外部API統合のテスト
- 設定ファイルの読み書きテスト
- エラーハンドリングのテスト

```typescript
describe('NotionService Integration', () => {
  it('should create page in Notion database', async () => {
    // Notion API統合テスト
  });
  
  it('should handle API rate limits gracefully', async () => {
    // レート制限のテスト
  });
});
```

#### 3. E2E Tests
- 完全なワークフローのテスト
- ユーザーシナリオの検証

```typescript
describe('Complete Task Analysis Flow', () => {
  it('should analyze tasks from setup to reminder creation', async () => {
    // 1. セットアップ
    // 2. タスク分析
    // 3. リマインド作成
    // 4. 結果検証
  });
});
```

### モックとスタブ

```typescript
// 外部API呼び出しのモック
jest.mock('./integrations/notion', () => ({
  NotionService: {
    createPage: jest.fn().mockResolvedValue({ id: 'mock-page-id' })
  }
}));

// 設定ファイルのスタブ
const mockConfig: UserConfig = {
  // テスト用設定
};
```

## セキュリティ考慮事項

### 1. データ保護
- **ローカルストレージ**: すべてのユーザーデータは`~/.sage/`に保存
- **暗号化**: 機密情報（APIキー）は環境変数で管理
- **アクセス制御**: 設定ファイルの適切なパーミッション設定

### 2. API セキュリティ
- **認証**: 各統合サービスの適切な認証方式を使用
- **レート制限**: API呼び出し頻度の制限と監視
- **エラーログ**: 機密情報をログに出力しない

### 3. 入力検証
- **サニタイゼーション**: ユーザー入力の適切な検証とサニタイゼーション
- **インジェクション対策**: SQLインジェクション、スクリプトインジェクションの防止

```typescript
class SecurityValidator {
  static sanitizeInput(input: string): string {
    // 入力のサニタイゼーション
  }
  
  static validateApiKey(key: string): boolean {
    // APIキーの形式検証
  }
  
  static checkPermissions(filePath: string): boolean {
    // ファイルパーミッションの確認
  }
}
```

## パフォーマンス最適化

### 1. レスポンス時間目標
- **セットアップ**: 各質問への応答 < 1秒
- **タスク分析**: 10タスクの分析 < 3秒
- **カレンダー検索**: 1週間の空き時間検索 < 2秒
- **リマインド作成**: 外部API呼び出し < 5秒

### 2. 最適化戦略

#### キャッシング
```typescript
class CacheManager {
  private cache = new Map<string, CacheEntry>();
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) {
      return entry.value;
    }
    return null;
  }
  
  set<T>(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  }
}
```

#### 並列処理
```typescript
async function analyzeTasksParallel(tasks: Task[]): Promise<AnalyzedTask[]> {
  const promises = tasks.map(task => 
    Promise.all([
      priorityEngine.determinePriority(task),
      timeEstimator.estimateDuration(task),
      stakeholderExtractor.extractStakeholders(task)
    ])
  );
  
  const results = await Promise.all(promises);
  return results.map(([priority, duration, stakeholders], index) => ({
    original: tasks[index],
    priority,
    estimatedMinutes: duration,
    stakeholders,
    // ...
  }));
}
```

#### バッチ処理
```typescript
class BatchProcessor {
  private queue: Task[] = [];
  private batchSize = 10;
  private batchTimeout = 1000; // 1秒
  
  async addTask(task: Task): Promise<AnalyzedTask> {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.scheduleBatch();
    });
  }
  
  private scheduleBatch(): void {
    if (this.queue.length >= this.batchSize) {
      this.processBatch();
    } else {
      setTimeout(() => this.processBatch(), this.batchTimeout);
    }
  }
}
```

## 国際化とローカライゼーション

### 多言語対応

```typescript
interface LocaleConfig {
  language: 'ja' | 'en';
  dateFormat: string;
  timeFormat: '12h' | '24h';
  timezone: string;
}

class I18nManager {
  private messages: Record<string, Record<string, string>>;
  
  t(key: string, params?: Record<string, any>): string {
    // 翻訳メッセージの取得と変数置換
  }
  
  formatDate(date: Date, format?: string): string {
    // ロケールに応じた日付フォーマット
  }
  
  formatTime(time: Date): string {
    // ロケールに応じた時刻フォーマット
  }
}
```

### 日本語対応の考慮事項
- **自然言語処理**: 日本語のタスク分析とキーワード抽出
- **日付時刻**: 日本のタイムゾーンと祝日対応
- **文字エンコーディング**: UTF-8での適切な文字処理

## 拡張性とメンテナンス性

### プラグインアーキテクチャ

```typescript
interface AnalysisPlugin {
  name: string;
  version: string;
  analyze(task: Task, context: AnalysisContext): Promise<AnalysisResult>;
}

class PluginManager {
  private plugins: Map<string, AnalysisPlugin> = new Map();
  
  register(plugin: AnalysisPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }
  
  async runPlugins(task: Task, context: AnalysisContext): Promise<AnalysisResult[]> {
    const results = await Promise.all(
      Array.from(this.plugins.values()).map(plugin => 
        plugin.analyze(task, context)
      )
    );
    return results;
  }
}
```

### 設定の進化対応

```typescript
class ConfigMigrator {
  private migrations: Map<string, (config: any) => any> = new Map();
  
  migrate(config: any, fromVersion: string, toVersion: string): any {
    // バージョン間の設定マイグレーション
  }
  
  addMigration(version: string, migrationFn: (config: any) => any): void {
    this.migrations.set(version, migrationFn);
  }
}
```

この設計により、要件で定義されたすべての機能を実装し、将来の拡張にも対応できる柔軟で保守性の高いシステムを構築できます。