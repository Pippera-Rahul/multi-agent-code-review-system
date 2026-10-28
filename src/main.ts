import * as dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CodeReviewOrchestrator } from './orchestrator';
import { ReportGenerator } from './utils/report-generator';

dotenv.config();

async function main(): Promise<void> {
  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr || !/^\d+$/.test(prStr)) {
    console.error('Usage: npm run dev -- <owner> <repo> <pr-number>');
    process.exitCode = 1;
    return;
  }

  const prNumber = Number(prStr);

  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    console.error('Pull request number must be a positive integer.');
    process.exitCode = 1;
    return;
  }

  const hasAnthropicAuth = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasBedrockAuth = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );

  if (!hasAnthropicAuth && !hasBedrockAuth) {
    console.error(
      'Configure ANTHROPIC_API_KEY or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.'
    );
    process.exitCode = 1;
    return;
  }

  if (hasBedrockAuth && !hasAnthropicAuth && !process.env.AWS_REGION) {
    console.error('AWS_REGION is required when using AWS Bedrock.');
    process.exitCode = 1;
    return;
  }

  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error('ANTHROPIC_MODEL must be configured.');
    process.exitCode = 1;
    return;
  }

  console.log(
    hasAnthropicAuth
      ? '🔐 Using Anthropic API authentication'
      : '🔐 Using AWS Bedrock authentication'
  );

  if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is required to access GitHub.');
    process.exitCode = 1;
    return;
  }

  try {
    const orchestrator = new CodeReviewOrchestrator({ model });
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);
    const generator = new ReportGenerator();

    const reportsDir = join(process.cwd(), 'reports');
    await mkdir(reportsDir, { recursive: true });

    const baseName = `${owner}-${repo}-pr-${prNumber}`;

    await Promise.all([
      writeFile(
        join(reportsDir, `${baseName}.md`),
        generator.generateMarkdownReport(report),
        'utf8'
      ),
      writeFile(
        join(reportsDir, `${baseName}.html`),
        generator.generateHTMLReport(report),
        'utf8'
      ),
      writeFile(
        join(reportsDir, `${baseName}.json`),
        generator.generateJSONReport(report),
        'utf8'
      )
    ]);

    console.log(`Review completed. Reports saved in ${reportsDir}`);
  } catch (error) {
    console.error(
      'Review failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  }
}

main();
