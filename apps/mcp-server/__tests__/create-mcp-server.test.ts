import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const MARKDOWN_HEADING_PATTERN = /^# /u

// Same convention as openapi-loader.test.ts / meta-tools.test.ts:
// `getCachedTools()`/`introspectToken()`'s caches are module-level state, so
// each test needs a fresh module instance (`vi.resetModules()`) and its own
// fetch mock.
type FetchResponse = {
  ok: boolean
  headers: { get: (name: string) => string | null }
  json: () => Promise<unknown>
}

const specResponse = (paths: Record<string, unknown>): FetchResponse => ({
  ok: true,
  headers: { get: () => null },
  json: async () => ({
    servers: [{ url: "https://api.example.com" }],
    paths,
  }),
})

const tokenResponse = (body: unknown): FetchResponse => ({
  ok: true,
  headers: { get: () => null },
  json: async () => body,
})

const jsonExecuteResponse = (body: unknown): FetchResponse => ({
  ok: true,
  headers: {
    get: (name: string) =>
      name === "content-type" ? "application/json" : null,
  },
  json: async () => body,
})

type RequestHandler = (request: unknown, extra: unknown) => Promise<unknown>
type ListToolsResult = { tools: Array<{ name: string }> }
type CallToolResult = {
  isError?: boolean
  content: Array<{ type: string; text: string }>
}

/**
 * `createMcpServer` bypasses the SDK's high-level tool API and registers
 * handlers directly on the underlying low-level `Server` via
 * `mcpServer.server.setRequestHandler`. There is no public API to invoke a
 * registered handler without a live transport, so this reaches into the
 * SDK's `Protocol._requestHandlers` map (populated by `setRequestHandler`)
 * — the same map `Server`'s own request dispatch reads from.
 */
function getRequestHandler(
  server: { server: object },
  method: string,
): RequestHandler {
  const requestHandlers = Reflect.get(server.server, "_requestHandlers") as Map<
    string,
    RequestHandler
  >
  const handler = requestHandlers.get(method)
  if (!handler) {
    throw new Error(`No request handler registered for ${method}`)
  }
  return handler
}

