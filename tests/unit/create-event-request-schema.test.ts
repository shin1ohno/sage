/**
 * Unit tests for CreateEventRequestSchema
 * Task 5: Create CreateEventRequestSchema with event type validation
 * Requirements: 4.4, 5.4, 6.4, 6.5, 8.2, 8.3
 */

import { validateCreateEventRequest } from '../../src/config/validation';

describe('CreateEventRequestSchema', () => {
  describe('Standard event fields', () => {
    it('should accept valid default event with required fields only', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(event);
    });

    it('should accept valid default event with all optional fields', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        isAllDay: false,
        location: 'Conference Room A',
        description: 'Weekly sync meeting',
        attendees: ['alice@example.com', 'bob@example.com'],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup' as const, minutes: 10 },
            { method: 'email' as const, minutes: 60 },
          ],
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should reject event with empty title', () => {
      const event = {
        title: '',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Event title is required');
    });

    it('should reject event with invalid attendee email', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        attendees: ['alice@example.com', 'not-an-email'],
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Invalid attendee email address');
    });
  });

  describe('Out of Office events', () => {
    it('should accept valid outOfOffice event', () => {
      const event = {
        title: 'Vacation',
        start: '2025-01-20T00:00:00+09:00',
        end: '2025-01-25T00:00:00+09:00',
        eventType: 'outOfOffice' as const,
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations' as const,
          declineMessage: 'I am on vacation',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should reject outOfOffice event without outOfOfficeProperties', () => {
      const event = {
        title: 'Vacation',
        start: '2025-01-20T00:00:00+09:00',
        end: '2025-01-25T00:00:00+09:00',
        eventType: 'outOfOffice' as const,
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toContain('eventType');
    });

    it('should reject outOfOffice event with wrong properties', () => {
      const event = {
        title: 'Vacation',
        start: '2025-01-20T00:00:00+09:00',
        end: '2025-01-25T00:00:00+09:00',
        eventType: 'outOfOffice' as const,
        focusTimeProperties: {
          autoDeclineMode: 'declineNone' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });

  describe('Focus Time events', () => {
    it('should accept valid focusTime event', () => {
      const event = {
        title: 'Deep Work',
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T12:00:00+09:00',
        eventType: 'focusTime' as const,
        focusTimeProperties: {
          autoDeclineMode: 'declineOnlyNewConflictingInvitations' as const,
          chatStatus: 'doNotDisturb' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should reject focusTime event without focusTimeProperties', () => {
      const event = {
        title: 'Deep Work',
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T12:00:00+09:00',
        eventType: 'focusTime' as const,
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });

  describe('Working Location events', () => {
    it('should accept valid workingLocation event with homeOffice', () => {
      const event = {
        title: 'Work from Home',
        start: '2025-01-15',
        end: '2025-01-16',
        isAllDay: true,
        eventType: 'workingLocation' as const,
        workingLocationProperties: {
          type: 'homeOffice' as const,
          homeOffice: true,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should accept valid workingLocation event with officeLocation', () => {
      const event = {
        title: 'Office Day',
        start: '2025-01-15',
        end: '2025-01-16',
        isAllDay: true,
        eventType: 'workingLocation' as const,
        workingLocationProperties: {
          type: 'officeLocation' as const,
          officeLocation: {
            buildingId: 'building-1',
            label: 'Main Office',
          },
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should accept valid workingLocation event with customLocation', () => {
      const event = {
        title: 'Working at Cafe',
        start: '2025-01-15',
        end: '2025-01-16',
        isAllDay: true,
        eventType: 'workingLocation' as const,
        workingLocationProperties: {
          type: 'customLocation' as const,
          customLocation: {
            label: 'Coffee Shop Downtown',
          },
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should reject workingLocation event without isAllDay', () => {
      const event = {
        title: 'Work from Home',
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T17:00:00+09:00',
        eventType: 'workingLocation' as const,
        workingLocationProperties: {
          type: 'homeOffice' as const,
          homeOffice: true,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes('isAllDay'))).toBe(true);
      expect(result.error?.issues[0]?.message).toContain('all-day events');
    });

    it('should reject workingLocation event without workingLocationProperties', () => {
      const event = {
        title: 'Work from Home',
        start: '2025-01-15',
        end: '2025-01-16',
        isAllDay: true,
        eventType: 'workingLocation' as const,
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });

  describe('Birthday events', () => {
    it('should accept valid birthday event', () => {
      const event = {
        title: 'John Birthday',
        start: '2025-03-15',
        end: '2025-03-16',
        isAllDay: true,
        eventType: 'birthday' as const,
        birthdayProperties: {
          type: 'birthday' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should accept anniversary birthday event', () => {
      const event = {
        title: 'Wedding Anniversary',
        start: '2025-06-20',
        end: '2025-06-21',
        isAllDay: true,
        eventType: 'birthday' as const,
        birthdayProperties: {
          type: 'anniversary' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should reject birthday event without isAllDay', () => {
      const event = {
        title: 'John Birthday',
        start: '2025-03-15T09:00:00+09:00',
        end: '2025-03-15T10:00:00+09:00',
        eventType: 'birthday' as const,
        birthdayProperties: {
          type: 'birthday' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes('isAllDay'))).toBe(true);
    });

    it('should reject birthday event without birthdayProperties', () => {
      const event = {
        title: 'John Birthday',
        start: '2025-03-15',
        end: '2025-03-16',
        isAllDay: true,
        eventType: 'birthday' as const,
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });

  describe('fromGmail events (Requirement: 5.4)', () => {
    it('should reject fromGmail event creation', () => {
      const event = {
        title: 'Flight Booking',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        eventType: 'fromGmail' as const,
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain('fromGmail events cannot be created via API');
      expect(result.error?.issues[0]?.path).toContain('eventType');
    });
  });

  describe('Default events with type-specific properties', () => {
    it('should reject default event with outOfOfficeProperties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineNone' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain('Default events should not have any type-specific properties');
    });

    it('should reject default event with focusTimeProperties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        focusTimeProperties: {
          autoDeclineMode: 'declineNone' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });

    it('should reject event with explicit default type and type-specific properties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        eventType: 'default' as const,
        birthdayProperties: {
          type: 'birthday' as const,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });

  describe('Reminders validation', () => {
    it('should accept valid reminder overrides', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup' as const, minutes: 10 },
            { method: 'email' as const, minutes: 60 },
          ],
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should accept reminders with useDefault true', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        reminders: {
          useDefault: true,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    it('should reject reminder with negative minutes', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup' as const, minutes: -5 }],
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });
});
