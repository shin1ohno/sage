#!/usr/bin/env node
/**
 * sage - AI Task Management Assistant MCP Server
 *
 * An MCP server for Claude Desktop and Claude Code that provides
 * task management, prioritization, and reminder integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { ConfigLoader } from "./config/loader.js";
import { SetupWizard } from "./setup/wizard.js";
import { ReminderManager } from "./integrations/reminder-manager.js";
import { CalendarService } from "./integrations/calendar-service.js";
import { CalendarSourceManager } from "./integrations/calendar-source-manager.js";
import { GoogleCalendarService } from "./integrations/google-calendar-service.js";
import { GooglePeopleService } from "./integrations/google-people-service.js";
import { NotionMCPService } from "./integrations/notion-mcp.js";
import { TodoListManager } from "./integrations/todo-list-manager.js";
import { TaskSynchronizer } from "./integrations/task-synchronizer.js";
import { CalendarEventResponseService } from "./integrations/calendar-event-response.js";
import { WorkingCadenceService } from "./services/working-cadence.js";
import { GoogleOAuthHandler } from "./oauth/google-oauth-handler.js";
import type { UserConfig } from "./types/index.js";
import { VERSION, SERVER_NAME } from "./version.js";
import { createErrorFromCatch } from "./utils/mcp-response.js";
import { mcpLogger } from "./utils/logger.js";

// Hot-reload imports
import { ServiceRegistry } from "./services/service-registry.js";
import { createAllReloadableAdapters } from "./services/reloadable/index.js";
import { ConfigWatcher } from "./config/config-watcher.js";
import { ConfigReloadService } from "./config/config-reload-service.js";
import { getHotReloadConfig } from "./config/hot-reload-config.js";
import { setupSignalHandlers } from "./cli/signal-handler.js";

// Extracted tool handlers
import {
  type SetupContext,
  handleCheckSetupStatus,
  handleStartSetupWizard,
  handleAnswerWizardQuestion,
  handleSaveConfig,
} from "./tools/setup/index.js";

import {
  type TaskToolsContext,
  handleAnalyzeTasks,
  handleUpdateTaskStatus,
  handleSyncTasks,
  handleDetectDuplicates,
} from "./tools/tasks/index.js";

import {
  type CalendarToolsContext,
  handleFindAvailableSlots,
  handleListCalendarEvents,
  handleRespondToCalendarEvent,
  handleRespondToCalendarEventsBatch,
  handleCreateCalendarEvent,
  handleDeleteCalendarEvent,
  handleDeleteCalendarEventsBatch,
  handleUpdateCalendarEvent,
  handleListCalendarSources,
  handleGetWorkingCadence,
  handleSearchRoomAvailability,
  handleCheckRoomAvailability,
} from "./tools/calendar/index.js";

import {
  type ReminderTodoContext,
  handleSetReminder,
  handleListTodos,
} from "./tools/reminders/index.js";

// Shared tool definitions
import {
  searchRoomAvailabilityTool,
  checkRoomAvailabilityTool,
  updateCalendarEventTool,
  searchDirectoryPeopleTool,
} from "./tools/shared/index.js";

import {
  type DirectoryToolsContext,
  handleSearchDirectoryPeople,
} from "./tools/directory/index.js";

import {
  type IntegrationToolsContext,
  handleSyncToNotion,
  handleUpdateConfig,
} from "./tools/integrations/index.js";

import {
  type OAuthToolsContext,
  handleAuthenticateGoogle,
} from "./tools/oauth/index.js";

import {
  type ReloadContext,
  handleReloadConfig,
} from "./tools/config/index.js";

// Global state
let config: UserConfig | null = null;
let wizardSession: ReturnType<typeof SetupWizard.createSession> | null = null;
let reminderManager: ReminderManager | null = null;
let calendarService: CalendarService | null = null;
let googleCalendarService: GoogleCalendarService | null = null;
let googlePeopleService: GooglePeopleService | null = null;
let calendarSourceManager: CalendarSourceManager | null = null;
let notionService: NotionMCPService | null = null;
let todoListManager: TodoListManager | null = null;
let taskSynchronizer: TaskSynchronizer | null = null;
let calendarEventResponseService: CalendarEventResponseService | null = null;
let workingCadenceService: WorkingCadenceService | null = null;

// Hot-reload state
let serviceRegistry: ServiceRegistry | null = null;
let configReloadService: ConfigReloadService | null = null;

/**
 * Initialize services with config
 */
