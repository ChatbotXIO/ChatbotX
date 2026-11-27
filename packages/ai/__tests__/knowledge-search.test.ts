import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertEmbeddingProviderConfigured: vi.fn(),
  countEmbeddingsByStatus: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findChunksContaining: vi.fn(),
  findManyByIds: vi.fn(),
  loggerInfo: vi.fn(),
  searchKnowledgeChunks: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: { findByIdForWorkspace: mocks.findByIdForWorkspace },
  aiFileService: {
    assertEmbeddingProviderConfigured: mocks.assertEmbeddingProviderConfigured,
    countEmbeddingsByStatus: mocks.countEmbeddingsByStatus,
    findChunksContaining: mocks.findChunksContaining,
    findManyByIds: mocks.findManyByIds,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: vi.fn(), error: vi.fn() },
}))
vi.mock("../src/server/knowledge-base", () => ({
  embeddingSimilarityThresholds: { openai: 0.7, gemini: 0.55 },
  searchKnowledgeChunks: mocks.searchKnowledgeChunks,
}))
vi.mock("../src/server/toolset", () => ({
  parseToolIds: (tools: unknown) => tools as string[],
}))

const { searchAIFiles } = await import("../src/server/knowledge-search")

beforeEach(() => {
  vi.clearAllMocks()
  // Mirrors the service: only ids that exist in the workspace come back.
  mocks.findManyByIds.mockImplementation(async ({ ids }: { ids: string[] }) =>
    [{ id: "1", name: "guide.pdf" }].filter((file) => ids.includes(file.id)),
  )
  mocks.countEmbeddingsByStatus.mockResolvedValue(
    new Map([["1", { total: 2, success: 2 }]]),
  )
  mocks.searchKnowledgeChunks.mockResolvedValue({
    matches: [
      {
        id: "chunk-1",
        aiFileId: "1",
        content: "The Pro plan is 499.000",
        chunkIndex: 4,
        similarity: 0.8,
        rank: 1,
        passedThreshold: true,
      },
    ],
    appliedConfig: {
      provider: "openai",
      modelId: "text-embedding-ada-002",
      similarityThreshold: 0.7,
      limit: 10,
    },
    timingsMs: { embed: 1, search: 2 },
  })
})

