import { describe, expect, test } from "vitest"
import { buildMcpConnectSnippets } from "@/features/mcp-oauth/lib/connect-snippets"

describe("buildMcpConnectSnippets", () => {
  test("builds workspace-free OAuth URLs and the workspace-token fallback", () => {
    const snippets = buildMcpConnectSnippets({
      builderUrl: "https://app.chatbotx.io",
      mcpUrl: "https://app.chatbotx.io/mcp",
    })

    expect(snippets.streamableUrl).toBe("https://app.chatbotx.io/mcp/messages")
    expect(snippets.sseUrl).toBe("https://app.chatbotx.io/mcp/sse")
    expect(snippets.claudeCode).toBe(
      'claude mcp add mcp -t http -s user "https://app.chatbotx.io/mcp/messages"',
    )
    expect(JSON.parse(snippets.claudeDesktop)).toEqual({
      mcpServers: {
        mcp: {
          type: "http",
          url: snippets.streamableUrl,
        },
      },
    })
    expect(JSON.parse(snippets.cursor)).toEqual({
      mcpServers: {
        mcp: {
          type: "http",
          url: snippets.streamableUrl,
        },
      },
    })
    expect(snippets.chatgpt).toBe("https://app.chatbotx.io/mcp/openai")
    expect(snippets.claudeAi).toBe("https://app.chatbotx.io/mcp/claude")
    expect(snippets.openclawInstall).toBe(
      "openclaw plugins install clawhub:@chatbotx/chatbotx",
    )
    expect(snippets.openclawLogin).toBe("openclaw mcp login chatbotx")
    expect(snippets.hermes).toBe(
      [
        "mcp_servers:",
        "  mcp:",
        '    url: "https://app.chatbotx.io/mcp/messages"',
        "    auth: oauth",
      ].join("\n"),
    )
    expect(snippets.stdio).toBe(
      "CHATBOTX_API_URL=https://app.chatbotx.io/api CHATBOTX_API_KEY=<workspace-token> npx -y chatbotx-mcp",
    )
  })
})
