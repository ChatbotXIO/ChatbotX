import {
  createServer,
  type IncomingMessage,
  request,
  type ServerResponse,
} from "node:http"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Dynamic per-test `import()` (not a static top-level import) matches this
// repo's existing `openapi-loader.test.ts` convention: `sse-server.ts`
// reads `env` from `@t3-oss/env-core` at module-eval time, so a test that
// mutates `process.env.CHATBOTX_API_KEY` must pair `vi.resetModules()`
// with a fresh import to see it — a static import would read `env` once,
// frozen at the first test's `process.env`, for the whole file.

const fakeRequest = (props: {
  url?: string
  headers?: Record<string, string | string[]>
}): IncomingMessage =>
  ({
    url: props.url ?? "/sse",
    headers: props.headers ?? {},
  }) as unknown as IncomingMessage

describe("resolveHeaderValue", () => {
  test("returns a trimmed string header as-is", async () => {
    const { resolveHeaderValue } = await import("../src/server/sse-server")
    expect(resolveHeaderValue("  abc123  ")).toBe("abc123")
  })

  test("returns the first non-empty entry of an array header", async () => {
    const { resolveHeaderValue } = await import("../src/server/sse-server")
    expect(resolveHeaderValue(["", "  ", "abc123"])).toBe("abc123")
  })

  test("returns empty string for undefined", async () => {
    const { resolveHeaderValue } = await import("../src/server/sse-server")
    expect(resolveHeaderValue(undefined)).toBe("")
  })
})

describe("getApiTokenFromRequest — priority order", () => {
  test("Authorization: Bearer wins over everything else", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({
      url: "/sse?workspace_token=from-query&token=ignored",
      headers: {
        authorization: "Bearer from-bearer",
        "x-workspace-token": "ignored-header",
        "x-chatbo-token": "ignored-header-2",
      },
    })
    expect(getApiTokenFromRequest(req)).toBe("from-bearer")
  })

  test("?workspace_token= wins when no Authorization header is present", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({
      url: "/sse?workspace_token=from-query&token=ignored",
      headers: {
        "x-workspace-token": "ignored-header",
        "x-chatbo-token": "ignored-header-2",
      },
    })
    expect(getApiTokenFromRequest(req)).toBe("from-query")
  })

  test("?token= is used when workspace_token is absent", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({ url: "/sse?token=legacy-query" })
    expect(getApiTokenFromRequest(req)).toBe("legacy-query")
  })

  test("x-workspace-token header wins over x-chatbo-token", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({
      headers: {
        "x-workspace-token": "primary-header",
        "x-chatbo-token": "fallback-header",
      },
    })
    expect(getApiTokenFromRequest(req)).toBe("primary-header")
  })

  test("x-chatbo-token is used when x-workspace-token is absent", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    const req = fakeRequest({
      headers: { "x-chatbo-token": "fallback-header" },
    })
    expect(getApiTokenFromRequest(req)).toBe("fallback-header")
  })

  test("returns undefined when the request carries no token", async () => {
    const { getApiTokenFromRequest } = await import("../src/server/sse-server")
    expect(getApiTokenFromRequest(fakeRequest({}))).toBeUndefined()
  })
})

describe("getWorkspaceIdFromRequest", () => {
  test("?workspace_id= wins over the x-workspace-id header", async () => {
    const { getWorkspaceIdFromRequest } = await import(
      "../src/server/sse-server"
    )
    const req = fakeRequest({
      url: "/sse?workspace_id=from-query",
      headers: { "x-workspace-id": "from-header" },
    })
    expect(getWorkspaceIdFromRequest(req)).toBe("from-query")
  })

  test("falls back to the x-workspace-id header", async () => {
    const { getWorkspaceIdFromRequest } = await import(
      "../src/server/sse-server"
    )
    const req = fakeRequest({ headers: { "x-workspace-id": "from-header" } })
    expect(getWorkspaceIdFromRequest(req)).toBe("from-header")
  })

  test("returns undefined when neither is present", async () => {
    const { getWorkspaceIdFromRequest } = await import(
      "../src/server/sse-server"
    )
    expect(getWorkspaceIdFromRequest(fakeRequest({}))).toBeUndefined()
  })
})

