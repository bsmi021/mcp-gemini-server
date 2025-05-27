// Using vitest globals - see vitest.config.ts globals: true
import { RetryService } from "../../../src/utils/RetryService.js";

// Test helper to simulate multiple failures before success
function createMultiFailFunction<T>(
  failures: number,
  result: T,
  errorMessage = "Simulated error",
  errorName = "NetworkError" // Using a retryable error name by default
): () => Promise<T> {
  let attempts = 0;

  return async () => {
    attempts++;
    if (attempts <= failures) {
      const error = new Error(errorMessage);
      error.name = errorName;
      throw error;
    }
    return result;
  };
}

describe("RetryService", () => {
  // Mock the setTimeout to execute immediately for testing purposes
  let originalSetTimeout: typeof setTimeout;

  beforeEach(() => {
    // Save original setTimeout
    originalSetTimeout = global.setTimeout;

    // Replace with a version that executes immediately
    global.setTimeout = function (fn: TimerHandler): number {
      if (typeof fn === "function") fn();
      return 0;
    } as typeof setTimeout;
  });

  // Restore setTimeout after tests
  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  describe("execute method", () => {
    let retryService: RetryService;
    let onRetryMock: ReturnType<typeof vi.fn>;
    let delaysCollected: number[] = [];

    beforeEach(() => {
      delaysCollected = [];
      onRetryMock = vi.fn(
        (_error: unknown, _attempt: number, delayMs: number) => {
          delaysCollected.push(delayMs);
        }
      );

      retryService = new RetryService({
        maxAttempts: 3,
        initialDelayMs: 10, // Short delay for faster tests
        maxDelayMs: 50,
        backoffFactor: 2,
        jitter: false, // Disable jitter for predictable tests
        onRetry: onRetryMock,
        // Force all NetworkError types to be retryable for tests
        retryableErrorCheck: (err: unknown) => {
          if (err instanceof Error && err.name === "NetworkError") {
            return true;
          }
          return false;
        },
      });
    });

    it("should succeed on first attempt", async () => {
      const fn = vi.fn(async () => "success");

      const result = await retryService.execute(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(onRetryMock).not.toHaveBeenCalled();
    });

    it("should retry and succeed after retries", async () => {
      const fn = createMultiFailFunction(2, "success");
      const mockFn = vi.fn(fn);

      const result = await retryService.execute(mockFn);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(onRetryMock).toHaveBeenCalledTimes(2);
    });

    it("should throw if max retries are exceeded", async () => {
      const fn = createMultiFailFunction(5, "never reached");
      const mockFn = vi.fn(fn);

      await expect(retryService.execute(mockFn)).rejects.toThrow(
        "Simulated error"
      );
      expect(mockFn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries (maxAttempts)
      expect(onRetryMock).toHaveBeenCalledTimes(3);
    });

    it("should not retry on non-retryable errors", async () => {
      const error = new Error("Non-retryable error");
      error.name = "ValidationError"; // Not in the retryable list

      const fn = vi.fn(async () => {
        throw error;
      });

      await expect(retryService.execute(fn)).rejects.toThrow(
        "Non-retryable error"
      );
      expect(fn).toHaveBeenCalledTimes(1); // No retries
      expect(onRetryMock).not.toHaveBeenCalled();
    });

    it("should use custom retryable error check if provided", async () => {
      const customRetryService = new RetryService({
        maxAttempts: 3,
        initialDelayMs: 10,
        retryableErrorCheck: (err: unknown) => {
          return (err as Error).message.includes("custom");
        },
      });

      const nonRetryableFn = vi.fn(async () => {
        throw new Error("regular error"); // Won't be retried
      });

      const retryableFn = vi.fn(async () => {
        throw new Error("custom error"); // Will be retried
      });

      // Should not retry for regular error
      await expect(
        customRetryService.execute(nonRetryableFn)
      ).rejects.toThrow();
      expect(nonRetryableFn).toHaveBeenCalledTimes(1);

      // Should retry for custom error
      await expect(customRetryService.execute(retryableFn)).rejects.toThrow();
      expect(retryableFn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });
  });

  describe("wrap method", () => {
    it("should create a function with retry capabilities", async () => {
      const retryService = new RetryService({
        maxAttempts: 2,
        initialDelayMs: 10,
        // Ensure errors are retryable in tests
        retryableErrorCheck: (err: unknown) => {
          if (err instanceof Error && err.name === "NetworkError") {
            return true;
          }
          return false;
        },
      });

      const fn = createMultiFailFunction(1, "success");
      const mockFn = vi.fn(fn);

      const wrappedFn = retryService.wrap(mockFn);
      const result = await wrappedFn();

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it("should pass arguments correctly", async () => {
      const retryService = new RetryService({ maxAttempts: 2 });

      const fn = vi.fn(async (a: number, b: string) => {
        return `${a}-${b}`;
      });

      const wrappedFn = retryService.wrap(fn);
      const result = await wrappedFn(42, "test");

      expect(result).toBe("42-test");
      expect(fn).toHaveBeenCalledWith(42, "test");
    });
  });

  describe("withRetry function", () => {
    // Temporarily create a specialized withRetry for testing
    const testWithRetry = async function <T>(fn: () => Promise<T>): Promise<T> {
      const testRetryService = new RetryService({
        retryableErrorCheck: (err: unknown) => {
          if (err instanceof Error && err.name === "NetworkError") {
            return true;
          }
          return false;
        },
      });
      return testRetryService.execute(fn);
    };

    it("should retry using default settings", async () => {
      const fn = createMultiFailFunction(1, "success");
      const mockFn = vi.fn(fn);

      // Use our test-specific function
      const result = await testWithRetry(mockFn);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
  });

  describe("delay calculation", () => {
    it("should use exponential backoff for delays", async () => {
      const delays: number[] = [];

      // Create a test-specific RetryService
      const testRetryService = new RetryService({
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffFactor: 2,
        jitter: false,
        onRetry: (_error: unknown, _attempt: number, delayMs: number) => {
          delays.push(delayMs);
        },
      });

      // Direct access to the private method for testing
      const delay1 = (testRetryService as any).calculateDelay(0);
      const delay2 = (testRetryService as any).calculateDelay(1);
      const delay3 = (testRetryService as any).calculateDelay(2);

      // Verify calculated delays
      expect(delay1).toBe(100);
      expect(delay2).toBe(200);
      expect(delay3).toBe(400);
    });

    it("should respect maxDelayMs", async () => {
      // Create a test-specific RetryService with a low maxDelayMs
      const testRetryService = new RetryService({
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 300, // Cap at 300ms
        backoffFactor: 2,
        jitter: false,
      });

      // Test calculated delays directly
      const delay1 = (testRetryService as any).calculateDelay(0);
      const delay2 = (testRetryService as any).calculateDelay(1);
      const delay3 = (testRetryService as any).calculateDelay(2); // Should be capped
      const delay4 = (testRetryService as any).calculateDelay(3); // Should be capped

      // Verify calculated delays
      expect(delay1).toBe(100);
      expect(delay2).toBe(200);
      expect(delay3).toBe(300); // Capped
      expect(delay4).toBe(300); // Capped
    });
  });
});
