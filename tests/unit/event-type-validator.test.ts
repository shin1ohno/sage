/**
 * Unit tests for event type Zod schemas in src/config/validation.ts
 * Task 30: Create comprehensive tests for all event type related schemas
 */

import { describe, expect, test } from '@jest/globals';
import {
  AutoDeclineModeSchema,
  OutOfOfficePropertiesSchema,
  FocusTimePropertiesSchema,
  WorkingLocationPropertiesSchema,
  BirthdayPropertiesSchema,
  GoogleCalendarEventTypeSchema,
  validateCreateEventRequest,
} from '../../src/config/validation.js';

describe('AutoDeclineModeSchema', () => {
  test('should accept "declineNone"', () => {
    const result = AutoDeclineModeSchema.safeParse('declineNone');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('declineNone');
    }
  });

  test('should accept "declineAllConflictingInvitations"', () => {
    const result = AutoDeclineModeSchema.safeParse('declineAllConflictingInvitations');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('declineAllConflictingInvitations');
    }
  });

  test('should accept "declineOnlyNewConflictingInvitations"', () => {
    const result = AutoDeclineModeSchema.safeParse('declineOnlyNewConflictingInvitations');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('declineOnlyNewConflictingInvitations');
    }
  });

  test('should reject invalid autoDeclineMode values', () => {
    const result = AutoDeclineModeSchema.safeParse('invalidMode');
    expect(result.success).toBe(false);
  });

  test('should reject empty string', () => {
    const result = AutoDeclineModeSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  test('should reject non-string values', () => {
    const result = AutoDeclineModeSchema.safeParse(123);
    expect(result.success).toBe(false);
  });
});

describe('OutOfOfficePropertiesSchema', () => {
  describe('autoDeclineMode validation', () => {
    test('should accept valid autoDeclineMode "declineNone"', () => {
      const data = { autoDeclineMode: 'declineNone' };
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should accept valid autoDeclineMode "declineAllConflictingInvitations"', () => {
      const data = { autoDeclineMode: 'declineAllConflictingInvitations' };
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should accept valid autoDeclineMode "declineOnlyNewConflictingInvitations"', () => {
      const data = { autoDeclineMode: 'declineOnlyNewConflictingInvitations' };
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should reject invalid autoDeclineMode values', () => {
      const data = { autoDeclineMode: 'invalidMode' };
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should reject missing autoDeclineMode', () => {
      const data = {};
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('declineMessage validation', () => {
    test('should accept optional declineMessage', () => {
      const data = {
        autoDeclineMode: 'declineAllConflictingInvitations',
        declineMessage: 'I am on vacation',
      };
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.declineMessage).toBe('I am on vacation');
      }
    });

    test('should accept empty declineMessage', () => {
      const data = {
        autoDeclineMode: 'declineNone',
        declineMessage: '',
      };
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should accept missing declineMessage', () => {
      const data = { autoDeclineMode: 'declineNone' };
      const result = OutOfOfficePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.declineMessage).toBeUndefined();
      }
    });
  });
});

