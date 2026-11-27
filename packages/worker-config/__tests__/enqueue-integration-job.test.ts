import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(async () => "job-id"),
  lowQueueAdd: vi.fn(async () => "low-job-id"),
}))

// Mock bullmq's `Queue` so importing the real `queues/integration` module
// never opens a socket — only `add()` calls are observed.
vi.mock("bullmq", () => ({
  Queue: class {
    constructor(name: string) {
      this.add = name === "low" ? mocks.lowQueueAdd : mocks.queueAdd
    }
    add: typeof mocks.queueAdd
  },
}))

// Resolves to the same file as `../../lib/connection` from inside
// `src/queues/integration/index.ts` — vi.mock keys off the resolved path,
// not the specifier string, so this intercepts that import too.
vi.mock("../src/lib/connection", () => ({
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
  fakeQueue: { add: vi.fn() },
  getRedisConnection: () => ({}),
  getQueueConnection: () => ({}),
  isNoRedisEnv: () => false,
}))

const {
  BROADCAST_SEND_PRIORITY,
  enqueueIntegrationJob,
  flowContinuationJobOptions,
  IntegrationJobAction,
  SEQUENCE_SEND_PRIORITY,
} = await import("../src/queues/integration")

beforeEach(() => {
  mocks.queueAdd.mockClear()
  mocks.lowQueueAdd.mockClear()
})

describe("jobOptionsByAction", () => {
  test("gives the 3 non-CAPI ads actions attempts:5 / 30s exponential backoff, no priority", async () => {
    for (const type of [
      IntegrationJobAction.evaluateTemplateSent,
      IntegrationJobAction.evaluateConversionTrigger,
      IntegrationJobAction.syncRetargetAudience,
    ] as const) {
      mocks.queueAdd.mockClear()
      await enqueueIntegrationJob({ type, data: {} } as never)

      const [, , opts] = mocks.queueAdd.mock.calls[0]
      expect(opts).toEqual({
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
      })
    }
  })

  test("gives sendConversionEvent the ads retry plus an explicit priority", async () => {
    await enqueueIntegrationJob({
      type: IntegrationJobAction.sendConversionEvent,
      data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
    })

    const [, , opts] = mocks.queueAdd.mock.calls[0]
    expect(opts).toEqual({
      attempts: 5,
      backoff: { type: "exponential", delay: 30_000 },
      priority: 1,
    })
  })

  test("leaves an existing integration action (no ads entry) with no extra opts", async () => {
    await enqueueIntegrationJob({
      type: IntegrationJobAction.agentMarkAsRead,
      data: { conversationId: "conv-1" },
    })

    const [, , opts] = mocks.queueAdd.mock.calls[0]
    expect(opts).toEqual({})
  })
})

describe("enqueueIntegrationJob merge order", () => {
  test("applies the action default when the caller passes no opts", async () => {
    await enqueueIntegrationJob({
      type: IntegrationJobAction.evaluateTemplateSent,
      data: {
        workspaceId: "ws-1",
        integrationWhatsappId: "iw-1",
        contactInboxId: "ci-1",
        templateId: "template-1",
      },
    })

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      IntegrationJobAction.evaluateTemplateSent,
      expect.objectContaining({
        type: IntegrationJobAction.evaluateTemplateSent,
      }),
      { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
    )
  })

  test("producer opts (jobId, retention) survive and override overlapping action defaults", async () => {
    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.sendConversionEvent,
        data: { adsConversionEventId: "event-1", workspaceId: "ws-1" },
      },
      {
        jobId: "ads-conversion-send-event-1",
        attempts: 99,
        removeOnComplete: true,
        removeOnFail: true,
      },
    )

    const [, , opts] = mocks.queueAdd.mock.calls[0]
    expect(opts).toEqual({
      // Producer wins on the overlapping key.
      attempts: 99,
      // Non-overlapping action default survives.
      backoff: { type: "exponential", delay: 30_000 },
      priority: 1,
      // Producer-only opts pass through untouched.
      jobId: "ads-conversion-send-event-1",
      removeOnComplete: true,
      removeOnFail: true,
    })
  })

  test("an existing integration producer's jobId is unaffected (no action defaults to merge)", async () => {
    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.agentMarkAsRead,
        data: { conversationId: "conv-1" },
      },
      { jobId: "agent-mark-as-read-1" },
    )

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      IntegrationJobAction.agentMarkAsRead,
      expect.objectContaining({ type: IntegrationJobAction.agentMarkAsRead }),
      { jobId: "agent-mark-as-read-1" },
    )
  })
})

const statusJob = (continuesFlow?: boolean) =>
  ({
    type: IntegrationJobAction.messageStatus,
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: "phone-1",
      payload: { messageId: "wamid.1", status: "delivered", timestamp: "1" },
      ...(continuesFlow === undefined ? {} : { continuesFlow }),
    },
  }) as const

describe("low-queue routing", () => {
  test("routes a plain message status to the low queue", async () => {
    await enqueueIntegrationJob(statusJob(), { jobId: "wa-status-1" })

    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(mocks.lowQueueAdd).toHaveBeenCalledWith(
      IntegrationJobAction.messageStatus,
      expect.objectContaining({ type: IntegrationJobAction.messageStatus }),
      { jobId: "wa-status-1" },
    )
  })

  test("routes a status with continuesFlow:false to the low queue", async () => {
    await enqueueIntegrationJob(statusJob(false))

    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("keeps a status that continues a flow on the integration queue", async () => {
    await enqueueIntegrationJob(statusJob(true))

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
  })

  test.each([
    [
      IntegrationJobAction.contactMarkAsRead,
      {
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        sourceConversationId: "psid-1",
        payload: {},
      },
    ],
    [
      IntegrationJobAction.incomingMessageEcho,
      {
        integrationType: "zalo",
        integrationIdentifier: "oa-1",
        payload: {},
      },
    ],
  ] as const)("routes %s to the low queue", async (type, data) => {
    await enqueueIntegrationJob({ type, data } as never)

    expect(mocks.lowQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("leaves customer messages on the integration queue", async () => {
    await enqueueIntegrationJob({
      type: IntegrationJobAction.incomingMessage,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        payload: {},
      },
    })

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.lowQueueAdd).not.toHaveBeenCalled()
  })
})

describe("flowContinuationJobOptions", () => {
  test("a continuation of a live flow gets no priority, so it stays in FIFO order with customer messages", () => {
    expect(flowContinuationJobOptions()).toEqual({})
    expect(
      flowContinuationJobOptions({
        type: "updateStatus",
      } as never),
    ).toEqual({})
  })

  test("broadcast and sequence runs keep the scheduled-send priority on every step", () => {
    expect(flowContinuationJobOptions({ type: "broadcast" } as never)).toEqual({
      priority: BROADCAST_SEND_PRIORITY,
    })
    expect(
      flowContinuationJobOptions({ type: "sequenceSchedule" } as never),
    ).toEqual({ priority: SEQUENCE_SEND_PRIORITY })
  })
})
