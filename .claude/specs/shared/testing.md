# テスト戦略

このドキュメントでは、sageシステムのテスト戦略とベストプラクティスを定義します。

## テストピラミッド

```
       ┌─────────────┐
       │   E2E Tests │  ← 少数、高コスト
       ├─────────────┤
       │Integration  │  ← 中程度
       │    Tests    │
       ├─────────────┤
       │    Unit     │  ← 多数、低コスト
       │    Tests    │
       └─────────────┘
```

### 目標割合

| テストタイプ | 割合 | 実行速度 | 例 |
|------------|-----|---------|---|
| Unit Tests | 70% | 高速 | 個別関数・クラステスト |
| Integration Tests | 20% | 中速 | 外部サービス統合テスト |
| E2E Tests | 10% | 低速 | フルワークフローテスト |

## ユニットテスト

### テストフレームワーク

```typescript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### 優先度判定エンジンのテスト

```typescript
// tests/unit/priority.test.ts
import { PriorityEngine } from '../../src/utils/priority';

describe('PriorityEngine', () => {
  let engine: PriorityEngine;

  beforeEach(() => {
    engine = new PriorityEngine();
  });

  describe('determinePriority', () => {
    it('should return P0 for tasks due within 1 day', () => {
      const task = {
        title: 'Urgent task',
        deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      };

      const rules = {
        p0Conditions: [
          { type: 'deadline', operator: '<', value: 1, unit: 'days' }
        ],
        p1Conditions: [],
        p2Conditions: [],
        defaultPriority: 'P3'
      };

      const priority = engine.determinePriority(task, rules);
      expect(priority).toBe('P0');
    });

    it('should return P1 for tasks with manager keyword', () => {
      const task = {
        title: 'Review document for manager',
        deadline: null
      };

      const rules = {
        p0Conditions: [],
        p1Conditions: [
          { type: 'keyword', operator: 'contains', value: 'manager' }
        ],
        p2Conditions: [],
        defaultPriority: 'P3'
      };

      const priority = engine.determinePriority(task, rules);
      expect(priority).toBe('P1');
    });

    it('should return default priority when no conditions match', () => {
      const task = {
        title: 'Regular task',
        deadline: null
      };

      const rules = {
        p0Conditions: [],
        p1Conditions: [],
        p2Conditions: [],
        defaultPriority: 'P3'
      };

      const priority = engine.determinePriority(task, rules);
      expect(priority).toBe('P3');
    });
  });
});
```

### 時間見積もりのテスト

```typescript
// tests/unit/estimation.test.ts
import { TimeEstimator } from '../../src/utils/estimation';

describe('TimeEstimator', () => {
  let estimator: TimeEstimator;

  beforeEach(() => {
    const config = {
      simpleTaskMinutes: 25,
      mediumTaskMinutes: 50,
      complexTaskMinutes: 75,
      projectTaskMinutes: 120,
      keywordMapping: {
        simple: ['quick', 'simple', 'easy'],
        medium: ['review', 'update'],
        complex: ['implement', 'design', 'refactor'],
        project: ['project', 'initiative']
      }
    };
    estimator = new TimeEstimator(config);
  });

  it('should estimate 25 minutes for simple tasks', () => {
    const task = { title: 'Quick fix for login bug' };
    const minutes = estimator.estimateDuration(task);
    expect(minutes).toBe(25);
  });

  it('should estimate 50 minutes for medium tasks', () => {
    const task = { title: 'Review pull request' };
    const minutes = estimator.estimateDuration(task);
    expect(minutes).toBe(50);
  });

  it('should estimate 75 minutes for complex tasks', () => {
    const task = { title: 'Implement new authentication flow' };
    const minutes = estimator.estimateDuration(task);
    expect(minutes).toBe(75);
  });
});
```

### タスク分割のテスト

```typescript
// tests/unit/task-splitter.test.ts
import { TaskSplitter } from '../../src/utils/task-splitter';

