type McpConnectSnippetInput = {
  builderUrl: string
  mcpUrl: string
}

export type McpConnectSnippets = {
  streamableUrl: string
  sseUrl: string
  claudeAi: string
  claudeCode: string
  claudeDesktop: string
  cursor: string
  chatgpt: string
  openclawInstall: string
  openclawLogin: string
  hermes: string
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
  // claude.ai custom connectors (web, desktop, mobile) use the Claude profile.
  const claudeAiUrl = `${mcpUrl}/claude`
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
    claudeAi: claudeAiUrl,
    claudeCode: `claude mcp add mcp -t http -s user "${streamableUrl}"`,
    claudeDesktop: httpConfig,
    cursor: httpConfig,
    chatgpt: openAiUrl,
    openclawInstall: "openclaw plugins install clawhub:@chatbotx/chatbotx",
    openclawLogin: "openclaw mcp login chatbotx",
    // Hermes Agent: ~/.hermes/config.yaml; `auth: oauth` runs the browser flow.
    hermes: [
      "mcp_servers:",
      "  mcp:",
      `    url: "${streamableUrl}"`,
      "    auth: oauth",
    ].join("\n"),
    stdio: `CHATBOTX_API_URL=${builderUrl}/api CHATBOTX_API_KEY=<workspace-token> npx -y chatbotx-mcp`,
  }
}
