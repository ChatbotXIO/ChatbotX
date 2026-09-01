import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getContextSourceAdapter: vi.fn(),
  heavyQueueAdd: vi.fn(),
  resolveImageAttachment: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    getHeavyQueueEvents: vi.fn(() => ({})),
    heavyQueue: { add: mocks.heavyQueueAdd },
  }
})

vi.mock("../src/env", () => ({
  env: { HEAVY_JOB_WAIT_TIMEOUT_MS: 120_000 },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/context-sources/registry",
  () => ({
    getContextSourceAdapter: mocks.getContextSourceAdapter,
  }),
)

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/context-sources/image-source",
  () => ({
    resolveImageAttachment: mocks.resolveImageAttachment,
  }),
)

const { createDocumentReaderExecutor } = await import(
  "../src/integration/handlers/automated-response/system-tools/document-reader"
)
const { createImageReaderExecutor } = await import(
  "../src/integration/handlers/automated-response/system-tools/image-reader"
)

const toolContext = {
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  contactId: "contact-1",
}

const documentReaderJobIdRegex = /^heavy-document-reader-conversation-1-/
const imageReaderJobIdRegex = /^heavy-image-reader-conversation-1-/

describe("heavy system tools", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("document_reader fallback waits on heavy and formats returned snippets", async () => {
    mocks.getContextSourceAdapter.mockReturnValue({
      prepareContext: vi.fn().mockResolvedValue({
        summary: null,
        snippets: [],
        resolvedSource: {
          source: { title: "Pricing PDF" },
          attachment: {
            id: "attachment-1",
            name: "pricing.pdf",
            originPath: "documents/pricing.pdf",
            mimeType: "application/pdf",
          },
        },
      }),
    })
    mocks.heavyQueueAdd.mockResolvedValue({
      waitUntilFinished: vi.fn().mockResolvedValue({
        snippets: ["Enterprise pricing is available on request."],
        truncated: false,
      }),
    })

    const executor = createDocumentReaderExecutor({ fileOnlyTrigger: false })
    const output = await executor({ query: "enterprise pricing" }, toolContext)

    expect(mocks.heavyQueueAdd).toHaveBeenCalledWith(
      "extractTextFromFile",
      {
        type: "extractTextFromFile",
        data: {
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          attachmentId: "attachment-1",
          originPath: "documents/pricing.pdf",
          mimeType: "application/pdf",
          query: "enterprise pricing",
        },
      },
      expect.objectContaining({
        jobId: expect.stringMatching(documentReaderJobIdRegex),
      }),
    )
    expect(output).toContain("Enterprise pricing is available on request.")
  })

  test("image_reader sends full providerInfo to heavy and returns its analysis", async () => {
    const providerInfo = {
      kind: "openaiCompatible" as const,
      integrationId: "integration-1",
      model: "vision-model",
    }
    mocks.resolveImageAttachment.mockResolvedValue({
      id: "attachment-1",
      messageId: "message-1",
      name: "receipt.png",
      originPath: "images/receipt.png",
      mimeType: "image/png",
      size: 1024,
    })
    mocks.heavyQueueAdd.mockResolvedValue({
      waitUntilFinished: vi.fn().mockResolvedValue({
        analysis: "The image shows a receipt total.",
      }),
    })

    const executor = createImageReaderExecutor({
      fileOnlyTrigger: false,
      modelId: providerInfo.model,
      providerInfo,
    })
    const output = await executor({ query: "what is this?" }, toolContext)

    expect(mocks.heavyQueueAdd).toHaveBeenCalledWith(
      "analyzeImage",
      {
        type: "analyzeImage",
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          originPath: "images/receipt.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          providerInfo,
        }),
      },
      expect.objectContaining({
        jobId: expect.stringMatching(imageReaderJobIdRegex),
      }),
    )
    expect(output).toContain("The image shows a receipt total.")
  })
})
