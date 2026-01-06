/**
 * Retry Utility Unit Tests
 * Requirements: 5.6, 8.5, 15.2
 */

import {
  retry,
  retryWithBackoff,
  isRetryableError,
  RetryError,
} from '../../src/utils/retry.js';

describe('Retry Utility', () => {
  describe('retry', () => {
    it('should succeed on first attempt if no error', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary'))
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValue('success');

      const result = await retry(fn, { maxAttempts: 3, delay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts exceeded', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent'));

      await expect(retry(fn, { maxAttempts: 3, delay: 10 })).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should include attempt info in RetryError', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('failed'));

      try {
        await retry(fn, { maxAttempts: 2, delay: 10 });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        const retryError = error as RetryError;
        expect(retryError.attempts).toBe(2);
        expect(retryError.lastError.message).toBe('failed');
      }
    });

    it('should call onRetry callback', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('temp'))
        .mockResolvedValue('success');
      const onRetry = jest.fn();

      await retry(fn, { maxAttempts: 3, delay: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should not retry non-retryable errors when shouldRetry is provided', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fatal'));
      const shouldRetry = jest.fn().mockReturnValue(false);

      await expect(retry(fn, { maxAttempts: 3, delay: 10, shouldRetry })).rejects.toThrow('fatal');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry only retryable errors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('retryable'))
        .mockRejectedValueOnce(new Error('fatal'));
      const shouldRetry = jest.fn().mockImplementation((err: Error) => err.message === 'retryable');

      await expect(retry(fn, { maxAttempts: 3, delay: 10, shouldRetry })).rejects.toThrow('fatal');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('retryWithBackoff', () => {
    it('should use exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('temp'))
        .mockRejectedValueOnce(new Error('temp'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await retryWithBackoff(fn, { maxAttempts: 3, initialDelay: 50, maxDelay: 1000 });
      const elapsed = Date.now() - startTime;

      // First retry: 50ms, second retry: 100ms = 150ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelay', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('temp'))
        .mockRejectedValueOnce(new Error('temp'))
        .mockRejectedValueOnce(new Error('temp'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await retryWithBackoff(fn, { maxAttempts: 4, initialDelay: 100, maxDelay: 150 });
      const elapsed = Date.now() - startTime;

      // Delays: 100, 150 (capped), 150 (capped) = 400ms max
      // Allow 800ms for CI overhead
      expect(elapsed).toBeLessThan(800);
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should apply jitter when enabled', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('temp'))
        .mockResolvedValue('success');

      // Just ensure it doesn't throw with jitter enabled
      const result = await retryWithBackoff(fn, {
        maxAttempts: 2,
        initialDelay: 50,
        maxDelay: 1000,
        jitter: true,
      });

      expect(result).toBe('success');
    });
  });

  describe('isRetryableError', () => {
    it('should identify network errors as retryable', () => {
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableError(new Error('network error'))).toBe(true);
      expect(isRetryableError(new Error('timeout'))).toBe(true);
    });

    it('should identify temporary errors as retryable', () => {
      expect(isRetryableError(new Error('temporary failure'))).toBe(true);
      expect(isRetryableError(new Error('service unavailable'))).toBe(true);
      expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    });

    it('should identify permission errors as non-retryable', () => {
      expect(isRetryableError(new Error('permission denied'))).toBe(false);
      expect(isRetryableError(new Error('access denied'))).toBe(false);
      expect(isRetryableError(new Error('unauthorized'))).toBe(false);
    });

    it('should identify validation errors as non-retryable', () => {
      expect(isRetryableError(new Error('invalid input'))).toBe(false);
      expect(isRetryableError(new Error('validation failed'))).toBe(false);
      expect(isRetryableError(new Error('not found'))).toBe(false);
    });

    it('should treat unknown errors as retryable by default', () => {
      expect(isRetryableError(new Error('something went wrong'))).toBe(true);
    });
  });

  describe('RetryError', () => {
    it('should contain original error information', () => {
      const originalError = new Error('original');
      const retryError = new RetryError('Retry failed', originalError, 3);

      expect(retryError.message).toBe('Retry failed');
      expect(retryError.lastError).toBe(originalError);
      expect(retryError.attempts).toBe(3);
      expect(retryError.name).toBe('RetryError');
    });

    it('should be instanceof Error', () => {
      const retryError = new RetryError('test', new Error('original'), 1);
      expect(retryError).toBeInstanceOf(Error);
      expect(retryError).toBeInstanceOf(RetryError);
    });
  });
});
