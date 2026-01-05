# Requirements Document

## Introduction

現在のsageは、Google Calendar API v3の"default"イベントタイプ(通常の会議やイベント)のみをサポートしています。しかし、Google Calendar API v3は6つの異なるイベントタイプ(`default`, `outOfOffice`, `focusTime`, `workingLocation`, `birthday`, `fromGmail`)を提供しており、それぞれ独自のプロパティと用途を持っています。

この機能により、sageのユーザーは以下のことができるようになります:
- **Out of Office**: 休暇や不在時のブロック設定と自動辞退機能
- **Focus Time**: 集中作業時間の確保とGoogle Chat連携
- **Working Location**: リモートワーク、オフィス出社、カスタム場所の記録
- **Birthday**: 誕生日や記念日の管理(Contactsとの連携)
- **fromGmail**: Gmail由来のイベント(フライト予約等)の閲覧・編集

これにより、sageはGoogle Calendarのエコシステムをフル活用し、より包括的なタスク・時間管理アシスタントとして機能します。

## Alignment with Product Vision

product.mdの目標「エンジニアの生産性を向上させるAIタスク管理アシスタント」に以下の点で貢献します:

1. **Working Cadence の精度向上**: `focusTime`イベントを認識することで、Deep Work Daysの検出がより正確になります
2. **空き時間検索の改善**: `outOfOffice`と`focusTime`イベントを考慮することで、より現実的な空き時間を提案できます
3. **コンテキスト認識**: `workingLocation`イベントにより、リモートワーク日とオフィス出社日を区別し、適切なスケジューリングが可能になります
4. **プラットフォーム横断サポート**: Google Calendarをフル活用することで、macOS以外のプラットフォーム(Linux/Windows/Web)でも高機能なカレンダー管理を実現します

## Requirements

### Requirement 1: Out of Office イベントの作成と管理

**User Story:** As a sage user, I want to create and manage "Out of Office" events with auto-decline functionality, so that I can block my calendar during vacations and automatically decline meeting invitations.

#### Acceptance Criteria

1. WHEN user creates an outOfOffice event THEN system SHALL create the event with `eventType: "outOfOffice"` in Google Calendar
2. WHEN user specifies auto-decline mode THEN system SHALL set `outOfOfficeProperties.autoDeclineMode` to one of "declineNone", "declineAllConflictingInvitations", or "declineOnlyNewConflictingInvitations"
3. WHEN user provides a decline message THEN system SHALL set `outOfOfficeProperties.declineMessage` with the custom message
4. WHEN user lists calendar events THEN system SHALL return outOfOffice events with their specific properties
5. WHEN user updates an outOfOffice event THEN system SHALL allow modification of auto-decline settings and message
6. WHEN user deletes an outOfOffice event THEN system SHALL remove the event from Google Calendar
7. IF outOfOffice event exists THEN system SHALL mark it as source: "google" and eventType: "outOfOffice" in the response

### Requirement 2: Focus Time イベントの作成と管理

**User Story:** As a sage user, I want to create and manage "Focus Time" blocks with Google Chat status integration, so that I can protect my deep work time and minimize interruptions.

#### Acceptance Criteria

1. WHEN user creates a focusTime event THEN system SHALL create the event with `eventType: "focusTime"` in Google Calendar
2. WHEN user specifies auto-decline mode THEN system SHALL set `focusTimeProperties.autoDeclineMode` appropriately
3. WHEN user provides a decline message THEN system SHALL set `focusTimeProperties.declineMessage`
4. WHEN user specifies chat status THEN system SHALL set `focusTimeProperties.chatStatus` to "available" or "doNotDisturb"
5. WHEN user lists calendar events THEN system SHALL return focusTime events with their specific properties
6. WHEN user updates a focusTime event THEN system SHALL allow modification of auto-decline settings, message, and chat status
7. IF focusTime event exists THEN system SHALL identify it for Working Cadence analysis (Deep Work Day detection)

### Requirement 3: Working Location イベントの作成と管理

**User Story:** As a sage user, I want to record my working location (home, office, custom) for each day, so that my team knows where I'll be working from and can plan accordingly.

