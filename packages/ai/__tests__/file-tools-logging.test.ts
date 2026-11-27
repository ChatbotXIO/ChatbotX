import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  findManyByIds: vi.fn(),
  info: vi.fn(),
  isLevelEnabled: vi.fn(),
  performFileSearch: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiFileService: { findManyByIds: mocks.findManyByIds },
}))
vi.mock("../src/server/knowledge-base", () => ({
  performFileSearch: mocks.performFileSearch,
}))
vi.mock("../src/logger", () => ({
  logger: {
    debug: mocks.debug,
    error: mocks.error,
    info: mocks.info,
    isLevelEnabled: mocks.isLevelEnabled,
    warn: vi.fn(),
  },
}))

const { getAIFileTools } = await import("../src/server/tools/files")

const SECRET_QUERY = "what is customer 0909-123-456 balance"

const runTool = async (query: string) => {
  const tools = await getAIFileTools("workspace-1", ["1"], {
    fileSearchDescription: "Search files",
    fileSearchQueryDescription: "Query",
  })
  const execute = tools.search_knowledge_base?.execute as (
    input: { query: string },
    options: unknown,
  ) => Promise<string>
  return await execute({ query }, { toolCallId: "call-1", messages: [] })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isLevelEnabled.mockReturnValue(false)
  mocks.findManyByIds.mockResolvedValue([{ id: "1", name: "guide.pdf" }])
  mocks.performFileSearch.mockResolvedValue([
    { id: "c1", aiFileId: "1", content: "Pro plan: 499.000", similarity: 0.91 },
    {
      id: "c2",
      aiFileId: "1",
      content: "Basic plan: 199.000",
      similarity: 0.8,
    },
  ])
})

describe("search_knowledge_base tool", () => {
  test("returns the same string to the model as before", async () => {
    await expect(runTool(SECRET_QUERY)).resolves.toMatchInlineSnapshot(`
      "Found 2 matching results:

      1. Pro plan: 499.000

      2. Basic plan: 199.000"
    `)
  })

  test("logs metadata only at info: no query, output or chunk content", async () => {
    await runTool(SECRET_QUERY)

    expect(mocks.info).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        resultCount: 2,
        outputLength: expect.any(Number),
        queryLength: SECRET_QUERY.length,
        chunkIds: ["c1", "c2"],
        topSimilarity: 0.91,
      },
      "[knowledge-base] tool: formatted output sent to AI",
    )
    const logged = JSON.stringify(mocks.info.mock.calls)
    expect(logged).not.toContain(SECRET_QUERY)
    expect(logged).not.toContain("499.000")
    expect(mocks.debug).not.toHaveBeenCalled()
  })

  test("logs the no-result case without the query", async () => {
    mocks.performFileSearch.mockResolvedValue([])

    await expect(runTool(SECRET_QUERY)).resolves.toBe(
      "No relevant information found.",
    )
    expect(mocks.info).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", queryLength: SECRET_QUERY.length },
      "[knowledge-base] tool: no results found",
    )
  })

  test("emits the capped query only as an enabled diagnostic", async () => {
    mocks.isLevelEnabled.mockReturnValue(true)
    const longQuery = "q".repeat(800)

    await runTool(longQuery)

    expect(mocks.debug).toHaveBeenCalledTimes(1)
    const [payload, message] = mocks.debug.mock.calls[0] ?? []
    expect(message).toBe("[knowledge-base] tool: query diagnostic")
    expect(payload).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        chunkIds: ["c1", "c2"],
      }),
    )
    expect(payload.query.startsWith("q".repeat(500))).toBe(true)
    expect(payload.query).toContain("[truncated 300 chars]")
  })

  test("logs setup failures under the err key", async () => {
    mocks.findManyByIds.mockRejectedValue(new Error("db down"))

    const tools = await getAIFileTools("workspace-1", ["1"], {
      fileSearchDescription: "Search files",
      fileSearchQueryDescription: "Query",
    })

    expect(tools).toEqual({})
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.anything(),
        workspaceId: "workspace-1",
      }),
      "[ai-package] getAIFileTools failed",
    )
    expect(mocks.error.mock.calls[0]?.[0]).not.toHaveProperty("error")
  })
})