describe("searchAIFiles", () => {
  test("searches only workspace-owned file ids and exposes readiness", async () => {
    const result = await searchAIFiles({
      workspaceId: "workspace-1",
      query: "Pro price",
      fileIds: ["1"],
    })

    expect(mocks.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["1"],
    })
    expect(mocks.searchKnowledgeChunks).toHaveBeenCalledWith(
      { query: "Pro price" },
      expect.objectContaining({
        workspaceId: "workspace-1",
        selectedFileIds: ["1"],
      }),
    )
    expect(result.results[0]?.usedByAgent).toBeNull()
    expect(result.files).toEqual([
      expect.objectContaining({
        id: "1",
        readyChunks: 2,
        processingStatus: "success",
      }),
    ])
  })

  test("uses the agent file set and keeps agent-use threshold independent", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({ tools: ["1"] })
    const result = await searchAIFiles({
      workspaceId: "workspace-1",
      query: "Pro price",
      agentId: "agent-1",
      similarityThreshold: 0.1,
    })

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "agent-1",
      workspaceId: "workspace-1",
    })
    expect(result.results[0]).toEqual(
      expect.objectContaining({ passedThreshold: true, usedByAgent: true }),
    )
  })

  test("reports an agent without files without embedding a query", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({ tools: [] })

    await expect(
      searchAIFiles({
        workspaceId: "workspace-1",
        query: "hello",
        agentId: "agent-1",
      }),
    ).resolves.toMatchObject({ diagnosis: "agentHasNoFiles", results: [] })
    expect(mocks.searchKnowledgeChunks).not.toHaveBeenCalled()
  })

  const match = (
    id: string,
    similarity: number,
    rank: number,
    passedThreshold = similarity > 0.7,
  ) => ({
    id,
    aiFileId: "1",
    chunkIndex: rank - 1,
    content: id,
    similarity,
    rank,
    passedThreshold,
  })

  const withMatches = (matches: ReturnType<typeof match>[]) =>
    mocks.searchKnowledgeChunks.mockResolvedValue({
      matches,
      appliedConfig: {
        provider: "openai",
        modelId: "text-embedding-ada-002",
        similarityThreshold: 0.7,
        limit: 10,
      },
      timingsMs: { embed: 1, search: 2 },
    })

  test("rejects an agent from another workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)

    await expect(
      searchAIFiles({ workspaceId: "w", query: "q", agentId: "agent-x" }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.searchKnowledgeChunks).not.toHaveBeenCalled()
  })

  test("rejects a file id outside the workspace", async () => {
    await expect(
      searchAIFiles({ workspaceId: "w", query: "q", fileIds: ["1", "99"] }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.searchKnowledgeChunks).not.toHaveBeenCalled()
  })

  test("accepts a repeated file id", async () => {
    await searchAIFiles({ workspaceId: "w", query: "q", fileIds: ["1", "1"] })

    expect(mocks.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "w",
      ids: ["1"],
    })
  })

  test("requires exactly one of agentId or fileIds", async () => {
    await expect(
      searchAIFiles({ workspaceId: "w", query: "q" }),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      searchAIFiles({
        workspaceId: "w",
        query: "q",
        agentId: "a",
        fileIds: ["1"],
      }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("ignores agent file tools whose file was deleted, like the runtime toolset", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({ tools: ["1", "404"] })

    const result = await searchAIFiles({
      workspaceId: "w",
      query: "q",
      agentId: "agent-1",
    })

    expect(mocks.searchKnowledgeChunks).toHaveBeenCalledWith(
      { query: "q" },
      expect.objectContaining({ selectedFileIds: ["1"] }),
    )
    expect(result.files.map((file) => file.id)).toEqual(["1"])
  })

  test("only marks the agent's top five above the default threshold as used", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({ tools: ["1"] })
    withMatches([
      match("r1", 0.9, 1),
      match("r5", 0.85, 5),
      match("r6", 0.84, 6),
      match("low", 0.6, 7, true),
    ])

    const result = await searchAIFiles({
      workspaceId: "w",
      query: "q",
      agentId: "agent-1",
      similarityThreshold: 0.1,
      limit: 1,
    })

    expect(result.results.map((row) => [row.chunkId, row.usedByAgent])).toEqual(
      [
        ["r1", true],
        ["r5", true],
        ["r6", false],
        ["low", false],
      ],
    )
    // Agent mode never searches fewer rows than the agent itself would read.
    expect(mocks.searchKnowledgeChunks).toHaveBeenCalledWith(
      { query: "q" },
      expect.objectContaining({ maxResults: 5, similarityThreshold: 0.1 }),
    )
  })

  test.each([
    ["ok", [match("a", 0.9, 1)], { total: 1, success: 1 }],
    ["allBelowThreshold", [match("a", 0.2, 1)], { total: 1, success: 1 }],
    ["noMatches", [], { total: 1, success: 1 }],
    ["noReadyChunks", [], { total: 3, success: 0 }],
  ] as const)("diagnoses %s", async (diagnosis, matches, count) => {
    withMatches([...matches])
    mocks.countEmbeddingsByStatus.mockResolvedValue(new Map([["1", count]]))

    const result = await searchAIFiles({
      workspaceId: "w",
      query: "q",
      fileIds: ["1"],
    })

    expect(result.diagnosis).toBe(diagnosis)
  })

  test("agentVisible ignores the trial threshold and mirrors usedByAgent in agent mode", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue({ tools: ["1"] })
    withMatches([match("high", 0.9, 1, true), match("low", 0.6, 2, true)])

    const agent = await searchAIFiles({
      workspaceId: "w",
      query: "q",
      agentId: "agent-1",
      similarityThreshold: 0,
    })
    const files = await searchAIFiles({
      workspaceId: "w",
      query: "q",
      fileIds: ["1"],
      similarityThreshold: 0,
    })

    // The trial threshold lets "low" pass, but the agent's own 0.7 still hides it.
    expect(agent.results.map((row) => row.agentVisible)).toEqual([true, false])
    expect(agent.results.map((row) => row.usedByAgent)).toEqual([true, false])
    expect(files.results.map((row) => row.agentVisible)).toEqual([true, false])
    expect(files.results.map((row) => row.usedByAgent)).toEqual([null, null])
  })

  test("returns the chunk position of every result", async () => {
    const result = await searchAIFiles({
      workspaceId: "w",
      query: "q",
      fileIds: ["1"],
    })

    expect(result.results[0]?.chunkIndex).toBe(4)
    expect(result.expected).toBeNull()
    expect(mocks.findChunksContaining).not.toHaveBeenCalled()
  })

  describe("expectedText", () => {
    const found = (chunkId: string, chunkIndex: number | null = 0) => ({
      chunkId,
      fileId: "1",
      fileName: "guide.pdf",
      chunkIndex,
    })

    test("inTopResults when a chunk with the text is visible to the agent", async () => {
      withMatches([match("r1", 0.9, 1), match("r2", 0.85, 2)])
      mocks.findChunksContaining.mockResolvedValue([found("r2", 1)])

      const result = await searchAIFiles({
        workspaceId: "w",
        query: "q",
        fileIds: ["1"],
        expectedText: "499.000",
      })

      expect(mocks.findChunksContaining).toHaveBeenCalledWith({
        workspaceId: "w",
        fileIds: ["1"],
        text: "499.000",
      })
      expect(result.expected).toEqual({
        verdict: "inTopResults",
        matches: [{ ...found("r2", 1), rank: 2 }],
      })
    })

    test("foundButLowRank when the chunk is below the default threshold, even if a trial threshold passes it", async () => {
      withMatches([match("r1", 0.9, 1), match("low", 0.6, 2, true)])
      mocks.findChunksContaining.mockResolvedValue([found("low", 7)])

      const result = await searchAIFiles({
        workspaceId: "w",
        query: "q",
        fileIds: ["1"],
        expectedText: "x",
        similarityThreshold: 0,
      })

      expect(result.expected?.verdict).toBe("foundButLowRank")
    })

    test("foundButLowRank when the chunk was not returned at all", async () => {
      withMatches([match("r1", 0.9, 1)])
      mocks.findChunksContaining.mockResolvedValue([found("elsewhere", 30)])

      const result = await searchAIFiles({
        workspaceId: "w",
        query: "q",
        fileIds: ["1"],
        expectedText: "x",
      })

      expect(result.expected).toEqual({
        verdict: "foundButLowRank",
        matches: [{ ...found("elsewhere", 30), rank: null }],
      })
    })

    test("counts a returned chunk that holds the text even when the capped lookup missed it", async () => {
      // The lookup returns only chunks far from the top; the visible chunk r1
      // contains the text too but was cut off by the lookup's row cap.
      withMatches([
        { ...match("r1", 0.9, 1), content: "Pro plan 499.000" },
        match("r2", 0.85, 2),
      ])
      mocks.findChunksContaining.mockResolvedValue([found("far", 40)])

      const result = await searchAIFiles({
        workspaceId: "w",
        query: "q",
        fileIds: ["1"],
        expectedText: "499.000",
      })

      expect(result.expected?.verdict).toBe("inTopResults")
      expect(result.expected?.matches.map((row) => row.chunkId)).toEqual([
        "far",
        "r1",
      ])
      expect(result.expected?.matches[1]?.rank).toBe(1)
    })

    test("notInAnyChunk when no chunk holds the text", async () => {
      mocks.findChunksContaining.mockResolvedValue([])

      const result = await searchAIFiles({
        workspaceId: "w",
        query: "q",
        fileIds: ["1"],
        expectedText: "missing",
      })

      expect(result.expected).toEqual({ verdict: "notInAnyChunk", matches: [] })
    })

    test("searches at least the agent's top five so every visible chunk is returned", async () => {
      await searchAIFiles({
        workspaceId: "w",
        query: "q",
        fileIds: ["1"],
        limit: 1,
        expectedText: "x",
      })

      expect(mocks.searchKnowledgeChunks).toHaveBeenCalledWith(
        { query: "q" },
        expect.objectContaining({ maxResults: 5 }),
      )
    })

    test("never logs the expected text or the query", async () => {
      await searchAIFiles({
        workspaceId: "w",
        query: "secret question",
        fileIds: ["1"],
        expectedText: "secret answer",
      })

      expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain(
        "secret",
      )
    })
  })

  test("surfaces a missing embedding provider before embedding", async () => {
    mocks.assertEmbeddingProviderConfigured.mockRejectedValue(
      Object.assign(new Error("No embedding provider configured"), {
        code: "noEmbeddingProvider",
      }),
    )

    await expect(
      searchAIFiles({ workspaceId: "w", query: "q", fileIds: ["1"] }),
    ).rejects.toMatchObject({ code: "noEmbeddingProvider" })
    expect(mocks.searchKnowledgeChunks).not.toHaveBeenCalled()
  })

  test("keeps @chatbotx.io/business free of an @chatbotx.io/ai dependency", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../business/package.json", import.meta.url),
        "utf8",
      ),
    )

    expect({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).not.toHaveProperty("@chatbotx.io/ai")
  })
})