describe('FocusTimePropertiesSchema', () => {
  describe('chatStatus validation', () => {
    test('should validate chatStatus "available"', () => {
      const data = {
        autoDeclineMode: 'declineNone',
        chatStatus: 'available',
      };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chatStatus).toBe('available');
      }
    });

    test('should validate chatStatus "doNotDisturb"', () => {
      const data = {
        autoDeclineMode: 'declineAllConflictingInvitations',
        chatStatus: 'doNotDisturb',
      };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chatStatus).toBe('doNotDisturb');
      }
    });

    test('should reject invalid chatStatus values', () => {
      const data = {
        autoDeclineMode: 'declineNone',
        chatStatus: 'busy',
      };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should reject chatStatus with wrong type', () => {
      const data = {
        autoDeclineMode: 'declineNone',
        chatStatus: true,
      };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should accept optional chatStatus (undefined)', () => {
      const data = { autoDeclineMode: 'declineNone' };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chatStatus).toBeUndefined();
      }
    });
  });

  describe('required and optional fields', () => {
    test('should accept all required and optional fields', () => {
      const data = {
        autoDeclineMode: 'declineOnlyNewConflictingInvitations',
        declineMessage: 'In focus time - will respond later',
        chatStatus: 'doNotDisturb',
      };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoDeclineMode).toBe('declineOnlyNewConflictingInvitations');
        expect(result.data.declineMessage).toBe('In focus time - will respond later');
        expect(result.data.chatStatus).toBe('doNotDisturb');
      }
    });

    test('should accept only required field (autoDeclineMode)', () => {
      const data = { autoDeclineMode: 'declineNone' };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should reject missing required field', () => {
      const data = { chatStatus: 'available' };
      const result = FocusTimePropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

describe('WorkingLocationPropertiesSchema', () => {
  describe('type enum validation', () => {
    test('should validate type "homeOffice"', () => {
      const data = {
        type: 'homeOffice',
        homeOffice: true,
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should validate type "officeLocation"', () => {
      const data = {
        type: 'officeLocation',
        officeLocation: { label: 'Main Office' },
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should validate type "customLocation"', () => {
      const data = {
        type: 'customLocation',
        customLocation: { label: 'Coffee Shop' },
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should reject invalid type value', () => {
      const data = {
        type: 'remoteOffice',
        homeOffice: true,
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('homeOffice type requirements', () => {
    test('should require homeOffice property when type is "homeOffice"', () => {
      const data = { type: 'homeOffice' };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should accept homeOffice: true', () => {
      const data = {
        type: 'homeOffice',
        homeOffice: true,
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should accept homeOffice: false', () => {
      const data = {
        type: 'homeOffice',
        homeOffice: false,
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('customLocation type requirements', () => {
    test('should require customLocation when type is "customLocation"', () => {
      const data = { type: 'customLocation' };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should accept valid customLocation', () => {
      const data = {
        type: 'customLocation',
        customLocation: { label: 'Coffee Shop Downtown' },
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customLocation?.label).toBe('Coffee Shop Downtown');
      }
    });

    test('should require label in customLocation', () => {
      const data = {
        type: 'customLocation',
        customLocation: {},
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('officeLocation type requirements', () => {
    test('should require officeLocation when type is "officeLocation"', () => {
      const data = { type: 'officeLocation' };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should accept officeLocation with label only', () => {
      const data = {
        type: 'officeLocation',
        officeLocation: { label: 'Tokyo Office' },
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should accept officeLocation with all optional fields', () => {
      const data = {
        type: 'officeLocation',
        officeLocation: {
          buildingId: 'building-1',
          floorId: 'floor-3',
          floorSectionId: 'section-A',
          deskId: 'desk-42',
          label: 'Main Office - Desk 42',
        },
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.officeLocation?.buildingId).toBe('building-1');
        expect(result.data.officeLocation?.deskId).toBe('desk-42');
      }
    });

    test('should accept officeLocation with empty object', () => {
      const data = {
        type: 'officeLocation',
        officeLocation: {},
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('mismatched type and properties', () => {
    test('should reject homeOffice type with customLocation properties', () => {
      const data = {
        type: 'homeOffice',
        customLocation: { label: 'Coffee Shop' },
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should reject customLocation type with officeLocation properties', () => {
      const data = {
        type: 'customLocation',
        officeLocation: { label: 'Main Office' },
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test('should reject officeLocation type with homeOffice property only', () => {
      const data = {
        type: 'officeLocation',
        homeOffice: true,
      };
      const result = WorkingLocationPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

describe('BirthdayPropertiesSchema', () => {
  describe('type enum validation', () => {
    test('should validate type "birthday"', () => {
      const data = { type: 'birthday' };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should validate type "anniversary"', () => {
      const data = { type: 'anniversary' };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should validate type "custom"', () => {
      const data = { type: 'custom' };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should validate type "other"', () => {
      const data = { type: 'other' };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should validate type "self"', () => {
      const data = { type: 'self' };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should reject invalid type value', () => {
      const data = { type: 'holiday' };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields', () => {
    test('should accept optional customTypeName', () => {
      const data = {
        type: 'custom',
        customTypeName: 'Work Anniversary',
      };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customTypeName).toBe('Work Anniversary');
      }
    });

    test('should accept optional contact', () => {
      const data = {
        type: 'birthday',
        contact: 'contacts/abc123',
      };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contact).toBe('contacts/abc123');
      }
    });

    test('should accept all fields together', () => {
      const data = {
        type: 'custom',
        customTypeName: 'Anniversary',
        contact: 'contacts/xyz789',
      };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test('should accept type only without optional fields', () => {
      const data = { type: 'birthday' };
      const result = BirthdayPropertiesSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customTypeName).toBeUndefined();
        expect(result.data.contact).toBeUndefined();
      }
    });
  });
});

describe('GoogleCalendarEventTypeSchema', () => {
  test('should accept all valid event types', () => {
    const validTypes = ['default', 'outOfOffice', 'focusTime', 'workingLocation', 'birthday', 'fromGmail'];
    for (const type of validTypes) {
      const result = GoogleCalendarEventTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  test('should reject invalid event type', () => {
    const result = GoogleCalendarEventTypeSchema.safeParse('meeting');
    expect(result.success).toBe(false);
  });
});

describe('CreateEventRequestSchema - Event Type Validation', () => {
  describe('fromGmail event rejection', () => {
    test('should reject fromGmail event creation', () => {
      const event = {
        title: 'Flight Confirmation',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        eventType: 'fromGmail',
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain('fromGmail events cannot be created via API');
    });
  });

  describe('outOfOffice event type-property matching', () => {
    test('should require outOfOfficeProperties for outOfOffice eventType', () => {
      const event = {
        title: 'Vacation',
        start: '2025-01-20T00:00:00+09:00',
        end: '2025-01-25T00:00:00+09:00',
        eventType: 'outOfOffice',
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes('eventType'))).toBe(true);
    });

    test('should accept outOfOffice with valid outOfOfficeProperties', () => {
      const event = {
        title: 'Vacation',
        start: '2025-01-20T00:00:00+09:00',
        end: '2025-01-25T00:00:00+09:00',
        eventType: 'outOfOffice',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineAllConflictingInvitations',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });
  });

  describe('focusTime event type-property matching', () => {
    test('should require focusTimeProperties for focusTime eventType', () => {
      const event = {
        title: 'Deep Work',
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T12:00:00+09:00',
        eventType: 'focusTime',
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });

    test('should accept focusTime with valid focusTimeProperties', () => {
      const event = {
        title: 'Deep Work',
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T12:00:00+09:00',
        eventType: 'focusTime',
        focusTimeProperties: {
          autoDeclineMode: 'declineOnlyNewConflictingInvitations',
          chatStatus: 'doNotDisturb',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });
  });

  describe('birthday event constraints', () => {
    test('should enforce isAllDay=true for birthday events', () => {
      const event = {
        title: 'John Birthday',
        start: '2025-03-15T10:00:00+09:00',
        end: '2025-03-15T11:00:00+09:00',
        eventType: 'birthday',
        birthdayProperties: {
          type: 'birthday',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes('isAllDay'))).toBe(true);
    });

    test('should accept birthday event with isAllDay=true', () => {
      const event = {
        title: 'John Birthday',
        start: '2025-03-15',
        end: '2025-03-16',
        isAllDay: true,
        eventType: 'birthday',
        birthdayProperties: {
          type: 'birthday',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    test('should reject birthday event with isAllDay=false', () => {
      const event = {
        title: 'John Birthday',
        start: '2025-03-15',
        end: '2025-03-16',
        isAllDay: false,
        eventType: 'birthday',
        birthdayProperties: {
          type: 'birthday',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });

  describe('workingLocation event constraints', () => {
    test('should enforce isAllDay=true for workingLocation events', () => {
      const event = {
        title: 'Work from Home',
        start: '2025-01-15T09:00:00+09:00',
        end: '2025-01-15T17:00:00+09:00',
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
      expect(result.error?.issues.some(i => i.path.includes('isAllDay'))).toBe(true);
    });

    test('should accept workingLocation event with isAllDay=true', () => {
      const event = {
        title: 'Work from Home',
        start: '2025-01-15',
        end: '2025-01-16',
        isAllDay: true,
        eventType: 'workingLocation',
        workingLocationProperties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });
  });

  describe('default event type validation', () => {
    test('should accept default eventType without type-specific properties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        eventType: 'default',
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    test('should accept implicit default event (no eventType specified)', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(true);
    });

    test('should reject default event with outOfOfficeProperties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        eventType: 'default',
        outOfOfficeProperties: {
          autoDeclineMode: 'declineNone',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });

    test('should reject default event with focusTimeProperties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        focusTimeProperties: {
          autoDeclineMode: 'declineNone',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });

    test('should reject default event with workingLocationProperties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        workingLocationProperties: {
          type: 'homeOffice',
          homeOffice: true,
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });

    test('should reject default event with birthdayProperties', () => {
      const event = {
        title: 'Team Meeting',
        start: '2025-01-15T10:00:00+09:00',
        end: '2025-01-15T11:00:00+09:00',
        birthdayProperties: {
          type: 'birthday',
        },
      };
      const result = validateCreateEventRequest(event);
      expect(result.success).toBe(false);
    });
  });
});
