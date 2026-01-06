/**
 * Server Ready Utilities
 *
 * Provides event-based server startup/shutdown detection for tests.
 * Replaces fixed timeouts with health endpoint polling.
 *
 * @example
 * ```typescript
 * import { waitForServerReady, waitForServerStopped } from './utils/index.js';
 *
 * // Wait for server to be ready
 * const result = await waitForServerReady('http://127.0.0.1:3000/health');
 * console.log(`Server ready in ${result.responseTime}ms`);
 *
 * // Wait for server to stop
 * await waitForServerStopped('http://127.0.0.1:3000/health');
 * ```
 */

/**
 * Options for waitForServerReady and waitForServerStopped
 */
export interface WaitForServerReadyOptions {
  /** Maximum time to wait in ms (safety net) - default: 30000 */
  maxTimeout?: number;
  /** Polling interval in ms - default: 50 */
  pollInterval?: number;
  /** Expected HTTP status code - default: 200 */
  expectedStatus?: number;
}

/**
 * Result from waitForServerReady
 */
export interface ServerReadyResult {
  /** Time taken to become ready in ms */
  responseTime: number;
  /** HTTP status code received */
  statusCode: number;
}

/**
 * Wait for server to be ready by polling health endpoint.
 *
 * Polls the given URL until it returns the expected status code.
 * Proceeds immediately when server is ready, uses maxTimeout as safety net.
 *
 * @param url - URL to poll (e.g., http://127.0.0.1:3000/health)
 * @param options - Configuration options
 * @returns Promise resolving when server is ready
 * @throws Error if timeout exceeded
 *
 * @example
 * ```typescript
 * const result = await waitForServerReady('http://127.0.0.1:3000/health', {
 *   maxTimeout: 10000,
 *   pollInterval: 100,
 * });
 * ```
 */
export async function waitForServerReady(
  url: string,
  options: WaitForServerReadyOptions = {}
): Promise<ServerReadyResult> {
  const {
    maxTimeout = 30000,
    pollInterval = 50,
    expectedStatus = 200,
  } = options;

  const startTime = Date.now();
  const deadline = startTime + maxTimeout;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === expectedStatus) {
        return {
          responseTime: Date.now() - startTime,
          statusCode: response.status,
        };
      }
    } catch {
      // Connection refused or other error - server not ready yet
    }

    // Wait before next poll
    const remainingTime = deadline - Date.now();
    if (remainingTime > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollInterval, remainingTime))
      );
    }
  }

  throw new Error(
    `Server not ready at ${url} after ${maxTimeout}ms`
  );
}

/**
 * Wait for server to stop accepting connections.
 *
 * Polls the given URL until connection is refused.
 * Proceeds immediately when server is stopped, uses maxTimeout as safety net.
 *
 * @param url - URL to check
 * @param options - Configuration options
 * @returns Promise resolving when server is stopped
 * @throws Error if timeout exceeded (server still running)
 *
 * @example
 * ```typescript
 * await server.stop();
 * await waitForServerStopped('http://127.0.0.1:3000/health');
 * // Port is now available for reuse
 * ```
 */
export async function waitForServerStopped(
  url: string,
  options: WaitForServerReadyOptions = {}
): Promise<void> {
  const {
    maxTimeout = 30000,
    pollInterval = 50,
  } = options;

  const startTime = Date.now();
  const deadline = startTime + maxTimeout;

  while (Date.now() < deadline) {
    try {
      await fetch(url);
      // Server still responding - wait and try again
    } catch {
      // Connection refused - server is stopped
      return;
    }

    // Wait before next poll
    const remainingTime = deadline - Date.now();
    if (remainingTime > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollInterval, remainingTime))
      );
    }
  }

  throw new Error(
    `Server still running at ${url} after ${maxTimeout}ms`
  );
}
