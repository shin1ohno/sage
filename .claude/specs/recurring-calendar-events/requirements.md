# Requirements Document

## Introduction

定期イベント（Recurring Events）機能は、Google Calendar APIを使用してカレンダーイベントの繰り返し設定を作成・更新する機能を提供します。ユーザーは毎日、毎週、毎月などの定期的なイベントを作成し、「このイベントのみ」「これ以降すべて」「すべてのイベント」といった範囲で変更を適用できます。

**注意**: 定期イベント機能はGoogle Calendar専用です。Apple Calendar (EventKit) はMCP経由での定期イベント作成をサポートしていません。

## Alignment with Product Vision

sageは個人の生産性向上を支援するAIアシスタントであり、定期的な予定（週次ミーティング、日次スタンドアップなど）の管理はユーザーのスケジュール管理において重要な機能です。この機能により：

- 繰り返しイベントを一度の操作で作成可能
- 定期イベントの柔軟な変更（一部または全体）
- Google Calendarとのシームレスな連携

## Requirements

### Requirement 1: Create Recurring Event

**User Story:** As a user, I want to create a recurring calendar event with repetition rules, so that I don't have to manually create each occurrence.

#### Acceptance Criteria

1. WHEN user calls `create_calendar_event` with `recurrence` parameter THEN system SHALL create an event with the specified recurrence rule in Google Calendar
2. IF `recurrence` contains valid RRULE string(s) THEN system SHALL pass them to Google Calendar API
3. WHEN creating recurring event THEN system SHALL support the following frequencies:
   - `DAILY` - 毎日
   - `WEEKLY` - 毎週（曜日指定可能）
   - `MONTHLY` - 毎月（日付または曜日指定可能）
   - `YEARLY` - 毎年
4. WHEN `recurrence` is provided AND calendar source is not Google Calendar THEN system SHALL return error indicating recurrence is Google Calendar only
5. IF `INTERVAL` is specified in RRULE THEN system SHALL apply the interval (e.g., every 2 weeks)
6. IF `COUNT` is specified THEN system SHALL limit occurrences to that count
7. IF `UNTIL` is specified THEN system SHALL end recurrence at that date
8. IF `BYDAY` is specified with `WEEKLY` frequency THEN system SHALL repeat on specified days (e.g., MO,WE,FR)

### Requirement 2: Update Recurring Event - Single Instance

**User Story:** As a user, I want to modify a single occurrence of a recurring event, so that I can handle exceptions without affecting other occurrences.

#### Acceptance Criteria

1. WHEN user calls `update_calendar_event` on a recurring event instance with `updateScope: "thisEvent"` THEN system SHALL update only that specific occurrence
2. IF updating single instance time THEN system SHALL create an exception for that occurrence
3. WHEN single instance is updated THEN system SHALL preserve other instances unchanged
4. IF `updateScope` is not specified AND event is recurring instance THEN system SHALL default to `"thisEvent"` behavior

### Requirement 3: Update Recurring Event - This and Future

**User Story:** As a user, I want to modify a recurring event from a specific date forward, so that I can change my schedule going forward without losing historical records.

#### Acceptance Criteria

1. WHEN user calls `update_calendar_event` with `updateScope: "thisAndFuture"` THEN system SHALL split the series and apply changes to future occurrences
2. IF updating "this and future" THEN system SHALL:
   - End the original series before the selected instance
   - Create a new recurring series starting from the selected instance with new properties
3. WHEN series is split THEN system SHALL preserve past occurrences with original settings
4. IF original series had `COUNT` THEN system SHALL adjust counts appropriately for both series

### Requirement 4: Update Recurring Event - All Events

**User Story:** As a user, I want to modify all occurrences of a recurring event at once, so that I can efficiently update the entire series.

#### Acceptance Criteria

1. WHEN user calls `update_calendar_event` with `updateScope: "allEvents"` THEN system SHALL update the parent recurring event
2. IF updating all events THEN system SHALL apply changes to past and future occurrences
3. WHEN updating all events THEN system SHALL use `recurringEventId` to target the series parent
4. IF event is not a recurring event AND `updateScope` is specified THEN system SHALL ignore `updateScope` and update normally

### Requirement 5: Delete Recurring Event

**User Story:** As a user, I want to delete recurring events with the same scope options, so that I have control over which occurrences are removed.

#### Acceptance Criteria

1. WHEN user calls `delete_calendar_event` on a recurring event instance THEN system SHALL support `deleteScope` parameter
2. IF `deleteScope: "thisEvent"` THEN system SHALL delete only the selected occurrence
3. IF `deleteScope: "thisAndFuture"` THEN system SHALL delete selected and all future occurrences
4. IF `deleteScope: "allEvents"` THEN system SHALL delete the entire recurring series
5. IF `deleteScope` is not specified THEN system SHALL default to `"thisEvent"` for recurring instances

### Requirement 6: Recurrence Information in Response

**User Story:** As a user, I want to see recurrence information when listing events, so that I can understand which events are recurring.

#### Acceptance Criteria

1. WHEN listing calendar events THEN system SHALL include `recurrence` array if event is a recurring series parent
2. WHEN listing calendar events THEN system SHALL include `recurringEventId` for recurring event instances
3. IF event has recurrence rules THEN system SHALL include human-readable recurrence description in response

### Requirement 7: Input Validation

**User Story:** As a developer, I want robust validation of recurrence parameters, so that invalid inputs are caught early.

#### Acceptance Criteria

1. WHEN `recurrence` parameter is provided THEN system SHALL validate RRULE syntax
2. IF RRULE is invalid THEN system SHALL return descriptive error message
3. WHEN validating RRULE THEN system SHALL check:
   - `FREQ` is required and valid
   - `INTERVAL` is positive integer if present
   - `COUNT` is positive integer if present
   - `UNTIL` is valid ISO date if present
   - `BYDAY` contains valid day codes (MO,TU,WE,TH,FR,SA,SU)
4. IF both `COUNT` and `UNTIL` are specified THEN system SHALL return error (mutually exclusive)

## Non-Functional Requirements

### Performance

- 定期イベント作成は5秒以内に完了すること
- 「これ以降すべて」の更新はシリーズ分割を含め10秒以内に完了すること

### Security

- Google Calendar OAuth認証が必須
- 他ユーザーのイベントへの操作は禁止（Google Calendar API側で制御）

### Reliability

- Google Calendar APIエラー時は適切なリトライロジックを適用
- 部分的な更新失敗時は状態を明確にユーザーに伝達

### Usability

- RRULEフォーマットに加え、日本語でのエラーメッセージ提供
- 定期イベントの頻度を人間が読める形式で説明（例：「毎週月・水・金」）