describe("makeCredentialState / updateCredentialStateFromRequest", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env.CHATBOTX_API_KEY = "  env-default-token  "
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("falls back to CHATBOTX_API_KEY when the connect request carries no token", async () => {
    const { makeCredentialState } = await import("../src/server/sse-server")
    const state = makeCredentialState(fakeRequest({}))
    expect(state.token).toBe("env-default-token")
  })

  test("seeds state from the connect request's token when present", async () => {
    const { makeCredentialState } = await import("../src/server/sse-server")
    const state = makeCredentialState(
      fakeRequest({ url: "/sse?workspace_token=connect-token" }),
    )
    expect(state.token).toBe("connect-token")
  })

  test("seeds the workspace id from the connect request when present", async () => {
    const { makeCredentialState } = await import("../src/server/sse-server")
    const state = makeCredentialState(
      fakeRequest({ url: "/sse?workspace_id=ws-1" }),
    )
    expect(state.workspaceId).toBe("ws-1")
  })

  test("a later request carrying a token overwrites the session's current token", async () => {
    const { makeCredentialState, updateCredentialStateFromRequest } =
      await import("../src/server/sse-server")
    const state = makeCredentialState(
      fakeRequest({ url: "/sse?workspace_token=token-a" }),
    )
    expect(state.token).toBe("token-a")

    updateCredentialStateFromRequest(
      state,
      fakeRequest({ headers: { "x-workspace-token": "token-b" } }),
    )
    expect(state.token).toBe("token-b")
  })

  test("a later request carrying no token leaves the current token untouched", async () => {
    const { makeCredentialState, updateCredentialStateFromRequest } =
      await import("../src/server/sse-server")
    const state = makeCredentialState(
      fakeRequest({ url: "/sse?workspace_token=token-a" }),
    )

    updateCredentialStateFromRequest(state, fakeRequest({}))
    expect(state.token).toBe("token-a")
  })
})

type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>

const startRequestServer = async (listener: RequestListener) => {
  const server = createServer(listener)
  const { promise: listening, resolve } = Promise.withResolvers<void>()
  server.listen(0, "127.0.0.1", resolve)
  await listening

  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP listener address")
  }

  return {
    close: async (): Promise<void> => {
      const { promise, reject, resolve } = Promise.withResolvers<void>()
      server.close((error) => (error ? reject(error) : resolve()))
      await promise
    },
    url: `http://127.0.0.1:${address.port}`,
  }
}

const initializeBody = {
  id: 1,
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
    protocolVersion: "2025-03-26",
  },
}

const sendChunkedRequest = async (
  url: string,
  chunks: Buffer[],
): Promise<{ statusCode: number }> => {
  const { promise, reject, resolve } = Promise.withResolvers<{
    statusCode: number
  }>()
  const clientRequest = request(url, { method: "POST" }, (incomingResponse) => {
    incomingResponse.resume()
    incomingResponse.on("end", () => {
      resolve({ statusCode: incomingResponse.statusCode ?? 0 })
    })
  })
  clientRequest.on("error", reject)
  for (const chunk of chunks) {
    clientRequest.write(chunk)
  }
  clientRequest.end()
  return await promise
}

