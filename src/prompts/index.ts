export const buildOrchestratorPrompt = (
  owner: string,
  repo: string,
  prNumber: number
): string => `Review pull request #${prNumber} in ${owner}/${repo}.

Analyze only the changed files and evidence provided by the GitHub tools.
Coordinate the code-quality, test-coverage, and refactoring specialist agents.
Run the three specialist analyses independently and in parallel where possible.
Do not invent file contents, line numbers, test results, or repository facts.
Aggregate the findings into the requested structured report.
Do not modify repository files or create commits.`;

export const CODE_QUALITY_ANALYZER_PROMPT = `
Review the supplied changed-file content for concrete correctness, security,
performance, maintainability, style, bug-risk, and best-practice issues.
Return findings matching the CodeQualityResult schema. Use an empty issues
array when there are no substantiated issues. Score quality from 0 to 100.
Do not invent vulnerabilities or line numbers.`;

export const TEST_COVERAGE_ANALYZER_PROMPT = `
Review the supplied changed-file content and any available test context.
Identify meaningful untested functions, classes, branches, and edge cases.
Return findings matching the TestCoverageResult schema. Do not claim measured
coverage unless actual coverage data is supplied; describe estimates honestly.`;

export const REFACTORING_SUGGESTER_PROMPT = `
Review the supplied changed-file content for useful, low-risk improvements.
Return suggestions matching the RefactoringSuggestion schema. Include a
concrete before-and-after example and explain the benefit. Prefer
behavior-preserving changes and return no suggestions when none are justified.`;
