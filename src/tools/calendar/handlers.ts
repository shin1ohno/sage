/**
 * Calendar Tool Handlers
 *
 * Business logic for calendar-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: 3.3-3.6, 6.1-6.6, 16-19, 32
 */

import type { UserConfig } from '../../types/index.js';
import type { CalendarSourceManager } from '../../integrations/calendar-source-manager.js';
import type { CalendarEventResponseService } from '../../integrations/calendar-event-response.js';
import type { GoogleCalendarService, CreateEventRequest } from '../../integrations/google-calendar-service.js';
import type { WorkingCadenceService } from '../../services/working-cadence.js';
import type {
  GoogleCalendarEventType,
  AutoDeclineMode,
  CalendarEvent as ExtendedCalendarEvent,
} from '../../types/google-calendar-types.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';

/**
 * Calendar context containing shared state and services
 */
export interface CalendarToolsContext {
  getConfig: () => UserConfig | null;
  getCalendarSourceManager: () => CalendarSourceManager | null;
  getCalendarEventResponseService: () => CalendarEventResponseService | null;
  getGoogleCalendarService: () => GoogleCalendarService | null;
  getWorkingCadenceService: () => WorkingCadenceService | null;
  setWorkingCadenceService: (service: WorkingCadenceService) => void;
  initializeServices: (config: UserConfig) => void;
}

// ============================================================
// Input Types
// ============================================================

/**
 * Input for finding available time slots
 *
 * @property durationMinutes - Required duration in minutes
 * @property startDate - Start date for search (ISO 8601 format)
 * @property endDate - End date for search (ISO 8601 format)
 * @property preferDeepWork - Prefer deep work time slots
 * @property minDurationMinutes - Minimum slot duration in minutes
 * @property maxDurationMinutes - Maximum slot duration in minutes
 * @property preferredWorkingLocation - Filter slots by working location preference.
 *   Valid values: 'homeOffice', 'officeLocation', 'any' (default: 'any')
 *   Requirement: 3.7, 7.5 (google-calendar-event-types spec)
 * @property respectBlockingEventTypes - Whether to respect blocking event types
 *   (outOfOffice, focusTime) when calculating availability.
 *   When true (default), these event types block the time slot.
 *   When false, only 'default' events are considered blocking.
 *   Requirement: 7.5 (google-calendar-event-types spec)
 */
export interface FindAvailableSlotsInput {
  durationMinutes: number;
  startDate?: string;
  endDate?: string;
  preferDeepWork?: boolean;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  /** Filter slots by working location preference. Default: 'any' */
  preferredWorkingLocation?: 'homeOffice' | 'officeLocation' | 'any';
  /** Whether to respect blocking event types (outOfOffice, focusTime). Default: true */
  respectBlockingEventTypes?: boolean;
}

/**
 * Input for listing calendar events
 *
 * @property startDate - Start date in ISO 8601 format (e.g., 2025-01-15)
 * @property endDate - End date in ISO 8601 format (e.g., 2025-01-20)
 * @property calendarId - Optional calendar ID to filter events
 * @property eventTypes - Optional array of event type names to filter results.
 *   Valid types: 'default', 'outOfOffice', 'focusTime', 'workingLocation', 'birthday', 'fromGmail'
 *   When specified, only events matching these types are returned.
 *   When omitted, all event types are returned.
 */
export interface ListCalendarEventsInput {
  startDate: string;
  endDate: string;
  calendarId?: string;
  eventTypes?: string[];
}

export interface RespondToCalendarEventInput {
  eventId: string;
  response: 'accept' | 'decline' | 'tentative';
  comment?: string;
  source?: 'eventkit' | 'google';
  calendarId?: string;
}

export interface RespondToCalendarEventsBatchInput {
  eventIds: string[];
  response: 'accept' | 'decline' | 'tentative';
  comment?: string;
}

