import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { createRedisConnection, loggerError, xadd } = vi.hoisted(() => ({
  createRedisConnection: vi.fn(),
  loggerError: vi.fn(),
  xadd: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  createRedisConnection,
}))

vi.mock("../src/logger", () => ({
  logger: { error: loggerError },
}))

vi.mock("../src/platform/settings", () => ({
  resolveRealtimeRedisUrl: () => "redis://realtime.test",
}))

const typingEvent = {
  data: { typing: true },
  eventType: "typing",
} as const

beforeEach(() => {
  createRedisConnection.mockReset()
  createRedisConnection.mockReturnValue({ xadd })
  loggerError.mockReset()
  xadd.mockReset()
})

afterEach(async () => {
  const { resetRealtimePublishStateForTests } = await import(
    "../src/platform/realtime-broadcast"
  )
  resetRealtimePublishStateForTests()
  vi.resetModules()
})

describe("realtime stream publisher Redis connection", () => {
  test("creates the connection with fail-fast options so xadd cannot hang during an outage", async () => {
    const { publishRealtimeStreamRecord } = await import(
      "../src/platform/realtime-stream-publisher"
    )
    xadd.mockResolvedValue("1-0")

    await publishRealtimeStreamRecord({
      event: typingEvent,
      guestConversationId: "guest-1",
      kind: "guest-event",
      workspaceId: "ws-1",
    })

    expect(createRedisConnection).toHaveBeenCalledWith(
      "redis://realtime.test",
      {
        commandTimeout: 2000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      },
    )
  })

  test("logs instead of hanging when xadd rejects during a fire-and-forget publish", async () => {
    const {
      queueWorkspaceRealtimeEvent,
      flushAllPendingWorkspaceRealtimeEvents,
    } = await import("../src/platform/realtime-broadcast")
    xadd.mockRejectedValue(new Error("ECONNREFUSED"))

    queueWorkspaceRealtimeEvent("ws-1", typingEvent)
    await flushAllPendingWorkspaceRealtimeEvents().catch(() => undefined)

    await vi.waitFor(() => {
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          workspaceId: "ws-1",
        }),
        "Failed to publish realtime event",
      )
    })
  })
})
