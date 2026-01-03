# コンポーネント設計

このドキュメントでは、sageシステムの主要コンポーネントとそのインターフェースを定義します。

## コンポーネント一覧

| ID | コンポーネント | 責任 |
|----|-------------|------|
| 0 | PlatformAdapter | プラットフォーム検出と適切なアダプターの選択 |
| 1 | SetupWizard | プラットフォーム適応型の初回セットアップウィザード |
| 2 | TaskSplitter | 複雑なタスクや複数タスクの分割 |
| 3 | TaskAnalyzer | タスクの包括的分析 |
| 4 | PriorityEngine | 優先度判定ロジック |
| 5 | TimeEstimator | 所要時間見積もり |
| 6 | StakeholderExtractor | 関係者の識別と抽出 |
| 7 | AppleRemindersService | プラットフォーム適応型Apple Reminders統合 |
| 8 | CalendarService | プラットフォーム適応型カレンダー統合と空き時間検出 |
| 9 | ReminderManager | リマインド設定と管理 |
| 10 | RemoteMCPServer | Remote MCP Server実装とHTTP/WebSocket通信 |
| 11 | CloudConfigManager | クラウドベースの設定管理とユーザーデータ同期 |
| 12 | WebAPIIntegrationService | Web API経由での外部サービス統合（Remote MCP専用） |
| 13 | TodoListManager | TODOリスト管理 |
| 14 | TaskSynchronizer | 複数ソース間でのタスク同期と競合解決 |
| 15 | NotionMCPService | Notion MCP統合 |
| 16 | WorkingCadenceService | ユーザーの勤務リズム取得と推奨事項生成 |
| 17 | GoogleCalendarService | Google Calendar API v3統合 |
| 18 | GoogleOAuthHandler | Google OAuth 2.0フロー管理 |
| 19 | CalendarSourceManager | マルチソースカレンダー管理とフォールバック |

## 0. PlatformAdapter

**責任:** プラットフォーム検出と適切なアダプターの選択

```typescript
interface PlatformAdapter {
  detectPlatform(): Promise<PlatformInfo>;
  createSageInstance(): Promise<SageCore>;
  getAvailableFeatures(): FeatureSet;
}

interface PlatformInfo {
  type: 'desktop_mcp' | 'remote_mcp';
  version: string;
  capabilities: PlatformCapability[];
  integrations: string[];
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
```

## 1. SetupWizard

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
  platformOptimized: boolean;
}

interface Question {
  id: string;
  text: string;
  type: 'text' | 'select' | 'multiselect' | 'time' | 'days';
  options?: string[];
  defaultValue?: any;
  helpText?: string;
  validation?: ValidationRule[];
  platformSpecific?: string[];
}
```

## 2. TaskSplitter

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
```

## 3. TaskAnalyzer

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

## 4. PriorityEngine

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

## 5. TimeEstimator

**責任:** 所要時間見積もり

```typescript
interface TimeEstimator {
  estimateDuration(task: Task, config: EstimationConfig): number;
  analyzeKeywords(text: string): ComplexityKeywords;
}

interface EstimationConfig {
  simpleTaskMinutes: number;      // デフォルト: 25分
  mediumTaskMinutes: number;      // デフォルト: 50分
  complexTaskMinutes: number;     // デフォルト: 75分
  projectTaskMinutes: number;     // デフォルト: 175分
  keywordMapping: Record<string, string[]>;
  userAdjustments?: Record<string, number>;
}
```

#### デフォルト時間マッピング

| 複雑度レベル | デフォルト時間 | 説明 |
|------------|--------------|------|
| Simple（シンプル） | 25分 | 簡単なタスク（確認、レビュー、返信など） |
| Medium（標準） | 50分 | 標準的なタスク（実装、修正、更新など） |
| Complex（複雑） | 75分 | 複雑なタスク（設計、リファクタ、統合など） |
| Project（プロジェクト） | 175分 | プロジェクト規模のタスク（構築、アーキテクチャなど） |

**注:** 全ての時間は25分の倍数として定義されています。これにより、ポモドーロテクニック（25分単位）との整合性が取れます。

#### 見積もりアルゴリズム

