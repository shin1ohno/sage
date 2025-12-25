# デザイン文書

## 概要

sageは、Claude Desktop、Claude Code、およびClaude iOS/iPadOSアプリ向けのAIタスク管理アシスタントです。個人の作業パターンを学習し、タスクの分析、優先順位付け、スケジューリング、リマインド管理を自動化します。

プラットフォーム別実装：
- **Claude Desktop/Code**: MCPサーバーとして実装（完全機能）
- **Claude iOS/iPadOS**: Claude Skillsとして実装（ネイティブ統合付き）
- **Claude Web**: Claude Skillsとして実装（基本機能）

システムは以下の主要コンポーネントで構成されます：
- セットアップウィザード（初回設定）
- タスク分析エンジン（優先度・時間見積もり・関係者抽出）
- タスク分割エンジン（複雑タスクの分解）
- 外部統合（Apple Reminders、Notion、Google Calendar）
- 設定管理システム
- プラットフォーム適応レイヤー

## アーキテクチャ

### マルチプラットフォーム構成図

```
┌─────────────────────────────────────────────────┐
│                Claude Client                    │
│  ┌─────────────┬─────────────┬─────────────────┐ │
│  │Desktop/Code │iOS/iPadOS   │Web              │ │
│  │(MCP Server) │(Skills)     │(Skills)         │ │
│  └─────────────┴─────────────┴─────────────────┘ │
└──────┬──────────────┬──────────────┬─────────────┘
       │              │              │
       ↓              ↓              ↓
┌─────────────────────────────────────────────────┐
│            sage Core Architecture               │
│  ┌───────────────────────────────────────────┐  │
│  │      Platform Adaptation Layer            │  │
│  │  - MCPAdapter (Desktop/Code)              │  │
│  │  - SkillsAdapter (iOS/iPadOS/Web)         │  │
│  │  - PlatformDetector                       │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │         Setup & Config Layer              │  │
│  │  - SetupWizard                            │  │
│  │  - ConfigManager (File/Session/Cloud)     │  │
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
│  │  - NotionMCPService (Desktop/Code only)   │  │
│  │  - AppleRemindersService                  │  │
│  │  - NativeIntegrationService (iOS/iPadOS)  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│              Configuration Storage              │
│  ┌─────────────┬─────────────┬─────────────────┐ │
│  │Desktop/Code │iOS/iPadOS   │Web              │ │
│  │~/.sage/     │Session +    │Session Only     │ │
│  │config.json  │iCloud Sync  │                 │ │
│  └─────────────┴─────────────┴─────────────────┘ │
└─────────────────────────────────────────────────┘
```

### プラットフォーム別機能比較

| 機能 | Desktop/Code (MCP) | iOS/iPadOS (Skills) | Web (Skills) |
|------|-------------------|-------------------|--------------|
| タスク分析 | ✅ 完全版 | ✅ 完全版 | ✅ 基本版 |
| 優先順位付け | ✅ カスタムルール | ✅ カスタムルール | ✅ 基本ルール |
| 時間見積もり | ✅ 学習機能付き | ✅ 学習機能付き | ✅ 固定ルール |
| タスク分割 | ✅ 複雑な分割 | ✅ 複雑な分割 | ✅ 基本分割 |
| 設定管理 | ✅ 永続化ファイル | ✅ セッション+iCloud | ⚠️ セッションのみ |
| Apple Reminders | ✅ AppleScript | ✅ **ネイティブ統合** | ❌ 手動コピー推奨 |
| Calendar統合 | ✅ AppleScript | ✅ **ネイティブ統合** | ❌ 手動入力 |
| Notion統合 | ✅ MCP経由 | ✅ **Connector経由** | ❌ 手動コピー推奨 |

### レイヤー構成

#### 1. Platform Adaptation Layer
- プラットフォーム検出とアダプター選択
- MCP/Skills間の統一インターフェース
- プラットフォーム固有の最適化

#### 2. MCP Interface Layer (Desktop/Code)
- MCPプロトコルの実装
- ツール定義とリクエストハンドリング
- エラーハンドリングと応答フォーマット

#### 3. Skills Interface Layer (iOS/iPadOS/Web)
- Claude Skills APIの実装
- ネイティブ統合の活用
- セッション管理とステート保持

#### 4. Setup & Config Layer
- 初回セットアップウィザード
- プラットフォーム別設定ストレージ
- 設定値の検証とバリデーション

#### 5. Core Analysis Layer
- タスクの分割と整理
- 優先度判定ロジック
- 時間見積もりアルゴリズム
- 関係者抽出エンジン

