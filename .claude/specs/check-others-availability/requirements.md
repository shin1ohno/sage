# Requirements Document: check-others-availability

## Introduction

他のユーザーのカレンダー空き状況を確認する機能。ミーティングの調整時に、参加者全員の空き時間を把握し、最適な時間帯を見つけることができる。

Google Calendar の Freebusy API を使用して、プライバシーを保護しながら（イベント詳細は見えない、忙しいかどうかのみ）複数人の空き状況を一度に確認できる。

## Alignment with Product Vision

- **product.md との整合**: sage は「エンジニアの生産性を向上させる」ことを目的としており、ミーティング調整の効率化はこの目標に直接貢献する
- **既存機能との連携**:
  - `search_directory_people` で参加者のメールアドレスを検索
  - `find_available_slots` で自分の空き時間を確認
  - `create_calendar_event` でミーティングを作成
- **ワークフロー完成**: 「参加者検索 → 空き確認 → 共通空き時間特定 → ミーティング作成」という一連の流れを実現

## Requirements

### Requirement 1: 複数人の空き状況確認

**User Story:** As an engineer, I want to check the availability of multiple colleagues at once, so that I can find a suitable meeting time without manually checking each person's calendar.

#### Acceptance Criteria

1.1. WHEN user provides a list of email addresses AND a time range THEN system SHALL return the availability status for each person

1.2. WHEN user provides 1 to 20 email addresses THEN system SHALL process all of them in a single request

1.3. WHEN user provides more than 20 email addresses THEN system SHALL return an error message asking to reduce the number

1.4. IF a person's calendar is not accessible (permission denied) THEN system SHALL indicate that status for that person without failing the entire request

1.5. WHEN availability is checked THEN system SHALL return busy periods (start/end times) for each person

1.6. WHEN all specified people are free during the requested time range THEN system SHALL clearly indicate this with `isAvailable: true`

### Requirement 2: 共通空き時間の特定

**User Story:** As an engineering manager, I want to find common free time slots among multiple attendees, so that I can quickly schedule a meeting without manual comparison.

#### Acceptance Criteria

2.1. WHEN user requests to find common availability THEN system SHALL identify time slots where ALL specified people are free

2.2. WHEN finding common slots THEN system SHALL consider the user's own calendar as well

2.3. WHEN common slots are found THEN system SHALL return them sorted by start time

2.4. IF no common free time exists in the specified range THEN system SHALL return an empty list with a clear message

2.5. WHEN common slots are found THEN system SHALL include duration information for each slot

2.6. WHEN user specifies a minimum duration THEN system SHALL only return slots of that duration or longer

### Requirement 3: プライバシー保護

**User Story:** As a user, I want my calendar details to remain private, so that others can only see when I'm busy, not what I'm doing.

#### Acceptance Criteria

3.1. WHEN availability is checked THEN system SHALL NOT expose event titles, descriptions, or attendees

3.2. WHEN availability is checked THEN system SHALL only return busy/free status and time periods

3.3. IF Freebusy API returns errors due to permissions THEN system SHALL handle gracefully and report per-person status

### Requirement 4: ディレクトリ検索との統合

**User Story:** As a user, I want to search for colleagues by name and check their availability in one flow, so that I don't need to know their exact email addresses.

#### Acceptance Criteria

4.1. WHEN user provides names instead of emails THEN system SHALL first search the directory for matching people

4.2. IF multiple people match a name THEN system SHALL return all matches with their availability (up to limit)

4.3. WHEN combining search and availability check THEN system SHALL indicate which person matched which search term

## Example Workflow

```
1. search_directory_people("alice", "bob")  → Get email addresses
2. check_people_availability([emails], "2026-01-12", "2026-01-16")  → Check availability
3. find_common_availability([emails], duration: 30min)  → Find common free slots
4. create_calendar_event(...)  → Create meeting
```

## Non-Functional Requirements

### Performance
- Availability check for up to 20 people should complete within 5 seconds
- Batch processing using Google's Freebusy API (max 50 calendars per request)

### Security
- Uses existing OAuth2 authentication with calendar.readonly scope
- No new scopes required beyond existing Google Calendar integration

### Reliability
- Partial failures (some people not accessible) should not fail entire request
- Retry logic with exponential backoff for transient API errors

### Usability
- Clear error messages for inaccessible calendars
- Results should include both email and display name when available
- Time zones should be handled consistently with existing calendar tools
