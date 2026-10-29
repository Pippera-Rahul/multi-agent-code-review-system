import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/index.js';

export const codeQualityAnalyzer: AgentDefinition = {
  description: 'Find correctness, security, performance, and maintainability issues in changed code.',
  prompt: `${CODE_QUALITY_ANALYZER_PROMPT}\n\nUse Skill when specialized guidance is needed. For JavaScript files, invoke Skill "javascript-best-practices".`,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  model: 'inherit'
};