#### 6. Integration Layer
- 外部サービスとの統合
- プラットフォーム別統合方式の選択
- データ変換とマッピング

## コンポーネントと インターフェース

### 0. PlatformAdapter

**責任:** プラットフォーム検出と適切なアダプターの選択

```typescript
interface PlatformAdapter {
  detectPlatform(): Promise<PlatformInfo>;
  createSageInstance(): Promise<SageCore>;
  getAvailableFeatures(): FeatureSet;
}

interface PlatformInfo {
  type: 'desktop_mcp' | 'ios_skills' | 'ipados_skills' | 'web_skills';
  version: string;
  capabilities: PlatformCapability[];
  nativeIntegrations: string[];
}

interface PlatformCapability {
  name: string;
  available: boolean;
  requiresPermission: boolean;
  fallbackAvailable: boolean;
}

interface FeatureSet {
  taskAnalysis: boolean;
  persistentConfig: boolean;
  appleReminders: boolean;
  calendarIntegration: boolean;
  notionIntegration: boolean;
  fileSystemAccess: boolean;
}

// プラットフォーム別実装
class MCPAdapter implements PlatformAdapter {
  // Desktop/Code向けMCP実装
}

class SkillsAdapteriOS implements PlatformAdapter {
  // iOS/iPadOS向けSkills実装（ネイティブ統合付き）
}

class SkillsAdapterWeb implements PlatformAdapter {
  // Web向けSkills実装（基本機能のみ）
}
```

### 1. SetupWizard

**責任:** プラットフォーム適応型の初回セットアップウィザード

```typescript
interface SetupWizard {
  checkStatus(): Promise<SetupStatus>;
  startWizard(mode?: 'full' | 'quick', platform?: PlatformInfo): Promise<WizardSession>;
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
  platformOptimized: boolean; // プラットフォーム最適化フラグ
}

interface Question {
  id: string;
  text: string;
  type: 'text' | 'select' | 'multiselect' | 'time' | 'days';
  options?: string[];
  defaultValue?: any;
  helpText?: string;
  validation?: ValidationRule[];
  platformSpecific?: string[]; // 特定プラットフォームでのみ表示
}

// プラットフォーム別セットアップ
interface SetupQuestionSet {
  common: Question[]; // 全プラットフォーム共通
  desktop: Question[]; // Desktop/Code専用
  ios: Question[]; // iOS/iPadOS専用
  web: Question[]; // Web専用
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

### 8. NativeIntegrationService (iOS/iPadOS Skills専用)

**責任:** Claude Skills環境でのネイティブ統合

```typescript
interface NativeIntegrationService {
  createReminder(request: ReminderRequest): Promise<ReminderResult>;
  fetchCalendarEvents(startDate: string, endDate: string): Promise<CalendarEvent[]>;
  findAvailableSlots(request: SlotRequest): Promise<AvailableSlot[]>;
  createNotionPage(request: NotionPageRequest): Promise<NotionPageResult>; // 追加
  checkPermissions(): Promise<PermissionStatus>;
}

interface PermissionStatus {
  reminders: 'granted' | 'denied' | 'not_determined';
  calendar: 'granted' | 'denied' | 'not_determined';
  notion: 'granted' | 'denied' | 'not_determined'; // 追加
  canRequestPermission: boolean;
}

// iOS/iPadOS Skills実装例
class NativeIntegrationServiceiOS implements NativeIntegrationService {
  async createReminder(request: ReminderRequest): Promise<ReminderResult> {
    try {
      // Claude iOSアプリのネイティブReminders統合を使用
      const result = await window.claude?.reminders?.create({
        title: request.title,
        notes: request.notes,
        dueDate: request.dueDate,
        list: request.list || 'Today',
        priority: this.mapPriority(request.priority)
      });
      
      return {
        success: true,
        method: 'native',
        reminderId: result.id,
        reminderUrl: result.url
      };
    } catch (error) {
      return {
        success: false,
        method: 'native',
        error: `ネイティブ統合エラー: ${error.message}`
      };
    }
  }
  
  async fetchCalendarEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
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
  
  async findAvailableSlots(request: SlotRequest): Promise<AvailableSlot[]> {
    const events = await this.fetchCalendarEvents(
      request.startDate || new Date().toISOString(),
      request.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    );
    
    return this.calculateAvailableSlots(events, request.taskDuration);
  }
  
  async createNotionPage(request: NotionPageRequest): Promise<NotionPageResult> {
    try {
      // Claude iOSアプリのNotion Connector統合を使用
      const result = await window.claude?.notion?.createPage({
        databaseId: request.databaseId,
        title: request.title,
        properties: request.properties,
        content: request.content
      });
      
      return {
        success: true,
        pageId: result.id,
        pageUrl: result.url
      };
    } catch (error) {
      return {
        success: false,
        error: `Notion Connector統合エラー: ${error.message}`
      };
    }
  }
  
