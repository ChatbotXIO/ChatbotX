import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { isWorkspaceTokenOperation, toSnakeCase } from "../src/openapi-loader"

describe("toSnakeCase", () => {
  test.each([
    ["tags.list", "tags_list"],
    ["aiAgents.list", "ai_agents_list"],
    ["contacts.listTags", "contacts_list_tags"],
    ["botFields.bulkUpdate", "bot_fields_bulk_update"],
    ["workspaceMembers.get", "workspace_members_get"],
    ["externalWebhooks.delete", "external_webhooks_delete"],
    ["contacts.findByCustomField", "contacts_find_by_custom_field"],
  ])("%s -> %s", (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected)
  })

  // Documented gap: a run of acronym-like segments (e.g. an `MCPServers`
  // resource) does not split the way a human would expect. Not exercised by
  // any current operationId — revisit if one is ever added.
  test.todo("aiMCPServers -> ai_mcpservers")
})

describe("isWorkspaceTokenOperation", () => {
  test("undefined security means the document-level workspace-token default applies", () => {
    expect(isWorkspaceTokenOperation({})).toBe(true)
  })

  test("a workspace-token scheme in the security array is true", () => {
    expect(
      isWorkspaceTokenOperation({
        security: [{ bearerAuth: [] }],
      }),
    ).toBe(true)
  })

  test("a channel-token-only scheme is false", () => {
    expect(
      isWorkspaceTokenOperation({
        security: [{ channelApiToken: [] }],
      }),
    ).toBe(false)
  })

  test("an empty security array (no auth) is false", () => {
    expect(isWorkspaceTokenOperation({ security: [] })).toBe(false)
  })
})

describe("loadOpenApiSpec", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("skips deprecated and non-workspace-token operations", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/v1/tags": {
            get: { operationId: "tags.list", summary: "List tags" },
          },
          "/v1/channels/api/messages": {
            post: {
              operationId: "channels.sendMessage",
              summary: "Send message",
              security: [{ channelApiToken: [] }],
            },
          },
          "/v1/channels": {
            get: {
              operationId: "inboxes.listChannels",
              summary: "List channels",
              deprecated: true,
            },
          },
        },
      }),
    }) as unknown as typeof fetch

    // `loadOpenApiSpec` caches its result in a module-level variable, so a
    // fresh module instance (via `vi.resetModules()` in `beforeEach`) is
    // required per test — otherwise this test would read the previous
    // test's cached tools instead of parsing its own fetch mock.
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    const tools = await loadOpenApiSpec()

    expect(tools.map((tool) => tool.name)).toEqual(["tags_list"])
  })

  test("joins summary and description into one tool description", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/v1/contacts": {
            get: {
              operationId: "contacts.list",
              summary: "List contacts",
              description: "Supports keyword search and filters.",
            },
          },
          "/v1/tags": {
            get: { operationId: "tags.list", summary: "List tags" },
          },
        },
      }),
    }) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    const tools = await loadOpenApiSpec()

    expect(
      tools.find((tool) => tool.name === "contacts_list")?.description,
    ).toBe("List contacts\n\nSupports keyword search and filters.")
    // No `description` on the operation — falls back to `summary` alone,
    // not "summary\n\nundefined".
    expect(tools.find((tool) => tool.name === "tags_list")?.description).toBe(
      "List tags",
    )
  })
})

describe("refreshOpenApiSpecIfStale", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  const specResponse = (toolName: string, etag: string) => ({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name === "ETag" ? etag : null) },
    json: async () => ({
      servers: [{ url: "https://api.example.com" }],
      paths: {
        [`/v1/${toolName}`]: {
          get: { operationId: `${toolName}.list`, summary: "List" },
        },
      },
    }),
  })

  test("within the TTL, returns the cached tools without fetching again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(specResponse("tags", '"v1"'))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec, refreshOpenApiSpecIfStale } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000) // well under the default 300_000ms TTL
    const tools = await refreshOpenApiSpecIfStale()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tools.map((t) => t.name)).toEqual(["tags_list"])
  })

  test("past the TTL, re-fetches with If-None-Match and adopts the new tool list on a 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(specResponse("tags", '"v1"'))
      .mockResolvedValueOnce(specResponse("contacts", '"v2"'))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec, refreshOpenApiSpecIfStale } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    vi.advanceTimersByTime(300_001)
    const tools = await refreshOpenApiSpecIfStale()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({ "If-None-Match": '"v1"' }),
    })
    expect(tools.map((t) => t.name)).toEqual(["contacts_list"])
  })

  test("past the TTL, a 304 keeps the previous tool list and resets the TTL window", async () => {
    const notModified = {
      ok: false,
      status: 304,
      headers: { get: () => null },
      json: async () => ({}),
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(specResponse("tags", '"v1"'))
      .mockResolvedValueOnce(notModified)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec, refreshOpenApiSpecIfStale } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    vi.advanceTimersByTime(300_001)
    const tools = await refreshOpenApiSpecIfStale()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(tools.map((t) => t.name)).toEqual(["tags_list"])

    // The window reset on the 304, so an immediately following call must not
    // trigger yet another fetch.
    const toolsAgain = await refreshOpenApiSpecIfStale()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(toolsAgain.map((t) => t.name)).toEqual(["tags_list"])
  })

  test("a failed background refresh keeps serving the previous tool list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(specResponse("tags", '"v1"'))
      .mockRejectedValueOnce(new Error("network down"))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec, refreshOpenApiSpecIfStale } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    vi.advanceTimersByTime(300_001)
    const tools = await refreshOpenApiSpecIfStale()

    expect(tools.map((t) => t.name)).toEqual(["tags_list"])
  })

  test("concurrent stale refreshes share one in-flight fetch", async () => {
    let resolveFetch: (value: unknown) => void = () => undefined
    const pendingResponse = new Promise((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(specResponse("tags", '"v1"'))
      .mockReturnValueOnce(pendingResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec, refreshOpenApiSpecIfStale } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    vi.advanceTimersByTime(300_001)
    const call1 = refreshOpenApiSpecIfStale()
    const call2 = refreshOpenApiSpecIfStale()

    resolveFetch(specResponse("contacts", '"v2"'))
    const [result1, result2] = await Promise.all([call1, call2])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result1).toBe(result2)
  })
})

