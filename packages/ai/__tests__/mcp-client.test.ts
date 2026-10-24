import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertSafeMcpEndpoint: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  assertSafeMcpEndpoint: mocks.assertSafeMcpEndpoint,
}))

const { McpClient } = await import("../src/server/mcp-client")

describe("McpClient", () => {
  test("rejects unsafe endpoints before sending a request", async () => {
    mocks.assertSafeMcpEndpoint.mockRejectedValue(new Error("blocked"))
    const client = new McpClient({
      auth: { token: "secret", type: "token" },
      url: "http://127.0.0.1:3000/mcp",
    })

    await expect(client.initialize()).rejects.toThrow("blocked")
    expect(mocks.assertSafeMcpEndpoint).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/mcp",
    )
  })

  test("validates the endpoint once across consecutive requests", async () => {
    mocks.assertSafeMcpEndpoint.mockReset()
    mocks.assertSafeMcpEndpoint.mockResolvedValue(undefined)
    const client = new McpClient({
      auth: { token: "secret", type: "token" },
      url: "https://mcp.example.com/mcp",
    })
    // Both requests fail at the (unmocked) network layer; only the guard call
    // count matters here.
    await client.initialize().catch(() => undefined)
    await client.initialize().catch(() => undefined)

    expect(mocks.assertSafeMcpEndpoint).toHaveBeenCalledTimes(1)
  })

  test("re-validates after a rejected check instead of caching the failure", async () => {
    mocks.assertSafeMcpEndpoint.mockReset()
    mocks.assertSafeMcpEndpoint.mockRejectedValue(new Error("blocked"))
    const client = new McpClient({
      auth: { token: "secret", type: "token" },
      url: "https://mcp.example.com/mcp",
    })

    await expect(client.initialize()).rejects.toThrow("blocked")
    await expect(client.initialize()).rejects.toThrow("blocked")

    expect(mocks.assertSafeMcpEndpoint).toHaveBeenCalledTimes(2)
  })
})
