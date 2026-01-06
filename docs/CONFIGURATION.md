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

---

## Google Calendar Integration

Google Calendar統合により、macOS以外のプラットフォーム（Linux/Windows）でもカレンダー機能を利用できます。macOSでは、EventKitとGoogle Calendarの両方を併用することも可能です。

### Google OAuth Setup

Google Calendar APIを使用するには、Google Cloud Consoleでの初期セットアップが必要です。

#### 1. Google Cloud Projectの作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成（例: "Sage Calendar Integration"）
3. プロジェクトを選択

#### 2. Google Calendar APIの有効化

1. 「APIとサービス」→「ライブラリ」に移動
2. "Google Calendar API"を検索
3. 「有効にする」をクリック

#### 3. OAuth 2.0認証情報の作成

1. 「APIとサービス」→「認証情報」に移動
2. 「認証情報を作成」→「OAuth クライアント ID」を選択
3. アプリケーションの種類: **デスクトップアプリ**
4. 名前を入力（例: "Sage Desktop Client"）
5. 「作成」をクリック
6. **クライアントID**と**クライアントシークレット**をメモ

#### 4. 環境変数の設定

取得した認証情報を環境変数として設定します:

```bash
# ~/.bashrc または ~/.zshrc に追加
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"

# オプション: リダイレクトURIをカスタマイズする場合
export GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"
```

設定を反映:
```bash
source ~/.bashrc  # または source ~/.zshrc
```

#### 5. sageでGoogle Calendarを有効化

```
sage でGoogle Calendarソースを有効にしてください
```

初回有効化時、ブラウザでGoogle OAuth同意画面が開きます。カレンダーへのアクセスを許可してください。

### 設定オプション

#### calendar.sources - カレンダーソース設定

複数のカレンダーソース（EventKit、Google Calendar）を管理します。

| プロパティ | 型 | デフォルト | 説明 |
|-----------|----|-----------|----- |
| `sources.eventkit.enabled` | boolean | macOS: `true`, その他: `false` | EventKitの有効/無効 |
| `sources.google.enabled` | boolean | `false` | Google Calendarの有効/無効 |
| `sources.google.defaultCalendar` | string | `"primary"` | デフォルトカレンダーID |
| `sources.google.excludedCalendars` | string[] | `[]` | 除外するカレンダーID |
| `sources.google.syncInterval` | number | `300` | 同期間隔（秒） |
| `sources.google.enableNotifications` | boolean | `true` | 通知の有効/無効 |

**注意**: 少なくとも1つのソースを有効にする必要があります。

**例:**

```json
{
  "calendar": {
    "sources": {
      "eventkit": {
        "enabled": true
      },
      "google": {
        "enabled": true,
        "defaultCalendar": "primary",
        "excludedCalendars": [
          "holidays@group.v.calendar.google.com",
          "weather@group.v.calendar.google.com"
        ],
        "syncInterval": 300,
        "enableNotifications": true
      }
    },
    "workingHours": {
      "start": "09:00",
      "end": "18:00"
    },
    "timeZone": "Asia/Tokyo"
  }
}
```

### プラットフォーム別のデフォルト設定

| プラットフォーム | EventKit | Google Calendar |
|-----------------|----------|-----------------|
| **macOS** | 有効（デフォルト） | 無効（オプション） |
| **Linux** | 利用不可 | 有効（推奨） |
| **Windows** | 利用不可 | 有効（推奨） |

### カレンダーソースの管理

#### 利用可能なソースの確認

```
sage で利用可能なカレンダーソースを表示してください
```

#### ソースの有効化/無効化

```
sage でGoogle Calendarを有効にしてください
sage でEventKitを無効にしてください
```

#### 同期状態の確認（両方有効な場合）

```
sage でカレンダーの同期状態を確認してください
```

### トラブルシューティング

#### OAuth認証エラー

**症状**: "OAuth authentication failed" エラー

