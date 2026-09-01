import { getAuditActor } from "@chatbotx.io/business/audit"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  detectConversationAndContactInbox: vi.fn(),
  editImageOutput: vi.fn(),
  ensureBootstrapped: vi.fn(),
  extractFallbackTextSnippets: vi.fn(),
  generateImageOutput: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  processAIFile: vi.fn(),
  processJob: undefined as
    | undefined
    | ((job: {
        id?: string
        name?: string
        data: unknown
      }) => Promise<unknown>),
  resolveWorkspaceId: vi.fn(),
  analyzeImage: vi.fn(),
  speechToTextOutput: vi.fn(),
  textToSpeechOutput: vi.fn(),
  workerOptions: undefined as Record<string, unknown> | undefined,
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    defaultWorkerOptions: {},
    getRedisConnection: vi.fn(),
    queueNames: { enum: { heavy: "heavy" } },
  }
})

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>()
  return {
    ...actual,
    Worker: class Worker {
      constructor(
        _queue: string,
        processJob: typeof mocks.processJob,
        options: Record<string, unknown>,
      ) {
        mocks.processJob = processJob
        mocks.workerOptions = options
      }

      on() {
        // Worker event registration is not exercised by this unit test.
      }

      close() {
        return Promise.resolve()
      }
    },
  }
})

vi.mock("../src/env", () => ({
  env: { HEAVY_WORKER_CONCURRENCY: 1 },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: mocks.ensureBootstrapped,
}))
vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: mocks.detectConversationAndContactInbox,
}))
vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: mocks.isBlockedWorkspace,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}))
vi.mock("../src/heavy/handlers/edit-image", () => ({
  editImageOutput: mocks.editImageOutput,
}))
vi.mock("../src/heavy/handlers/analyze-image", () => ({
  analyzeImage: mocks.analyzeImage,
}))
vi.mock("../src/heavy/handlers/extract-text-from-file", () => ({
  extractFallbackTextSnippets: mocks.extractFallbackTextSnippets,
}))
vi.mock("../src/heavy/handlers/generate-image", () => ({
  generateImageOutput: mocks.generateImageOutput,
}))
vi.mock("../src/heavy/handlers/process-ai-file", () => ({
  processAIFile: mocks.processAIFile,
}))
vi.mock("../src/heavy/handlers/speech-to-text", () => ({
  speechToTextOutput: mocks.speechToTextOutput,
}))
vi.mock("../src/heavy/handlers/text-to-speech", () => ({
  textToSpeechOutput: mocks.textToSpeechOutput,
}))

beforeAll(async () => {
  mocks.ensureBootstrapped.mockResolvedValue(undefined)
  await import("../src/heavy/worker")
  await vi.waitFor(() => expect(mocks.processJob).toBeTypeOf("function"))
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isBlockedWorkspace.mockResolvedValue(false)
  mocks.resolveWorkspaceId.mockResolvedValue("workspace-1")
  mocks.detectConversationAndContactInbox.mockResolvedValue({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    contactInbox: {
      id: "contact-inbox-1",
      contactId: "contact-1",
    },
  })
})

describe("heavy worker", () => {
  test("uses the dedicated low concurrency setting", () => {
    expect(mocks.workerOptions?.concurrency).toBe(1)
  })

  test("runs processAIFile under the heavy audit source", async () => {
    let capturedActor: ReturnType<typeof getAuditActor>
    mocks.processAIFile.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
    })

    await mocks.processJob?.({
      id: "job-1",
      data: { type: "processAIFile", data: { aiFileId: "ai-file-1" } },
    })

    expect(capturedActor).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "heavy:processAIFile",
      }),
    )
    expect(mocks.processAIFile).toHaveBeenCalledWith({
      aiFileId: "ai-file-1",
    })
  })

  test("does not invoke handlers for a blocked workspace", async () => {
    mocks.isBlockedWorkspace.mockResolvedValue(true)

    await mocks.processJob?.({
      id: "job-1",
      data: { type: "processAIFile", data: { aiFileId: "ai-file-1" } },
    })

    expect(mocks.processAIFile).not.toHaveBeenCalled()
  })

  test("hydrates media-step jobs from ID-only payloads", async () => {
    mocks.generateImageOutput.mockResolvedValue("https://cdn.example.com/a.png")

    const result = await mocks.processJob?.({
      id: "job-1",
      data: {
        type: "aiGenerateImage",
        data: {
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          step: {
            id: "step-1",
            stepType: "aiGenerateImage",
            provider: "openai",
            model: "gpt-image-1",
            prompt: "A quiet workspace",
            quality: "auto",
            size: "auto",
            outputFieldId: "custom-field-1",
          },
        },
      },
    })

    expect(mocks.detectConversationAndContactInbox).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
    })
    expect(mocks.generateImageOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({ id: "conversation-1" }),
        contactInbox: expect.objectContaining({ id: "contact-inbox-1" }),
      }),
    )
    expect(result).toEqual({
      status: "success",
      outputValue: "https://cdn.example.com/a.png",
    })
  })

  test("runs document extraction jobs in heavy", async () => {
    mocks.extractFallbackTextSnippets.mockResolvedValue({
      snippets: ["matching paragraph"],
      truncated: false,
    })

    const result = await mocks.processJob?.({
      id: "job-1",
      data: {
        type: "extractTextFromFile",
        data: {
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          attachmentId: "attachment-1",
          originPath: "documents/a.pdf",
          mimeType: "application/pdf",
          query: "pricing",
        },
      },
    })

    expect(mocks.extractFallbackTextSnippets).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      attachmentId: "attachment-1",
      originPath: "documents/a.pdf",
      mimeType: "application/pdf",
      query: "pricing",
    })
    expect(result).toEqual({
      snippets: ["matching paragraph"],
      truncated: false,
    })
  })

  test("runs image analysis jobs in heavy", async () => {
    mocks.analyzeImage.mockResolvedValue({ analysis: "a receipt" })

    const result = await mocks.processJob?.({
      id: "job-1",
      data: {
        type: "analyzeImage",
        data: {
          workspaceId: "workspace-1",
          originPath: "images/a.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          prompt: "Analyze this",
          providerInfo: {
            provider: "openai",
            model: "gpt-4o-mini",
          },
        },
      },
    })

    expect(mocks.analyzeImage).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      originPath: "images/a.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      prompt: "Analyze this",
      providerInfo: {
        provider: "openai",
        model: "gpt-4o-mini",
      },
    })
    expect(result).toEqual({ analysis: "a receipt" })
  })
})