  private mapPriority(priority?: Priority): number {
    const priorityMap = { 'P0': 1, 'P1': 5, 'P2': 5, 'P3': 9 };
    return priorityMap[priority] || 5;
  }
  
  private calculateAvailableSlots(events: CalendarEvent[], duration: number): AvailableSlot[] {
    // 空き時間計算ロジック（既存のCalendarServiceと同様）
    // ネイティブデータを使用してより正確な計算が可能
  }
}
```

### 9. CalendarService

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

### 10. ReminderManager

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

### 11. NotionMCPService

**責任:** Notion MCP経由でのNotion統合（Desktop/Code専用）

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
  platform: PlatformSpecificConfig; // プラットフォーム固有設定
}

interface PlatformSpecificConfig {
  type: 'desktop_mcp' | 'ios_skills' | 'ipados_skills' | 'web_skills';
  nativeIntegrationsEnabled: boolean;
  fallbackMethods: string[];
  permissionsGranted: Record<string, boolean>;
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
  skillsIntegration?: SkillsIntegrationConfig; // Skills版専用設定
}

interface SkillsIntegrationConfig {
  useNativeAPI: boolean;
  requestPermissionOnStartup: boolean;
  fallbackToManualCopy: boolean;
  sessionPersistence: boolean;
}

interface NotionConfig {
  enabled: boolean;
  threshold: number;
  unit: 'days' | 'hours';
  databaseId: string;
  databaseUrl?: string;
  mcpServerName: string; // MCP経由でのNotion接続用（Desktop/Code専用）
  propertyMappings?: Record<string, string>;
  skillsFallback?: boolean; // Skills版での手動コピー推奨フラグ
}

interface GoogleCalendarConfig {
  enabled: boolean;
  method: CalendarMethod;
  platformAdaptive: boolean;
  // ネイティブ統合用（iOS/iPadOS Skills）
  preferNativeAccess: boolean;
  nativeCalendarPermission?: boolean;
  // AppleScript用（macOS MCP）
  appleScriptFallback: boolean;
  // 代替手段用
  icalUrl?: string;
  outlookIntegration?: boolean;
  manualInputFallback: boolean;
  // 従来のAPI設定（使用されない可能性が高い）
  defaultCalendar?: string;
  conflictDetection: boolean;
  lookAheadDays: number;
  // Skills版専用設定
  skillsCalendarIntegration?: SkillsCalendarConfig;
}

interface SkillsCalendarConfig {
  useNativeCalendarAPI: boolean;
  cacheEvents: boolean;
  cacheDurationMinutes: number;
  requestPermissionFlow: boolean;
}
```

## プラットフォーム別実装戦略

### 1. Desktop/Code (MCP Server)

**特徴:**
- 完全機能の実装
- ファイルシステムアクセス
- 外部プロセス実行（AppleScript）
- MCP経由でのNotion統合

**実装アプローチ:**
```typescript
// MCP Server Entry Point
class SageMCPServer {
  private setupWizard: SetupWizard;
  private taskAnalyzer: TaskAnalyzer;
  private configManager: ConfigManager;
  private integrations: {
    appleReminders: AppleRemindersService;
    calendar: CalendarService;
    notion: NotionMCPService;
  };
  
  async initialize(): Promise<void> {
    // ファイルベース設定の読み込み
    await this.configManager.loadFromFile('~/.sage/config.json');
    
    // 統合サービスの初期化
    await this.initializeIntegrations();
  }
  
  // MCPツールの実装
  async handleAnalyzeTasks(params: any): Promise<any> {
    const tasks = await this.taskAnalyzer.analyzeTasks(params.tasks, this.config);
    return this.formatMCPResponse(tasks);
  }
}
```

### 2. iOS/iPadOS (Claude Skills)

**特徴:**
- ネイティブ統合の活用
- セッションベース設定
- 権限管理の考慮
- 制限された外部統合

