/**
 * MCP Handler for HTTP Server
 * Requirements: 13.1, 13.4, 13.5
 *
 * Handles MCP JSON-RPC requests over HTTP, providing access to all sage tools.
 */

import { VERSION, SERVER_NAME } from '../version.js';
import { ConfigLoader } from '../config/loader.js';
import { SetupWizard } from '../setup/wizard.js';
import { TaskAnalyzer } from '../tools/analyze-tasks.js';
import { ReminderManager } from '../integrations/reminder-manager.js';
import { CalendarService } from '../integrations/calendar-service.js';
import { NotionMCPService } from '../integrations/notion-mcp.js';
import { TodoListManager, type TodoStatus, type TaskSource } from '../integrations/todo-list-manager.js';
import { TaskSynchronizer } from '../integrations/task-synchronizer.js';
import { CalendarEventResponseService, type EventResponseType } from '../integrations/calendar-event-response.js';
import { CalendarEventCreatorService } from '../integrations/calendar-event-creator.js';
import type { UserConfig, Priority } from '../types/index.js';

// Protocol version
const PROTOCOL_VERSION = '2024-11-05';

/**
 * MCP JSON-RPC Request
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC Response
 */
export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: MCPError;
}

/**
 * MCP Error
 */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool handler function type
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

/**
 * MCP Handler interface
 */
export interface MCPHandler {
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
  listTools(): ToolDefinition[];
}

/**
 * MCP Handler Implementation
 */
class MCPHandlerImpl implements MCPHandler {
  private config: UserConfig | null = null;
  private wizardSession: ReturnType<typeof SetupWizard.createSession> | null = null;
  private reminderManager: ReminderManager | null = null;
  private calendarService: CalendarService | null = null;
  private notionService: NotionMCPService | null = null;
  private todoListManager: TodoListManager | null = null;
  private taskSynchronizer: TaskSynchronizer | null = null;
  private calendarEventResponseService: CalendarEventResponseService | null = null;
  private calendarEventCreatorService: CalendarEventCreatorService | null = null;
  private initialized: boolean = false;

  private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();

  constructor() {
    this.registerTools();
  }

  /**
   * Initialize the handler (load config, etc.)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.config = await ConfigLoader.load();
      if (this.config) {
        this.initializeServices(this.config);
      }
    } catch {
      this.config = null;
    }

    this.initialized = true;
  }

  /**
   * Initialize services with config
   */
  private initializeServices(userConfig: UserConfig): void {
    this.reminderManager = new ReminderManager({
      appleRemindersThreshold: 7,
      notionThreshold: userConfig.integrations.notion.threshold,
      defaultList: userConfig.integrations.appleReminders.defaultList,
      notionDatabaseId: userConfig.integrations.notion.databaseId,
    });
    this.calendarService = new CalendarService();
    this.notionService = new NotionMCPService();
    this.todoListManager = new TodoListManager();
    this.taskSynchronizer = new TaskSynchronizer();
    this.calendarEventResponseService = new CalendarEventResponseService();
    this.calendarEventCreatorService = new CalendarEventCreatorService();
  }

