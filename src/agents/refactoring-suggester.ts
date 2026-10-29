import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/index.js';

export const refactoringSuggester: AgentDefinition = {
  description: 'Recommend safe, focused refactoring opportunities that improve readability and maintainability without changing behavior.',
  prompt: `${REFACTORING_SUGGESTER_PROMPT}\n\nUse Read, Grep, and Glob to inspect code. Use Skill when specialized guidance is needed. Recommend changes only; do not modify files.`,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  model: 'inherit'
};
