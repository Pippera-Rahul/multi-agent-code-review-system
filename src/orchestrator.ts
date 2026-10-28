import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema,
  type ReviewReport
} from './types/report-types';
import { mcpServersConfig } from './config/mcp.config';
import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents';
import { buildOrchestratorPrompt } from './prompts';
import { globalRateLimiter } from './utils/rate-limiter';
import {
  ErrorCodes,
  ReviewError,
  withRetry,
  withTimeout,
  formatError
} from './utils/error-handler';
import {
  logReviewStart,
  logReviewComplete,
  logReviewError
} from './utils/logger';

export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export class CodeReviewOrchestrator {
  private readonly options: Required<OrchestratorOptions>;

  constructor(options: OrchestratorOptions = {}) {
    this.options = {
      model: options.model || process.env.ANTHROPIC_MODEL || '',
      maxTurns: options.maxTurns ?? 20,
      maxBudgetUsd: options.maxBudgetUsd ?? 1,
      timeoutMs: options.timeoutMs ?? 120_000,
      maxRetries: options.maxRetries ?? 1
    };

    if (!this.options.model) {
      throw new ReviewError(
        'ANTHROPIC_MODEL is required.',
        ErrorCodes.INVALID_CONFIG
      );
    }

    if (
      !Number.isInteger(this.options.maxTurns) ||
      this.options.maxTurns < 1 ||
      !Number.isFinite(this.options.maxBudgetUsd) ||
      this.options.maxBudgetUsd <= 0 ||
      !Number.isFinite(this.options.timeoutMs) ||
      this.options.timeoutMs <= 0 ||
      !Number.isInteger(this.options.maxRetries) ||
      this.options.maxRetries < 0
    ) {
      throw new ReviewError(
        'Invalid orchestrator limits.',
        ErrorCodes.INVALID_CONFIG
      );
    }
  }

  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    if (
      !owner.trim() ||
      !repo.trim() ||
      !Number.isInteger(prNumber) ||
      prNumber < 1
    ) {
      throw new ReviewError(
        'Provide a repository owner, repository name, and positive PR number.',
        ErrorCodes.INVALID_CONFIG
      );
    }

    const startedAt = Date.now();
    logReviewStart(owner, repo, prNumber);

    try {
      const report = await withRetry(
        async () =>
          withTimeout(
            async () =>
              this.runReview(owner, repo, prNumber, startedAt),
            this.options.timeoutMs,
            `Review of ${owner}/${repo}#${prNumber} timed out.`
          ),
        this.options.maxRetries
      );

      logReviewComplete(
        owner,
        repo,
        prNumber,
        report.summary.overallScore,
        Date.now() - startedAt
      );

      return report;
    } catch (error) {
      const reviewError =
        error instanceof Error ? error : new Error(formatError(error));

      logReviewError(owner, repo, prNumber, reviewError);
      throw error;
    }
  }

  private async runReview(
    owner: string,
    repo: string,
    prNumber: number,
    startedAt: number
  ): Promise<ReviewReport> {
    if (!process.env.GITHUB_TOKEN) {
      throw new ReviewError(
        'GITHUB_TOKEN is required to access the GitHub MCP server.',
        ErrorCodes.MISSING_GITHUB_TOKEN
      );
    }

    await globalRateLimiter.acquire(5000);

    try {
      const prompt = `${buildOrchestratorPrompt(owner, repo, prNumber)}

Required workflow:
1. Use the configured GitHub MCP tools to retrieve the actual pull request
   and its changed files. Confirm the PR exists and belongs to this repository.
2. Inspect the available diff and file content. Never invent file contents,
   line numbers, test results, or measured coverage.
3. Use the Task tool to delegate independent analysis to all three specialist
   agents: code-quality-analyzer, test-coverage-analyzer, and refactoring-suggester.
   Supply each agent with the real changed-file content and available test context.
4. Run independent specialist analyses in parallel where possible.
5. Aggregate the results for every analyzed file into the exact required schema.
6. Calculate summary counts from the findings. Use only evidence actually obtained.
7. If required GitHub data cannot be retrieved, return an error instead of
   fabricating a successful report.

Return a complete JSON report matching the supplied schema.`;

      const sdkOptions: Options = {
        model: this.options.model,
        maxTurns: this.options.maxTurns,
        maxBudgetUsd: this.options.maxBudgetUsd,
        stderr: (data: string) => {
          process.stderr.write(`[claude-sdk] ${data}`);
        },
        permissionMode: 'dontAsk',
        tools: { type: 'preset', preset: 'claude_code' },
        allowedTools: ['Task', 'mcp__github__pull_request_read'],
        mcpServers: mcpServersConfig,
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester
        },
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema
        },
        env: {
          ...process.env,
          GITHUB_TOKEN: process.env.GITHUB_TOKEN
        }
      };

      let structuredOutput: unknown;

      for await (const message of query({
        prompt,
        options: sdkOptions
      })) {
        if (message.type === 'system' || message.type === 'assistant' ||
            message.type === 'user' || message.type === 'result') {
          const subtype = 'subtype' in message ? message.subtype : undefined;
          console.error(
            `[claude-sdk] message=${message.type}` +
            (subtype ? ` subtype=${subtype}` : '')
          );
        }

        if (message.type === 'result') {
          if (message.subtype === 'success') {
            structuredOutput = message.structured_output;

            if (structuredOutput === undefined) {
              throw new ReviewError(
                'The SDK did not return structured report data.',
                ErrorCodes.STRUCTURED_OUTPUT_FAILED
              );
            }
          } else {
            throw new ReviewError(
              `Claude review failed: ${message.subtype}`,
              ErrorCodes.AGENT_FAILED,
              { subtype: message.subtype }
            );
          }
        }
      }

      if (!structuredOutput) {
        throw new ReviewError(
          'No structured report was returned by the SDK.',
          ErrorCodes.STRUCTURED_OUTPUT_FAILED
        );
      }

      const parsed = ReviewReportSchema.safeParse(structuredOutput);

      if (!parsed.success) {
        throw new ReviewError(
          'The generated report failed schema validation.',
          ErrorCodes.VALIDATION_FAILED,
          { issues: parsed.error.issues }
        );
      }

      const report = parsed.data;

      if (
        report.pullRequest.owner.toLowerCase() !== owner.toLowerCase() ||
        report.pullRequest.repo.toLowerCase() !== repo.toLowerCase() ||
        report.pullRequest.number !== prNumber
      ) {
        throw new ReviewError(
          'The returned report identifies a different pull request.',
          ErrorCodes.VALIDATION_FAILED
        );
      }

      // Deduplicate file reviews and derive summary counts from actual findings.
      const uniqueReviews = Array.from(
        new Map(
          report.fileReviews.map(review => [review.file, review])
        ).values()
      );

      const criticalIssues = uniqueReviews.reduce(
        (total, review) =>
          total + review.codeQuality.issues.filter(
            issue => issue.severity === 'critical'
          ).length,
        0
      );

      const highPriorityTests = uniqueReviews.reduce(
        (total, review) =>
          total + review.testCoverage.untestedPaths.filter(
            path => path.priority === 'high' || path.priority === 'critical'
          ).length,
        0
      );

      const refactoringOpportunities = uniqueReviews.reduce(
        (total, review) => total + review.refactorings.suggestions.length,
        0
      );

      const overallScore = uniqueReviews.length
        ? Math.round(
            uniqueReviews.reduce(
              (total, review) => total + review.codeQuality.overallScore,
              0
            ) / uniqueReviews.length
          )
        : 0;

      return {
        ...report,
        fileReviews: uniqueReviews,
        summary: {
          totalFiles: uniqueReviews.length,
          overallScore,
          criticalIssues,
          highPriorityTests,
          refactoringOpportunities
        },
        metadata: {
          ...report.metadata,
          analyzedAt: new Date().toISOString(),
          duration: Date.now() - startedAt,
          agentVersions: {
            ...report.metadata.agentVersions,
            orchestrator: '1.0.0'
          }
        }
      };
    } finally {
      globalRateLimiter.release();
    }
  }
}
