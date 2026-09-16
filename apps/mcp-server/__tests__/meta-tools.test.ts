import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { META_TOOLS } from "../src/server/meta-tools"

// Same convention as openapi-loader.test.ts: `getCachedTools()` is
// module-level state populated by `loadOpenApiSpec()`, so each test needs a
// fresh module instance (`vi.resetModules()`) and its own fetch mock rather
// than sharing the previous test's cached tools.
const specWithTools = (
  tools: Array<{
    name: string
    summary: string
    description?: string
    method?: string
  }>,
) => ({
  ok: true,
  headers: { get: () => null },
  json: async () => ({
    servers: [{ url: "https://api.example.com" }],
    paths: Object.fromEntries(
      tools.map((tool) => [
        `/v1/${tool.name}`,
        {
          [(tool.method ?? "get").toLowerCase()]: {
            operationId: tool.name,
            summary: tool.summary,
            description: tool.description,
          },
        },
      ]),
    ),
  }),
})

describe("META_TOOLS", () => {
  test("are exactly search_tools and call_tool", () => {
    expect(META_TOOLS.map((tool) => tool.name)).toEqual([
      "search_tools",
      "call_tool",
    ])
  })
})

describe("searchTools", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("ranks a name match above an unrelated tool", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "tags.list", summary: "Get all tags" },
        {
          name: "minigames.list",
          summary: "List minigames",
          description: "Unrelated to tags entirely.",
        },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    const results = searchTools("tags")
    expect(results[0]?.name).toBe("tags_list")
  })

  test("drops zero-scoring tools instead of padding the tail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "tags.list", summary: "Get all tags" },
        { name: "minigames.list", summary: "List minigames" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("minigame").map((t) => t.name)).toEqual([
      "minigames_list",
    ])
  })

  test("caps results at 25 even when a higher limit is requested", async () => {
    const manyTools = Array.from({ length: 30 }, (_, i) => ({
      name: `keyword${i}.list`,
      summary: "keyword operation",
    }))
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithTools(manyTools)) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("keyword", 100)).toHaveLength(25)
  })

  test("uses the default limit when limit is NaN", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        specWithTools([{ name: "tags.list", summary: "Get all tags" }]),
      ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("tags", Number.NaN).map((tool) => tool.name)).toEqual([
      "tags_list",
    ])
  })

  test("a GET tool ranks above a same-scoring non-GET tool", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "broadcasts.create", summary: "broadcast op", method: "post" },
        { name: "broadcasts.list", summary: "broadcast op", method: "get" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    const results = searchTools("broadcast op")
    expect(results[0]?.name).toBe("broadcasts_list")
  })
})

describe("handleSearchTools", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("rejects a missing query", async () => {
    const { handleSearchTools } = await import("../src/server/meta-tools")
    const result = handleSearchTools({})
    expect(result.isError).toBe(true)
  })

  test("returns matches as JSON with name/description/inputSchema", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        specWithTools([{ name: "tags.list", summary: "Get all tags" }]),
      ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { handleSearchTools } = await import("../src/server/meta-tools")

    const result = handleSearchTools({ query: "tags" })
    expect(result.isError).toBeUndefined()
    const parsed = JSON.parse(result.content[0]?.text ?? "[]")
    expect(parsed).toEqual([
      {
        name: "tags_list",
        description: "Get all tags",
        inputSchema: expect.any(Object),
      },
    ])
  })
})

describe("handleCallTool", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("rejects a missing name", async () => {
    const { handleCallTool } = await import("../src/server/meta-tools")
    const result = await handleCallTool({}, "api-key")
    expect(result.isError).toBe(true)
  })

  test("reports an unknown tool name", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(specWithTools([])) as unknown as typeof fetch
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { handleCallTool } = await import("../src/server/meta-tools")

    const result = await handleCallTool({ name: "does_not_exist" }, "api-key")
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("Unknown tool")
  })

  test("executes a tool found outside tools/list (hidden) by name", async () => {
    const specFetch = vi
      .fn()
      .mockResolvedValueOnce(
        specWithTools([{ name: "minigames.list", summary: "List minigames" }]),
      )
    const executeFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (name: string) =>
          name === "content-type" ? "application/json" : null,
      },
      json: async () => ({ data: [] }),
    })
    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(specFetch)
      .mockImplementationOnce(executeFetch) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { handleCallTool } = await import("../src/server/meta-tools")

    const result = await handleCallTool(
      { name: "minigames_list", arguments: {} },
      "api-key",
    )
    expect(result.isError).toBeUndefined()
  })

  test("rejects an arguments array without executing a fetch", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        specWithTools([{ name: "tags.list", summary: "Get all tags" }]),
      ) as unknown as typeof fetch
    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()

    const executeFetch = vi.fn()
    globalThis.fetch = executeFetch as unknown as typeof fetch
    const { handleCallTool } = await import("../src/server/meta-tools")
    const result = await handleCallTool(
      { arguments: [], name: "tags_list" },
      "api-key",
    )

    expect(result).toEqual({
      content: [
        {
          text: "call_tool 'arguments' must be a JSON object.",
          type: "text",
        },
      ],
      isError: true,
    })
    expect(executeFetch).not.toHaveBeenCalled()
  })
})
