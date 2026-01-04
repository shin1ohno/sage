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
import { TaskAnalyzer } from "./tools/analyze-tasks.js";
import { ReminderManager } from "./integrations/reminder-manager.js";
import { CalendarService } from "./integrations/calendar-service.js";
import { CalendarSourceManager } from "./integrations/calendar-source-manager.js";
import { GoogleCalendarService } from "./integrations/google-calendar-service.js";
import { NotionMCPService } from "./integrations/notion-mcp.js";
import { TodoListManager } from "./integrations/todo-list-manager.js";
import { TaskSynchronizer } from "./integrations/task-synchronizer.js";
import { CalendarEventResponseService } from "./integrations/calendar-event-response.js";
import { WorkingCadenceService } from "./services/working-cadence.js";
import type { UserConfig } from "./types/index.js";
import type { Priority } from "./types/index.js";
import { VERSION, SERVER_NAME } from "./version.js";
import { createErrorFromCatch } from "./utils/mcp-response.js";
import {
  validateConfigUpdate,
  applyConfigUpdates,
} from "./config/update-validation.js";

// Global state
let config: UserConfig | null = null;
let wizardSession: ReturnType<typeof SetupWizard.createSession> | null = null;
let reminderManager: ReminderManager | null = null;
let calendarService: CalendarService | null = null;
let googleCalendarService: GoogleCalendarService | null = null;
let calendarSourceManager: CalendarSourceManager | null = null;
let notionService: NotionMCPService | null = null;
let todoListManager: TodoListManager | null = null;
let taskSynchronizer: TaskSynchronizer | null = null;
let calendarEventResponseService: CalendarEventResponseService | null = null;
let workingCadenceService: WorkingCadenceService | null = null;

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
    const { GoogleOAuthHandler } = require('./oauth/google-oauth-handler.js');
    const oauthConfig = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
    };
    const oauthHandler = new GoogleOAuthHandler(oauthConfig);
    googleCalendarService = new GoogleCalendarService(oauthHandler);
  } catch (error) {
    // If Google Calendar initialization fails, continue without it
    console.error('Google Calendar service initialization failed:', error);
    googleCalendarService = null;
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
  // Setup & Configuration Tools
  // ============================================

  /**
   * check_setup_status - Check if initial setup is complete
   * Requirement: 1.1, 1.2
   */
  server.tool(
    "check_setup_status",
    "Check if sage has been configured. Returns setup status and guidance.",
    {},
    async () => {
      const exists = await ConfigLoader.exists();
      const isValid = config !== null;

      if (!exists) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  setupComplete: false,
                  configExists: false,
                  message:
                    "sageの初期設定が必要です。start_setup_wizardを実行してセットアップを開始してください。",
                  nextAction: "start_setup_wizard",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!isValid) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  setupComplete: false,
                  configExists: true,
                  message:
                    "設定ファイルが見つかりましたが、読み込みに失敗しました。設定を再作成してください。",
                  nextAction: "start_setup_wizard",
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
                setupComplete: true,
                configExists: true,
                userName: config?.user.name,
                message:
                  "sageは設定済みです。タスク分析やリマインド設定を開始できます。",
                availableTools: [
                  "analyze_tasks",
                  "set_reminder",
                  "find_available_slots",
                  "sync_to_notion",
                  "update_config",
                ],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * start_setup_wizard - Begin the interactive setup process
   * Requirement: 1.3
   */
  server.tool(
    "start_setup_wizard",
    "Start the interactive setup wizard for sage. Returns the first question.",
    {
      mode: z
        .enum(["full", "quick"])
        .optional()
        .describe("Setup mode: full (all questions) or quick (essential only)"),
    },
    async ({ mode = "full" }) => {
      wizardSession = SetupWizard.createSession(mode);

      const question = SetupWizard.getCurrentQuestion(wizardSession);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sessionId: wizardSession.sessionId,
                currentStep: wizardSession.currentStep,
                totalSteps: wizardSession.totalSteps,
                progress: Math.round(
                  (wizardSession.currentStep / wizardSession.totalSteps) * 100,
                ),
                question: {
                  id: question.id,
                  text: question.text,
                  type: question.type,
                  options: question.options,
                  defaultValue: question.defaultValue,
                  helpText: question.helpText,
                },
                message:
                  "セットアップを開始します。以下の質問に回答してください。",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * answer_wizard_question - Answer a setup wizard question
   * Requirement: 1.3, 1.4
   */
  server.tool(
    "answer_wizard_question",
    "Answer a question in the setup wizard and get the next question.",
    {
      questionId: z.string().describe("The ID of the question being answered"),
      answer: z
        .union([z.string(), z.array(z.string())])
        .describe("The answer to the question"),
    },
    async ({ questionId, answer }) => {
      if (!wizardSession) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    "セットアップセッションが見つかりません。start_setup_wizardを実行してください。",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const result = SetupWizard.answerQuestion(
        wizardSession,
        questionId,
        answer,
      );

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: result.error,
                  currentQuestion: result.currentQuestion,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (result.isComplete) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  isComplete: true,
                  sessionId: wizardSession.sessionId,
                  answers: wizardSession.answers,
                  message:
                    "すべての質問に回答しました。save_configを実行して設定を保存してください。",
                  nextAction: "save_config",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const nextQuestion = SetupWizard.getCurrentQuestion(wizardSession);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                currentStep: wizardSession.currentStep,
                totalSteps: wizardSession.totalSteps,
                progress: Math.round(
                  (wizardSession.currentStep / wizardSession.totalSteps) * 100,
                ),
                question: {
                  id: nextQuestion.id,
                  text: nextQuestion.text,
                  type: nextQuestion.type,
                  options: nextQuestion.options,
                  defaultValue: nextQuestion.defaultValue,
                  helpText: nextQuestion.helpText,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  /**
   * save_config - Save the configuration from the setup wizard
   * Requirement: 1.4, 1.5, 1.6
   */
  server.tool(
    "save_config",
    "Save the configuration after completing the setup wizard.",
    {
      confirm: z.boolean().describe("Confirm saving the configuration"),
    },
    async ({ confirm }) => {
      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  saved: false,
                  message: "設定の保存がキャンセルされました。",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!wizardSession) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    "セットアップセッションが見つかりません。start_setup_wizardを実行してください。",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      try {
        const newConfig = SetupWizard.buildConfig(wizardSession);
        await ConfigLoader.save(newConfig);
        config = newConfig;
        wizardSession = null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  saved: true,
                  configPath: ConfigLoader.getConfigPath(),
                  userName: newConfig.user.name,
                  message: `設定を保存しました。${newConfig.user.name}さん、sageをご利用いただきありがとうございます！`,
                  availableTools: [
                    "analyze_tasks",
                    "set_reminder",
                    "find_available_slots",
                    "sync_to_notion",
                  ],
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('設定の保存に失敗しました', error);
      }
    },
  );

  // ============================================
  // Task Analysis Tools (placeholder)
  // ============================================

  /**
   * analyze_tasks - Analyze tasks and provide prioritization
   * Requirement: 2.1-2.6, 3.1-3.2, 4.1-4.5
   */
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
    async ({ tasks }) => {
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

      try {
        const result = await TaskAnalyzer.analyzeTasks(tasks, config);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  summary: result.summary,
                  tasks: result.analyzedTasks.map((t) => ({
                    title: t.original.title,
                    description: t.original.description,
                    deadline: t.original.deadline,
                    priority: t.priority,
                    estimatedMinutes: t.estimatedMinutes,
                    stakeholders: t.stakeholders,
                    tags: t.tags,
                    reasoning: t.reasoning,
                    suggestedReminders: t.suggestedReminders,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('タスク分析に失敗しました', error);
      }
    },
  );

  /**
   * set_reminder - Set a reminder for a task
   * Requirement: 5.1-5.6
   */
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
    async ({ taskTitle, dueDate, reminderType, list, priority, notes }) => {
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

      if (!reminderManager) {
        initializeServices(config);
      }

      try {
        const result = await reminderManager!.setReminder({
          taskTitle,
          targetDate: dueDate,
          reminderType,
          list: list ?? config.integrations.appleReminders.defaultList,
          priority: priority as Priority | undefined,
          notes,
        });

        if (result.success) {
          // Check if this is a delegation request for Notion
          if (result.delegateToNotion && result.notionRequest) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      destination: "notion_mcp",
                      method: "delegate",
                      delegateToNotion: true,
                      notionRequest: result.notionRequest,
                      message: `Notionへの追加はClaude Codeが直接notion-create-pagesツールを使用してください。`,
                      instruction: `notion-create-pagesツールを以下のパラメータで呼び出してください:
- parent: { "type": "data_source_id", "data_source_id": "${result.notionRequest.databaseId.replace(/-/g, "")}" }
- pages: [{ "properties": ${JSON.stringify(result.notionRequest.properties)} }]`,
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
                    success: true,
                    destination: result.destination,
                    method: result.method,
                    reminderId: result.reminderId,
                    reminderUrl: result.reminderUrl ?? result.pageUrl,
                    message:
                      result.destination === "apple_reminders"
                        ? `Apple Remindersにリマインダーを作成しました: ${taskTitle}`
                        : `Notionにタスクを作成しました: ${taskTitle}`,
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
                  destination: result.destination,
                  error: result.error,
                  fallbackText: result.fallbackText,
                  message: result.fallbackText
                    ? "自動作成に失敗しました。以下のテキストを手動でコピーしてください。"
                    : `リマインダー作成に失敗しました: ${result.error}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('リマインダー設定に失敗しました', error);
      }
    },
  );

  /**
   * find_available_slots - Find available time slots in calendar
   * Requirement: 3.3-3.6, 6.1-6.6, 7 (Task 28: Multi-source support)
   */
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
    async ({ durationMinutes, startDate, endDate, preferDeepWork, minDurationMinutes, maxDurationMinutes }) => {
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
        // Get enabled sources
        const enabledSources = calendarSourceManager!.getEnabledSources();

        if (enabledSources.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Prepare date range
        const searchStart = startDate ?? new Date().toISOString().split("T")[0];
        const searchEnd =
          endDate ??
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

        // Get working hours from config
        const workingHours = {
          start: config.calendar.workingHours.start,
          end: config.calendar.workingHours.end,
        };

        // Use durationMinutes as default min duration for backwards compatibility
        // New parameters minDurationMinutes and maxDurationMinutes take precedence
        const minDuration = minDurationMinutes ?? durationMinutes ?? 25;
        const maxDuration = maxDurationMinutes ?? 480;

        // Find available slots using CalendarSourceManager
        // This automatically fetches from all enabled sources, merges, and deduplicates
        const slots = await calendarSourceManager!.findAvailableSlots({
          startDate: searchStart,
          endDate: searchEnd,
          minDurationMinutes: minDuration,
          maxDurationMinutes: maxDuration,
          workingHours,
        });

        // Filter for deep work preference if requested
        const filteredSlots = preferDeepWork
          ? slots.filter((s) => s.dayType === "deep-work")
          : slots;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
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
                      : "指定した条件に合う空き時間が見つかりませんでした。",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダー検索に失敗しました', error);
      }
    },
  );

  /**
   * list_calendar_events - List calendar events for a specified period
   * Requirement: 16.1-16.12, Task 27 (Multi-source support)
   */
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
    async ({ startDate, endDate, calendarId }) => {
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
        // Get enabled sources
        const enabledSources = calendarSourceManager!.getEnabledSources();

        if (enabledSources.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Get events from all enabled sources (already merged/deduplicated)
        const events = await calendarSourceManager!.getEvents(
          startDate,
          endDate,
          calendarId
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  sources: enabledSources,
                  events: events.map((event) => ({
                    id: event.id,
                    title: event.title,
                    start: event.start,
                    end: event.end,
                    isAllDay: event.isAllDay,
                    // Note: calendar and location are optional fields added in Task 25
                    calendar: (event as any).calendar,
                    location: (event as any).location,
                    source: (event as any).source,
                  })),
                  period: { start: startDate, end: endDate },
                  totalEvents: events.length,
                  message:
                    events.length > 0
                      ? `${events.length}件のイベントが見つかりました (ソース: ${enabledSources.join(', ')})。`
                      : "指定した期間にイベントが見つかりませんでした。",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダーイベントの取得に失敗しました', error);
      }
    },
  );

  /**
   * respond_to_calendar_event - Respond to a single calendar event
   * Requirement: 17.1, 17.2, 17.5-17.11, 6 (Google Calendar support)
   */
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
    async ({ eventId, response, comment, source, calendarId }) => {
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

      if (!calendarSourceManager || !calendarEventResponseService) {
        initializeServices(config);
      }

      try {
        // If source is explicitly Google Calendar, or if source is not specified, try Google Calendar first
        if (source === 'google' || !source) {
          try {
            const result = await calendarSourceManager!.respondToEvent(
              eventId,
              response,
              source === 'google' ? 'google' : undefined,
              calendarId
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      eventId,
                      source: result.source || 'google',
                      message: result.message,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            // If source was explicitly 'google', don't try EventKit
            if (source === 'google') {
              return createErrorFromCatch('Google Calendarイベント返信に失敗しました', error);
            }
            // If source was not specified, continue to try EventKit
          }
        }

        // Try EventKit (either explicitly requested or as fallback)
        if (source === 'eventkit' || !source) {
          // Check platform availability
          const isAvailable = await calendarEventResponseService!.isEventKitAvailable();

          if (!isAvailable) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      message:
                        "EventKitカレンダーイベント返信機能はmacOSでのみ利用可能です。Google Calendarイベントの場合は、source='google'を指定してください。",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // Respond to the event via EventKit
          const result = await calendarEventResponseService!.respondToEvent({
            eventId,
            response,
            comment,
          });

          if (result.success) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      eventId: result.eventId,
                      eventTitle: result.eventTitle,
                      newStatus: result.newStatus,
                      method: result.method,
                      instanceOnly: result.instanceOnly,
                      source: 'eventkit',
                      message: result.message,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // Handle skipped or failed response
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
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
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Should not reach here, but just in case
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: "有効なカレンダーソースが見つかりません。",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダーイベント返信に失敗しました', error);
      }
    },
  );

  /**
   * respond_to_calendar_events_batch - Respond to multiple calendar events
   * Requirement: 17.3, 17.4, 17.12
   */
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
    async ({ eventIds, response, comment }) => {
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

      if (!calendarEventResponseService) {
        initializeServices(config);
      }

      try {
        // Check platform availability
        const isAvailable = await calendarEventResponseService!.isEventKitAvailable();

        if (!isAvailable) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "カレンダーイベント返信機能はmacOSでのみ利用可能です。",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Respond to all events in batch
        const result = await calendarEventResponseService!.respondToEventsBatch({
          eventIds,
          response,
          comment,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: result.success,
                  summary: result.summary,
                  details: {
                    succeeded: result.details.succeeded,
                    skipped: result.details.skipped,
                    failed: result.details.failed,
                  },
                  message: result.message,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダーイベント一括返信に失敗しました', error);
      }
    },
  );

  /**
   * create_calendar_event - Create a new calendar event
   * Requirement: 18.1-18.11, Task 29 (Multi-source support)
   */
  server.tool(
    "create_calendar_event",
    "Create a new calendar event in the appropriate calendar source with optional location, notes, and alarms.",
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
    },
    async ({ title, startDate, endDate, location, notes, calendarName: _calendarName, alarms: _alarms, preferredSource }) => {
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
        // Get enabled sources
        const enabledSources = calendarSourceManager!.getEnabledSources();

        if (enabledSources.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Build create event request
        const request = {
          title,
          start: startDate,
          end: endDate,
          location,
          description: notes,
          // Note: calendarId is passed separately to GoogleCalendarService.createEvent
          // alarms parameter is not supported in CreateEventRequest interface (uses reminders instead)
        };

        // Create the event using CalendarSourceManager
        // This automatically routes to the preferred source or falls back to other enabled sources
        const event = await calendarSourceManager!.createEvent(
          request,
          preferredSource
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  eventId: event.id,
                  title: event.title,
                  startDate: event.start,
                  endDate: event.end,
                  source: event.source || 'unknown',
                  calendarName: (event as any).calendar,
                  isAllDay: event.isAllDay,
                  message: `カレンダーイベントを作成しました: ${event.title} (ソース: ${event.source || 'unknown'})`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダーイベント作成に失敗しました', error);
      }
    },
  );

  /**
   * delete_calendar_event - Delete a calendar event
   * Requirement: 19.1-19.9, Task 30 (Multi-source support)
   */
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
    async ({ eventId, source }) => {
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
        // Get enabled sources
        const enabledSources = calendarSourceManager!.getEnabledSources();

        if (enabledSources.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Delete the event using CalendarSourceManager
        // This automatically handles deletion from specified source or all enabled sources
        await calendarSourceManager!.deleteEvent(eventId, source);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  eventId,
                  source: source || 'all enabled sources',
                  message: source
                    ? `カレンダーイベントを削除しました (ソース: ${source})`
                    : `カレンダーイベントを削除しました (全ての有効なソースから)`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダーイベント削除に失敗しました', error);
      }
    },
  );

  /**
   * delete_calendar_events_batch - Delete multiple calendar events
   * Requirement: 19.10-19.11, Task 30 (Multi-source support)
   */
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
    async ({ eventIds, source }) => {
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
        // Get enabled sources
        const enabledSources = calendarSourceManager!.getEnabledSources();

        if (enabledSources.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "有効なカレンダーソースがありません。設定でEventKitまたはGoogle Calendarを有効にしてください。",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Delete events one by one using CalendarSourceManager
        const results: Array<{ eventId: string; success: boolean; error?: string }> = [];

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

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: failedCount === 0,
                  totalCount: eventIds.length,
                  successCount,
                  failedCount,
                  source: source || 'all enabled sources',
                  results,
                  message: source
                    ? `${successCount}/${eventIds.length}件のイベントを削除しました (ソース: ${source})`
                    : `${successCount}/${eventIds.length}件のイベントを削除しました (全ての有効なソースから)`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダーイベント一括削除に失敗しました', error);
      }
    },
  );

  /**
   * sync_to_notion - Sync a task to Notion
   * Requirement: 8.1-8.5
   */
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
    async ({
      taskTitle,
      description,
      priority,
      dueDate,
      stakeholders,
      estimatedMinutes,
    }) => {
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

      if (!config.integrations.notion.enabled) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    "Notion統合が有効になっていません。update_configでNotion設定を更新してください。",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (!notionService) {
        initializeServices(config);
      }

      try {
        // Check if Notion MCP is available
        const isAvailable = await notionService!.isAvailable();

        // Build properties for Notion page
        const properties = notionService!.buildNotionProperties({
          title: taskTitle,
          priority,
          deadline: dueDate,
          stakeholders,
          estimatedMinutes,
          description,
        });

        if (!isAvailable) {
          // Generate fallback template for manual copy
          const fallbackText = notionService!.generateFallbackTemplate({
            title: taskTitle,
            priority,
            deadline: dueDate,
            stakeholders,
            estimatedMinutes,
            description,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    method: "fallback",
                    message:
                      "Notion MCP統合が利用できません。以下のテンプレートを手動でNotionにコピーしてください。",
                    fallbackText,
                    task: {
                      taskTitle,
                      priority: priority ?? "P3",
                      dueDate,
                      stakeholders: stakeholders ?? [],
                      estimatedMinutes,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Create page in Notion via MCP
        const result = await notionService!.createPage({
          databaseId: config.integrations.notion.databaseId,
          title: taskTitle,
          properties,
        });

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    method: "mcp",
                    pageId: result.pageId,
                    pageUrl: result.pageUrl,
                    message: `Notionにタスクを同期しました: ${taskTitle}`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // MCP call failed, provide fallback
        const fallbackText = notionService!.generateFallbackTemplate({
          title: taskTitle,
          priority,
          deadline: dueDate,
          stakeholders,
          estimatedMinutes,
          description,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  method: "fallback",
                  error: result.error,
                  message:
                    "Notion MCP呼び出しに失敗しました。以下のテンプレートを手動でコピーしてください。",
                  fallbackText,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('Notion同期に失敗しました', error);
      }
    },
  );

  /**
   * update_config - Update configuration
   * Requirement: 10.1-10.6
   */
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
    async ({ section, updates }) => {
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

      try {
        // Validate section-specific updates
        const validationResult = validateConfigUpdate(section, updates);
        if (!validationResult.valid) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: true,
                    message: `設定の検証に失敗しました: ${validationResult.error}`,
                    invalidFields: validationResult.invalidFields,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Apply updates to config
        const updatedConfig = applyConfigUpdates(config, section, updates);

        // Save the updated config
        await ConfigLoader.save(updatedConfig);
        config = updatedConfig;

        // Re-initialize services if integrations changed
        if (section === "integrations") {
          initializeServices(config);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  section,
                  updatedFields: Object.keys(updates),
                  message: `設定を更新しました: ${section}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('設定の更新に失敗しました', error);
      }
    },
  );

  // ============================================
  // TODO List Management Tools
  // ============================================

  /**
   * list_todos - List all TODO items with optional filtering
   * Requirement: 12.1, 12.2, 12.3, 12.4, 12.7, 12.8
   */
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
    async ({ priority, status, source, todayOnly, tags }) => {
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

      if (!todoListManager) {
        initializeServices(config);
      }

      try {
        let todos;

        if (todayOnly) {
          todos = await todoListManager!.getTodaysTasks();
        } else {
          todos = await todoListManager!.listTodos({
            priority: priority as Priority[] | undefined,
            status,
            source,
            tags,
          });
        }

        // Format todos for display
        const formattedTodos = todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          priority: todo.priority,
          status: todo.status,
          dueDate: todo.dueDate,
          source: todo.source,
          tags: todo.tags,
          estimatedMinutes: todo.estimatedMinutes,
          stakeholders: todo.stakeholders,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  totalCount: todos.length,
                  todos: formattedTodos,
                  message:
                    todos.length > 0
                      ? `${todos.length}件のタスクが見つかりました。`
                      : "タスクが見つかりませんでした。",
                  filters: {
                    priority,
                    status,
                    source,
                    todayOnly,
                    tags,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('TODOリストの取得に失敗しました', error);
      }
    },
  );

  /**
   * update_task_status - Update the status of a task
   * Requirement: 12.5, 12.6
   */
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
    async ({ taskId, status, source, syncAcrossSources }) => {
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

      if (!todoListManager) {
        initializeServices(config);
      }

      try {
        // Update the task status
        const result = await todoListManager!.updateTaskStatus(
          taskId,
          status,
          source,
        );

        if (!result.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    taskId,
                    error: result.error,
                    message: `タスクステータスの更新に失敗しました: ${result.error}`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Optionally sync across sources
        let syncResult;
        if (syncAcrossSources) {
          syncResult = await todoListManager!.syncTaskAcrossSources(taskId);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  taskId,
                  newStatus: status,
                  updatedFields: result.updatedFields,
                  syncedSources: result.syncedSources,
                  syncResult: syncAcrossSources ? syncResult : undefined,
                  message: `タスクのステータスを「${status}」に更新しました。`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('タスクステータスの更新に失敗しました', error);
      }
    },
  );

  /**
   * sync_tasks - Sync tasks across all sources
   * Requirement: 12.6
   */
  server.tool(
    "sync_tasks",
    "Synchronize tasks between Apple Reminders and Notion, detecting and resolving conflicts.",
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

      if (!taskSynchronizer) {
        initializeServices(config);
      }

      try {
        const result = await taskSynchronizer!.syncAllTasks();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  totalTasks: result.totalTasks,
                  syncedTasks: result.syncedTasks,
                  conflicts: result.conflicts,
                  errors: result.errors,
                  durationMs: result.duration,
                  message:
                    result.conflicts.length > 0
                      ? `${result.syncedTasks}件のタスクを同期しました。${result.conflicts.length}件の競合が検出されました。`
                      : `${result.syncedTasks}件のタスクを同期しました。`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('タスク同期に失敗しました', error);
      }
    },
  );

  /**
   * detect_duplicates - Detect duplicate tasks across sources
   * Requirement: 12.5
   */
  server.tool(
    "detect_duplicates",
    "Detect duplicate tasks between Apple Reminders and Notion.",
    {
      autoMerge: z
        .boolean()
        .optional()
        .describe("Whether to automatically merge high-confidence duplicates"),
    },
    async ({ autoMerge }) => {
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

      if (!taskSynchronizer) {
        initializeServices(config);
      }

      try {
        const duplicates = await taskSynchronizer!.detectDuplicates();

        // Format duplicates for display
        const formattedDuplicates = duplicates.map((d) => ({
          tasks: d.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            source: t.source,
            status: t.status,
            priority: t.priority,
          })),
          similarity: Math.round(d.similarity * 100),
          confidence: d.confidence,
          suggestedMerge: {
            title: d.suggestedMerge.title,
            priority: d.suggestedMerge.priority,
            status: d.suggestedMerge.status,
            tags: d.suggestedMerge.tags,
          },
        }));

        // Auto-merge high-confidence duplicates if requested
        let mergeResults;
        if (autoMerge) {
          const highConfidenceDuplicates = duplicates.filter(
            (d) => d.confidence === "high",
          );
          if (highConfidenceDuplicates.length > 0) {
            mergeResults = await taskSynchronizer!.mergeDuplicates(
              highConfidenceDuplicates,
            );
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  duplicatesFound: duplicates.length,
                  duplicates: formattedDuplicates,
                  mergeResults: autoMerge ? mergeResults : undefined,
                  message:
                    duplicates.length > 0
                      ? `${duplicates.length}件の重複タスクが検出されました。`
                      : "重複タスクは見つかりませんでした。",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('重複検出に失敗しました', error);
      }
    },
  );

  /**
   * list_calendar_sources - List available and enabled calendar sources
   * Requirement: Google Calendar API integration (Task 32)
   */
  server.tool(
    "list_calendar_sources",
    "List available and enabled calendar sources (EventKit, Google Calendar) with their health status. Shows which sources can be used and their current state.",
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
        // Get available sources
        const availableSources = await calendarSourceManager!.detectAvailableSources();

        // Get enabled sources
        const enabledSources = calendarSourceManager!.getEnabledSources();

        // Get health status
        const healthStatus = await calendarSourceManager!.healthCheck();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  sources: {
                    eventkit: {
                      available: availableSources.eventkit,
                      enabled: enabledSources.includes('eventkit'),
                      healthy: healthStatus.eventkit,
                      description: "macOS EventKit calendar integration (macOS only)",
                    },
                    google: {
                      available: availableSources.google,
                      enabled: enabledSources.includes('google'),
                      healthy: healthStatus.google,
                      description: "Google Calendar API integration (all platforms)",
                    },
                  },
                  summary: {
                    totalAvailable: Object.values(availableSources).filter(Boolean).length,
                    totalEnabled: enabledSources.length,
                    allHealthy: Object.values(healthStatus).every(Boolean),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('カレンダーソース情報の取得に失敗しました', error);
      }
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

  /**
   * get_working_cadence - Get user's working rhythm information
   * Requirement: 32.1-32.10
   */
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
    async ({ dayOfWeek, date }) => {
      // Initialize service if not already done
      if (!workingCadenceService) {
        workingCadenceService = new WorkingCadenceService();
      }

      try {
        const result = await workingCadenceService.getWorkingCadence({
          dayOfWeek,
          date,
        });

        if (!result.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: true,
                    message: result.error || "勤務リズム情報の取得に失敗しました。",
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
                  success: true,
                  user: result.user,
                  workingHours: result.workingHours,
                  weeklyPattern: result.weeklyPattern,
                  deepWorkBlocks: result.deepWorkBlocks,
                  weeklyReview: result.weeklyReview,
                  specificDay: result.specificDay,
                  recommendations: result.recommendations,
                  summary: result.summary,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return createErrorFromCatch('勤務リズム情報の取得に失敗しました', error);
      }
    },
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
    console.log(result.message);
    process.exit(0);
  }

  // Handle token generation
  if (options.generateToken) {
    const result = await startServer(options);
    if (result.success) {
      console.log(result.message);
      process.exit(0);
    } else {
      console.error(`Token generation failed: ${result.error}`);
      process.exit(1);
    }
  }

  // Start in HTTP mode if --remote flag is set
  if (options.remote) {
    const result = await startServer(options);

    if (!result.success) {
      console.error(`Failed to start HTTP server: ${result.error}`);
      process.exit(1);
    }

    console.error(
      `${SERVER_NAME} v${VERSION} started in HTTP mode on ${result.host}:${result.port}`
    );

    // Keep the process running
    process.on("SIGINT", async () => {
      console.error("\nShutting down...");
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
  console.error(`${SERVER_NAME} v${VERSION} started in Stdio mode`);
}

main().catch((error) => {
  console.error("Failed to start sage server:", error);
  process.exit(1);
});