1. **キーワードマッチング**: タスクのタイトルと説明からキーワードを検出し、複雑度レベル（Simple/Medium/Complex/Project）を決定
2. **ベース時間の設定**: 決定された複雑度レベルに応じてベース時間を設定
3. **修飾子の適用**:
   - 長さ修飾子: タスクの文字数に応じて0.75〜1.5倍に調整
   - 特殊修飾子: ミーティング、デバッグ、ドキュメント、テスト等のキーワードで1.25〜1.5倍に調整
4. **丸め処理**: 最終的な見積もり時間を最も近い25分の倍数に丸める

**重要:** 修飾子適用後、システムは**常に25分の倍数に丸める**ため、全ての見積もり結果は25, 50, 75, 100, 125, 150, 175, 200分などとなります。これにより、ポモドーロテクニックとの整合性が保たれ、スケジューリングが容易になります。

## 6. StakeholderExtractor

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

## 7. AppleRemindersService

**責任:** プラットフォーム適応型Apple Reminders統合

```typescript
interface AppleRemindersService {
  createReminder(request: ReminderRequest): Promise<ReminderResult>;
  detectPlatform(): Promise<PlatformInfo>;
  isAvailable(): Promise<boolean>;
}

interface ReminderRequest {
  title: string;
  notes?: string;
  dueDate?: string;
  list?: string;
  priority?: 'low' | 'medium' | 'high';
  alarms?: AlarmConfig[];
}

interface ReminderResult {
  success: boolean;
  method: 'native' | 'applescript' | 'fallback';
  reminderId?: string;
  error?: string;
  platformInfo?: PlatformInfo;
}
```

## 8. CalendarService

**責任:** プラットフォーム適応型カレンダー統合と空き時間検出

```typescript
interface CalendarService {
  findAvailableSlots(request: SlotRequest, config: CalendarConfig): Promise<AvailableSlot[]>;
  fetchEvents(startDate: string, endDate: string): Promise<CalendarEvent[]>;
  listEvents(request: ListEventsRequest): Promise<ListEventsResponse>;
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
```

## 9. ReminderManager

**責任:** リマインド設定と管理

```typescript
interface ReminderManager {
  setReminder(request: ReminderRequest, config: UserConfig): Promise<ReminderResult>;
  determineDestination(task: Task, config: UserConfig): 'apple' | 'notion';
  calculateReminderTimes(deadline: string, types: string[]): ReminderTime[];
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

## 10. RemoteMCPServer

**責任:** Remote MCP Server実装とHTTP/WebSocket通信

```typescript
interface RemoteMCPServer {
  startServer(port: number, config: RemoteMCPConfig): Promise<void>;
  handleMCPRequest(request: MCPRequest): Promise<MCPResponse>;
  authenticateUser(token: string): Promise<AuthResult>;
  validateRequest(request: MCPRequest): Promise<ValidationResult>;
}

interface RemoteMCPConfig {
  port: number;
  host: string;
  httpsEnabled: boolean;
  corsOrigins: string[];
  oauth: OAuthConfig;
  rateLimit: RateLimitConfig;
}

interface MCPRequest {
  method: string;
  params: any;
  id: string | number;
  jsonrpc: '2.0';
  headers: Record<string, string>;
  userId?: string;
}

interface MCPResponse {
  result?: any;
  error?: MCPError;
  id: string | number;
  jsonrpc: '2.0';
}
```

## 11. CloudConfigManager

**責任:** クラウドベースの設定管理とユーザーデータ同期

```typescript
interface CloudConfigManager {
  saveUserConfig(userId: string, config: UserConfig): Promise<SaveResult>;
  loadUserConfig(userId: string): Promise<UserConfig>;
  syncUserData(userId: string): Promise<SyncResult>;
  migrateFromLocal(localConfig: UserConfig, userId: string): Promise<MigrationResult>;
}

interface SaveResult {
  success: boolean;
  version: string;
  lastModified: string;
  error?: string;
}

interface SyncResult {
  success: boolean;
  conflictsResolved: number;
  lastSyncTime: string;
  error?: string;
}
```

## 12. WebAPIIntegrationService

**責任:** Web API経由での外部サービス統合（Remote MCP専用）

```typescript
interface WebAPIIntegrationService {
  // Apple Services (iCloud Web API)
  createAppleReminder(userId: string, request: ReminderRequest): Promise<ReminderResult>;
  getAppleCalendarEvents(userId: string, dateRange: DateRange): Promise<CalendarEvent[]>;