#### Acceptance Criteria

1. WHEN user creates a workingLocation event THEN system SHALL create an all-day event with `eventType: "workingLocation"`
2. WHEN user specifies location type THEN system SHALL set `workingLocationProperties.type` to "homeOffice", "officeLocation", or "customLocation"
3. IF type is "homeOffice" THEN system SHALL set `workingLocationProperties.homeOffice` to true
4. IF type is "officeLocation" THEN system SHALL allow setting buildingId, floorId, floorSectionId, deskId, and label
5. IF type is "customLocation" THEN system SHALL set `workingLocationProperties.customLocation.label` with the location name
6. WHEN user lists calendar events THEN system SHALL return workingLocation events with location details
7. WHEN system suggests meeting times THEN system SHALL consider working location for context (e.g., avoid suggesting on-site meetings for remote work days)

### Requirement 4: Birthday イベントの閲覧と管理

**User Story:** As a sage user, I want to view and manage birthday and anniversary events synced from Google Contacts, so that I can track important personal dates.

#### Acceptance Criteria

1. WHEN user lists calendar events THEN system SHALL return birthday events with `eventType: "birthday"`
2. WHEN birthday event is returned THEN system SHALL include `birthdayProperties.type` (birthday/anniversary/custom/other/self)
3. IF birthday has custom type THEN system SHALL include `birthdayProperties.customTypeName`
4. WHEN user creates a simple birthday event THEN system SHALL create all-day, yearly recurring event with proper birthday properties
5. WHEN user updates a birthday event THEN system SHALL allow modification of summary, colorId, reminders, and date only
6. WHEN user deletes a birthday event THEN system SHALL remove the event from Google Calendar
7. IF birthday event is linked to Contact THEN system SHALL include `birthdayProperties.contact` resource name (read-only)

### Requirement 5: Gmail由来イベントの閲覧と編集

**User Story:** As a sage user, I want to view and customize events automatically created from Gmail (flight bookings, hotel reservations), so that I can manage my travel itinerary within sage.

#### Acceptance Criteria

1. WHEN user lists calendar events THEN system SHALL return fromGmail events with `eventType: "fromGmail"`
2. WHEN fromGmail event is returned THEN system SHALL clearly indicate it was auto-generated from Gmail
3. WHEN user updates a fromGmail event THEN system SHALL allow modification of colorId, reminders, visibility, transparency, status, attendees, and extendedProperties only
4. WHEN user attempts to create a fromGmail event THEN system SHALL reject the request with clear error message (cannot be created via API)
5. IF fromGmail event is a flight reservation THEN system SHALL preserve flight details in the event metadata

### Requirement 6: イベントタイプの統一インターフェース

**User Story:** As a sage user, I want all calendar event types to be accessible through a consistent interface, so that I can interact with different event types seamlessly.

#### Acceptance Criteria

1. WHEN user calls list_calendar_events THEN system SHALL return all event types (default, outOfOffice, focusTime, workingLocation, birthday, fromGmail) with unified CalendarEvent format
2. WHEN CalendarEvent is returned THEN system SHALL include an `eventType` field indicating the specific type
3. WHEN CalendarEvent has type-specific properties THEN system SHALL include those properties in a `typeSpecificProperties` field
4. WHEN user calls create_calendar_event THEN system SHALL accept an optional `eventType` parameter (defaults to "default")
5. IF eventType is specified THEN system SHALL validate that provided properties are allowed for that event type
6. WHEN user calls update_calendar_event THEN system SHALL respect the restrictions for each event type
7. WHEN user calls delete_calendar_event THEN system SHALL work for all event types except read-only constraints

### Requirement 7: イベントタイプによる検索とフィルタリング

**User Story:** As a sage user, I want to filter calendar events by type, so that I can quickly find specific kinds of events (e.g., all my focus time blocks or out of office periods).

#### Acceptance Criteria