  /**
   * Handle an MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, id, params } = request;

    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id, params);

        case 'notifications/initialized':
          return { jsonrpc: '2.0', id };

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          return this.handleToolsCall(id, params);

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(id: number | string | null, _params?: Record<string, unknown>): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: {
          name: SERVER_NAME,
          version: VERSION,
        },
        capabilities: {
          tools: {},
        },
      },
    };
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(id: number | string | null): MCPResponse {
    const tools = this.listTools();

    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools,
      },
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(
    id: number | string | null,
    params?: Record<string, unknown>
  ): Promise<MCPResponse> {
    if (!params?.name) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid params: missing tool name',
        },
      };
    }

    const toolName = params.name as string;
    const toolArgs = (params.arguments as Record<string, unknown>) || {};

    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Tool not found: ${toolName}`,
        },
      };
    }

    try {
      const result = await tool.handler(toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error) {
      // Return error as content (MCP convention for tool errors)
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: error instanceof Error ? error.message : 'Unknown error',
                },
                null,
                2
              ),
            },
          ],
        },
      };
    }
  }

  /**
   * List all available tools
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Register all tools
   */
  private registerTools(): void {
    // check_setup_status
    this.registerTool(
      {
        name: 'check_setup_status',
        description: 'Check if sage has been configured. Returns setup status and guidance.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      async () => {
        const exists = await ConfigLoader.exists();
        const isValid = this.config !== null;

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
                  userName: this.config?.user.name,
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

    // start_setup_wizard
    this.registerTool(
      {
        name: 'start_setup_wizard',
        description: 'Start the interactive setup wizard for sage. Returns the first question.',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['full', 'quick'],
              description: 'Setup mode: full (all questions) or quick (essential only)',
            },
          },
        },
      },
      async (args) => {
        const mode = (args.mode as 'full' | 'quick') || 'full';
        this.wizardSession = SetupWizard.createSession(mode);
        const question = SetupWizard.getCurrentQuestion(this.wizardSession);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: this.wizardSession.sessionId,
                  currentStep: this.wizardSession.currentStep,
                  totalSteps: this.wizardSession.totalSteps,
                  progress: Math.round(
                    (this.wizardSession.currentStep / this.wizardSession.totalSteps) * 100
                  ),
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

    // answer_wizard_question
    this.registerTool(
      {
        name: 'answer_wizard_question',
        description: 'Answer a question in the setup wizard and get the next question.',
        inputSchema: {
          type: 'object',
          properties: {
            questionId: {
              type: 'string',
              description: 'The ID of the question being answered',
            },
            answer: {
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
              description: 'The answer to the question',
            },
          },
          required: ['questionId', 'answer'],
        },
      },
      async (args) => {
        const questionId = args.questionId as string;
        const answer = args.answer as string | string[];

        if (!this.wizardSession) {
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

        const result = SetupWizard.answerQuestion(this.wizardSession, questionId, answer);

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
                    sessionId: this.wizardSession.sessionId,
                    answers: this.wizardSession.answers,
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

        const nextQuestion = SetupWizard.getCurrentQuestion(this.wizardSession);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  currentStep: this.wizardSession.currentStep,
                  totalSteps: this.wizardSession.totalSteps,
                  progress: Math.round(
                    (this.wizardSession.currentStep / this.wizardSession.totalSteps) * 100
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
                2
              ),
            },
          ],
        };
      }
    );