**解決方法**:
1. 環境変数が正しく設定されているか確認:
   ```bash
   echo $GOOGLE_CLIENT_ID
   echo $GOOGLE_CLIENT_SECRET
   ```
2. Google Cloud Consoleで以下を確認:
   - Google Calendar APIが有効になっているか
   - OAuth同意画面が設定されているか
   - OAuth 2.0クライアントIDが作成されているか
3. トークンをリセットして再認証:
   ```bash
   rm ~/.sage/tokens/google-calendar-tokens.json
   ```
   その後、再度Google Calendarを有効化してください。

#### トークン期限切れエラー

**症状**: "Token expired" または "401 Unauthorized" エラー

**解決方法**:
システムは自動的にトークンを更新しますが、リフレッシュトークンが無効な場合は再認証が必要です:

```
sage でGoogle Calendarソースを無効にしてください
sage でGoogle Calendarソースを有効にしてください
```

#### APIレート制限エラー

**症状**: "429 Too Many Requests" エラー

**解決方法**:
1. システムは自動的にリトライしますが、頻繁に発生する場合は `syncInterval` を長くしてください:
   ```json
   {
     "calendar": {
       "sources": {
         "google": {
           "syncInterval": 600
         }
       }
     }
   }
   ```
2. Google Cloud Consoleでクォータを確認:
   - 1,000,000 requests/day（プロジェクトあたり）
   - 10,000 requests/100 seconds/user

#### カレンダーが見つからないエラー

**症状**: "Calendar not found" エラー

**解決方法**:
1. 利用可能なカレンダーIDを確認:
   ```
   sage でGoogle Calendarの一覧を表示してください
   ```
2. `excludedCalendars` に誤って追加していないか確認
3. Google Calendar側でカレンダーが共有されているか確認

#### 両方のソースが無効

**症状**: "At least one calendar source must be enabled" エラー

**解決方法**:
少なくとも1つのカレンダーソースを有効にしてください:
```
sage でGoogle Calendarを有効にしてください
```

#### ネットワークエラー

**症状**: "Unable to reach Google Calendar" エラー

**解決方法**:
1. インターネット接続を確認
2. プロキシ設定が必要な場合は環境変数を設定:
   ```bash
   export HTTPS_PROXY="http://proxy.example.com:8080"
   ```
3. ファイアウォールでGoogle API（`*.googleapis.com`）へのアクセスが許可されているか確認

#### イベントの重複

**症状**: EventKitとGoogle Calendarで同じイベントが重複表示される

**解決方法**:
システムは自動的にiCalUIDでイベントを重複排除しますが、重複が発生する場合:
1. 両方のカレンダーで同期が有効になっているか確認
2. 手動同期を実行:
   ```
   sage でカレンダーソースを同期してください
   ```

### セキュリティに関する注意事項

