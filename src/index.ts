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
import { NotionMCPService } from "./integrations/notion-mcp.js";
import { TodoListManager } from "./integrations/todo-list-manager.js";
import { TaskSynchronizer } from "./integrations/task-synchronizer.js";
import type { UserConfig } from "./types/index.js";
import type { Priority } from "./types/index.js";

// Server metadata
const SERVER_NAME = "sage";
const SERVER_VERSION = "0.3.0";

// Global state
let config: UserConfig | null = null;
let wizardSession: ReturnType<typeof SetupWizard.createSession> | null = null;
let reminderManager: ReminderManager | null = null;
let calendarService: CalendarService | null = null;
let notionService: NotionMCPService | null = null;
let todoListManager: TodoListManager | null = null;
let taskSynchronizer: TaskSynchronizer | null = null;

/**
 * Validation result type
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
  invalidFields?: string[];
}

/**
 * Validate config updates for a specific section
 */
function validateConfigUpdate(
  section: string,
  updates: Record<string, unknown>,
): ValidationResult {
  const invalidFields: string[] = [];

  switch (section) {
    case "user":
      if (updates.name !== undefined && typeof updates.name !== "string") {
        invalidFields.push("name");
      }
      if (
        updates.timezone !== undefined &&
        typeof updates.timezone !== "string"
      ) {
        invalidFields.push("timezone");
      }
      break;

    case "calendar":
      if (updates.workingHours !== undefined) {
        const wh = updates.workingHours as { start?: string; end?: string };
        if (!wh.start || !wh.end) {
          invalidFields.push("workingHours");
        }
      }
      if (
        updates.deepWorkDays !== undefined &&
        !Array.isArray(updates.deepWorkDays)
      ) {
        invalidFields.push("deepWorkDays");
      }
      if (
        updates.meetingHeavyDays !== undefined &&
        !Array.isArray(updates.meetingHeavyDays)
      ) {
        invalidFields.push("meetingHeavyDays");
      }
      break;

    case "integrations":
      if (updates.notion !== undefined) {
        const notion = updates.notion as {
          enabled?: boolean;
          databaseId?: string;
        };
        if (notion.enabled === true && !notion.databaseId) {
          invalidFields.push("notion.databaseId");
        }
      }
      break;

    case "team":
      if (updates.members !== undefined && !Array.isArray(updates.members)) {
        invalidFields.push("members");
      }
      if (updates.managers !== undefined && !Array.isArray(updates.managers)) {
        invalidFields.push("managers");
      }
      break;
  }

  if (invalidFields.length > 0) {
    return {
      valid: false,
      error: `無効なフィールド: ${invalidFields.join(", ")}`,
      invalidFields,
    };
  }

  return { valid: true };
}

/**
 * Apply config updates to a specific section
 */
function applyConfigUpdates(
  currentConfig: UserConfig,
  section: string,
  updates: Record<string, unknown>,
): UserConfig {
  const newConfig = { ...currentConfig };

  switch (section) {
    case "user":
      newConfig.user = { ...newConfig.user, ...updates } as UserConfig["user"];
      break;
    case "calendar":
      newConfig.calendar = {
        ...newConfig.calendar,
        ...updates,
      } as UserConfig["calendar"];
      break;
    case "priorityRules":
      newConfig.priorityRules = {
        ...newConfig.priorityRules,
        ...updates,
      } as UserConfig["priorityRules"];
      break;
    case "integrations":
      // Deep merge for integrations
      if (updates.appleReminders) {
        newConfig.integrations.appleReminders = {
          ...newConfig.integrations.appleReminders,
          ...(updates.appleReminders as object),
        };
      }
      if (updates.notion) {
        newConfig.integrations.notion = {
          ...newConfig.integrations.notion,
          ...(updates.notion as object),
        };
      }
      break;
    case "team":
      newConfig.team = { ...newConfig.team, ...updates } as UserConfig["team"];
      break;
    case "preferences":
      newConfig.preferences = {
        ...newConfig.preferences,
        ...updates,
      } as UserConfig["preferences"];
      break;
  }

  return newConfig;
}

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
  notionService = new NotionMCPService();
  todoListManager = new TodoListManager();
  taskSynchronizer = new TaskSynchronizer();
}

/**
 * Initialize the MCP server with all tools
 */
async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `設定の保存に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `タスク分析に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `リマインダー設定に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  /**
   * find_available_slots - Find available time slots in calendar
   * Requirement: 3.3-3.6, 6.1-6.6
   */
  server.tool(
    "find_available_slots",
    "Find available time slots in the calendar for scheduling tasks.",
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
    },
    async ({ durationMinutes, startDate, endDate, preferDeepWork }) => {
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

      if (!calendarService) {
        initializeServices(config);
      }

      try {
        // Check platform availability
        const platformInfo = await calendarService!.detectPlatform();
        const isAvailable = await calendarService!.isAvailable();

        if (!isAvailable) {
          // Return manual input prompt for unsupported platforms
          const manualPrompt = calendarService!.generateManualInputPrompt(
            startDate ?? new Date().toISOString().split("T")[0],
            endDate ??
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    platform: platformInfo.platform,
                    method: platformInfo.recommendedMethod,
                    message:
                      "カレンダー統合がこのプラットフォームで利用できません。手動で予定を入力してください。",
                    manualPrompt,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Fetch events from calendar
        const searchStart = startDate ?? new Date().toISOString().split("T")[0];
        const searchEnd =
          endDate ??
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

        const events = await calendarService!.fetchEvents(
          searchStart,
          searchEnd,
        );

        // Find available slots
        const workingHours = {
          start: config.calendar.workingHours.start,
          end: config.calendar.workingHours.end,
        };

        const slots = calendarService!.findAvailableSlotsFromEvents(
          events,
          durationMinutes,
          workingHours,
          searchStart,
        );

        // Apply suitability scoring
        const suitabilityConfig = {
          deepWorkDays: config.calendar.deepWorkDays,
          meetingHeavyDays: config.calendar.meetingHeavyDays,
        };

        const scoredSlots = slots.map((slot) =>
          calendarService!.calculateSuitability(slot, suitabilityConfig),
        );

        // Filter for deep work preference if requested
        const filteredSlots = preferDeepWork
          ? scoredSlots.filter((s) => s.dayType === "deep-work")
          : scoredSlots;

        // Sort by suitability (excellent > good > acceptable)
        const suitabilityOrder = { excellent: 0, good: 1, acceptable: 2 };
        filteredSlots.sort(
          (a, b) =>
            suitabilityOrder[a.suitability] - suitabilityOrder[b.suitability],
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  platform: platformInfo.platform,
                  method: platformInfo.recommendedMethod,
                  searchRange: { start: searchStart, end: searchEnd },
                  eventsFound: events.length,
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
                      ? `${filteredSlots.length}件の空き時間が見つかりました。`
                      : "指定した条件に合う空き時間が見つかりませんでした。",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `カレンダー検索に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `Notion同期に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `設定の更新に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `TODOリストの取得に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `タスクステータスの更新に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `タスク同期に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `重複検出に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                null,
                2,
              ),
            },
          ],
        };
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

  // Start in HTTP mode if --remote flag is set
  if (options.remote) {
    const result = await startServer(options);

    if (!result.success) {
      console.error(`Failed to start HTTP server: ${result.error}`);
      process.exit(1);
    }

    console.error(
      `${SERVER_NAME} v${SERVER_VERSION} started in HTTP mode on ${result.host}:${result.port}`
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
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started in Stdio mode`);
}

main().catch((error) => {
  console.error("Failed to start sage server:", error);
  process.exit(1);
});