describe("x-mcp visibility, scope, and annotations", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const specWithOperation = (operation: Record<string, unknown>) => ({
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/v1/tags": { get: { operationId: "tags.list", ...operation } },
      },
    }),
  })

  test("an operation with no x-mcp is hidden", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithOperation({})) as unknown as typeof fetch
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    const [tool] = await loadOpenApiSpec()
    expect(tool?.visibility).toBe("hidden")
  })

  test("x-mcp.visibility: 'default' makes the tool visible; scope is carried through", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithOperation({
        "x-mcp": { visibility: "default", scope: "contacts" },
      }),
    ) as unknown as typeof fetch
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    const [tool] = await loadOpenApiSpec()
    expect(tool?.visibility).toBe("default")
    expect(tool?.scope).toBe("contacts")
  })

  test("annotations default from the HTTP method when x-mcp doesn't override them", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithOperation({})) as unknown as typeof fetch
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    const [tool] = await loadOpenApiSpec()
    expect(tool?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    })
  })

  test("x-mcp annotation hints override the method-inferred defaults", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithOperation({
        "x-mcp": { visibility: "default", destructiveHint: true },
      }),
    ) as unknown as typeof fetch
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    const [tool] = await loadOpenApiSpec()
    expect(tool?.annotations.destructiveHint).toBe(true)
    // readOnlyHint/idempotentHint still fall back to the GET-method default.
    expect(tool?.annotations.readOnlyHint).toBe(true)
  })

  test("a DELETE operation defaults to destructive and idempotent, not read-only", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        servers: [{ url: "https://api.example.com" }],
        paths: { "/v1/tags/{id}": { delete: { operationId: "tags.delete" } } },
      }),
    }) as unknown as typeof fetch
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    const [tool] = await loadOpenApiSpec()
    expect(tool?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    })
  })
})

describe("getVisibleTools", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("returns only visibility: 'default' tools, independent of getCachedTools", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/v1/tags": {
            get: {
              operationId: "tags.list",
              summary: "List tags",
              "x-mcp": { visibility: "default" },
            },
          },
          "/v1/minigames": {
            get: { operationId: "minigames.list", summary: "List minigames" },
          },
        },
      }),
    }) as unknown as typeof fetch

    const { loadOpenApiSpec, getCachedTools, getVisibleTools } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    expect(
      getCachedTools()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["minigames_list", "tags_list"])
    expect(getVisibleTools().map((t) => t.name)).toEqual(["tags_list"])
  })

  const specWithScopedTools = () => ({
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      servers: [{ url: "https://api.example.com" }],
      paths: {
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
        "/v1/contacts/search": {
          post: {
            operationId: "contacts.search",
            summary: "Search contacts",
            "x-mcp": {
              visibility: "default",
              scope: "contacts",
              readOnlyHint: true,
            },
          },
        },
        "/v1/tags/{id}": {
          delete: {
            operationId: "tags.delete",
            summary: "Delete a tag",
            "x-mcp": { visibility: "default", scope: "contacts" },
          },
        },
        "/v1/capabilities": {
          get: {
            operationId: "capabilities.get",
            summary: "Discover capabilities",
            "x-mcp": {
              visibility: "default",
              scope: "contacts",
              alwaysVisible: true,
            },
          },
        },
      },
    }),
  })

  test("introspection: null (fetch failed) fails open — no scope filtering", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithScopedTools()) as unknown as typeof fetch
    const { loadOpenApiSpec, getVisibleTools } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    expect(
      getVisibleTools(null)
        .map((t) => t.name)
        .sort(),
    ).toEqual([
      "capabilities_get",
      "contacts_search",
      "flows_list",
      "tags_delete",
      "tags_list",
    ])
  })

  test("scopes: null means unrestricted — every default tool stays visible", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithScopedTools()) as unknown as typeof fetch
    const { loadOpenApiSpec, getVisibleTools } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    expect(
      getVisibleTools({ permission: "full", scopes: null, workspaceId: "ws-1" })
        .map((t) => t.name)
        .sort(),
    ).toEqual([
      "capabilities_get",
      "contacts_search",
      "flows_list",
      "tags_delete",
      "tags_list",
    ])
  })

  test("a scoped token only sees tools whose scope it holds, plus alwaysVisible tools", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithScopedTools()) as unknown as typeof fetch
    const { loadOpenApiSpec, getVisibleTools } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    expect(
      getVisibleTools({
        permission: "full",
        scopes: ["automation"],
        workspaceId: "ws-1",
      })
        .map((t) => t.name)
        .sort(),
    ).toEqual(["capabilities_get", "flows_list"])
  })

  test("a read_only token only sees GET tools plus readOnlyHint POST tools", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithScopedTools()) as unknown as typeof fetch
    const { loadOpenApiSpec, getVisibleTools } = await import(
      "../src/openapi-loader"
    )
    await loadOpenApiSpec()

    expect(
      getVisibleTools({
        permission: "read_only",
        scopes: ["contacts", "automation"],
        workspaceId: "ws-1",
      })
        .map((t) => t.name)
        .sort(),
    ).toEqual([
      "capabilities_get",
      "contacts_search",
      "flows_list",
      "tags_list",
    ])
  })
})
