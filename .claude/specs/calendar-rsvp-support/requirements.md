# Calendar RSVP Support Requirements

> **Last Updated**: 2026-01-17
> **Status**: Draft
> **Feature**: calendar-rsvp-support

## 1. Overview

### 1.1 Purpose
Enable users to view attendee RSVP status (accepted, declined, tentative, needsAction) for calendar events through the `list_calendar_events` MCP tool, providing visibility into meeting participation and helping users understand who will attend scheduled events.

### 1.2 Background
Currently, the sage MCP server fetches calendar events from Google Calendar API which includes full attendee information with RSVP status. However, this information is filtered out during the conversion process (`convertGoogleToCalendarEvent`) and the handler response mapping, resulting in users only seeing event titles and times without knowing participant attendance status.

### 1.3 Scope
- **In Scope**:
  - Expose attendee RSVP status in `list_calendar_events` response
  - Include attendee display names and organizer information
  - Support for Google Calendar source
  - Backward-compatible changes to existing interfaces
- **Out of Scope**:
  - EventKit/macOS attendee support (limited API capabilities)
  - Modifying RSVP response functionality (already exists)
  - Calendar event creation with attendees (already exists)

## 2. User Stories

### US-1: View Attendee RSVP Status
**As a** user viewing my calendar events,
**I want to** see which attendees have accepted, declined, or not responded to meeting invitations,
**So that** I can understand who will attend my meetings and plan accordingly.

**Acceptance Criteria (EARS Format)**:
- **WHEN** a user requests calendar events via `list_calendar_events`
- **AND** the events have attendees with RSVP responses
- **THEN** the response SHALL include each attendee's email, display name (if available), and responseStatus (accepted, declined, tentative, needsAction)

### US-2: Identify Meeting Organizer
**As a** user viewing meeting details,
**I want to** see who organized the meeting,
**So that** I can identify the meeting owner and know who to contact about the meeting.

**Acceptance Criteria (EARS Format)**:
- **WHEN** a user requests calendar events via `list_calendar_events`
- **AND** an event has an organizer
- **THEN** the response SHALL include the organizer's email and display name (if available)

### US-3: View My Own RSVP Status
**As a** user viewing my calendar,
**I want to** see my own RSVP status for events I'm invited to,
**So that** I can quickly identify meetings I haven't responded to yet.

**Acceptance Criteria (EARS Format)**:
- **WHEN** a user requests calendar events via `list_calendar_events`
- **AND** the user is an attendee of an event
- **THEN** the response SHALL indicate the user's own responseStatus for that event
- **AND** the user's attendee entry SHALL be identifiable (e.g., `self: true` flag)

### US-4: Distinguish Required vs Optional Attendees
**As a** user reviewing meeting attendees,
**I want to** see which attendees are required vs optional,
**So that** I can understand the importance of each participant's attendance.

**Acceptance Criteria (EARS Format)**:
- **WHEN** a user requests calendar events via `list_calendar_events`
- **AND** an event has attendees marked as optional
- **THEN** the response SHALL include an `optional` boolean flag for each attendee

### US-5: Backward Compatibility
**As a** developer using the sage MCP server,
**I want to** have new attendee fields added without breaking existing integrations,
**So that** existing implementations continue to work while new features are available.

**Acceptance Criteria (EARS Format)**:
- **WHEN** the attendee information is added to the CalendarEvent interface
- **THEN** all new fields SHALL be optional
- **AND** the existing `attendees?: string[]` field MAY be retained for backward compatibility or removed if deemed unnecessary
- **AND** existing tool consumers SHALL receive responses in a compatible format

## 3. Functional Requirements

### FR-1: Extended Attendee Information
**Requirement**: The system SHALL provide extended attendee information including RSVP status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Attendee's email address |
| displayName | string | No | Attendee's display name |
| responseStatus | enum | Yes | 'accepted', 'declined', 'tentative', 'needsAction' |
| optional | boolean | No | True if attendee is optional (default: false) |
| self | boolean | No | True if this attendee is the authenticated user |
| comment | string | No | Attendee's response comment (if provided) |

**References**: US-1, US-3, US-4

### FR-2: Organizer Information
**Requirement**: The system SHALL provide organizer information for each event.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Organizer's email address |
| displayName | string | No | Organizer's display name |
| self | boolean | No | True if the authenticated user is the organizer |

**References**: US-2