**実装アプローチ:**
```typescript
// Skills Entry Point
class SageSkillsiOS {
  private nativeIntegration: NativeIntegrationService;
  private sessionConfig: Partial<UserConfig>;
  
  async initialize(): Promise<void> {
    // セッション設定の初期化
    this.sessionConfig = await this.loadSessionConfig();
    
    // 権限状態の確認
    const permissions = await this.nativeIntegration.checkPermissions();
    if (!permissions.reminders || !permissions.calendar) {
      await this.requestPermissions();
    }
  }
  
  async analyzeTasksWithNativeIntegration(input: string): Promise<TaskAnalysisResult> {
    // 1. タスク分析（共通ロジック）
    const analysis = await this.analyzeCore(input);
    
    // 2. ネイティブカレンダーから空き時間取得
    const availableSlots = await this.nativeIntegration.findAvailableSlots({
      taskDuration: analysis.totalEstimatedMinutes
    });
    
    // 3. ネイティブRemindersに直接作成
    const reminders = await Promise.all(
      analysis.tasks.map(task => 
        this.nativeIntegration.createReminder({
          title: task.title,
          dueDate: task.suggestedTimeSlot?.start,
          priority: task.priority
        })
      )
    );
    
    // 4. Notion Connector経由でのページ作成（長期タスク）
    const notionPages = await Promise.all(
      analysis.tasks
        .filter(task => this.isLongTermTask(task))
        .map(task => this.createNotionPage(task))
    );
    
    return {
      ...analysis,
      availableSlots,
      remindersCreated: reminders,
      notionPagesCreated: notionPages,
      integrationMethod: 'native'
    };
  }
  
  private async createNotionPage(task: AnalyzedTask): Promise<NotionPageResult> {
    try {
      // Claude iOSアプリのNotion Connector統合を使用
      const result = await window.claude?.notion?.createPage({
        databaseId: this.sessionConfig.notion?.databaseId,
        title: task.original.title,
        properties: {
          Priority: { select: { name: task.priority } },
          'Due Date': { date: { start: task.original.deadline } },
          Stakeholders: { multi_select: task.stakeholders.map(s => ({ name: s })) }
        }
      });
      
      return {
        success: true,
        pageId: result.id,
        pageUrl: result.url
      };
    } catch (error) {
      return {
        success: false,
        error: `Notion Connector統合エラー: ${error.message}`
      };
    }
  }
}
```

### 3. Web (Claude Skills - Limited)

**特徴:**
- 基本機能のみ
- セッション限定設定
- 手動統合推奨
- 軽量実装

**実装アプローチ:**
```typescript
// Web Skills Entry Point
class SageSkillsWeb {
  private sessionConfig: BasicConfig;
  
  async analyzeTasksBasic(input: string): Promise<BasicTaskAnalysis> {
    // 基本的なタスク分析のみ
    const tasks = await this.splitAndAnalyzeTasks(input);
    
    return {
      tasks,
      recommendations: this.generateBasicRecommendations(tasks),
      manualSteps: this.generateManualIntegrationSteps(tasks),
      upgradePrompt: "より高度な機能はClaude DesktopまたはiOS/iPadOSアプリをご利用ください"
    };
  }
  
  private generateManualIntegrationSteps(tasks: Task[]): ManualStep[] {
    return tasks.map(task => ({
      task: task.title,
      steps: [
        `Apple Remindersに手動で追加: "${task.title}"`,
        `期限: ${task.deadline}`,
        `優先度: ${task.priority}`,
        `見積時間: ${task.estimatedMinutes}分`
      ]
    }));
  }
}
```

### 4. プラットフォーム検出とアダプター選択

```typescript
class PlatformDetector {
  static async detect(): Promise<PlatformInfo> {
    // MCP環境の検出
    if (typeof process !== 'undefined' && process.env.MCP_SERVER) {
      return {
        type: 'desktop_mcp',
        capabilities: ['file_system', 'external_process', 'mcp_integration'],
        nativeIntegrations: ['applescript', 'notion_mcp']
      };
    }
    
    // Claude Skills環境の検出
    if (typeof window !== 'undefined' && window.claude) {
      const userAgent = navigator.userAgent;
      
      if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        return {
          type: userAgent.includes('iPad') ? 'ipados_skills' : 'ios_skills',
          capabilities: ['native_reminders', 'native_calendar', 'session_storage'],
          nativeIntegrations: ['reminders', 'calendar']
        };
      }
      
      return {
        type: 'web_skills',
        capabilities: ['session_storage'],
        nativeIntegrations: []
      };
    }
    
    throw new Error('Unsupported platform');
  }
}

// ファクトリーパターンでの実装選択
class SageFactory {
  static async create(): Promise<SageCore> {
    const platform = await PlatformDetector.detect();
    
    switch (platform.type) {
      case 'desktop_mcp':
        return new SageMCPServer();
      case 'ios_skills':
      case 'ipados_skills':
        return new SageSkillsiOS();
      case 'web_skills':
        return new SageSkillsWeb();
      default:
        throw new Error(`Unsupported platform: ${platform.type}`);
    }
  }
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