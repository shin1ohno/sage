/**
 * Google Calendar Service
 * Requirements: 1, 10 (Google Calendar OAuth Authentication, Health Check)
 *
 * Provides Google Calendar API integration with OAuth authentication,
 * event CRUD operations, and calendar management.
 */

import { google, calendar_v3 } from 'googleapis';
import { GoogleOAuthHandler } from '../oauth/google-oauth-handler.js';
import { calendarLogger } from '../utils/logger.js';
import type {
  CalendarEvent,
  CalendarInfo,
  GoogleCalendarEvent,
  GoogleCalendarEventType,
  OutOfOfficeProperties,
  FocusTimeProperties,
  WorkingLocationProperties,
  BirthdayProperties,
  PersonAvailability,
  PeopleAvailabilityResult,
  BusyPeriod,
  CommonFreeSlot,
  CommonAvailabilityResult,
  ResolvedParticipant,
  RecurrenceScope,
} from '../types/google-calendar-types.js';
import { convertGoogleToCalendarEvent, detectEventType } from '../types/google-calendar-types.js';
import { retryWithBackoff } from '../utils/retry.js';
import { CreateEventRequestSchema } from '../config/validation.js';

/**
 * Allowed update fields per event type
 * Requirement: 4.5, 5.3, 6.6 - Event type update restrictions
 *
 * @description Defines which fields can be updated for each event type.
 * - birthday: Can only update summary, colorId, reminders, and date (start/end)
 * - fromGmail: Can only update colorId, reminders, visibility, transparency, status, attendees, extendedProperties
 * - default, outOfOffice, focusTime, workingLocation: All fields allowed
 */
const ALLOWED_UPDATE_FIELDS: Record<GoogleCalendarEventType, Set<string>> = {
  birthday: new Set(['title', 'reminders', 'start', 'end', 'isAllDay']),
  fromGmail: new Set(['reminders', 'attendees']),
  default: new Set(['title', 'location', 'description', 'start', 'end', 'isAllDay', 'attendees', 'reminders', 'eventType', 'outOfOfficeProperties', 'focusTimeProperties', 'workingLocationProperties', 'birthdayProperties']),
  outOfOffice: new Set(['title', 'location', 'description', 'start', 'end', 'isAllDay', 'attendees', 'reminders', 'eventType', 'outOfOfficeProperties', 'focusTimeProperties', 'workingLocationProperties', 'birthdayProperties']),
  focusTime: new Set(['title', 'location', 'description', 'start', 'end', 'isAllDay', 'attendees', 'reminders', 'eventType', 'outOfOfficeProperties', 'focusTimeProperties', 'workingLocationProperties', 'birthdayProperties']),
  workingLocation: new Set(['title', 'location', 'description', 'start', 'end', 'isAllDay', 'attendees', 'reminders', 'eventType', 'outOfOfficeProperties', 'focusTimeProperties', 'workingLocationProperties', 'birthdayProperties']),
};

/**
 * Get human-readable field names for error messages
 */
function getReadableFieldName(field: string): string {
  const fieldNames: Record<string, string> = {
    title: 'summary',
    location: 'location',
    description: 'description',
    start: 'start date/time',
    end: 'end date/time',
    isAllDay: 'all-day setting',
    attendees: 'attendees',
    reminders: 'reminders',
    eventType: 'event type',
    outOfOfficeProperties: 'out of office properties',
    focusTimeProperties: 'focus time properties',
    workingLocationProperties: 'working location properties',
    birthdayProperties: 'birthday properties',
  };
  return fieldNames[field] || field;
}

/**
 * Validate update fields against event type restrictions
 * Requirement: 4.5, 5.3, 6.6 - Event type update restrictions
 *
 * @param eventType - The event type of the existing event
 * @param updates - The fields being updated
 * @throws Error if disallowed fields are being updated
 */
function validateUpdateFieldsForEventType(
  eventType: GoogleCalendarEventType,
  updates: Partial<CreateEventRequest>
): void {
  const allowedFields = ALLOWED_UPDATE_FIELDS[eventType];

  // Get the keys of the updates object that have defined values
  const updateKeys = Object.keys(updates).filter(
    (key) => updates[key as keyof typeof updates] !== undefined
  );

  // Find disallowed fields
  const disallowedFields = updateKeys.filter((key) => !allowedFields.has(key));

  if (disallowedFields.length > 0) {
    const readableDisallowed = disallowedFields.map(getReadableFieldName).join(', ');
    const readableAllowed = Array.from(allowedFields).map(getReadableFieldName).join(', ');

    throw new Error(
      `Cannot update ${readableDisallowed} for ${eventType} events. ` +
      `Allowed fields for ${eventType} events: ${readableAllowed}.`
    );
  }
}

/**
 * Determine the recurrence scope for an update operation
 * Requirements: 2.1, 2.4, 3.1, 4.1 - Default scope behavior
 *
 * @param scope - Explicitly specified scope (if any)
 * @param existingEvent - The event being updated
 * @returns The recurrence scope to use for the operation
 *
 * @description
 * Logic:
 * 1. If scope is explicitly specified, use it
 * 2. If event is a recurring instance (has recurringEventId), default to 'thisEvent'
 * 3. If event is a recurring parent (has recurrence rules), default to 'allEvents'
 * 4. For non-recurring events, scope is ignored (returned but not used)
 */
function determineUpdateScope(
  scope: RecurrenceScope | undefined,
  existingEvent: calendar_v3.Schema$Event
): RecurrenceScope {
  // If scope explicitly specified, use it
  if (scope !== undefined) {
    return scope;
  }

  // If recurring instance (has recurringEventId), default to 'thisEvent'
  if (existingEvent.recurringEventId) {
    return 'thisEvent';
  }

  // If recurring parent (has recurrence rules), default to 'allEvents'
  if (existingEvent.recurrence && existingEvent.recurrence.length > 0) {
    return 'allEvents';
  }

  // For non-recurring events, default to 'thisEvent' (though it won't be used)
  return 'thisEvent';
}

/**
 * Determine the effective delete scope for a recurring event
 * Requirement: 5.1, 5.5 (Delete recurring events with scope support)
 *
 * @param scope - Explicitly specified scope (if any)
 * @param existingEvent - The event being deleted
 * @returns The recurrence scope to use for the deletion operation
 *
 * @description
 * Logic:
 * 1. If scope is explicitly specified, use it
 * 2. If event is a recurring instance (has recurringEventId), default to 'thisEvent'
 * 3. If event is a recurring parent (has recurrence rules), default to 'allEvents'
 * 4. For non-recurring events, scope is ignored (returned but not used)
 */
function determineDeleteScope(
  scope: RecurrenceScope | undefined,
  existingEvent: calendar_v3.Schema$Event
): RecurrenceScope {
  // If scope explicitly specified, use it
  if (scope !== undefined) {
    return scope;
  }

  // If recurring instance (has recurringEventId), default to 'thisEvent'
  if (existingEvent.recurringEventId) {
    return 'thisEvent';
  }

  // If recurring parent (has recurrence rules), default to 'allEvents'
  if (existingEvent.recurrence && existingEvent.recurrence.length > 0) {
    return 'allEvents';
  }

  // For non-recurring events, default to 'thisEvent' (though it won't be used)
  return 'thisEvent';
}

/**
 * Request interface for listing events
 *
 * @property startDate - Start of date range in ISO 8601 (YYYY-MM-DD) or RFC3339 (YYYY-MM-DDTHH:MM:SSZ) format
 * @property endDate - End of date range in ISO 8601 (YYYY-MM-DD) or RFC3339 (YYYY-MM-DDTHH:MM:SSZ) format
 * @property calendarId - Calendar ID (optional, defaults to 'primary')
 * @property eventTypes - Optional array of event types to filter by (e.g., ['default', 'focusTime', 'outOfOffice']).
 *                        When specified, only events matching these types will be returned.
 *                        Valid values: 'default', 'outOfOffice', 'focusTime', 'workingLocation', 'birthday', 'fromGmail'
 */
export interface ListEventsRequest {
  startDate: string;
  endDate: string;
  calendarId?: string;
  eventTypes?: GoogleCalendarEventType[];
}

