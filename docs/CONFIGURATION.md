# Configuration Guide

sage の設定オプションの詳細ガイドです。

## 設定ファイルの場所

```
~/.sage/config.json
```

## 設定の編集方法

### 方法1: セットアップウィザード（推奨）

```
sage のセットアップウィザードを開始してください
```

### 方法2: update_config ツール

```
sage の設定を更新してください:
- user.name を "山田太郎" に
- calendar.workingHours.start を "10:00" に
```

### 方法3: 直接編集

```bash
# エディタで開く
code ~/.sage/config.json
```

---

## 設定項目一覧

### user - ユーザー情報

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `name` | string | `""` | ユーザー名（タスクの関係者判定に使用） |
| `email` | string | - | メールアドレス（任意） |
| `timezone` | string | `"Asia/Tokyo"` | タイムゾーン |
| `role` | string | - | 役職（任意） |

**例:**

```json
{
  "user": {
    "name": "山田太郎",
    "email": "yamada@example.com",
    "timezone": "Asia/Tokyo",
    "role": "エンジニア"
  }
}
```

---

### calendar - カレンダー設定

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `workingHours.start` | string | `"09:00"` | 勤務開始時刻 |
| `workingHours.end` | string | `"18:00"` | 勤務終了時刻 |
| `meetingHeavyDays` | string[] | `["Tuesday", "Thursday"]` | ミーティングが多い曜日 |
| `deepWorkDays` | string[] | `["Monday", "Wednesday", "Friday"]` | 集中作業向けの曜日 |
| `deepWorkBlocks` | DeepWorkBlock[] | `[]` | 集中作業ブロック |
| `timeZone` | string | `"Asia/Tokyo"` | カレンダーのタイムゾーン |

**例:**

```json
{
  "calendar": {
    "workingHours": {
      "start": "10:00",
      "end": "19:00"
    },
    "meetingHeavyDays": ["Monday", "Wednesday"],
    "deepWorkDays": ["Tuesday", "Thursday", "Friday"],
    "deepWorkBlocks": [
      {
        "day": "Tuesday",
        "startHour": 9,
        "endHour": 12,
        "description": "午前の集中タイム"
      }
    ],
    "timeZone": "Asia/Tokyo"
  }
}
```

---

### priorityRules - 優先度ルール

タスクの優先度（P0-P3）を判定するルールを設定します。

#### 優先度レベル

| レベル | 説明 | 例 |
|--------|------|----|
| **P0** | 緊急・最優先 | 24時間以内の期限、「緊急」キーワード |
| **P1** | 高優先度 | 3日以内の期限、マネージャーからの依頼 |
| **P2** | 通常 | 1週間以内の期限 |
| **P3** | 低優先度 | 期限なし、背景タスク |

#### 条件タイプ

| タイプ | 演算子 | 値の例 | 説明 |
|--------|--------|--------|------|
| `deadline` | `<`, `>`, `=` | `24`, `3`, `7` | 期限までの時間（unit で単位指定） |
| `keyword` | `contains` | `["urgent", "緊急"]` | タスクに含まれるキーワード |
| `stakeholder` | `contains` | `"manager"` | 関係者のロール |
| `blocking` | `=` | `true` | 他のタスクをブロックしているか |

**例:**

```json
{
  "priorityRules": {
    "p0Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 24,
        "unit": "hours",
        "description": "24時間以内の期限"
      },
      {
        "type": "keyword",
        "operator": "contains",
        "value": ["urgent", "emergency", "critical", "緊急", "至急", "ASAP"],
        "description": "緊急キーワードを含む"
      }
    ],
    "p1Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 3,
        "unit": "days",
        "description": "3日以内の期限"
      },
      {
        "type": "stakeholder",
        "operator": "contains",
        "value": "manager",
        "description": "マネージャーが関係"
      }
    ],
    "p2Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 7,
        "unit": "days",
        "description": "1週間以内の期限"
      }
    ],
    "defaultPriority": "P3"
  }
}
```

---

### estimation - 時間見積もり

タスクの所要時間を推定するための設定です。

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `simpleTaskMinutes` | number | `25` | 簡単なタスクの見積もり時間（分） |
| `mediumTaskMinutes` | number | `50` | 中程度のタスクの見積もり時間（分） |
| `complexTaskMinutes` | number | `90` | 複雑なタスクの見積もり時間（分） |
| `projectTaskMinutes` | number | `180` | プロジェクト規模のタスクの見積もり時間（分） |
| `keywordMapping` | object | - | キーワードと複雑度のマッピング |

