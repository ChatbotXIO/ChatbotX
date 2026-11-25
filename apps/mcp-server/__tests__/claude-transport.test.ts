import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { claudeProfileSpec } from "./fixtures/claude-profile-spec"

const BASE_PATH_MIGRATION = /CHATBOTX_MCP_BASE_PATH/
const ORIGIN = "https://app.example.com"
const AUDIENCE = `${ORIGIN}/mcp/claude`
const introspect = vi.hoisted(() => vi.fn())

vi.mock("../src/token-introspection", () => ({ introspectToken: introspect }))

vi.mock("../src/openapi-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/openapi-loader")>()
  const tools = actual.parseToolsFromSpec(claudeProfileSpec as never)
  return {
    ...actual,
    getCachedTools: () => tools,
    getToolByName: (name: string) => tools.find((tool) => tool.name === name),
    getVisibleTools: () =>
      tools.filter((tool) => tool.visibility === "default"),
    refreshOpenApiSpecIfStale: async () => tools,
  }
})

const principal = (overrides: Record<string, unknown> = {}) => ({
  audience: AUDIENCE,
  clientId: "client-1",
  credentialType: "oauth",
  issuer: ORIGIN,
  subject: "user-1",
  ...overrides,
})
const ok = (overrides: Record<string, unknown> = {}) => ({
  data: {
    permission: "full",
    principal: principal(overrides),
    scopes: null,
    workspaceId: "w1",
  },
  status: "ok",
})

const initialize = {
  id: 1,
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
    protocolVersion: "2025-06-18",
  },
}

let server: Server
let base = ""

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv("CHATBOTX_MCP_PUBLIC_URL", ORIGIN)
  vi.stubEnv("CHATBOTX_API_KEY", "env-key")
  introspect.mockReset()
  const { createRequestListener } = await import("../src/server/sse-server")
  const { createMcpServer } = await import("../src/server/create-mcp-server")
  server = createServer(createRequestListener(createMcpServer))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  vi.unstubAllEnvs()
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

const post = (
  headers: Record<string, string>,
  body: unknown = initialize,
  path = "/claude",
) =>
  fetch(`${base}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  })

const bearer = { Authorization: "Bearer good" }

const startSession = async (): Promise<string> => {
  introspect.mockResolvedValue(ok())
  const response = await post(bearer)
  expect(response.status).toBe(200)
  return response.headers.get("mcp-session-id") as string
}

const rpc = (sessionId: string, body: unknown) =>
  post(
    {
      ...bearer,
      "Mcp-Protocol-Version": "2025-06-18",
      "Mcp-Session-Id": sessionId,
    },
    body,
  )

describe("Claude transport authentication", () => {
  test("a request without a token gets a bare challenge for the Claude resource", async () => {
    const response = await post({})
    expect(response.status).toBe(401)
    const challenge = response.headers.get("www-authenticate") ?? ""
    expect(challenge).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp/claude"`,
    )
    // RFC 6750 §3.1: no error code when the request carried no credentials.
    expect(challenge).not.toContain("error=")
    expect(introspect).not.toHaveBeenCalled()
  })

  test.each([
    ["the default MCP audience", `${ORIGIN}/mcp`],
    ["the OpenAI profile audience", `${ORIGIN}/mcp/openai`],
  ])("a token for %s is rejected", async (_label, audience) => {
    introspect.mockResolvedValue(ok({ audience }))
    const response = await post(bearer)
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    )
  })

  test("an API key is rejected even though the environment has one", async () => {
    introspect.mockResolvedValue(ok({ credentialType: "workspace_token" }))
    expect((await post(bearer)).status).toBe(401)
  })

  test("an Origin outside the allow-list is refused before authentication", async () => {
    const response = await post({ ...bearer, Origin: "https://evil.example" })
    expect(response.status).toBe(403)
    expect(introspect).not.toHaveBeenCalled()
  })

  test("claude.ai is an allowed Origin", async () => {
    const response = await fetch(`${base}/claude`, {
      headers: { Origin: "https://claude.ai" },
      method: "OPTIONS",
    })
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://claude.ai",
    )
  })
})

describe("Claude transport tools", () => {
  test("lists only profile tools with the directory annotations", async () => {
    const id = await startSession()
    const response = await rpc(id, {
      id: 2,
      jsonrpc: "2.0",
      method: "tools/list",
    })
    const text = await response.text()
    expect(text).toContain("contacts_create")
    expect(text).toContain("get_guide")
    expect(text).not.toContain("call_tool")
    expect(text).not.toContain("search_tools")
    expect(text).not.toContain("connections_create")
  })

  test("calling an operation outside the profile is an unknown tool", async () => {
    const id = await startSession()
    const response = await rpc(id, {
      id: 3,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: {}, name: "contacts_bulk_delete" },
    })
    expect(await response.text()).toContain(
      "Unknown tool: contacts_bulk_delete",
    )
  })

  test("a write still asks for confirmation before anything is sent", async () => {
    const id = await startSession()
    const response = await rpc(id, {
      id: 4,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { name: "Ada" }, name: "contacts_create" },
    })
    expect(await response.text()).toContain("CONFIRMATION_REQUIRED")
  })
})

