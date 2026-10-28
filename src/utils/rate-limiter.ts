/**
 * Rate Limiter for API requests and token usage.
 * Tracks requests and tokens in a rolling 60-second window.
 */

export interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMITS: RateLimiterConfig = {
  maxRequestsPerMinute: 50,
  maxTokensPerMinute: 100000,
  maxConcurrent: 5
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };

    if (
      this.config.maxRequestsPerMinute < 1 ||
      this.config.maxTokensPerMinute < 1 ||
      this.config.maxConcurrent < 1 ||
      !Number.isInteger(this.config.maxRequestsPerMinute) ||
      !Number.isInteger(this.config.maxConcurrent)
    ) {
      throw new RangeError('Rate limit values must be positive; request and concurrency limits must be integers.');
    }
  }

  async acquire(estimatedTokens = 1000): Promise<void> {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      throw new RangeError('estimatedTokens must be a non-negative finite number.');
    }

    if (estimatedTokens > this.config.maxTokensPerMinute) {
      throw new RangeError('Estimated tokens exceed the configured per-minute token limit.');
    }

    while (true) {
      // Reserve concurrency only after rate limits have been checked.
      while (this.activeRequests >= this.config.maxConcurrent) {
        await this.waitForSlot();
      }

      await this.waitForRateLimit(estimatedTokens);

      // Recheck after awaiting: other callers may have acquired a slot.
      this.pruneOldRecords();
      const tokensInWindow = this.requestHistory.reduce(
        (sum, record) => sum + record.tokens,
        0
      );

      if (
        this.activeRequests < this.config.maxConcurrent &&
        this.requestHistory.length < this.config.maxRequestsPerMinute &&
        tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute
      ) {
        this.activeRequests++;
        this.requestHistory.push({
          timestamp: Date.now(),
          tokens: estimatedTokens
        });
        return;
      }
    }
  }

  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Update the most recent request that has not already been updated.
    if (
      actualTokens !== undefined &&
      Number.isFinite(actualTokens) &&
      actualTokens >= 0 &&
      this.requestHistory.length > 0
    ) {
      const lastRequest = this.requestHistory[this.requestHistory.length - 1];
      if (lastRequest) {
        lastRequest.tokens = actualTokens;
      }
    }

    const next = this.waitQueue.shift();
    if (next) next();
  }

  getStatus(): {
    activeRequests: number;
    requestsInWindow: number;
    tokensInWindow: number;
    availableRequests: number;
    availableTokens: number;
  } {
    this.pruneOldRecords();

    const requestsInWindow = this.requestHistory.length;
    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0
    );

    return {
      activeRequests: this.activeRequests,
      requestsInWindow,
      tokensInWindow,
      availableRequests: Math.max(
        0,
        this.config.maxRequestsPerMinute - requestsInWindow
      ),
      availableTokens: Math.max(
        0,
        this.config.maxTokensPerMinute - tokensInWindow
      )
    };
  }

  canProceed(estimatedTokens = 1000): boolean {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      return false;
    }

    this.pruneOldRecords();

    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0
    );

    return (
      this.activeRequests < this.config.maxConcurrent &&
      this.requestHistory.length < this.config.maxRequestsPerMinute &&
      tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute
    );
  }

  private async waitForSlot(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private async waitForRateLimit(estimatedTokens: number): Promise<void> {
    while (true) {
      this.pruneOldRecords();

      const tokensInWindow = this.requestHistory.reduce(
        (sum, record) => sum + record.tokens,
        0
      );

      const rateLimitsAllowRequest =
        this.requestHistory.length < this.config.maxRequestsPerMinute &&
        tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute;

      if (rateLimitsAllowRequest) return;

      const oldest = this.requestHistory[0];

      if (!oldest) return;

      const waitTime = Math.min(
        5000,
        Math.max(100, oldest.timestamp + 60000 - Date.now() + 100)
      );

      await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    }
  }

  private pruneOldRecords(): void {
    const cutoff = Date.now() - 60000;
    this.requestHistory = this.requestHistory.filter(
      (record) => record.timestamp > cutoff
    );
  }
}

export async function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens = 1000
): Promise<T> {
  await rateLimiter.acquire(estimatedTokens);

  try {
    return await fn();
  } finally {
    rateLimiter.release();
  }
}

export const globalRateLimiter = new RateLimiter();