describe("createMcpServer", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("tools/list returns META_TOOLS followed by visible tools, and passes introspection through", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        specResponse({
          "/v1/tags": {
            get: {
              operationId: "tags.list",
              summary: "List tags",
              "x-mcp": { visibility: "default", scope: "contacts" },
            },
          },
          "/v1/flows": {
            get: {
              operationId: "flows.list",
              summary: "List flows",
              "x-mcp": { visibility: "default", scope: "automation" },
            },
          },
          "/v1/minigames": {
            get: { operationId: "minigames.list", summary: "List minigames" },
          },
        }),
      )
      .mockResolvedValueOnce(
        tokenResponse({
          workspaceId: "ws-1",
          permission: "full",
          scopes: ["contacts"],
        }),
      )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const server = createMcpServer({
      getCredentials: () => ({ token: "api-key" }),
    })

    const listHandler = getRequestHandler(server, "tools/list")
    const result = (await listHandler(
      { method: "tools/list" },
      {},
    )) as ListToolsResult

    // `flows_list` (scope: automation) is excluded — the introspected token
    // only holds `contacts` — proving the introspection result actually
    // reached `getVisibleTools`, not just that some filtering ran.
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search_tools",
      "call_tool",
      "get_guide",
      "tags_list",
    ])
  })

  test("a hidden tool (excluded from tools/list) is reachable via call_tool", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        specResponse({
          "/v1/minigames": {
            get: { operationId: "minigames.list", summary: "List minigames" },
          },
        }),
      )
      .mockResolvedValueOnce(
        tokenResponse({
          workspaceId: "ws-1",
          permission: "full",
          scopes: null,
        }),
      )
      .mockResolvedValueOnce(jsonExecuteResponse({ data: [] }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const server = createMcpServer({
      getCredentials: () => ({ token: "api-key" }),
    })

    // Warm the spec cache and confirm the tool is genuinely absent from
    // tools/list before reaching it through call_tool.
    const listHandler = getRequestHandler(server, "tools/list")
    const listResult = (await listHandler(
      { method: "tools/list" },
      {},
    )) as ListToolsResult
    expect(
      listResult.tools.map((tool: { name: string }) => tool.name),
    ).not.toContain("minigames_list")

    const callHandler = getRequestHandler(server, "tools/call")
    const result = (await callHandler(
      {
        method: "tools/call",
        params: { name: "minigames_list", arguments: {} },
      },
      {},
    )) as CallToolResult

    expect(result.isError).toBeUndefined()
  })

  test("missing API key blocks regular tools but leaves search and guides available", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      specResponse({
        "/v1/tags": {
          get: {
            operationId: "tags.list",
            summary: "List tags",
            "x-mcp": { visibility: "default" },
          },
        },
      }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()

    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const server = createMcpServer({ getCredentials: () => undefined })
    const callHandler = getRequestHandler(server, "tools/call")

    const regularToolResult = (await callHandler(
      { method: "tools/call", params: { name: "tags_list", arguments: {} } },
      {},
    )) as CallToolResult
    expect(regularToolResult.isError).toBe(true)
    expect(regularToolResult.content[0]?.text).toContain(
      "No credential. Authorize this MCP server with OAuth",
    )

    const callToolResult = (await callHandler(
      {
        method: "tools/call",
        params: { name: "call_tool", arguments: { name: "tags_list" } },
      },
      {},
    )) as CallToolResult
    expect(callToolResult.content[0]?.text).toContain(
      "No credential. Authorize this MCP server with OAuth",
    )

    const searchToolsResult = (await callHandler(
      {
        method: "tools/call",
        params: { name: "search_tools", arguments: { query: "tags" } },
      },
      {},
    )) as CallToolResult
    expect(searchToolsResult.isError).toBeUndefined()

    const guideResult = (await callHandler(
      {
        method: "tools/call",
        params: { name: "get_guide", arguments: { name: "overview" } },
      },
      {},
    )) as CallToolResult
    expect(guideResult.isError).toBeUndefined()
    expect(guideResult.content[0]?.text).toContain("# ChatbotX MCP overview")
  })

  test("'toString' is not treated as a meta-tool name", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(specResponse({}))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()

    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const server = createMcpServer({
      getCredentials: () => ({ token: "api-key" }),
    })
    const callHandler = getRequestHandler(server, "tools/call")

    const result = (await callHandler(
      { method: "tools/call", params: { name: "toString", arguments: {} } },
      {},
    )) as CallToolResult

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe("Unknown tool: toString")
  })

  test("registers four markdown guide resources", async () => {
    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const server = createMcpServer()
    const listHandler = getRequestHandler(server, "resources/list")
    const listResult = (await listHandler(
      { method: "resources/list" },
      {},
    )) as {
      resources: Array<{ mimeType: string; uri: string }>
    }

    expect(listResult.resources).toHaveLength(4)
    expect(listResult.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mimeType: "text/markdown",
          uri: "chatbotx://guides/overview",
        }),
      ]),
    )

    const readHandler = getRequestHandler(server, "resources/read")
    const readResult = (await readHandler(
      {
        method: "resources/read",
        params: { uri: "chatbotx://guides/overview" },
      },
      {},
    )) as {
      contents: Array<{ mimeType: string; text: string }>
    }
    expect(readResult.contents[0]).toEqual(
      expect.objectContaining({
        mimeType: "text/markdown",
        text: expect.stringMatching(MARKDOWN_HEADING_PATTERN),
      }),
    )
  })

  test("uses the ten-minute elicitation timeout for form-capable clients", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        specResponse({
          "/v1/tags": {
            post: { operationId: "tags.create", summary: "Create tag" },
          },
        }),
      )
      .mockResolvedValueOnce(jsonExecuteResponse({ id: "tag-1" }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()

    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const server = createMcpServer({
      getCredentials: () => ({ token: "api-key" }),
    })
    vi.spyOn(server.server, "getClientCapabilities").mockReturnValue({
      elicitation: { form: {} },
    } as never)
    const elicitInput = vi
      .spyOn(server.server, "elicitInput")
      .mockResolvedValue({ action: "accept" } as never)
    const callHandler = getRequestHandler(server, "tools/call")

    await callHandler(
      {
        method: "tools/call",
        params: { arguments: {}, name: "tags_create" },
      },
      {},
    )

    expect(elicitInput).toHaveBeenCalledWith(expect.any(Object), {
      timeout: 10 * 60_000,
    })
  })
})
