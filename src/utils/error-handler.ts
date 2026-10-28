/**
 * Custom error class for review operations
 */
export class ReviewError extends Error {
  constructor(
    message: string,
    public code: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ReviewError';
    Error.captureStackTrace(this, ReviewError);
  }
}

/**
 * Error codes for the review system
 */
export const ErrorCodes = {
  MISSING_API_KEY: 'MISSING_API_KEY',
  MISSING_GITHUB_TOKEN: 'MISSING_GITHUB_TOKEN',
  INVALID_CONFIG: 'INVALID_CONFIG',
  PR_NOT_FOUND: 'PR_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  AGENT_FAILED: 'AGENT_FAILED',
  STRUCTURED_OUTPUT_FAILED: 'STRUCTURED_OUTPUT_FAILED',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Retry an asynchronous operation with exponential backoff and jitter.
 * maxRetries means retries after the initial attempt.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new RangeError('maxRetries must be a non-negative integer.');
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError('delayMs must be a non-negative finite number.');
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Permanent errors should fail immediately instead of being retried.
      const permanentErrorCodes = new Set<string>([
        ErrorCodes.MISSING_API_KEY,
        ErrorCodes.MISSING_GITHUB_TOKEN,
        ErrorCodes.INVALID_CONFIG,
        ErrorCodes.PR_NOT_FOUND,
        ErrorCodes.FILE_NOT_FOUND,
        ErrorCodes.VALIDATION_FAILED
      ]);

      if (
        error instanceof ReviewError &&
        permanentErrorCodes.has(error.code)
      ) {
        throw error;
      }

      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const backoff = delayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 100;

      await new Promise<void>((resolve) =>
        setTimeout(resolve, backoff + jitter)
      );
    }
  }

  throw new ReviewError(
    `Operation failed after ${maxRetries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    ErrorCodes.RETRY_EXHAUSTED,
    {
      attempts: maxRetries + 1,
      maxRetries,
      cause: lastError instanceof Error ? lastError.message : String(lastError)
    }
  );
}

/**
 * Wrap an asynchronous operation with a timeout.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError('timeoutMs must be a non-negative finite number.');
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new ReviewError(
              errorMessage,
              ErrorCodes.AGENT_TIMEOUT,
              { timeoutMs }
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Check if an error is a ReviewError
 */
export function isReviewError(error: unknown): error is ReviewError {
  return error instanceof ReviewError;
}

/**
 * Format error for logging/display
 */
export function formatError(error: unknown): string {
  if (isReviewError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
