import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

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
    const server = createMcpServer({ getApiKey: () => "api-key" })

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
    const server = createMcpServer({ getApiKey: () => "api-key" })

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

  test("missing API key blocks a regular tool and call_tool, but not search_tools", async () => {
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
    const server = createMcpServer({ getApiKey: () => "" })
    const callHandler = getRequestHandler(server, "tools/call")

    const regularToolResult = (await callHandler(
      { method: "tools/call", params: { name: "tags_list", arguments: {} } },
      {},
    )) as CallToolResult
    expect(regularToolResult.isError).toBe(true)
    expect(regularToolResult.content[0]?.text).toContain(
      "No workspace token configured",
    )

    const callToolResult = (await callHandler(
      {
        method: "tools/call",
        params: { name: "call_tool", arguments: { name: "tags_list" } },
      },
      {},
    )) as CallToolResult
    expect(callToolResult.isError).toBe(true)
    expect(callToolResult.content[0]?.text).toContain(
      "No workspace token configured",
    )

    const searchToolsResult = (await callHandler(
      {
        method: "tools/call",
        params: { name: "search_tools", arguments: { query: "tags" } },
      },
      {},
    )) as CallToolResult
    expect(searchToolsResult.isError).toBeUndefined()
  })

  test("'toString' is not treated as a meta-tool name", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(specResponse({}))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()

    const { createMcpServer } = await import("../src/server/create-mcp-server")
    const server = createMcpServer({ getApiKey: () => "api-key" })
    const callHandler = getRequestHandler(server, "tools/call")

    const result = (await callHandler(
      { method: "tools/call", params: { name: "toString", arguments: {} } },
      {},
    )) as CallToolResult

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe("Unknown tool: toString")
  })
})