**例:**

```json
{
  "estimation": {
    "simpleTaskMinutes": 25,
    "mediumTaskMinutes": 50,
    "complexTaskMinutes": 90,
    "projectTaskMinutes": 180,
    "keywordMapping": {
      "simple": ["check", "review", "read", "confirm", "確認", "レビュー", "読む"],
      "medium": ["implement", "fix", "update", "create", "実装", "修正", "作成", "更新"],
      "complex": ["design", "refactor", "migrate", "integrate", "設計", "リファクタ", "移行"],
      "project": ["build", "develop", "architect", "構築", "開発", "設計構築"]
    }
  }
}
```

---

### team - チーム設定

関係者の検出とプリ優先度判定に使用します。

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `manager` | TeamMember | - | 直属のマネージャー |
| `frequentCollaborators` | TeamMember[] | `[]` | よく協力するメンバー |
| `departments` | string[] | `[]` | 所属部署 |

#### TeamMember

| プロパティ | 型 | 説明 |
|-----------|----|----- |
| `name` | string | 名前 |
| `role` | string | `"manager"`, `"lead"`, `"team"`, `"collaborator"` |
| `keywords` | string[] | 検出用キーワード |
| `priority` | number | 優先度ウェイト（任意） |

**例:**

```json
{
  "team": {
    "manager": {
      "name": "田中部長",
      "role": "manager",
      "keywords": ["田中", "部長", "tanaka"]
    },
    "frequentCollaborators": [
      {
        "name": "佐藤さん",
        "role": "lead",
        "keywords": ["佐藤", "sato"]
      },
      {
        "name": "鈴木さん",
        "role": "team",
        "keywords": ["鈴木", "suzuki"]
      }
    ],
    "departments": ["Engineering", "Product"]
  }
}
```

---

### integrations - 外部サービス統合

#### appleReminders - Apple Reminders

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `enabled` | boolean | `true` | 統合の有効/無効 |
| `threshold` | number | `7` | この日数以内のタスクを Reminders に登録 |
| `unit` | string | `"days"` | threshold の単位 |
| `defaultList` | string | `"Reminders"` | デフォルトのリスト名 |
| `lists` | object | `{}` | カテゴリ別リストマッピング |

**例:**

```json
{
  "integrations": {
    "appleReminders": {
      "enabled": true,
      "threshold": 7,
      "unit": "days",
      "defaultList": "仕事",
      "lists": {
        "work": "仕事",
        "personal": "プライベート",
        "urgent": "緊急"
      }
    }
  }
}
```

#### notion - Notion

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `enabled` | boolean | `false` | 統合の有効/無効 |
| `threshold` | number | `8` | この日数以上のタスクを Notion に登録 |
| `unit` | string | `"days"` | threshold の単位 |
| `databaseId` | string | `""` | Notion データベース ID |
| `databaseUrl` | string | - | Notion データベース URL（任意） |
| `propertyMappings` | object | - | プロパティマッピング（任意） |

**例:**

```json
{
  "integrations": {
    "notion": {
      "enabled": true,
      "threshold": 8,
      "unit": "days",
      "databaseId": "abc123def456789...",
      "databaseUrl": "https://notion.so/myworkspace/Tasks-abc123...",
      "propertyMappings": {
        "title": "Name",
        "priority": "Priority",
        "deadline": "Due Date",
        "status": "Status"
      }
    }
  }
}
```

#### googleCalendar - カレンダー

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `enabled` | boolean | `false` | 統合の有効/無効 |
| `defaultCalendar` | string | `"primary"` | デフォルトカレンダー |
| `conflictDetection` | boolean | `true` | 予定の重複検出 |
| `lookAheadDays` | number | `14` | 空き時間検索の先読み日数 |

**例:**

```json
{
  "integrations": {
    "googleCalendar": {
      "enabled": true,
      "defaultCalendar": "Work",
      "conflictDetection": true,
      "lookAheadDays": 7
    }
  }
}
```

---

### reminders - リマインド設定

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `defaultTypes` | string[] | `["1_day_before", "1_hour_before"]` | デフォルトのリマインドタイプ |
| `weeklyReview` | object | - | 週次レビュー設定 |
| `customRules` | ReminderRule[] | `[]` | カスタムルール |

