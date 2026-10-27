import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  findManyBySource: vi.fn(),
  resolveEmbeddingModel: vi.fn(),
  vectorSearch: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createConversationEmbeddingRepository: () => ({
    findManyBySource: mocks.findManyBySource,
    vectorSearch: mocks.vectorSearch,
  }),
  createConversationSourceRepository: () => ({}),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: { processConversationSource: "processConversationSource" },
  aiAgentQueue: { add: vi.fn() },
}))

vi.mock("ai", () => ({ embed: mocks.embed }))

vi.mock("../src/ai-agent/lib/embedding-model", () => ({
  resolveEmbeddingModel: mocks.resolveEmbeddingModel,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { documentContextSourceAdapter } = await import(
  "../src/integration/handlers/automated-response/system-tools/context-sources/document-source"
)
const { urlContextSourceAdapter } = await import(
  "../src/integration/handlers/automated-response/system-tools/context-sources/url-source"
)

const resolvedSource = {
  source: {
    id: "source-1",
    status: "success",
    summary: null,
    workspaceId: "workspace-1",
  },
} as never

describe.each([
  ["document", documentContextSourceAdapter],
  ["url", urlContextSourceAdapter],
])("%s context source workspace scoping", (_label, adapter) => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findManyBySource.mockResolvedValue([])
    mocks.vectorSearch.mockResolvedValue([])
    mocks.resolveEmbeddingModel.mockResolvedValue({ model: {} })
    mocks.embed.mockResolvedValue({ embedding: [0.1, 0.2] })
  })

  test("vector search is scoped to the source's workspace", async () => {
    await adapter.retrieveRelevantChunks({ query: "price", resolvedSource })

    expect(mocks.vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "source-1",
        workspaceId: "workspace-1",
      }),
    )
  })

  test("listing cached chunks is scoped to the source's workspace", async () => {
    await adapter.retrieveRelevantChunks({ query: "  ", resolvedSource })

    expect(mocks.findManyBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "source-1",
        workspaceId: "workspace-1",
      }),
    )
  })
})
