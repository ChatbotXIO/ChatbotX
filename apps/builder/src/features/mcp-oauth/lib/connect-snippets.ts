type McpConnectSnippetInput = {
  builderUrl: string
  mcpUrl: string
  workspaceId: string
}

export type McpConnectSnippets = {
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
  workspaceId,
}: McpConnectSnippetInput): McpConnectSnippets => {
  const streamableUrl = `${mcpUrl}/messages?workspace_id=${workspaceId}`
  const sseUrl = `${mcpUrl}/sse?workspace_id=${workspaceId}`
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
