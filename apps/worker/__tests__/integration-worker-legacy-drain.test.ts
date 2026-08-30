import { beforeEach, describe, expect, test, vi } from "vitest"

// This suite boots the real `src/integration/worker.ts` module and exercises
// the FORWARD-ONLY SHIM: `bull:integration` survives a deploy, so legacy
// coexist jobs (typed `IntegrationJobData` before the split, structurally
// identical to `HeavyJobData` after it) can still show up on this worker.
// Production deploys are Docker Swarm stop-first (no old/new code overlap),
// so every recognized legacy action — including flush — is forwarded into
// the `heavy` queue's single jobId namespace instead of any of them running
// in place; the worker no longer imports the coexist handlers at all.
// `heavyJobDataSchema.safeParse` delegates to the REAL schema (via
// `importOriginal` in the `@chatbotx.io/worker-config` mock below) so a
// recognized-but-malformed legacy payload is proven to fall through safely,
// not just an unrecognized `type` string. Full schema coverage still lives in
// `packages/worker-config/__tests__/heavy-job-data-schema.test.ts`; this suite
// stays focused on worker.ts's own dispatch/forwarding logic.

type CapturedWorker = {
  queueName: unknown
  processor: (job: {
    data: unknown
    name?: string
    id?: string
    opts?: Record<string, unknown>
  }) => Promise<unknown>
  options: Record<string, unknown>
}

const workerState = vi.hoisted(() => ({
  capturedWorkers: [] as CapturedWorker[],
  heavyQueueAdd: vi.fn(async () => undefined),
  ensureBootstrapped: vi.fn(async () => undefined),
  isBlockedWorkspace: vi.fn(async () => false),
  loggerWarn: vi.fn(),
  resolveWorkspaceId: vi.fn(async () => "ws-1"),
  // Implementation is wired to the REAL heavyJobDataSchema.safeParse inside
  // the "@chatbotx.io/worker-config" mock factory below (via importOriginal)
  // so this stays a genuine schema check, not a fake type-only lookup, while
  // remaining a spy for the blocked-workspace call-count assertion.
  safeParse: vi.fn(),
  workerClose: vi.fn(async () => undefined),
  workerOn: vi.fn(),
}))

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

  return {
    Worker: WorkerMock,
    // Instantiated at module scope by worker-config's queue setup when the
    // real @chatbotx.io/worker-config module is loaded below (via
    // importOriginal) to source the real heavyJobDataSchema; not exercised by
    // this unit test beyond needing to construct successfully. isNoRedisEnv()
    // is true under vitest, so heavyQueue itself resolves to fakeQueue and
    // never calls this constructor — it only guards other queues in the
    // barrel module.
    Queue: class Queue {
      add() {
        return Promise.resolve()
      }
    },
  }
})

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()

  // Delegate to the REAL schema so a recognized-but-malformed legacy payload
  // (e.g. coexistWhatsappFlush missing phoneNumberId, or coexistMessengerSync
  // missing workspaceId/integrationId) is rejected the same way it would be
  // in production, instead of a fake check that only inspected `type`.
  workerState.safeParse.mockImplementation((data: unknown) =>
    actual.heavyJobDataSchema.safeParse(data),
  )

  return {
    defaultWorkerOptions: {
      concurrency: 5,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
    getRedisConnection: () => ({}),
    closeIntegrationQueueEvents: vi.fn(async () => undefined),
    heavyJobDataSchema: { safeParse: workerState.safeParse },
    heavyQueue: { add: workerState.heavyQueueAdd },
    IntegrationJobAction: {
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
  }
})

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
  getStoryReply: vi.fn(),
}))

vi.mock("../src/env", () => ({
  env: { INTEGRATION_WORKER_CONCURRENCY: 10 },
}))

vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: workerState.ensureBootstrapped,
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: workerState.isBlockedWorkspace,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: workerState.loggerWarn },
}))

vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: workerState.resolveWorkspaceId,
}))