describe("createRequestListener", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env.CHATBOTX_MCP_OAUTH_ENABLED = "false"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("rejects an oversized content-length before creating an MCP server", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const createMcpServer = vi.fn()
    const requestServer = await startRequestServer(
      createRequestListener(createMcpServer as never),
    )

    try {
      const oversizedBody = "x".repeat(1024 * 1024 + 1)
      const response = await fetch(`${requestServer.url}/messages`, {
        body: oversizedBody,
        headers: { "content-length": String(Buffer.byteLength(oversizedBody)) },
        method: "POST",
      })

      expect(response.status).toBe(413)
      expect(createMcpServer).not.toHaveBeenCalled()
    } finally {
      await requestServer.close()
    }
  })

  test("rejects a streamed body that grows past the size limit", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const createMcpServer = vi.fn()
    const requestServer = await startRequestServer(
      createRequestListener(createMcpServer as never),
    )

    try {
      const response = await sendChunkedRequest(
        `${requestServer.url}/messages`,
        [Buffer.alloc(1024 * 1024), Buffer.from("x")],
      )

      expect(response.statusCode).toBe(413)
      expect(createMcpServer).not.toHaveBeenCalled()
    } finally {
      await requestServer.close()
    }
  })

  test("returns 400 for malformed JSON", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const createMcpServer = vi.fn()
    const requestServer = await startRequestServer(
      createRequestListener(createMcpServer as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        body: "{not json",
        method: "POST",
      })

      expect(response.status).toBe(400)
      expect(createMcpServer).not.toHaveBeenCalled()
    } finally {
      await requestServer.close()
    }
  })

  // `isInitializeRequest` was switched from a local, lenient check (only
  // `method === "initialize"`) to the SDK's version, which validates the
  // full `InitializeRequestSchema` (jsonrpc version, id, protocolVersion,
  // capabilities, clientInfo). A minimal body that the old check accepted
  // must now be rejected — pinning this deliberately, since it's a
  // breaking change for a lenient client.
  test("rejects a minimal { method: 'initialize' } body missing jsonrpc/id/params as not a valid initialize request", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const createMcpServer = vi.fn()
    const requestServer = await startRequestServer(
      createRequestListener(createMcpServer as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        body: JSON.stringify({ method: "initialize" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })

      expect(response.status).toBe(400)
      expect(createMcpServer).not.toHaveBeenCalled()
    } finally {
      await requestServer.close()
    }
  })

  test("logs and returns 500 when MCP server creation throws", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const createMcpServer = vi.fn(() => {
      throw new Error("create failed")
    })
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const requestServer = await startRequestServer(
      createRequestListener(createMcpServer as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
            protocolVersion: "2025-03-26",
          },
        }),
        method: "POST",
      })

      expect(response.status).toBe(500)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
      await requestServer.close()
    }
  })

  // A client configured as Streamable HTTP (`type: "http"`) against the SSE
  // URL POSTs `initialize` to it; that used to be a hard 405.
  test("serves a Streamable HTTP session when a client POSTs to the SSE path", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const { McpServer } = await import(
      "@modelcontextprotocol/sdk/server/mcp.js"
    )
    const createMcpServer = vi.fn(
      () => new McpServer({ name: "test", version: "1.0.0" }),
    )
    const requestServer = await startRequestServer(
      createRequestListener(createMcpServer as never),
    )
    const headers = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    }

    try {
      const initResponse = await fetch(`${requestServer.url}/sse`, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
            protocolVersion: "2025-03-26",
          },
        }),
        headers,
        method: "POST",
      })
      await initResponse.text()

      expect(initResponse.status).toBe(200)
      const sessionId = initResponse.headers.get("mcp-session-id")
      expect(sessionId).toBeTruthy()

      const followUp = await fetch(`${requestServer.url}/sse`, {
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
        headers: { ...headers, "mcp-session-id": sessionId ?? "" },
        method: "POST",
      })
      await followUp.text()

      expect(followUp.status).toBe(202)
      expect(createMcpServer).toHaveBeenCalledTimes(1)
    } finally {
      await requestServer.close()
    }
  })
})

