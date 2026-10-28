import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';
import {
  CodeReviewOrchestrator
} from '../src/orchestrator';
import {
  ErrorCodes,
  ReviewError
} from '../src/utils/error-handler';

describe('CodeReviewOrchestrator', () => {
  const originalModel = process.env.ANTHROPIC_MODEL;
  const originalGitHubToken = process.env.GITHUB_TOKEN;

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.ANTHROPIC_MODEL;
    } else {
      process.env.ANTHROPIC_MODEL = originalModel;
    }

    if (originalGitHubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGitHubToken;
    }
  });

  describe('Configuration', () => {
    it('initializes with the model from the environment', () => {
      process.env.ANTHROPIC_MODEL = 'test-model';

      expect(() => new CodeReviewOrchestrator()).not.toThrow();
    });

    it('accepts explicit valid options', () => {
      expect(() =>
        new CodeReviewOrchestrator({
          model: 'test-model',
          maxTurns: 5,
          maxBudgetUsd: 0.5,
          timeoutMs: 10_000,
          maxRetries: 0
        })
      ).not.toThrow();
    });

    it('rejects a missing model', () => {
      delete process.env.ANTHROPIC_MODEL;

      expect(() => new CodeReviewOrchestrator()).toThrow(
        expect.objectContaining({
          code: ErrorCodes.INVALID_CONFIG
        })
      );
    });

    it('rejects invalid limits', () => {
      expect(() =>
        new CodeReviewOrchestrator({
          model: 'test-model',
          maxTurns: 0
        })
      ).toThrow(
        expect.objectContaining({
          code: ErrorCodes.INVALID_CONFIG
        })
      );
    });
  });

  describe('reviewPullRequest input validation', () => {
    it('rejects an empty repository owner', async () => {
      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        maxRetries: 0
      });

      await expect(
        orchestrator.reviewPullRequest('', 'repo', 1)
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_CONFIG
      });
    });

    it('rejects a non-positive pull request number', async () => {
      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        maxRetries: 0
      });

      await expect(
        orchestrator.reviewPullRequest('owner', 'repo', 0)
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_CONFIG
      });
    });

    it('reports missing GitHub credentials without calling the review API', async () => {
      delete process.env.GITHUB_TOKEN;

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        maxRetries: 0
      });

      try {
        await orchestrator.reviewPullRequest('owner', 'repo', 1);
        expect.fail('Expected the review to fail without a GitHub token');
      } catch (error) {
        expect(error).toBeInstanceOf(ReviewError);
        expect(error).toMatchObject({
          code: ErrorCodes.MISSING_GITHUB_TOKEN
        });
      }
    });
  });
});
