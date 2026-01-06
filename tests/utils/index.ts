/**
 * Test Utilities
 *
 * Event-based utilities for server and process lifecycle management in tests.
 * Replaces fixed timeouts with responsive event detection.
 */

export {
  waitForServerReady,
  waitForServerStopped,
  type WaitForServerReadyOptions,
  type ServerReadyResult,
} from './server-ready.js';

export {
  waitForProcessOutput,
  waitForProcessExit,
  gracefulStop,
  type WaitForOutputOptions,
  type OutputMatchResult,
  type WaitForExitOptions,
  type ProcessExitResult,
} from './process-lifecycle.js';
