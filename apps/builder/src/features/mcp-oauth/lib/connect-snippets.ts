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
  const httpConfig = JSON.stringify(
    {
      mcpServers: {
        chatbotx: {
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
    claudeCode: `claude mcp add chatbotx -t http -s user "${streamableUrl}"`,
    claudeDesktop: httpConfig,
    cursor: httpConfig,
    chatgpt: sseUrl,
    stdio: `CHATBOTX_API_URL=${builderUrl}/api CHATBOTX_API_KEY=<workspace-token> npx -y chatbotx-mcp`,
  }
}