  // Notion Direct API
  createNotionPage(userId: string, request: NotionPageRequest): Promise<NotionPageResult>;
  getNotionTasks(userId: string, filter?: NotionFilter): Promise<NotionTask[]>;

  // Google Calendar API
  getGoogleCalendarEvents(userId: string, dateRange: DateRange): Promise<CalendarEvent[]>;

  // Microsoft Outlook API
  getOutlookCalendarEvents(userId: string, dateRange: DateRange): Promise<CalendarEvent[]>;
}
```

## 13. TodoListManager

**責任:** TODOリスト管理

```typescript
interface TodoListManager {
  listTodos(filter?: TodoFilter): Promise<TodoItem[]>;
  updateTaskStatus(taskId: string, status: TaskStatus, source: TaskSource): Promise<UpdateResult>;
  getTodaysTasks(): Promise<TodoItem[]>;
  syncTaskAcrossSources(taskId: string): Promise<SyncResult>;
}

interface TodoItem {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: TaskStatus;
  dueDate?: string;
  createdDate: string;
  updatedDate: string;
  source: TaskSource;
  sourceId: string;
  tags: string[];
  estimatedMinutes?: number;
  stakeholders?: string[];
}

type TaskSource = 'apple_reminders' | 'notion' | 'manual';
type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';
```

## 14. TaskSynchronizer

**責任:** 複数ソース間でのタスク同期と競合解決

```typescript
interface TaskSynchronizer {
  syncAllTasks(): Promise<SyncAllResult>;
  resolveConflicts(conflicts: TaskConflict[]): Promise<ConflictResolution>;
  detectDuplicates(): Promise<DuplicateTask[]>;
  mergeDuplicates(duplicates: DuplicateTask[]): Promise<MergeResult>;
}

interface SyncAllResult {
  totalTasks: number;
  syncedTasks: number;
  conflicts: TaskConflict[];
  errors: SyncError[];
  duration: number;
}

interface TaskConflict {
  field: string;
  appleRemindersValue: any;
  notionValue: any;
  resolvedValue: any;
  resolution: 'apple_reminders' | 'notion' | 'manual';
}
```

## 15. NotionMCPService

**責任:** Notion MCP統合

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
```

## 16. WorkingCadenceService

**責任:** ユーザーの勤務リズム（Working Cadence）の取得と推奨事項の生成

```typescript
interface WorkingCadenceService {
  getWorkingCadence(request?: GetWorkingCadenceRequest): Promise<WorkingCadenceResult>;
  getDayType(dayOfWeek: string): 'deep-work' | 'meeting-heavy' | 'normal';
  getDayOfWeek(date: string): string;
  generateRecommendations(config: CalendarConfig): SchedulingRecommendation[];
}

interface GetWorkingCadenceRequest {
  dayOfWeek?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  date?: string; // ISO 8601形式
}

interface WorkingCadenceResult {
  success: boolean;
  user: { name: string; timezone: string; };
  workingHours: { start: string; end: string; totalMinutes: number; };
  weeklyPattern: {
    deepWorkDays: string[];
    meetingHeavyDays: string[];
    normalDays: string[];
  };
  deepWorkBlocks: DeepWorkBlockInfo[];
  weeklyReview?: { enabled: boolean; day: string; time: string; };
  specificDay?: {
    date?: string;
    dayOfWeek: string;
    dayType: 'deep-work' | 'meeting-heavy' | 'normal';
    deepWorkBlocks: DeepWorkBlockInfo[];
    recommendations: string[];
  };
  recommendations: SchedulingRecommendation[];
  summary: string;
}

interface SchedulingRecommendation {
  type: 'deep-work' | 'meeting' | 'quick-task' | 'review';
  recommendation: string;
  bestDays: string[];
  bestTimeSlots?: string[];
  reason: string;
}
```

## 17. GoogleCalendarService

**責任:** Google Calendar API v3との統合、イベントCRUD操作