/**
 * Input for creating a calendar event
 *
 * @property title - Event title/summary
 * @property startDate - Start date/time in ISO 8601 format (e.g., 2025-01-15T10:00:00+09:00)
 * @property endDate - End date/time in ISO 8601 format (e.g., 2025-01-15T11:00:00+09:00)
 * @property location - Optional event location
 * @property notes - Optional event notes/description
 * @property calendarName - Optional calendar name to create the event in
 * @property alarms - Optional array of alarm settings (e.g., ['-15m', '-1h'])
 * @property preferredSource - Optional preferred calendar source ('eventkit' or 'google')
 * @property eventType - Optional event type. Valid types:
 *   'default' (regular event), 'outOfOffice', 'focusTime', 'workingLocation', 'birthday'.
 *   Note: 'fromGmail' cannot be created via API.
 *   When omitted, defaults to 'default'.
 * @property autoDeclineMode - For outOfOffice/focusTime events: auto-decline behavior.
 *   Valid values: 'declineNone', 'declineAllConflictingInvitations', 'declineOnlyNewConflictingInvitations'
 * @property declineMessage - For outOfOffice/focusTime events: custom decline message
 * @property chatStatus - For focusTime events: chat status during focus time.
 *   Valid values: 'available', 'doNotDisturb'
 * @property workingLocationType - For workingLocation events: type of working location.
 *   Valid values: 'homeOffice', 'officeLocation', 'customLocation'
 * @property workingLocationLabel - For workingLocation events: optional label for the location
 * @property birthdayType - For birthday events: type of birthday.
 *   Valid values: 'birthday', 'anniversary', 'other'
 */
export interface CreateCalendarEventInput {
  title: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes?: string;
  calendarName?: string;
  alarms?: string[];
  preferredSource?: 'eventkit' | 'google';
  eventType?: string;
  autoDeclineMode?: string;
  declineMessage?: string;
  chatStatus?: string;
  workingLocationType?: string;
  workingLocationLabel?: string;
  birthdayType?: string;
  /** Room ID (calendar ID) to book for this event */
  roomId?: string;
}

export interface DeleteCalendarEventInput {
  eventId: string;
  source?: 'eventkit' | 'google';
}

export interface DeleteCalendarEventsBatchInput {
  eventIds: string[];
  source?: 'eventkit' | 'google';
}

export interface SetCalendarSourceInput {
  source: 'eventkit' | 'google';
  enabled: boolean;
}

export interface GetWorkingCadenceInput {
  dayOfWeek?:
    | 'Monday'
    | 'Tuesday'
    | 'Wednesday'
    | 'Thursday'
    | 'Friday'
    | 'Saturday'
    | 'Sunday';
  date?: string;
}

// ============================================================
// Handler Functions
// ============================================================

/**
 * find_available_slots handler
 *
 * Find available time slots in calendar for scheduling tasks.
 * Requirement: 3.3-3.6, 6.1-6.6, Task 28
 */
export async function handleFindAvailableSlots(
  ctx: CalendarToolsContext,
  args: FindAvailableSlotsInput
) {
  const {
    durationMinutes,
    startDate,
    endDate,
    preferDeepWork,
    minDurationMinutes,
    maxDurationMinutes,
  } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  if (!calendarSourceManager) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
  }

  try {
    const enabledSources = calendarSourceManager!.getEnabledSources();

    if (enabledSources.length === 0) {
      return createToolResponse({
        success: false,
        message:
          '有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。',
      });
    }

    const searchStart = startDate ?? new Date().toISOString().split('T')[0];
    const searchEnd =
      endDate ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const workingHours = {
      start: config.calendar.workingHours.start,
      end: config.calendar.workingHours.end,
    };

    const minDuration = minDurationMinutes ?? durationMinutes ?? 25;
    const maxDuration = maxDurationMinutes ?? 480;

    const slots = await calendarSourceManager!.findAvailableSlots({
      startDate: searchStart,
      endDate: searchEnd,
      minDurationMinutes: minDuration,
      maxDurationMinutes: maxDuration,
      workingHours,
    });

    const filteredSlots = preferDeepWork
      ? slots.filter((s) => s.dayType === 'deep-work')
      : slots;

    return createToolResponse({
      success: true,
      sources: enabledSources,
      searchRange: { start: searchStart, end: searchEnd },
      totalSlots: filteredSlots.length,
      slots: filteredSlots.slice(0, 10).map((slot) => ({
        start: slot.start,
        end: slot.end,
        durationMinutes: slot.durationMinutes,
        suitability: slot.suitability,
        dayType: slot.dayType,
        reason: slot.reason,
      })),
      message:
        filteredSlots.length > 0
          ? `${filteredSlots.length}件の空き時間が見つかりました (ソース: ${enabledSources.join(', ')})。`
          : '指定した条件に合う空き時間が見つかりませんでした。',
    });
  } catch (error) {
    return createErrorFromCatch('カレンダー検索に失敗しました', error);
  }
}