### FR-3: Response Format
**Requirement**: The `list_calendar_events` tool response SHALL include attendee and organizer information in the event objects.

```typescript
{
  events: [{
    id: string,
    title: string,
    start: string,
    end: string,
    // ... existing fields ...
    organizer?: {
      email: string,
      displayName?: string,
      self?: boolean
    },
    attendees?: Array<{
      email: string,
      displayName?: string,
      responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction',
      optional?: boolean,
      self?: boolean,
      comment?: string
    }>
  }]
}
```

**References**: FR-1, FR-2, US-5

### FR-4: Google Calendar Source Support
**Requirement**: The system SHALL extract attendee and organizer information from Google Calendar API responses.

- **IF** the event source is 'google'
- **THEN** the system SHALL map Google Calendar attendee fields to the extended attendee format
- **AND** the system SHALL preserve the `responseStatus` field from the API response

**References**: US-1, FR-1

### FR-5: EventKit Source Handling
**Requirement**: The system SHALL gracefully handle EventKit events which may not have full attendee information.

- **IF** the event source is 'eventkit'
- **AND** attendee information is limited or unavailable
- **THEN** the system SHALL return an empty attendees array or omit the field
- **AND** the system SHALL NOT fail or throw errors

**References**: US-5

## 4. Non-Functional Requirements

### NFR-1: Performance
- Adding attendee information SHALL NOT significantly impact response times
- The system SHOULD NOT make additional API calls to fetch attendee data (it's already included in event responses)

### NFR-2: Data Privacy
- Attendee email addresses and names are already available through Google Calendar API
- The system SHALL only expose information that the authenticated user has permission to view

### NFR-3: Type Safety
- All new interfaces and types SHALL be properly typed in TypeScript
- Type definitions SHALL be exported for external consumers

## 5. Technical Constraints

### TC-1: Google Calendar API
- The Google Calendar API already returns attendee information with `responseStatus` in the events.list response
- No additional API calls or permissions are required

### TC-2: EventKit Limitations
- macOS EventKit provides limited attendee information compared to Google Calendar
- RSVP status may not be available for EventKit events

### TC-3: Existing Code Structure
- Changes must integrate with existing:
  - `CalendarEvent` interface in `src/types/calendar.ts` and `src/types/google-calendar-types.ts`
  - `convertGoogleToCalendarEvent()` function in `src/types/google-calendar-types.ts`
  - `handleListCalendarEvents()` handler in `src/tools/calendar/handlers.ts`

## 6. Dependencies

### Internal Dependencies
- Existing Google Calendar service integration (`src/integrations/google-calendar-service.ts`)
- Calendar source manager (`src/integrations/calendar-source-manager.ts`)
- Calendar tool handlers (`src/tools/calendar/handlers.ts`)

### External Dependencies
- Google Calendar API v3 (already integrated)
- OAuth2 authentication (already implemented)

## 7. Acceptance Test Scenarios

### ATS-1: Basic RSVP Display
**Given** a calendar event with 3 attendees (1 accepted, 1 declined, 1 needsAction)
**When** the user calls `list_calendar_events` for that date
**Then** the response includes all 3 attendees with their correct responseStatus

### ATS-2: Organizer Information
**Given** a calendar event created by another user
**When** the user calls `list_calendar_events` for that event
**Then** the response includes the organizer's email and displayName

### ATS-3: Self Identification
**Given** the authenticated user is an attendee of an event
**When** the user calls `list_calendar_events` for that event
**Then** the user's attendee entry has `self: true`

### ATS-4: Optional Attendees
**Given** an event with both required and optional attendees
**When** the user calls `list_calendar_events` for that event
**Then** optional attendees have `optional: true` and required attendees have `optional: false` or the field is omitted

### ATS-5: EventKit Graceful Handling
**Given** an event from EventKit source without attendee data
**When** the user calls `list_calendar_events` for that event
**Then** the response does not include attendees field or includes an empty array
**And** no error is thrown

## 8. Glossary

| Term | Definition |
|------|------------|
| RSVP | Response status to a meeting invitation (from French: Répondez s'il vous plaît) |
| responseStatus | Google Calendar API field indicating attendance response: accepted, declined, tentative, needsAction |
| needsAction | RSVP status indicating the attendee has not yet responded |
| EventKit | Apple's framework for accessing calendar data on macOS/iOS |
| Organizer | The user who created/owns the calendar event |
