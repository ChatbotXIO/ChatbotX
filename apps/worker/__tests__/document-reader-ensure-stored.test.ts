import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureAttachmentStored: vi.fn(),
  prepareContext: vi.fn(),
  heavyAdd: vi.fn(),
  loggerError: vi.fn(),
}))

class MediaNotReadyErrorStub extends Error {}

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  ensureAttachmentStored: mocks.ensureAttachmentStored,
  MediaNotReadyError: MediaNotReadyErrorStub,
}))
vi.mock(
  "../src/integration/handlers/automated-response/system-tools/context-sources/registry",
  () => ({
    getContextSourceAdapter: () => ({ prepareContext: mocks.prepareContext }),
  }),
)
vi.mock("@chatbotx.io/worker-config", () => ({
  HeavyJobAction: { extractTextFromFile: "extractTextFromFile" },
  getHeavyJobOptions: () => ({}),
  getHeavyJobCompletionWaitTimeoutMs: () => 1000,
  getHeavyQueueEvents: () => ({}),
  heavyExtractTextFromFileResultSchema: { parse: (value: unknown) => value },
  heavyQueue: { add: mocks.heavyAdd },
  waitForJobCompletionWithRetries: vi.fn(async () => ({
    snippets: ["clause 1"],
  })),
}))
vi.mock("../src/env", () => ({ env: { HEAVY_JOB_WAIT_TIMEOUT_MS: 1000 } }))
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { createDocumentReaderExecutor } = await import(
  "../src/integration/handlers/automated-response/system-tools/document-reader"
)

const attachment = {
  id: "att-1",
  messageCreatedAt: new Date("2026-10-14T01:00:00.000Z"),
  originPath: "https://cdn.example/contract.pdf",
  mimeType: "application/pdf",
  name: "contract.pdf",
}

const context = { workspaceId: "ws-1", conversationId: "conv-1" }

const run = () =>
  createDocumentReaderExecutor({ fileOnlyTrigger: false })(
    { query: "what is clause 1?" } as never,
    context as never,
  )

describe("document reader — ensure stored", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prepareContext.mockResolvedValue({
      snippets: [],
      summary: "",
      resolvedSource: { source: { title: null }, attachment },
    })
    mocks.heavyAdd.mockResolvedValue({ waitUntilFinished: vi.fn() })
  })

  it("extracts text from the stored object, not the pending URL", async () => {
    mocks.ensureAttachmentStored.mockResolvedValue({
      originPath: "workspace/messenger/ws-1/int-1/2026/10/14/abc.pdf",
      mimeType: "application/pdf",
      size: 1234,
    })

    await expect(run()).resolves.toContain("clause 1")

    expect(mocks.ensureAttachmentStored).toHaveBeenCalledWith({
      attachmentId: "att-1",
      workspaceId: "ws-1",
      messageCreatedAt: attachment.messageCreatedAt,
      originPath: attachment.originPath,
    })
    expect(mocks.heavyAdd).toHaveBeenCalledWith(
      "extractTextFromFile",
      {
        type: "extractTextFromFile",
        data: expect.objectContaining({
          originPath: "workspace/messenger/ws-1/int-1/2026/10/14/abc.pdf",
          mimeType: "application/pdf",
        }),
      },
      expect.anything(),
    )
  })

  it("treats a permanently unavailable document as absent", async () => {
    mocks.ensureAttachmentStored.mockResolvedValue(null)

    await expect(run()).resolves.toBe(
      "I couldn't find a supported PDF or DOCX document in this conversation yet.",
    )
    expect(mocks.heavyAdd).not.toHaveBeenCalled()
  })

  it("tells the agent the document is still being fetched instead of failing", async () => {
    mocks.ensureAttachmentStored.mockRejectedValue(
      new MediaNotReadyErrorStub("slow"),
    )

    await expect(run()).resolves.toBe(
      "The document is still being fetched. Please ask again in a moment.",
    )
    expect(mocks.heavyAdd).not.toHaveBeenCalled()
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  it("does not touch storage when the snippets are already embedded", async () => {
    mocks.prepareContext.mockResolvedValue({
      snippets: [
        {
          chunkIndex: 0,
          content: "from embeddings",
          similarity: 0.9,
          source: "embedding",
        },
      ],
      summary: "",
      resolvedSource: { source: { title: null }, attachment },
    })

    await expect(run()).resolves.toContain("from embeddings")
    expect(mocks.ensureAttachmentStored).not.toHaveBeenCalled()
  })
})
