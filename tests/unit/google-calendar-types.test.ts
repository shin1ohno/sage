/**
 * Google Calendar Types Unit Tests
 * Tests for event type detection and conversion functions
 * Requirements: Task 29 - Create test file for event type conversion
 */

import {
  detectEventType,
  extractTypeSpecificProperties,
  convertGoogleToCalendarEvent,
  areEventsDuplicate,
  GoogleCalendarEvent,
  OutOfOfficeProperties,
  FocusTimeProperties,
  WorkingLocationProperties,
  BirthdayProperties,
  CalendarEvent,
} from '../../src/types/google-calendar-types.js';

describe('Google Calendar Types', () => {
  describe('detectEventType', () => {
    it('should return "default" when no eventType field', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Test Event',
        start: { dateTime: '2025-01-15T10:00:00+09:00' },
        end: { dateTime: '2025-01-15T11:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
      };

      const result = detectEventType(event);

      expect(result).toBe('default');
    });

    it('should return "outOfOffice" when eventType="outOfOffice"', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Vacation',
        start: { dateTime: '2025-01-15T00:00:00+09:00' },
        end: { dateTime: '2025-01-16T00:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'On vacation',
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('outOfOffice');
    });

    it('should return "focusTime" when eventType="focusTime"', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Deep Work',
        start: { dateTime: '2025-01-15T09:00:00+09:00' },
        end: { dateTime: '2025-01-15T12:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'focusTime',
        focusTimeProperties: {
          autoDeclineMode: 'declineOnlyNewConflictingInvitations',
          chatStatus: 'doNotDisturb',
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('focusTime');
    });

    it('should return "workingLocation" when eventType="workingLocation"', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Working from home',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('workingLocation');
    });

    it('should return "birthday" when eventType="birthday"', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: "John's Birthday",
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        eventType: 'birthday',
        birthdayProperties: {
          type: 'birthday',
          contact: 'people/12345',
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('birthday');
    });

    it('should return "fromGmail" when eventType="fromGmail"', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Flight to Tokyo',
        start: { dateTime: '2025-01-15T08:00:00+09:00' },
        end: { dateTime: '2025-01-15T10:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'fromGmail',
      };

      const result = detectEventType(event);

      expect(result).toBe('fromGmail');
    });

    it('should detect from outOfOfficeProperties if eventType field missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'OOO - Sick Leave',
        start: { dateTime: '2025-01-15T00:00:00+09:00' },
        end: { dateTime: '2025-01-16T00:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'Out sick',
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('outOfOffice');
    });

    it('should detect from focusTimeProperties if eventType field missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Focus Block',
        start: { dateTime: '2025-01-15T09:00:00+09:00' },
        end: { dateTime: '2025-01-15T11:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        focusTimeProperties: {
          autoDeclineMode: 'declineNone',
          chatStatus: 'available',
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('focusTime');
    });

    it('should detect from workingLocationProperties if eventType field missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'At Office',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        workingLocationProperties: {
          type: 'officeLocation',
          officeLocation: {
            buildingId: 'building-a',
            floorId: '3',
          },
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('workingLocation');
    });

    it('should detect from birthdayProperties if eventType field missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Anniversary',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        birthdayProperties: {
          type: 'anniversary',
        },
      };

      const result = detectEventType(event);

      expect(result).toBe('birthday');
    });

    it('should default to "default" if no eventType and no type-specific properties', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Regular Meeting',
        start: { dateTime: '2025-01-15T14:00:00+09:00' },
        end: { dateTime: '2025-01-15T15:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        description: 'Weekly team sync',
        location: 'Conference Room A',
      };

      const result = detectEventType(event);

      expect(result).toBe('default');
    });
  });

  describe('extractTypeSpecificProperties', () => {
    it('should return OutOfOfficeProperties for outOfOffice type', () => {
      const outOfOfficeProps: OutOfOfficeProperties = {
        autoDeclineMode: 'declineAllConflictingInvitations',
        declineMessage: 'On vacation until next week',
      };
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Vacation',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-20' },
        iCalUID: 'uid-1@example.com',
        eventType: 'outOfOffice',
        outOfOfficeProperties: outOfOfficeProps,
      };

      const result = extractTypeSpecificProperties(event, 'outOfOffice');

      expect(result).toBeDefined();
      expect(result?.eventType).toBe('outOfOffice');
      expect(result?.properties).toEqual(outOfOfficeProps);
    });

    it('should return FocusTimeProperties for focusTime type', () => {
      const focusTimeProps: FocusTimeProperties = {
        autoDeclineMode: 'declineOnlyNewConflictingInvitations',
        declineMessage: 'In focus mode',
        chatStatus: 'doNotDisturb',
      };
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Deep Work',
        start: { dateTime: '2025-01-15T09:00:00+09:00' },
        end: { dateTime: '2025-01-15T12:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'focusTime',
        focusTimeProperties: focusTimeProps,
      };

      const result = extractTypeSpecificProperties(event, 'focusTime');

      expect(result).toBeDefined();
      expect(result?.eventType).toBe('focusTime');
      expect(result?.properties).toEqual(focusTimeProps);
    });

    it('should return WorkingLocationProperties for workingLocation type', () => {
      const workingLocationProps: WorkingLocationProperties = {
        type: 'officeLocation',
        officeLocation: {
          buildingId: 'building-hq',
          floorId: '5',
          deskId: 'desk-42',
          label: 'Main Office',
        },
      };
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'At Office',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        eventType: 'workingLocation',
        workingLocationProperties: workingLocationProps,
      };

      const result = extractTypeSpecificProperties(event, 'workingLocation');

      expect(result).toBeDefined();
      expect(result?.eventType).toBe('workingLocation');
      expect(result?.properties).toEqual(workingLocationProps);
    });

    it('should return BirthdayProperties for birthday type', () => {
      const birthdayProps: BirthdayProperties = {
        type: 'birthday',
        contact: 'people/67890',
      };
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: "Jane's Birthday",
        start: { date: '2025-03-20' },
        end: { date: '2025-03-21' },
        iCalUID: 'uid-1@example.com',
        eventType: 'birthday',
        birthdayProperties: birthdayProps,
      };

      const result = extractTypeSpecificProperties(event, 'birthday');

      expect(result).toBeDefined();
      expect(result?.eventType).toBe('birthday');
      expect(result?.properties).toEqual(birthdayProps);
    });

    it('should return undefined for default type', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Regular Meeting',
        start: { dateTime: '2025-01-15T14:00:00+09:00' },
        end: { dateTime: '2025-01-15T15:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'default',
      };

      const result = extractTypeSpecificProperties(event, 'default');

      expect(result).toBeUndefined();
    });

    it('should return undefined for fromGmail type', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Hotel Reservation',
        start: { dateTime: '2025-01-15T15:00:00+09:00' },
        end: { dateTime: '2025-01-16T11:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'fromGmail',
      };

      const result = extractTypeSpecificProperties(event, 'fromGmail');

      expect(result).toBeUndefined();
    });

    it('should return undefined when eventType is outOfOffice but properties are missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'OOO Event',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        eventType: 'outOfOffice',
        // outOfOfficeProperties is missing
      };

      const result = extractTypeSpecificProperties(event, 'outOfOffice');

      expect(result).toBeUndefined();
    });

    it('should return undefined when eventType is focusTime but properties are missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Focus Block',
        start: { dateTime: '2025-01-15T09:00:00+09:00' },
        end: { dateTime: '2025-01-15T11:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'focusTime',
        // focusTimeProperties is missing
      };

      const result = extractTypeSpecificProperties(event, 'focusTime');

      expect(result).toBeUndefined();
    });
  });

  describe('convertGoogleToCalendarEvent backward compatibility', () => {
    it('should preserve all existing fields (id, title, start, end, isAllDay, etc.)', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'google-event-123',
        summary: 'Team Meeting',
        start: { dateTime: '2025-01-15T10:00:00+09:00' },
        end: { dateTime: '2025-01-15T11:00:00+09:00' },
        iCalUID: 'uid-123@example.com',
        description: 'Weekly team sync meeting',
        location: 'Conference Room B',
        status: 'confirmed',
        attendees: [
          { email: 'user1@example.com', responseStatus: 'accepted' },
          { email: 'user2@example.com', responseStatus: 'tentative' },
        ],
        organizer: {
          email: 'organizer@example.com',
          displayName: 'Organizer Name',
        },
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.id).toBe('google-event-123');
      expect(result.title).toBe('Team Meeting');
      expect(result.start).toBe('2025-01-15T10:00:00+09:00');
      expect(result.end).toBe('2025-01-15T11:00:00+09:00');
      expect(result.isAllDay).toBe(false);
      expect(result.source).toBe('google');
      expect(result.description).toBe('Weekly team sync meeting');
      expect(result.location).toBe('Conference Room B');
      expect(result.status).toBe('confirmed');
      expect(result.iCalUID).toBe('uid-123@example.com');
      expect(result.attendees).toEqual(['user1@example.com', 'user2@example.com']);
      expect(result.calendar).toBe('organizer@example.com');
    });

    it('should add eventType field', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Focus Time',
        start: { dateTime: '2025-01-15T09:00:00+09:00' },
        end: { dateTime: '2025-01-15T12:00:00+09:00' },
        iCalUID: 'uid-1@example.com',
        eventType: 'focusTime',
        focusTimeProperties: {
          autoDeclineMode: 'declineOnlyNewConflictingInvitations',
          chatStatus: 'doNotDisturb',
        },
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.eventType).toBe('focusTime');
    });

    it('should add typeSpecificProperties when applicable', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Vacation',
        start: { date: '2025-01-20' },
        end: { date: '2025-01-25' },
        iCalUID: 'uid-1@example.com',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
          declineMessage: 'On vacation',
        },
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.eventType).toBe('outOfOffice');
      expect(result.typeSpecificProperties).toBeDefined();
      expect(result.typeSpecificProperties?.eventType).toBe('outOfOffice');
      expect(result.typeSpecificProperties?.properties).toEqual({
        autoDeclineMode: 'declineAllConflictingInvitations',
        declineMessage: 'On vacation',
      });
    });

    it('should work with minimal event data', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'minimal-event',
        summary: 'Quick Call',
        start: { dateTime: '2025-01-15T14:00:00+09:00' },
        end: { dateTime: '2025-01-15T14:30:00+09:00' },
        iCalUID: 'uid-minimal@example.com',
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.id).toBe('minimal-event');
      expect(result.title).toBe('Quick Call');
      expect(result.start).toBe('2025-01-15T14:00:00+09:00');
      expect(result.end).toBe('2025-01-15T14:30:00+09:00');
      expect(result.isAllDay).toBe(false);
      expect(result.source).toBe('google');
      expect(result.iCalUID).toBe('uid-minimal@example.com');
      expect(result.eventType).toBe('default');
      expect(result.typeSpecificProperties).toBeUndefined();
    });

    it('should handle all-day events correctly', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'allday-event',
        summary: 'Company Holiday',
        start: { date: '2025-01-01' },
        end: { date: '2025-01-02' },
        iCalUID: 'uid-allday@example.com',
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.isAllDay).toBe(true);
      expect(result.start).toBe('2025-01-01');
      expect(result.end).toBe('2025-01-02');
    });

    it('should handle workingLocation events', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'wfh-event',
        summary: 'Working from Home',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-wfh@example.com',
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.eventType).toBe('workingLocation');
      expect(result.typeSpecificProperties?.eventType).toBe('workingLocation');
      expect(result.typeSpecificProperties?.properties).toEqual({
        type: 'homeOffice',
        homeOffice: true,
      });
    });

    it('should handle birthday events', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'birthday-event',
        summary: "Alice's Birthday",
        start: { date: '2025-05-10' },
        end: { date: '2025-05-11' },
        iCalUID: 'uid-birthday@example.com',
        eventType: 'birthday',
        birthdayProperties: {
          type: 'birthday',
          contact: 'people/alice-123',
        },
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.eventType).toBe('birthday');
      expect(result.typeSpecificProperties?.eventType).toBe('birthday');
      expect(result.typeSpecificProperties?.properties).toEqual({
        type: 'birthday',
        contact: 'people/alice-123',
      });
    });

    it('should handle fromGmail events without typeSpecificProperties', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'gmail-event',
        summary: 'Flight Confirmation',
        start: { dateTime: '2025-02-01T08:00:00+09:00' },
        end: { dateTime: '2025-02-01T12:00:00+09:00' },
        iCalUID: 'uid-gmail@example.com',
        eventType: 'fromGmail',
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.eventType).toBe('fromGmail');
      expect(result.typeSpecificProperties).toBeUndefined();
    });

    it('should detect eventType from properties when eventType field is missing', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'no-type-field',
        summary: 'Focus Time Block',
        start: { dateTime: '2025-01-15T09:00:00+09:00' },
        end: { dateTime: '2025-01-15T11:00:00+09:00' },
        iCalUID: 'uid-notype@example.com',
        // eventType field is missing, but focusTimeProperties is present
        focusTimeProperties: {
          autoDeclineMode: 'declineNone',
          chatStatus: 'available',
        },
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.eventType).toBe('focusTime');
      expect(result.typeSpecificProperties).toBeDefined();
      expect(result.typeSpecificProperties?.eventType).toBe('focusTime');
    });

    it('should handle event with empty attendees list', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'no-attendees',
        summary: 'Personal Reminder',
        start: { dateTime: '2025-01-15T10:00:00+09:00' },
        end: { dateTime: '2025-01-15T10:30:00+09:00' },
        iCalUID: 'uid-personal@example.com',
        attendees: [],
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.attendees).toEqual([]);
    });

    it('should handle customLocation in workingLocation events', () => {
      const googleEvent: GoogleCalendarEvent = {
        id: 'custom-location',
        summary: 'At Coworking Space',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-custom@example.com',
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'customLocation',
          customLocation: {
            label: 'WeWork Downtown',
          },
        },
      };

      const result = convertGoogleToCalendarEvent(googleEvent);

      expect(result.eventType).toBe('workingLocation');
      expect(result.typeSpecificProperties?.properties).toEqual({
        type: 'customLocation',
        customLocation: {
          label: 'WeWork Downtown',
        },
      });
    });
  });

  describe('extractTypeSpecificProperties - missing properties branches', () => {
    it('should return undefined when eventType is workingLocation but properties are missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Working Location Event',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        eventType: 'workingLocation',
        // workingLocationProperties is missing
      };

      const result = extractTypeSpecificProperties(event, 'workingLocation');

      expect(result).toBeUndefined();
    });

    it('should return undefined when eventType is birthday but properties are missing', () => {
      const event: GoogleCalendarEvent = {
        id: 'event-1',
        summary: 'Birthday Event',
        start: { date: '2025-01-15' },
        end: { date: '2025-01-16' },
        iCalUID: 'uid-1@example.com',
        eventType: 'birthday',
        // birthdayProperties is missing
      };

      const result = extractTypeSpecificProperties(event, 'birthday');

      expect(result).toBeUndefined();
    });
  });

  describe('areEventsDuplicate', () => {
    it('should return true when iCalUIDs match', () => {
      const event1: CalendarEvent = {
        id: 'event-1',
        title: 'Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google',
        iCalUID: 'unique-uid@example.com',
      };
      const event2: CalendarEvent = {
        id: 'event-2',
        title: 'Different Title',
        start: '2025-01-16T10:00:00+09:00',
        end: '2025-01-16T11:00:00+09:00',
        isAllDay: false,
        source: 'eventkit',
        iCalUID: 'unique-uid@example.com',
      };

      expect(areEventsDuplicate(event1, event2)).toBe(true);
    });

    it('should return true when title, start and end match', () => {
      const event1: CalendarEvent = {
        id: 'event-1',
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google',
      };
      const event2: CalendarEvent = {
        id: 'event-2',
        title: 'team meeting', // case insensitive
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'eventkit',
      };

      expect(areEventsDuplicate(event1, event2)).toBe(true);
    });

    it('should return false when only title matches', () => {
      const event1: CalendarEvent = {
        id: 'event-1',
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google',
      };
      const event2: CalendarEvent = {
        id: 'event-2',
        title: 'Team Meeting',
        start: '2025-01-16T10:00:00+09:00', // different day
        end: '2025-01-16T11:00:00+09:00',
        isAllDay: false,
        source: 'eventkit',
      };

      expect(areEventsDuplicate(event1, event2)).toBe(false);
    });

    it('should return false when only start and end match', () => {
      const event1: CalendarEvent = {
        id: 'event-1',
        title: 'Meeting A',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google',
      };
      const event2: CalendarEvent = {
        id: 'event-2',
        title: 'Meeting B',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'eventkit',
      };

      expect(areEventsDuplicate(event1, event2)).toBe(false);
    });

    it('should return false when iCalUIDs are different', () => {
      const event1: CalendarEvent = {
        id: 'event-1',
        title: 'Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google',
        iCalUID: 'uid-1@example.com',
      };
      const event2: CalendarEvent = {
        id: 'event-2',
        title: 'Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'eventkit',
        iCalUID: 'uid-2@example.com',
      };

      // Even with same title/times, different iCalUIDs means fallback to title+time check
      // But in this case title and times match, so it should be true
      expect(areEventsDuplicate(event1, event2)).toBe(true);
    });

    it('should return false when one has iCalUID and they differ in other fields', () => {
      const event1: CalendarEvent = {
        id: 'event-1',
        title: 'Meeting A',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google',
        iCalUID: 'uid-1@example.com',
      };
      const event2: CalendarEvent = {
        id: 'event-2',
        title: 'Meeting B',
        start: '2025-01-16T10:00:00+09:00',
        end: '2025-01-16T11:00:00+09:00',
        isAllDay: false,
        source: 'eventkit',
        // no iCalUID
      };

      expect(areEventsDuplicate(event1, event2)).toBe(false);
    });

    it('should return false when end times differ', () => {
      const event1: CalendarEvent = {
        id: 'event-1',
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        source: 'google',
      };
      const event2: CalendarEvent = {
        id: 'event-2',
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T12:00:00+09:00', // different end time
        isAllDay: false,
        source: 'eventkit',
      };

      expect(areEventsDuplicate(event1, event2)).toBe(false);
    });
  });
});
