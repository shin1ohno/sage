/**
 * Configuration validation schemas using Zod
 * Provides runtime type validation for user configuration
 */

import { z } from 'zod';
import { validateRecurrenceRules, type ValidationResult as RecurrenceValidationResult } from '../utils/recurrence-validator';

/**
 * EventKit source configuration schema
 */
export const EventKitSourceConfigSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Google Calendar source configuration schema
 */
export const GoogleCalendarSourceConfigSchema = z.object({
  enabled: z.boolean(),
  defaultCalendar: z.string().default('primary'),
  excludedCalendars: z.array(z.string()).default([]),
  syncInterval: z.number().min(60).max(3600).default(300),
  enableNotifications: z.boolean().default(true),
});

/**
 * Calendar sources configuration schema
 * Validates that at least one calendar source is enabled
 */
export const CalendarSourcesSchema = z
  .object({
    eventkit: EventKitSourceConfigSchema,
    google: GoogleCalendarSourceConfigSchema,
  })
  .refine(
    (data) => data.eventkit.enabled || data.google.enabled,
    {
      message: 'At least one calendar source must be enabled',
      path: ['sources'],
    }
  );

/**
 * Validate calendar sources configuration
 * @param sources - The calendar sources configuration to validate
 * @returns Validation result with parsed data or error
 */
