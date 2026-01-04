/**
 * Reminder & Todo Tools Module
 *
 * Exports reminder and todo-related tool handlers for reuse between
 * index.ts (stdio transport) and mcp-handler.ts (HTTP transport).
 *
 * Requirements: 5.1-5.6, 12.1-12.8
 */

export type {
  ReminderTodoContext,
  SetReminderInput,
  ListTodosInput,
} from './handlers.js';

export { handleSetReminder, handleListTodos } from './handlers.js';
