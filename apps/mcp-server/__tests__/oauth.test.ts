import type { IncomingMessage } from "node:http"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const request = (
  headers: Record<string, string | string[]> = {},
): IncomingMessage => ({ headers }) as IncomingMessage

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  process.env = {
    ...originalEnv,
    CHATBOTX_API_URL: "https://builder.example.com/api",
    CHATBOTX_MCP_OAUTH_ENABLED: "true",
  }
  delete process.env.CHATBOTX_MCP_OAUTH_ISSUER
  delete process.env.CHATBOTX_MCP_PUBLIC_URL
})

afterEach(() => {
  process.env = { ...originalEnv }
})

// oauth.ts reads the environment during module evaluation, so each case loads it after its setup.
const loadOAuth = async () => await import("../src/oauth")

describe("OAuth protected-resource metadata", () => {
  test("uses CHATBOTX_MCP_PUBLIC_URL for the advertised resource", async () => {
    process.env.CHATBOTX_MCP_PUBLIC_URL = "https://mcp.public.example.com/base"
    const { buildProtectedResourceMetadata } = await loadOAuth()

    expect(
      buildProtectedResourceMetadata(request(), "/messages"),
    ).toMatchObject({
      resource: "https://mcp.public.example.com/messages",
      authorization_servers: ["https://builder.example.com"],
      bearer_methods_supported: ["header"],
    })
  })

  test("uses forwarded protocol and host behind a proxy", async () => {
    const { buildProtectedResourceMetadata } = await loadOAuth()

    expect(
      buildProtectedResourceMetadata(
        request({
          "x-forwarded-host": "mcp.proxy.example.com",
          "x-forwarded-proto": "https",
          host: "internal:3333",
        }),
        "/messages",
      ).resource,
    ).toBe("https://mcp.proxy.example.com/messages")
  })

  test("falls back to the Host header", async () => {
    const { buildProtectedResourceMetadata } = await loadOAuth()

    expect(
      buildProtectedResourceMetadata(
        request({ host: "mcp.local:3333" }),
        "/sse",
      ).resource,
    ).toBe("http://mcp.local:3333/sse")
  })

  test("builds a bearer challenge with invalid-token details when requested", async () => {
    const { buildWwwAuthenticate } = await loadOAuth()

    expect(
      buildWwwAuthenticate(request({ host: "mcp.local" }), "/messages"),
    ).toBe(
      'Bearer resource_metadata="http://mcp.local/.well-known/oauth-protected-resource/messages"',
    )
    expect(
      buildWwwAuthenticate(
        request({ host: "mcp.local" }),
        "/messages",
        "invalid_token",
      ),
    ).toContain('error="invalid_token"')
  })

  test("derives the issuer without the API path", async () => {
    process.env.CHATBOTX_API_URL = "https://builder.example.com/api/"
    const { buildProtectedResourceMetadata } = await loadOAuth()

    expect(
      buildProtectedResourceMetadata(request({ host: "mcp.local" }), "/sse")
        .authorization_servers,
    ).toEqual(["https://builder.example.com"])
  })
})