/**
 * Request interface for creating events
 *
 * @property title - Event title/summary
 * @property start - Start date/time in ISO 8601 format
 * @property end - End date/time in ISO 8601 format
 * @property isAllDay - Whether this is an all-day event (default: false)
 * @property location - Event location
 * @property description - Event description
 * @property attendees - Array of attendee email addresses
 * @property reminders - Reminder configuration
 * @property eventType - Type of event to create (default: 'default').
 *                       Valid values: 'default', 'outOfOffice', 'focusTime', 'workingLocation', 'birthday'
 *                       Note: 'fromGmail' is read-only and cannot be used for event creation
 * @property outOfOfficeProperties - Properties for out-of-office events (required when eventType is 'outOfOffice')
 * @property focusTimeProperties - Properties for focus time events (required when eventType is 'focusTime')
 * @property workingLocationProperties - Properties for working location events (required when eventType is 'workingLocation')
 * @property birthdayProperties - Properties for birthday events (required when eventType is 'birthday')
 */
export interface CreateEventRequest {
  title: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  location?: string;
  description?: string;
  attendees?: string[];
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  recurrence?: string[]; // RRULE strings for recurring events
  eventType?: GoogleCalendarEventType;
  outOfOfficeProperties?: OutOfOfficeProperties;
  focusTimeProperties?: FocusTimeProperties;
  workingLocationProperties?: WorkingLocationProperties;
  birthdayProperties?: BirthdayProperties;
}

/**
 * Google Calendar Service Configuration
 */
export interface GoogleCalendarServiceConfig {
  userId?: string; // User ID for token storage
}

/**
 * Google Calendar Service Class
 *
 * Manages Google Calendar API integration with OAuth authentication.
 * Provides methods for event CRUD operations, calendar management, and health checks.
 */
export class GoogleCalendarService {
  private oauthHandler: GoogleOAuthHandler;
  private calendarClient: calendar_v3.Calendar | null = null;

  /**
   * Constructor
   *
   * @param oauthHandler - GoogleOAuthHandler instance for authentication
   * @param config - Optional configuration (userId, etc.)
   */
  constructor(
    oauthHandler: GoogleOAuthHandler,
    _config?: GoogleCalendarServiceConfig
  ) {
    this.oauthHandler = oauthHandler;
  }

