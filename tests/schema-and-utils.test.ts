import { describe, expect, it } from 'vitest';
import { ReviewReportSchema } from '../src/types/report-types';
import {
  ErrorCodes,
  ReviewError,
  withRetry,
  withTimeout
} from '../src/utils/error-handler';
import {
  RateLimiter,
  withRateLimit
} from '../src/utils/rate-limiter';

const validReport = {
  pullRequest: {
    owner: 'Pippera-Rahul',
    repo: 'code-review-mcp-test',
    number: 1
  },
  fileReviews: [],
  summary: {
    totalFiles: 0,
    overallScore: 0,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0
  },
  recommendations: [],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 1,
    agentVersions: { orchestrator: '1.0.0' }
  }
};

describe('ReviewReportSchema', () => {
  it('accepts a valid report', () => {
    expect(ReviewReportSchema.safeParse(validReport).success).toBe(true);
  });

  it('rejects a malformed report', () => {
    expect(
      ReviewReportSchema.safeParse({
        ...validReport,
        summary: {}
      }).success
    ).toBe(false);
  });
});

describe('error-handler utilities', () => {
  it('retries transient failures and succeeds', async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts++;
          if (attempts === 1) throw new Error('temporary failure');
          return 'ok';
        },
        1,
        0
      )
    ).resolves.toBe('ok');

    expect(attempts).toBe(2);
  });

  it('does not retry permanent ReviewError codes', async () => {
    let attempts = 0;
    const error = new ReviewError('Missing token', ErrorCodes.MISSING_GITHUB_TOKEN);

    await expect(
      withRetry(async () => {
        attempts++;
        throw error;
      }, 3, 0)
    ).rejects.toBe(error);

    expect(attempts).toBe(1);
  });

  it('rejects an operation that exceeds its timeout', async () => {
    await expect(
      withTimeout(
        () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50)),
        5,
        'Test timeout'
      )
    ).rejects.toMatchObject({ code: ErrorCodes.AGENT_TIMEOUT });
  });

  it('returns the result when an operation completes before timeout', async () => {
    await expect(
      withTimeout(async () => 'done', 100)
    ).resolves.toBe('done');
  });
});

describe('RateLimiter utilities', () => {
  it('allows a request within configured capacity', () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 1,
      maxTokensPerMinute: 10,
      maxConcurrent: 1
    });

    expect(limiter.canProceed(5)).toBe(true);
  });

  it('rejects requests that exceed token capacity', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 10,
      maxConcurrent: 1
    });

    expect(limiter.canProceed(11)).toBe(false);
    await expect(limiter.acquire(11)).rejects.toBeInstanceOf(RangeError);
  });

  it('releases capacity after withRateLimit finishes', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 10,
      maxConcurrent: 1
    });

    await expect(
      withRateLimit(limiter, async () => 'success', 5)
    ).resolves.toBe('success');

    expect(limiter.getStatus().activeRequests).toBe(0);
  });
});
