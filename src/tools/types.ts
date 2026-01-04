/**
 * Tool Types
 *
 * Common type definitions for MCP tool handlers.
 * These types provide documentation and organization
 * for tool implementations.
 */

/**
 * MCP Tool Response content item
 */
export interface ToolResponseContent {
  type: 'text';
  text: string;
}

/**
 * MCP Tool Response
 *
 * Standard response format for all MCP tools.
 */
export interface ToolResponse {
  content: ToolResponseContent[];
}

/**
 * Tool category for organization
 */
export type ToolCategory =
  | 'setup'
  | 'config'
  | 'tasks'
  | 'calendar'
  | 'reminders'
  | 'todos'
  | 'integrations';

/**
 * Tool metadata for documentation
 */
export interface ToolMetadata {
  /** Tool category */
  category: ToolCategory;
  /** Requirement IDs this tool implements */
  requirements?: string[];
  /** Related tools */
  relatedTools?: string[];
}

/**
 * Service dependencies that tools may need
 *
 * Tools receive these services to avoid global state.
 */
export interface ToolServices {
  config: import('../types/index.js').UserConfig | null;
  reminderManager: import('../integrations/reminder-manager.js').ReminderManager | null;
  calendarService: import('../integrations/calendar-service.js').CalendarService | null;
  calendarSourceManager: import('../integrations/calendar-source-manager.js').CalendarSourceManager | null;
  notionService: import('../integrations/notion-mcp.js').NotionMCPService | null;
  todoListManager: import('../integrations/todo-list-manager.js').TodoListManager | null;
  taskSynchronizer: import('../integrations/task-synchronizer.js').TaskSynchronizer | null;
  calendarEventResponseService: import('../integrations/calendar-event-response.js').CalendarEventResponseService | null;
  workingCadenceService: import('../services/working-cadence.js').WorkingCadenceService | null;
}
