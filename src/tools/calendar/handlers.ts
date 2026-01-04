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
import type { GoogleCalendarService } from '../../integrations/google-calendar-service.js';
import type { WorkingCadenceService } from '../../services/working-cadence.js';
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

export interface FindAvailableSlotsInput {
  durationMinutes: number;
  startDate?: string;
  endDate?: string;
  preferDeepWork?: boolean;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
}

export interface ListCalendarEventsInput {
  startDate: string;
  endDate: string;
  calendarId?: string;
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

export interface CreateCalendarEventInput {
  title: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes?: string;
  calendarName?: string;
  alarms?: string[];
  preferredSource?: 'eventkit' | 'google';
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
 * list_calendar_events handler
 *
 * List calendar events for a specified period.
 * Requirement: 16.1-16.12, Task 27
 */
export async function handleListCalendarEvents(
  ctx: CalendarToolsContext,
  args: ListCalendarEventsInput
) {
  const { startDate, endDate, calendarId } = args;
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

    const events = await calendarSourceManager!.getEvents(
      startDate,
      endDate,
      calendarId
    );

    return createToolResponse({
      success: true,
      sources: enabledSources,
      events: events.map((event) => {
        // Use type assertion via unknown for optional fields added in Task 25
        const eventRecord = event as unknown as Record<string, unknown>;
        return {
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          isAllDay: event.isAllDay,
          calendar: eventRecord.calendar,
          location: eventRecord.location,
          source: eventRecord.source,
        };
      }),
      period: { start: startDate, end: endDate },
      totalEvents: events.length,
      message:
        events.length > 0
          ? `${events.length}件のイベントが見つかりました (ソース: ${enabledSources.join(', ')})。`
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
 * Requirement: 17.3, 17.4, 17.12
 */
export async function handleRespondToCalendarEventsBatch(
  ctx: CalendarToolsContext,
  args: RespondToCalendarEventsBatchInput
) {
  const { eventIds, response, comment } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  let calendarEventResponseService = ctx.getCalendarEventResponseService();
  if (!calendarEventResponseService) {
    ctx.initializeServices(config);
    calendarEventResponseService = ctx.getCalendarEventResponseService();
  }

  try {
    const isAvailable =
      await calendarEventResponseService!.isEventKitAvailable();

    if (!isAvailable) {
      return createToolResponse({
        success: false,
        message: 'カレンダーイベント返信機能はmacOSでのみ利用可能です。',
      });
    }

    const result = await calendarEventResponseService!.respondToEventsBatch({
      eventIds,
      response,
      comment,
    });

    return createToolResponse({
      success: result.success,
      summary: result.summary,
      details: {
        succeeded: result.details.succeeded,
        skipped: result.details.skipped,
        failed: result.details.failed,
      },
      message: result.message,
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
 * Create a new calendar event.
 * Requirement: 18.1-18.11, Task 29
 */
export async function handleCreateCalendarEvent(
  ctx: CalendarToolsContext,
  args: CreateCalendarEventInput
) {
  const { title, startDate, endDate, location, notes, preferredSource } = args;
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

    const request = {
      title,
      start: startDate,
      end: endDate,
      location,
      description: notes,
    };

    const event = await calendarSourceManager!.createEvent(
      request,
      preferredSource
    );

    // Use type assertion via unknown for optional fields
    const eventRecord = event as unknown as Record<string, unknown>;

    return createToolResponse({
      success: true,
      eventId: event.id,
      title: event.title,
      startDate: event.start,
      endDate: event.end,
      source: event.source || 'unknown',
      calendarName: eventRecord.calendar,
      isAllDay: event.isAllDay,
      message: `カレンダーイベントを作成しました: ${event.title} (ソース: ${event.source || 'unknown'})`,
    });
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