    // save_config
    this.registerTool(
      {
        name: 'save_config',
        description: 'Save the configuration after completing the setup wizard.',
        inputSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              description: 'Confirm saving the configuration',
            },
          },
          required: ['confirm'],
        },
      },
      async (args) => {
        const confirm = args.confirm as boolean;

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

        if (!this.wizardSession) {
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
          const newConfig = SetupWizard.buildConfig(this.wizardSession);
          await ConfigLoader.save(newConfig);
          this.config = newConfig;
          this.wizardSession = null;

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

    // analyze_tasks
    this.registerTool(
      {
        name: 'analyze_tasks',
        description:
          'Analyze tasks to determine priority, estimate time, and identify stakeholders.',
        inputSchema: {
          type: 'object',
          properties: {
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Task title' },
                  description: { type: 'string', description: 'Task description' },
                  deadline: {
                    type: 'string',
                    description: 'Task deadline (ISO 8601 format)',
                  },
                },
                required: ['title'],
              },
              description: 'List of tasks to analyze',
            },
          },
          required: ['tasks'],
        },
      },
      async (args) => {
        if (!this.config) {
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
          const tasks = args.tasks as Array<{
            title: string;
            description?: string;
            deadline?: string;
          }>;
          const result = await TaskAnalyzer.analyzeTasks(tasks, this.config);

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

    // set_reminder
    this.registerTool(
      {
        name: 'set_reminder',
        description: 'Set a reminder for a task in Apple Reminders or Notion.',
        inputSchema: {
          type: 'object',
          properties: {
            taskTitle: { type: 'string', description: 'Title of the task' },
            dueDate: {
              type: 'string',
              description: 'Due date for the reminder (ISO 8601 format)',
            },
            reminderType: {
              type: 'string',
              enum: [
                '1_hour_before',
                '3_hours_before',
                '1_day_before',
                '3_days_before',
                '1_week_before',
              ],
              description: 'Type of reminder',
            },
            list: {
              type: 'string',
              description: 'Reminder list name (for Apple Reminders)',
            },
            priority: {
              type: 'string',
              enum: ['P0', 'P1', 'P2', 'P3'],
              description: 'Task priority',
            },
            notes: {
              type: 'string',
              description: 'Additional notes for the reminder',
            },
          },
          required: ['taskTitle'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.reminderManager) {
          this.initializeServices(this.config);
        }

        try {
          const result = await this.reminderManager!.setReminder({
            taskTitle: args.taskTitle as string,
            targetDate: args.dueDate as string | undefined,
            reminderType: args.reminderType as string | undefined,
            list:
              (args.list as string) ?? this.config.integrations.appleReminders.defaultList,
            priority: args.priority as Priority | undefined,
            notes: args.notes as string | undefined,
          });

          if (result.success) {
            if (result.delegateToNotion && result.notionRequest) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: true,
                        destination: 'notion_mcp',
                        method: 'delegate',
                        delegateToNotion: true,
                        notionRequest: result.notionRequest,
                        message: `Notionへの追加はClaude Codeが直接notion-create-pagesツールを使用してください。`,
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
                      success: true,
                      destination: result.destination,
                      method: result.method,
                      reminderId: result.reminderId,
                      reminderUrl: result.reminderUrl ?? result.pageUrl,
                      message:
                        result.destination === 'apple_reminders'
                          ? `Apple Remindersにリマインダーを作成しました: ${args.taskTitle}`
                          : `Notionにタスクを作成しました: ${args.taskTitle}`,
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
                    success: false,
                    destination: result.destination,
                    error: result.error,
                    fallbackText: result.fallbackText,
                    message: result.fallbackText
                      ? '自動作成に失敗しました。以下のテキストを手動でコピーしてください。'
                      : `リマインダー作成に失敗しました: ${result.error}`,
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
                    message: `リマインダー設定に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // find_available_slots
    this.registerTool(
      {
        name: 'find_available_slots',
        description: 'Find available time slots in the calendar for scheduling tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            durationMinutes: {
              type: 'number',
              description: 'Required duration in minutes',
            },
            startDate: {
              type: 'string',
              description: 'Start date for search (ISO 8601 format)',
            },
            endDate: {
              type: 'string',
              description: 'End date for search (ISO 8601 format)',
            },
            preferDeepWork: {
              type: 'boolean',
              description: 'Prefer deep work time slots',
            },
          },
          required: ['durationMinutes'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.calendarService) {
          this.initializeServices(this.config);
        }

        try {
          const durationMinutes = args.durationMinutes as number;
          const startDate = args.startDate as string | undefined;
          const endDate = args.endDate as string | undefined;
          const preferDeepWork = args.preferDeepWork as boolean | undefined;

          const platformInfo = await this.calendarService!.detectPlatform();
          const isAvailable = await this.calendarService!.isAvailable();

          if (!isAvailable) {
            const searchStart = startDate ?? new Date().toISOString().split('T')[0];
            const searchEnd =
              endDate ??
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const manualPrompt = this.calendarService!.generateManualInputPrompt(
              searchStart,
              searchEnd
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      platform: platformInfo.platform,
                      method: platformInfo.recommendedMethod,
                      message:
                        'カレンダー統合がこのプラットフォームで利用できません。手動で予定を入力してください。',
                      manualPrompt,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const searchStart = startDate ?? new Date().toISOString().split('T')[0];
          const searchEnd =
            endDate ??
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const events = await this.calendarService!.fetchEvents(searchStart, searchEnd);

          const workingHours = {
            start: this.config.calendar.workingHours.start,
            end: this.config.calendar.workingHours.end,
          };

          const slots = this.calendarService!.findAvailableSlotsFromEvents(
            events,
            durationMinutes,
            workingHours,
            searchStart
          );

          const suitabilityConfig = {
            deepWorkDays: this.config.calendar.deepWorkDays,
            meetingHeavyDays: this.config.calendar.meetingHeavyDays,
          };

          const scoredSlots = slots.map((slot) =>
            this.calendarService!.calculateSuitability(slot, suitabilityConfig)
          );

          const filteredSlots = preferDeepWork
            ? scoredSlots.filter((s) => s.dayType === 'deep-work')
            : scoredSlots;

          const suitabilityOrder = { excellent: 0, good: 1, acceptable: 2 };
          filteredSlots.sort(
            (a, b) =>
              suitabilityOrder[a.suitability] - suitabilityOrder[b.suitability]
          );

          return {
            content: [
              {
                type: 'text',
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
                        : '指定した条件に合う空き時間が見つかりませんでした。',
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
                    message: `カレンダー検索に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // list_calendar_events
    this.registerTool(
      {
        name: 'list_calendar_events',
        description:
          'List calendar events for a specified period. Returns events with details including calendar name and location.',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date in ISO 8601 format (e.g., 2025-01-15)',
            },
            endDate: {
              type: 'string',
              description: 'End date in ISO 8601 format (e.g., 2025-01-20)',
            },
            calendarName: {
              type: 'string',
              description: 'Optional: filter events by calendar name',
            },
          },
          required: ['startDate', 'endDate'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.calendarService) {
          this.initializeServices(this.config);
        }

        try {
          const startDate = args.startDate as string;
          const endDate = args.endDate as string;
          const calendarName = args.calendarName as string | undefined;

          const platformInfo = await this.calendarService!.detectPlatform();
          const isAvailable = await this.calendarService!.isAvailable();

          if (!isAvailable) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      platform: platformInfo.platform,
                      method: platformInfo.recommendedMethod,
                      message:
                        'カレンダー統合がこのプラットフォームで利用できません。macOSで実行してください。',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const result = await this.calendarService!.listEvents({
            startDate,
            endDate,
            calendarName,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    platform: platformInfo.platform,
                    method: platformInfo.recommendedMethod,
                    events: result.events.map((event) => ({
                      id: event.id,
                      title: event.title,
                      start: event.start,
                      end: event.end,
                      isAllDay: event.isAllDay,
                      calendar: event.calendar,
                      location: event.location,
                    })),
                    period: result.period,
                    totalEvents: result.totalEvents,
                    message:
                      result.totalEvents > 0
                        ? `${result.totalEvents}件のイベントが見つかりました。`
                        : '指定した期間にイベントが見つかりませんでした。',
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
                    message: `カレンダーイベントの取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // sync_to_notion
    this.registerTool(
      {
        name: 'sync_to_notion',
        description: 'Sync a task to Notion database for long-term tracking.',
        inputSchema: {
          type: 'object',
          properties: {
            taskTitle: { type: 'string', description: 'Title of the task' },
            description: { type: 'string', description: 'Task description' },
            priority: {
              type: 'string',
              enum: ['P0', 'P1', 'P2', 'P3'],
              description: 'Task priority',
            },
            dueDate: { type: 'string', description: 'Due date (ISO 8601 format)' },
            stakeholders: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of stakeholders',
            },
            estimatedMinutes: {
              type: 'number',
              description: 'Estimated duration in minutes',
            },
          },
          required: ['taskTitle'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.config.integrations.notion.enabled) {
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

        if (!this.notionService) {
          this.initializeServices(this.config);
        }

        try {
          const taskTitle = args.taskTitle as string;
          const description = args.description as string | undefined;
          const priority = args.priority as string | undefined;
          const dueDate = args.dueDate as string | undefined;
          const stakeholders = args.stakeholders as string[] | undefined;
          const estimatedMinutes = args.estimatedMinutes as number | undefined;

          const isAvailable = await this.notionService!.isAvailable();

          const properties = this.notionService!.buildNotionProperties({
            title: taskTitle,
            priority,
            deadline: dueDate,
            stakeholders,
            estimatedMinutes,
            description,
          });

          if (!isAvailable) {
            const fallbackText = this.notionService!.generateFallbackTemplate({
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
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      method: 'fallback',
                      message:
                        'Notion MCP統合が利用できません。以下のテンプレートを手動でNotionにコピーしてください。',
                      fallbackText,
                      task: {
                        taskTitle,
                        priority: priority ?? 'P3',
                        dueDate,
                        stakeholders: stakeholders ?? [],
                        estimatedMinutes,
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const result = await this.notionService!.createPage({
            databaseId: this.config.integrations.notion.databaseId,
            title: taskTitle,
            properties,
          });

          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      method: 'mcp',
                      pageId: result.pageId,
                      pageUrl: result.pageUrl,
                      message: `Notionにタスクを同期しました: ${taskTitle}`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const fallbackText = this.notionService!.generateFallbackTemplate({
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
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    method: 'fallback',
                    error: result.error,
                    message:
                      'Notion MCP呼び出しに失敗しました。以下のテンプレートを手動でコピーしてください。',
                    fallbackText,
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
                    message: `Notion同期に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // update_config
    this.registerTool(
      {
        name: 'update_config',
        description: 'Update sage configuration settings.',
        inputSchema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              enum: [
                'user',
                'calendar',
                'priorityRules',
                'integrations',
                'team',
                'preferences',
              ],
              description: 'Configuration section to update',
            },
            updates: {
              type: 'object',
              description: 'Key-value pairs to update',
            },
          },
          required: ['section', 'updates'],
        },
      },
      async (args) => {
        if (!this.config) {
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
          const section = args.section as string;
          const updates = args.updates as Record<string, unknown>;

          const validationResult = this.validateConfigUpdate(section, updates);
          if (!validationResult.valid) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: true,
                      message: `設定の検証に失敗しました: ${validationResult.error}`,
                      invalidFields: validationResult.invalidFields,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const updatedConfig = this.applyConfigUpdates(this.config, section, updates);
          await ConfigLoader.save(updatedConfig);
          this.config = updatedConfig;

          if (section === 'integrations') {
            this.initializeServices(this.config);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    section,
                    updatedFields: Object.keys(updates),
                    message: `設定を更新しました: ${section}`,
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
                    message: `設定の更新に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // list_todos
    this.registerTool(
      {
        name: 'list_todos',
        description:
          'List TODO items from Apple Reminders and Notion with optional filtering.',
        inputSchema: {
          type: 'object',
          properties: {
            priority: {
              type: 'array',
              items: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
              description: 'Filter by priority levels',
            },
            status: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['not_started', 'in_progress', 'completed', 'cancelled'],
              },
              description: 'Filter by status',
            },
            source: {
              type: 'array',
              items: { type: 'string', enum: ['apple_reminders', 'notion', 'manual'] },
              description: 'Filter by source',
            },
            todayOnly: { type: 'boolean', description: 'Show only tasks due today' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags',
            },
          },
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.todoListManager) {
          this.initializeServices(this.config);
        }

        try {
          const priority = args.priority as Priority[] | undefined;
          const status = args.status as TodoStatus[] | undefined;
          const source = args.source as TaskSource[] | undefined;
          const todayOnly = args.todayOnly as boolean | undefined;
          const tags = args.tags as string[] | undefined;

          let todos;
          if (todayOnly) {
            todos = await this.todoListManager!.getTodaysTasks();
          } else {
            todos = await this.todoListManager!.listTodos({
              priority,
              status,
              source,
              tags,
            });
          }

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
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    totalCount: todos.length,
                    todos: formattedTodos,
                    message:
                      todos.length > 0
                        ? `${todos.length}件のタスクが見つかりました。`
                        : 'タスクが見つかりませんでした。',
                    filters: {
                      priority,
                      status,
                      source,
                      todayOnly,
                      tags,
                    },
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
                    message: `TODOリストの取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // update_task_status
    this.registerTool(
      {
        name: 'update_task_status',
        description: 'Update the status of a task in Apple Reminders or Notion.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'ID of the task to update' },
            status: {
              type: 'string',
              enum: ['not_started', 'in_progress', 'completed', 'cancelled'],
              description: 'New status for the task',
            },
            source: {
              type: 'string',
              enum: ['apple_reminders', 'notion', 'manual'],
              description: 'Source of the task',
            },
            syncAcrossSources: {
              type: 'boolean',
              description: 'Whether to sync the status across all sources',
            },
          },
          required: ['taskId', 'status', 'source'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.todoListManager) {
          this.initializeServices(this.config);
        }

        try {
          const taskId = args.taskId as string;
          const status = args.status as TodoStatus;
          const source = args.source as TaskSource;
          const syncAcrossSources = args.syncAcrossSources as boolean | undefined;

          const result = await this.todoListManager!.updateTaskStatus(
            taskId,
            status,
            source
          );

          if (!result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      taskId,
                      error: result.error,
                      message: `タスクステータスの更新に失敗しました: ${result.error}`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          let syncResult;
          if (syncAcrossSources) {
            syncResult = await this.todoListManager!.syncTaskAcrossSources(taskId);
          }

          return {
            content: [
              {
                type: 'text',
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
                    message: `タスクステータスの更新に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // sync_tasks
    this.registerTool(
      {
        name: 'sync_tasks',
        description:
          'Synchronize tasks between Apple Reminders and Notion, detecting and resolving conflicts.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      async () => {
        if (!this.config) {
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

        if (!this.taskSynchronizer) {
          this.initializeServices(this.config);
        }

        try {
          const result = await this.taskSynchronizer!.syncAllTasks();

          return {
            content: [
              {
                type: 'text',
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
                    message: `タスク同期に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // detect_duplicates
    this.registerTool(
      {
        name: 'detect_duplicates',
        description: 'Detect duplicate tasks between Apple Reminders and Notion.',
        inputSchema: {
          type: 'object',
          properties: {
            autoMerge: {
              type: 'boolean',
              description: 'Whether to automatically merge high-confidence duplicates',
            },
          },
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.taskSynchronizer) {
          this.initializeServices(this.config);
        }

        try {
          const autoMerge = args.autoMerge as boolean | undefined;
          const duplicates = await this.taskSynchronizer!.detectDuplicates();

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

          let mergeResults;
          if (autoMerge) {
            const highConfidenceDuplicates = duplicates.filter(
              (d) => d.confidence === 'high'
            );
            if (highConfidenceDuplicates.length > 0) {
              mergeResults =
                await this.taskSynchronizer!.mergeDuplicates(highConfidenceDuplicates);
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    duplicatesFound: duplicates.length,
                    duplicates: formattedDuplicates,
                    mergeResults: autoMerge ? mergeResults : undefined,
                    message:
                      duplicates.length > 0
                        ? `${duplicates.length}件の重複タスクが検出されました。`
                        : '重複タスクは見つかりませんでした。',
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
                    message: `重複検出に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // respond_to_calendar_event
    this.registerTool(
      {
        name: 'respond_to_calendar_event',
        description:
          'Respond to a calendar event with accept, decline, or tentative. Use this to RSVP to meeting invitations.',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'The ID of the calendar event to respond to',
            },
            response: {
              type: 'string',
              enum: ['accept', 'decline', 'tentative'],
              description:
                'Response type: accept (承諾), decline (辞退), or tentative (仮承諾)',
            },
            comment: {
              type: 'string',
              description:
                "Optional comment to include with the response (e.g., '年末年始休暇のため')",
            },
          },
          required: ['eventId', 'response'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.calendarEventResponseService) {
          this.initializeServices(this.config);
        }

        try {
          const eventId = args.eventId as string;
          const response = args.response as EventResponseType;
          const comment = args.comment as string | undefined;

          const isAvailable =
            await this.calendarEventResponseService!.isEventKitAvailable();

          if (!isAvailable) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message:
                        'カレンダーイベント返信機能はmacOSでのみ利用可能です。',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const result = await this.calendarEventResponseService!.respondToEvent({
            eventId,
            response,
            comment,
          });

          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      eventId: result.eventId,
                      eventTitle: result.eventTitle,
                      newStatus: result.newStatus,
                      method: result.method,
                      instanceOnly: result.instanceOnly,
                      message: result.message,
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
                    success: false,
                    eventId: result.eventId,
                    eventTitle: result.eventTitle,
                    skipped: result.skipped,
                    reason: result.reason,
                    error: result.error,
                    message: result.skipped
                      ? `イベントをスキップしました: ${result.reason}`
                      : `イベント返信に失敗しました: ${result.error}`,
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
                    message: `カレンダーイベント返信に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // respond_to_calendar_events_batch
    this.registerTool(
      {
        name: 'respond_to_calendar_events_batch',
        description:
          'Respond to multiple calendar events at once. Useful for declining all events during vacation or leave periods.',
        inputSchema: {
          type: 'object',
          properties: {
            eventIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of event IDs to respond to',
            },
            response: {
              type: 'string',
              enum: ['accept', 'decline', 'tentative'],
              description:
                'Response type: accept (承諾), decline (辞退), or tentative (仮承諾)',
            },
            comment: {
              type: 'string',
              description:
                "Optional comment to include with all responses (e.g., '年末年始休暇のため')",
            },
          },
          required: ['eventIds', 'response'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.calendarEventResponseService) {
          this.initializeServices(this.config);
        }

        try {
          const eventIds = args.eventIds as string[];
          const response = args.response as EventResponseType;
          const comment = args.comment as string | undefined;

          const isAvailable =
            await this.calendarEventResponseService!.isEventKitAvailable();

          if (!isAvailable) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message:
                        'カレンダーイベント返信機能はmacOSでのみ利用可能です。',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const result =
            await this.calendarEventResponseService!.respondToEventsBatch({
              eventIds,
              response,
              comment,
            });

          return {
            content: [
              {
                type: 'text',
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
                    message: `カレンダーイベント一括返信に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // create_calendar_event
    this.registerTool(
      {
        name: 'create_calendar_event',
        description:
          'Create a new calendar event with optional location, notes, and alarms.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title' },
            startDate: {
              type: 'string',
              description:
                'Start date/time in ISO 8601 format (e.g., 2025-01-15T10:00:00+09:00)',
            },
            endDate: {
              type: 'string',
              description:
                'End date/time in ISO 8601 format (e.g., 2025-01-15T11:00:00+09:00)',
            },
            location: { type: 'string', description: 'Event location' },
            notes: { type: 'string', description: 'Event notes/description' },
            calendarName: {
              type: 'string',
              description: 'Calendar name to create the event in (uses default if not specified)',
            },
            alarms: {
              type: 'array',
              items: { type: 'string' },
              description: "Optional: Override default alarms with custom settings (e.g., ['-15m', '-1h']). If omitted, calendar's default alarm settings apply.",
            },
          },
          required: ['title', 'startDate', 'endDate'],
        },
      },
      async (args) => {
        if (!this.config) {
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

        if (!this.calendarEventCreatorService) {
          this.initializeServices(this.config);
        }

        try {
          const title = args.title as string;
          const startDate = args.startDate as string;
          const endDate = args.endDate as string;
          const location = args.location as string | undefined;
          const notes = args.notes as string | undefined;
          const calendarName = args.calendarName as string | undefined;
          const alarms = args.alarms as string[] | undefined;

          const isAvailable = await this.calendarEventCreatorService!.isEventKitAvailable();

          if (!isAvailable) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message: 'カレンダーイベント作成機能はmacOSでのみ利用可能です。',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const result = await this.calendarEventCreatorService!.createEvent({
            title,
            startDate,
            endDate,
            location,
            notes,
            calendarName,
            alarms,
          });

          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      eventId: result.eventId,
                      title: result.title,
                      startDate: result.startDate,
                      endDate: result.endDate,
                      calendarName: result.calendarName,
                      isAllDay: result.isAllDay,
                      message: result.message,
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
                    success: false,
                    error: result.error,
                    message: result.message,
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
                    message: `カレンダーイベント作成に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
  }

  /**
   * Register a tool
   */
  private registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Validate config updates
   */
  private validateConfigUpdate(
    section: string,
    updates: Record<string, unknown>
  ): { valid: boolean; error?: string; invalidFields?: string[] } {
    const invalidFields: string[] = [];

    switch (section) {
      case 'user':
        if (updates.name !== undefined && typeof updates.name !== 'string') {
          invalidFields.push('name');
        }
        if (updates.timezone !== undefined && typeof updates.timezone !== 'string') {
          invalidFields.push('timezone');
        }
        break;

      case 'calendar':
        if (updates.workingHours !== undefined) {
          const wh = updates.workingHours as { start?: string; end?: string };
          if (!wh.start || !wh.end) {
            invalidFields.push('workingHours');
          }
        }
        if (updates.deepWorkDays !== undefined && !Array.isArray(updates.deepWorkDays)) {
          invalidFields.push('deepWorkDays');
        }
        if (
          updates.meetingHeavyDays !== undefined &&
          !Array.isArray(updates.meetingHeavyDays)
        ) {
          invalidFields.push('meetingHeavyDays');
        }
        break;

      case 'integrations':
        if (updates.notion !== undefined) {
          const notion = updates.notion as { enabled?: boolean; databaseId?: string };
          if (notion.enabled === true && !notion.databaseId) {
            invalidFields.push('notion.databaseId');
          }
        }
        break;

      case 'team':
        if (updates.members !== undefined && !Array.isArray(updates.members)) {
          invalidFields.push('members');
        }
        if (updates.managers !== undefined && !Array.isArray(updates.managers)) {
          invalidFields.push('managers');
        }
        break;
    }

    if (invalidFields.length > 0) {
      return {
        valid: false,
        error: `無効なフィールド: ${invalidFields.join(', ')}`,
        invalidFields,
      };
    }

    return { valid: true };
  }

  /**
   * Apply config updates
   */
  private applyConfigUpdates(
    currentConfig: UserConfig,
    section: string,
    updates: Record<string, unknown>
  ): UserConfig {
    const newConfig = { ...currentConfig };

    switch (section) {
      case 'user':
        newConfig.user = { ...newConfig.user, ...updates } as UserConfig['user'];
        break;
      case 'calendar':
        newConfig.calendar = {
          ...newConfig.calendar,
          ...updates,
        } as UserConfig['calendar'];
        break;
      case 'priorityRules':
        newConfig.priorityRules = {
          ...newConfig.priorityRules,
          ...updates,
        } as UserConfig['priorityRules'];
        break;
      case 'integrations':
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
      case 'team':
        newConfig.team = { ...newConfig.team, ...updates } as UserConfig['team'];
        break;
      case 'preferences':
        newConfig.preferences = {
          ...newConfig.preferences,
          ...updates,
        } as UserConfig['preferences'];
        break;
    }

    return newConfig;
  }
}

/**
 * Create an MCP handler
 */
export async function createMCPHandler(): Promise<MCPHandler> {
  const handler = new MCPHandlerImpl();
  await handler.initialize();
  return handler;
}
