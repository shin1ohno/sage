# Requirements Document: Room Availability Search

## Introduction

Google Workspace の会議室リソースの空き状況を検索し、指定した時間帯で利用可能な会議室を見つける機能を提供します。ユーザーは MCP ツールを通じて、特定の時間帯・収容人数・設備要件に合った会議室を検索できます。

## Alignment with Product Vision

この機能は sage の Calendar Integration を拡張し、より包括的なスケジューリングサポートを提供します：

- **Task Analysis の強化**: 会議タスクに対して適切な会議室を自動提案
- **Calendar Integration の拡張**: 既存のイベント一覧・作成・空き時間検索に会議室検索を追加
- **エンジニアの生産性向上**: 会議室探しの手間を削減

## Requirements

### Requirement 1: Search Room Availability

**User Story:** As an engineer, I want to find rooms that are available during a specific time slot, so that I can book a suitable room for my meeting.

#### Acceptance Criteria

1. WHEN user specifies start time and end time THEN system SHALL query room availability for that period and return available rooms
2. WHEN user specifies start time and duration THEN system SHALL calculate end time automatically and query availability
3. IF no rooms are available THEN system SHALL return empty result with suggestion to try different times
4. WHEN multiple rooms are available THEN system SHALL sort by: capacity match (closest to required), then by name alphabetically
5. IF minCapacity filter is specified THEN system SHALL return only rooms with capacity >= specified value
6. IF building filter is specified THEN system SHALL return only rooms in that building
7. IF floor filter is specified THEN system SHALL return only rooms on that floor
8. IF features filter is specified THEN system SHALL return only rooms with all specified features
9. WHEN rooms are returned THEN each room SHALL include: name, capacity, features (video conference, whiteboard, etc.), building/floor information, and busy periods
10. IF Google Workspace is not configured THEN system SHALL return error with helpful message

### Requirement 2: Check Specific Room Availability

**User Story:** As an engineer, I want to check if a specific meeting room is available at a given time, so that I can quickly verify before booking.

#### Acceptance Criteria

1. WHEN user specifies room ID and time range THEN system SHALL return availability status for that room
2. WHEN room is busy THEN system SHALL return busy periods within the time range
3. WHEN room is available THEN system SHALL confirm availability with the time slot
4. IF room ID is invalid THEN system SHALL return error indicating room not found

### Requirement 3: Integration with Existing Calendar Features

**User Story:** As an engineer, I want room search integrated with existing calendar tools, so that I have a consistent experience.

#### Acceptance Criteria

1. WHEN creating calendar event THEN user SHALL be able to specify room ID to book
2. IF room is specified in event creation THEN system SHALL add room as attendee/location
3. WHEN room booking conflicts THEN system SHALL return error with conflict details
4. WHEN room is successfully booked THEN system SHALL include room in event confirmation

## Non-Functional Requirements

### Performance
- Availability search for up to 10 rooms SHALL complete within 2 seconds
- Room availability SHALL be queried in real-time (no caching) to ensure accuracy

### Security
- Room search SHALL only access rooms within user's Google Workspace domain
- OAuth tokens SHALL use existing secure storage mechanism
- No additional scopes required beyond existing calendar scopes (Freebusy API uses calendar.readonly)

### Reliability
- System SHALL handle Google API rate limits with existing retry mechanism
- System SHALL gracefully handle unavailable Google Calendar service
- System SHALL work when EventKit is unavailable (Google-only fallback)

### Usability
- Error messages SHALL clearly explain what went wrong and how to fix it
- Room names SHALL be displayed in user-friendly format (not resource IDs)
- Time inputs SHALL accept ISO 8601 format consistent with other calendar tools
