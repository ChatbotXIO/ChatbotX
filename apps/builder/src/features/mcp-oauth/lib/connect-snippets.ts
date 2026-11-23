type McpConnectSnippetInput = {
  builderUrl: string
  mcpUrl: string
}

type McpConnectSnippets = {
  streamableUrl: string
  sseUrl: string
  claudeCode: string
  claudeDesktop: string
  cursor: string
  chatgpt: string
  stdio: string
}

export const buildMcpConnectSnippets = ({
  builderUrl,
  mcpUrl,
}: McpConnectSnippetInput): McpConnectSnippets => {
  // No workspace id: the user picks the workspace on the OAuth consent
  // screen, so one URL serves every account (marketplace installs included).
  const streamableUrl = `${mcpUrl}/messages`
  const sseUrl = `${mcpUrl}/sse`
  // ChatGPT/Codex use the separate OpenAI profile (own OAuth audience), not
  // the default endpoints.
  const openAiUrl = `${mcpUrl}/openai`
  const httpConfig = JSON.stringify(
    {
      mcpServers: {
        mcp: {
          type: "http",
          url: streamableUrl,
        },
      },
    },
    null,
    2,
  )

  return {
    streamableUrl,
    sseUrl,
    claudeCode: `claude mcp add mcp -t http -s user "${streamableUrl}"`,
    claudeDesktop: httpConfig,
    cursor: httpConfig,
    chatgpt: openAiUrl,
    stdio: `CHATBOTX_API_URL=${builderUrl}/api CHATBOTX_API_KEY=<workspace-token> npx -y chatbotx-mcp`,
  }
}
