import { getAuditActor } from "@chatbotx.io/business/audit"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureBootstrapped: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  processAIFile: vi.fn(),
  processJob: undefined as undefined | ((job: unknown) => Promise<void>),
  resolveWorkspaceId: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    AIJobAction: {
      processAIFile: "processAIFile",
      processPendingEmbedding: "processPendingEmbedding",
      summarizeConversation: "summarizeConversation",
      processConversationSource: "processConversationSource",
      processConversationSourceEmbedding: "processConversationSourceEmbedding",
    },
    defaultWorkerOptions: {},
    getRedisConnection: vi.fn(),
    queueNames: { enum: { aiAgent: "aiAgent" } },
  }
})

vi.mock("bullmq", () => ({
  Worker: class Worker {
    constructor(_queue: string, processJob: (job: unknown) => Promise<void>) {
      mocks.processJob = processJob
    }

    on() {
      // Worker event registration is not exercised by this unit test.
    }

    close() {
      return Promise.resolve()
    }
  },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: mocks.ensureBootstrapped,
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
vi.mock("../src/ai-agent/handlers/process-ai-file", () => ({
  processAIFile: (...args: unknown[]) => mocks.processAIFile(...args),
}))
vi.mock("../src/ai-agent/handlers/process-conversation-source", () => ({
  processConversationSource: vi.fn(),
}))
vi.mock(
  "../src/ai-agent/handlers/process-conversation-source-embedding",
  () => ({
    processConversationSourceEmbedding: vi.fn(),
  }),
)
vi.mock("../src/ai-agent/handlers/process-pending-embeddings", () => ({
  processPendingEmbedding: vi.fn(),
}))
vi.mock("../src/ai-agent/handlers/summarize-conversation", () => ({
  handleSummarizeConversation: vi.fn(),
}))

beforeAll(async () => {
  mocks.ensureBootstrapped.mockResolvedValue(undefined)
  await import("../src/ai-agent/worker")
  await vi.waitFor(() => expect(mocks.processJob).toBeTypeOf("function"))
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isBlockedWorkspace.mockResolvedValue(false)
  mocks.resolveWorkspaceId.mockResolvedValue("workspace-1")
})

describe("ai-agent worker audit context", () => {
  test("populates the audit actor with the resolved workspace and job source", async () => {
    let capturedActor: ReturnType<typeof getAuditActor>
    mocks.processAIFile.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
    })

    await mocks.processJob?.({
      id: "job-1",
      data: { type: "processAIFile", data: {} },
    })

    expect(capturedActor).toEqual(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "ai-agent:processAIFile",
      }),
    )
  })

  test("does not invoke the handler for a blocked workspace", async () => {
    mocks.isBlockedWorkspace.mockResolvedValue(true)

    await mocks.processJob?.({
      id: "job-1",
      data: { type: "processAIFile", data: {} },
    })

    expect(mocks.processAIFile).not.toHaveBeenCalled()
  })
})
