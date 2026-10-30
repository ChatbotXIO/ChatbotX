import { beforeEach, describe, expect, test, vi } from "vitest"
import { GET } from "@/app/.well-known/oauth-protected-resource/[...path]/route"
import {
  getMcpPublicPath,
  getMcpPublicUrl,
} from "@/features/mcp-oauth/lib/mcp-oauth"

const env = vi.hoisted(() => ({
  BETTER_AUTH_URL: "https://app.chatbotx.io",
  MCP_PUBLIC_URL: undefined as string | undefined,
  NEXT_PUBLIC_BUILDER_URL: "https://app.chatbotx.io",
}))
vi.mock("@/env", () => ({ env }))

const getMetadata = async (path: string[]) =>
  await GET(new Request("https://app.chatbotx.io"), {
    params: Promise.resolve({ path }),
  })

describe("OAuth protected resource discovery", () => {
  beforeEach(() => {
    env.MCP_PUBLIC_URL = undefined
  })

  test("serves metadata for the configured MCP prefix", async () => {
    const response = await getMetadata(["mcp", "messages"])

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      authorization_servers: ["https://app.chatbotx.io"],
      bearer_methods_supported: ["header"],
      resource: "https://app.chatbotx.io/mcp",
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    })
  })

  test("returns 404 when the configured MCP URL has no path", async () => {
    env.MCP_PUBLIC_URL = "https://app.chatbotx.io"

    expect((await getMetadata(["mcp"])).status).toBe(404)
  })

  test("returns 404 when the MCP URL has another origin", async () => {
    env.MCP_PUBLIC_URL = "https://mcp.chatbotx.io/mcp"

    expect((await getMetadata(["mcp"])).status).toBe(404)
  })

  test("normalizes a configured trailing slash", async () => {
    env.MCP_PUBLIC_URL = "https://app.chatbotx.io/mcp/"

    const response = await getMetadata(["mcp"])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://app.chatbotx.io/mcp",
    })
  })

  test("returns 404 for a prefix lookalike", async () => {
    expect((await getMetadata(["mcp-client"])).status).toBe(404)
  })

  test("uses the fallback or configured MCP URL without a trailing slash", () => {
    expect(getMcpPublicUrl()).toBe("https://app.chatbotx.io/mcp")
    expect(getMcpPublicPath()).toBe("/mcp")

    env.MCP_PUBLIC_URL = "https://app.chatbotx.io/mcp/"

    expect(getMcpPublicUrl()).toBe("https://app.chatbotx.io/mcp")
    expect(getMcpPublicPath()).toBe("/mcp")
  })
})
