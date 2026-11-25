import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { openAiProfileSpec } from "./fixtures/openai-profile-spec"

const AUDIENCE = "https://app.example.com/mcp/openai"
const introspect = vi.hoisted(() => vi.fn())

vi.mock("../src/token-introspection", () => ({ introspectToken: introspect }))

vi.mock("../src/openapi-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/openapi-loader")>()
  return {
    ...actual,
    getCachedSpec: () => openAiProfileSpec,
    refreshOpenApiSpecIfStale: async () => [],
  }
})

const principal = (overrides: Record<string, unknown> = {}) => ({
  audience: AUDIENCE,
  clientId: "client-1",
  credentialType: "oauth",
  issuer: "https://app.example.com",
  subject: "user-1",
  ...overrides,
})
const ok = (overrides: Record<string, unknown> = {}, workspaceId = "w1") => ({
  data: {
    permission: "full",
    principal: principal(overrides),
    scopes: null,
    workspaceId,
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
  vi.stubEnv("CHATBOTX_MCP_PUBLIC_URL", "https://app.example.com")
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
  path = "/openai",
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

describe("OpenAI transport authentication", () => {
  test("missing token returns 401 even when an environment key is set", async () => {
    const response = await post({})
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(
      "/.well-known/oauth-protected-resource/mcp/openai",
    )
    expect(introspect).not.toHaveBeenCalled()
  })

  test("an API key (non-OAuth principal) is rejected", async () => {
    introspect.mockResolvedValue(ok({ credentialType: "workspace_token" }))
    expect((await post(bearer)).status).toBe(401)
  })

  test("query tokens and alternate headers are rejected", async () => {
    introspect.mockResolvedValue(ok())
    expect(
      (await post(bearer, initialize, "/openai?workspace_token=x")).status,
    ).toBe(401)
    expect((await post({ ...bearer, "x-workspace-token": "x" })).status).toBe(
      401,
    )
  })

  test("the default audience is rejected", async () => {
    introspect.mockResolvedValue(
      ok({ audience: "https://app.example.com/mcp" }),
    )
    expect((await post(bearer)).status).toBe(401)
  })

  test("unavailable verification returns a safe 503", async () => {
    introspect.mockResolvedValue({ status: "unavailable" })
    const response = await post(bearer)
    expect(response.status).toBe(503)
  })

  test("raw introspection messages never reach the client", async () => {
    introspect.mockResolvedValue({
      message: "Available: w1 (Secret Workspace)",
      status: "configError",
    })
    const response = await post(bearer)
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("Secret Workspace")
  })

  test("the legacy OAuth toggle cannot disable authentication", async () => {
    vi.stubEnv("CHATBOTX_MCP_OAUTH_ENABLED", "false")
    vi.resetModules()
    const response = await post({})
    expect(response.status).toBe(401)
  })
})

describe("OpenAI transport origin and CORS", () => {
  test("an invalid Origin returns 403 before authentication", async () => {
    const response = await post({ ...bearer, Origin: "https://evil.example" })
    expect(response.status).toBe(403)
    expect(introspect).not.toHaveBeenCalled()
  })

  test("preflight from an allowed origin needs no token and lists DELETE", async () => {
    const response = await fetch(`${base}/openai`, {
      headers: { Origin: "https://chatgpt.com" },
      method: "OPTIONS",
    })
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "DELETE",
    )
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://chatgpt.com",
    )
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "Mcp-Session-Id",
    )
  })

  test("preflight from an invalid origin is 403", async () => {
    const response = await fetch(`${base}/openai`, {
      headers: { Origin: "https://evil.example" },
      method: "OPTIONS",
    })
    expect(response.status).toBe(403)
  })
})

describe("OpenAI transport sessions", () => {
  const start = async () => {
    introspect.mockResolvedValue(ok())
    const response = await post(bearer)
    expect(response.status).toBe(200)
    const id = response.headers.get("mcp-session-id") as string
    expect(id).toBeTruthy()
    return id
  }

  test("lists exactly the fixed tools and DELETE closes the session", async () => {
    const id = await start()
    const list = await post(
      { ...bearer, "Mcp-Protocol-Version": "2025-06-18", "Mcp-Session-Id": id },
      { id: 2, jsonrpc: "2.0", method: "tools/list" },
    )
    const text = await list.text()
    expect(text).toContain("contacts_send_message")
    expect(text).not.toContain("search_tools")
    const del = await fetch(`${base}/openai`, {
      headers: {
        ...bearer,
        "Mcp-Protocol-Version": "2025-06-18",
        "Mcp-Session-Id": id,
      },
      method: "DELETE",
    })
    expect(del.status).toBe(200)
    const after = await post({ ...bearer, "Mcp-Session-Id": id })
    expect(after.status).toBe(404)
  })

  test("a different identity or workspace cannot use the session", async () => {
    const id = await start()
    introspect.mockResolvedValue(ok({ subject: "user-2" }))
    expect((await post({ ...bearer, "Mcp-Session-Id": id })).status).toBe(403)
    introspect.mockResolvedValue(ok({}, "w2"))
    expect((await post({ ...bearer, "Mcp-Session-Id": id })).status).toBe(403)
  })

  test("a default-profile session id does not resolve on the OpenAI path", async () => {
    introspect.mockResolvedValue(
      ok({ audience: "https://app.example.com/mcp" }),
    )
    const defaultStart = await post(bearer, initialize, "/messages")
    const id = defaultStart.headers.get("mcp-session-id") as string
    expect(id).toBeTruthy()
    introspect.mockResolvedValue(ok())
    expect((await post({ ...bearer, "Mcp-Session-Id": id })).status).toBe(404)
  })
})

