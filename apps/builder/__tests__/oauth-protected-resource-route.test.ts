import { describe, expect, test, vi } from "vitest"
import { GET } from "@/app/.well-known/oauth-protected-resource/[...path]/route"

vi.mock("@/env", () => ({
  env: {
    BETTER_AUTH_URL: "https://app.chatbotx.io",
    MCP_PUBLIC_URL: undefined,
  },
}))

describe("OAuth protected resource discovery", () => {
  test("serves metadata for the configured MCP prefix", async () => {
    const response = await GET(new Request("https://app.chatbotx.io"), {
      params: Promise.resolve({ path: ["mcp", "messages"] }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      authorization_servers: ["https://app.chatbotx.io"],
      bearer_methods_supported: ["header"],
      resource: "https://app.chatbotx.io/mcp/messages",
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    })
  })

  test("returns 404 outside the MCP prefix", async () => {
    const response = await GET(new Request("https://app.chatbotx.io"), {
      params: Promise.resolve({ path: ["api", "contacts"] }),
    })

    expect(response.status).toBe(404)
  })
})