/**
 * Valid event type names for filtering
 * These correspond to Google Calendar API v3 event types
 */
const VALID_EVENT_TYPES = [
  'default',
  'outOfOffice',
  'focusTime',
  'workingLocation',
  'birthday',
  'fromGmail',
] as const;

type ValidEventType = (typeof VALID_EVENT_TYPES)[number];

/**
 * Validate that eventTypes array contains valid event type names
 * @param eventTypes - Array of event type names to validate
 * @returns Array of valid event types (invalid entries are filtered out)
 */
function validateEventTypes(eventTypes: string[]): ValidEventType[] {
  return eventTypes.filter((type): type is ValidEventType =>
    VALID_EVENT_TYPES.includes(type as ValidEventType)
  );
}

/**
 * list_calendar_events handler
 *
 * List calendar events for a specified period.
 * Supports filtering by event types (default, outOfOffice, focusTime, workingLocation, birthday, fromGmail).
 * Requirement: 16.1-16.12, Task 27, Task 18 (eventTypes filter)
 */
export async function handleListCalendarEvents(
  ctx: CalendarToolsContext,
  args: ListCalendarEventsInput
) {
  const { startDate, endDate, calendarId, eventTypes } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  if (!calendarSourceManager) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
  }

  try {
    const enabledSources = calendarSourceManager!.getEnabledSources();

    if (enabledSources.length === 0) {
      return createToolResponse({
        success: false,
        message:
          '有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。',
      });
    }

    // Fetch all events from calendar sources
    // Cast to ExtendedCalendarEvent to access eventType and typeSpecificProperties
    // Note: CalendarSourceManager returns events with these fields populated from Google Calendar,
    // but the base CalendarEvent type from calendar-service.ts doesn't include them yet.
    // The ExtendedCalendarEvent type from google-calendar-types.ts includes these fields.
    let events = (await calendarSourceManager!.getEvents(
      startDate,
      endDate,
      calendarId
    )) as ExtendedCalendarEvent[];

    // Filter by event types if specified
    // Note: CalendarSourceManager.getEvents() does not support eventTypes filtering directly,
    // so we perform client-side filtering here
    let validatedEventTypes: ValidEventType[] | undefined;
    if (eventTypes && eventTypes.length > 0) {
      validatedEventTypes = validateEventTypes(eventTypes);
      if (validatedEventTypes.length > 0) {
        events = events.filter((event) => {
          // EventKit events without eventType are treated as 'default'
          const eventType = event.eventType || 'default';
          return validatedEventTypes!.includes(eventType as ValidEventType);
        });
      }
    }

    return createToolResponse({
      success: true,
      sources: enabledSources,
      events: events.map((event) => {
        // Include eventType and typeSpecificProperties in the response (Task 18)
        return {
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          isAllDay: event.isAllDay,
          calendar: event.calendar,
          location: event.location,
          source: event.source,
          eventType: event.eventType || 'default',
          typeSpecificProperties: event.typeSpecificProperties,
        };
      }),
      period: { start: startDate, end: endDate },
      totalEvents: events.length,
      eventTypesFilter: validatedEventTypes,
      message:
        events.length > 0
          ? `${events.length}件のイベントが見つかりました (ソース: ${enabledSources.join(', ')})${validatedEventTypes ? ` フィルター: ${validatedEventTypes.join(', ')}` : ''}。`
          : '指定した期間にイベントが見つかりませんでした。',
    });
  } catch (error) {
    return createErrorFromCatch(
      'カレンダーイベントの取得に失敗しました',
      error
    );
  }
}

/**
 * respond_to_calendar_event handler
 *
 * Respond to a single calendar event with accept/decline/tentative.
 * Requirement: 17.1, 17.2, 17.5-17.11
 */
