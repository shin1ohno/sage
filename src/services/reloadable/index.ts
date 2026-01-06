/**
 * Reloadable Service Adapters
 *
 * Barrel export for all reloadable service adapters and factory function.
 */

// Adapter exports
export {
  CalendarSourceManagerAdapter,
  CalendarSourceManagerFactory,
  createCalendarSourceManager,
} from './calendar-source-manager-adapter.js';

export {
  ReminderManagerAdapter,
  ReminderManagerFactory,
  createReminderManager,
} from './reminder-manager-adapter.js';

export {
  WorkingCadenceAdapter,
  WorkingCadenceServiceFactory,
  createWorkingCadenceService,
} from './working-cadence-adapter.js';

export {
  NotionServiceAdapter,
  NotionMCPServiceFactory,
  createNotionMCPService,
} from './notion-service-adapter.js';

export {
  TodoListManagerAdapter,
  TodoListManagerFactory,
  createTodoListManager,
} from './todo-list-manager-adapter.js';

export {
  PriorityEngineAdapter,
  PriorityEngineWrapper,
  PriorityEngineFactory,
  createPriorityEngine,
} from './priority-engine-adapter.js';

// Re-export types
import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';

import { CalendarSourceManagerAdapter, createCalendarSourceManager } from './calendar-source-manager-adapter.js';
import { ReminderManagerAdapter, createReminderManager } from './reminder-manager-adapter.js';
import { WorkingCadenceAdapter, createWorkingCadenceService } from './working-cadence-adapter.js';
import { NotionServiceAdapter, createNotionMCPService } from './notion-service-adapter.js';
import { TodoListManagerAdapter, createTodoListManager } from './todo-list-manager-adapter.js';
import { PriorityEngineAdapter, createPriorityEngine } from './priority-engine-adapter.js';

/**
 * Service instances holder for factory function
 */
export interface ServiceInstances {
  calendarSourceManager?: CalendarSourceManagerAdapter;
  reminderManager?: ReminderManagerAdapter;
  workingCadence?: WorkingCadenceAdapter;
  notionService?: NotionServiceAdapter;
  todoListManager?: TodoListManagerAdapter;
  priorityEngine?: PriorityEngineAdapter;
}

/**
 * Create all reloadable service adapters
 *
 * Factory function that creates all service adapters with their default factories.
 * Optionally accepts existing service instances to wrap.
 *
 * @param config - User configuration to initialize services with
 * @param existingServices - Optional existing service instances to wrap
 * @returns Array of all reloadable service adapters
 */
export function createAllReloadableAdapters(
  config: UserConfig,
  existingServices?: ServiceInstances
): ReloadableService[] {
  const adapters: ReloadableService[] = [];

  // CalendarSourceManager adapter
  const calendarAdapter = existingServices?.calendarSourceManager
    ?? new CalendarSourceManagerAdapter(createCalendarSourceManager);
  if (!existingServices?.calendarSourceManager) {
    // Initialize with config if not using existing
    calendarAdapter.reinitialize(config);
  }
  adapters.push(calendarAdapter);

  // ReminderManager adapter
  const reminderAdapter = existingServices?.reminderManager
    ?? new ReminderManagerAdapter(createReminderManager);
  if (!existingServices?.reminderManager) {
    reminderAdapter.reinitialize(config);
  }
  adapters.push(reminderAdapter);

  // WorkingCadenceService adapter
  // Note: Gets CalendarSourceManager after it's initialized
  const workingCadenceAdapter = existingServices?.workingCadence
    ?? new WorkingCadenceAdapter(createWorkingCadenceService);
  if (!existingServices?.workingCadence) {
    // Set CalendarSourceManager dependency if available
    const calendarInstance = (calendarAdapter as CalendarSourceManagerAdapter).getInstance();
    if (calendarInstance) {
      (workingCadenceAdapter as WorkingCadenceAdapter).setCalendarSourceManager(calendarInstance);
    }
    workingCadenceAdapter.reinitialize(config);
  }
  adapters.push(workingCadenceAdapter);

  // NotionMCPService adapter
  const notionAdapter = existingServices?.notionService
    ?? new NotionServiceAdapter(createNotionMCPService);
  if (!existingServices?.notionService) {
    notionAdapter.reinitialize(config);
  }
  adapters.push(notionAdapter);

  // TodoListManager adapter
  const todoAdapter = existingServices?.todoListManager
    ?? new TodoListManagerAdapter(createTodoListManager);
  if (!existingServices?.todoListManager) {
    todoAdapter.reinitialize(config);
  }
  adapters.push(todoAdapter);

  // PriorityEngine adapter
  const priorityAdapter = existingServices?.priorityEngine
    ?? new PriorityEngineAdapter(createPriorityEngine);
  if (!existingServices?.priorityEngine) {
    priorityAdapter.reinitialize(config);
  }
  adapters.push(priorityAdapter);

  return adapters;
}

/**
 * Get adapter by name from array
 */
export function getAdapterByName<T extends ReloadableService>(
  adapters: ReloadableService[],
  name: string
): T | undefined {
  return adapters.find((a) => a.name === name) as T | undefined;
}
