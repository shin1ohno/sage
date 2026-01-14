# Requirements Document: Multi-Calendar Resources

## Introduction

この機能は、ユーザーが複数のカレンダーリソース（Google Calendar、EventKit/macOS Calendar）を同時に参照できるようにするものです。現在のシステムでは各ソースからイベントを取得・マージする機能がありますが、ユーザーが明示的に「どのカレンダー（リソース）」を含めるかを選択・設定する機能が不足しています。

この機能により、ユーザーは個人用カレンダー、仕事用カレンダー、チームカレンダーなど複数のカレンダーリソースを同時に参照し、統合されたスケジュール管理を行えるようになります。

## Alignment with Product Vision

このプロジェクト（sage）はAIタスク管理アシスタントとして、ユーザーのスケジュール管理を効率化することを目的としています。複数カレンダーリソースの同時参照は以下の価値を提供します：

- **包括的なスケジュール可視化**: 複数のカレンダーを横断した空き時間の正確な把握
- **柔軟な統合**: 個人用・業務用など異なるカレンダーの統合管理
- **効率的なタスクスケジューリング**: すべての予定を考慮した適切な作業時間の提案

## Requirements

### Requirement 1: カレンダーリソース一覧取得

**User Story:** As a user, I want to see all available calendar resources from connected sources, so that I can choose which calendars to include in my schedule view.

#### Acceptance Criteria

1. WHEN the user requests available calendar resources THEN the system SHALL return a list of all calendars from all enabled sources (EventKit, Google Calendar)
2. IF a calendar source is not connected or disabled THEN the system SHALL exclude it from the resource list and indicate its unavailability
3. WHEN listing resources THEN the system SHALL include each calendar's name, source type, color (if available), and unique identifier

### Requirement 2: カレンダーリソースの選択・設定

**User Story:** As a user, I want to select which calendar resources to include when viewing my schedule, so that I can focus on relevant calendars only.

#### Acceptance Criteria

1. WHEN the user specifies selected calendar IDs THEN the system SHALL filter events to only those from the selected calendars
2. IF no calendar IDs are specified THEN the system SHALL use the default configuration (all enabled calendars minus excluded ones)
3. WHEN the user updates calendar selection THEN the system SHALL persist the selection in the configuration file

### Requirement 3: 選択したカレンダーからのイベント取得

**User Story:** As a user, I want to retrieve events from my selected calendars in a unified view, so that I can see my complete schedule across all relevant calendars.

#### Acceptance Criteria

1. WHEN fetching events with specified calendar IDs THEN the system SHALL query only the selected calendars
2. WHEN events are retrieved from multiple calendars THEN the system SHALL merge them chronologically and deduplicate based on iCalUID or title+time
3. IF a selected calendar is unavailable THEN the system SHALL log a warning and continue with available calendars

### Requirement 4: カレンダーリソースごとの可視化情報

**User Story:** As a user, I want to see which calendar each event belongs to, so that I can distinguish between personal and work events.

#### Acceptance Criteria

1. WHEN displaying events THEN the system SHALL include the source calendar name and type for each event
2. IF the calendar has a color property THEN the system SHALL include it in the event metadata
3. WHEN events are deduplicated THEN the system SHALL prefer the event from the primary source (configurable)

### Requirement 5: 空き時間検索での複数カレンダー考慮

**User Story:** As a user, I want the available slot finder to consider all my selected calendars, so that I get accurate availability.

#### Acceptance Criteria

1. WHEN finding available slots THEN the system SHALL consider events from all selected calendars
2. IF calendar IDs are specified in the slot search THEN the system SHALL use only those calendars for conflict detection
3. WHEN a time slot conflicts with any selected calendar THEN the system SHALL mark it as unavailable

### Requirement 6: カレンダーイベント作成時の宛先カレンダー指定

**User Story:** As a user, I want to specify which calendar to create an event on, so that I can organize my events appropriately.

#### Acceptance Criteria

1. WHEN creating an event THEN the system SHALL allow specifying a target calendar ID
2. IF no target calendar is specified THEN the system SHALL use the default calendar from configuration
3. IF the specified target calendar is not writable or unavailable THEN the system SHALL return an error with available alternatives

## Non-Functional Requirements

### Performance
- カレンダーリソース一覧の取得は2秒以内に完了すること
- 複数カレンダーからのイベント取得は並列実行し、全体で5秒以内に完了すること
- キャッシュを活用し、頻繁なAPI呼び出しを回避すること

### Security
- カレンダーIDなどの識別子は外部に漏洩しないよう適切に管理すること
- OAuth認証情報は既存のセキュリティ基準に従い安全に保管すること
- ユーザーが明示的に許可したカレンダーのみアクセスすること

### Reliability
- 一部のカレンダーソースが利用不可でも、他のソースからの取得は継続すること
- ネットワークエラー時は既存のリトライロジック（指数バックオフ）を適用すること
- エラー発生時は詳細なログを記録し、ユーザーには分かりやすいメッセージを表示すること

### Usability
- カレンダー選択はMCPツールの引数として直感的に指定できること
- デフォルト設定により、毎回カレンダーを指定しなくても利用できること
- カレンダー名は人間が読みやすい形式で表示すること
