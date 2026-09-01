import { getAuditActor } from "@chatbotx.io/business/audit"
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  closeChatQueueEvents: vi.fn(),
  ensureBootstrapped: vi.fn(),
  handleOrphanedIntegration: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  processAutomatedResponse: vi.fn(),
  processAIFile: vi.fn(),
  processCommentAIReply: vi.fn(),
  processJob: undefined as undefined | ((job: unknown) => Promise<void>),
  processStoryReplyAutomation: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  runWithWebhookExecutionContext: vi.fn(
    async (_context: unknown, callback: () => Promise<unknown>) => callback(),
  ),
  workerOptions: undefined as Record<string, unknown> | undefined,
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    defaultWorkerOptions: {},
    getRedisConnection: vi.fn(),
    queueNames: { enum: { aiAgent: "aiAgent" } },
  }
})

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>()
  return {
    ...actual,
    Worker: class Worker {
      constructor(
        _queue: string,
        processJob: (job: unknown) => Promise<void>,
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

vi.mock("@chatbotx.io/events/context", () => ({
  runWithWebhookExecutionContext: mocks.runWithWebhookExecutionContext,
}))

vi.mock("../src/env", () => ({
  env: { AI_AGENT_WORKER_CONCURRENCY: 5 },
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
vi.mock("../src/integration/handlers/automated-response", () => ({
  processAutomatedResponse: mocks.processAutomatedResponse,
}))
vi.mock("../src/integration/handlers/comment-automation/ai-reply", () => ({
  processCommentAIReply: mocks.processCommentAIReply,
}))
vi.mock("../src/integration/handlers/story-reply-automation", () => ({
  processStoryReplyAutomation: mocks.processStoryReplyAutomation,
}))
vi.mock("../src/integration/utils/message", () => ({
  closeChatQueueEvents: mocks.closeChatQueueEvents,
}))
vi.mock("../src/services/orphaned-integration-cleanup", () => ({
  handleOrphanedIntegration: mocks.handleOrphanedIntegration,
  IntegrationNotFoundError: class IntegrationNotFoundError extends Error {},
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
  mocks.runWithWebhookExecutionContext.mockImplementation(
    async (_context: unknown, callback: () => Promise<unknown>) => callback(),
  )
})

describe("ai-agent worker audit context", () => {
  test("populates the audit actor with the resolved workspace and job source", async () => {
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
        source: "ai-agent:processAIFile",
      }),
    )
  })

  test("does not invoke the handler for a blocked workspace", async () => {
    mocks.isBlockedWorkspace.mockResolvedValue(true)

    await mocks.processJob?.({
      id: "job-1",
      data: { type: "processAIFile", data: { aiFileId: "ai-file-1" } },
    })

    expect(mocks.processAIFile).not.toHaveBeenCalled()
  })

  test("uses the dedicated concurrency setting", () => {
    expect(mocks.workerOptions?.concurrency).toBe(5)
  })

  test("routes all three Phase 1 reply actions through the ai-agent worker", async () => {
    const jobs = [
      {
        type: "processAutomatedResponse",
        data: {
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          messageId: "message-1",
        },
      },
      {
        type: "commentAIReply",
        data: {
          automationId: "automation-1",
          integrationType: "messenger",
          integrationIdentifier: "page-1",
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          commentId: "comment-1",
          agentId: "agent-1",
          replyChannel: "public",
          channelType: "messenger",
          message: "hello",
        },
      },
      {
        type: "processStoryReplyAutomation",
        data: {
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          messageId: "message-1",
          storyId: "story-1",
          channelType: "instagram",
        },
      },
    ]

    for (const [index, data] of jobs.entries()) {
      await mocks.processJob?.({ id: `job-${index}`, data })
    }

    expect(mocks.processAutomatedResponse).toHaveBeenCalledWith(jobs[0]?.data)
    expect(mocks.processCommentAIReply).toHaveBeenCalledWith(jobs[1]?.data)
    expect(mocks.processStoryReplyAutomation).toHaveBeenCalledWith(
      jobs[2]?.data,
    )
    expect(mocks.runWithWebhookExecutionContext).toHaveBeenCalledTimes(1)
    expect(mocks.runWithWebhookExecutionContext).toHaveBeenCalledWith(
      { source: "webhook" },
      expect.any(Function),
    )
  })

  test("rejects invalid payloads before resolving workspace or invoking handlers", async () => {
    await expect(
      mocks.processJob?.({
        id: "job-invalid",
        data: {
          type: "processAutomatedResponse",
          data: {
            conversationId: { id: "conversation-1" },
            contactInboxId: "contact-inbox-1",
            messageId: "message-1",
          },
        },
      }),
    ).rejects.toThrow()

    expect(mocks.resolveWorkspaceId).not.toHaveBeenCalled()
    expect(mocks.processAutomatedResponse).not.toHaveBeenCalled()
  })

  test("marks orphaned channel integrations as unrecoverable", async () => {
    const { IntegrationNotFoundError } = await import(
      "../src/services/orphaned-integration-cleanup"
    )
    const orphanedIntegrationError = new IntegrationNotFoundError(
      "integration missing",
    )
    mocks.processAutomatedResponse.mockRejectedValue(orphanedIntegrationError)

    await expect(
      mocks.processJob?.({
        id: "job-orphaned-integration",
        data: {
          type: "processAutomatedResponse",
          data: {
            conversationId: "conversation-1",
            contactInboxId: "contact-inbox-1",
            messageId: "message-1",
          },
        },
      }),
    ).rejects.toMatchObject({ name: "UnrecoverableError" })

    expect(mocks.handleOrphanedIntegration).toHaveBeenCalledWith(
      orphanedIntegrationError,
    )
  })
})
