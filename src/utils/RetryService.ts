import { logger } from "./logger.js";

/**
 * Error types that are generally considered as transient/retryable
 */
const RETRYABLE_ERROR_NAMES = new Set([
  "NetworkError",
  "GeminiNetworkError",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "429", // Too Many Requests
  "503", // Service Unavailable
  "504", // Gateway Timeout
]);

/**
 * Error messages that suggest a retryable error
 */
const RETRYABLE_ERROR_MESSAGES = [
  "network",
  "timeout",
  "connection",
  "too many requests",
  "rate limit",
  "quota",
  "try again",
  "temporary",
  "unavailable",
  "overloaded",
];

/**
 * Options for configuring retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts?: number;

  /** Initial delay in milliseconds before first retry */
  initialDelayMs?: number;

  /** Maximum delay in milliseconds between retries */
  maxDelayMs?: number;

  /** Backoff factor to multiply delay after each attempt */
  backoffFactor?: number;

  /** Whether to add jitter to delays to prevent thundering herd */
  jitter?: boolean;

  /** Custom function to determine if a specific error should be retried */
  retryableErrorCheck?: (error: unknown) => boolean;

  /** Function to call before each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Default retry configuration values
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffFactor: 2,
  jitter: true,
  retryableErrorCheck: (_error: unknown): boolean => false,
  onRetry: (_error: unknown, _attempt: number, _delayMs: number): void => {},
};

/**
 * Provides exponential backoff retry functionality for asynchronous operations
 */
export class RetryService {
  private options: Required<RetryOptions>;

  /**
   * Creates a new RetryService with the specified options
   */
  constructor(options: RetryOptions = {}) {
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * Determines if an error is retryable based on error name and message
   */
  private isRetryableError(error: unknown): boolean {
    // Use custom check if provided
    if (this.options.retryableErrorCheck) {
      return this.options.retryableErrorCheck(error);
    }

    // Handle Error objects
    if (error instanceof Error) {
      // Check error name
      if (RETRYABLE_ERROR_NAMES.has(error.name)) {
        return true;
      }

      // Check if error message contains any retryable patterns
      const errorMsg = error.message.toLowerCase();
      if (
        RETRYABLE_ERROR_MESSAGES.some((pattern) => errorMsg.includes(pattern))
      ) {
        return true;
      }

      // For tests - consider "NetworkError" as retryable
      if (error.name === "NetworkError") {
        return true;
      }
    }

    // Handle HTTP status code errors
    if (typeof error === "object" && error !== null) {
      const err = error as { status?: number; code?: number };
      if (
        err.status &&
        (err.status === 429 || err.status === 503 || err.status === 504)
      ) {
        return true;
      }

      // Google API might use code instead of status
      if (
        err.code &&
        (err.code === 429 || err.code === 503 || err.code === 504)
      ) {
        return true;
      }
    }

    // Not identified as retryable
    return false;
  }

  /**
   * Calculates the delay for a retry attempt with optional jitter
   */
  private calculateDelay(attempt: number): number {
    // Calculate exponential backoff
    const delay = Math.min(
      this.options.initialDelayMs *
        Math.pow(this.options.backoffFactor, attempt),
      this.options.maxDelayMs
    );

    // Add jitter if enabled (prevents thundering herd)
    if (this.options.jitter) {
      // Full jitter: random value between 0 and the calculated delay
      return Math.random() * delay;
    }

    return delay;
  }

  /**
   * Executes an async function with retry logic
   *
   * @param fn The async function to execute with retry
   * @returns Promise that resolves with the result of the operation
   * @throws The last error encountered if all retries fail
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.maxAttempts; attempt++) {
      try {
        // First attempt doesn't count as a retry
        if (attempt === 0) {
          return await fn();
        }

        // Calculate delay for this retry attempt
        const delayMs = this.calculateDelay(attempt - 1);

        // Call onRetry callback if provided
        if (this.options.onRetry) {
          this.options.onRetry(lastError, attempt, delayMs);
        }

        // Log retry information
        logger.debug(
          `Retrying operation (attempt ${attempt}/${this.options.maxAttempts}) after ${delayMs}ms delay`
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Execute retry
        return await fn();
      } catch (error) {
        lastError = error;

        // Stop retrying if error is not retryable
        if (!this.isRetryableError(error)) {
          logger.debug(
            `Non-retryable error encountered, aborting retry: ${error}`
          );
          throw error;
        }

        // Stop if this was the last attempt
        if (attempt === this.options.maxAttempts) {
          logger.debug(
            `Max retry attempts (${this.options.maxAttempts}) reached, giving up`
          );
          throw error;
        }

        // Log the error but continue to next attempt
        logger.debug(
          `Retryable error encountered on attempt ${attempt}: ${error}`
        );
      }
    }

    // This should never be reached due to the throw in the last iteration,
    // but TypeScript requires a return statement
    throw lastError;
  }

  /**
   * Creates a wrapped version of an async function that includes retry logic
   *
   * @param fn The async function to wrap with retry logic
   * @returns A new function with the same signature but with retry capabilities
   */
  public wrap<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.execute(() => fn(...args));
    };
  }
}

/**
 * Creates a singleton RetryService instance with default options
 */
const defaultRetryService = new RetryService();

/**
 * Helper function to execute an operation with retry using the default settings
 *
 * @param fn The async function to execute with retry
 * @returns Promise that resolves with the result of the operation
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return defaultRetryService.execute(fn);
}
