import { describe, expect, test } from "vitest"
import { buildMcpConnectSnippets } from "@/features/mcp-oauth/lib/connect-snippets"

describe("buildMcpConnectSnippets", () => {
  test("builds OAuth and workspace-token connection artifacts", () => {
    const snippets = buildMcpConnectSnippets({
      builderUrl: "https://app.chatbotx.io",
      mcpUrl: "https://app.chatbotx.io/mcp",
      workspaceId: "42",
    })

    expect(snippets.streamableUrl).toBe(
      "https://app.chatbotx.io/mcp/messages?workspace_id=42",
    )
    expect(snippets.sseUrl).toBe(
      "https://app.chatbotx.io/mcp/sse?workspace_id=42",
    )
    expect(snippets.claudeCode).toBe(
      'claude mcp add chatbotx -t http -s user "https://app.chatbotx.io/mcp/messages?workspace_id=42"',
    )
    expect(JSON.parse(snippets.claudeDesktop)).toEqual({
      mcpServers: {
        chatbotx: {
          type: "http",
          url: snippets.streamableUrl,
        },
      },
    })
    expect(JSON.parse(snippets.cursor)).toEqual({
      mcpServers: {
        chatbotx: {
          type: "http",
          url: snippets.streamableUrl,
        },
      },
    })
    expect(snippets.chatgpt).toBe(snippets.sseUrl)
    expect(snippets.stdio).toBe(
      "CHATBOTX_API_URL=https://app.chatbotx.io/api CHATBOTX_API_KEY=<workspace-token> npx -y chatbotx-mcp",
    )
  })
})