function initializeServices(userConfig: UserConfig): void {
  reminderManager = new ReminderManager({
    appleRemindersThreshold: 7,
    notionThreshold: userConfig.integrations.notion.threshold,
    defaultList: userConfig.integrations.appleReminders.defaultList,
    notionDatabaseId: userConfig.integrations.notion.databaseId,
  });
  calendarService = new CalendarService();

  // Initialize Google Calendar service if configured
  // Note: GoogleCalendarService requires GoogleOAuthHandler which needs OAuth config
  // For now, we initialize with a stub handler. Full OAuth setup will be done in Task 33.
  try {
    const oauthConfig = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
    };
    const oauthHandler = new GoogleOAuthHandler(oauthConfig);
    googleCalendarService = new GoogleCalendarService(oauthHandler);
    // Initialize Google People service with the same OAuth handler
    googlePeopleService = new GooglePeopleService(oauthHandler);
  } catch (error) {
    // If Google Calendar initialization fails, continue without it
    mcpLogger.error({ err: error }, 'Google Calendar service initialization failed');
    googleCalendarService = null;
    googlePeopleService = null;
  }

  calendarSourceManager = new CalendarSourceManager({
    calendarService,
    googleCalendarService: googleCalendarService || undefined,
    config: userConfig,
  });
  notionService = new NotionMCPService();
  todoListManager = new TodoListManager();
  taskSynchronizer = new TaskSynchronizer();
  calendarEventResponseService = new CalendarEventResponseService();
  workingCadenceService = new WorkingCadenceService();
}

// ============================================
// Context Factory Functions
// ============================================

function createSetupContext(): SetupContext {
  return {
    getConfig: () => config,
    setConfig: (c: UserConfig) => {
      config = c;
    },
    getWizardSession: () => wizardSession,
    setWizardSession: (session) => {
      wizardSession = session;
    },
    initializeServices,
    getConfigReloadService: () => configReloadService,
  };
}

function createTaskToolsContext(): TaskToolsContext {
  return {
    getConfig: () => config,
    getTodoListManager: () => todoListManager,
    getTaskSynchronizer: () => taskSynchronizer,
    initializeServices,
  };
}

function createCalendarToolsContext(): CalendarToolsContext {
  return {
    getConfig: () => config,
    getCalendarSourceManager: () => calendarSourceManager,
    getCalendarEventResponseService: () => calendarEventResponseService,
    getGoogleCalendarService: () => googleCalendarService,
    getWorkingCadenceService: () => workingCadenceService,
    setWorkingCadenceService: (service: WorkingCadenceService) => {
      workingCadenceService = service;
    },
    initializeServices,
  };
}

function createReminderTodoContext(): ReminderTodoContext {
  return {
    getConfig: () => config,
    getReminderManager: () => reminderManager,
    getTodoListManager: () => todoListManager,
    initializeServices,
  };
}

function createIntegrationToolsContext(): IntegrationToolsContext {
  return {
    getConfig: () => config,
    setConfig: (c: UserConfig) => {
      config = c;
    },
    getNotionService: () => notionService,
    initializeServices,
    getConfigReloadService: () => configReloadService,
  };
}

function createOAuthToolsContext(): OAuthToolsContext {
  return {
    getGoogleOAuthHandler: () => {
      const oauthConfig = {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
      };
      if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
        return null;
      }
      return new GoogleOAuthHandler(oauthConfig);
    },
    createGoogleOAuthHandler: () => {
      const oauthConfig = {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
      };
      if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
        return null;
      }
      return new GoogleOAuthHandler(oauthConfig);
    },
  };
}

function createReloadContext(): ReloadContext {
  return {
    getConfigReloadService: () => configReloadService,
  };
}

function createDirectoryToolsContext(): DirectoryToolsContext {
  return {
    getConfig: () => config,
    getGooglePeopleService: () => googlePeopleService,
  };
}

/**
 * Initialize the MCP server with all tools
 */
