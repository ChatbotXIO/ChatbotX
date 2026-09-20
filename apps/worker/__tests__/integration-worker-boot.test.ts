import { getAuditActor } from "@chatbotx.io/business/audit"
import type { AdsConversionJobData } from "@chatbotx.io/worker-config"
import { describe, expect, test, vi } from "vitest"

// Boots the real `src/integration/worker.ts` (starts itself on import) and
// asserts it creates exactly three BullMQ `Worker`s: `integration` (shared,
// dispatches every job type including ads-conversion via
// `dispatchAdsConversionJob`), rate-limited `callTranscription`, and
// `whatsappVoipSignaling` — no fourth. All of worker.ts's imports are mocked
// below to keep this a fast, isolated unit test.

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
  getHeavyJobCompletionWaitTimeoutMs: vi.fn(() => 330_000),
  getRedisConnection: () => ({}),
  HeavyJobAction: { aiGenerateImage: "aiGenerateImage" },
  IntegrationJobAction: {
    incomingMessage: "incomingMessage",
    processAutomatedResonse: "processAutomatedResponse",
    commentAIReply: "commentAIReply",
    processStoryReplyAutomation: "processStoryReplyAutomation",
    evaluateTemplateSent: "evaluateTemplateSent",
    evaluateConversionTrigger: "evaluateConversionTrigger",
    sendConversionEvent: "sendConversionEvent",
    syncRetargetAudience: "syncRetargetAudience",
    whatsappCallEvent: "whatsappCallEvent",
  },
  integrationQueue: { add: vi.fn() },
  queueNames: {
    enum: {
      integration: "integration",
      callTranscription: "callTranscription",
      whatsappVoipSignaling: "whatsappVoipSignaling",
    },
  },
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: { enqueue: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { ensureActive: vi.fn() },
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: unknown, fn: () => Promise<unknown>) => await fn(),
  ),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/sdk")>()),
  getStoryReply: workerState.getStoryReply,
}))