```typescript
interface GoogleCalendarService {
  // 認証
  authenticate(): Promise<void>;
  refreshToken(): Promise<void>;
  isAvailable(): Promise<boolean>;

  // イベント操作
  listEvents(request: ListEventsRequest): Promise<CalendarEvent[]>;
  createEvent(request: CreateEventRequest, calendarId?: string): Promise<CalendarEvent>;
  updateEvent(eventId: string, updates: Partial<CreateEventRequest>): Promise<CalendarEvent>;
  deleteEvent(eventId: string): Promise<void>;
  deleteEventsBatch(eventIds: string[]): Promise<{ deleted: number }>;

  // 招待返信
  respondToEvent(eventId: string, response: 'accepted' | 'declined' | 'tentative'): Promise<void>;

  // カレンダー一覧
  listCalendars(): Promise<CalendarInfo[]>;
}

interface CalendarInfo {
  id: string;
  name: string;
  source: 'eventkit' | 'google';
  isPrimary: boolean;
  color?: string;
  accessRole?: 'owner' | 'writer' | 'reader';
}
```

## 18. GoogleOAuthHandler

**責任:** Google OAuth 2.0フローの管理、トークン交換

```typescript
interface GoogleOAuthHandler {
  // OAuth フロー
  getAuthorizationUrl(redirectUri: string): Promise<string>;
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  // トークン管理
  storeTokens(tokens: OAuthTokens): Promise<void>;
  getTokens(): Promise<OAuthTokens | null>;
  revokeTokens(): Promise<void>;

  // 検証
  validateToken(accessToken: string): Promise<boolean>;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string[];
}
```

## 19. CalendarSourceManager

**責任:** 複数カレンダーソースの管理、自動選択、フォールバック

```typescript
interface CalendarSourceManager {
  // ソース管理
  detectAvailableSources(): Promise<{ eventkit: boolean; google: boolean }>;
  enableSource(source: 'eventkit' | 'google'): Promise<void>;
  disableSource(source: 'eventkit' | 'google'): Promise<void>;
  getEnabledSources(): ('eventkit' | 'google')[];

  // イベント操作（統合）
  getEvents(startDate: string, endDate: string, calendarId?: string): Promise<CalendarEvent[]>;
  createEvent(request: CreateEventRequest, preferredSource?: 'eventkit' | 'google'): Promise<CalendarEvent>;
  deleteEvent(eventId: string, source?: 'eventkit' | 'google'): Promise<void>;

  // 空き時間スロット
  findAvailableSlots(request: FindSlotsRequest): Promise<AvailableSlot[]>;

  // 同期（両方有効な場合のみ）
  syncCalendars(): Promise<SyncResult>;
  getSyncStatus(): Promise<SyncStatus>;

  // ヘルスチェック
  healthCheck(): Promise<{ eventkit: boolean; google: boolean }>;
}

interface FindSlotsRequest {
  startDate: string;
  endDate: string;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  workingHours?: { start: string; end: string };
}

interface SyncResult {
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  conflicts: Array<{ eventId: string; reason: string; resolution: string }>;
  errors: Array<{ source: 'eventkit' | 'google'; error: string }>;
  timestamp: string;
}
```

## コンポーネント依存関係

```mermaid
graph TD
    PlatformAdapter --> SetupWizard
    PlatformAdapter --> TaskAnalyzer

    SetupWizard --> CloudConfigManager

    TaskAnalyzer --> TaskSplitter
    TaskAnalyzer --> PriorityEngine
    TaskAnalyzer --> TimeEstimator
    TaskAnalyzer --> StakeholderExtractor

    ReminderManager --> AppleRemindersService
    ReminderManager --> NotionMCPService

    TaskAnalyzer --> CalendarSourceManager
    TaskAnalyzer --> WorkingCadenceService

    CalendarSourceManager --> CalendarService
    CalendarSourceManager --> GoogleCalendarService
    GoogleCalendarService --> GoogleOAuthHandler

    TodoListManager --> TaskSynchronizer
    TodoListManager --> AppleRemindersService
    TodoListManager --> NotionMCPService

    RemoteMCPServer --> CloudConfigManager
    RemoteMCPServer --> WebAPIIntegrationService

    style CalendarSourceManager fill:#f9f,stroke:#333,stroke-width:2px
    style GoogleCalendarService fill:#bbf,stroke:#333,stroke-width:2px
    style GoogleOAuthHandler fill:#bbf,stroke:#333,stroke-width:2px
```
