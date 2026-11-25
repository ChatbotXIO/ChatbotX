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

    expect(buildProtectedResourceMetadata(request())).toMatchObject({
      resource: "https://mcp.public.example.com/mcp",
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
      ).resource,
    ).toBe("https://mcp.proxy.example.com/mcp")
  })

  test("falls back to the Host header", async () => {
    const { buildProtectedResourceMetadata } = await loadOAuth()

    expect(
      buildProtectedResourceMetadata(request({ host: "mcp.local:3333" }))
        .resource,
    ).toBe("http://mcp.local:3333/mcp")
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
      buildProtectedResourceMetadata(request({ host: "mcp.local" }))
        .authorization_servers,
    ).toEqual(["https://builder.example.com"])
  })
})

describe("isConnectorProfileAudience", () => {
  test("matches profile audiences by path, whatever the origin", async () => {
    const { isConnectorProfileAudience } = await loadOAuth()

    expect(
      isConnectorProfileAudience("https://app.example.com/mcp/openai"),
    ).toBe(true)
    expect(
      isConnectorProfileAudience("https://other.example.com/mcp/claude/"),
    ).toBe(true)
    expect(isConnectorProfileAudience("https://app.example.com/mcp")).toBe(
      false,
    )
    expect(
      isConnectorProfileAudience("https://app.example.com/mcp/openai-x"),
    ).toBe(false)
    expect(isConnectorProfileAudience("not a url")).toBe(false)
  })
})

describe("unverifiedJwtAudiences", () => {
  const jwt = (claims: object) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`

  test("reads a string or array aud without verifying", async () => {
    const { unverifiedJwtAudiences } = await loadOAuth()

    expect(
      unverifiedJwtAudiences(jwt({ aud: "https://a/mcp/openai" })),
    ).toEqual(["https://a/mcp/openai"])
    expect(unverifiedJwtAudiences(jwt({ aud: ["x", 1, "y"] }))).toEqual([
      "x",
      "y",
    ])
  })

  test("returns nothing for opaque tokens or malformed payloads", async () => {
    const { unverifiedJwtAudiences } = await loadOAuth()

    expect(unverifiedJwtAudiences("cbx_opaque_token")).toEqual([])
    expect(unverifiedJwtAudiences("a.%%%.c")).toEqual([])
    expect(unverifiedJwtAudiences(jwt({ sub: "1" }))).toEqual([])
  })
})