export async function handleRespondToCalendarEvent(
  ctx: CalendarToolsContext,
  args: RespondToCalendarEventInput
) {
  const { eventId, response, comment, source, calendarId } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  let calendarEventResponseService = ctx.getCalendarEventResponseService();

  if (!calendarSourceManager || !calendarEventResponseService) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
    calendarEventResponseService = ctx.getCalendarEventResponseService();
  }

  try {
    // Try Google Calendar first (if source is 'google' or not specified)
    if (source === 'google' || !source) {
      try {
        const result = await calendarSourceManager!.respondToEvent(
          eventId,
          response,
          source === 'google' ? 'google' : undefined,
          calendarId
        );

        return createToolResponse({
          success: true,
          eventId,
          source: result.source || 'google',
          message: result.message,
        });
      } catch (error) {
        if (source === 'google') {
          return createErrorFromCatch(
            'Google Calendarイベント返信に失敗しました',
            error
          );
        }
        // Continue to try EventKit if source was not specified
      }
    }

    // Try EventKit (either explicitly requested or as fallback)
    if (source === 'eventkit' || !source) {
      const isAvailable =
        await calendarEventResponseService!.isEventKitAvailable();

      if (!isAvailable) {
        return createToolResponse({
          success: false,
          message:
            'EventKitカレンダーイベント返信機能はmacOSでのみ利用可能です。Google Calendarイベントの場合は、source=\'google\'を指定してください。',
        });
      }

      const result = await calendarEventResponseService!.respondToEvent({
        eventId,
        response,
        comment,
      });

      if (result.success) {
        return createToolResponse({
          success: true,
          eventId: result.eventId,
          eventTitle: result.eventTitle,
          newStatus: result.newStatus,
          method: result.method,
          instanceOnly: result.instanceOnly,
          source: 'eventkit',
          message: result.message,
        });
      }

      return createToolResponse({
        success: false,
        eventId: result.eventId,
        eventTitle: result.eventTitle,
        skipped: result.skipped,
        reason: result.reason,
        error: result.error,
        source: 'eventkit',
        message: result.skipped
          ? `イベントをスキップしました: ${result.reason}`
          : `イベント返信に失敗しました: ${result.error}`,
      });
    }

    return createToolResponse({
      error: true,
      message: '有効なカレンダーソースが見つかりません。',
    });
  } catch (error) {
    return createErrorFromCatch('カレンダーイベント返信に失敗しました', error);
  }
}

/**
 * respond_to_calendar_events_batch handler
 *
 * Respond to multiple calendar events at once.
 * Uses CalendarSourceManager.respondToEvent() for each event to support
 * both Google Calendar and EventKit events.
 *
 * Requirement: 17.3, 17.4, 17.12
 * Bug fix: calendar-event-response-skip - Use CalendarSourceManager instead of
 *          CalendarEventResponseService to support Google Calendar events.
 */
