import { getAuditActor } from "@chatbotx.io/business/audit"
import type { AdsConversionJobData } from "@chatbotx.io/worker-config"
import { describe, expect, test, vi } from "vitest"

// This test boots the real `src/integration/worker.ts` module (it starts
// itself on import) to assert the TRUE single-queue merge: the integration
// worker PROCESS boots exactly one BullMQ `Worker`, on the `integration`
// queue, and the 4 ads-conversion job types route through that worker's
// switch to the `dispatchAdsConversionJob` sub-registry — there is no
// second Worker/queue. Every import worker.ts pulls in is mocked below so
// this stays a fast, isolated unit test.

type CapturedWorker = {
  queueName: unknown
  processor: (job: {
    data: unknown
    id?: string
    name?: string
  }) => Promise<unknown>
  options: Record<string, unknown>
}

const workerState = vi.hoisted(() => ({
  aiAgentQueueAdd: vi.fn(async () => undefined),
  capturedWorkers: [] as CapturedWorker[],
  dispatchAdsConversionJob: vi.fn(async () => undefined),
  ensureBootstrapped: vi.fn(async () => undefined),
  getStoryReply: vi.fn(),
  receiveMessage: vi.fn(),
  workerClose: vi.fn(async () => undefined),
  workerOn: vi.fn(),
}))

const LEGACY_AUTOMATION_ID_PATTERN = /^legacy-[a-f0-9]{24}$/
const LEGACY_COMMENT_JOB_ID_PATTERN =
  /^comment-ai-reply-legacy-comment-1-public-[a-f0-9]{24}$/

