/**
 * Mock Contexts Helpers
 *
 * Provides factory functions for creating mocked Context instances
 * used in handler unit tests. Each context type provides getters/setters
 * for services that can be easily mocked.
 */

import type { UserConfig } from '../../src/types/index.js';
import type { SetupContext, WizardSession } from '../../src/tools/setup/handlers.js';
import type { TaskToolsContext } from '../../src/tools/tasks/handlers.js';
import type { CalendarToolsContext } from '../../src/tools/calendar/handlers.js';
import type { ReminderTodoContext } from '../../src/tools/reminders/handlers.js';
import type { IntegrationToolsContext } from '../../src/tools/integrations/handlers.js';
import type { DirectoryToolsContext } from '../../src/tools/directory/handlers.js';
import type { TodoListManager } from '../../src/integrations/todo-list-manager.js';
import type { TaskSynchronizer } from '../../src/integrations/task-synchronizer.js';
import type { ReminderManager } from '../../src/integrations/reminder-manager.js';
import type { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import type { CalendarEventResponseService } from '../../src/integrations/calendar-event-response.js';
import type { GoogleCalendarService } from '../../src/integrations/google-calendar-service.js';
import type { GooglePeopleService } from '../../src/integrations/google-people-service.js';
import type { WorkingCadenceService } from '../../src/services/working-cadence.js';
import type { NotionMCPService } from '../../src/integrations/notion-mcp.js';
import { DEFAULT_TEST_CONFIG } from './mock-config.js';

/**
 * Mock SetupContext with configurable state
 */
export interface MockSetupContext extends SetupContext {
  config: UserConfig | null;
  wizardSession: WizardSession | null;
}

/**
 * Create a mock SetupContext
 *
 * @param overrides - Optional overrides for context methods and state
 * @returns Mocked SetupContext
 *
 * @example
 * ```typescript
 * const ctx = createMockSetupContext({
 *   config: null, // Simulate unconfigured state
 * });
 * const result = await handleCheckSetupStatus(ctx);
 * ```
 */
export function createMockSetupContext(
  overrides?: Partial<{
    config: UserConfig | null;
    wizardSession: WizardSession | null;
    getConfig: () => UserConfig | null;
    setConfig: (config: UserConfig) => void;
    getWizardSession: () => WizardSession | null;
    setWizardSession: (session: WizardSession | null) => void;
    initializeServices: (config: UserConfig) => void;
  }>
): MockSetupContext {
  const state = {
    config: overrides?.config !== undefined ? overrides.config : DEFAULT_TEST_CONFIG,
    wizardSession: overrides?.wizardSession ?? null,
  };

  return {
    config: state.config,
    wizardSession: state.wizardSession,
    getConfig: overrides?.getConfig ?? jest.fn(() => state.config),
    setConfig: overrides?.setConfig ?? jest.fn((config: UserConfig) => {
      state.config = config;
    }),
    getWizardSession: overrides?.getWizardSession ?? jest.fn(() => state.wizardSession),
    setWizardSession: overrides?.setWizardSession ?? jest.fn((session: WizardSession | null) => {
      state.wizardSession = session;
    }),
    initializeServices: overrides?.initializeServices ?? jest.fn(),
  };
}

/**
 * Mock TaskToolsContext with configurable state
 */
export interface MockTaskToolsContext extends TaskToolsContext {
  config: UserConfig | null;
  todoListManager: TodoListManager | null;
  taskSynchronizer: TaskSynchronizer | null;
}

/**
 * Create a mock TaskToolsContext
 *
 * @param overrides - Optional overrides for context methods and services
 * @returns Mocked TaskToolsContext
 *
 * @example
 * ```typescript
 * const mockTodoManager = createMockTodoListManager();
 * const ctx = createMockTaskToolsContext({
 *   todoListManager: mockTodoManager as unknown as TodoListManager,
 * });
 * const result = await handleUpdateTaskStatus(ctx, { taskId: '123', status: 'completed', source: 'manual' });
 * ```
 */
export function createMockTaskToolsContext(
  overrides?: Partial<{
    config: UserConfig | null;
    todoListManager: TodoListManager | null;
    taskSynchronizer: TaskSynchronizer | null;
    getConfig: () => UserConfig | null;
    getTodoListManager: () => TodoListManager | null;
    getTaskSynchronizer: () => TaskSynchronizer | null;
    initializeServices: (config: UserConfig) => void;
  }>
): MockTaskToolsContext {
  const state = {
    config: overrides?.config !== undefined ? overrides.config : DEFAULT_TEST_CONFIG,
    todoListManager: overrides?.todoListManager ?? null,
    taskSynchronizer: overrides?.taskSynchronizer ?? null,
  };

  return {
    config: state.config,
    todoListManager: state.todoListManager,
    taskSynchronizer: state.taskSynchronizer,
    getConfig: overrides?.getConfig ?? jest.fn(() => state.config),
    getTodoListManager: overrides?.getTodoListManager ?? jest.fn(() => state.todoListManager),
    getTaskSynchronizer: overrides?.getTaskSynchronizer ?? jest.fn(() => state.taskSynchronizer),
    initializeServices: overrides?.initializeServices ?? jest.fn(),
  };
}

/**
 * Mock CalendarToolsContext with configurable state
 */
export interface MockCalendarToolsContext extends CalendarToolsContext {
  config: UserConfig | null;
  calendarSourceManager: CalendarSourceManager | null;
  calendarEventResponseService: CalendarEventResponseService | null;
  googleCalendarService: GoogleCalendarService | null;
  workingCadenceService: WorkingCadenceService | null;
}

/**
 * Create a mock CalendarToolsContext
 *
 * @param overrides - Optional overrides for context methods and services
 * @returns Mocked CalendarToolsContext
 *
 * @example
 * ```typescript
 * const mockCalendarManager = createMockCalendarSourceManager();
 * const ctx = createMockCalendarToolsContext({
 *   calendarSourceManager: mockCalendarManager as unknown as CalendarSourceManager,
 * });
 * const result = await handleFindAvailableSlots(ctx, { durationMinutes: 60 });
 * ```
 */
export function createMockCalendarToolsContext(
  overrides?: Partial<{
    config: UserConfig | null;
    calendarSourceManager: CalendarSourceManager | null;
    calendarEventResponseService: CalendarEventResponseService | null;
    googleCalendarService: GoogleCalendarService | null;
    workingCadenceService: WorkingCadenceService | null;
    getConfig: () => UserConfig | null;
    getCalendarSourceManager: () => CalendarSourceManager | null;
    getCalendarEventResponseService: () => CalendarEventResponseService | null;
    getGoogleCalendarService: () => GoogleCalendarService | null;
    getWorkingCadenceService: () => WorkingCadenceService | null;
    setWorkingCadenceService: (service: WorkingCadenceService) => void;
    initializeServices: (config: UserConfig) => void;
  }>
): MockCalendarToolsContext {
  const state = {
    config: overrides?.config !== undefined ? overrides.config : DEFAULT_TEST_CONFIG,
    calendarSourceManager: overrides?.calendarSourceManager ?? null,
    calendarEventResponseService: overrides?.calendarEventResponseService ?? null,
    googleCalendarService: overrides?.googleCalendarService ?? null,
    workingCadenceService: overrides?.workingCadenceService ?? null,
  };

  return {
    config: state.config,
    calendarSourceManager: state.calendarSourceManager,
    calendarEventResponseService: state.calendarEventResponseService,
    googleCalendarService: state.googleCalendarService,
    workingCadenceService: state.workingCadenceService,
    getConfig: overrides?.getConfig ?? jest.fn(() => state.config),
    getCalendarSourceManager:
      overrides?.getCalendarSourceManager ?? jest.fn(() => state.calendarSourceManager),
    getCalendarEventResponseService:
      overrides?.getCalendarEventResponseService ??
      jest.fn(() => state.calendarEventResponseService),
    getGoogleCalendarService:
      overrides?.getGoogleCalendarService ?? jest.fn(() => state.googleCalendarService),
    getWorkingCadenceService:
      overrides?.getWorkingCadenceService ?? jest.fn(() => state.workingCadenceService),
    setWorkingCadenceService:
      overrides?.setWorkingCadenceService ??
      jest.fn((service: WorkingCadenceService) => {
        state.workingCadenceService = service;
      }),
    initializeServices: overrides?.initializeServices ?? jest.fn(),
  };
}

/**
 * Mock ReminderTodoContext with configurable state
 */
export interface MockReminderTodoContext extends ReminderTodoContext {
  config: UserConfig | null;
  reminderManager: ReminderManager | null;
  todoListManager: TodoListManager | null;
}

/**
 * Create a mock ReminderTodoContext
 *
 * @param overrides - Optional overrides for context methods and services
 * @returns Mocked ReminderTodoContext
 *
 * @example
 * ```typescript
 * const mockReminder = createMockReminderManager();
 * const ctx = createMockReminderTodoContext({
 *   reminderManager: mockReminder as unknown as ReminderManager,
 * });
 * const result = await handleSetReminder(ctx, { taskTitle: 'Test Task' });
 * ```
 */
export function createMockReminderTodoContext(
  overrides?: Partial<{
    config: UserConfig | null;
    reminderManager: ReminderManager | null;
    todoListManager: TodoListManager | null;
    getConfig: () => UserConfig | null;
    getReminderManager: () => ReminderManager | null;
    getTodoListManager: () => TodoListManager | null;
    initializeServices: (config: UserConfig) => void;
  }>
): MockReminderTodoContext {
  const state = {
    config: overrides?.config !== undefined ? overrides.config : DEFAULT_TEST_CONFIG,
    reminderManager: overrides?.reminderManager ?? null,
    todoListManager: overrides?.todoListManager ?? null,
  };

  return {
    config: state.config,
    reminderManager: state.reminderManager,
    todoListManager: state.todoListManager,
    getConfig: overrides?.getConfig ?? jest.fn(() => state.config),
    getReminderManager: overrides?.getReminderManager ?? jest.fn(() => state.reminderManager),
    getTodoListManager: overrides?.getTodoListManager ?? jest.fn(() => state.todoListManager),
    initializeServices: overrides?.initializeServices ?? jest.fn(),
  };
}

/**
 * Mock IntegrationToolsContext with configurable state
 */
export interface MockIntegrationToolsContext extends IntegrationToolsContext {
  config: UserConfig | null;
  notionService: NotionMCPService | null;
}

/**
 * Create a mock IntegrationToolsContext
 *
 * @param overrides - Optional overrides for context methods and services
 * @returns Mocked IntegrationToolsContext
 *
 * @example
 * ```typescript
 * const mockNotion = createMockNotionMCPService();
 * const ctx = createMockIntegrationToolsContext({
 *   notionService: mockNotion as unknown as NotionMCPService,
 *   config: NOTION_ENABLED_CONFIG,
 * });
 * const result = await handleSyncToNotion(ctx, { taskTitle: 'Test' });
 * ```
 */
export function createMockIntegrationToolsContext(
  overrides?: Partial<{
    config: UserConfig | null;
    notionService: NotionMCPService | null;
    getConfig: () => UserConfig | null;
    setConfig: (config: UserConfig) => void;
    getNotionService: () => NotionMCPService | null;
    initializeServices: (config: UserConfig) => void;
  }>
): MockIntegrationToolsContext {
  const state = {
    config: overrides?.config !== undefined ? overrides.config : DEFAULT_TEST_CONFIG,
    notionService: overrides?.notionService ?? null,
  };

  return {
    config: state.config,
    notionService: state.notionService,
    getConfig: overrides?.getConfig ?? jest.fn(() => state.config),
    setConfig: overrides?.setConfig ?? jest.fn((config: UserConfig) => {
      state.config = config;
    }),
    getNotionService: overrides?.getNotionService ?? jest.fn(() => state.notionService),
    initializeServices: overrides?.initializeServices ?? jest.fn(),
  };
}

/**
 * Mock DirectoryToolsContext with configurable state
 */
export interface MockDirectoryToolsContext extends DirectoryToolsContext {
  config: UserConfig | null;
  googlePeopleService: GooglePeopleService | null;
}

/**
 * Create a mock DirectoryToolsContext
 *
 * @param overrides - Optional overrides for context methods and services
 * @returns Mocked DirectoryToolsContext
 *
 * @example
 * ```typescript
 * const mockPeopleService = createMockGooglePeopleService();
 * const ctx = createMockDirectoryToolsContext({
 *   googlePeopleService: mockPeopleService as unknown as GooglePeopleService,
 * });
 * const result = await handleSearchDirectoryPeople(ctx, { query: '田中' });
 * ```
 */
export function createMockDirectoryToolsContext(
  overrides?: Partial<{
    config: UserConfig | null;
    googlePeopleService: GooglePeopleService | null;
    getConfig: () => UserConfig | null;
    getGooglePeopleService: () => GooglePeopleService | null;
  }>
): MockDirectoryToolsContext {
  const state = {
    config: overrides?.config !== undefined ? overrides.config : DEFAULT_TEST_CONFIG,
    googlePeopleService: overrides?.googlePeopleService ?? null,
  };

  return {
    config: state.config,
    googlePeopleService: state.googlePeopleService,
    getConfig: overrides?.getConfig ?? jest.fn(() => state.config),
    getGooglePeopleService:
      overrides?.getGooglePeopleService ?? jest.fn(() => state.googlePeopleService),
  };
}
