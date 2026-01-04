/**
 * Mock Services Helpers
 *
 * Provides factory functions for creating mocked service instances
 * used in handler unit tests.
 */

import type { TodoItem, TodoFilter, UpdateResult, SyncResult, TaskConflict } from '../../src/integrations/todo-list-manager.js';
import type { DuplicateTask, SyncAllResult, MergeResult, ConflictResolution } from '../../src/integrations/task-synchronizer.js';
import type { ReminderResult, ReminderTime, ReminderRequest } from '../../src/integrations/reminder-manager.js';
import type { FindSlotsRequest } from '../../src/integrations/calendar-source-manager.js';
import type { CalendarEvent, AvailableSlot } from '../../src/integrations/calendar-service.js';
import type { CreateEventRequest, ListEventsRequest } from '../../src/integrations/google-calendar-service.js';
import type { SyncResult as CalendarSyncResult, SyncStatus } from '../../src/types/google-calendar-types.js';

/**
 * Mock TodoListManager
 */
export interface MockTodoListManager {
  listTodos: jest.Mock<Promise<TodoItem[]>, [TodoFilter?]>;
  getTodaysTasks: jest.Mock<Promise<TodoItem[]>, []>;
  updateTaskStatus: jest.Mock<Promise<UpdateResult>, [string, string, string]>;
  syncTaskAcrossSources: jest.Mock<Promise<SyncResult>, [string]>;
  filterTodos: jest.Mock<TodoItem[], [TodoItem[], TodoFilter]>;
  mergeTodosFromSources: jest.Mock<TodoItem[], [TodoItem[], TodoItem[]]>;
  formatTodoForDisplay: jest.Mock<string, [TodoItem]>;
  configureNotion: jest.Mock<void, [string]>;
}

/**
 * Create a mock TodoListManager
 */
