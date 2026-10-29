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

  test("allows an unavailable introspection response to reach the request handler", async () => {
    const introspectToken = vi.fn().mockResolvedValue({ status: "unavailable" })
    vi.doMock("../src/token-introspection", () => ({ introspectToken }))
    const { createRequestListener } = await import("../src/server/sse-server")
    const requestServer = await startRequestServer(
      createRequestListener(vi.fn() as never),
    )

    try {
      const response = await fetch(`${requestServer.url}/messages`, {
        body: "{not json",
        headers: { Authorization: "Bearer token" },
        method: "POST",
      })

      expect(response.status).toBe(400)
      await expect(response.text()).resolves.toBe("Invalid JSON body")
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
        resource: `${requestServer.url}/sse`,
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
