/**
 * Model Context Protocol (MCP) server configurations.
 */
export const mcpServersConfig = {
  github: {
    type: 'http' as const,
    url: 'https://api.githubcopilot.com/mcp/',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`,
      'User-Agent': 'Code-Review-Capstone'
    }
  },
  eslint: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@eslint/mcp@latest'],
    env: {}
  }
};