describe('TaskSplitter', () => {
  let splitter: TaskSplitter;

  beforeEach(() => {
    splitter = new TaskSplitter();
  });

  it('should split multiple comma-separated tasks', async () => {
    const input = 'タスク1、タスク2、タスク3を実行する';
    const result = await splitter.splitTasks(input);

    expect(result.splitTasks).toHaveLength(3);
    expect(result.splitTasks[0].title).toBe('タスク1');
    expect(result.splitTasks[1].title).toBe('タスク2');
    expect(result.splitTasks[2].title).toBe('タスク3');
  });

  it('should detect complex tasks and suggest splits', async () => {
    const task = {
      title: 'Implement user authentication system with OAuth2 and JWT'
    };

    const analysis = await splitter.analyzeComplexity(task);

    expect(analysis.isComplex).toBe(true);
    expect(analysis.complexity).toBe('project');
    expect(analysis.suggestedSplits).toBeDefined();
    expect(analysis.suggestedSplits!.length).toBeGreaterThan(1);
  });
});
```

## 統合テスト

### Apple Reminders統合テスト

```typescript
// tests/integration/apple-reminders.test.ts
import { AppleRemindersService } from '../../src/integrations/apple-reminders';

describe('AppleRemindersService Integration', () => {
  let service: AppleRemindersService;

  beforeEach(() => {
    service = new AppleRemindersService();
  });

  it('should create reminder on macOS', async () => {
    if (process.platform !== 'darwin') {
      return; // Skip on non-macOS
    }

    const request = {
      title: 'Test reminder',
      notes: 'This is a test',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      list: 'Today'
    };

    const result = await service.createReminder(request);

    expect(result.success).toBe(true);
    expect(result.method).toBe('applescript');
    expect(result.reminderId).toBeDefined();
  });

  it('should detect platform correctly', async () => {
    const platform = await service.detectPlatform();

    if (process.platform === 'darwin') {
      expect(platform.platform).toBe('macos');
      expect(platform.supportsAppleScript).toBe(true);
      expect(platform.recommendedMethod).toBe('applescript');
    }
  });
});
```

### Notion MCP統合テスト

```typescript
// tests/integration/notion-mcp.test.ts
import { NotionMCPService } from '../../src/integrations/notion-mcp';

describe('NotionMCPService Integration', () => {
  let service: NotionMCPService;

  beforeAll(async () => {
    if (!process.env.NOTION_API_KEY) {
      throw new Error('NOTION_API_KEY environment variable is required for integration tests');
    }

    service = new NotionMCPService({
      databaseId: process.env.NOTION_TEST_DATABASE_ID!,
      mcpServerName: 'notion'
    });

    await service.connect();
  });

  afterAll(async () => {
    await service.disconnect();
  });

  it('should create a Notion page', async () => {
    const request = {
      databaseId: process.env.NOTION_TEST_DATABASE_ID!,
      title: 'Test Task from Integration Test',
      properties: {
        Title: { title: [{ text: { content: 'Test Task' } }] },
        Priority: { select: { name: 'P2' } }
      }
    };

    const result = await service.createPage(request);

    expect(result.success).toBe(true);
    expect(result.pageId).toBeDefined();
    expect(result.pageUrl).toBeDefined();
  });

  it('should check availability', async () => {
    const available = await service.isAvailable();
    expect(available).toBe(true);
  });
});
```

### カレンダー統合テスト

```typescript
// tests/integration/calendar-service.test.ts
import { CalendarService } from '../../src/integrations/calendar-service';