1. WHEN user provides eventTypes parameter to list_calendar_events THEN system SHALL filter results to only include specified event types
2. WHEN user queries for focusTime events THEN system SHALL return only events with `eventType: "focusTime"`
3. WHEN user queries for multiple types THEN system SHALL support array of event types (e.g., ["focusTime", "outOfOffice"])
4. WHEN no eventTypes filter is provided THEN system SHALL return all event types by default
5. WHEN find_available_slots is called THEN system SHALL respect outOfOffice and focusTime events as blocking time
6. WHEN Working Cadence is calculated THEN system SHALL identify focusTime events to improve Deep Work Day detection

### Requirement 8: 型安全性とバリデーション

**User Story:** As a sage developer, I want comprehensive TypeScript types and runtime validation for all event types, so that the codebase remains maintainable and bugs are caught early.

#### Acceptance Criteria

1. WHEN developer defines event type interfaces THEN system SHALL use TypeScript discriminated unions for each event type
2. WHEN creating an event THEN system SHALL validate type-specific properties using Zod schemas
3. IF invalid properties are provided for event type THEN system SHALL throw descriptive error with allowed properties list
4. WHEN converting Google Calendar events to CalendarEvent THEN system SHALL preserve all type-specific properties
5. WHEN reading code THEN developer SHALL have full IntelliSense support for type-specific properties
6. IF API response changes THEN system SHALL catch type mismatches at compile time

### Requirement 9: 後方互換性の維持

**User Story:** As a sage user, I want existing calendar functionality to continue working without changes, so that my current workflows are not disrupted.

#### Acceptance Criteria

1. WHEN existing code calls list_calendar_events without eventType filter THEN system SHALL return all events including new types
2. WHEN existing code creates events without specifying eventType THEN system SHALL default to "default" type (current behavior)
3. WHEN CalendarEvent is returned THEN system SHALL maintain all existing fields (id, title, start, end, isAllDay, source, calendar, location, description, attendees, status, iCalUID)
4. WHEN developer accesses typeSpecificProperties THEN system SHALL provide it as optional field (no breaking changes)
5. IF user has existing code relying on CalendarEvent structure THEN system SHALL not break any existing fields or behaviors

## Non-Functional Requirements

### Performance

- **Event Listing**: イベントタイプフィルタリングはGoogle Calendar APIのクエリパラメータを使用し、追加のフィルタリングオーバーヘッドを避ける(ただし、APIがサポートしていない場合はクライアント側フィルタリング)
- **Type Conversion**: イベントタイプごとの変換処理はO(1)の複雑度を維持する
- **Memory Overhead**: 型固有のプロパティは必要な場合のみロードし、メモリ使用量を最小限に抑える
- **API Rate Limiting**: 既存のretryWithBackoffロジックを活用し、レート制限エラーを適切に処理する

### Security

- **API Scope**: Google Calendar OAuth scopeは既存の`https://www.googleapis.com/auth/calendar`を使用し、追加スコープは不要
- **Data Privacy**: birthdayイベントのcontact情報はread-onlyとして扱い、People API経由の追加データ取得は行わない
- **Validation**: 各イベントタイプの制約(例: birthdayはall-day且つyearly recurring)を厳密にバリデーションする
- **Error Messages**: エラーメッセージに機密情報(OAuth token等)を含めない

### Reliability

- **Graceful Degradation**: 特定のイベントタイプ取得に失敗しても、他のタイプのイベントは正常に返す
- **Error Handling**: イベントタイプ固有のエラー(例: fromGmailは作成不可)を明確なメッセージで通知する
- **API Compatibility**: Google Calendar API v3の公式仕様に準拠し、非公式機能に依存しない
- **Test Coverage**: 各イベントタイプの作成・更新・削除・取得を98%以上のカバレッジでテストする

### Usability

- **明確なエラーメッセージ**: 「このイベントタイプでは〇〇プロパティは設定できません」など、具体的なエラーメッセージを提供
- **TypeScript IntelliSense**: イベントタイプごとのプロパティがIDE上で自動補完される
- **ドキュメント**: 各イベントタイプの用途と制約をdocs/で説明する
- **例の提供**: 各イベントタイプの作成例をテストコードとドキュメントに含める
