/**
 * Calendar Tools Module
 *
 * Exports calendar-related tool handlers for reuse between
 * index.ts (stdio transport) and mcp-handler.ts (HTTP transport).
 *
 * Requirements: 3.3-3.6, 6.1-6.6, 16-19, 32
 */

export type {
  CalendarToolsContext,
  FindAvailableSlotsInput,
  ListCalendarEventsInput,
  RespondToCalendarEventInput,
  RespondToCalendarEventsBatchInput,
  CreateCalendarEventInput,
  DeleteCalendarEventInput,
  DeleteCalendarEventsBatchInput,
  SetCalendarSourceInput,
  GetWorkingCadenceInput,
} from './handlers.js';

export {
  handleFindAvailableSlots,
  handleListCalendarEvents,
  handleRespondToCalendarEvent,
  handleRespondToCalendarEventsBatch,
  handleCreateCalendarEvent,
  handleDeleteCalendarEvent,
  handleDeleteCalendarEventsBatch,
  handleListCalendarSources,
  handleGetWorkingCadence,
} from './handlers.js';