vi.mock("../src/env", () => ({
  env: {
    HEAVY_JOB_WAIT_TIMEOUT_MS: 120_000,
    INTEGRATION_WORKER_CONCURRENCY: 10,
    CALL_TRANSCRIBE_PER_MIN: 10,
  },
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

// Only needed for the `handleConnect`-payload boot tests below (every
// other captured-worker test in this file uses job types that carry
// `workspaceId` directly, per `resolveVoipSignalingWorkspaceId`'s own
// `"workspaceId" in job.data` branch).
const identifyInboxAndIntegrationAuthFromIdentifier = vi.fn()
vi.mock("../src/services/integrations", () => ({
  integrationService: { identifyInboxAndIntegrationAuthFromIdentifier },
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
vi.mock(
  "../src/integration/handlers/comment-automation/deferred-private-reply",
  () => ({ runDeferredCommentPrivateReply: vi.fn() }),
)
vi.mock("../src/integration/handlers/tiktok-high-intent-comment", () => ({
  receiveTiktokHighIntentComment: vi.fn(),
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
vi.mock("../src/integration/handlers/whatsapp-call", () => ({
  handleWhatsappCallEvent: vi.fn(async () => undefined),
}))

vi.mock("../src/integration/handlers/whatsapp-voip-signaling", () => ({
  handleWhatsappVoipSignalingJob: vi.fn(),
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
// the three `new Worker(...)` calls happen as a side effect of this import,
// so they must happen once, before any assertions, rather than per-test.
await import("../src/integration/worker")
await vi.waitFor(() => {
  expect(workerState.capturedWorkers).toHaveLength(3)
})

describe("integration worker process boot", () => {
  test("boots exactly three Workers: the shared integration queue, the dedicated callTranscription queue, and the dedicated whatsappVoipSignaling queue", () => {
    expect(workerState.capturedWorkers).toHaveLength(3)
    expect(workerState.capturedWorkers[0]?.queueName).toBe("integration")
    expect(workerState.capturedWorkers[1]?.queueName).toBe("callTranscription")
    expect(workerState.capturedWorkers[2]?.queueName).toBe(
      "whatsappVoipSignaling",
    )
  })

  test("keeps the env-tunable concurrency and long coexist lock on the integration worker", () => {
    const [integrationWorker] = workerState.capturedWorkers

    expect(integrationWorker?.options.concurrency).toBe(10)
    expect(integrationWorker?.options.lockDuration).toBe(10 * 60 * 1000)
  })

  test("the callTranscription worker carries the CALL_TRANSCRIBE_PER_MIN limiter", () => {
    const [, transcriptionWorker] = workerState.capturedWorkers

    expect(transcriptionWorker?.options.limiter).toEqual({
      max: 10,
      duration: 60_000,
    })
    expect(transcriptionWorker?.options.concurrency).toBe(1)
  })

  test("the whatsappVoipSignaling worker is a dedicated, non-rate-limited consumer", () => {
    const [, , voipSignalingWorker] = workerState.capturedWorkers

    expect(voipSignalingWorker?.options.concurrency).toBe(10)
    expect(voipSignalingWorker?.options.limiter).toBeUndefined()
  })

  // Call control, including a fresh `handleConnect` ring, is off
  // for a frozen workspace (scheduled deletion / blocked owner). The
  // wrapping below applies uniformly to EVERY job type on this worker
  // (`handleConnect` included) — it does not switch on `job.data.type`
  // before calling `withBlockedOwnerGuard`, so a test proving the guard
  // gates the handler for one job type proves it for all of them,
  // including the ring path.
  test("withBlockedOwnerGuard deciding a workspace is frozen prevents handleWhatsappVoipSignalingJob (and therefore any ring) from ever running", async () => {
    const { withBlockedOwnerGuard } = await import("@chatbotx.io/business")
    const { handleWhatsappVoipSignalingJob } = await import(
      "../src/integration/handlers/whatsapp-voip-signaling"
    )
    vi.mocked(withBlockedOwnerGuard).mockClear()
    vi.mocked(handleWhatsappVoipSignalingJob).mockClear()
    // Simulates the guard's own frozen-workspace no-op (see
    // `with-blocked-owner-guard.ts`): it resolves without ever invoking the
    // callback it was given.
    vi.mocked(withBlockedOwnerGuard).mockImplementationOnce(
      async () => undefined,
    )

    const [, , voipSignalingWorker] = workerState.capturedWorkers
    await voipSignalingWorker?.processor({
      data: {
        type: "handleOutboundAnswer",
        data: {
          workspaceId: "ws-frozen",
          attemptId: "att-1",
          whatsappCallId: "call-1",
        },
      },
    })

    expect(withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-frozen",
      expect.any(Function),
    )
    expect(handleWhatsappVoipSignalingJob).not.toHaveBeenCalled()
  })

  test("resolveVoipSignalingWorkspaceId resolves the workspace via the integration lookup, and the guard receives THAT resolved id", async () => {
    const { withBlockedOwnerGuard } = await import("@chatbotx.io/business")
    vi.mocked(withBlockedOwnerGuard).mockClear()
    identifyInboxAndIntegrationAuthFromIdentifier.mockReset()
    identifyInboxAndIntegrationAuthFromIdentifier.mockResolvedValue({
      inbox: { workspaceId: "ws-resolved" },
    })

    const [, , voipSignalingWorker] = workerState.capturedWorkers
    await voipSignalingWorker?.processor({
      data: {
        type: "handleConnect",
        data: {
          wacid: "wacid-1",
          deadlineAt: Date.now() + 30_000,
          phoneNumberId: "phone-1",
          receivedAt: Date.now(),
        },
      },
    })

    expect(withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-resolved",
      expect.any(Function),
    )
  })

  test("a failed integration lookup resolves the workspace as undefined, so the guard runs FAIL-OPEN (existing, documented behaviour — resolveVoipSignalingWorkspaceId's own doc comment; not changed here)", async () => {
    const { withBlockedOwnerGuard } = await import("@chatbotx.io/business")
    vi.mocked(withBlockedOwnerGuard).mockClear()
    identifyInboxAndIntegrationAuthFromIdentifier.mockReset()
    identifyInboxAndIntegrationAuthFromIdentifier.mockRejectedValue(
      new Error("no integration for this phoneNumberId"),
    )

    const [, , voipSignalingWorker] = workerState.capturedWorkers
    await voipSignalingWorker?.processor({
      data: {
        type: "handleConnect",
        data: {
          wacid: "wacid-2",
          deadlineAt: Date.now() + 30_000,
          phoneNumberId: "phone-unknown",
          receivedAt: Date.now(),
        },
      },
    })

    // `resolveVoipSignalingWorkspaceId` swallows the lookup failure and
    // returns `undefined`, so the guard treats the job as fail-open (per
    // with-blocked-owner-guard.ts's "no workspace identity" contract) —
    // an unresolvable `phoneNumberId` can't be attributed to a frozen
    // workspace anyway.
    expect(withBlockedOwnerGuard).toHaveBeenCalledWith(
      undefined,
      expect.any(Function),
    )
  })
})

describe("whatsappCallEvent (the main integration queue's isBlockedWorkspace gate)", () => {
  test("a terminate whatsappCallEvent job for a frozen workspace never reaches handleWhatsappCallEvent", async () => {
    const { isBlockedWorkspace } = await import(
      "../src/lib/is-blocked-workspace"
    )
    const { resolveWorkspaceId } = await import(
      "../src/lib/resolve-workspace-id"
    )
    const { handleWhatsappCallEvent } = await import(
      "../src/integration/handlers/whatsapp-call"
    )
    vi.mocked(isBlockedWorkspace).mockClear()
    vi.mocked(resolveWorkspaceId).mockClear()
    vi.mocked(handleWhatsappCallEvent).mockClear()
    vi.mocked(resolveWorkspaceId).mockResolvedValueOnce("ws-frozen")
    // Simulates a frozen workspace (scheduled deletion / blocked owner) —
    // the main integration queue's own guard, distinct from
    // `withBlockedOwnerGuard` used by the VoIP signaling queue above.
    vi.mocked(isBlockedWorkspace).mockResolvedValueOnce(true)

    const [integrationWorker] = workerState.capturedWorkers
    const result = await integrationWorker?.processor({
      data: {
        type: "whatsappCallEvent",
        data: {
          workspaceId: "ws-frozen",
          wacid: "wacid-1",
          event: "terminate",
        },
      },
    })

    expect(isBlockedWorkspace).toHaveBeenCalledWith("ws-frozen")
    expect(handleWhatsappCallEvent).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
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
