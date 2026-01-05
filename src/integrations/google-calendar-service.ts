/**
 * Google Calendar Service
 * Requirements: 1, 10 (Google Calendar OAuth Authentication, Health Check)
 *
 * Provides Google Calendar API integration with OAuth authentication,
 * event CRUD operations, and calendar management.
 */

import { google, calendar_v3 } from 'googleapis';
import { GoogleOAuthHandler } from '../oauth/google-oauth-handler.js';
import type {
  CalendarEvent,
  CalendarInfo,
  GoogleCalendarEvent,
  GoogleCalendarEventType,
  OutOfOfficeProperties,
  FocusTimeProperties,
  WorkingLocationProperties,
  BirthdayProperties,
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
        if (request.outOfOfficeProperties) {
          payload.outOfOfficeProperties = {
            autoDeclineMode: request.outOfOfficeProperties.autoDeclineMode,
            declineMessage: request.outOfOfficeProperties.declineMessage,
          };
        }
        break;

      case 'focusTime':
        if (request.focusTimeProperties) {
          payload.focusTimeProperties = {
            autoDeclineMode: request.focusTimeProperties.autoDeclineMode,
            declineMessage: request.focusTimeProperties.declineMessage,
            chatStatus: request.focusTimeProperties.chatStatus,
          };
        }
        break;

      case 'workingLocation':
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
   * @param dateString - Date string in YYYY-MM-DD or RFC3339 format
   * @returns Date string in RFC3339 format (YYYY-MM-DDT00:00:00Z)
   */
  private normalizeToRFC3339(dateString: string): string {
    // Check if already in RFC3339 format (contains 'T' and timezone)
    if (dateString.includes('T')) {
      return dateString;
    }

    // Convert YYYY-MM-DD to YYYY-MM-DDT00:00:00Z
    // Using 00:00:00 UTC ensures we capture all events on the date
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
                timeMax: this.normalizeToRFC3339(request.endDate),
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

      // Build and merge event type-specific payload
      const eventTypePayload = this.buildEventTypePayload(request);
      Object.assign(eventBody, eventTypePayload);

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
   * Update a calendar event
   * Requirement: 4, 10, 4.5, 5.3, 6.6 (Calendar event updates with partial updates, retry logic, and event type restrictions)
   *
   * Updates an existing event in Google Calendar using the patch API for partial updates.
   * Supports all-day events, reminders, attendees, and recurring events.
   * Includes retry logic with exponential backoff for transient failures.
   * Enforces event type restrictions (birthday and fromGmail events have limited updatable fields).
   *
   * @param eventId - Event ID to update
   * @param updates - Partial CreateEventRequest with fields to update
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @returns Updated calendar event
   * @throws Error if authentication fails, API request fails after retries, or disallowed fields are being updated
   */
  async updateEvent(
    eventId: string,
    updates: Partial<CreateEventRequest>,
    calendarId?: string
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

      // Build Google Calendar patch object (only include provided fields)
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
        // If updating dates, need to handle both start and end consistently
        if (updates.isAllDay !== undefined && updates.isAllDay) {
          // All-day event: use 'date' field (YYYY-MM-DD format)
          if (updates.start !== undefined) {
            patchBody.start = {
              date: updates.start.split('T')[0], // Extract date part from ISO 8601
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
          patchBody.attendees = updates.attendees.map(email => ({ email }));
        } else {
          // Empty array means remove all attendees
          patchBody.attendees = [];
        }
      }

      // Handle reminders
      if (updates.reminders !== undefined) {
        patchBody.reminders = updates.reminders;
      }

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
   * Delete a calendar event
   * Requirement: 5, 10 (Calendar event deletion with retry logic)
   *
   * Deletes a single event from Google Calendar using the delete API.
   * Includes retry logic with exponential backoff for transient failures.
   * Handles 404 errors gracefully (event already deleted).
   *
   * @param eventId - Event ID to delete
   * @param calendarId - Calendar ID (optional, defaults to 'primary')
   * @throws Error if authentication fails or API request fails after retries (except 404)
   */
  async deleteEvent(eventId: string, calendarId?: string): Promise<void> {
    // Ensure client is authenticated
    if (!this.calendarClient) {
      await this.authenticate();
    }

    const targetCalendarId = calendarId || 'primary';

    try {
      // Delete event with retry logic
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

            // Don't retry on 404 (event not found / already deleted)
            if (
              message.includes('not found') ||
              message.includes('404')
            ) {
              return false;
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
        console.error(
          `Failed to delete chunk of events: ${error instanceof Error ? error.message : 'Unknown error'}`
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
}
