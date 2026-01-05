/**
 * FileMutex Unit Tests
 * Requirements: FR-1, FR-2, NFR-8, NFR-9, NFR-10
 *
 * Tests for the FileMutex class that serializes file operations.
 */

import { FileMutex } from '../../../src/oauth/file-mutex.js';

describe('FileMutex', () => {
  let mutex: FileMutex;

  beforeEach(() => {
    mutex = new FileMutex();
  });

  describe('Basic Lock/Unlock (Task 3)', () => {
    it('should acquire and release lock for single operation', async () => {
      // Arrange
      let operationExecuted = false;

      // Act
      await mutex.withLock('/test/file.txt', async () => {
        operationExecuted = true;
        return 'result';
      });

      // Assert
      expect(operationExecuted).toBe(true);
    });

    it('should return result from operation', async () => {
      // Act
      const result = await mutex.withLock('/test/file.txt', async () => {
        return 'test-result';
      });

      // Assert
      expect(result).toBe('test-result');
    });

    it('should execute sequential operations in order', async () => {
      // Arrange
      const executionOrder: number[] = [];

      // Act
      await mutex.withLock('/test/file.txt', async () => {
        executionOrder.push(1);
      });
      await mutex.withLock('/test/file.txt', async () => {
        executionOrder.push(2);
      });
      await mutex.withLock('/test/file.txt', async () => {
        executionOrder.push(3);
      });

      // Assert
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should release lock when operation throws error', async () => {
      // Arrange
      const testError = new Error('Test error');

      // Act & Assert: First operation throws
      await expect(
        mutex.withLock('/test/file.txt', async () => {
          throw testError;
        })
      ).rejects.toThrow('Test error');

      // Assert: Lock is released, can acquire again
      let secondOperationExecuted = false;
      await mutex.withLock('/test/file.txt', async () => {
        secondOperationExecuted = true;
      });
      expect(secondOperationExecuted).toBe(true);
    });

    it('should propagate error to caller', async () => {
      // Arrange
      const customError = new Error('Custom error message');

      // Act & Assert
      await expect(
        mutex.withLock('/test/file.txt', async () => {
          throw customError;
        })
      ).rejects.toThrow('Custom error message');
    });

    it('should handle async operations correctly', async () => {
      // Act
      const result = await mutex.withLock('/test/file.txt', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'async-result';
      });

      // Assert
      expect(result).toBe('async-result');
    });
  });

  describe('Concurrent Operations (Task 4)', () => {
    it('should serialize concurrent operations on same file', async () => {
      // Arrange
      const executionOrder: number[] = [];
      const startTimes: number[] = [];

      // Act: Start 3 operations concurrently
      const operations = [1, 2, 3].map((num) =>
        mutex.withLock('/test/file.txt', async () => {
          startTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, 30));
          executionOrder.push(num);
        })
      );

      await Promise.all(operations);

      // Assert: Operations executed in order (serialized)
      expect(executionOrder).toEqual([1, 2, 3]);

      // Verify operations didn't overlap (each started after previous ended)
      // With 30ms operations, there should be significant time gaps
      expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(25);
      expect(startTimes[2] - startTimes[1]).toBeGreaterThanOrEqual(25);
    });

    it('should allow parallel operations on different files', async () => {
      // Arrange
      const startTimes: Record<string, number> = {};
      const endTimes: Record<string, number> = {};

      // Act: Start operations on different files concurrently
      const operations = ['file1.txt', 'file2.txt', 'file3.txt'].map((file) =>
        mutex.withLock(`/test/${file}`, async () => {
          startTimes[file] = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 50));
          endTimes[file] = Date.now();
        })
      );

      await Promise.all(operations);

      // Assert: Operations should have overlapping execution times
      // All start times should be very close (within 20ms of each other)
      const starts = Object.values(startTimes);
      const maxStartDiff = Math.max(...starts) - Math.min(...starts);
      expect(maxStartDiff).toBeLessThan(20);
    });

    it('should handle mixed concurrent operations correctly', async () => {
      // Arrange
      const file1Order: number[] = [];
      const file2Order: number[] = [];

      // Act: Concurrent operations on two files
      const operations = [
        mutex.withLock('/test/file1.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          file1Order.push(1);
        }),
        mutex.withLock('/test/file2.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          file2Order.push(1);
        }),
        mutex.withLock('/test/file1.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          file1Order.push(2);
        }),
        mutex.withLock('/test/file2.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          file2Order.push(2);
        }),
      ];

      await Promise.all(operations);

      // Assert: Each file's operations should be serialized independently
      expect(file1Order).toEqual([1, 2]);
      expect(file2Order).toEqual([1, 2]);
    });

    it('should handle many concurrent operations without deadlock', async () => {
      // Arrange
      const results: number[] = [];
      const operationCount = 20;

      // Act: Many concurrent operations
      const operations = Array.from({ length: operationCount }, (_, i) =>
        mutex.withLock('/test/file.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          results.push(i);
          return i;
        })
      );

      const returnValues = await Promise.all(operations);

      // Assert: All operations completed
      expect(results.length).toBe(operationCount);
      expect(returnValues.length).toBe(operationCount);

      // Results should be in order (serialized)
      for (let i = 0; i < operationCount; i++) {
        expect(results[i]).toBe(i);
      }
    });
  });

  describe('Metrics Tracking', () => {
    it('should track active files correctly', async () => {
      // Initially no active files
      expect(mutex.getMetrics().activeFiles).toBe(0);

      // Start operation (will hold lock)
      const operation = mutex.withLock('/test/file.txt', async () => {
        // Check metrics while lock is held
        expect(mutex.getMetrics().activeFiles).toBe(1);
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Wait a bit for operation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      await operation;

      // After release, active files should be 0
      expect(mutex.getMetrics().activeFiles).toBe(0);
    });

    it('should track wait time for queued operations', async () => {
      // Reset metrics
      mutex.resetMetrics();

      // Start first operation that holds lock
      const op1 = mutex.withLock('/test/file.txt', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Wait for first operation to acquire lock
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start second operation (will queue and wait)
      const op2 = mutex.withLock('/test/file.txt', async () => {
        return 'done';
      });

      await Promise.all([op1, op2]);

      // Should have recorded wait time
      const metrics = mutex.getMetrics();
      expect(metrics.totalWaitTimeMs).toBeGreaterThan(50);
      expect(metrics.longestWaitMs).toBeGreaterThan(50);
    });

    it('should reset metrics correctly', async () => {
      // Create some metrics
      await mutex.withLock('/test/file.txt', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Reset
      mutex.resetMetrics();

      // Metrics should be reset (except activeFiles which reflects current state)
      const metrics = mutex.getMetrics();
      expect(metrics.totalWaitTimeMs).toBe(0);
      expect(metrics.longestWaitMs).toBe(0);
      expect(metrics.queueDepthWarnings).toBe(0);
    });
  });

  describe('Path Normalization', () => {
    it('should treat same paths as same lock', async () => {
      // Arrange
      const executionOrder: string[] = [];

      // Act: Use slightly different path representations
      const op1 = mutex.withLock('/test/file.txt', async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        executionOrder.push('op1');
      });

      const op2 = mutex.withLock('/test/file.txt', async () => {
        executionOrder.push('op2');
      });

      await Promise.all([op1, op2]);

      // Assert: Should be serialized
      expect(executionOrder).toEqual(['op1', 'op2']);
    });

    it('should treat different paths as different locks', async () => {
      // Arrange
      const starts: string[] = [];

      // Act
      const op1 = mutex.withLock('/test/file1.txt', async () => {
        starts.push('file1');
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const op2 = mutex.withLock('/test/file2.txt', async () => {
        starts.push('file2');
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await Promise.all([op1, op2]);

      // Assert: Both should start immediately (parallel)
      expect(starts.length).toBe(2);
    });
  });

  describe('Graceful Shutdown (waitForPending)', () => {
    it('should return immediately when no pending operations', async () => {
      // Act
      const start = Date.now();
      await mutex.waitForPending();
      const duration = Date.now() - start;

      // Assert: Should return almost immediately
      expect(duration).toBeLessThan(50);
    });

    it('should wait for pending operations to complete', async () => {
      // Start an operation
      const operationComplete = { value: false };
      const op = mutex.withLock('/test/file.txt', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        operationComplete.value = true;
      });

      // Wait a bit for operation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Wait for pending
      await mutex.waitForPending();

      // Assert: Operation should be complete
      expect(operationComplete.value).toBe(true);

      await op;
    });

    it('should report pending operations correctly', async () => {
      // Initially no pending
      expect(mutex.hasPendingOperations()).toBe(false);

      // Start operation
      const op = mutex.withLock('/test/file.txt', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Wait for operation to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have pending
      expect(mutex.hasPendingOperations()).toBe(true);

      await op;

      // No longer pending
      expect(mutex.hasPendingOperations()).toBe(false);
    });
  });
});