vi.mock("bullmq", () => {
  class WorkerMock {
    close = workerState.workerClose
    on = workerState.workerOn

    constructor(
      queueName: unknown,
      processor: CapturedWorker["processor"],
      options: Record<string, unknown>,
    ) {
      workerState.capturedWorkers.push({ queueName, processor, options })
    }
  }

  return { Worker: WorkerMock }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: {
    commentAIReply: "commentAIReply",
    processAutomatedResponse: "processAutomatedResponse",
    processStoryReplyAutomation: "processStoryReplyAutomation",
  },
  aiAgentQueue: { add: workerState.aiAgentQueueAdd },
  closeIntegrationQueueEvents: vi.fn(async () => undefined),
  defaultWorkerOptions: {
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
  getRedisConnection: () => ({}),
  IntegrationJobAction: {
    incomingMessage: "incomingMessage",
    processAutomatedResonse: "processAutomatedResponse",
    commentAIReply: "commentAIReply",
    processStoryReplyAutomation: "processStoryReplyAutomation",
    evaluateTemplateSent: "evaluateTemplateSent",
    evaluateConversionTrigger: "evaluateConversionTrigger",
    sendConversionEvent: "sendConversionEvent",
    syncRetargetAudience: "syncRetargetAudience",
  },
  integrationQueue: { add: vi.fn() },
  queueNames: {
    enum: {
      integration: "integration",
    },
  },
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: { enqueue: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { ensureActive: vi.fn() },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/sdk")>()),
  getStoryReply: workerState.getStoryReply,
}))

vi.mock("../src/env", () => ({
  env: { INTEGRATION_WORKER_CONCURRENCY: 10 },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: workerState.ensureBootstrapped,
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: vi.fn(async () => false),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: vi.fn(async () => undefined),
}))

vi.mock("../src/integration/handlers/ads-automatic-event", () => ({
  handleAdsAutomaticEvent: vi.fn(),
}))
vi.mock("../src/integration/handlers/ads-conversion/registry", () => ({
  dispatchAdsConversionJob: workerState.dispatchAdsConversionJob,
}))
vi.mock("../src/integration/handlers/automated-response", () => ({
  processAutomatedResponse: vi.fn(),
}))
vi.mock("../src/integration/handlers/challenge", () => ({
  runChallenge: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/attachment-download", () => ({
  coexistAttachmentDownload: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/instagram-sync", () => ({
  coexistInstagramSync: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/messenger-sync", () => ({
  coexistMessengerSync: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/whatsapp-buffer", () => ({
  coexistWhatsappBuffer: vi.fn(),
}))
vi.mock("../src/integration/handlers/coexist/whatsapp-flush", () => ({
  coexistWhatsappFlush: vi.fn(),
}))
vi.mock("../src/integration/handlers/comment-automation", () => ({
  processCommentAutomation: vi.fn(),
}))
vi.mock("../src/integration/handlers/comment-automation/ai-reply", () => ({
  processCommentAIReply: vi.fn(),
}))
vi.mock("../src/integration/handlers/contact/update-avatar", () => ({
  updateContactAvatar: vi.fn(),
}))
vi.mock("../src/integration/handlers/conversation", () => ({
  agentMarkAsRead: vi.fn(),
  contactMarkAsRead: vi.fn(),
}))
vi.mock("../src/integration/handlers/flow", () => ({
  runFlowNode: vi.fn(),
  runFlowPostback: vi.fn(),
  runFlowQuickReply: vi.fn(),
}))
vi.mock("../src/integration/handlers/follow-up", () => ({
  runFollowUpResume: vi.fn(),
}))
vi.mock("../src/integration/handlers/inbox_labels", () => ({
  handleChannelLabelWebhook: vi.fn(),
}))
vi.mock("../src/integration/handlers/lead-ads", () => ({
  processLeadgen: vi.fn(),
}))
vi.mock("../src/integration/handlers/message-status", () => ({
  handleMessageStatus: vi.fn(),
}))
vi.mock("../src/integration/handlers/received-message", () => ({
  deleteIncomingComment: vi.fn(),
  receiveComment: vi.fn(),
  receiveMessage: workerState.receiveMessage,
  updateIncomingComment: vi.fn(),
}))
vi.mock("../src/integration/handlers/ref", () => ({
  runRef: vi.fn(),
}))
vi.mock("../src/integration/handlers/sequence-flow", () => ({
  handleSendSequenceFlow: vi.fn(),
}))
vi.mock("../src/integration/handlers/story-reply-automation", () => ({
  processStoryReplyAutomation: vi.fn(),
}))
vi.mock("../src/integration/handlers/template-flow-response", () => ({
  captureTemplateFlowResponse: vi.fn(),
}))
vi.mock("../src/integration/handlers/wait-resume", () => ({
  runWaitResume: vi.fn(),
}))
vi.mock("../src/integration/job-context", () => ({
  runIntegrationJobWithWebhookContext: vi.fn(
    async (_job: unknown, callback: () => Promise<unknown>) => callback(),
  ),
}))
vi.mock("../src/integration/routing", () => ({
  resolveIncomingTextRouting: vi.fn(),
}))
vi.mock("../src/integration/utils/message", () => ({
  closeChatQueueEvents: vi.fn(async () => undefined),
}))

// Importing the worker module boots it exactly once (ESM module cache) —
// the single `new Worker(...)` call happens as a side effect of this
// import, so it must happen once, before any assertions, rather than
// per-test.
await import("../src/integration/worker")
await vi.waitFor(() => {
  expect(workerState.capturedWorkers).toHaveLength(1)
})

describe("integration worker process boot (single shared queue)", () => {
  test("boots exactly one Worker, on the integration queue", () => {
    expect(workerState.capturedWorkers).toHaveLength(1)
    expect(workerState.capturedWorkers[0]?.queueName).toBe("integration")
  })

  test("keeps the env-tunable concurrency and long coexist lock", () => {
    const [integrationWorker] = workerState.capturedWorkers

    expect(integrationWorker?.options.concurrency).toBe(10)
    expect(integrationWorker?.options.lockDuration).toBe(10 * 60 * 1000)
  })
})

describe("ads-conversion actions route through the shared integration switch", () => {
  const adsConversionJobs: AdsConversionJobData[] = [
    {
      type: "evaluateTemplateSent",
      data: {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        templateId: "template-1",
      },
    },
    {
      type: "evaluateConversionTrigger",
      data: {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        occurrence: { type: "tagApplied", tagId: "tag-1" },
      },
    },
    {
      type: "sendConversionEvent",
      data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
    },
    {
      type: "syncRetargetAudience",
      data: {
        workspaceId: "ws-1",
        customAudienceId: "audience-1",
        segment: "leads",
        since: "2026-01-01",
        until: "2026-01-31",
      },
    },
  ]

  test.each(
    adsConversionJobs,
  )("delegates $type jobs to dispatchAdsConversionJob", async (jobData) => {
    workerState.dispatchAdsConversionJob.mockClear()
    const [integrationWorker] = workerState.capturedWorkers

    await integrationWorker?.processor({ data: jobData })

    expect(workerState.dispatchAdsConversionJob).toHaveBeenCalledWith(jobData)
  })

  test("populates the audit actor with the job source before dispatching", async () => {
    let capturedActor: ReturnType<typeof getAuditActor>
    workerState.dispatchAdsConversionJob.mockImplementationOnce(() => {
      capturedActor = getAuditActor()
    })
    const [integrationWorker] = workerState.capturedWorkers

    await integrationWorker?.processor({ data: adsConversionJobs[0] })

    expect(capturedActor).toEqual(
      expect.objectContaining({ source: "integration:evaluateTemplateSent" }),
    )
  })
})

describe("Phase 1 AI reply compatibility forwarding", () => {
  test("enqueues new story reply jobs directly on aiAgent", async () => {
    workerState.aiAgentQueueAdd.mockClear()
    workerState.getStoryReply.mockReturnValue({
      id: "story-1",
      url: "https://example.com/story",
    })
    workerState.receiveMessage.mockResolvedValue({
      message: {
        id: "message-1",
        contactInboxId: "contact-inbox-1",
        senderType: "contact",
        contentType: "text",
        attachments: [],
        contentAttributes: {},
        text: "hello",
      },
      conversation: { id: "conversation-1", workspaceId: "workspace-1" },
      channelType: "instagram",
    })
    const [integrationWorker] = workerState.capturedWorkers

    await integrationWorker?.processor({
      id: "incoming-message-job",
      data: {
        type: "incomingMessage",
        data: {
          integrationType: "instagram",
          integrationIdentifier: "ig-1",
          payload: {},
        },
      },
    })

    expect(workerState.aiAgentQueueAdd).toHaveBeenCalledWith(
      "processStoryReplyAutomation",
      expect.objectContaining({
        type: "processStoryReplyAutomation",
        data: expect.objectContaining({ messageId: "message-1" }),
      }),
      { jobId: "story-reply-auto-message-1" },
    )
  })

  test("normalizes legacy automated-response model references before forwarding", async () => {
    workerState.aiAgentQueueAdd.mockClear()
    const [integrationWorker] = workerState.capturedWorkers

    await integrationWorker?.processor({
      id: "legacy-auto-response-job",
      data: {
        type: "processAutomatedResponse",
        data: {
          conversationId: { id: "conversation-1" },
          contactInboxId: { id: "contact-inbox-1" },
          messageId: "message-1",
        },
      },
    })

    expect(workerState.aiAgentQueueAdd).toHaveBeenCalledWith(
      "processAutomatedResponse",
      {
        type: "processAutomatedResponse",
        data: {
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          messageId: "message-1",
        },
      },
      { jobId: "automated-response-message-1" },
    )
  })

  test("gives legacy comment jobs a stable collision-safe fallback id", async () => {
    workerState.aiAgentQueueAdd.mockClear()
    const [integrationWorker] = workerState.capturedWorkers
    const legacyJob = {
      id: "legacy-comment-job",
      data: {
        type: "commentAIReply",
        data: {
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
    }

    await integrationWorker?.processor(legacyJob)
    await integrationWorker?.processor(legacyJob)

    const firstCall = workerState.aiAgentQueueAdd.mock.calls[0]
    const secondCall = workerState.aiAgentQueueAdd.mock.calls[1]
    expect(firstCall?.[0]).toBe("commentAIReply")
    expect(firstCall?.[1]).toEqual(
      expect.objectContaining({
        type: "commentAIReply",
        data: expect.objectContaining({
          automationId: expect.stringMatching(LEGACY_AUTOMATION_ID_PATTERN),
        }),
      }),
    )
    expect(firstCall?.[2]?.jobId).toMatch(LEGACY_COMMENT_JOB_ID_PATTERN)
    expect(secondCall?.[2]?.jobId).toBe(firstCall?.[2]?.jobId)
    expect(firstCall?.[2]?.jobId).not.toContain(":")
  })

  test("forwards legacy story jobs with the producer job id", async () => {
    workerState.aiAgentQueueAdd.mockClear()
    const [integrationWorker] = workerState.capturedWorkers

    await integrationWorker?.processor({
      id: "legacy-story-job",
      data: {
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
    })

    expect(workerState.aiAgentQueueAdd).toHaveBeenCalledWith(
      "processStoryReplyAutomation",
      expect.objectContaining({ type: "processStoryReplyAutomation" }),
      { jobId: "story-reply-auto-message-1" },
    )
  })
})