export async function handleRespondToCalendarEventsBatch(
  ctx: CalendarToolsContext,
  args: RespondToCalendarEventsBatchInput
) {
  const { eventIds, response } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  if (!calendarSourceManager) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
  }

  try {
    const enabledSources = calendarSourceManager!.getEnabledSources();

    if (enabledSources.length === 0) {
      return createToolResponse({
        success: false,
        message:
          '有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。',
      });
    }

    // Process each event using CalendarSourceManager.respondToEvent()
    const results = {
      succeeded: [] as Array<{ id: string; title: string; reason: string }>,
      skipped: [] as Array<{ id: string; title: string; reason: string }>,
      failed: [] as Array<{ id: string; title: string; error: string }>,
    };

    for (const eventId of eventIds) {
      try {
        const result = await calendarSourceManager!.respondToEvent(
          eventId,
          response,
          undefined, // source: auto-detect
          undefined  // calendarId: auto-detect
        );

        if (result.success) {
          results.succeeded.push({
            id: eventId,
            title: eventId,
            reason: result.message,
          });
        } else {
          results.failed.push({
            id: eventId,
            title: eventId,
            error: result.message,
          });
        }
      } catch (error) {
        results.failed.push({
          id: eventId,
          title: eventId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const total = eventIds.length;
    const succeeded = results.succeeded.length;
    const skipped = results.skipped.length;
    const failed = results.failed.length;

    // Generate summary message
    const responseText =
      response === 'accept' ? '承諾' :
      response === 'decline' ? '辞退' : '仮承諾';

    let message = `${total}件中${succeeded}件のイベントを${responseText}しました。`;
    if (skipped > 0) {
      message += `${skipped}件はスキップされました。`;
    }
    if (failed > 0) {
      message += `${failed}件は失敗しました。`;
    }

    return createToolResponse({
      success: failed === 0,
      summary: { total, succeeded, skipped, failed },
      details: {
        succeeded: results.succeeded,
        skipped: results.skipped,
        failed: results.failed,
      },
      message,
    });
  } catch (error) {
    return createErrorFromCatch(
      'カレンダーイベント一括返信に失敗しました',
      error
    );
  }
}

/**
 * create_calendar_event handler
 *
 * Create a new calendar event with support for Google Calendar event types.
 * Requirement: 18.1-18.11, Task 29, Task 19 (Event Type Support)
 *
 * Supports creating:
 * - default: Standard calendar events
 * - outOfOffice: Vacation/OOO blocks with auto-decline
 * - focusTime: Deep work blocks with chat status
 * - workingLocation: Home/office/custom location events
 * - birthday: Birthday/anniversary events
 *
 * Note: 'fromGmail' events cannot be created via API (read-only).
 * Note: EventKit only supports 'default' event type. Non-default event types
 *       are automatically routed to Google Calendar.
 */
export async function handleCreateCalendarEvent(
  ctx: CalendarToolsContext,
  args: CreateCalendarEventInput
) {
  const {
    title,
    startDate,
    endDate,
    location,
    notes,
    preferredSource,
    eventType,
    autoDeclineMode,
    declineMessage,
    chatStatus,
    workingLocationType,
    workingLocationLabel,
    birthdayType,
    roomId,
  } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  if (!calendarSourceManager) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
  }

  try {
    const enabledSources = calendarSourceManager!.getEnabledSources();

    if (enabledSources.length === 0) {
      return createToolResponse({
        success: false,
        message:
          '有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。',
      });
    }

    // Build base request using CreateEventRequest type
    const request: CreateEventRequest = {
      title,
      start: startDate,
      end: endDate,
      location,
      description: notes,
    };

    // Determine effective event type (default to 'default' if not specified)
    // Input eventType is string | undefined, need to cast to GoogleCalendarEventType
    const effectiveEventType = (eventType || 'default') as GoogleCalendarEventType;

    // Validate eventType before proceeding
    const validEventTypes: GoogleCalendarEventType[] = [
      'default',
      'outOfOffice',
      'focusTime',
      'workingLocation',
      'birthday',
      'fromGmail',
    ];
    if (!validEventTypes.includes(effectiveEventType)) {
      return createToolResponse({
        success: false,
        error: true,
        message: `無効なイベントタイプです: ${eventType}。有効な値: ${validEventTypes.join(', ')}`,
      });
    }

    // Add event type if not default
    if (effectiveEventType !== 'default') {
      request.eventType = effectiveEventType;

      // Build type-specific properties based on eventType
      switch (effectiveEventType) {
        case 'outOfOffice':
          if (autoDeclineMode) {
            request.outOfOfficeProperties = {
              autoDeclineMode: autoDeclineMode as AutoDeclineMode,
              declineMessage,
            };
          }
          break;

        case 'focusTime':
          if (autoDeclineMode) {
            request.focusTimeProperties = {
              autoDeclineMode: autoDeclineMode as AutoDeclineMode,
              declineMessage,
              chatStatus: chatStatus as 'available' | 'doNotDisturb' | undefined,
            };
          }
          break;

        case 'workingLocation':
          if (workingLocationType) {
            // Mark as all-day event (required for workingLocation)
            request.isAllDay = true;

            // Cast to the expected type
            const locationType = workingLocationType as 'homeOffice' | 'officeLocation' | 'customLocation';

            // Build workingLocationProperties with all sub-properties at once
            if (locationType === 'homeOffice') {
              request.workingLocationProperties = {
                type: locationType,
                homeOffice: true,
              };
            } else if (locationType === 'customLocation' && workingLocationLabel) {
              request.workingLocationProperties = {
                type: locationType,
                customLocation: {
                  label: workingLocationLabel,
                },
              };
            } else if (locationType === 'officeLocation') {
              request.workingLocationProperties = {
                type: locationType,
                officeLocation: {
                  label: workingLocationLabel,
                },
              };
            } else {
              // Fallback: just set the type
              request.workingLocationProperties = {
                type: locationType,
              };
            }
          }
          break;

        case 'birthday':
          // Mark as all-day event (required for birthday)
          request.isAllDay = true;

          // Cast birthdayType to the expected type
          const birthType = (birthdayType || 'birthday') as 'birthday' | 'anniversary' | 'custom' | 'other' | 'self';
          request.birthdayProperties = {
            type: birthType,
          };
          break;

        case 'fromGmail':
          // fromGmail events cannot be created via API
          return createToolResponse({
            success: false,
            error: true,
            message:
              'fromGmailイベントはAPIから作成できません。これらのイベントはGmailメッセージから自動生成されます。',
          });
      }
    }

    // Determine source routing: non-default event types must use Google Calendar
    // because EventKit does not support event types
    let effectivePreferredSource = preferredSource;
    if (effectiveEventType !== 'default') {
      // Force Google Calendar for non-default event types
      if (!enabledSources.includes('google')) {
        return createToolResponse({
          success: false,
          error: true,
          message: `${effectiveEventType}イベントの作成にはGoogle Calendarが必要です。Google Calendarを有効にしてください。`,
        });
      }
      effectivePreferredSource = 'google';
    }

    // Handle room booking: add room as attendee
    // Requirement: room-availability-search 3.1-3.4
    if (roomId) {
      // Room booking requires Google Calendar
      if (!enabledSources.includes('google')) {
        return createToolResponse({
          success: false,
          error: true,
          message: '会議室予約にはGoogle Calendarが必要です。Google Calendarを有効にしてください。',
        });
      }
      effectivePreferredSource = 'google';

      // Add room as attendee (Google Calendar treats room resources as attendees)
      // The room calendar ID is added as an attendee email
      request.attendees = request.attendees || [];
      request.attendees.push(roomId);
    }

    const event = await calendarSourceManager!.createEvent(
      request,
      effectivePreferredSource
    );

    // Use type assertion via unknown for optional fields
    const eventRecord = event as unknown as Record<string, unknown>;

    // Build response with event type information
    const response: Record<string, unknown> = {
      success: true,
      eventId: event.id,
      title: event.title,
      startDate: event.start,
      endDate: event.end,
      source: event.source || 'unknown',
      calendarName: eventRecord.calendar,
      isAllDay: event.isAllDay,
    };

    // Include eventType in response if not default
    if (effectiveEventType !== 'default') {
      response.eventType = effectiveEventType;
    }

    // Add type-specific info to message
    let messageDetail = '';
    if (effectiveEventType === 'outOfOffice') {
      messageDetail = ' (不在設定)';
    } else if (effectiveEventType === 'focusTime') {
      messageDetail = ' (フォーカスタイム)';
    } else if (effectiveEventType === 'workingLocation') {
      messageDetail = ` (勤務場所: ${workingLocationType})`;
    } else if (effectiveEventType === 'birthday') {
      messageDetail = ' (誕生日/記念日)';
    }

    // Add room booking info to response
    if (roomId) {
      response.roomId = roomId;
      messageDetail += ` [会議室: ${roomId}]`;
    }

    response.message = `カレンダーイベントを作成しました: ${event.title}${messageDetail} (ソース: ${event.source || 'unknown'})`;

    return createToolResponse(response);
  } catch (error) {
    return createErrorFromCatch('カレンダーイベント作成に失敗しました', error);
  }
}

/**
 * delete_calendar_event handler
 *
 * Delete a calendar event.
 * Requirement: 19.1-19.9, Task 30
 */
export async function handleDeleteCalendarEvent(
  ctx: CalendarToolsContext,
  args: DeleteCalendarEventInput
) {
  const { eventId, source } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  if (!calendarSourceManager) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
  }

  try {
    const enabledSources = calendarSourceManager!.getEnabledSources();

    if (enabledSources.length === 0) {
      return createToolResponse({
        success: false,
        message:
          '有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。',
      });
    }

    await calendarSourceManager!.deleteEvent(eventId, source);

    return createToolResponse({
      success: true,
      eventId,
      source: source || 'all enabled sources',
      message: source
        ? `カレンダーイベントを削除しました (ソース: ${source})`
        : `カレンダーイベントを削除しました (全ての有効なソースから)`,
    });
  } catch (error) {
    return createErrorFromCatch('カレンダーイベント削除に失敗しました', error);
  }
}

/**
 * delete_calendar_events_batch handler
 *
 * Delete multiple calendar events.
 * Requirement: 19.10-19.11, Task 30
 */
export async function handleDeleteCalendarEventsBatch(
  ctx: CalendarToolsContext,
  args: DeleteCalendarEventsBatchInput
) {
  const { eventIds, source } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  if (!calendarSourceManager) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
  }

  try {
    const enabledSources = calendarSourceManager!.getEnabledSources();

    if (enabledSources.length === 0) {
      return createToolResponse({
        success: false,
        message:
          '有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。',
      });
    }

    const results: Array<{ eventId: string; success: boolean; error?: string }> =
      [];

    for (const eventId of eventIds) {
      try {
        await calendarSourceManager!.deleteEvent(eventId, source);
        results.push({ eventId, success: true });
      } catch (error) {
        results.push({
          eventId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return createToolResponse({
      success: failedCount === 0,
      totalCount: eventIds.length,
      successCount,
      failedCount,
      source: source || 'all enabled sources',
      results,
      message: source
        ? `${successCount}/${eventIds.length}件のイベントを削除しました (ソース: ${source})`
        : `${successCount}/${eventIds.length}件のイベントを削除しました (全ての有効なソースから)`,
    });
  } catch (error) {
    return createErrorFromCatch(
      'カレンダーイベント一括削除に失敗しました',
      error
    );
  }
}

/**
 * list_calendar_sources handler
 *
 * List available and enabled calendar sources.
 * Requirement: Task 32
 */
export async function handleListCalendarSources(ctx: CalendarToolsContext) {
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarSourceManager = ctx.getCalendarSourceManager();
  if (!calendarSourceManager) {
    ctx.initializeServices(config);
    calendarSourceManager = ctx.getCalendarSourceManager();
  }

  try {
    const availableSources =
      await calendarSourceManager!.detectAvailableSources();
    const enabledSources = calendarSourceManager!.getEnabledSources();
    const healthStatus = await calendarSourceManager!.healthCheck();

    return createToolResponse({
      success: true,
      sources: {
        eventkit: {
          available: availableSources.eventkit,
          enabled: enabledSources.includes('eventkit'),
          healthy: healthStatus.eventkit,
          description: 'macOS EventKit calendar integration (macOS only)',
        },
        google: {
          available: availableSources.google,
          enabled: enabledSources.includes('google'),
          healthy: healthStatus.google,
          description: 'Google Calendar API integration (all platforms)',
        },
      },
      summary: {
        totalAvailable: Object.values(availableSources).filter(Boolean).length,
        totalEnabled: enabledSources.length,
        allHealthy: Object.values(healthStatus).every(Boolean),
      },
    });
  } catch (error) {
    return createErrorFromCatch(
      'カレンダーソース情報の取得に失敗しました',
      error
    );
  }
}

/**
 * get_working_cadence handler
 *
 * Get user's working rhythm information.
 * Requirement: 32.1-32.10
 */
export async function handleGetWorkingCadence(
  ctx: CalendarToolsContext,
  args: GetWorkingCadenceInput
) {
  const { dayOfWeek, date } = args;

  // Dynamically import WorkingCadenceService to avoid circular dependency
  let workingCadenceService = ctx.getWorkingCadenceService();
  if (!workingCadenceService) {
    const { WorkingCadenceService } = await import(
      '../../services/working-cadence.js'
    );
    workingCadenceService = new WorkingCadenceService();
    ctx.setWorkingCadenceService(workingCadenceService);
  }

  try {
    const result = await workingCadenceService.getWorkingCadence({
      dayOfWeek,
      date,
    });

    if (!result.success) {
      return createToolResponse({
        error: true,
        message: result.error || '勤務リズム情報の取得に失敗しました。',
      });
    }

    return createToolResponse({
      success: true,
      user: result.user,
      workingHours: result.workingHours,
      weeklyPattern: result.weeklyPattern,
      deepWorkBlocks: result.deepWorkBlocks,
      weeklyReview: result.weeklyReview,
      specificDay: result.specificDay,
      recommendations: result.recommendations,
      summary: result.summary,
    });
  } catch (error) {
    return createErrorFromCatch('勤務リズム情報の取得に失敗しました', error);
  }
}

// ============================================================
// Room Availability Input Types
// Requirement: room-availability-search 1, 2
// ============================================================

/**
 * Input for searching room availability
 * Requirement: room-availability-search 1.1-1.10
 */
export interface SearchRoomAvailabilityInput {
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  minCapacity?: number;
  building?: string;
  floor?: string;
  features?: string[];
}

/**
 * Input for checking specific room availability
 * Requirement: room-availability-search 2.1-2.4
 */
export interface CheckRoomAvailabilityInput {
  roomId: string;
  startTime: string;
  endTime: string;
}

/**
 * search_room_availability handler
 *
 * Search for available meeting rooms during a specific time period.
 * Requirement: room-availability-search 1.1-1.10
 */
export async function handleSearchRoomAvailability(
  ctx: CalendarToolsContext,
  args: SearchRoomAvailabilityInput
) {
  const {
    startTime,
    endTime,
    durationMinutes,
    minCapacity,
    building,
    floor,
    features,
  } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  // Check if Google Calendar is enabled (required for room search)
  const googleCalendarService = ctx.getGoogleCalendarService();
  if (!googleCalendarService) {
    return createToolResponse({
      error: true,
      message:
        'Google Calendarが設定されていません。会議室検索にはGoogle Calendarが必要です。',
    });
  }

  try {
    // Dynamically import GoogleCalendarRoomService
    const { GoogleCalendarRoomService } = await import(
      '../../integrations/google-calendar-room-service.js'
    );

    const roomService = new GoogleCalendarRoomService(googleCalendarService);

    const results = await roomService.searchRoomAvailability({
      startTime,
      endTime,
      durationMinutes,
      minCapacity,
      building,
      floor,
      features,
    });

    if (results.length === 0) {
      return createToolResponse({
        success: true,
        rooms: [],
        message:
          '会議室が見つかりませんでした。会議室を検索するには、事前にGoogle Calendarで会議室をカレンダーリストに追加する必要があります。' +
          '\n\n【設定手順】\n' +
          '1. Google Calendar (calendar.google.com) を開く\n' +
          '2. 左サイドバーの「他のカレンダー」の「+」→「Browse resources」\n' +
          '3. 使用したい会議室にチェックを入れる\n' +
          '4. 追加後、sageで会議室検索が可能になります',
      });
    }

    // Filter to only available rooms
    const availableRooms = results.filter((r) => r.isAvailable);

    return createToolResponse({
      success: true,
      totalRooms: results.length,
      availableCount: availableRooms.length,
      rooms: results.map((r) => ({
        id: r.room.id,
        name: r.room.name,
        capacity: r.room.capacity,
        building: r.room.building,
        floor: r.room.floor,
        features: r.room.features,
        isAvailable: r.isAvailable,
        busyPeriods: r.busyPeriods,
      })),
      message: `${availableRooms.length}/${results.length}件の会議室が利用可能です。`,
    });
  } catch (error) {
    return createErrorFromCatch('会議室の空き状況検索に失敗しました', error);
  }
}

/**
 * check_room_availability handler
 *
 * Check if a specific meeting room is available during a time period.
 * Requirement: room-availability-search 2.1-2.4
 */
export async function handleCheckRoomAvailability(
  ctx: CalendarToolsContext,
  args: CheckRoomAvailabilityInput
) {
  const { roomId, startTime, endTime } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  // Check if Google Calendar is enabled (required for room search)
  const googleCalendarService = ctx.getGoogleCalendarService();
  if (!googleCalendarService) {
    return createToolResponse({
      error: true,
      message:
        'Google Calendarが設定されていません。会議室検索にはGoogle Calendarが必要です。',
    });
  }

  try {
    // Dynamically import GoogleCalendarRoomService
    const { GoogleCalendarRoomService } = await import(
      '../../integrations/google-calendar-room-service.js'
    );

    const roomService = new GoogleCalendarRoomService(googleCalendarService);

    const result = await roomService.checkRoomAvailability(
      roomId,
      startTime,
      endTime
    );

    return createToolResponse({
      success: true,
      room: {
        id: result.room.id,
        name: result.room.name,
        capacity: result.room.capacity,
        building: result.room.building,
        floor: result.room.floor,
        features: result.room.features,
      },
      isAvailable: result.isAvailable,
      busyPeriods: result.busyPeriods,
      requestedPeriod: result.requestedPeriod,
      message: result.isAvailable
        ? `会議室「${result.room.name}」は指定された時間帯に利用可能です。`
        : `会議室「${result.room.name}」は指定された時間帯に予約済みです。`,
    });
  } catch (error) {
    // Handle room not found error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('Room not found')) {
      return createToolResponse({
        error: true,
        message: `指定された会議室が見つかりません: ${roomId}`,
      });
    }
    return createErrorFromCatch('会議室の空き状況確認に失敗しました', error);
  }
}
