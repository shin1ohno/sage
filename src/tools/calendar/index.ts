/**
 * Calendar Tools Module
 *
 * Exports calendar-related tool handlers for reuse between
 * index.ts (stdio transport) and mcp-handler.ts (HTTP transport).
 *
 * Requirements: 3.3-3.6, 6.1-6.6, 16-19, 32
 * Requirements (platform-adaptive-integration): 2.1-2.2, 3.1, 6.2
 */

export type {
  CalendarToolsContext,
  PlatformContext,
  SamplingContext,
  ToolResponse,
  FindAvailableSlotsInput,
  ListCalendarEventsInput,
  ListCalendarResourcesInput,
  RespondToCalendarEventInput,
  RespondToCalendarEventsBatchInput,
  CreateCalendarEventInput,
  DeleteCalendarEventInput,
  DeleteCalendarEventsBatchInput,
  UpdateCalendarEventInput,
  SetCalendarSourceInput,
  GetWorkingCadenceInput,
  SearchRoomAvailabilityInput,
  CheckRoomAvailabilityInput,
  CheckPeopleAvailabilityInput,
  FindCommonAvailabilityInput,
} from './handlers.js';

export {
  handleFindAvailableSlots,
  handleListCalendarEvents,
  handleListCalendarResources,
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
  handleCheckPeopleAvailability,
  handleFindCommonAvailability,
  // Platform-adaptive integration handlers
  handleListCalendarEventsWithSampling,
} from './handlers.js';
