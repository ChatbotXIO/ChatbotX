import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(async () => "job-id"),
}))

// Mock bullmq's `Queue` so importing the real `queues/integration` module
// never opens a socket — only `add()` calls are observed.
vi.mock("bullmq", () => ({
  Queue: class {
    add = mocks.queueAdd
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
}))

const { enqueueIntegrationJob, IntegrationJobAction } = await import(
  "../src/queues/integration"
)

beforeEach(() => {
  mocks.queueAdd.mockClear()
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
