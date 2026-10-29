import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/index.js';

export const testCoverageAnalyzer: AgentDefinition = {
  description: 'Identify missing tests, uncovered branches, edge cases, and risky untested paths.',
  prompt: `${TEST_COVERAGE_ANALYZER_PROMPT}\n\nUse Read, Grep, and Glob to inspect existing tests and implementation. Use Skill when specialized testing guidance is needed. Do not modify files.`,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  model: 'inherit'
};
