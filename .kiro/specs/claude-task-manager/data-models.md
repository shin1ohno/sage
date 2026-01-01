# データモデル

このドキュメントでは、sageシステムで使用されるコアデータモデルと設定モデルを定義します。

## Core Models

### Task

タスクの基本情報を表すモデル。

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
```

### UserConfig

ユーザー設定のルートモデル。すべての設定情報を含む。

```typescript
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
```

### UserProfile

ユーザーのプロフィール情報。

```typescript
interface UserProfile {
  name: string;
  email?: string;
  timezone: string;
  role?: string;
}
```

### CalendarConfig

カレンダー関連の設定。

```typescript
interface CalendarConfig {
  workingHours: {
    start: string;      // 例: "09:00"
    end: string;        // 例: "18:00"
  };
  meetingHeavyDays: string[];    // 例: ["Tuesday", "Thursday"]
  deepWorkDays: string[];        // 例: ["Monday", "Wednesday", "Friday"]
  deepWorkBlocks: DeepWorkBlock[];
  timeZone: string;              // 例: "Asia/Tokyo"
}

interface DeepWorkBlock {
  day: string;           // 例: "Monday"
  startHour: number;     // 例: 9
  endHour: number;       // 例: 12
  description: string;   // 例: "Morning deep work session"
}
```

## Configuration Models

### PriorityRules

優先度判定のルール設定。

```typescript
interface PriorityRules {
  p0Conditions: PriorityCondition[];
  p1Conditions: PriorityCondition[];
  p2Conditions: PriorityCondition[];
  defaultPriority: Priority;
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

### EstimationConfig

時間見積もりの設定。

```typescript
interface EstimationConfig {
  simpleTaskMinutes: number;      // 例: 25
  mediumTaskMinutes: number;      // 例: 50
  complexTaskMinutes: number;     // 例: 75
  projectTaskMinutes: number;     // 例: 120
  keywordMapping: Record<string, string[]>;
  userAdjustments?: Record<string, number>;
}
```

### RemindersConfig

リマインダー関連の設定。

```typescript
interface RemindersConfig {
  defaultTypes: string[];    // 例: ["1d_before", "3h_before"]
  weeklyReview: {
    enabled: boolean;
    day: string;             // 例: "Friday"
    time: string;            // 例: "17:00"
    description: string;
  };
  customRules: ReminderRule[];
}

interface ReminderRule {
  condition: string;
  reminders: string[];
  description?: string;
}
```

### TeamConfig

チームメンバー関連の設定。

```typescript
interface TeamConfig {
  manager?: TeamMember;
  frequentCollaborators: TeamMember[];
  departments: string[];
}

interface TeamMember {
  name: string;
  role: 'manager' | 'lead' | 'team' | 'collaborator';
  keywords: string[];
  priority?: number;
}
```

### IntegrationsConfig

外部サービス統合の設定。

```typescript
interface IntegrationsConfig {
  appleReminders: AppleRemindersConfig;
  notion: NotionConfig;
  googleCalendar: GoogleCalendarConfig;
  platform: PlatformSpecificConfig;
}

interface PlatformSpecificConfig {
  type: 'desktop_mcp' | 'remote_mcp';
  fallbackMethods: string[];
}
```

### AppleRemindersConfig

Apple Reminders統合の設定。

```typescript
interface AppleRemindersConfig {
  enabled: boolean;
  threshold: number;               // 例: 7
  unit: 'days' | 'hours';          // 例: "days"
  defaultList: string;             // 例: "Today"
  lists: Record<string, string>;   // タスクタイプ別リストマッピング
  appleScriptEnabled: boolean;     // macOSでAppleScript使用
}
```

### NotionConfig

Notion統合の設定。

```typescript
interface NotionConfig {
  enabled: boolean;
  threshold: number;                      // 例: 8
  unit: 'days' | 'hours';                 // 例: "days"
  databaseId: string;                     // Notion Database ID
  databaseUrl?: string;                   // Database URL（参照用）
  mcpServerName: string;                  // 例: "notion"
  propertyMappings?: Record<string, string>;  // カスタムプロパティマッピング
}
```

### GoogleCalendarConfig

Google Calendar統合の設定（将来の拡張用）。

```typescript
interface GoogleCalendarConfig {
  enabled: boolean;
  method: CalendarMethod;
  // AppleScript用（macOS MCP）
  appleScriptEnabled: boolean;
  // 代替手段用
  icalUrl?: string;
  manualInputFallback: boolean;
  defaultCalendar?: string;
  conflictDetection: boolean;
  lookAheadDays: number;              // 例: 7
}

type CalendarMethod = 'native' | 'applescript' | 'caldav' | 'ical_url' | 'manual_input' | 'outlook';
```

### PreferencesConfig

ユーザー個人設定。

```typescript
interface PreferencesConfig {
  language: 'ja' | 'en';
  dateFormat: string;               // 例: "YYYY-MM-DD"
  timeFormat: '12h' | '24h';        // 例: "24h"
  notifications: boolean;
  autoSync: boolean;
  theme?: 'light' | 'dark' | 'auto';
}
```

## Analysis Models

### AnalyzedTask

分析済みタスクの結果モデル。

```typescript
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

### Reminder

リマインダー情報。

```typescript
interface Reminder {
  type: string;               // 例: "1d_before", "3h_before"
  datetime: string;           // ISO 8601形式
  description?: string;
}
```

### TimeSlot

時間枠情報。

```typescript
interface TimeSlot {
  start: string;             // ISO 8601形式
  end: string;               // ISO 8601形式
  durationMinutes: number;
}
```

## MCP Models

### MCPRequest

MCP プロトコルのリクエストモデル。

```typescript
interface MCPRequest {
  method: string;
  params: any;
  id: string | number;
  jsonrpc: '2.0';
  headers: Record<string, string>;
  userId?: string;
}
```

### MCPResponse

MCP プロトコルのレスポンスモデル。

```typescript
interface MCPResponse {
  result?: any;
  error?: MCPError;
  id: string | number;
  jsonrpc: '2.0';
}

interface MCPError {
  code: number;
  message: string;
  data?: any;
}
```

## Remote MCP Models

### RemoteMCPConfig

Remote MCPサーバーの設定。

```typescript
interface RemoteMCPConfig {
  port: number;                    // 例: 3000
  host: string;                    // 例: "0.0.0.0"
  httpsEnabled: boolean;
  corsOrigins: string[];
  oauth: OAuthConfig;
  rateLimit: RateLimitConfig;
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  provider: 'claude' | 'custom';
}

interface RateLimitConfig {
  requestsPerMinute: number;       // 例: 60
  requestsPerHour: number;         // 例: 1000
  burstLimit: number;              // 例: 10
  whitelistedIPs: string[];
}
```

## 設定ファイル例

### ~/.sage/config.json

```json
{
  "version": "1.0.0",
  "createdAt": "2025-01-01T00:00:00Z",
  "lastUpdated": "2025-01-01T00:00:00Z",
  "user": {
    "name": "Taro Yamada",
    "timezone": "Asia/Tokyo"
  },
  "calendar": {
    "workingHours": {
      "start": "09:00",
      "end": "18:00"
    },
    "deepWorkDays": ["Monday", "Wednesday", "Friday"],
    "meetingHeavyDays": ["Tuesday", "Thursday"],
    "deepWorkBlocks": [
      {
        "day": "Monday",
        "startHour": 9,
        "endHour": 12,
        "description": "Morning deep work"
      }
    ],
    "timeZone": "Asia/Tokyo"
  },
  "priorityRules": {
    "p0Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 1,
        "unit": "days",
        "description": "Due within 1 day"
      }
    ],
    "p1Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 3,
        "unit": "days",
        "description": "Due within 3 days"
      }
    ],
    "p2Conditions": [],
    "defaultPriority": "P3"
  },
  "estimation": {
    "simpleTaskMinutes": 25,
    "mediumTaskMinutes": 50,
    "complexTaskMinutes": 75,
    "projectTaskMinutes": 120,
    "keywordMapping": {
      "simple": ["quick", "simple", "easy"],
      "medium": ["review", "update"],
      "complex": ["implement", "design", "refactor"],
      "project": ["project", "initiative", "program"]
    }
  },
  "integrations": {
    "appleReminders": {
      "enabled": true,
      "threshold": 7,
      "unit": "days",
      "defaultList": "Today",
      "lists": {},
      "appleScriptEnabled": true
    },
    "notion": {
      "enabled": true,
      "threshold": 8,
      "unit": "days",
      "databaseId": "your-database-id",
      "mcpServerName": "notion"
    }
  },
  "preferences": {
    "language": "ja",
    "dateFormat": "YYYY-MM-DD",
    "timeFormat": "24h",
    "notifications": true,
    "autoSync": true
  }
}
```
