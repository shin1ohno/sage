/**
 * Retry Utility
 * Provides retry mechanisms with exponential backoff
 * Requirements: 5.6, 8.5, 15.2
 */

/**
 * Retry options
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Delay between retries in ms (default: 1000) */
  delay?: number;
  /** Callback called on each retry */
  onRetry?: (error: Error, attempt: number) => void;
  /** Function to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Backoff options for exponential retry
 */
export interface BackoffOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  multiplier?: number;
  /** Add random jitter to delay (default: false) */
  jitter?: boolean;
  /** Callback called on each retry */
  onRetry?: (error: Error, attempt: number, nextDelay: number) => void;
  /** Function to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Custom error for retry failures
 */
export class RetryError extends Error {
  public readonly lastError: Error;
  public readonly attempts: number;

  constructor(message: string, lastError: Error, attempts: number) {
    super(message);
    this.name = 'RetryError';
    this.lastError = lastError;
    this.attempts = attempts;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, RetryError.prototype);
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with fixed delay
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, onRetry, shouldRetry } = options;

  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(lastError)) {
        throw lastError;
      }

      // If this was the last attempt, don't retry
      if (attempt >= maxAttempts) {
        break;
      }

      // Call onRetry callback
      if (onRetry) {
        onRetry(lastError, attempt);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  throw new RetryError(
    `Failed after ${maxAttempts} attempts: ${lastError.message}`,
    lastError,
    maxAttempts
  );
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    multiplier = 2,
    jitter = false,
    onRetry,
    shouldRetry,
  } = options;

  let lastError: Error = new Error('No attempts made');
  let currentDelay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(lastError)) {
        throw lastError;
      }

      // If this was the last attempt, don't retry
      if (attempt >= maxAttempts) {
        break;
      }

      // Calculate delay with optional jitter
      let delayMs = Math.min(currentDelay, maxDelay);
      if (jitter) {
        // Add random jitter between 0-25% of delay
        delayMs = delayMs + Math.random() * delayMs * 0.25;
      }

      // Call onRetry callback
      if (onRetry) {
        onRetry(lastError, attempt, delayMs);
      }

      // Wait before next attempt
      await sleep(delayMs);

      // Increase delay for next attempt
      currentDelay = currentDelay * multiplier;
    }
  }

  throw new RetryError(
    `Failed after ${maxAttempts} attempts: ${lastError.message}`,
    lastError,
    maxAttempts
  );
}

/**
 * Patterns that indicate non-retryable errors
 */
const NON_RETRYABLE_PATTERNS = [
  /permission denied/i,
  /access denied/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid/i,
  /validation/i,
  /not found/i,
  /does not exist/i,
  /already exists/i,
  /bad request/i,
];

/**
 * Patterns that indicate retryable errors
 */
const RETRYABLE_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /ENETUNREACH/i,
  /EHOSTUNREACH/i,
  /network/i,
  /timeout/i,
  /temporary/i,
  /unavailable/i,
  /rate limit/i,
  /too many requests/i,
  /service busy/i,
  /try again/i,
  /retry/i,
];

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // First check for non-retryable patterns
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return false;
    }
  }

  // Then check for retryable patterns
  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }

  // Default to retryable for unknown errors
  return true;
}

/**
 * Create a retry wrapper for a service method
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: BackoffOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return retryWithBackoff(
      () => fn(...args) as Promise<ReturnType<T>>,
      {
        ...options,
        shouldRetry: options.shouldRetry ?? isRetryableError,
      }
    );
  }) as T;
}
