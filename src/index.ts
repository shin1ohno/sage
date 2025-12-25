#!/usr/bin/env node
/**
 * sage - AI Task Management Assistant MCP Server
 *
 * An MCP server for Claude Desktop and Claude Code that provides
 * task management, prioritization, and reminder integration.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { ConfigLoader } from './config/loader.js';
import { SetupWizard } from './setup/wizard.js';
import { TaskAnalyzer } from './tools/analyze-tasks.js';
import type { UserConfig } from './types/index.js';

// Server metadata
const SERVER_NAME = 'sage';
const SERVER_VERSION = '0.1.0';

// Global state
let config: UserConfig | null = null;
let wizardSession: ReturnType<typeof SetupWizard.createSession> | null = null;

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
    'check_setup_status',
    'Check if sage has been configured. Returns setup status and guidance.',
    {},
    async () => {
      const exists = await ConfigLoader.exists();
      const isValid = config !== null;

      if (!exists) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  setupComplete: false,
                  configExists: false,
                  message:
                    'sageの初期設定が必要です。start_setup_wizardを実行してセットアップを開始してください。',
                  nextAction: 'start_setup_wizard',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (!isValid) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  setupComplete: false,
                  configExists: true,
                  message:
                    '設定ファイルが見つかりましたが、読み込みに失敗しました。設定を再作成してください。',
                  nextAction: 'start_setup_wizard',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                setupComplete: true,
                configExists: true,
                userName: config?.user.name,
                message: 'sageは設定済みです。タスク分析やリマインド設定を開始できます。',
                availableTools: [
                  'analyze_tasks',
                  'set_reminder',
                  'find_available_slots',
                  'sync_to_notion',
                  'update_config',
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /**
   * start_setup_wizard - Begin the interactive setup process
   * Requirement: 1.3
   */
  server.tool(
    'start_setup_wizard',
    'Start the interactive setup wizard for sage. Returns the first question.',
    {
      mode: z
        .enum(['full', 'quick'])
        .optional()
        .describe('Setup mode: full (all questions) or quick (essential only)'),
    },
    async ({ mode = 'full' }) => {
      wizardSession = SetupWizard.createSession(mode);

      const question = SetupWizard.getCurrentQuestion(wizardSession);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sessionId: wizardSession.sessionId,
                currentStep: wizardSession.currentStep,
                totalSteps: wizardSession.totalSteps,
                progress: Math.round((wizardSession.currentStep / wizardSession.totalSteps) * 100),
                question: {
                  id: question.id,
                  text: question.text,
                  type: question.type,
                  options: question.options,
                  defaultValue: question.defaultValue,
                  helpText: question.helpText,
                },
                message: 'セットアップを開始します。以下の質問に回答してください。',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /**
   * answer_wizard_question - Answer a setup wizard question
   * Requirement: 1.3, 1.4
   */
  server.tool(
    'answer_wizard_question',
    'Answer a question in the setup wizard and get the next question.',
    {
      questionId: z.string().describe('The ID of the question being answered'),
      answer: z.union([z.string(), z.array(z.string())]).describe('The answer to the question'),
    },
    async ({ questionId, answer }) => {
      if (!wizardSession) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    'セットアップセッションが見つかりません。start_setup_wizardを実行してください。',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const result = SetupWizard.answerQuestion(wizardSession, questionId, answer);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: result.error,
                  currentQuestion: result.currentQuestion,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (result.isComplete) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  isComplete: true,
                  sessionId: wizardSession.sessionId,
                  answers: wizardSession.answers,
                  message:
                    'すべての質問に回答しました。save_configを実行して設定を保存してください。',
                  nextAction: 'save_config',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const nextQuestion = SetupWizard.getCurrentQuestion(wizardSession);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                currentStep: wizardSession.currentStep,
                totalSteps: wizardSession.totalSteps,
                progress: Math.round((wizardSession.currentStep / wizardSession.totalSteps) * 100),
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
              2
            ),
          },
        ],
      };
    }
  );

  /**
   * save_config - Save the configuration from the setup wizard
   * Requirement: 1.4, 1.5, 1.6
   */
  server.tool(
    'save_config',
    'Save the configuration after completing the setup wizard.',
    {
      confirm: z.boolean().describe('Confirm saving the configuration'),
    },
    async ({ confirm }) => {
      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  saved: false,
                  message: '設定の保存がキャンセルされました。',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (!wizardSession) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    'セットアップセッションが見つかりません。start_setup_wizardを実行してください。',
                },
                null,
                2
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
              type: 'text',
              text: JSON.stringify(
                {
                  saved: true,
                  configPath: ConfigLoader.getConfigPath(),
                  userName: newConfig.user.name,
                  message: `設定を保存しました。${newConfig.user.name}さん、sageをご利用いただきありがとうございます！`,
                  availableTools: [
                    'analyze_tasks',
                    'set_reminder',
                    'find_available_slots',
                    'sync_to_notion',
                  ],
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `設定の保存に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // ============================================
  // Task Analysis Tools (placeholder)
  // ============================================

  /**
   * analyze_tasks - Analyze tasks and provide prioritization
   * Requirement: 2.1-2.6, 3.1-3.2, 4.1-4.5
   */
  server.tool(
    'analyze_tasks',
    'Analyze tasks to determine priority, estimate time, and identify stakeholders.',
    {
      tasks: z
        .array(
          z.object({
            title: z.string().describe('Task title'),
            description: z.string().optional().describe('Task description'),
            deadline: z.string().optional().describe('Task deadline (ISO 8601 format)'),
          })
        )
        .describe('List of tasks to analyze'),
    },
    async ({ tasks }) => {
      if (!config) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: 'sageが設定されていません。check_setup_statusを実行してください。',
                },
                null,
                2
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
              type: 'text',
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
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `タスク分析に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  /**
   * set_reminder - Set a reminder for a task
   * Requirement: 5.1-5.6
   */
  server.tool(
    'set_reminder',
    'Set a reminder for a task in Apple Reminders or Notion.',
    {
      taskTitle: z.string().describe('Title of the task'),
      dueDate: z.string().optional().describe('Due date for the reminder (ISO 8601 format)'),
      reminderType: z
        .enum(['1_hour_before', '1_day_before', '1_week_before', 'custom'])
        .optional()
        .describe('Type of reminder'),
      list: z.string().optional().describe('Reminder list name (for Apple Reminders)'),
    },
    async ({ taskTitle, dueDate, reminderType, list }) => {
      if (!config) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: 'sageが設定されていません。check_setup_statusを実行してください。',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // TODO: Implement full reminder functionality in Task 12
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'リマインド機能は実装中です。',
                reminder: {
                  taskTitle,
                  dueDate,
                  reminderType: reminderType ?? 'default',
                  list: list ?? config.integrations.appleReminders.defaultList,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /**
   * find_available_slots - Find available time slots in calendar
   * Requirement: 3.3-3.6, 6.1-6.6
   */
  server.tool(
    'find_available_slots',
    'Find available time slots in the calendar for scheduling tasks.',
    {
      durationMinutes: z.number().describe('Required duration in minutes'),
      startDate: z.string().optional().describe('Start date for search (ISO 8601 format)'),
      endDate: z.string().optional().describe('End date for search (ISO 8601 format)'),
      preferDeepWork: z.boolean().optional().describe('Prefer deep work time slots'),
    },
    async ({ durationMinutes, startDate, endDate, preferDeepWork }) => {
      if (!config) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: 'sageが設定されていません。check_setup_statusを実行してください。',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // TODO: Implement calendar integration in Task 11
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'カレンダー統合機能は実装中です。',
                request: {
                  durationMinutes,
                  startDate,
                  endDate,
                  preferDeepWork: preferDeepWork ?? false,
                },
                slots: [],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /**
   * sync_to_notion - Sync a task to Notion
   * Requirement: 8.1-8.5
   */
  server.tool(
    'sync_to_notion',
    'Sync a task to Notion database for long-term tracking.',
    {
      taskTitle: z.string().describe('Title of the task'),
      description: z.string().optional().describe('Task description'),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional().describe('Task priority'),
      dueDate: z.string().optional().describe('Due date (ISO 8601 format)'),
      stakeholders: z.array(z.string()).optional().describe('List of stakeholders'),
    },
    async ({ taskTitle, description, priority, dueDate, stakeholders }) => {
      if (!config) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: 'sageが設定されていません。check_setup_statusを実行してください。',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (!config.integrations.notion.enabled) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message:
                    'Notion統合が有効になっていません。update_configでNotion設定を更新してください。',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // TODO: Implement Notion sync in Task 13
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Notion同期機能は実装中です。',
                task: {
                  taskTitle,
                  description,
                  priority: priority ?? 'P3',
                  dueDate,
                  stakeholders: stakeholders ?? [],
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /**
   * update_config - Update configuration
   * Requirement: 10.1-10.6
   */
  server.tool(
    'update_config',
    'Update sage configuration settings.',
    {
      section: z
        .enum(['user', 'calendar', 'priorityRules', 'integrations', 'team', 'preferences'])
        .describe('Configuration section to update'),
      updates: z.record(z.unknown()).describe('Key-value pairs to update'),
    },
    async ({ section, updates }) => {
      if (!config) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: 'sageが設定されていません。check_setup_statusを実行してください。',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // TODO: Implement config update in Task 14
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: '設定更新機能は実装中です。',
                section,
                updates,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

main().catch((error) => {
  console.error('Failed to start sage server:', error);
  process.exit(1);
});
