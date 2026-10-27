import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  loggerWarn: vi.fn(),
  resolveEmbeddingModel: vi.fn(),
  vectorSearch: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createAiFileEmbeddingRepository: () => ({
    vectorSearch: mocks.vectorSearch,
  }),
}))
vi.mock("ai", () => ({ embed: mocks.embed }))
vi.mock("../src/server/embedding-model", () => ({
  resolveEmbeddingModel: mocks.resolveEmbeddingModel,
}))
vi.mock("../src/logger", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() },
}))

const { performFileSearch, searchKnowledgeChunks } = await import(
  "../src/server/knowledge-base"
)

const config = {
  workspaceId: "workspace-1",
  selectedFileIds: ["1", "2"],
  maxResults: 5,
}

const row = (id: string, similarity: number | string) => ({
  id,
  content: `content ${id}`,
  aiFileId: "1",
  similarity,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveEmbeddingModel.mockResolvedValue({
    model: {},
    modelId: "text-embedding-ada-002",
    provider: "openai",
  })
  mocks.embed.mockResolvedValue({ embedding: [0.1, 0.2] })
})

describe("searchKnowledgeChunks", () => {
  test("keeps below-threshold chunks and ranks them, with > not >= at the threshold", async () => {
    mocks.vectorSearch.mockResolvedValue([
      row("a", 0.9),
      row("b", "0.7"),
      row("c", 0.2),
    ])

    const result = await searchKnowledgeChunks({ query: "price" }, config)

    expect(
      result.matches.map((match) => [
        match.id,
        match.rank,
        match.passedThreshold,
      ]),
    ).toEqual([
      ["a", 1, true],
      ["b", 2, false],
      ["c", 3, false],
    ])
    expect(result.appliedConfig).toEqual({
      provider: "openai",
      modelId: "text-embedding-ada-002",
      similarityThreshold: 0.7,
      limit: 5,
    })
    expect(mocks.vectorSearch).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      fileIds: ["1", "2"],
      queryVector: [0.1, 0.2],
      limit: 5,
    })
  })

  test("drops non-numeric file ids before querying", async () => {
    mocks.vectorSearch.mockResolvedValue([])

    const result = await searchKnowledgeChunks(
      { query: "price" },
      { ...config, selectedFileIds: ["abc"] },
    )

    expect(result.matches).toEqual([])
    expect(mocks.vectorSearch).not.toHaveBeenCalled()
  })

  test("returns no matches and warns when rows are malformed", async () => {
    mocks.vectorSearch.mockResolvedValue([row("a", 0.9), row("b", "NaN")])

    const result = await searchKnowledgeChunks({ query: "price" }, config)

    expect(result.matches).toEqual([])
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
      "[ai-package] Invalid similarity search results",
    )
  })
})

describe("performFileSearch", () => {
  test("returns only above-threshold chunks in the legacy shape", async () => {
    mocks.vectorSearch.mockResolvedValue([row("a", 0.9), row("b", 0.7)])

    await expect(
      performFileSearch({ query: "price" }, config),
    ).resolves.toEqual([
      {
        id: "a",
        content: "content a",
        aiFileId: "1",
        similarity: 0.9,
        chunkIndex: null,
      },
    ])
  })

  test("uses the configured threshold and limit unchanged", async () => {
    mocks.vectorSearch.mockResolvedValue([row("a", 0.5), row("b", 0.3)])

    const results = await performFileSearch(
      { query: "price" },
      { ...config, maxResults: 3, similarityThreshold: 0.4 },
    )

    expect(results.map((result) => result.id)).toEqual(["a"])
    expect(mocks.vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3 }),
    )
  })
})