export function validateCalendarSources(sources: unknown): {
  success: boolean;
  data?: z.infer<typeof CalendarSourcesSchema>;
  error?: z.ZodError;
} {
  const result = CalendarSourcesSchema.safeParse(sources);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

/**
 * Type exports for validated schemas
 */
export type ValidatedCalendarSources = z.infer<typeof CalendarSourcesSchema>;
export type ValidatedEventKitSourceConfig = z.infer<typeof EventKitSourceConfigSchema>;
export type ValidatedGoogleCalendarSourceConfig = z.infer<typeof GoogleCalendarSourceConfigSchema>;

// ============================================================
// Google Calendar Event Type Schemas
// ============================================================

/**
 * Auto Decline Mode Schema
 * Shared enum for outOfOffice and focusTime events
 * Requirement: 1, 2, 8.2
 */
export const AutoDeclineModeSchema = z.enum([
  'declineNone',
  'declineAllConflictingInvitations',
  'declineOnlyNewConflictingInvitations',
]);

/**
 * Out of Office Properties Schema
 * Requirement: 1, 8.2
 */
export const OutOfOfficePropertiesSchema = z.object({
  autoDeclineMode: AutoDeclineModeSchema,
  declineMessage: z.string().optional(),
});

/**
 * Focus Time Properties Schema
 * Requirement: 2, 8.2
 */
export const FocusTimePropertiesSchema = z.object({
  autoDeclineMode: AutoDeclineModeSchema,
  declineMessage: z.string().optional(),
  chatStatus: z.enum(['available', 'doNotDisturb']).optional(),
});

/**
 * Working Location Properties Schema
 * Requirement: 3, 8.2
 */
export const WorkingLocationPropertiesSchema = z
  .object({
    type: z.enum(['homeOffice', 'officeLocation', 'customLocation']),
    homeOffice: z.boolean().optional(),
    customLocation: z
      .object({
        label: z.string(),
      })
      .optional(),
    officeLocation: z
      .object({
        buildingId: z.string().optional(),
        floorId: z.string().optional(),
        floorSectionId: z.string().optional(),
        deskId: z.string().optional(),
        label: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // Validate that appropriate sub-properties are set based on type
      if (data.type === 'homeOffice') return data.homeOffice !== undefined;
      if (data.type === 'customLocation') return data.customLocation !== undefined;
      if (data.type === 'officeLocation') return data.officeLocation !== undefined;
      return false;
    },
    { message: 'Type-specific properties must be provided based on the working location type' }
  );

/**
 * Birthday Properties Schema
 * Requirement: 4, 8.2
 */
export const BirthdayPropertiesSchema = z.object({
  type: z.enum(['birthday', 'anniversary', 'custom', 'other', 'self']),
  customTypeName: z.string().optional(),
  contact: z.string().optional(),
});

/**
 * Google Calendar Event Type Schema
 * Requirement: 6.2
 */
export const GoogleCalendarEventTypeSchema = z.enum([
  'default',
  'outOfOffice',
  'focusTime',
  'workingLocation',
  'birthday',
  'fromGmail',
]);

/**
 * Type exports for event type schemas
 */
export type ValidatedAutoDeclineMode = z.infer<typeof AutoDeclineModeSchema>;
export type ValidatedOutOfOfficeProperties = z.infer<typeof OutOfOfficePropertiesSchema>;
export type ValidatedFocusTimeProperties = z.infer<typeof FocusTimePropertiesSchema>;
export type ValidatedWorkingLocationProperties = z.infer<typeof WorkingLocationPropertiesSchema>;
export type ValidatedBirthdayProperties = z.infer<typeof BirthdayPropertiesSchema>;
export type ValidatedGoogleCalendarEventType = z.infer<typeof GoogleCalendarEventTypeSchema>;

// ============================================================
// Recurrence Rule Schema
// Requirement: recurring-calendar-events 1.1, 1.3
// ============================================================

/**
 * Recurrence Rule Schema
 * Validates RRULE strings for iCalendar recurrence rules
 * Requirement: recurring-calendar-events 1.1, 1.3
 */
export const RecurrenceRuleSchema = z
  .array(z.string())
  .refine(
    (rules) => {
      const result = validateRecurrenceRules(rules);
      return result.success;
    },
    {
      message: 'Invalid recurrence rules. See validateRecurrence() for detailed error information.',
    }
  );

/**
 * Type export for validated recurrence rules
 */
export type ValidatedRecurrenceRules = z.infer<typeof RecurrenceRuleSchema>;

/**
 * Validate recurrence rules
 * Provides detailed validation errors for RRULE strings
 *
 * @param rules - Array of RRULE strings to validate
 * @returns Validation result with success status and detailed errors
 *
 * @example
 * validateRecurrence(["FREQ=WEEKLY;BYDAY=MO,WE,FR"])
 * // Returns: { success: true, errors: [] }
 *
 * @example
 * validateRecurrence(["FREQ=WEEKLY;COUNT=5;UNTIL=20251231"])
 * // Returns: { success: false, errors: [{ code: "MUTUALLY_EXCLUSIVE", message: "...", rule: "..." }] }
 */
export function validateRecurrence(rules: string[]): RecurrenceValidationResult {
  return validateRecurrenceRules(rules);
}

// ============================================================
// Create Event Request Schema (Task 5)
// Requirement: 4.4, 5.4, 6.4, 6.5, 8.2, 8.3
// ============================================================

/**
 * Reminder Override Schema
 * Validates individual reminder settings for events
 */
export const ReminderOverrideSchema = z.object({
  method: z.enum(['email', 'popup']),
  minutes: z.number().min(0).max(40320), // Max 4 weeks (28 days * 24 hours * 60 minutes)
});

/**
 * Reminders Schema
 * Validates reminder configuration for events
 */
export const RemindersSchema = z.object({
  useDefault: z.boolean(),
  overrides: z.array(ReminderOverrideSchema).max(5).optional(),
});

/**
 * Create Event Request Schema with Event Type Support
 * Comprehensive validation for event creation requests including all event types
 * Requirement: 4.4, 5.4, 6.4, 6.5, 8.2, 8.3
 */
export const CreateEventRequestSchema = z
  .object({
    // Standard event fields
    title: z.string().min(1, 'Event title is required'),
    start: z.string().min(1, 'Start date/time is required'),
    end: z.string().min(1, 'End date/time is required'),
    isAllDay: z.boolean().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string().email('Invalid attendee email address')).optional(),
    reminders: RemindersSchema.optional(),

    // Recurrence rules (RRULE format)
    // Requirement: recurring-calendar-events 1.1
    recurrence: RecurrenceRuleSchema.optional(),

    // Event type and type-specific properties
    eventType: GoogleCalendarEventTypeSchema.optional(),
    outOfOfficeProperties: OutOfOfficePropertiesSchema.optional(),
    focusTimeProperties: FocusTimePropertiesSchema.optional(),
    workingLocationProperties: WorkingLocationPropertiesSchema.optional(),
    birthdayProperties: BirthdayPropertiesSchema.optional(),
  })
  .refine(
    (data) => {
      // Reject fromGmail event creation - these events are auto-generated from Gmail
      // Requirement: 5.4
      if (data.eventType === 'fromGmail') {
        return false;
      }
      return true;
    },
    {
      message:
        'fromGmail events cannot be created via API. They are automatically generated from Gmail messages.',
      path: ['eventType'],
    }
  )
  .refine(
    (data) => {
      // Validate type-property matching
      // Requirement: 6.5, 8.3
      const eventType = data.eventType || 'default';

      // Check which properties are provided
      const hasOutOfOffice = data.outOfOfficeProperties !== undefined;
      const hasFocusTime = data.focusTimeProperties !== undefined;
      const hasWorkingLocation = data.workingLocationProperties !== undefined;
      const hasBirthday = data.birthdayProperties !== undefined;

      switch (eventType) {
        case 'default':
          // Default events should not have any type-specific properties
          return !hasOutOfOffice && !hasFocusTime && !hasWorkingLocation && !hasBirthday;

        case 'outOfOffice':
          // outOfOffice requires outOfOfficeProperties, no other properties
          return hasOutOfOffice && !hasFocusTime && !hasWorkingLocation && !hasBirthday;

        case 'focusTime':
          // focusTime requires focusTimeProperties, no other properties
          return hasFocusTime && !hasOutOfOffice && !hasWorkingLocation && !hasBirthday;

        case 'workingLocation':
          // workingLocation requires workingLocationProperties, no other properties
          return hasWorkingLocation && !hasOutOfOffice && !hasFocusTime && !hasBirthday;

        case 'birthday':
          // birthday requires birthdayProperties, no other properties
          return hasBirthday && !hasOutOfOffice && !hasFocusTime && !hasWorkingLocation;

        default:
          return true;
      }
    },
    {
      message:
        'Event type and properties must match. Each event type requires its corresponding properties: ' +
        'outOfOffice requires outOfOfficeProperties, focusTime requires focusTimeProperties, ' +
        'workingLocation requires workingLocationProperties, birthday requires birthdayProperties. ' +
        'Default events should not have any type-specific properties.',
      path: ['eventType'],
    }
  )
  .refine(
    (data) => {
      // Enforce all-day constraint for birthday and workingLocation events
      // Requirement: 3.1, 4.4
      const eventType = data.eventType || 'default';

      if (eventType === 'birthday' || eventType === 'workingLocation') {
        return data.isAllDay === true;
      }
      return true;
    },
    {
      message:
        'Birthday and workingLocation events must be all-day events. Set isAllDay to true.',
      path: ['isAllDay'],
    }
  )
  .refine(
    (data) => {
      // Enforce timed (non-all-day) constraint for focusTime and outOfOffice events
      // Google Calendar API does not allow all-day events for these types
      const eventType = data.eventType || 'default';

      if (eventType === 'focusTime' || eventType === 'outOfOffice') {
        return data.isAllDay !== true;
      }
      return true;
    },
    {
      message:
        'Focus Time and Out of Office events cannot be all-day events. Set isAllDay to false or omit it.',
      path: ['isAllDay'],
    }
  );

/**
 * Type export for validated create event request
 */
export type ValidatedCreateEventRequest = z.infer<typeof CreateEventRequestSchema>;

/**
 * Validate a create event request
 * @param request - The event creation request to validate
 * @returns Validation result with parsed data or error
 */
export function validateCreateEventRequest(request: unknown): {
  success: boolean;
  data?: ValidatedCreateEventRequest;
  error?: z.ZodError;
} {
  const result = CreateEventRequestSchema.safeParse(request);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

// ============================================================
// Room Availability Schemas
// Requirement: room-availability-search 1.1, 1.2, 2.1
// ============================================================

/**
 * Room Availability Request Schema
 * Validates search parameters for room availability
 * Requirement: room-availability-search 1.1, 1.2
 */
export const RoomAvailabilityRequestSchema = z
  .object({
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().optional(),
    durationMinutes: z.number().min(1).max(480).optional(),
    minCapacity: z.number().min(1).optional(),
    building: z.string().optional(),
    floor: z.string().optional(),
    features: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      // Either endTime or durationMinutes must be specified
      return data.endTime !== undefined || data.durationMinutes !== undefined;
    },
    {
      message: 'Either endTime or durationMinutes must be specified',
      path: ['endTime'],
    }
  )
  // Note: If both endTime and durationMinutes are specified, endTime takes precedence
  .refine(
    (data) => {
      // Validate that startTime is before endTime if endTime is specified
      if (data.endTime) {
        const start = new Date(data.startTime);
        const end = new Date(data.endTime);
        return start < end;
      }
      return true;
    },
    {
      message: 'Start time must be before end time',
      path: ['startTime'],
    }
  );

/**
 * Check Room Availability Schema
 * Validates parameters for checking specific room availability
 * Requirement: room-availability-search 2.1
 */
export const CheckRoomAvailabilitySchema = z
  .object({
    roomId: z.string().min(1, 'Room ID is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
  })
  .refine(
    (data) => {
      const start = new Date(data.startTime);
      const end = new Date(data.endTime);
      return start < end;
    },
    {
      message: 'Start time must be before end time',
      path: ['startTime'],
    }
  );

/**
 * Type exports for room availability schemas
 */
export type ValidatedRoomAvailabilityRequest = z.infer<typeof RoomAvailabilityRequestSchema>;
export type ValidatedCheckRoomAvailability = z.infer<typeof CheckRoomAvailabilitySchema>;

/**
 * Validate room availability request
 * @param request - The room availability request to validate
 * @returns Validation result with parsed data or error
 */
export function validateRoomAvailabilityRequest(request: unknown): {
  success: boolean;
  data?: ValidatedRoomAvailabilityRequest;
  error?: z.ZodError;
} {
  const result = RoomAvailabilityRequestSchema.safeParse(request);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

/**
 * Validate check room availability request
 * @param request - The check room availability request to validate
 * @returns Validation result with parsed data or error
 */
export function validateCheckRoomAvailability(request: unknown): {
  success: boolean;
  data?: ValidatedCheckRoomAvailability;
  error?: z.ZodError;
} {
  const result = CheckRoomAvailabilitySchema.safeParse(request);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

// ============================================================
// Directory People Search Schemas
// Requirement: directory-people-search 1.1
// ============================================================

/**
 * Search Directory People Input Schema
 * Validates search parameters for directory people search
 * Requirement: directory-people-search 1.1
 */
export const SearchDirectoryPeopleInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  pageSize: z.number().min(1).max(50).optional().default(20),
});

/**
 * Type export for validated search directory people input
 */
export type ValidatedSearchDirectoryPeopleInput = z.infer<typeof SearchDirectoryPeopleInputSchema>;

/**
 * Validate search directory people request
 * @param request - The search directory people request to validate
 * @returns Validation result with parsed data or error
 */
export function validateSearchDirectoryPeopleInput(request: unknown): {
  success: boolean;
  data?: ValidatedSearchDirectoryPeopleInput;
  error?: z.ZodError;
} {
  const result = SearchDirectoryPeopleInputSchema.safeParse(request);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

// ============================================================
// People Availability Schemas
// Requirement: check-others-availability 1, 2, 4
// ============================================================

/**
 * Check People Availability Input Schema
 * Validates parameters for checking multiple people's availability
 * Requirement: check-others-availability 1.1, 1.2, 1.3
 */
export const CheckPeopleAvailabilityInputSchema = z.object({
  emails: z
    .array(z.string().email('Invalid email address'))
    .min(1, 'At least one email address is required')
    .max(20, 'Maximum 20 email addresses allowed'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
}).refine(
  (data) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    return start < end;
  },
  {
    message: 'Start time must be before end time',
    path: ['startTime'],
  }
);

/**
 * Find Common Availability Input Schema
 * Validates parameters for finding common free time among participants
 * Supports both names and email addresses as input
 * Requirement: check-others-availability 2.1, 2.2, 2.6, 4.1
 */
export const FindCommonAvailabilityInputSchema = z.object({
  participants: z
    .array(z.string().min(1, 'Participant name or email is required'))
    .min(1, 'At least one participant is required')
    .max(20, 'Maximum 20 participants allowed'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  minDurationMinutes: z.number().min(1).optional().default(30),
  includeMyCalendar: z.boolean().optional().default(true),
}).refine(
  (data) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    return start < end;
  },
  {
    message: 'Start time must be before end time',
    path: ['startTime'],
  }
);

/**
 * Type exports for people availability schemas
 */
export type ValidatedCheckPeopleAvailabilityInput = z.infer<typeof CheckPeopleAvailabilityInputSchema>;
export type ValidatedFindCommonAvailabilityInput = z.infer<typeof FindCommonAvailabilityInputSchema>;

/**
 * Validate check people availability request
 * @param request - The check people availability request to validate
 * @returns Validation result with parsed data or error
 */
export function validateCheckPeopleAvailabilityInput(request: unknown): {
  success: boolean;
  data?: ValidatedCheckPeopleAvailabilityInput;
  error?: z.ZodError;
} {
  const result = CheckPeopleAvailabilityInputSchema.safeParse(request);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

/**
 * Validate find common availability request
 * @param request - The find common availability request to validate
 * @returns Validation result with parsed data or error
 */
export function validateFindCommonAvailabilityInput(request: unknown): {
  success: boolean;
  data?: ValidatedFindCommonAvailabilityInput;
  error?: z.ZodError;
} {
  const result = FindCommonAvailabilityInputSchema.safeParse(request);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}