describe('CalendarService Integration', () => {
  let service: CalendarService;

  beforeEach(() => {
    service = new CalendarService();
  });

  it('should fetch calendar events', async () => {
    if (process.platform !== 'darwin') {
      return; // Skip on non-macOS
    }

    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const events = await service.fetchEvents(startDate, endDate);

    expect(Array.isArray(events)).toBe(true);
    events.forEach(event => {
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('title');
      expect(event).toHaveProperty('start');
      expect(event).toHaveProperty('end');
    });
  });

  it('should find available slots', async () => {
    const request = {
      taskDuration: 60,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    const config = {
      workingHours: { start: '09:00', end: '18:00' },
      deepWorkDays: ['Monday', 'Wednesday', 'Friday'],
      meetingHeavyDays: ['Tuesday', 'Thursday']
    };

    const slots = await service.findAvailableSlots(request, config);

    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
  });
});
```

## E2Eテスト

### フルワークフローテスト

```typescript
// tests/e2e/full-workflow.test.ts
import { SageMCPServer } from '../../src/index';

describe('Full Workflow E2E', () => {
  let server: SageMCPServer;

  beforeAll(async () => {
    server = new SageMCPServer();
    await server.initialize();
  });

  afterAll(async () => {
    await server.shutdown();
  });

  it('should complete full task analysis workflow', async () => {
    const tasks = [
      {
        title: '緊急: 本日中にバグ修正',
        deadline: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'マネージャーとの1on1準備',
        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: '新機能の設計ドキュメント作成'
      }
    ];

    // 1. タスク分析
    const analyzed = await server.analyzeTasks(tasks);
    expect(analyzed).toHaveLength(3);

    // 2. 優先度チェック
    expect(analyzed[0].priority).toBe('P0');
    expect(analyzed[1].priority).toBe('P1');

    // 3. リマインダー作成
    for (const task of analyzed) {
      if (task.suggestedReminders.length > 0) {
        const result = await server.setReminder({
          taskTitle: task.original.title,
          reminderType: task.suggestedReminders[0].type,
          targetDate: task.original.deadline
        });

        expect(result.success).toBe(true);
      }
    }

    // 4. カレンダー空き時間検索
    const slots = await server.findAvailableSlots({
      taskDuration: analyzed[2].estimatedMinutes,
      preferredDays: ['Monday', 'Wednesday', 'Friday']
    });

    expect(slots.length).toBeGreaterThan(0);
  });
});
```

## モック・スタブ

### AppleScript モック

```typescript
// tests/mocks/applescript.mock.ts
jest.mock('node-applescript', () => ({
  execString: jest.fn((script: string, callback: Function) => {
    if (script.includes('Reminders')) {
      callback(null, 'x-apple-reminder://test-id');
    } else if (script.includes('Calendar')) {
      callback(null, JSON.stringify([
        {
          id: 'event-1',
          title: 'Test Event',
          start: '2025-01-15T10:00:00Z',
          end: '2025-01-15T11:00:00Z'
        }
      ]));
    } else {
      callback(new Error('Unknown AppleScript command'));
    }
  })
}));
```

### Notion MCP モック

```typescript
// tests/mocks/notion-mcp.mock.ts
export class MockNotionMCPService {
  async createPage(request: any): Promise<any> {
    return {
      success: true,
      pageId: 'mock-page-id',
      pageUrl: 'https://notion.so/mock-page-id'
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
```

## テスト実行

```bash
# すべてのテストを実行
npm test

# ユニットテストのみ
npm run test:unit

# 統合テストのみ
npm run test:integration

# E2Eテストのみ
npm run test:e2e

# カバレッジ付きで実行
npm run test:coverage

# ウォッチモード
npm run test:watch
```

## CI/CD統合

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_TEST_DATABASE_ID: ${{ secrets.NOTION_TEST_DATABASE_ID }}

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## テストベストプラクティス

### 1. AAA パターン (Arrange-Act-Assert)

```typescript
it('should calculate priority correctly', () => {
  // Arrange: テスト準備
  const engine = new PriorityEngine();
  const task = { title: 'Urgent task', deadline: '2025-01-15' };
  const rules = { /* ... */ };

  // Act: 実行
  const priority = engine.determinePriority(task, rules);

  // Assert: 検証
  expect(priority).toBe('P0');
});
```

### 2. テストの独立性

```typescript
// ❌ Bad: テスト間で状態を共有
let sharedState: any;

it('test 1', () => {
  sharedState = { value: 1 };
  expect(sharedState.value).toBe(1);
});

it('test 2', () => {
  // sharedStateに依存している
  expect(sharedState.value).toBe(1);
});

// ✅ Good: 各テストで独立した状態
it('test 1', () => {
  const state = { value: 1 };
  expect(state.value).toBe(1);
});

it('test 2', () => {
  const state = { value: 2 };
  expect(state.value).toBe(2);
});
```

### 3. 意味のあるテスト名

```typescript
// ❌ Bad
it('test 1', () => { /* ... */ });

// ✅ Good
it('should return P0 priority for tasks due within 1 day', () => { /* ... */ });
```

### 4. エッジケースのテスト

```typescript
describe('TimeEstimator', () => {
  it('should handle empty title', () => {
    const task = { title: '' };
    expect(() => estimator.estimateDuration(task)).toThrow();
  });

  it('should handle very long title', () => {
    const task = { title: 'a'.repeat(10000) };
    const minutes = estimator.estimateDuration(task);
    expect(minutes).toBeGreaterThan(0);
  });

  it('should handle null deadline', () => {
    const task = { title: 'Task', deadline: null };
    // Should not throw
    estimator.estimateDuration(task);
  });
});
```
