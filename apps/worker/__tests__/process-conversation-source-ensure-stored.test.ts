import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureAttachmentStored: vi.fn(),
  extractTextFromFile: vi.fn(),
  findByIdWithAttachment: vi.fn(),
  update: vi.fn(),
  saveEmbeddings: vi.fn(),
  queueAddBulk: vi.fn(),
}))

class MediaNotReadyErrorStub extends Error {}

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  ensureAttachmentStored: mocks.ensureAttachmentStored,
  MediaNotReadyError: MediaNotReadyErrorStub,
}))
vi.mock("@chatbotx.io/business", () => ({ assertPublicUrl: vi.fn() }))
vi.mock("@chatbotx.io/database/partials", () => ({
  aiConversationSourceStatuses: {
    enum: {
      success: "success",
      error: "error",
      processing: "processing",
    },
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createConversationSourceRepository: () => ({
    findByIdWithAttachment: mocks.findByIdWithAttachment,
    update: mocks.update,
  }),
  createConversationEmbeddingRepository: () => ({
    createMany: mocks.saveEmbeddings,
  }),
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: () => "id" }))
vi.mock("@chatbotx.io/worker-config", () => ({
  AI_FILES_DEFAULT_CHUNK_SIZE: 1000,
  AI_FILES_DEFAULT_OVERLAP_SIZE: 100,
  AIJobAction: { processConversationSourceEmbedding: "embed" },
  aiAgentQueue: { addBulk: mocks.queueAddBulk },
}))
vi.mock("../src/ai-agent/lib/text-extractor", () => ({
  extractTextFromFile: mocks.extractTextFromFile,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { processConversationSource } = await import(
  "../src/ai-agent/handlers/process-conversation-source"
)

const attachment = {
  id: "att-1",
  messageCreatedAt: new Date("2026-10-14T01:00:00.000Z"),
  originPath: "https://cdn.example/doc.pdf",
  mimeType: "application/pdf",
}

const source = {
  id: "src-1",
  sourceType: "document",
  status: "pending",
  workspaceId: "ws-1",
  conversationId: "conv-1",
  attachmentId: "att-1",
  attachment,
}

describe("processConversationSource — ensure stored", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByIdWithAttachment.mockResolvedValue(source)
    mocks.extractTextFromFile.mockResolvedValue("")
  })

  it("extracts text from the stored object, not the pending URL", async () => {
    mocks.ensureAttachmentStored.mockResolvedValue({
      originPath: "workspace/messenger/ws-1/int-1/2026/10/14/abc.pdf",
      mimeType: "application/pdf",
      size: 1,
    })

    await processConversationSource({ sourceId: "src-1" } as never)

    expect(mocks.ensureAttachmentStored).toHaveBeenCalledWith({
      attachmentId: "att-1",
      workspaceId: "ws-1",
      messageCreatedAt: attachment.messageCreatedAt,
      originPath: attachment.originPath,
    })
    expect(mocks.extractTextFromFile).toHaveBeenCalledWith(
      "workspace/messenger/ws-1/int-1/2026/10/14/abc.pdf",
      "application/pdf",
    )
  })

  it("marks the source as errored when the attachment is permanently unavailable", async () => {
    mocks.ensureAttachmentStored.mockResolvedValue(null)

    await processConversationSource({ sourceId: "src-1" } as never)

    expect(mocks.extractTextFromFile).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenLastCalledWith("src-1", {
      status: "error",
      errorMessage: "Attachment unavailable for document source",
    })
  })

  it("rethrows a not-ready attachment so the job is retried instead of failing the source", async () => {
    mocks.ensureAttachmentStored.mockRejectedValue(
      new MediaNotReadyErrorStub("slow"),
    )

    await expect(
      processConversationSource({ sourceId: "src-1" } as never),
    ).rejects.toBeInstanceOf(MediaNotReadyErrorStub)

    expect(mocks.update).not.toHaveBeenCalledWith(
      "src-1",
      expect.objectContaining({ status: "error" }),
    )
  })
})