vi.mock("../src/integration/handlers/ads-automatic-event", () => ({
  handleAdsAutomaticEvent: vi.fn(),
}))
vi.mock("../src/integration/handlers/ads-conversion/registry", () => ({
  dispatchAdsConversionJob: vi.fn(),
}))
vi.mock("../src/integration/handlers/automated-response", () => ({
  processAutomatedResponse: vi.fn(),
}))
vi.mock("../src/integration/handlers/challenge", () => ({
  runChallenge: vi.fn(),
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
  receiveMessage: vi.fn(async () => ({ message: null })),
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

await import("../src/integration/worker")
await vi.waitFor(() => {
  expect(workerState.capturedWorkers).toHaveLength(1)
})

const getProcessor = () => {
  const [integrationWorker] = workerState.capturedWorkers
  if (!integrationWorker) {
    throw new Error("integration worker was not captured")
  }
  return integrationWorker.processor
}

beforeEach(() => {
  workerState.heavyQueueAdd.mockClear()
  workerState.isBlockedWorkspace.mockClear()
  workerState.isBlockedWorkspace.mockResolvedValue(false)
  workerState.resolveWorkspaceId.mockClear()
  workerState.resolveWorkspaceId.mockResolvedValue("ws-1")
  workerState.safeParse.mockClear()
  workerState.loggerWarn.mockClear()
})

describe("integration worker forward-only shim — every legacy coexist action forwards", () => {
  const cases: Array<{ type: string; payload: Record<string, unknown> }> = [
    {
      type: "coexistWhatsappBuffer",
      payload: { phoneNumberId: "phone-1", payload: { entry: [] } },
    },
    {
      type: "coexistWhatsappFlush",
      payload: { runId: "run-3", phoneNumberId: "phone-3" },
    },
    {
      type: "coexistMessengerSync",
      payload: {
        runId: "run-1",
        integrationId: "int-1",
        workspaceId: "ws-1",
      },
    },
    {
      type: "coexistInstagramSync",
      payload: {
        runId: "run-2",
        integrationId: "int-2",
        workspaceId: "ws-1",
      },
    },
    {
      type: "coexistAttachmentDownload",
      payload: {
        attachmentId: "att-1",
        workspaceId: "ws-1",
        channel: "messenger" as const,
        integrationId: "int-1",
      },
    },
  ]

  test.each(
    cases,
  )("forwards a legacy $type job to heavyQueue preserving jobId/opts (minus delay/repeat)", async ({
    type,
    payload,
  }) => {
    const job = {
      data: { type, data: payload },
      name: type,
      id: `raw-job-id-${type}`,
      opts: {
        jobId: `custom-jobid-${type}`,
        delay: 60_000,
        attempts: 2,
        removeOnComplete: true,
      },
    }

    await getProcessor()(job)

    expect(workerState.heavyQueueAdd).toHaveBeenCalledTimes(1)
    const [name, data, opts] = workerState.heavyQueueAdd.mock.calls[0] as [
      string,
      unknown,
      Record<string, unknown>,
    ]
    expect(name).toBe(type)
    expect(data).toEqual(job.data)
    expect(opts.jobId).toBe(`custom-jobid-${type}`)
    expect(opts.attempts).toBe(2)
    expect(opts.removeOnComplete).toBe(true)
    expect(opts).not.toHaveProperty("delay")
    expect(opts).not.toHaveProperty("repeat")
  })

  test("falls back to job.id as the forwarded jobId when opts carries none", async () => {
    const job = {
      data: {
        type: "coexistWhatsappFlush",
        data: { phoneNumberId: "phone-4" },
      },
      name: "coexistWhatsappFlush",
      id: "raw-job-id-fallback",
      opts: {},
    }

    await getProcessor()(job)

    const [, , opts] = workerState.heavyQueueAdd.mock.calls[0] as [
      string,
      unknown,
      Record<string, unknown>,
    ]
    expect(opts.jobId).toBe("raw-job-id-fallback")
  })
})

describe("integration worker forward-only shim — malformed/unknown payload", () => {
  test("an unrecognized type fails safeParse and falls through to the normal switch (unhandled-type warn), no throw", async () => {
    await expect(
      getProcessor()({
        data: { type: "totallyUnknownAction", data: {} },
      }),
    ).resolves.toBeUndefined()

    expect(workerState.heavyQueueAdd).not.toHaveBeenCalled()
    expect(workerState.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "totallyUnknownAction" }),
      }),
      "Unhandled integration job type",
    )
  })

  test("a recognized coexistWhatsappFlush payload missing phoneNumberId fails the real schema and falls through, no throw", async () => {
    await expect(
      getProcessor()({
        data: { type: "coexistWhatsappFlush", data: {} },
      }),
    ).resolves.toBeUndefined()

    expect(workerState.heavyQueueAdd).not.toHaveBeenCalled()
    expect(workerState.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "coexistWhatsappFlush" }),
      }),
      "Unhandled integration job type",
    )
  })

  test("a recognized coexistMessengerSync payload missing workspaceId/integrationId fails the real schema and falls through, no throw", async () => {
    await expect(
      getProcessor()({
        data: { type: "coexistMessengerSync", data: { runId: "r" } },
      }),
    ).resolves.toBeUndefined()

    expect(workerState.heavyQueueAdd).not.toHaveBeenCalled()
    expect(workerState.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "coexistMessengerSync" }),
      }),
      "Unhandled integration job type",
    )
  })
})

describe("integration worker forward-only shim — blocked-workspace guard ordering", () => {
  test("a blocked workspace short-circuits BEFORE the forward-only shim parse runs", async () => {
    workerState.isBlockedWorkspace.mockResolvedValueOnce(true)

    await getProcessor()({
      data: {
        type: "coexistWhatsappBuffer",
        data: { phoneNumberId: "phone-blocked", payload: {} },
      },
    })

    expect(workerState.safeParse).not.toHaveBeenCalled()
    expect(workerState.heavyQueueAdd).not.toHaveBeenCalled()
  })
})
