/**
 * Test Helpers Module
 *
 * Central export for all test helper functions and mock factories.
 * Import from this file to access all testing utilities.
 *
 * @example
 * ```typescript
 * import {
 *   DEFAULT_TEST_CONFIG,
 *   createTestConfig,
 *   createMockSetupContext,
 *   createMockTodoListManager,
 *   SAMPLE_TODO_ITEM,
 * } from '../../helpers';
 * ```
 */

// Mock configuration helpers
export {
  DEFAULT_TEST_CONFIG,
  NOTION_ENABLED_CONFIG,
  MINIMAL_TEST_CONFIG,
  createTestConfig,
} from './mock-config.js';

// Mock service factories
export {
  createMockTodoListManager,
  createMockTaskSynchronizer,
  createMockReminderManager,
  createMockCalendarSourceManager,
  createMockNotionMCPService,
  createMockGoogleCalendarService,
  SAMPLE_TODO_ITEM,
  SAMPLE_CALENDAR_EVENT,
  SAMPLE_AVAILABLE_SLOT,
} from './mock-services.js';

// Mock service types
export type {
  MockTodoListManager,
  MockTaskSynchronizer,
  MockReminderManager,
  MockCalendarSourceManager,
  MockNotionMCPService,
  MockGoogleCalendarService,
} from './mock-services.js';

// Mock context factories
export {
  createMockSetupContext,
  createMockTaskToolsContext,
  createMockCalendarToolsContext,
  createMockReminderTodoContext,
  createMockIntegrationToolsContext,
} from './mock-contexts.js';

// Mock context types
export type {
  MockSetupContext,
  MockTaskToolsContext,
  MockCalendarToolsContext,
  MockReminderTodoContext,
  MockIntegrationToolsContext,
} from './mock-contexts.js';