**例:**

```json
{
  "reminders": {
    "defaultTypes": ["1_day_before", "3_hours_before", "30_minutes_before"],
    "weeklyReview": {
      "enabled": true,
      "day": "Friday",
      "time": "16:00",
      "description": "週次タスクレビュー"
    },
    "customRules": [
      {
        "condition": "priority === 'P0'",
        "reminders": ["2_hours_before", "30_minutes_before"],
        "description": "P0タスクは直前にも通知"
      }
    ]
  }
}
```

---

### preferences - 表示設定

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `language` | string | `"ja"` | 表示言語（`"ja"` or `"en"`） |
| `dateFormat` | string | `"YYYY-MM-DD"` | 日付フォーマット |
| `timeFormat` | string | `"24h"` | 時刻フォーマット（`"12h"` or `"24h"`） |

**例:**

```json
{
  "preferences": {
    "language": "ja",
    "dateFormat": "YYYY/MM/DD",
    "timeFormat": "24h"
  }
}
```

---

## 完全な設定例

```json
{
  "version": "1.0.0",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "lastUpdated": "2025-01-01T00:00:00.000Z",
  "user": {
    "name": "山田太郎",
    "email": "yamada@example.com",
    "timezone": "Asia/Tokyo",
    "role": "エンジニア"
  },
  "calendar": {
    "workingHours": {
      "start": "09:00",
      "end": "18:00"
    },
    "meetingHeavyDays": ["Tuesday", "Thursday"],
    "deepWorkDays": ["Monday", "Wednesday", "Friday"],
    "deepWorkBlocks": [],
    "timeZone": "Asia/Tokyo"
  },
  "priorityRules": {
    "p0Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 24,
        "unit": "hours",
        "description": "24時間以内の期限"
      },
      {
        "type": "keyword",
        "operator": "contains",
        "value": ["urgent", "緊急", "至急"],
        "description": "緊急キーワード"
      }
    ],
    "p1Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 3,
        "unit": "days",
        "description": "3日以内の期限"
      }
    ],
    "p2Conditions": [
      {
        "type": "deadline",
        "operator": "<",
        "value": 7,
        "unit": "days",
        "description": "1週間以内の期限"
      }
    ],
    "defaultPriority": "P3"
  },
  "estimation": {
    "simpleTaskMinutes": 25,
    "mediumTaskMinutes": 50,
    "complexTaskMinutes": 90,
    "projectTaskMinutes": 180,
    "keywordMapping": {
      "simple": ["確認", "レビュー", "check"],
      "medium": ["実装", "修正", "implement"],
      "complex": ["設計", "リファクタ", "design"],
      "project": ["構築", "開発", "build"]
    }
  },
  "team": {
    "manager": {
      "name": "田中部長",
      "role": "manager",
      "keywords": ["田中", "部長"]
    },
    "frequentCollaborators": [],
    "departments": ["Engineering"]
  },
  "integrations": {
    "appleReminders": {
      "enabled": true,
      "threshold": 7,
      "unit": "days",
      "defaultList": "Reminders",
      "lists": {}
    },
    "notion": {
      "enabled": true,
      "threshold": 8,
      "unit": "days",
      "databaseId": "your-database-id-here"
    },
    "googleCalendar": {
      "enabled": true,
      "defaultCalendar": "primary",
      "conflictDetection": true,
      "lookAheadDays": 14
    }
  },
  "reminders": {
    "defaultTypes": ["1_day_before", "1_hour_before"],
    "weeklyReview": {
      "enabled": true,
      "day": "Friday",
      "time": "17:00",
      "description": "週次レビュー"
    },
    "customRules": []
  },
  "preferences": {
    "language": "ja",
    "dateFormat": "YYYY-MM-DD",
    "timeFormat": "24h"
  }
}
```

---

## 設定のバックアップ

```bash
# バックアップ
cp ~/.sage/config.json ~/.sage/config.json.backup

# 復元
cp ~/.sage/config.json.backup ~/.sage/config.json
```

## 設定のリセット

```bash
# 設定ファイルを削除
rm ~/.sage/config.json

# 次回起動時にセットアップウィザードが表示されます
```

---

## 関連ドキュメント

- [Local MCP Setup](SETUP-LOCAL.md)
- [Remote MCP Setup](SETUP-REMOTE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