- **トークン保存**: OAuthトークンは暗号化されて `~/.sage/tokens/` に保存されます
- **スコープ**: Sageは最小限のカレンダーアクセススコープのみを要求します
- **HTTPS**: すべてのGoogle API通信はHTTPS（TLS 1.2+）で保護されます
- **アクセス取り消し**: [Google Account Security](https://myaccount.google.com/permissions)でいつでもSageのアクセスを取り消せます

### サポートされているイベントタイプ

sageはGoogle Calendar API v3の全6つのイベントタイプをサポートしています:

| イベントタイプ | 説明 | 作成 | 更新 | 削除 |
|---------------|------|------|------|------|
| `default` | 通常のミーティングやイベント | Yes | Yes | Yes |
| `outOfOffice` | 休暇・不在ブロック（自動辞退機能付き） | Yes | Yes | Yes |
| `focusTime` | 集中作業時間（Google Chat連携） | Yes | Yes | Yes |
| `workingLocation` | リモートワーク/オフィス出社/カスタム場所（終日） | Yes | Yes | Yes |
| `birthday` | 誕生日・記念日（終日、年次繰り返し） | Yes | Limited | Yes |
| `fromGmail` | Gmail由来のイベント（フライト予約等） | No | Limited | No |

**注意**: `fromGmail`イベントはGmailから自動生成されるため、API経由での作成はできません。更新も一部のフィールド（colorId、reminders等）のみに制限されています。

#### イベントタイプの使用例

**focusTimeイベントの作成**:
```
sage で集中作業時間を作成してください:
- タイトル: "Deep Work"
- 日時: 明日 9:00-12:00
- イベントタイプ: focusTime
- チャットステータス: doNotDisturb
- 自動辞退: 有効
```

**outOfOfficeイベントの作成**:
```
sage で不在ブロックを作成してください:
- タイトル: "年末年始休暇"
- 期間: 12月29日から1月3日まで
- イベントタイプ: outOfOffice
- 自動辞退メッセージ: "年末年始休暇のため不在です。1月4日以降にご連絡ください。"
```

**workingLocationイベントの作成**:
```
sage でリモートワーク日を登録してください:
- 日付: 来週の月曜日
- イベントタイプ: workingLocation
- 場所タイプ: homeOffice
```

**イベントタイプでフィルタリング**:
```
sage で今週の集中作業時間を一覧表示してください（eventTypes: focusTime）
```

---

#### googleCalendar - カレンダー（レガシー）

**注意**: この設定は後方互換性のために残されています。新しい `calendar.sources.google` 設定を使用してください。

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

## Hot Reload（ホットリロード）

sage は設定ファイルの変更を自動的に検出し、サーバーを再起動せずに新しい設定を適用できます。

### 機能概要

- **自動検出**: `~/.sage/config.json` の変更を監視し、自動的にリロード
- **デバウンス処理**: 連続した変更は500msのデバウンス後に1回のリロードとして処理
- **検証**: 新しい設定は適用前にZodスキーマで検証
- **フォールバック**: 無効な設定の場合、前の有効な設定を維持
- **サービス再初期化**: 変更されたセクションに依存するサービスのみを再初期化

### 手動リロード

#### SIGHUP シグナル

```bash
# プロセスIDを見つけてSIGHUPを送信
kill -HUP $(pgrep -f "sage")
```

#### reload_config MCP ツール

```
sage で設定をリロードしてください
```

または Claude Desktop/Code から:

```
reload_config ツールを実行してください
```

### 環境変数

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `SAGE_DISABLE_HOT_RELOAD` | `false` | `true` に設定するとホットリロードを無効化 |
| `SAGE_HOT_RELOAD_DEBOUNCE` | `500` | デバウンス遅延（ミリ秒） |

**例:**

```bash
# ホットリロードを無効化
export SAGE_DISABLE_HOT_RELOAD=true

# デバウンス遅延を1秒に変更
export SAGE_HOT_RELOAD_DEBOUNCE=1000
```

### ステータス確認

```
sage でセットアップステータスを確認してください
```

レスポンスに `hotReload` セクションが含まれます:

```json
{
  "hotReload": {
    "enabled": true,
    "watching": true,
    "lastReload": {
      "success": true,
      "changedSections": ["calendar", "integrations"],
      "reinitializedServices": ["CalendarSourceManager", "ReminderManager"],
      "timestamp": "2025-01-06T10:30:00.000Z",
      "durationMs": 150
    }
  }
}
```

### 変更セクションとサービスの対応

| 設定セクション | 再初期化されるサービス |
|---------------|----------------------|
| `calendar` | CalendarSourceManager, WorkingCadenceService |
| `integrations` | CalendarSourceManager, ReminderManager, NotionMCPService, TodoListManager |
| `reminders` | ReminderManager |
| `priorityRules` | PriorityEngine |

### 制限事項

以下の変更にはサーバーの再起動が必要です:

- OAuth認証設定（クライアントID、シークレット）
- リモートサーバーのポート番号
- トランスポート方式（stdio ↔ HTTP）

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
