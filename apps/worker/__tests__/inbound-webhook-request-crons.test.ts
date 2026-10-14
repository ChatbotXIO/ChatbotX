import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  abandonStaleRequests: vi.fn(),
  listStaleRequests: vi.fn(),
  purgeRequests: vi.fn(),
  enqueue: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboundWebhookService: {
    abandonStaleRequests: mocks.abandonStaleRequests,
    listStaleRequests: mocks.listStaleRequests,
    purgeRequests: mocks.purgeRequests,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueProcessInboundWebhookRequest: mocks.enqueue,
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    info: mocks.info,
    warn: mocks.warn,
    error: mocks.error,
  }),
}))

const { redispatchInboundWebhookRequests } = await import(
  "../src/schedule/handlers/redispatch-inbound-webhook-requests"
)
const { purgeInboundWebhookRequests } = await import(
  "../src/schedule/handlers/purge-inbound-webhook-requests"
)

const stale = (id: string) => ({
  id,
  workspaceId: "ws-1",
  inboundWebhookId: "w-1",
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.abandonStaleRequests.mockResolvedValue(0)
  mocks.listStaleRequests.mockResolvedValue([])
  mocks.enqueue.mockResolvedValue(undefined)
})

describe("redispatchInboundWebhookRequests", () => {
  test("re-enqueues every stale request with its ids", async () => {
    mocks.listStaleRequests.mockResolvedValue([stale("r-1"), stale("r-2")])

    await redispatchInboundWebhookRequests()

    expect(mocks.listStaleRequests).toHaveBeenCalledWith(500)
    expect(mocks.enqueue.mock.calls.map(([data]) => data)).toEqual([
      { workspaceId: "ws-1", inboundWebhookId: "w-1", requestId: "r-1" },
      { workspaceId: "ws-1", inboundWebhookId: "w-1", requestId: "r-2" },
    ])
  })

  test("closes what is too old before listing, and warns", async () => {
    mocks.abandonStaleRequests.mockResolvedValue(3)
    const order: string[] = []
    mocks.abandonStaleRequests.mockImplementation(() => {
      order.push("abandon")
      return Promise.resolve(3)
    })
    mocks.listStaleRequests.mockImplementation(() => {
      order.push("list")
      return Promise.resolve([])
    })

    await redispatchInboundWebhookRequests()

    expect(order).toEqual(["abandon", "list"])
    expect(mocks.warn).toHaveBeenCalledWith(
      { abandoned: 3 },
      expect.any(String),
    )
  })

  test("an enqueue failure for one request does not stop the others and is reported", async () => {
    mocks.listStaleRequests.mockResolvedValue([stale("r-1"), stale("r-2")])
    mocks.enqueue.mockRejectedValueOnce(new Error("redis down"))

    await expect(redispatchInboundWebhookRequests()).resolves.toBeUndefined()

    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledWith({ failed: 1 }, expect.any(String))
  })

  test("is a no-op when nothing is stale", async () => {
    await redispatchInboundWebhookRequests()

    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.info).not.toHaveBeenCalled()
  })
})

describe("purgeInboundWebhookRequests", () => {
  test("purges 30 days back in bounded chunks", async () => {
    mocks.purgeRequests.mockResolvedValue({ deleted: 5, stopReason: "drained" })

    await purgeInboundWebhookRequests()

    expect(mocks.purgeRequests).toHaveBeenCalledWith({
      retentionDays: 30,
      chunkSize: 1000,
      interChunkDelayMs: 100,
      maxChunks: 10_000,
      maxRunDurationMs: 10 * 60 * 1000,
    })
    expect(mocks.info).toHaveBeenCalledWith({ deleted: 5 }, expect.any(String))
  })

  test("warns when a backlog remains", async () => {
    mocks.purgeRequests.mockResolvedValue({
      deleted: 1000,
      stopReason: "deadline",
    })

    await purgeInboundWebhookRequests()

    expect(mocks.warn).toHaveBeenCalledWith(
      { deleted: 1000, stopReason: "deadline" },
      expect.any(String),
    )
  })
})
