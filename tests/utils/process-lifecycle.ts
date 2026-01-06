/**
 * Process Lifecycle Utilities
 *
 * Provides event-based CLI process startup/shutdown detection for tests.
 * Replaces fixed timeouts with output pattern matching and exit event handling.
 *
 * @example
 * ```typescript
 * import { waitForProcessOutput, gracefulStop } from './utils/index.js';
 *
 * const proc = spawn('node', ['server.js']);
 *
 * // Wait for server to be ready
 * const result = await waitForProcessOutput(proc, /started in HTTP mode/);
 * console.log(`Server ready in ${result.timeElapsed}ms`);
 *
 * // Gracefully stop the process
 * const exitResult = await gracefulStop(proc);
 * console.log(`Exit code: ${exitResult.code}`);
 * ```
 */

import { ChildProcess } from 'child_process';

/**
 * Options for waitForProcessOutput
 */
export interface WaitForOutputOptions {
  /** Maximum time to wait in ms (safety net) - default: 30000 */
  maxTimeout?: number;
  /** Stream to monitor - default: 'both' */
  stream?: 'stdout' | 'stderr' | 'both';
}

/**
 * Result from waitForProcessOutput
 */
export interface OutputMatchResult {
  /** The matched output string */
  matched: string;
  /** Full output up to match */
  fullOutput: string;
  /** Time taken to match in ms */
  timeElapsed: number;
}

/**
 * Options for waitForProcessExit and gracefulStop
 */
export interface WaitForExitOptions {
  /** Maximum time to wait in ms (safety net) - default: 10000 */
  maxTimeout?: number;
  /** Send SIGKILL if timeout exceeded - default: true */
  forceKillOnTimeout?: boolean;
}

/**
 * Result from waitForProcessExit and gracefulStop
 */
export interface ProcessExitResult {
  /** Exit code (null if killed by signal) */
  code: number | null;
  /** Signal that killed process (null if exited normally) */
  signal: string | null;
}

/**
 * Wait for process output to match a pattern.
 *
 * Monitors stdout/stderr for pattern match using EventEmitter.
 * Proceeds immediately when pattern matches, uses maxTimeout as safety net.
 *
 * @param proc - ChildProcess to monitor
 * @param pattern - RegExp or string to match
 * @param options - Configuration options
 * @returns Promise resolving when pattern matches
 * @throws Error if timeout exceeded or process exits before match
 *
 * @example
 * ```typescript
 * const result = await waitForProcessOutput(proc, /started in HTTP mode/, {
 *   maxTimeout: 10000,
 *   stream: 'stderr',
 * });
 * ```
 */
export async function waitForProcessOutput(
  proc: ChildProcess,
  pattern: RegExp | string,
  options: WaitForOutputOptions = {}
): Promise<OutputMatchResult> {
  const {
    maxTimeout = 30000,
    stream = 'both',
  } = options;

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let fullOutput = '';
    let resolved = false;

    const cleanup = () => {
      resolved = true;
      if (proc.stdout) proc.stdout.removeListener('data', onStdout);
      if (proc.stderr) proc.stderr.removeListener('data', onStderr);
      proc.removeListener('error', onError);
      proc.removeListener('close', onClose);
      clearTimeout(timeoutId);
    };

    const checkMatch = (data: string) => {
      if (resolved) return;

      fullOutput += data;
      const match = regex.exec(data);

      if (match) {
        cleanup();
        resolve({
          matched: match[0],
          fullOutput,
          timeElapsed: Date.now() - startTime,
        });
      }
    };

    const onStdout = (data: Buffer) => {
      if (stream === 'stdout' || stream === 'both') {
        checkMatch(data.toString());
      }
    };

    const onStderr = (data: Buffer) => {
      if (stream === 'stderr' || stream === 'both') {
        checkMatch(data.toString());
      }
    };

    const onError = (error: Error) => {
      if (resolved) return;
      cleanup();
      reject(new Error(`Process error before pattern match: ${error.message}`));
    };

    const onClose = (code: number | null) => {
      if (resolved) return;
      cleanup();
      reject(new Error(
        `Process exited with code ${code} before pattern match. Output: ${fullOutput.slice(0, 500)}`
      ));
    };

    const timeoutId = setTimeout(() => {
      if (resolved) return;
      cleanup();
      reject(new Error(
        `Pattern ${regex} not found in output after ${maxTimeout}ms. Captured: ${fullOutput.slice(0, 500)}`
      ));
    }, maxTimeout);

    if (proc.stdout) proc.stdout.on('data', onStdout);
    if (proc.stderr) proc.stderr.on('data', onStderr);
    proc.on('error', onError);
    proc.on('close', onClose);
  });
}

/**
 * Wait for process to exit.
 *
 * Waits for the 'close' event from the process.
 * Optionally sends SIGKILL if timeout exceeded.
 *
 * @param proc - ChildProcess to monitor
 * @param options - Configuration options
 * @returns Promise resolving when process exits
 *
 * @example
 * ```typescript
 * proc.kill('SIGINT');
 * const result = await waitForProcessExit(proc);
 * console.log(`Exit code: ${result.code}`);
 * ```
 */
export async function waitForProcessExit(
  proc: ChildProcess,
  options: WaitForExitOptions = {}
): Promise<ProcessExitResult> {
  const {
    maxTimeout = 10000,
    forceKillOnTimeout = true,
  } = options;

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      resolved = true;
      proc.removeListener('close', onClose);
      clearTimeout(timeoutId);
    };

    const onClose = (code: number | null, signal: string | null) => {
      if (resolved) return;
      cleanup();
      resolve({ code, signal: signal as string | null });
    };

    const timeoutId = setTimeout(() => {
      if (resolved) return;

      if (forceKillOnTimeout) {
        proc.kill('SIGKILL');
        // Wait a bit for SIGKILL to take effect
        setTimeout(() => {
          if (!resolved) {
            cleanup();
            resolve({ code: null, signal: 'SIGKILL' });
          }
        }, 100);
      } else {
        cleanup();
        resolve({ code: null, signal: null });
      }
    }, maxTimeout);

    proc.on('close', onClose);

    // Check if already exited
    if (proc.exitCode !== null || proc.signalCode !== null) {
      cleanup();
      resolve({
        code: proc.exitCode,
        signal: proc.signalCode as string | null,
      });
    }
  });
}

/**
 * Gracefully stop a process.
 *
 * Sends SIGINT and waits for exit. If timeout exceeded, sends SIGKILL.
 *
 * @param proc - ChildProcess to stop
 * @param options - Configuration options
 * @returns Promise resolving when process is stopped
 *
 * @example
 * ```typescript
 * const result = await gracefulStop(proc, { maxTimeout: 5000 });
 * if (result.signal === 'SIGKILL') {
 *   console.warn('Process had to be force-killed');
 * }
 * ```
 */
export async function gracefulStop(
  proc: ChildProcess,
  options: WaitForExitOptions = {}
): Promise<ProcessExitResult> {
  // Check if already exited
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return {
      code: proc.exitCode,
      signal: proc.signalCode as string | null,
    };
  }

  // Send SIGINT for graceful shutdown
  proc.kill('SIGINT');

  // Wait for exit with SIGKILL fallback
  return waitForProcessExit(proc, options);
}
