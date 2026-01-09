/**
 * Test Mocks Module
 *
 * Central export for all test mock data.
 * Import from this file to access all mock data for testing.
 *
 * @example
 * ```typescript
 * import {
 *   iOSClientInfo,
 *   samplingCapabilities,
 *   iosDetectedPlatform,
 *   createMockDetectedPlatform,
 * } from '../mocks';
 * ```
 */

// Client Info mocks
export {
  iOSClientInfo,
  iPadOSClientInfo,
  macOSClientInfo,
  windowsClientInfo,
  webClientInfo,
  unknownClientInfo,
} from './client-info.js';

// Capabilities mocks
export {
  samplingCapabilities,
  noSamplingCapabilities,
  fullCapabilities,
} from './client-info.js';

// Detected Platform mocks
export {
  iosDetectedPlatform,
  ipadosDetectedPlatform,
  macosDetectedPlatform,
  desktopDetectedPlatform,
  webDetectedPlatform,
  unknownDetectedPlatform,
} from './client-info.js';

// Helper functions
export {
  createMockDetectedPlatform,
  createMockClientInfo,
  createMockCapabilities,
} from './client-info.js';

// Types
export type { CreateMockDetectedPlatformOptions } from './client-info.js';

// Sampling response mocks
export {
  // Helper functions
  createMockSamplingResponse,
  createMockSamplingError,
  // Sample data
  sampleCalendarEventsData,
  sampleReminderResultData,
  sampleReminderFailedData,
  // Success response mocks
  mockSamplingCalendarResponse,
  mockSamplingReminderResponse,
  mockSamplingReminderFailedResponse,
  mockSamplingEmptyCalendarResponse,
  mockSamplingTruncatedResponse,
  mockSamplingTextResponse,
  // Error mocks
  mockUserRejectionError,
  mockMethodNotFoundError,
  mockInvalidParamsError,
  mockInternalError,
  mockNetworkError,
  // Error codes
  SamplingErrorCodes,
} from './sampling-responses.js';