describe("createRequestListener OAuth gate", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      CHATBOTX_API_KEY: "",
      CHATBOTX_MCP_OAUTH_ENABLED: "true",
    }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("challenges a request without a token with protected-resource metadata", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/sse`)

      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toContain(
        'resource_metadata="',
      )
    } finally {
      await requestServer.close()
    }
  })

  test("challenges an unauthorized token as invalid", async () => {
    const introspectToken = vi
      .fn()
      .mockResolvedValue({ status: "unauthorized" })
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        headers: { Authorization: "Bearer invalid-token" },
        method: "POST",
      })

      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toContain(
        'error="invalid_token"',
      )
      expect(introspectToken).toHaveBeenCalledWith("invalid-token", undefined)
    } finally {
      await requestServer.close()
    }
  })

  test("returns the introspection configuration error", async () => {
    const introspectToken = vi.fn().mockResolvedValue({
      status: "configError",
      message: "Choose a workspace",
    })
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        headers: { Authorization: "Bearer multi-workspace-token" },
        method: "POST",
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: { message: "Choose a workspace" },
      })
    } finally {
      await requestServer.close()
    }
  })

  test("fails closed with 503 while token introspection is unavailable", async () => {
    const introspectToken = vi.fn().mockResolvedValue({ status: "unavailable" })
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const createMcpServer = vi.fn()
    const requestServer = await startRequestServer(
      createRequestListener(createMcpServer as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        body: JSON.stringify(initializeBody),
        headers: { Authorization: "Bearer token" },
        method: "POST",
      })

      expect(response.status).toBe(503)
      expect(response.headers.get("retry-after")).toBe("2")
      expect(createMcpServer).not.toHaveBeenCalled()
    } finally {
      await requestServer.close()
    }
  })

  test("ignores a query-string token when CHATBOTX_MCP_ALLOW_QUERY_TOKEN is false", async () => {
    process.env.CHATBOTX_MCP_ALLOW_QUERY_TOKEN = "false"
    const introspectToken = vi.fn()
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      const response = await fetch(
        `${requestServer.url}/messages?workspace_token=leaked-in-url`,
        { method: "POST" },
      )

      expect(response.status).toBe(401)
      expect(introspectToken).not.toHaveBeenCalled()
    } finally {
      await requestServer.close()
    }
  })

  test("binds a session to the identity that opened it", async () => {
    const principalFor = (subject: string) => ({
      status: "ok",
      data: {
        permission: "full",
        principal: {
          audience: "http://127.0.0.1/mcp",
          clientId: "client-1",
          credentialType: "oauth",
          issuer: "https://issuer.example",
          subject,
        },
        scopes: null,
        workspaceId: "ws-1",
      },
    })
    const introspectToken = vi.fn(async (token: string) =>
      principalFor(token === "token-b" ? "user-b" : "user-a"),
    )
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const { McpServer } = await import(
      "@modelcontextprotocol/sdk/server/mcp.js"
    )
    const requestServer = await startRequestServer(
      createRequestListener(
        (() => new McpServer({ name: "test", version: "1.0.0" })) as never,
      ),
    )
    const post = (token: string, body: unknown, sessionId?: string) =>
      fetch(`${requestServer.url}/messages`, {
        body: JSON.stringify(body),
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        method: "POST",
      })
    const initialized = { jsonrpc: "2.0", method: "notifications/initialized" }

    try {
      const initResponse = await post("token-a", initializeBody)
      await initResponse.text()
      const sessionId = initResponse.headers.get("mcp-session-id") ?? ""
      expect(initResponse.status).toBe(200)

      const otherUser = await post("token-b", initialized, sessionId)
      await otherUser.text()
      expect(otherUser.status).toBe(403)

      // A refreshed access token for the same user keeps the session.
      const refreshed = await post("token-a-refreshed", initialized, sessionId)
      await refreshed.text()
      expect(refreshed.status).toBe(202)
    } finally {
      await requestServer.close()
    }
  })

  test("serves OAuth protected-resource metadata without authentication", async () => {
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      const response = await fetch(
        `${requestServer.url}/.well-known/oauth-protected-resource/sse`,
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        resource: `${requestServer.url}/mcp`,
        bearer_methods_supported: ["header"],
      })
    } finally {
      await requestServer.close()
    }
  })

  test("bypasses the OAuth gate for OPTIONS", async () => {
    const introspectToken = vi.fn()
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        method: "OPTIONS",
      })

      expect(response.status).toBe(204)
      expect(introspectToken).not.toHaveBeenCalled()
    } finally {
      await requestServer.close()
    }
  })
})

describe("createRequestListener rate limits", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      CHATBOTX_API_KEY: "",
      CHATBOTX_MCP_OAUTH_ENABLED: "false",
    }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("refuses a credential over its per-minute limit with 429 and Retry-After", async () => {
    process.env.CHATBOTX_MCP_RATE_LIMIT_PER_MINUTE = "2"
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )
    const post = (token: string) =>
      fetch(`${requestServer.url}/messages`, {
        body: "{not json",
        headers: { "x-workspace-token": token },
        method: "POST",
      })

    try {
      expect((await post("token-a")).status).toBe(400)
      expect((await post("token-a")).status).toBe(400)
      const limited = await post("token-a")
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
      await expect(limited.json()).resolves.toMatchObject({
        error: { message: expect.stringContaining("Too many requests") },
      })

      // Another credential has its own budget.
      expect((await post("token-b")).status).toBe(400)
    } finally {
      await requestServer.close()
    }
  })

  test("limits the connector profile routes too", async () => {
    process.env.CHATBOTX_MCP_OAUTH_ENABLED = "true"
    process.env.CHATBOTX_MCP_RATE_LIMIT_PER_MINUTE = "1"
    const introspectToken = vi
      .fn()
      .mockResolvedValue({ status: "unauthorized" })
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )
    const post = () =>
      fetch(`${requestServer.url}/claude`, {
        headers: { authorization: "Bearer token-a" },
        method: "POST",
      })

    try {
      expect((await post()).status).toBe(401)
      expect((await post()).status).toBe(429)
    } finally {
      await requestServer.close()
    }
  })

  test("stops introspecting for an IP after too many rejected credentials", async () => {
    process.env.CHATBOTX_MCP_OAUTH_ENABLED = "true"
    process.env.CHATBOTX_MCP_AUTH_FAILURE_LIMIT_PER_MINUTE = "2"
    const introspectToken = vi
      .fn()
      .mockResolvedValue({ status: "unauthorized" })
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )
    // Without a trusted proxy, a forged X-Forwarded-For cannot pick a
    // fresh bucket for each guess.
    const post = (token: string) =>
      fetch(`${requestServer.url}/messages`, {
        headers: {
          authorization: `Bearer ${token}`,
          "x-forwarded-for": `198.51.100.${token.length}${token.at(-1)}`,
        },
        method: "POST",
      })

    try {
      expect((await post("guess-1")).status).toBe(401)
      expect((await post("guess-2")).status).toBe(401)
      expect((await post("guess-3")).status).toBe(429)
      expect(introspectToken).toHaveBeenCalledTimes(2)
    } finally {
      await requestServer.close()
    }
  })

  test("does not count the no-token discovery challenge as a failure", async () => {
    process.env.CHATBOTX_MCP_OAUTH_ENABLED = "true"
    process.env.CHATBOTX_MCP_AUTH_FAILURE_LIMIT_PER_MINUTE = "1"
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${requestServer.url}/messages`, {
          method: "POST",
        })
        expect(response.status).toBe(401)
      }
    } finally {
      await requestServer.close()
    }
  })

  test("does not limit OAuth metadata or OPTIONS preflights", async () => {
    process.env.CHATBOTX_MCP_OAUTH_ENABLED = "true"
    process.env.CHATBOTX_MCP_RATE_LIMIT_PER_MINUTE = "1"
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const metadata = await fetch(
          `${requestServer.url}/.well-known/oauth-protected-resource/sse`,
        )
        expect(metadata.status).toBe(200)
        const preflight = await fetch(`${requestServer.url}/messages`, {
          method: "OPTIONS",
        })
        expect(preflight.status).toBe(204)
      }
    } finally {
      await requestServer.close()
    }
  })
})
