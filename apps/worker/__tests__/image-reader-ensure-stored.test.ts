import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureAttachmentStored: vi.fn(),
  resolveImageAttachment: vi.fn(),
  heavyAdd: vi.fn(),
  loggerError: vi.fn(),
}))

class MediaNotReadyErrorStub extends Error {}

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  ensureAttachmentStored: mocks.ensureAttachmentStored,
  MediaNotReadyError: MediaNotReadyErrorStub,
}))
vi.mock(
  "../src/integration/handlers/automated-response/system-tools/context-sources/image-source",
  () => ({ resolveImageAttachment: mocks.resolveImageAttachment }),
)
vi.mock("@chatbotx.io/worker-config", () => ({
  HeavyJobAction: { analyzeImage: "analyzeImage" },
  getHeavyJobOptions: () => ({}),
  getHeavyJobCompletionWaitTimeoutMs: () => 1000,
  getHeavyQueueEvents: () => ({}),
  heavyAnalyzeImageResultSchema: { parse: (value: unknown) => value },
  heavyQueue: { add: mocks.heavyAdd },
  waitForJobCompletionWithRetries: vi.fn(async () => ({
    analysis: "a red car",
  })),
}))
vi.mock("../src/env", () => ({ env: { HEAVY_JOB_WAIT_TIMEOUT_MS: 1000 } }))
vi.mock("../src/lib/ai/reply-model", () => ({
  getProviderName: () => "provider",
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { createImageReaderExecutor } = await import(
  "../src/integration/handlers/automated-response/system-tools/image-reader"
)

const attachment = {
  id: "att-1",
  messageCreatedAt: new Date("2026-10-14T01:00:00.000Z"),
  originPath: "https://cdn.example/photo.jpg",
  mimeType: "image/jpeg",
  size: 0,
  name: null,
}

const context = { workspaceId: "ws-1", conversationId: "conv-1" }

const run = () =>
  createImageReaderExecutor({
    fileOnlyTrigger: false,
    modelId: "model",
    providerInfo: {} as never,
  })({ query: "what is it?" } as never, context as never)

describe("image reader — ensure stored", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveImageAttachment.mockResolvedValue(attachment)
    mocks.heavyAdd.mockResolvedValue({ waitUntilFinished: vi.fn() })
  })

  it("analyzes the stored object, not the pending URL", async () => {
    mocks.ensureAttachmentStored.mockResolvedValue({
      originPath: "workspace/messenger/ws-1/int-1/2026/10/14/abc.jpg",
      mimeType: "image/jpeg",
      size: 54_321,
    })

    await expect(run()).resolves.toContain("a red car")

    expect(mocks.ensureAttachmentStored).toHaveBeenCalledWith({
      attachmentId: "att-1",
      workspaceId: "ws-1",
      messageCreatedAt: attachment.messageCreatedAt,
      originPath: attachment.originPath,
    })
    expect(mocks.heavyAdd).toHaveBeenCalledWith(
      "analyzeImage",
      {
        type: "analyzeImage",
        data: expect.objectContaining({
          originPath: "workspace/messenger/ws-1/int-1/2026/10/14/abc.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 54_321,
        }),
      },
      expect.anything(),
    )
  })

  it("keeps the row's own metadata when the key was already stored", async () => {
    mocks.ensureAttachmentStored.mockResolvedValue({
      originPath: "workspace/messenger/ws-1/int-1/2026/10/14/abc.jpg",
    })

    await run()

    expect(mocks.heavyAdd).toHaveBeenCalledWith(
      "analyzeImage",
      {
        type: "analyzeImage",
        data: expect.objectContaining({
          mimeType: "image/jpeg",
          sizeBytes: 0,
        }),
      },
      expect.anything(),
    )
  })

  it("treats a permanently unavailable image as absent", async () => {
    mocks.ensureAttachmentStored.mockResolvedValue(null)

    await expect(run()).resolves.toBe(
      "I couldn't find a supported image in this conversation yet.",
    )
    expect(mocks.heavyAdd).not.toHaveBeenCalled()
  })

  it("tells the agent the image is still being fetched instead of failing", async () => {
    mocks.ensureAttachmentStored.mockRejectedValue(
      new MediaNotReadyErrorStub("slow"),
    )

    await expect(run()).resolves.toBe(
      "The image is still being fetched. Please ask again in a moment.",
    )
    expect(mocks.heavyAdd).not.toHaveBeenCalled()
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })
})
