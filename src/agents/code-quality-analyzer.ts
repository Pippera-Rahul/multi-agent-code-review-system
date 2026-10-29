import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/index.js';

export const codeQualityAnalyzer: AgentDefinition = {
  description: 'Find correctness, security, performance, and maintainability issues in changed code.',
  prompt: `${CODE_QUALITY_ANALYZER_PROMPT}

Before analyzing changed files, select and invoke relevant skills using the Skill tool:
- For .js or .jsx files, invoke Skill "javascript-best-practices".
- For .ts or .tsx files, invoke Skill "typescript-patterns".
- For security-sensitive code or potential vulnerabilities in any language, invoke Skill "security-analysis".
Use the selected skill guidance when evaluating findings. You may invoke multiple skills when applicable. Do not invent issues; report actionable findings consistent with the required output schema.`,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  model: 'inherit'
};