  /**
   * Authenticate and initialize Google Calendar client
   *
   * Calls GoogleOAuthHandler.ensureValidToken() to get a valid access token,
   * then initializes the google.calendar() client with the OAuth2Client.
   *
   * @throws Error if authentication fails or no stored tokens found
   */
  async authenticate(): Promise<void> {
    try {
      // Get valid access token (refreshes if expired)
      await this.oauthHandler.ensureValidToken();

      // Get stored tokens for OAuth2Client configuration
      const tokens = await this.oauthHandler.getTokens();
      if (!tokens) {
        throw new Error('No stored tokens found after ensureValidToken()');
      }

      // Get OAuth2Client instance
      const oauth2Client = this.oauthHandler.getOAuth2Client(tokens);

      // Initialize Google Calendar API client
      this.calendarClient = google.calendar({
        version: 'v3',
        auth: oauth2Client,
      });
    } catch (error) {
      throw new Error(
        `Failed to authenticate with Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if Google Calendar API is available
   *
   * Attempts a simple Calendar API call (calendarList.list with maxResults=1)
   * to verify authentication and API availability.
   *
   * @returns True if API is available and authenticated, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Ensure client is authenticated
      if (!this.calendarClient) {
        await this.authenticate();
      }

      // Try a simple API call to verify availability
      await this.calendarClient!.calendarList.list({
        maxResults: 1,
      });

      return true;
    } catch (error) {
      // Suppress errors and return false
      // (Health check should not throw errors)
      return false;
    }
  }

  /**
   * Get the underlying Google Calendar API client
   *
   * Returns the authenticated calendar_v3.Calendar client for advanced operations
   * like freebusy queries. Authenticates if not already authenticated.
   *
   * @returns The Google Calendar API client
   * @throws Error if authentication fails
   */
  async getCalendarClient(): Promise<calendar_v3.Calendar> {
    if (!this.calendarClient) {
      await this.authenticate();
    }
    return this.calendarClient!;
  }

  /**
   * Validate event type and properties
   *
   * Uses CreateEventRequestSchema to validate the request, ensuring that:
   * - Event type is valid (not 'fromGmail' which is read-only)
   * - Type-specific properties match the event type
   * - All-day constraint is enforced for birthday/workingLocation events
   *
   * @param request - CreateEventRequest to validate
   * @throws ZodError if validation fails with descriptive error messages
   */
  private validateEventTypeProperties(request: CreateEventRequest): void {
    // Use Zod schema for comprehensive validation
    // parse() throws ZodError with descriptive messages if validation fails
    CreateEventRequestSchema.parse(request);
  }

  /**
   * Build event type payload for Google Calendar API
   *
   * Transforms event type data from CreateEventRequest into Google Calendar API format.
   * Handles all 6 event types: default, outOfOffice, focusTime, workingLocation, birthday, fromGmail.
   *
   * @param request - CreateEventRequest containing event type and type-specific properties
   * @returns Partial calendar_v3.Schema$Event with eventType and type-specific properties
   */
  private buildEventTypePayload(request: CreateEventRequest): Partial<calendar_v3.Schema$Event> {
    const eventType = request.eventType || 'default';
    const payload: Partial<calendar_v3.Schema$Event> = {};

    // Set eventType field (only if not default, as default is the API's default)
    if (eventType !== 'default') {
      payload.eventType = eventType;
    }

    switch (eventType) {
      case 'outOfOffice':
        // Google Calendar API requires transparency: 'opaque' for OOO events
        payload.transparency = 'opaque';
        // outOfOfficeProperties object is required (can be empty)
        payload.outOfOfficeProperties = request.outOfOfficeProperties
          ? {
              autoDeclineMode: request.outOfOfficeProperties.autoDeclineMode,
              declineMessage: request.outOfOfficeProperties.declineMessage,
            }
          : {};
        break;

      case 'focusTime':
        // Google Calendar API requires transparency: 'opaque' for Focus Time events
        payload.transparency = 'opaque';
        // focusTimeProperties object is required (can be empty)
        payload.focusTimeProperties = request.focusTimeProperties
          ? {
              autoDeclineMode: request.focusTimeProperties.autoDeclineMode,
              declineMessage: request.focusTimeProperties.declineMessage,
              chatStatus: request.focusTimeProperties.chatStatus,
            }
          : {};
        break;

      case 'workingLocation':
        // Google Calendar API requires visibility: 'public' and transparency: 'transparent'
        // for workingLocation events
        payload.visibility = 'public';
        payload.transparency = 'transparent';
        if (request.workingLocationProperties) {
          const props = request.workingLocationProperties;
          // Build workingLocationProperties based on type
          const workingLocationPayload: calendar_v3.Schema$EventWorkingLocationProperties = {
            type: props.type,
          };

          if (props.type === 'homeOffice' && props.homeOffice !== undefined) {
            // homeOffice is an empty object in Google Calendar API
            workingLocationPayload.homeOffice = {};
          } else if (props.type === 'officeLocation' && props.officeLocation) {
            workingLocationPayload.officeLocation = {
              buildingId: props.officeLocation.buildingId,
              floorId: props.officeLocation.floorId,
              floorSectionId: props.officeLocation.floorSectionId,
              deskId: props.officeLocation.deskId,
              label: props.officeLocation.label,
            };
          } else if (props.type === 'customLocation' && props.customLocation) {
            workingLocationPayload.customLocation = {
              label: props.customLocation.label,
            };
          }

          payload.workingLocationProperties = workingLocationPayload;
        }
        break;

      case 'birthday':
        // Note: birthdayProperties is not directly supported in Google Calendar API Schema$Event
        // Birthday events are typically created through Google Contacts and synced automatically.
        // Setting eventType to 'birthday' is sufficient; the API handles the rest.
        // If birthdayProperties are provided, they are used for internal tracking only.
        break;

      case 'fromGmail':
        // fromGmail is read-only and cannot be created
        // This case should be handled by validation (Task 11), but we include it here for completeness
        // Setting eventType allows API to reject the request with appropriate error
        break;

      case 'default':
      default:
        // For default events, no additional properties are needed
        break;
    }

    return payload;
  }

  /**
   * Normalize date string to RFC3339 format required by Google Calendar API
   *
   * Converts simple ISO date format (YYYY-MM-DD) to RFC3339 format with UTC timezone.
   * If input is already in RFC3339 format, returns unchanged.
   *
   * For endDate (isEndDate=true), adds 1 day because Google Calendar API's timeMax
   * parameter is EXCLUSIVE (events before this time are returned, not including this time).
   * This ensures events on the endDate are included in the results.
   *
   * @param dateString - Date string in YYYY-MM-DD or RFC3339 format
   * @param isEndDate - If true, adds 1 day to make timeMax exclusive work correctly
   * @returns Date string in RFC3339 format (YYYY-MM-DDT00:00:00Z)
   */
  private normalizeToRFC3339(dateString: string, isEndDate: boolean = false): string {
    // Check if already in RFC3339 format (contains 'T' and timezone)
    if (dateString.includes('T')) {
      return dateString;
    }

    if (isEndDate) {
      // For endDate: add 1 day to make timeMax exclusive work correctly
      // Google Calendar API's timeMax is EXCLUSIVE, meaning it returns events
      // BEFORE this time. To include events on endDate, we need to set
      // timeMax to the start of the next day.
      const date = new Date(dateString + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + 1);
      return date.toISOString().replace('.000Z', 'Z');
    }

    // Convert YYYY-MM-DD to YYYY-MM-DDT00:00:00Z
    // Using 00:00:00 UTC ensures we capture all events starting from this date
    return `${dateString}T00:00:00Z`;
  }

  /**
   * List calendar events with pagination support
   * Requirement: 2, 10 (Google Calendar event retrieval, retry with backoff)
   *
   * Fetches all events within the specified date range using automatic pagination.
   * Collects events from all pages until no more pageToken is returned.
   * Includes retry logic with exponential backoff for transient failures.
   * Expands recurring events into individual instances.
   *
   * @param request - ListEventsRequest with date range and optional calendar ID
   * @returns Array of unified CalendarEvent objects
   * @throws Error if authentication fails or API request fails after retries
   */
  async listEvents(request: ListEventsRequest): Promise<CalendarEvent[]> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const calendarId = request.calendarId || 'primary';
    const allEvents: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined = undefined;

    try {
      // Fetch all pages until no more pageToken
      do {
        const response: calendar_v3.Schema$Events = await retryWithBackoff(
          async () => {
            return (
              await this.calendarClient!.events.list({
                calendarId: calendarId,
                timeMin: this.normalizeToRFC3339(request.startDate),
                timeMax: this.normalizeToRFC3339(request.endDate, true),
                maxResults: 250,
                pageToken: pageToken,
                singleEvents: true, // Expand recurring events into individual instances
              })
            ).data;
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              // Retry on rate limit (429) and server errors (500, 503)
              const message = error.message.toLowerCase();
              if (
                message.includes('rate limit') ||
                message.includes('429') ||
                message.includes('500') ||
                message.includes('503') ||
                message.includes('service unavailable') ||
                message.includes('temporary')
              ) {
                return true;
              }
              // Don't retry on auth errors (401, 403)
              if (
                message.includes('unauthorized') ||
                message.includes('401') ||
                message.includes('forbidden') ||
                message.includes('403')
              ) {
                return false;
              }
              // Default to retryable
              return true;
            },
          }
        );

        // Collect events from current page
        const events = response.items || [];
        allEvents.push(...(events as GoogleCalendarEvent[]));

        // Get next page token (if any)
        pageToken = response.nextPageToken || undefined;
      } while (pageToken);

      // Convert GoogleCalendarEvent[] to CalendarEvent[]
      const convertedEvents = allEvents.map(event =>
        convertGoogleToCalendarEvent(event as GoogleCalendarEvent)
      );

      // Filter by eventTypes if specified (client-side filtering)
      // Google Calendar API doesn't support filtering by eventType in the API call
      if (request.eventTypes && request.eventTypes.length > 0) {
        return convertedEvents.filter(event =>
          // Event's eventType must be in the requested eventTypes array
          // Events without eventType are treated as 'default'
          request.eventTypes!.includes(event.eventType || 'default')
        );
      }

      return convertedEvents;
    } catch (error) {
      throw new Error(
        `Failed to list events from Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a calendar event
   * Requirement: 3, 10 (Calendar event creation with retry logic)
   *
   * Creates a new event in Google Calendar with support for all-day events,
   * reminders, and attendees. Includes retry logic with exponential backoff
   * for transient failures.
   *
   * @param request - CreateEventRequest with event details
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @returns Created calendar event
   * @throws Error if authentication fails or API request fails after retries
   */
  async createEvent(
    request: CreateEventRequest,
    calendarId?: string
  ): Promise<CalendarEvent> {
    // Validate event type and properties before API call
    // This throws ZodError if validation fails
    this.validateEventTypeProperties(request);

    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const targetCalendarId = calendarId || 'primary';

    try {
      // Build Google Calendar event object
      const eventBody: calendar_v3.Schema$Event = {
        summary: request.title,
        location: request.location,
        description: request.description,
      };

      // Handle all-day vs timed events
      if (request.isAllDay) {
        // All-day events use 'date' field (YYYY-MM-DD format)
        eventBody.start = {
          date: request.start.split('T')[0], // Extract date part from ISO 8601
        };
        eventBody.end = {
          date: request.end.split('T')[0],
        };
      } else {
        // Timed events use 'dateTime' field (ISO 8601 with timezone)
        eventBody.start = {
          dateTime: request.start,
        };
        eventBody.end = {
          dateTime: request.end,
        };
      }

      // Handle attendees
      if (request.attendees && request.attendees.length > 0) {
        eventBody.attendees = request.attendees.map(email => ({ email }));
      }

      // Handle reminders
      if (request.reminders) {
        eventBody.reminders = request.reminders;
      }

      // Handle recurrence (for recurring events)
      if (request.recurrence && request.recurrence.length > 0) {
        eventBody.recurrence = request.recurrence;
      }

      // Build and merge event type-specific payload
      const eventTypePayload = this.buildEventTypePayload(request);
      Object.assign(eventBody, eventTypePayload);

      // Debug log the request body
      calendarLogger.info({ eventBody, eventType: request.eventType }, 'Creating Google Calendar event');

      // Create event with retry logic
      const response: calendar_v3.Schema$Event = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.events.insert({
              calendarId: targetCalendarId,
              requestBody: eventBody,
              sendUpdates: request.attendees && request.attendees.length > 0 ? 'all' : 'none',
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            // Retry on rate limit (429) and server errors (500, 503)
            const message = error.message.toLowerCase();
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            // Don't retry on auth errors (401, 403)
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            // Default to retryable
            return true;
          },
        }
      );

      // Convert created event to CalendarEvent
      return convertGoogleToCalendarEvent(response as GoogleCalendarEvent);
    } catch (error) {
      throw new Error(
        `Failed to create event in Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a single calendar event by ID
   * Requirement: update-calendar-event (support for fetching event details)
   *
   * @param eventId - Event ID to fetch
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @returns Calendar event
   * @throws Error if event not found or authentication fails
   */
  async getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent> {
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const targetCalendarId = calendarId || 'primary';

    const response = await retryWithBackoff(
      async () => {
        return (
          await this.calendarClient!.events.get({
            calendarId: targetCalendarId,
            eventId: eventId,
          })
        ).data;
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        shouldRetry: (error: Error) => {
          const message = error.message.toLowerCase();
          if (message.includes('not found') || message.includes('404')) {
            return false;
          }
          if (message.includes('unauthorized') || message.includes('401') ||
              message.includes('forbidden') || message.includes('403')) {
            return false;
          }
          return true;
        },
      }
    );

    return convertGoogleToCalendarEvent(response as GoogleCalendarEvent);
  }

  /**
   * Split a recurring series at a selected instance
   * Requirement: 3 (Update Recurring Event - This and Future)
   *
   * Algorithm:
   * 1. Fetch the parent recurring event
   * 2. Determine the end date for the original series (day before selected instance)
   * 3. Update parent event's RRULE with UNTIL clause (or adjust COUNT)
   * 4. Create new recurring event starting from selected instance with updated properties
   *
   * @param recurringEventId - Parent recurring event ID
   * @param selectedInstanceStart - Start date/time of the selected instance (ISO 8601)
   * @param updates - Updates to apply to the new series
   * @param calendarId - Calendar ID
   * @returns Created new recurring event
   * @throws Error if parent event not found or not a recurring event
   */
  private async splitRecurringSeries(
    recurringEventId: string,
    selectedInstanceStart: string,
    updates: Partial<CreateEventRequest>,
    calendarId: string
  ): Promise<CalendarEvent> {
    // Step 1: Fetch parent recurring event
    const parentEvent = await retryWithBackoff(
      async () => {
        return (
          await this.calendarClient!.events.get({
            calendarId: calendarId,
            eventId: recurringEventId,
          })
        ).data;
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        shouldRetry: (error: Error) => {
          const message = error.message.toLowerCase();
          if (message.includes('not found') || message.includes('404')) {
            return false;
          }
          if (message.includes('unauthorized') || message.includes('401') ||
              message.includes('forbidden') || message.includes('403')) {
            return false;
          }
          return true;
        },
      }
    );

    // Validate that it's a recurring event
    if (!parentEvent.recurrence || parentEvent.recurrence.length === 0) {
      throw new Error('Event is not a recurring event');
    }

    // Step 2: Calculate the UNTIL date (day before selected instance)
    const selectedDate = new Date(selectedInstanceStart);
    const untilDate = new Date(selectedDate);
    untilDate.setDate(untilDate.getDate() - 1);

    // Format UNTIL date for RRULE (YYYYMMDD format in UTC)
    const untilString = untilDate.toISOString().split('T')[0].replace(/-/g, '');

    // Step 3: Update parent event's recurrence rules
    const updatedRecurrence: string[] = parentEvent.recurrence.map(rule => {
      if (rule.startsWith('RRULE:')) {
        // Parse existing RRULE
        const rruleParts = rule.substring(6).split(';');
        const rruleMap = new Map<string, string>();

        for (const part of rruleParts) {
          const [key, value] = part.split('=');
          if (key && value) {
            rruleMap.set(key, value);
          }
        }

        // Remove COUNT if present (UNTIL and COUNT are mutually exclusive)
        rruleMap.delete('COUNT');

        // Add or update UNTIL
        rruleMap.set('UNTIL', `${untilString}T235959Z`);

        // Rebuild RRULE
        const newRuleParts: string[] = [];
        rruleMap.forEach((value, key) => {
          newRuleParts.push(`${key}=${value}`);
        });

        return `RRULE:${newRuleParts.join(';')}`;
      }
      return rule;
    });

    // Update parent event with new RRULE
    await retryWithBackoff(
      async () => {
        await this.calendarClient!.events.patch({
          calendarId: calendarId,
          eventId: recurringEventId,
          requestBody: {
            recurrence: updatedRecurrence,
          },
          sendUpdates: 'none',
        });
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        shouldRetry: (error: Error) => {
          const message = error.message.toLowerCase();
          if (message.includes('rate limit') || message.includes('429') ||
              message.includes('500') || message.includes('503') ||
              message.includes('service unavailable') || message.includes('temporary')) {
            return true;
          }
          return false;
        },
      }
    );

    calendarLogger.info(
      { recurringEventId, untilDate: untilString },
      'Updated parent recurring event with UNTIL date'
    );

    // Step 4: Create new recurring event starting from selected instance
    // Build new event request with original properties + updates
    const newEventRequest: CreateEventRequest = {
      title: updates.title !== undefined ? updates.title : (parentEvent.summary || ''),
      start: selectedInstanceStart,
      end: updates.end !== undefined ? updates.end : (parentEvent.end?.dateTime || parentEvent.end?.date || selectedInstanceStart),
      isAllDay: updates.isAllDay !== undefined ? updates.isAllDay : !!parentEvent.start?.date,
      location: updates.location !== undefined ? updates.location : (parentEvent.location || undefined),
      description: updates.description !== undefined ? updates.description : (parentEvent.description || undefined),
      attendees: updates.attendees !== undefined ? updates.attendees : (parentEvent.attendees?.map((a: calendar_v3.Schema$EventAttendee) => a.email || '') || []),
      recurrence: parentEvent.recurrence, // Use same recurrence rules (without UNTIL)
    };


    // Handle reminders separately with proper type checking
    if (updates.reminders !== undefined) {
      newEventRequest.reminders = updates.reminders;
    } else if (parentEvent.reminders && parentEvent.reminders.useDefault !== undefined) {
      newEventRequest.reminders = {
        useDefault: parentEvent.reminders.useDefault,
        overrides: parentEvent.reminders.overrides?.map(override => ({
          method: (override.method as 'email' | 'popup') || 'popup',
          minutes: override.minutes || 10,
        })),
      };
    }
    // Remove UNTIL from the new series recurrence rules
    if (newEventRequest.recurrence) {
      newEventRequest.recurrence = newEventRequest.recurrence.map(rule => {
        if (rule.startsWith('RRULE:')) {
          // Remove UNTIL from the new series (it should continue indefinitely or with original COUNT)
          return rule.replace(/;UNTIL=[^;]+/, '').replace(/UNTIL=[^;]+;?/, '');
        }
        return rule;
      });
    }

    calendarLogger.info(
      { newEventStart: selectedInstanceStart },
      'Creating new recurring series from selected instance'
    );

    // Create the new recurring event
    const newEvent = await this.createEvent(newEventRequest, calendarId);

    return newEvent;
  }

  /**
   * Update an existing calendar event
   * Requirement: 4, 10 (Calendar event update with retry logic)
   * Requirements: 2, 3, 4 (Recurring event update with scope support)
   *
   * Supports all-day events, reminders, attendees, and recurring events.
   * Includes retry logic with exponential backoff for transient failures.
   * Enforces event type restrictions (birthday and fromGmail events have limited updatable fields).
   *
   * @param eventId - Event ID to update
   * @param updates - Partial CreateEventRequest with fields to update
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @param scope - Recurrence scope for recurring events (optional)
   *                - 'thisEvent': Update only this instance
   *                - 'thisAndFuture': Update this and future instances
   *                - 'allEvents': Update all instances in the series
   *                If not specified, defaults are:
   *                - Recurring instance: 'thisEvent'
   *                - Recurring parent: 'allEvents'
   *                - Non-recurring: ignored
   * @returns Updated calendar event
   * @throws Error if authentication fails, API request fails after retries, or disallowed fields are being updated
   */
  async updateEvent(
    eventId: string,
    updates: Partial<CreateEventRequest>,
    calendarId?: string,
    scope?: RecurrenceScope
  ): Promise<CalendarEvent> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const targetCalendarId = calendarId || 'primary';

    try {
      // Step 1: Fetch existing event to determine its eventType
      // Requirement: 4.5, 5.3, 6.6 - Event type update restrictions
      const existingEvent = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.events.get({
              calendarId: targetCalendarId,
              eventId: eventId,
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            const message = error.message.toLowerCase();
            if (
              message.includes('not found') ||
              message.includes('404')
            ) {
              return false;
            }
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            return true;
          },
        }
      );

      // Step 2: Detect the event type using the helper function
      const eventType = detectEventType(existingEvent as GoogleCalendarEvent);

      // Step 3: Validate that the update fields are allowed for this event type
      validateUpdateFieldsForEventType(eventType, updates);

      // Step 4: Determine the update scope for recurring events
      // Requirements: 2.1, 2.4, 3.1, 4.1 - Default scope behavior
      const effectiveScope = determineUpdateScope(scope, existingEvent);

      // Step 5: Route to appropriate update logic based on scope
      // Requirement 2: Update Recurring Event - Single Instance
      if (effectiveScope === 'thisEvent') {
        // Requirement 2.1, 2.2, 2.3: Update only the specific occurrence
        // Use instance eventId directly to patch the specific instance
        // This creates an exception in the recurring series
        return await this.updateSingleInstance(
          targetCalendarId,
          eventId,
          updates,
          eventType
        );
      }

      // Requirement 4: Update Recurring Event - All Events
      // Requirements: 4.1, 4.2, 4.3 - Update parent recurring event
      if (effectiveScope === 'allEvents' && existingEvent.recurringEventId) {
        // This is a recurring instance, but user wants to update all events
        // Get the parent event using recurringEventId
        const parentEventId = existingEvent.recurringEventId;

        calendarLogger.info(
          { instanceId: eventId, parentId: parentEventId },
          'Updating all events in recurring series via parent'
        );

        // Fetch parent event to ensure it exists
        await retryWithBackoff(
          async () => {
            return (
              await this.calendarClient!.events.get({
                calendarId: targetCalendarId,
                eventId: parentEventId,
              })
            ).data;
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              if (
                message.includes('not found') ||
                message.includes('404')
              ) {
                return false;
              }
              if (
                message.includes('unauthorized') ||
                message.includes('401') ||
                message.includes('forbidden') ||
                message.includes('403')
              ) {
                return false;
              }
              if (
                message.includes('rate limit') ||
                message.includes('429') ||
                message.includes('500') ||
                message.includes('503') ||
                message.includes('service unavailable') ||
                message.includes('temporary')
              ) {
                return true;
              }
              return true;
            },
          }
        );

        // Build patch body for parent event
        const patchBody = this.buildPatchBody(updates);

        // Patch the parent event directly
        // This applies changes to all instances in the series
        const response: calendar_v3.Schema$Event = await retryWithBackoff(
          async () => {
            return (
              await this.calendarClient!.events.patch({
                calendarId: targetCalendarId,
                eventId: parentEventId,
                requestBody: patchBody,
                sendUpdates: updates.attendees !== undefined ? 'all' : 'none',
              })
            ).data;
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              if (
                message.includes('rate limit') ||
                message.includes('429') ||
                message.includes('500') ||
                message.includes('503') ||
                message.includes('service unavailable') ||
                message.includes('temporary')
              ) {
                return true;
              }
              if (
                message.includes('unauthorized') ||
                message.includes('401') ||
                message.includes('forbidden') ||
                message.includes('403')
              ) {
                return false;
              }
              if (
                message.includes('not found') ||
                message.includes('404')
              ) {
                return false;
              }
              return true;
            },
          }
        );

        return convertGoogleToCalendarEvent(response as GoogleCalendarEvent);
      }

      // Requirement 3: Update Recurring Event - This and Future
      if (effectiveScope === 'thisAndFuture' && existingEvent.recurringEventId) {
        // Requirement 3.1, 3.2, 3.3, 3.4: Split the series at selected instance
        const instanceStart = existingEvent.start?.dateTime || existingEvent.start?.date;
        if (!instanceStart) {
          throw new Error('Cannot determine instance start time');
        }

        calendarLogger.info(
          { eventId, recurringEventId: existingEvent.recurringEventId, instanceStart },
          'Splitting recurring series for thisAndFuture update'
        );

        // Split the series and create new series with updates
        return await this.splitRecurringSeries(
          existingEvent.recurringEventId,
          instanceStart,
          updates,
          targetCalendarId
        );
      }

      // Build Google Calendar patch object (only include provided fields)
      const patchBody = this.buildPatchBody(updates);

      // Update event with retry logic using patch API
      const response: calendar_v3.Schema$Event = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.events.patch({
              calendarId: targetCalendarId,
              eventId: eventId,
              requestBody: patchBody,
              sendUpdates: updates.attendees !== undefined ? 'all' : 'none',
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            // Retry on rate limit (429) and server errors (500, 503)
            const message = error.message.toLowerCase();
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            // Don't retry on auth errors (401, 403)
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            // Don't retry on not found errors (404)
            if (
              message.includes('not found') ||
              message.includes('404')
            ) {
              return false;
            }
            // Default to retryable
            return true;
          },
        }
      );

      // Convert updated event to CalendarEvent
      return convertGoogleToCalendarEvent(response as GoogleCalendarEvent);
    } catch (error) {
      throw new Error(
        `Failed to update event in Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update a single instance of a recurring event
   * Requirement: 2.1, 2.2, 2.3 - Update only the specific occurrence
   *
   * Updates a specific instance of a recurring event by patching the instance directly.
   * This creates an exception in the recurring series, leaving other instances unchanged.
   *
   * @param calendarId - Calendar ID
   * @param instanceEventId - Event ID of the specific instance
   * @param updates - Updates to apply
   * @param _eventType - Event type for validation (not used in single instance updates)
   * @returns Updated calendar event
   * @throws Error if patch fails
   */
  private async updateSingleInstance(
    calendarId: string,
    instanceEventId: string,
    updates: Partial<CreateEventRequest>,
    _eventType: GoogleCalendarEventType
  ): Promise<CalendarEvent> {
    // Build patch body using the existing logic
    const patchBody = this.buildPatchBody(updates);

    try {
      // Patch the specific instance directly
      // This creates an exception in the recurring series
      const response: calendar_v3.Schema$Event = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.events.patch({
              calendarId: calendarId,
              eventId: instanceEventId, // Use instance eventId directly
              requestBody: patchBody,
              sendUpdates: updates.attendees !== undefined ? 'all' : 'none',
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            const message = error.message.toLowerCase();
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            if (
              message.includes('not found') ||
              message.includes('404')
            ) {
              return false;
            }
            return true;
          },
        }
      );

      // Convert updated event to CalendarEvent
      return convertGoogleToCalendarEvent(response as GoogleCalendarEvent);
    } catch (error) {
      throw new Error(
        `Failed to update single instance in Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build patch body for event updates
   * Helper method to construct Google Calendar patch object
   *
   * @param updates - Updates to apply
   * @returns Google Calendar patch body
   */
  private buildPatchBody(updates: Partial<CreateEventRequest>): calendar_v3.Schema$Event {
    const patchBody: calendar_v3.Schema$Event = {};

    // Handle title
    if (updates.title !== undefined) {
      patchBody.summary = updates.title;
    }

    // Handle location
    if (updates.location !== undefined) {
      patchBody.location = updates.location;
    }

    // Handle description
    if (updates.description !== undefined) {
      patchBody.description = updates.description;
    }

    // Handle date/time updates
    if (updates.start !== undefined || updates.end !== undefined || updates.isAllDay !== undefined) {
      if (updates.isAllDay !== undefined && updates.isAllDay) {
        // All-day event: use 'date' field (YYYY-MM-DD format)
        if (updates.start !== undefined) {
          patchBody.start = {
            date: updates.start.split('T')[0],
          };
        }
        if (updates.end !== undefined) {
          patchBody.end = {
            date: updates.end.split('T')[0],
          };
        }
      } else if (updates.isAllDay !== undefined && !updates.isAllDay) {
        // Timed event: use 'dateTime' field (ISO 8601 with timezone)
        if (updates.start !== undefined) {
          patchBody.start = {
            dateTime: updates.start,
          };
        }
        if (updates.end !== undefined) {
          patchBody.end = {
            dateTime: updates.end,
          };
        }
      } else {
        // isAllDay not specified, infer from existing format or default to dateTime
        if (updates.start !== undefined) {
          patchBody.start = {
            dateTime: updates.start,
          };
        }
        if (updates.end !== undefined) {
          patchBody.end = {
            dateTime: updates.end,
          };
        }
      }
    }

    // Handle attendees
    if (updates.attendees !== undefined) {
      if (updates.attendees.length > 0) {
        patchBody.attendees = updates.attendees.map((email: string) => ({ email }));
      } else {
        // Empty array means remove all attendees
        patchBody.attendees = [];
      }
    }

    // Handle reminders
    if (updates.reminders !== undefined) {
      patchBody.reminders = updates.reminders as calendar_v3.Schema$Event['reminders'];
    }

    return patchBody;
  }

  /**
   * Delete a calendar event
   * Requirement: 5, 10 (Calendar event deletion with retry logic)
   * Requirements: 5.1, 5.5 (Recurring event deletion with scope support)
   *
   * Deletes a single event from Google Calendar using the delete API.
   * Includes retry logic with exponential backoff for transient failures.
   * Handles 404 errors gracefully (event already deleted).
   * Supports recurring event deletion with scope control.
   *
   * @param eventId - Event ID to delete
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @param scope - Recurrence scope for recurring events (optional)
   *                - 'thisEvent': Delete only this instance
   *                - 'thisAndFuture': Delete this and future instances
   *                - 'allEvents': Delete all instances in the series
   *                If not specified, defaults are:
   *                - Recurring instance: 'thisEvent'
   *                - Recurring parent: 'allEvents'
   *                - Non-recurring: ignored
   * @throws Error if authentication fails or API request fails after retries (except 404)
   */
  async deleteEvent(
    eventId: string,
    calendarId?: string,
    scope?: RecurrenceScope
  ): Promise<void> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const targetCalendarId = calendarId || 'primary';

    try {
      // Step 1: Fetch existing event to determine if it's recurring
      // Requirement: 5.1, 5.5 - Determine delete scope for recurring events
      const existingEvent = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.events.get({
              calendarId: targetCalendarId,
              eventId: eventId,
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            const message = error.message.toLowerCase();
            if (
              message.includes('not found') ||
              message.includes('404')
            ) {
              return false;
            }
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            return true;
          },
        }
      );

      // Step 2: Determine the effective delete scope
      const effectiveScope = determineDeleteScope(scope, existingEvent);

      // Step 3: Route to appropriate deletion method based on scope
      // Requirement 5.2: thisEvent - Delete specific instance
      if (effectiveScope === 'thisEvent') {
        calendarLogger.info(
          { eventId, scope: effectiveScope },
          'Deleting single instance'
        );

        // Use existing delete logic for single instance
        await retryWithBackoff(
          async () => {
            await this.calendarClient!.events.delete({
              calendarId: targetCalendarId,
              eventId: eventId,
            });
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              if (
                message.includes('not found') ||
                message.includes('404')
              ) {
                return false;
              }
              if (
                message.includes('unauthorized') ||
                message.includes('401') ||
                message.includes('forbidden') ||
                message.includes('403')
              ) {
                return false;
              }
              if (
                message.includes('rate limit') ||
                message.includes('429') ||
                message.includes('500') ||
                message.includes('503') ||
                message.includes('service unavailable') ||
                message.includes('temporary')
              ) {
                return true;
              }
              return true;
            },
          }
        );
        return;
      }

      // Requirement 5.3: thisAndFuture - Update parent RRULE with UNTIL
      if (effectiveScope === 'thisAndFuture' && existingEvent.recurringEventId) {
        calendarLogger.info(
          { eventId, recurringEventId: existingEvent.recurringEventId, scope: effectiveScope },
          'Ending series at selected instance (thisAndFuture)'
        );

        // Get the instance start date
        const instanceStart = existingEvent.start?.dateTime || existingEvent.start?.date;
        if (!instanceStart) {
          throw new Error('Cannot determine instance start time for thisAndFuture deletion');
        }

        // Fetch parent event
        const parentEvent = await retryWithBackoff(
          async () => {
            return (
              await this.calendarClient!.events.get({
                calendarId: targetCalendarId,
                eventId: existingEvent.recurringEventId!,
              })
            ).data;
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              if (message.includes('not found') || message.includes('404')) {
                return false;
              }
              if (message.includes('unauthorized') || message.includes('401') ||
                  message.includes('forbidden') || message.includes('403')) {
                return false;
              }
              return true;
            },
          }
        );

        // Validate that it's a recurring event
        if (!parentEvent.recurrence || parentEvent.recurrence.length === 0) {
          throw new Error('Parent event is not a recurring event');
        }

        // Calculate UNTIL date (day before selected instance)
        const selectedDate = new Date(instanceStart);
        const untilDate = new Date(selectedDate);
        untilDate.setDate(untilDate.getDate() - 1);

        // Format UNTIL date for RRULE (YYYYMMDD format in UTC)
        const untilString = untilDate.toISOString().split('T')[0].replace(/-/g, '');

        // Update parent event's recurrence rules with UNTIL
        const updatedRecurrence: string[] = parentEvent.recurrence.map(rule => {
          if (rule.startsWith('RRULE:')) {
            // Parse existing RRULE
            const rruleParts = rule.substring(6).split(';');
            const rruleMap = new Map<string, string>();

            for (const part of rruleParts) {
              const [key, value] = part.split('=');
              if (key && value) {
                rruleMap.set(key, value);
              }
            }

            // Remove COUNT if present (UNTIL and COUNT are mutually exclusive)
            rruleMap.delete('COUNT');

            // Add or update UNTIL
            rruleMap.set('UNTIL', `${untilString}T235959Z`);

            // Rebuild RRULE
            const newRuleParts: string[] = [];
            rruleMap.forEach((value, key) => {
              newRuleParts.push(`${key}=${value}`);
            });

            return `RRULE:${newRuleParts.join(';')}`;
          }
          return rule;
        });

        // Update parent event with new RRULE (ending the series)
        await retryWithBackoff(
          async () => {
            await this.calendarClient!.events.patch({
              calendarId: targetCalendarId,
              eventId: existingEvent.recurringEventId!,
              requestBody: {
                recurrence: updatedRecurrence,
              },
              sendUpdates: 'none',
            });
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              if (message.includes('rate limit') || message.includes('429') ||
                  message.includes('500') || message.includes('503') ||
                  message.includes('service unavailable') || message.includes('temporary')) {
                return true;
              }
              return false;
            },
          }
        );

        calendarLogger.info(
          { recurringEventId: existingEvent.recurringEventId, untilDate: untilString },
          'Updated parent recurring event with UNTIL date (series ended)'
        );
        return;
      }

      // Requirement 5.4: allEvents - Delete parent event (deletes all instances)
      if (effectiveScope === 'allEvents') {
        // Determine the target event ID to delete
        let targetEventId = eventId;

        // If this is a recurring instance, delete the parent event instead
        if (existingEvent.recurringEventId) {
          targetEventId = existingEvent.recurringEventId;
          calendarLogger.info(
            { instanceId: eventId, parentId: targetEventId, scope: effectiveScope },
            'Deleting entire series via parent event'
          );
        } else {
          calendarLogger.info(
            { eventId, scope: effectiveScope },
            'Deleting single event (allEvents scope on non-recurring event)'
          );
        }

        // Delete the parent event (or single event if not recurring)
        await retryWithBackoff(
          async () => {
            await this.calendarClient!.events.delete({
              calendarId: targetCalendarId,
              eventId: targetEventId,
            });
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              if (
                message.includes('not found') ||
                message.includes('404')
              ) {
                return false;
              }
              if (
                message.includes('unauthorized') ||
                message.includes('401') ||
                message.includes('forbidden') ||
                message.includes('403')
              ) {
                return false;
              }
              if (
                message.includes('rate limit') ||
                message.includes('429') ||
                message.includes('500') ||
                message.includes('503') ||
                message.includes('service unavailable') ||
                message.includes('temporary')
              ) {
                return true;
              }
              return true;
            },
          }
        );
        return;
      }
    } catch (error) {
      // Handle 404 gracefully (event already deleted)
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('not found') || message.includes('404')) {
        // Silently succeed if event doesn't exist
        return;
      }

      // Throw other errors
      throw new Error(
        `Failed to delete event from Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete multiple calendar events in batch
   * Requirement: 5, 10 (Calendar event batch deletion with retry logic)
   *
   * Deletes multiple events from Google Calendar using batch API requests.
   * Splits eventIds into chunks of 50 (Google API limit) if needed.
   * Includes retry logic with exponential backoff for transient failures.
   * Handles partial failures gracefully (continues with remaining chunks).
   *
   * @param eventIds - Array of event IDs to delete
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @returns Object with count of successfully deleted events
   */
  async deleteEventsBatch(
    eventIds: string[],
    calendarId?: string
  ): Promise<{ deleted: number }> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const targetCalendarId = calendarId || 'primary';
    let totalDeleted = 0;

    // Split into chunks of 50 (Google Batch API limit)
    const chunks: string[][] = [];
    for (let i = 0; i < eventIds.length; i += 50) {
      chunks.push(eventIds.slice(i, i + 50));
    }

    // Process each chunk
    for (const chunk of chunks) {
      try {
        await retryWithBackoff(
          async () => {
            // Create individual delete promises for this chunk
            const deletePromises = chunk.map(eventId =>
              this.calendarClient!.events.delete({
                calendarId: targetCalendarId,
                eventId: eventId,
              }).catch(error => {
                // Handle 404 gracefully (event already deleted)
                const message = error.message ? error.message.toLowerCase() : '';
                if (message.includes('not found') || message.includes('404')) {
                  // Count as successful if event doesn't exist
                  return { success: true };
                }
                throw error;
              })
            );

            // Execute all deletes in parallel for this chunk
            await Promise.all(deletePromises);
          },
          {
            maxAttempts: 3,
            initialDelay: 1000,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();

              // Don't retry on auth errors (401, 403)
              if (
                message.includes('unauthorized') ||
                message.includes('401') ||
                message.includes('forbidden') ||
                message.includes('403')
              ) {
                return false;
              }

              // Retry on rate limit (429) and server errors (500, 503)
              if (
                message.includes('rate limit') ||
                message.includes('429') ||
                message.includes('500') ||
                message.includes('503') ||
                message.includes('service unavailable') ||
                message.includes('temporary')
              ) {
                return true;
              }

              // Default to retryable
              return true;
            },
          }
        );

        // Count successful deletions for this chunk
        totalDeleted += chunk.length;
      } catch (error) {
        // Log error but continue with remaining chunks
        // This ensures partial success if some chunks fail
        calendarLogger.error(
          { err: error },
          'Failed to delete chunk of events'
        );
      }
    }

    return { deleted: totalDeleted };
  }

  /**
   * Respond to a calendar event invitation
   * Requirement: 6, 10 (Event invitation response with retry logic)
   *
   * Updates the current user's attendance status for an event invitation.
   * Sends notification to the organizer with sendUpdates='all'.
   * Includes retry logic with exponential backoff for transient failures.
   *
   * @param eventId - Event ID to respond to
   * @param response - Response status ('accepted' | 'declined' | 'tentative')
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @throws Error if authentication fails, event not found, or user is not an attendee
   */
  async respondToEvent(
    eventId: string,
    response: 'accepted' | 'declined' | 'tentative',
    calendarId?: string
  ): Promise<void> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const targetCalendarId = calendarId || 'primary';

    try {
      // Step 1: Get current user's email by fetching primary calendar info
      const userEmail = await retryWithBackoff(
        async () => {
          const calendarInfo = await this.calendarClient!.calendarList.get({
            calendarId: 'primary',
          });
          return calendarInfo.data.id;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            const message = error.message.toLowerCase();
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            return true;
          },
        }
      );

      if (!userEmail) {
        throw new Error('Failed to retrieve user email from Google Calendar');
      }

      // Step 2: Get current event with retry
      const event = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.events.get({
              calendarId: targetCalendarId,
              eventId: eventId,
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            const message = error.message.toLowerCase();
            if (
              message.includes('not found') ||
              message.includes('404')
            ) {
              return false;
            }
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            return true;
          },
        }
      );

      // Step 3: Validate event and user
      if (!event.attendees || event.attendees.length === 0) {
        throw new Error('Event has no attendees. Cannot respond to this event.');
      }

      // Check if user is the organizer
      if (event.organizer && event.organizer.email === userEmail) {
        throw new Error('Cannot respond to event as the organizer.');
      }

      // Step 4: Find current user in attendees list
      const userAttendee = event.attendees.find(
        attendee => attendee.email === userEmail
      );

      if (!userAttendee) {
        throw new Error(`User ${userEmail} is not an attendee of this event.`);
      }

      // Step 5: Update attendee's response status
      const updatedAttendees = event.attendees.map(attendee => {
        if (attendee.email === userEmail) {
          return {
            ...attendee,
            responseStatus: response,
          };
        }
        return attendee;
      });

      // Step 6: Patch event with updated attendees and retry
      await retryWithBackoff(
        async () => {
          await this.calendarClient!.events.patch({
            calendarId: targetCalendarId,
            eventId: eventId,
            requestBody: {
              attendees: updatedAttendees,
            },
            sendUpdates: 'all', // Notify organizer and other attendees
          });
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            const message = error.message.toLowerCase();
            if (
              message.includes('not found') ||
              message.includes('404')
            ) {
              return false;
            }
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            return true;
          },
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found') || message.includes('404')) {
        throw new Error(`Event with ID ${eventId} not found in Google Calendar.`);
      }
      throw new Error(
        `Failed to respond to event in Google Calendar: ${message}`
      );
    }
  }

  /**
   * List all calendars
   * Requirement: 2, 9 (Calendar list retrieval, User data privacy)
   *
   * Fetches all calendars accessible by the user from Google Calendar API.
   * Returns CalendarInfo array with id, name, isPrimary, accessRole, and color.
   * Includes retry logic with exponential backoff for transient failures.
   *
   * @returns Array of CalendarInfo objects
   * @throws Error if authentication fails or API request fails after retries
   */
  async listCalendars(): Promise<CalendarInfo[]> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    try {
      // Fetch calendar list with retry logic
      const response: calendar_v3.Schema$CalendarList = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.calendarList.list({
              showHidden: true, // Include hidden calendars
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            // Retry on rate limit (429) and server errors (500, 503)
            const message = error.message.toLowerCase();
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            // Don't retry on auth errors (401, 403)
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            // Default to retryable
            return true;
          },
        }
      );

      // Convert Google Calendar items to CalendarInfo format
      const calendars = response.items || [];
      return calendars.map(calendar => ({
        id: calendar.id || '',
        name: calendar.summary || '',
        source: 'google' as const,
        isPrimary: calendar.primary || false,
        color: calendar.backgroundColor || undefined,
        accessRole: calendar.accessRole as 'owner' | 'writer' | 'reader' | undefined,
      }));
    } catch (error) {
      throw new Error(
        `Failed to list calendars from Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check availability for multiple people
   * Requirement: check-others-availability 1.1-1.6, 3.1-3.3
   *
   * Uses Google Calendar Freebusy API to check availability of multiple people.
   * Returns busy periods for each person. Handles permission errors gracefully
   * (partial success - returns error for inaccessible calendars).
   *
   * @param emails - Array of email addresses (max 20)
   * @param startTime - Start of time range (ISO 8601)
   * @param endTime - End of time range (ISO 8601)
   * @returns PeopleAvailabilityResult with availability for each person
   * @throws Error if authentication fails or API request fails after retries
   */
  async checkPeopleAvailability(
    emails: string[],
    startTime: string,
    endTime: string
  ): Promise<PeopleAvailabilityResult> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    // Validate email count
    if (emails.length === 0) {
      throw new Error('At least one email address is required');
    }
    if (emails.length > 20) {
      throw new Error('Maximum 20 email addresses allowed');
    }

    calendarLogger.info(
      { emailCount: emails.length, startTime, endTime },
      'Checking people availability'
    );

    try {
      // Query Freebusy API with batching (50 calendars per request max)
      const busyData = await this.queryFreebusyForPeople(emails, startTime, endTime);

      // Build result for each person
      const people: PersonAvailability[] = emails.map(email => {
        const data = busyData.get(email);

        if (!data) {
          // No data returned - likely permission denied
          return {
            email,
            isAvailable: false,
            busyPeriods: [],
            error: 'アクセス権限がないか、カレンダーが見つかりません',
          };
        }

        if (data.error) {
          return {
            email,
            isAvailable: false,
            busyPeriods: [],
            error: data.error,
          };
        }

        const busyPeriods = data.busyPeriods || [];
        const isAvailable = this.isPersonAvailable(busyPeriods, startTime, endTime);

        return {
          email,
          isAvailable,
          busyPeriods,
        };
      });

      return {
        people,
        timeRange: {
          start: startTime,
          end: endTime,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to check people availability: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Query Freebusy API for multiple people
   * Batches requests in groups of 50 (API limit)
   *
   * @param emails - Array of email addresses
   * @param startTime - Start time in ISO 8601 format
   * @param endTime - End time in ISO 8601 format
   * @returns Map of email to availability data
   */
  private async queryFreebusyForPeople(
    emails: string[],
    startTime: string,
    endTime: string
  ): Promise<Map<string, { busyPeriods?: BusyPeriod[]; error?: string }>> {
    const result = new Map<string, { busyPeriods?: BusyPeriod[]; error?: string }>();

    // Batch requests in groups of 50 (API limit)
    const BATCH_SIZE = 50;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);

      const response = await retryWithBackoff(
        async () => {
          return (
            await this.calendarClient!.freebusy.query({
              requestBody: {
                timeMin: startTime,
                timeMax: endTime,
                items: batch.map(email => ({ id: email })),
              },
            })
          ).data;
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          shouldRetry: (error: Error) => {
            const message = error.message.toLowerCase();
            if (
              message.includes('rate limit') ||
              message.includes('429') ||
              message.includes('500') ||
              message.includes('503') ||
              message.includes('service unavailable') ||
              message.includes('temporary')
            ) {
              return true;
            }
            if (
              message.includes('unauthorized') ||
              message.includes('401') ||
              message.includes('forbidden') ||
              message.includes('403')
            ) {
              return false;
            }
            return true;
          },
        }
      );

      const calendars = response.calendars || {};
      for (const email of batch) {
        const calendarData = calendars[email];

        if (!calendarData) {
          result.set(email, { error: 'カレンダーデータが取得できませんでした' });
          continue;
        }

        // Check for errors in the response
        if (calendarData.errors && calendarData.errors.length > 0) {
          const errorReason = calendarData.errors[0].reason || 'unknown';
          let errorMessage = 'カレンダーにアクセスできません';
          if (errorReason === 'notFound') {
            errorMessage = 'カレンダーが見つかりません';
          } else if (errorReason === 'notAnAttendee' || errorReason === 'accessDenied') {
            errorMessage = 'アクセス権限がありません';
          }
          result.set(email, { error: errorMessage });
          continue;
        }

        // Extract busy periods
        const busyPeriods: BusyPeriod[] = (calendarData.busy || []).map(period => ({
          start: period.start || '',
          end: period.end || '',
        }));

        result.set(email, { busyPeriods });
      }
    }

    return result;
  }

  /**
   * Check if a person is available during the requested period
   *
   * @param busyPeriods - Array of busy periods
   * @param startTime - Requested start time
   * @param endTime - Requested end time
   * @returns True if person has no overlapping busy periods
   */
  private isPersonAvailable(
    busyPeriods: BusyPeriod[],
    startTime: string,
    endTime: string
  ): boolean {
    const requestStart = new Date(startTime).getTime();
    const requestEnd = new Date(endTime).getTime();

    for (const busy of busyPeriods) {
      const busyStart = new Date(busy.start).getTime();
      const busyEnd = new Date(busy.end).getTime();

      // Check for overlap
      if (requestStart < busyEnd && requestEnd > busyStart) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the primary calendar email for the authenticated user
   * Requirement: check-others-availability 2.2
   *
   * @returns Primary calendar email address
   */
  async getPrimaryCalendarEmail(): Promise<string> {
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const calendarInfo = await this.calendarClient!.calendarList.get({
      calendarId: 'primary',
    });

    return calendarInfo.data.id || '';
  }

  /**
   * Find common free time slots among multiple people
   * Requirement: check-others-availability 2.1-2.6
   *
   * Calculates time slots where ALL specified people are available.
   * Algorithm:
   * 1. Get busy periods for all users
   * 2. Start with the full time range as "free"
   * 3. Subtract each user's busy periods
   * 4. Filter by minimum duration
   * 5. Sort by start time
   *
   * @param emails - Array of email addresses
   * @param startTime - Start of search range (ISO 8601)
   * @param endTime - End of search range (ISO 8601)
   * @param minDurationMinutes - Minimum slot duration (default: 30)
   * @returns CommonAvailabilityResult with common free slots
   */
  async findCommonAvailability(
    emails: string[],
    startTime: string,
    endTime: string,
    minDurationMinutes: number = 30
  ): Promise<CommonAvailabilityResult> {
    calendarLogger.info(
      { emailCount: emails.length, startTime, endTime, minDurationMinutes },
      'Finding common availability'
    );

    // Get availability for all people
    const availabilityResult = await this.checkPeopleAvailability(emails, startTime, endTime);

    // Collect all busy periods from all people (exclude those with errors)
    const allBusyPeriods: BusyPeriod[] = [];
    const resolvedParticipants: ResolvedParticipant[] = [];

    for (const person of availabilityResult.people) {
      resolvedParticipants.push({
        query: person.email,
        email: person.email,
        displayName: person.displayName,
        error: person.error,
      });

      // Skip people with errors - they don't contribute to busy periods
      if (person.error) {
        continue;
      }

      allBusyPeriods.push(...person.busyPeriods);
    }

    // Calculate common free slots
    const commonSlots = this.calculateCommonFreeSlots(
      allBusyPeriods,
      startTime,
      endTime,
      minDurationMinutes
    );

    return {
      commonSlots,
      participants: resolvedParticipants,
      timeRange: {
        start: startTime,
        end: endTime,
      },
    };
  }

  /**
   * Calculate common free time slots by subtracting busy periods
   *
   * Algorithm:
   * 1. Merge and sort all busy periods
   * 2. Walk through the time range, identifying gaps (free time)
   * 3. Filter by minimum duration
   *
   * @param busyPeriods - All busy periods from all people
   * @param startTime - Start of search range
   * @param endTime - End of search range
   * @param minDurationMinutes - Minimum slot duration
   * @returns Array of common free slots
   */
  private calculateCommonFreeSlots(
    busyPeriods: BusyPeriod[],
    startTime: string,
    endTime: string,
    minDurationMinutes: number
  ): CommonFreeSlot[] {
    const rangeStart = new Date(startTime).getTime();
    const rangeEnd = new Date(endTime).getTime();
    const minDurationMs = minDurationMinutes * 60 * 1000;

    // If no busy periods, the entire range is free
    if (busyPeriods.length === 0) {
      const duration = rangeEnd - rangeStart;
      if (duration >= minDurationMs) {
        return [{
          start: startTime,
          end: endTime,
          durationMinutes: Math.floor(duration / 60000),
        }];
      }
      return [];
    }

    // Sort busy periods by start time
    const sortedBusy = busyPeriods
      .map(bp => ({
        start: new Date(bp.start).getTime(),
        end: new Date(bp.end).getTime(),
      }))
      .sort((a, b) => a.start - b.start);

    // Merge overlapping busy periods
    const mergedBusy: { start: number; end: number }[] = [];
    for (const busy of sortedBusy) {
      // Clip to range
      const clippedStart = Math.max(busy.start, rangeStart);
      const clippedEnd = Math.min(busy.end, rangeEnd);

      if (clippedStart >= clippedEnd) {
        // Outside range, skip
        continue;
      }

      if (mergedBusy.length === 0) {
        mergedBusy.push({ start: clippedStart, end: clippedEnd });
      } else {
        const last = mergedBusy[mergedBusy.length - 1];
        if (clippedStart <= last.end) {
          // Overlapping or adjacent, merge
          last.end = Math.max(last.end, clippedEnd);
        } else {
          // Non-overlapping, add new
          mergedBusy.push({ start: clippedStart, end: clippedEnd });
        }
      }
    }

    // Find free slots (gaps between busy periods)
    const freeSlots: CommonFreeSlot[] = [];
    let currentTime = rangeStart;

    for (const busy of mergedBusy) {
      if (currentTime < busy.start) {
        // Free slot found
        const slotDuration = busy.start - currentTime;
        if (slotDuration >= minDurationMs) {
          freeSlots.push({
            start: new Date(currentTime).toISOString(),
            end: new Date(busy.start).toISOString(),
            durationMinutes: Math.floor(slotDuration / 60000),
          });
        }
      }
      currentTime = Math.max(currentTime, busy.end);
    }

    // Check for free time after the last busy period
    if (currentTime < rangeEnd) {
      const slotDuration = rangeEnd - currentTime;
      if (slotDuration >= minDurationMs) {
        freeSlots.push({
          start: new Date(currentTime).toISOString(),
          end: new Date(rangeEnd).toISOString(),
          durationMinutes: Math.floor(slotDuration / 60000),
        });
      }
    }

    return freeSlots;
  }
}
