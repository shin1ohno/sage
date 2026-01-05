/**
 * File Mutex for Serializing File Operations
 * Requirements: FR-1 (File Write Serialization), FR-2 (Per-File Mutex)
 *
 * Provides per-file mutex to prevent race conditions during concurrent
 * encrypted file operations. Uses Promise queue pattern for serialization.
 */

import { resolve } from 'path';

/**
 * Metrics for monitoring mutex performance
 */
export interface FileMutexMetrics {
  activeFiles: number; // Number of files with active locks
  totalWaitTimeMs: number; // Cumulative wait time across all operations
  longestWaitMs: number; // Longest single wait time
  queueDepthWarnings: number; // Count of queue depth warnings
}

/**
 * Internal state for each file's mutex
 */
interface MutexState {
  queue: Array<{
    resolve: () => void;
    queuedAt: number;
  }>;
  isLocked: boolean;
}

/**
 * File Mutex Class
 *
 * Provides per-file locking mechanism to serialize file operations.
 * Each file path gets its own independent mutex, allowing parallel
 * operations on different files while serializing operations on the same file.
 */
export class FileMutex {
  private locks: Map<string, MutexState> = new Map();
  private metrics: FileMutexMetrics = {
    activeFiles: 0,
    totalWaitTimeMs: 0,
    longestWaitMs: 0,
    queueDepthWarnings: 0,
  };

  // Thresholds for warnings
  private static readonly QUEUE_DEPTH_WARNING_THRESHOLD = 10;
  private static readonly WAIT_TIME_WARNING_THRESHOLD_MS = 5000;
  private static readonly WAIT_TIME_DEBUG_THRESHOLD_MS = 100;

  /**
   * Execute an operation with exclusive lock on the specified file
   *
   * @param filePath - Path to the file to lock
   * @param operation - Async operation to execute while holding the lock
   * @returns Result of the operation
   */
  async withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const normalizedPath = this.normalizePath(filePath);

    // Get or create mutex state for this file
    if (!this.locks.has(normalizedPath)) {
      this.locks.set(normalizedPath, { queue: [], isLocked: false });
      this.metrics.activeFiles++;
    }

    const state = this.locks.get(normalizedPath)!;

    // Wait if locked
    if (state.isLocked) {
      const queuedAt = Date.now();
      await new Promise<void>((resolvePromise) => {
        state.queue.push({ resolve: resolvePromise, queuedAt });
        this.checkQueueWarnings(normalizedPath, state);
      });
    }

    // Acquire lock
    state.isLocked = true;

    try {
      return await operation();
    } finally {
      // Release lock and notify next in queue
      if (state.queue.length > 0) {
        const next = state.queue.shift()!;
        const waitTime = Date.now() - next.queuedAt;
        this.recordWaitTime(waitTime, normalizedPath);
        next.resolve();
      } else {
        state.isLocked = false;
        // Clean up empty mutex state
        this.locks.delete(normalizedPath);
        this.metrics.activeFiles = Math.max(0, this.metrics.activeFiles - 1);
      }
    }
  }

  /**
   * Normalize file path for consistent lock identification
   */
  private normalizePath(filePath: string): string {
    return resolve(filePath);
  }

  /**
   * Check and warn if queue depth exceeds threshold
   */
  private checkQueueWarnings(filePath: string, state: MutexState): void {
    if (state.queue.length >= FileMutex.QUEUE_DEPTH_WARNING_THRESHOLD) {
      this.metrics.queueDepthWarnings++;
      console.warn(
        `[OAuth] High mutex contention on ${filePath}: ${state.queue.length} queued operations`
      );
    }
  }

  /**
   * Record wait time and log if exceeds thresholds
   */
  private recordWaitTime(waitTimeMs: number, filePath: string): void {
    this.metrics.totalWaitTimeMs += waitTimeMs;

    if (waitTimeMs > this.metrics.longestWaitMs) {
      this.metrics.longestWaitMs = waitTimeMs;
    }

    // Log warnings for long wait times
    if (waitTimeMs >= FileMutex.WAIT_TIME_WARNING_THRESHOLD_MS) {
      console.warn(`[OAuth] Long mutex wait on ${filePath}: ${waitTimeMs}ms`);
    } else if (waitTimeMs >= FileMutex.WAIT_TIME_DEBUG_THRESHOLD_MS) {
      console.log(`[OAuth] Mutex wait on ${filePath}: ${waitTimeMs}ms`);
    }
  }

  /**
   * Get metrics for monitoring/debugging
   */
  getMetrics(): FileMutexMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if there are pending operations for any file
   */
  hasPendingOperations(): boolean {
    for (const state of this.locks.values()) {
      if (state.isLocked || state.queue.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Wait for all pending operations to complete
   *
   * Used for graceful shutdown to ensure all queued operations finish.
   */
  async waitForPending(): Promise<void> {
    // Keep checking until no more pending operations
    while (this.hasPendingOperations()) {
      // Wait a short time before checking again
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Reset metrics (primarily for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      activeFiles: this.locks.size,
      totalWaitTimeMs: 0,
      longestWaitMs: 0,
      queueDepthWarnings: 0,
    };
  }
}