export function createMockTodoListManager(
  overrides?: Partial<MockTodoListManager>
): MockTodoListManager {
  const defaultMock: MockTodoListManager = {
    listTodos: jest.fn().mockResolvedValue([]),
    getTodaysTasks: jest.fn().mockResolvedValue([]),
    updateTaskStatus: jest.fn().mockResolvedValue({
      success: true,
      taskId: 'test-task-id',
      updatedFields: ['status'],
      syncedSources: ['apple_reminders'],
    }),
    syncTaskAcrossSources: jest.fn().mockResolvedValue({
      success: true,
      taskId: 'test-task-id',
      syncedSources: ['apple_reminders', 'notion'],
    }),
    filterTodos: jest.fn().mockReturnValue([]),
    mergeTodosFromSources: jest.fn().mockReturnValue([]),
    formatTodoForDisplay: jest.fn().mockReturnValue('Formatted todo'),
    configureNotion: jest.fn(),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Mock TaskSynchronizer
 */
export interface MockTaskSynchronizer {
  syncAllTasks: jest.Mock<Promise<SyncAllResult>, []>;
  detectDuplicates: jest.Mock<Promise<DuplicateTask[]>, []>;
  detectDuplicatesInList: jest.Mock<DuplicateTask[], [TodoItem[]]>;
  calculateSimilarity: jest.Mock<number, [string, string]>;
  createSuggestedMerge: jest.Mock<TodoItem, [TodoItem[]]>;
  mergeDuplicates: jest.Mock<Promise<MergeResult>, [DuplicateTask[]]>;
  resolveConflicts: jest.Mock<Promise<ConflictResolution[]>, [TaskConflict[]]>;
}

/**
 * Create a mock TaskSynchronizer
 */
export function createMockTaskSynchronizer(
  overrides?: Partial<MockTaskSynchronizer>
): MockTaskSynchronizer {
  const defaultMock: MockTaskSynchronizer = {
    syncAllTasks: jest.fn().mockResolvedValue({
      totalTasks: 0,
      syncedTasks: 0,
      conflicts: [],
      errors: [],
      duration: 100,
    }),
    detectDuplicates: jest.fn().mockResolvedValue([]),
    detectDuplicatesInList: jest.fn().mockReturnValue([]),
    calculateSimilarity: jest.fn().mockReturnValue(1.0),
    createSuggestedMerge: jest.fn().mockImplementation((tasks: TodoItem[]) => tasks[0]),
    mergeDuplicates: jest.fn().mockResolvedValue({
      success: true,
      mergedTask: {} as TodoItem,
      removedTasks: [],
    }),
    resolveConflicts: jest.fn().mockResolvedValue([]),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Mock ReminderManager
 */
export interface MockReminderManager {
  setReminder: jest.Mock<Promise<ReminderResult>, [ReminderRequest]>;
  determineDestination: jest.Mock<'apple' | 'notion', [string | undefined]>;
  calculateReminderTimes: jest.Mock<ReminderTime[], [string, string[]]>;
  mapPriorityToApple: jest.Mock<'low' | 'medium' | 'high', [string | undefined]>;
}

/**
 * Create a mock ReminderManager
 */
export function createMockReminderManager(
  overrides?: Partial<MockReminderManager>
): MockReminderManager {
  const defaultMock: MockReminderManager = {
    setReminder: jest.fn().mockResolvedValue({
      success: true,
      destination: 'apple_reminders',
      method: 'applescript',
      reminderId: 'reminder-123',
    }),
    determineDestination: jest.fn().mockReturnValue('apple'),
    calculateReminderTimes: jest.fn().mockReturnValue([
      { type: '1_day_before', time: new Date().toISOString() },
    ]),
    mapPriorityToApple: jest.fn().mockReturnValue('medium'),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Mock CalendarSourceManager
 */
export interface MockCalendarSourceManager {
  detectAvailableSources: jest.Mock<Promise<{ eventkit: boolean; google: boolean }>, []>;
  enableSource: jest.Mock<Promise<void>, [string]>;
  disableSource: jest.Mock<Promise<void>, [string]>;
  getEnabledSources: jest.Mock<('eventkit' | 'google')[], []>;
  getEvents: jest.Mock<Promise<CalendarEvent[]>, [string, string, string?]>;
  createEvent: jest.Mock<Promise<CalendarEvent>, [CreateEventRequest, string?]>;
  deleteEvent: jest.Mock<Promise<void>, [string, string?]>;
  findAvailableSlots: jest.Mock<Promise<AvailableSlot[]>, [FindSlotsRequest]>;
  syncCalendars: jest.Mock<Promise<CalendarSyncResult>, []>;
  getSyncStatus: jest.Mock<Promise<SyncStatus>, []>;
  healthCheck: jest.Mock<Promise<{ eventkit: boolean; google: boolean }>, []>;
  respondToEvent: jest.Mock<
    Promise<{ success: boolean; message: string; source?: string }>,
    [string, string, string?, string?]
  >;
}

/**
 * Create a mock CalendarSourceManager
 */
export function createMockCalendarSourceManager(
  overrides?: Partial<MockCalendarSourceManager>
): MockCalendarSourceManager {
  const defaultMock: MockCalendarSourceManager = {
    detectAvailableSources: jest.fn().mockResolvedValue({
      eventkit: true,
      google: false,
    }),
    enableSource: jest.fn().mockResolvedValue(undefined),
    disableSource: jest.fn().mockResolvedValue(undefined),
    getEnabledSources: jest.fn().mockReturnValue(['eventkit']),
    getEvents: jest.fn().mockResolvedValue([]),
    createEvent: jest.fn().mockResolvedValue({
      id: 'event-123',
      title: 'Test Event',
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      isAllDay: false,
    }),
    deleteEvent: jest.fn().mockResolvedValue(undefined),
    findAvailableSlots: jest.fn().mockResolvedValue([]),
    syncCalendars: jest.fn().mockResolvedValue({
      success: true,
      eventsAdded: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      conflicts: [],
      errors: [],
      timestamp: new Date().toISOString(),
    }),
    getSyncStatus: jest.fn().mockResolvedValue({
      isEnabled: true,
      sources: {
        eventkit: { available: true },
        google: { available: false },
      },
    }),
    healthCheck: jest.fn().mockResolvedValue({
      eventkit: true,
      google: false,
    }),
    respondToEvent: jest.fn().mockResolvedValue({
      success: true,
      message: 'Response recorded',
      source: 'eventkit',
    }),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Mock NotionMCPService
 */
export interface MockNotionMCPService {
  isAvailable: jest.Mock<Promise<boolean>, []>;
  createPage: jest.Mock<
    Promise<{ success: boolean; pageId?: string; pageUrl?: string; error?: string }>,
    [{ databaseId: string; title: string; properties: Record<string, unknown> }]
  >;
  buildNotionProperties: jest.Mock<Record<string, unknown>, [Record<string, unknown>]>;
  generateFallbackTemplate: jest.Mock<string, [Record<string, unknown>]>;
}

/**
 * Create a mock NotionMCPService
 */
export function createMockNotionMCPService(
  overrides?: Partial<MockNotionMCPService>
): MockNotionMCPService {
  const defaultMock: MockNotionMCPService = {
    isAvailable: jest.fn().mockResolvedValue(true),
    createPage: jest.fn().mockResolvedValue({
      success: true,
      pageId: 'page-123',
      pageUrl: 'https://notion.so/page-123',
    }),
    buildNotionProperties: jest.fn().mockReturnValue({
      Name: { title: [{ text: { content: 'Test' } }] },
    }),
    generateFallbackTemplate: jest.fn().mockReturnValue('## Task Template\n- Title: Test'),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Mock GoogleCalendarService
 */
export interface MockGoogleCalendarService {
  authenticate: jest.Mock<Promise<void>, []>;
  isAvailable: jest.Mock<Promise<boolean>, []>;
  listEvents: jest.Mock<Promise<CalendarEvent[]>, [ListEventsRequest]>;
  createEvent: jest.Mock<Promise<CalendarEvent>, [CreateEventRequest]>;
  deleteEvent: jest.Mock<Promise<void>, [string, string?]>;
  respondToEvent: jest.Mock<Promise<void>, [string, string, string?]>;
  listCalendars: jest.Mock<
    Promise<Array<{ id: string; name: string; primary?: boolean }>>,
    []
  >;
}

/**
 * Create a mock GoogleCalendarService
 */
export function createMockGoogleCalendarService(
  overrides?: Partial<MockGoogleCalendarService>
): MockGoogleCalendarService {
  const defaultMock: MockGoogleCalendarService = {
    authenticate: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockResolvedValue(true),
    listEvents: jest.fn().mockResolvedValue([]),
    createEvent: jest.fn().mockResolvedValue({
      id: 'google-event-123',
      title: 'Test Event',
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      isAllDay: false,
    }),
    deleteEvent: jest.fn().mockResolvedValue(undefined),
    respondToEvent: jest.fn().mockResolvedValue(undefined),
    listCalendars: jest.fn().mockResolvedValue([
      { id: 'primary', name: 'Primary Calendar', primary: true },
    ]),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Sample TodoItem for testing
 */
export const SAMPLE_TODO_ITEM: TodoItem = {
  id: 'todo-123',
  title: 'Test Task',
  description: 'Test description',
  priority: 'P2',
  status: 'not_started',
  dueDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  createdDate: new Date().toISOString(),
  updatedDate: new Date().toISOString(),
  source: 'apple_reminders',
  sourceId: 'ar-123',
  tags: ['work'],
  estimatedMinutes: 30,
  stakeholders: ['Manager'],
};

/**
 * Sample CalendarEvent for testing
 */
export const SAMPLE_CALENDAR_EVENT: CalendarEvent = {
  id: 'event-123',
  title: 'Test Meeting',
  start: new Date().toISOString(),
  end: new Date(Date.now() + 3600000).toISOString(), // +1 hour
  isAllDay: false,
  source: 'eventkit',
  attendees: ['user@example.com'],
  status: 'confirmed',
};

/**
 * Sample AvailableSlot for testing
 */
export const SAMPLE_AVAILABLE_SLOT: AvailableSlot = {
  start: new Date().toISOString(),
  end: new Date(Date.now() + 3600000).toISOString(),
  durationMinutes: 60,
  suitability: 'excellent',
  reason: 'Morning slot on a deep work day',
  conflicts: [],
  dayType: 'deep-work',
  source: 'eventkit',
};