describe("Claude audience on other transports", () => {
  test("a Claude-audience token cannot authenticate the default messages path", async () => {
    introspect.mockResolvedValue(ok())
    const response = await post(bearer, initialize, "/messages")
    expect(response.status).toBe(401)
  })

  test("a Claude-audience token cannot authenticate the OpenAI path", async () => {
    introspect.mockResolvedValue(ok())
    expect((await post(bearer, initialize, "/openai")).status).toBe(401)
  })

  test("a Claude session id does not resolve on the OpenAI path", async () => {
    const id = await startSession()
    introspect.mockResolvedValue(ok({ audience: `${ORIGIN}/mcp/openai` }))
    const response = await post(
      { ...bearer, "Mcp-Session-Id": id },
      initialize,
      "/openai",
    )
    expect(response.status).toBe(404)
  })
})

describe("Claude metadata and paths", () => {
  test("protected-resource metadata names the exact Claude resource", async () => {
    const response = await fetch(
      `${base}/.well-known/oauth-protected-resource/mcp/claude`,
    )
    expect(await response.json()).toMatchObject({ resource: AUDIENCE })
  })
})

describe("MCP base path", () => {
  // Production forwards /mcp/* unchanged, so every route lives under the
  // configured prefix: /mcp/messages, /mcp/sse, /mcp/claude, /mcp/openai.
  const listen = async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const prefixed = createServer(createRequestListener(createMcpServer))
    await new Promise<void>((resolve) =>
      prefixed.listen(0, "127.0.0.1", resolve),
    )
    return prefixed
  }

  test("serves the Claude profile and the default profile under the prefix", async () => {
    vi.stubEnv("CHATBOTX_MCP_BASE_PATH", "/mcp")
    vi.stubEnv("CHATBOTX_API_KEY", "")
    vi.resetModules()
    const prefixed = await listen()
    try {
      const url = `http://127.0.0.1:${(prefixed.address() as AddressInfo).port}`
      const send = (path: string, headers: Record<string, string> = {}) =>
        fetch(`${url}${path}`, {
          body: JSON.stringify(initialize),
          headers: {
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            ...headers,
          },
          method: "POST",
        })

      const claude = await send("/mcp/claude")
      expect(claude.status).toBe(401)
      expect(claude.headers.get("www-authenticate")).toContain(
        `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp/claude"`,
      )

      introspect.mockResolvedValue(ok())
      const session = await send("/mcp/claude", bearer)
      expect(session.status).toBe(200)
      expect(session.headers.get("mcp-session-id")).toBeTruthy()

      introspect.mockReset()
      const messages = await send("/mcp/messages")
      expect(messages.status).toBe(401)
      expect(messages.headers.get("www-authenticate")).toContain(
        `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp/messages"`,
      )

      expect((await send("/claude")).status).toBe(404)
      expect((await send("/messages")).status).toBe(404)
    } finally {
      prefixed.closeAllConnections()
      await new Promise((resolve) => prefixed.close(resolve))
    }
  })

  test.each([
    ["CHATBOTX_MCP_MESSAGES_PATH", "/mcp/messages"],
    ["CHATBOTX_MCP_SSE_PATH", "/mcp/sse"],
  ])("refuses to start while the removed %s is still set", async (name, value) => {
    vi.stubEnv(name, value)
    vi.resetModules()
    const { assertMcpPathConfig } = await import("../src/server/sse-server")
    expect(assertMcpPathConfig).toThrow(BASE_PATH_MIGRATION)
  })

  test.each([
    "mcp",
    "/mcp/",
    "/.well-known/oauth-protected-resource",
  ])("rejects the base path %s", async (value) => {
    vi.stubEnv("CHATBOTX_MCP_BASE_PATH", value)
    vi.resetModules()
    await expect(import("../src/server/sse-server")).rejects.toThrow()
  })
})

describe("connector profile path matching", () => {
  test.each([
    ["/claude", "claude"],
    ["/openai", "openai"],
    ["/.well-known/oauth-protected-resource/mcp/claude", "claude"],
    ["/.well-known/oauth-protected-resource/mcp/claude/nested", "claude"],
    ["/.well-known/oauth-protected-resource/openai", "openai"],
    ["/v1/claude", undefined],
    ["/messages", undefined],
    ["/.well-known/oauth-protected-resource/mcp/claude-other", undefined],
    ["/.well-known/oauth-protected-resource/mcp/messages", undefined],
  ])("%s belongs to %s", async (pathname, profile) => {
    const { profileForPath } = await import("../src/oauth")
    expect(profileForPath(pathname)).toBe(profile)
  })
})
