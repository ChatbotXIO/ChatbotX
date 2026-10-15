import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(async () => "job-id"),
}))

// Mock bullmq's `Queue` so importing the real default queue never opens a
// socket — only `add()` calls are observed.
vi.mock("bullmq", () => ({
  Queue: class {
    add = mocks.queueAdd
  },
}))

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
  DefaultJobAction,
  enqueueProcessInboundWebhookRequest,
  processInboundWebhookRequestJobId,
} = await import("../src/queues/default")

const data = {
  workspaceId: "ws-1",
  inboundWebhookId: "w-1",
  requestId: "9007199254740993",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("processInboundWebhookRequestJobId", () => {
  test("is deterministic per request and BullMQ-safe (no colon)", () => {
    const id = processInboundWebhookRequestJobId("123")

    expect(id).toBe("inbound-webhook-request-123")
    expect(id).not.toContain(":")
    expect(processInboundWebhookRequestJobId("124")).not.toBe(id)
  })
})

describe("enqueueProcessInboundWebhookRequest", () => {
  test("enqueues under the deterministic id so a duplicate enqueue is a no-op", async () => {
    await enqueueProcessInboundWebhookRequest(data)

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      DefaultJobAction.processInboundWebhookRequest,
      { type: DefaultJobAction.processInboundWebhookRequest, data },
      expect.objectContaining({
        jobId: `inbound-webhook-request-${data.requestId}`,
      }),
    )
  })

  test("does not keep finished jobs, so a re-dispatch of a still-unfinished request is never blocked by a completed one", async () => {
    await enqueueProcessInboundWebhookRequest(data)

    const [, , options] = mocks.queueAdd.mock.calls[0] as unknown as [
      string,
      unknown,
      { removeOnComplete: boolean },
    ]
    expect(options.removeOnComplete).toBe(true)
  })

  test("does not keep failed jobs either, so a re-dispatch can always enqueue the request again", async () => {
    await enqueueProcessInboundWebhookRequest(data)

    const [, , options] = mocks.queueAdd.mock.calls[0] as unknown as [
      string,
      unknown,
      { removeOnFail: boolean },
    ]
    expect(options.removeOnFail).toBe(true)
  })

  test("resolves to nothing, so callers do not depend on the queue implementation", async () => {
    await expect(
      enqueueProcessInboundWebhookRequest(data),
    ).resolves.toBeUndefined()
  })
})
