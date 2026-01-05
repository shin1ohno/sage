/**
 * MCP Handler for HTTP Server
 * Requirements: 13.1, 13.4, 13.5
 *
 * Handles MCP JSON-RPC requests over HTTP, providing access to all sage tools.
 */

import { VERSION, SERVER_NAME } from '../version.js';
import { ConfigLoader } from '../config/loader.js';
import { SetupWizard } from '../setup/wizard.js';
import { ReminderManager } from '../integrations/reminder-manager.js';
import { CalendarService } from '../integrations/calendar-service.js';
import { NotionMCPService } from '../integrations/notion-mcp.js';
import { TodoListManager } from '../integrations/todo-list-manager.js';
import { TaskSynchronizer } from '../integrations/task-synchronizer.js';
import { CalendarEventResponseService, type EventResponseType } from '../integrations/calendar-event-response.js';
import { CalendarEventCreatorService } from '../integrations/calendar-event-creator.js';
import { CalendarEventDeleterService } from '../integrations/calendar-event-deleter.js';
import { WorkingCadenceService } from '../services/working-cadence.js';
import { CalendarSourceManager } from '../integrations/calendar-source-manager.js';
import { GoogleCalendarService } from '../integrations/google-calendar-service.js';
import { GoogleOAuthHandler } from '../oauth/google-oauth-handler.js';
import type { UserConfig } from '../types/index.js';

// Extracted tool handlers
import {
  type SetupContext,
  handleCheckSetupStatus,
  handleStartSetupWizard,
  handleAnswerWizardQuestion,
  handleSaveConfig,
} from '../tools/setup/index.js';

import {
  type TaskToolsContext,
  handleAnalyzeTasks,
  handleUpdateTaskStatus,
  handleSyncTasks,
  handleDetectDuplicates,
} from '../tools/tasks/index.js';

import {
  type ReminderTodoContext,
  handleSetReminder,
  handleListTodos,
} from '../tools/reminders/index.js';

import {
  type IntegrationToolsContext,
  handleSyncToNotion,
  handleUpdateConfig,
} from '../tools/integrations/index.js';