async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  // Try to load existing config
  try {
    config = await ConfigLoader.load();
    if (config) {
      initializeServices(config);
    }
  } catch {
    config = null;
  }

  // ============================================
  // Setup & Configuration Tools - uses extracted handlers
  // ============================================

  server.tool(
    "check_setup_status",
    "Check if sage has been configured. Returns setup status and guidance.",
    {},
    async () => handleCheckSetupStatus(createSetupContext()),
  );

  server.tool(
    "start_setup_wizard",
    "Start the interactive setup wizard for sage. Returns the first question.",
    {
      mode: z
        .enum(["full", "quick"])
        .optional()
        .describe("Setup mode: full (all questions) or quick (essential only)"),
    },
    async ({ mode }) =>
      handleStartSetupWizard(createSetupContext(), { mode: mode ?? "full" }),
  );

  server.tool(
    "answer_wizard_question",
    "Answer a question in the setup wizard and get the next question.",
    {
      questionId: z.string().describe("The ID of the question being answered"),
      answer: z
        .union([z.string(), z.array(z.string())])
        .describe("The answer to the question"),
    },
    async ({ questionId, answer }) =>
      handleAnswerWizardQuestion(createSetupContext(), { questionId, answer }),
  );

  server.tool(
    "save_config",
    "Save the configuration after completing the setup wizard.",
    {
      confirm: z.boolean().describe("Confirm saving the configuration"),
    },
    async ({ confirm }) =>
      handleSaveConfig(createSetupContext(), { confirm }),
  );

  // ============================================
  // Task Analysis Tools - uses extracted handlers
  // ============================================

  server.tool(
    "analyze_tasks",
    "Analyze tasks to determine priority, estimate time, and identify stakeholders.",
    {
      tasks: z
        .array(
          z.object({
            title: z.string().describe("Task title"),
            description: z.string().optional().describe("Task description"),
            deadline: z
              .string()
              .optional()
              .describe("Task deadline (ISO 8601 format)"),
          }),
        )
        .describe("List of tasks to analyze"),
    },
    async ({ tasks }) => handleAnalyzeTasks(createTaskToolsContext(), { tasks }),
  );

  // set_reminder - uses extracted handler
  server.tool(
    "set_reminder",
    "Set a reminder for a task in Apple Reminders or Notion.",
    {
      taskTitle: z.string().describe("Title of the task"),
      dueDate: z
        .string()
        .optional()
        .describe("Due date for the reminder (ISO 8601 format)"),
      reminderType: z
        .enum([
          "1_hour_before",
          "3_hours_before",
          "1_day_before",
          "3_days_before",
          "1_week_before",
        ])
        .optional()
        .describe("Type of reminder"),
      list: z
        .string()
        .optional()
        .describe("Reminder list name (for Apple Reminders)"),
      priority: z
        .enum(["P0", "P1", "P2", "P3"])
        .optional()
        .describe("Task priority"),
      notes: z
        .string()
        .optional()
        .describe("Additional notes for the reminder"),
    },
    async ({ taskTitle, dueDate, reminderType, list, priority, notes }) =>
      handleSetReminder(createReminderTodoContext(), {
        taskTitle,
        dueDate,
        reminderType,
        list,
        priority,
        notes,
      }),
  );

  // find_available_slots - uses extracted handler
  server.tool(
    "find_available_slots",
    "Find available time slots in the calendar for scheduling tasks from all enabled calendar sources.",
    {
      durationMinutes: z.number().describe("Required duration in minutes"),
      startDate: z
        .string()
        .optional()
        .describe("Start date for search (ISO 8601 format)"),
      endDate: z
        .string()
        .optional()
        .describe("End date for search (ISO 8601 format)"),
      preferDeepWork: z
        .boolean()
        .optional()
        .describe("Prefer deep work time slots"),
      minDurationMinutes: z
        .number()
        .optional()
        .describe("Minimum slot duration in minutes (default: 25)"),
      maxDurationMinutes: z
        .number()
        .optional()
        .describe("Maximum slot duration in minutes (default: 480)"),
    },
    async ({ durationMinutes, startDate, endDate, preferDeepWork, minDurationMinutes, maxDurationMinutes }) =>
      handleFindAvailableSlots(createCalendarToolsContext(), {
        durationMinutes,
        startDate,
        endDate,
        preferDeepWork,
        minDurationMinutes,
        maxDurationMinutes,
      }),
  );

  // list_calendar_events - uses extracted handler
  server.tool(
    "list_calendar_events",
    "List calendar events for a specified period from enabled sources (EventKit, Google Calendar, or both). Returns events with details including calendar name and location.",
    {
      startDate: z
        .string()
        .describe("Start date in ISO 8601 format (e.g., 2025-01-15)"),
      endDate: z
        .string()
        .describe("End date in ISO 8601 format (e.g., 2025-01-20)"),
      calendarId: z
        .string()
        .optional()
        .describe("Optional: filter events by calendar ID or name"),
    },
    async ({ startDate, endDate, calendarId }) =>
      handleListCalendarEvents(createCalendarToolsContext(), {
        startDate,
        endDate,
        calendarId,
      }),
  );

  // respond_to_calendar_event - uses extracted handler
  server.tool(
    "respond_to_calendar_event",
    "Respond to a calendar event with accept, decline, or tentative. Supports both EventKit (macOS) and Google Calendar events. Use this to RSVP to meeting invitations from any enabled calendar source.",
    {
      eventId: z.string().describe("The ID of the calendar event to respond to"),
      response: z
        .enum(["accept", "decline", "tentative"])
        .describe("Response type: accept (承諾), decline (辞退), or tentative (仮承諾)"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment to include with the response (e.g., '年末年始休暇のため'). Note: Comments are only supported for EventKit events."),
      source: z
        .enum(["eventkit", "google"])
        .optional()
        .describe("Optional: Specify the calendar source explicitly. If not provided, will try Google Calendar first, then EventKit."),
      calendarId: z
        .string()
        .optional()
        .describe("Optional: Google Calendar ID (defaults to 'primary'). Only used for Google Calendar events."),
    },
    async ({ eventId, response, comment, source, calendarId }) =>
      handleRespondToCalendarEvent(createCalendarToolsContext(), {
        eventId,
        response,
        comment,
        source,
        calendarId,
      }),
  );

  // respond_to_calendar_events_batch - uses extracted handler
  server.tool(
    "respond_to_calendar_events_batch",
    "Respond to multiple calendar events at once. Useful for declining all events during vacation or leave periods.",
    {
      eventIds: z
        .array(z.string())
        .describe("Array of event IDs to respond to"),
      response: z
        .enum(["accept", "decline", "tentative"])
        .describe("Response type: accept (承諾), decline (辞退), or tentative (仮承諾)"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment to include with all responses (e.g., '年末年始休暇のため')"),
    },
    async ({ eventIds, response, comment }) =>
      handleRespondToCalendarEventsBatch(createCalendarToolsContext(), {
        eventIds,
        response,
        comment,
      }),
  );

  // create_calendar_event - uses extracted handler
  server.tool(
    "create_calendar_event",
    "Create a new calendar event with support for Google Calendar event types (OOO, Focus Time, Working Location, etc.).",
    {
      title: z.string().describe("Event title"),
      startDate: z
        .string()
        .describe("Start date/time in ISO 8601 format (e.g., 2025-01-15T10:00:00+09:00)"),
      endDate: z
        .string()
        .describe("End date/time in ISO 8601 format (e.g., 2025-01-15T11:00:00+09:00)"),
      location: z.string().optional().describe("Event location"),
      notes: z.string().optional().describe("Event notes/description"),
      calendarName: z
        .string()
        .optional()
        .describe("Calendar name to create the event in (uses default if not specified)"),
      alarms: z
        .array(z.string())
        .optional()
        .describe("Optional: Override default alarms with custom settings (e.g., ['-15m', '-1h']). If omitted, calendar's default alarm settings apply."),
      preferredSource: z
        .enum(['eventkit', 'google'])
        .optional()
        .describe("Preferred calendar source to create the event in. If not specified, uses the first enabled source."),
      eventType: z
        .enum(['default', 'outOfOffice', 'focusTime', 'workingLocation', 'birthday'])
        .optional()
        .describe("Event type: 'default' (normal), 'outOfOffice' (vacation/OOO with auto-decline), 'focusTime' (deep work), 'workingLocation', 'birthday'. Default: 'default'. Note: Non-default types require Google Calendar."),
      autoDeclineMode: z
        .enum(['declineNone', 'declineAllConflictingInvitations', 'declineOnlyNewConflictingInvitations'])
        .optional()
        .describe("For outOfOffice/focusTime: auto-decline behavior for conflicting invitations"),
      declineMessage: z
        .string()
        .optional()
        .describe("For outOfOffice/focusTime: custom message sent when auto-declining invitations"),
      chatStatus: z
        .enum(['available', 'doNotDisturb'])
        .optional()
        .describe("For focusTime: Google Chat status during focus time"),
      workingLocationType: z
        .enum(['homeOffice', 'officeLocation', 'customLocation'])
        .optional()
        .describe("For workingLocation: type of work location"),
      workingLocationLabel: z
        .string()
        .optional()
        .describe("For workingLocation: optional label for the location (e.g., office name)"),
      birthdayType: z
        .enum(['birthday', 'anniversary', 'other'])
        .optional()
        .describe("For birthday: type of birthday event"),
      roomId: z
        .string()
        .optional()
        .describe("Room calendar ID to book for this event. Use search_room_availability to find available rooms. Requires Google Calendar."),
    },
    async ({ title, startDate, endDate, location, notes, calendarName, alarms, preferredSource, eventType, autoDeclineMode, declineMessage, chatStatus, workingLocationType, workingLocationLabel, birthdayType, roomId }) =>
      handleCreateCalendarEvent(createCalendarToolsContext(), {
        title,
        startDate,
        endDate,
        location,
        notes,
        calendarName,
        alarms,
        preferredSource,
        eventType,
        autoDeclineMode,
        declineMessage,
        chatStatus,
        workingLocationType,
        workingLocationLabel,
        birthdayType,
        roomId,
      }),
  );

  // delete_calendar_event - uses extracted handler
  server.tool(
    "delete_calendar_event",
    "Delete a calendar event from enabled calendar sources by its ID. If source not specified, attempts deletion from all enabled sources.",
    {
      eventId: z.string().describe("Event ID (UUID or full ID from list_calendar_events)"),
      source: z
        .enum(['eventkit', 'google'])
        .optional()
        .describe("Calendar source to delete from. If not specified, attempts deletion from all enabled sources."),
    },
    async ({ eventId, source }) =>
      handleDeleteCalendarEvent(createCalendarToolsContext(), { eventId, source }),
  );

  // delete_calendar_events_batch - uses extracted handler
  server.tool(
    "delete_calendar_events_batch",
    "Delete multiple calendar events from enabled calendar sources by their IDs. If source not specified, attempts deletion from all enabled sources.",
    {
      eventIds: z.array(z.string()).describe("Array of event IDs to delete"),
      source: z
        .enum(['eventkit', 'google'])
        .optional()
        .describe("Calendar source to delete from. If not specified, attempts deletion from all enabled sources."),
    },
    async ({ eventIds, source }) =>
      handleDeleteCalendarEventsBatch(createCalendarToolsContext(), { eventIds, source }),
  );

  /**
   * update_calendar_event - Update an existing calendar event
   * Requirement: update-calendar-event 1-8
   * Uses shared definition from tools/shared/calendar-tools.ts
   */
  server.tool(
    updateCalendarEventTool.name,
    updateCalendarEventTool.description,
    updateCalendarEventTool.schema.shape,
    async ({ eventId, title, startDate, endDate, location, notes, attendees, alarms, roomId, removeRoom, autoDeclineMode, declineMessage, chatStatus, calendarName }) =>
      handleUpdateCalendarEvent(createCalendarToolsContext(), {
        eventId,
        title,
        startDate,
        endDate,
        location,
        notes,
        attendees,
        alarms,
        roomId,
        removeRoom,
        autoDeclineMode,
        declineMessage,
        chatStatus,
        calendarName,
      }),
  );

  // sync_to_notion - uses extracted handler
  server.tool(
    "sync_to_notion",
    "Sync a task to Notion database for long-term tracking.",
    {
      taskTitle: z.string().describe("Title of the task"),
      description: z.string().optional().describe("Task description"),
      priority: z
        .enum(["P0", "P1", "P2", "P3"])
        .optional()
        .describe("Task priority"),
      dueDate: z.string().optional().describe("Due date (ISO 8601 format)"),
      stakeholders: z
        .array(z.string())
        .optional()
        .describe("List of stakeholders"),
      estimatedMinutes: z
        .number()
        .optional()
        .describe("Estimated duration in minutes"),
    },
    async ({ taskTitle, description, priority, dueDate, stakeholders, estimatedMinutes }) =>
      handleSyncToNotion(createIntegrationToolsContext(), {
        taskTitle,
        description,
        priority,
        dueDate,
        stakeholders,
        estimatedMinutes,
      }),
  );

  // update_config - uses extracted handler
  server.tool(
    "update_config",
    "Update sage configuration settings.",
    {
      section: z
        .enum([
          "user",
          "calendar",
          "priorityRules",
          "integrations",
          "team",
          "preferences",
        ])
        .describe("Configuration section to update"),
      updates: z.record(z.unknown()).describe("Key-value pairs to update"),
    },
    async ({ section, updates }) =>
      handleUpdateConfig(createIntegrationToolsContext(), {
        section,
        updates: updates as Record<string, unknown>,
      }),
  );

  // ============================================
  // TODO List Management Tools - uses extracted handlers
  // ============================================

  server.tool(
    "list_todos",
    "List TODO items from Apple Reminders and Notion with optional filtering.",
    {
      priority: z
        .array(z.enum(["P0", "P1", "P2", "P3"]))
        .optional()
        .describe("Filter by priority levels"),
      status: z
        .array(z.enum(["not_started", "in_progress", "completed", "cancelled"]))
        .optional()
        .describe("Filter by status"),
      source: z
        .array(z.enum(["apple_reminders", "notion", "manual"]))
        .optional()
        .describe("Filter by source"),
      todayOnly: z.boolean().optional().describe("Show only tasks due today"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
    },
    async ({ priority, status, source, todayOnly, tags }) =>
      handleListTodos(createReminderTodoContext(), {
        priority,
        status,
        source,
        todayOnly,
        tags,
      }),
  );

  // update_task_status - uses extracted handler
  server.tool(
    "update_task_status",
    "Update the status of a task in Apple Reminders or Notion.",
    {
      taskId: z.string().describe("ID of the task to update"),
      status: z
        .enum(["not_started", "in_progress", "completed", "cancelled"])
        .describe("New status for the task"),
      source: z
        .enum(["apple_reminders", "notion", "manual"])
        .describe("Source of the task"),
      syncAcrossSources: z
        .boolean()
        .optional()
        .describe("Whether to sync the status across all sources"),
    },
    async ({ taskId, status, source, syncAcrossSources }) =>
      handleUpdateTaskStatus(createTaskToolsContext(), {
        taskId,
        status,
        source,
        syncAcrossSources,
      }),
  );

  // sync_tasks - uses extracted handler
  server.tool(
    "sync_tasks",
    "Synchronize tasks between Apple Reminders and Notion, detecting and resolving conflicts.",
    {},
    async () => handleSyncTasks(createTaskToolsContext()),
  );

  // detect_duplicates - uses extracted handler
  server.tool(
    "detect_duplicates",
    "Detect duplicate tasks between Apple Reminders and Notion.",
    {
      autoMerge: z
        .boolean()
        .optional()
        .describe("Whether to automatically merge high-confidence duplicates"),
    },
    async ({ autoMerge }) =>
      handleDetectDuplicates(createTaskToolsContext(), { autoMerge }),
  );

  // list_calendar_sources - uses extracted handler
  server.tool(
    "list_calendar_sources",
    "List available and enabled calendar sources (EventKit, Google Calendar) with their health status. Shows which sources can be used and their current state.",
    {},
    async () => handleListCalendarSources(createCalendarToolsContext()),
  );

  /**
   * authenticate_google - Complete Google OAuth flow automatically
   * Requirements: FR-1 (Google OAuth Auto-Callback)
   */
  server.tool(
    "authenticate_google",
    "Authenticate with Google Calendar using OAuth. Opens browser for authentication and automatically captures the callback. Returns success status with token information.",
    {
      force: z
        .boolean()
        .optional()
        .describe("Force re-authentication even if tokens already exist"),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in seconds for waiting for authentication (default: 300)"),
    },
    async ({ force, timeout }) => {
      const result = await handleAuthenticateGoogle(
        { force: force ?? false, timeout: timeout ?? 300 },
        createOAuthToolsContext()
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  /**
   * set_calendar_source - Enable or disable a calendar source
   * Requirement: 9, 11, Task 33
   */
  server.tool(
    "set_calendar_source",
    "Enable or disable a calendar source (EventKit or Google Calendar). When enabling Google Calendar for the first time, this will initiate the OAuth flow. Returns authorization URL if OAuth is required.",
    {
      source: z
        .enum(['eventkit', 'google'])
        .describe("Calendar source to configure: 'eventkit' (macOS only) or 'google' (all platforms)"),
      enabled: z
        .boolean()
        .describe("Whether to enable (true) or disable (false) the source"),
    },
    async ({ source, enabled }) => {
      if (!config) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    "sageが設定されていません。check_setup_statusを実行してください。",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!calendarSourceManager) {
        initializeServices(config);
      }

      try {
        // Check if source is available on this platform
        const availableSources = await calendarSourceManager!.detectAvailableSources();

        if (source === 'eventkit' && !availableSources.eventkit) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "EventKitはこのプラットフォームでは利用できません。EventKitはmacOSでのみ利用可能です。",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (enabled) {
          // Enable the source
          await calendarSourceManager!.enableSource(source);

          // If enabling Google Calendar for the first time, check if OAuth is needed
          if (source === 'google' && googleCalendarService) {
            try {
              // Check if tokens already exist
              const { GoogleOAuthHandler } = await import('./oauth/google-oauth-handler.js');
              const oauthConfig = {
                clientId: process.env.GOOGLE_CLIENT_ID || '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
                redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
              };

              if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          success: false,
                          message:
                            "Google Calendar OAuth設定が見つかりません。環境変数GOOGLE_CLIENT_IDとGOOGLE_CLIENT_SECRETを設定してください。",
                          requiredEnvVars: [
                            'GOOGLE_CLIENT_ID',
                            'GOOGLE_CLIENT_SECRET',
                            'GOOGLE_REDIRECT_URI (optional, defaults to http://localhost:3000/oauth/callback)',
                          ],
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                };
              }

              const oauthHandler = new GoogleOAuthHandler(oauthConfig);

              // Try to get existing tokens
              const existingTokens = await oauthHandler.getTokens();

              if (!existingTokens) {
                // Need to initiate OAuth flow
                const authUrl = await oauthHandler.getAuthorizationUrl();

                // Save config before OAuth flow
                await ConfigLoader.save(config);

                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          success: true,
                          source,
                          enabled: true,
                          oauthRequired: true,
                          authorizationUrl: authUrl,
                          message: `Google Calendarを有効化しました。OAuth認証が必要です。以下のURLにアクセスして認証を完了してください: ${authUrl}`,
                          instructions: [
                            '1. 上記のURLをブラウザで開く',
                            '2. Googleアカウントでログイン',
                            '3. sage アプリケーションにカレンダーへのアクセスを許可',
                            '4. リダイレクトされたURLから認証コードを取得',
                            '5. 認証コードを使用してトークンを取得（別途実装予定）',
                          ],
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                };
              }
            } catch (error) {
              // OAuth check failed, but source is enabled in config
              await ConfigLoader.save(config);

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: true,
                        source,
                        enabled: true,
                        warning: `Google Calendarを有効化しましたが、OAuth設定の確認に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                        message: "設定は保存されましたが、OAuth認証が必要な場合があります。",
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }
          }

          // Save the updated config
          await ConfigLoader.save(config);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    source,
                    enabled: true,
                    message: `${source === 'eventkit' ? 'EventKit' : 'Google Calendar'}を有効化しました。`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } else {
          // Disable the source
          await calendarSourceManager!.disableSource(source);

          // Save the updated config
          await ConfigLoader.save(config);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    source,
                    enabled: false,
                    message: `${source === 'eventkit' ? 'EventKit' : 'Google Calendar'}を無効化しました。`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      } catch (error) {
        return createErrorFromCatch('カレンダーソース設定に失敗しました', error);
      }
    },
  );

  /**
   * sync_calendar_sources - Sync events between EventKit and Google Calendar
   * Requirement: 8, Task 34
   */
  server.tool(
    "sync_calendar_sources",
    "Synchronize calendar events between EventKit and Google Calendar. Both sources must be enabled for sync to work. Returns the number of events added, updated, and deleted.",
    {},
    async () => {
      if (!config) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    "sageが設定されていません。check_setup_statusを実行してください。",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!calendarSourceManager) {
        initializeServices(config);
      }

      try {
        // Check if both sources are enabled
        const enabledSources = calendarSourceManager!.getEnabledSources();

        if (enabledSources.length < 2) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "同期を実行するには、EventKitとGoogle Calendarの両方を有効化する必要があります。現在有効なソース: " +
                      enabledSources.join(", "),
                    enabledSources,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Execute sync
        const result = await calendarSourceManager!.syncCalendars();

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    eventsAdded: result.eventsAdded,
                    eventsUpdated: result.eventsUpdated,
                    eventsDeleted: result.eventsDeleted,
                    conflicts: result.conflicts,
                    errors: result.errors,
                    message: `カレンダー同期が完了しました。追加: ${result.eventsAdded}件、更新: ${result.eventsUpdated}件、削除: ${result.eventsDeleted}件`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  eventsAdded: result.eventsAdded,
                  eventsUpdated: result.eventsUpdated,
                  eventsDeleted: result.eventsDeleted,
                  conflicts: result.conflicts,
                  errors: result.errors,
                  message: "カレンダー同期中にエラーが発生しました。",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダー同期に失敗しました', error);
      }
    },
  );

  /**
   * get_calendar_sync_status - Check sync status between calendar sources
   * Requirement: 8, Task 35
   */
  server.tool(
    "get_calendar_sync_status",
    "Check the synchronization status between EventKit and Google Calendar. Returns last sync time, next sync time, and source availability.",
    {},
    async () => {
      if (!config) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    "sageが設定されていません。check_setup_statusを実行してください。",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!calendarSourceManager) {
        initializeServices(config);
      }

      try {
        const status = await calendarSourceManager!.getSyncStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  isEnabled: status.isEnabled,
                  lastSyncTime: status.lastSyncTime || "未実行",
                  nextSyncTime: status.nextSyncTime || "N/A",
                  sources: {
                    eventkit: {
                      available: status.sources.eventkit.available,
                      lastError: status.sources.eventkit.lastError,
                    },
                    google: {
                      available: status.sources.google.available,
                      lastError: status.sources.google.lastError,
                    },
                  },
                  message: status.isEnabled
                    ? "カレンダー同期が有効です。"
                    : "カレンダー同期を有効にするには、EventKitとGoogle Calendarの両方を有効化してください。",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('同期状態の取得に失敗しました', error);
      }
    },
  );

  // get_working_cadence - uses extracted handler
  server.tool(
    "get_working_cadence",
    "Get user's working rhythm including deep work days, meeting-heavy days, and scheduling recommendations.",
    {
      dayOfWeek: z
        .enum([
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ])
        .optional()
        .describe("Get info for a specific day of week"),
      date: z
        .string()
        .optional()
        .describe(
          "Get info for a specific date in ISO 8601 format (e.g., 2025-01-15)",
        ),
    },
    async ({ dayOfWeek, date }) =>
      handleGetWorkingCadence(createCalendarToolsContext(), { dayOfWeek, date }),
  );

  // ============================================
  // Room Availability Tools
  // Requirement: room-availability-search 1, 2
  // ============================================

  /**
   * search_room_availability - Search for available meeting rooms
   * Requirement: room-availability-search 1
   * Uses shared definition from tools/shared/room-tools.ts
   */
  server.tool(
    searchRoomAvailabilityTool.name,
    searchRoomAvailabilityTool.description,
    searchRoomAvailabilityTool.schema.shape,
    async ({ startTime, endTime, durationMinutes, minCapacity, building, floor, features }) =>
      handleSearchRoomAvailability(createCalendarToolsContext(), {
        startTime,
        endTime,
        durationMinutes,
        minCapacity,
        building,
        floor,
        features,
      }),
  );

  /**
   * check_room_availability - Check availability of a specific room
   * Requirement: room-availability-search 2
   * Uses shared definition from tools/shared/room-tools.ts
   */
  server.tool(
    checkRoomAvailabilityTool.name,
    checkRoomAvailabilityTool.description,
    checkRoomAvailabilityTool.schema.shape,
    async ({ roomId, startTime, endTime }) =>
      handleCheckRoomAvailability(createCalendarToolsContext(), {
        roomId,
        startTime,
        endTime,
      }),
  );

  // ============================================
  // Directory Tools
  // ============================================

  /**
   * search_directory_people - Search organization directory for people
   * Requirement: directory-people-search 1
   * Uses shared definition from tools/shared/directory-tools.ts
   */
  server.tool(
    searchDirectoryPeopleTool.name,
    searchDirectoryPeopleTool.description,
    searchDirectoryPeopleTool.schema.shape,
    async ({ query, pageSize }) =>
      handleSearchDirectoryPeople(createDirectoryToolsContext(), {
        query,
        pageSize,
      }),
  );

  // ============================================
  // Hot Reload Tools
  // ============================================

  /**
   * reload_config - Manually trigger configuration reload
   * Requirements: Hot Reload Feature
   */
  server.tool(
    "reload_config",
    "Manually trigger a configuration reload without server restart. Returns the reload result including changed sections and re-initialized services.",
    {
      force: z
        .boolean()
        .optional()
        .describe("Force reload even if no changes detected (currently unused, reserved for future use)"),
    },
    async ({ force }) => handleReloadConfig(createReloadContext(), { force }),
  );

  return server;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Import CLI modules
  const { parseArgs } = await import("./cli/parser.js");
  const { startServer } = await import("./cli/main-entry.js");

  // Parse CLI arguments
  const options = parseArgs(process.argv.slice(2));

  // Handle help and version
  if (options.help || options.version) {
    const result = await startServer(options);
    mcpLogger.info(result.message);
    process.exit(0);
  }

  // Handle token generation
  if (options.generateToken) {
    const result = await startServer(options);
    if (result.success) {
      mcpLogger.info(result.message);
      process.exit(0);
    } else {
      mcpLogger.error({ error: result.error }, 'Token generation failed');
      process.exit(1);
    }
  }

  // Start in HTTP mode if --remote flag is set
  if (options.remote) {
    const result = await startServer(options);

    if (!result.success) {
      mcpLogger.error({ error: result.error }, 'Failed to start HTTP server');
      process.exit(1);
    }

    mcpLogger.info(
      { host: result.host, port: result.port, version: VERSION },
      `${SERVER_NAME} started in HTTP mode`
    );

    // Keep the process running
    process.on("SIGINT", async () => {
      mcpLogger.info('Shutting down...');
      if (result.stop) {
        await result.stop();
      }
      process.exit(0);
    });

    return;
  }

  // Start in Stdio mode (default for MCP)
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  mcpLogger.info({ version: VERSION }, `${SERVER_NAME} started in Stdio mode`);

  // Task 28: Create ServiceRegistry and register adapters
  if (config) {
    serviceRegistry = new ServiceRegistry();
    const adapters = createAllReloadableAdapters(config);
    for (const adapter of adapters) {
      serviceRegistry.register(adapter);
    }
    mcpLogger.info({ adapterCount: adapters.length }, 'Service adapters registered');
  }

  // Task 29: Create and start ConfigReloadService
  const hotReloadConfig = getHotReloadConfig();
  if (!hotReloadConfig.disabled && serviceRegistry) {
    const configWatcher = new ConfigWatcher({
      debounceMs: hotReloadConfig.debounceMs,
    });
    configReloadService = new ConfigReloadService(
      configWatcher,
      serviceRegistry,
      { enableAutoReload: true }
    );

    // Start the config watcher and reload service
    await configWatcher.start();
    await configReloadService.start();
    mcpLogger.info('Hot reload service started');

    // Setup signal handlers for SIGHUP, SIGTERM, SIGINT
    setupSignalHandlers(configReloadService);
    mcpLogger.info('Signal handlers registered');
  } else if (hotReloadConfig.disabled) {
    mcpLogger.info('Hot reload is disabled via SAGE_DISABLE_HOT_RELOAD');
  }
}

main().catch((error) => {
  mcpLogger.error({ err: error }, 'Failed to start sage server');
  process.exit(1);
});