describe("OpenAI audience on the default transport", () => {
  test("an OpenAI-audience token cannot authenticate the default messages path", async () => {
    introspect.mockResolvedValue(ok())
    const response = await post(bearer, initialize, "/messages")
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    )
  })

  test("while introspection is unavailable, a profile JWT is still refused on the default path", async () => {
    introspect.mockResolvedValue({ status: "unavailable" })
    const payload = Buffer.from(JSON.stringify({ aud: AUDIENCE })).toString(
      "base64url",
    )
    const response = await post(
      { Authorization: `Bearer h.${payload}.s` },
      initialize,
      "/messages",
    )
    expect(response.status).toBe(401)
  })

  test("while introspection is unavailable, an opaque token still fails open on the default path", async () => {
    introspect.mockResolvedValue({ status: "unavailable" })
    expect((await post(bearer, initialize, "/messages")).status).toBe(200)
  })

  test("a default-audience token still authenticates the default path", async () => {
    introspect.mockResolvedValue(
      ok({ audience: "https://app.example.com/mcp" }),
    )
    expect((await post(bearer, initialize, "/messages")).status).toBe(200)
  })
})

describe("OpenAI session eviction", () => {
  test("an idle session is closed and no longer resolves", async () => {
    vi.stubEnv("CHATBOTX_MCP_SESSION_IDLE_TTL_MS", "1000")
    vi.resetModules()
    const { IdleSessionSweeper } = await import("../src/server/session-sweeper")
    const evicted: string[] = []
    const sweeper = new IdleSessionSweeper((id) => {
      evicted.push(id)
    })
    sweeper.touch("a")
    sweeper.touch("b")
    expect(await sweeper.sweep(Date.now() + 500)).toBe(0)
    sweeper.touch("b")
    expect(await sweeper.sweep(Date.now() + 1500)).toBe(2)
    expect(evicted.sort()).toEqual(["a", "b"])
    sweeper.stop()
  })

  test("a forgotten session is not evicted twice", async () => {
    vi.stubEnv("CHATBOTX_MCP_SESSION_IDLE_TTL_MS", "1000")
    vi.resetModules()
    const { IdleSessionSweeper } = await import("../src/server/session-sweeper")
    const evict = vi.fn()
    const sweeper = new IdleSessionSweeper(evict)
    sweeper.touch("a")
    sweeper.forget("a")
    expect(await sweeper.sweep(Date.now() + 5000)).toBe(0)
    expect(evict).not.toHaveBeenCalled()
    sweeper.stop()
  })
})

describe("OpenAI metadata and paths", () => {
  test("OpenAI metadata is not served when OAuth is disabled", async () => {
    vi.stubEnv("CHATBOTX_MCP_OAUTH_ENABLED", "false")
    vi.resetModules()
    const { createRequestListener } = await import("../src/server/sse-server")
    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const disabled = createServer(createRequestListener(createMcpServer))
    await new Promise<void>((resolve) =>
      disabled.listen(0, "127.0.0.1", resolve),
    )
    try {
      const url = `http://127.0.0.1:${(disabled.address() as AddressInfo).port}`
      const response = await fetch(
        `${url}/.well-known/oauth-protected-resource/mcp/openai`,
      )
      expect(response.status).toBe(404)
    } finally {
      disabled.closeAllConnections()
      await new Promise((resolve) => disabled.close(resolve))
    }
  })

  test("protected-resource metadata names the OpenAI resource", async () => {
    const response = await fetch(
      `${base}/.well-known/oauth-protected-resource/mcp/openai`,
    )
    expect(await response.json()).toMatchObject({ resource: AUDIENCE })
  })

  test("default metadata still names the shared resource", async () => {
    const response = await fetch(
      `${base}/.well-known/oauth-protected-resource/mcp/messages`,
    )
    expect(await response.json()).toMatchObject({
      resource: "https://app.example.com/mcp",
    })
  })

  test("the OpenAI profile is served under the base path", async () => {
    vi.stubEnv("CHATBOTX_MCP_BASE_PATH", "/mcp")
    vi.resetModules()
    const { createRequestListener } = await import("../src/server/sse-server")
    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const prefixed = createServer(createRequestListener(createMcpServer))
    await new Promise<void>((resolve) =>
      prefixed.listen(0, "127.0.0.1", resolve),
    )
    try {
      const url = `http://127.0.0.1:${(prefixed.address() as AddressInfo).port}`
      const response = await fetch(`${url}/mcp/openai`, {
        body: JSON.stringify(initialize),
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        method: "POST",
      })
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toContain(
        'resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp/openai"',
      )
    } finally {
      prefixed.closeAllConnections()
      await new Promise((resolve) => prefixed.close(resolve))
    }
  })
})