import {
  type CalendarToolsContext,
  handleListCalendarSources,
  handleListCalendarEvents,
  handleFindAvailableSlots,
  handleCreateCalendarEvent,
  handleRespondToCalendarEvent,
  handleRespondToCalendarEventsBatch,
  handleDeleteCalendarEvent,
  handleDeleteCalendarEventsBatch,
} from '../tools/calendar/handlers.js';

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
  private calendarEventDeleterService: CalendarEventDeleterService | null = null;
  private workingCadenceService: WorkingCadenceService | null = null;
  private calendarSourceManager: CalendarSourceManager | null = null;
  private googleCalendarService: GoogleCalendarService | null = null;
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

    // Initialize Google Calendar service with OAuth handler
    const oauthConfig = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
    };
    const oauthHandler = new GoogleOAuthHandler(oauthConfig);
    this.googleCalendarService = new GoogleCalendarService(oauthHandler);

    this.calendarSourceManager = new CalendarSourceManager({
      calendarService: this.calendarService,
      googleCalendarService: this.googleCalendarService,
      config: userConfig,
    });
    this.notionService = new NotionMCPService();
    this.todoListManager = new TodoListManager();
    this.taskSynchronizer = new TaskSynchronizer();
    this.calendarEventResponseService = new CalendarEventResponseService();
    this.calendarEventCreatorService = new CalendarEventCreatorService();
    this.calendarEventDeleterService = new CalendarEventDeleterService();
    this.workingCadenceService = new WorkingCadenceService();
  }

  /**
   * Create SetupContext for setup tool handlers
   */
  private createSetupContext(): SetupContext {
    return {
      getConfig: () => this.config,
      setConfig: (config: UserConfig) => {
        this.config = config;
      },
      getWizardSession: () => this.wizardSession,
      setWizardSession: (session) => {
        this.wizardSession = session;
      },
      initializeServices: (config: UserConfig) => this.initializeServices(config),
    };
  }

  /**
   * Create TaskToolsContext for task tool handlers
   */
  private createTaskToolsContext(): TaskToolsContext {
    return {
      getConfig: () => this.config,
      getTodoListManager: () => this.todoListManager,
      getTaskSynchronizer: () => this.taskSynchronizer,
      initializeServices: (config: UserConfig) => this.initializeServices(config),
    };
  }

  /**
   * Create ReminderTodoContext for reminder/todo tool handlers
   */
  private createReminderTodoContext(): ReminderTodoContext {
    return {
      getConfig: () => this.config,
      getReminderManager: () => this.reminderManager,
      getTodoListManager: () => this.todoListManager,
      initializeServices: (config: UserConfig) => this.initializeServices(config),
    };
  }

  /**
   * Create IntegrationToolsContext for integration tool handlers
   */
  private createIntegrationToolsContext(): IntegrationToolsContext {
    return {
      getConfig: () => this.config,
      setConfig: (config: UserConfig) => {
        this.config = config;
      },
      getNotionService: () => this.notionService,
      initializeServices: (config: UserConfig) => this.initializeServices(config),
    };
  }

  /**
   * Create CalendarToolsContext for calendar tool handlers
   */
  private createCalendarToolsContext(): CalendarToolsContext {
    return {
      getConfig: () => this.config,
      getCalendarSourceManager: () => this.calendarSourceManager,
      getCalendarEventResponseService: () => this.calendarEventResponseService,
      getGoogleCalendarService: () => this.googleCalendarService,
      getWorkingCadenceService: () => this.workingCadenceService,
      setWorkingCadenceService: (service: WorkingCadenceService) => {
        this.workingCadenceService = service;
      },
      initializeServices: (config: UserConfig) => this.initializeServices(config),
    };
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
    // check_setup_status - uses extracted handler
    this.registerTool(
      {
        name: 'check_setup_status',
        description: 'Check if sage has been configured. Returns setup status and guidance.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      async () => handleCheckSetupStatus(this.createSetupContext())
    );

    // start_setup_wizard - uses extracted handler
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
      async (args) =>
        handleStartSetupWizard(this.createSetupContext(), {
          mode: args.mode as 'full' | 'quick' | undefined,
        })
    );

    // answer_wizard_question - uses extracted handler
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
      async (args) =>
        handleAnswerWizardQuestion(this.createSetupContext(), {
          questionId: args.questionId as string,
          answer: args.answer as string | string[],
        })
    );

    // save_config - uses extracted handler
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
      async (args) =>
        handleSaveConfig(this.createSetupContext(), {
          confirm: args.confirm as boolean,
        })
    );

    // analyze_tasks - uses extracted handler
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
      async (args) =>
        handleAnalyzeTasks(this.createTaskToolsContext(), {
          tasks: args.tasks as Array<{
            title: string;
            description?: string;
            deadline?: string;
          }>,
        })
    );

    // set_reminder - uses extracted handler
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
      async (args) =>
        handleSetReminder(this.createReminderTodoContext(), {
          taskTitle: args.taskTitle as string,
          dueDate: args.dueDate as string | undefined,
          reminderType: args.reminderType as
            | '1_hour_before'
            | '3_hours_before'
            | '1_day_before'
            | '3_days_before'
            | '1_week_before'
            | undefined,
          list: args.list as string | undefined,
          priority: args.priority as 'P0' | 'P1' | 'P2' | 'P3' | undefined,
          notes: args.notes as string | undefined,
        })
    );

    // find_available_slots - uses extracted handler
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
      async (args) =>
        handleFindAvailableSlots(this.createCalendarToolsContext(), {
          durationMinutes: args.durationMinutes as number,
          startDate: args.startDate as string | undefined,
          endDate: args.endDate as string | undefined,
          preferDeepWork: args.preferDeepWork as boolean | undefined,
        })
    );

    // list_calendar_events - uses extracted handler
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
            calendarId: {
              type: 'string',
              description: 'Optional: filter events by calendar ID',
            },
          },
          required: ['startDate', 'endDate'],
        },
      },
      async (args) =>
        handleListCalendarEvents(this.createCalendarToolsContext(), {
          startDate: args.startDate as string,
          endDate: args.endDate as string,
          calendarId: args.calendarId as string | undefined,
        })
    );

    // sync_to_notion - uses extracted handler
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
      async (args) =>
        handleSyncToNotion(this.createIntegrationToolsContext(), {
          taskTitle: args.taskTitle as string,
          description: args.description as string | undefined,
          priority: args.priority as 'P0' | 'P1' | 'P2' | 'P3' | undefined,
          dueDate: args.dueDate as string | undefined,
          stakeholders: args.stakeholders as string[] | undefined,
          estimatedMinutes: args.estimatedMinutes as number | undefined,
        })
    );

    // update_config - uses extracted handler
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
      async (args) =>
        handleUpdateConfig(this.createIntegrationToolsContext(), {
          section: args.section as
            | 'user'
            | 'calendar'
            | 'priorityRules'
            | 'integrations'
            | 'team'
            | 'preferences',
          updates: args.updates as Record<string, unknown>,
        })
    );

    // list_todos - uses extracted handler
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
      async (args) =>
        handleListTodos(this.createReminderTodoContext(), {
          priority: args.priority as ('P0' | 'P1' | 'P2' | 'P3')[] | undefined,
          status: args.status as
            | ('not_started' | 'in_progress' | 'completed' | 'cancelled')[]
            | undefined,
          source: args.source as ('apple_reminders' | 'notion' | 'manual')[] | undefined,
          todayOnly: args.todayOnly as boolean | undefined,
          tags: args.tags as string[] | undefined,
        })
    );

    // update_task_status - uses extracted handler
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
      async (args) =>
        handleUpdateTaskStatus(this.createTaskToolsContext(), {
          taskId: args.taskId as string,
          status: args.status as 'not_started' | 'in_progress' | 'completed' | 'cancelled',
          source: args.source as 'apple_reminders' | 'notion' | 'manual',
          syncAcrossSources: args.syncAcrossSources as boolean | undefined,
        })
    );

    // sync_tasks - uses extracted handler
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
      async () => handleSyncTasks(this.createTaskToolsContext())
    );

    // detect_duplicates - uses extracted handler
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
      async (args) =>
        handleDetectDuplicates(this.createTaskToolsContext(), {
          autoMerge: args.autoMerge as boolean | undefined,
        })
    );

    // get_working_cadence
    this.registerTool(
      {
        name: 'get_working_cadence',
        description:
          "Get user's working rhythm including deep work days, meeting-heavy days, and scheduling recommendations.",
        inputSchema: {
          type: 'object',
          properties: {
            dayOfWeek: {
              type: 'string',
              enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
              description: 'Get info for a specific day of week',
            },
            date: {
              type: 'string',
              description: 'Get info for a specific date in ISO 8601 format (e.g., 2025-01-15)',
            },
          },
        },
      },
      async (args) => {
        // Initialize service if not already done
        if (!this.workingCadenceService) {
          this.workingCadenceService = new WorkingCadenceService();
        }

        try {
          const dayOfWeek = args.dayOfWeek as
            | 'Monday'
            | 'Tuesday'
            | 'Wednesday'
            | 'Thursday'
            | 'Friday'
            | 'Saturday'
            | 'Sunday'
            | undefined;
          const date = args.date as string | undefined;

          const result = await this.workingCadenceService.getWorkingCadence({
            dayOfWeek,
            date,
          });

          if (!result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: true,
                      message: result.error || '勤務リズム情報の取得に失敗しました。',
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
                    message: `勤務リズム情報の取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // delete_calendar_event
    this.registerTool(
      {
        name: 'delete_calendar_event',
        description: 'Delete a calendar event by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'Event ID (UUID or full ID from list_calendar_events)',
            },
            calendarName: {
              type: 'string',
              description: 'Calendar name (searches all calendars if not specified)',
            },
          },
          required: ['eventId'],
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

        if (!this.calendarEventDeleterService) {
          this.initializeServices(this.config);
        }

        try {
          const eventId = args.eventId as string;
          const calendarName = args.calendarName as string | undefined;

          const isAvailable = await this.calendarEventDeleterService!.isEventKitAvailable();

          if (!isAvailable) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message: 'カレンダーイベント削除機能はmacOSでのみ利用可能です。',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const result = await this.calendarEventDeleterService!.deleteEvent({
            eventId,
            calendarName,
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
                      calendarName: result.calendarName,
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
                    message: `カレンダーイベント削除に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // delete_calendar_events_batch
    this.registerTool(
      {
        name: 'delete_calendar_events_batch',
        description: 'Delete multiple calendar events by their IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            eventIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of event IDs to delete',
            },
            calendarName: {
              type: 'string',
              description: 'Calendar name (searches all calendars if not specified)',
            },
          },
          required: ['eventIds'],
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

        if (!this.calendarEventDeleterService) {
          this.initializeServices(this.config);
        }

        try {
          const eventIds = args.eventIds as string[];
          const calendarName = args.calendarName as string | undefined;

          const isAvailable = await this.calendarEventDeleterService!.isEventKitAvailable();

          if (!isAvailable) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message: 'カレンダーイベント削除機能はmacOSでのみ利用可能です。',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const result = await this.calendarEventDeleterService!.deleteEventsBatch({
            eventIds,
            calendarName,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: result.success,
                    totalCount: result.totalCount,
                    successCount: result.successCount,
                    failedCount: result.failedCount,
                    results: result.results.map((r) => ({
                      eventId: r.eventId,
                      success: r.success,
                      title: r.title,
                      calendarName: r.calendarName,
                      error: r.error,
                    })),
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
                    message: `カレンダーイベント一括削除に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // list_calendar_sources - uses extracted handler
    this.registerTool(
      {
        name: 'list_calendar_sources',
        description: 'List available and enabled calendar sources.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      async () => handleListCalendarSources(this.createCalendarToolsContext())
    );
  }

  /**
   * Register a tool
   */
  private registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
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
