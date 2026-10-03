import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { createRedisConnection, loggerError, loggerWarn, set, xadd } =
  vi.hoisted(() => ({
    createRedisConnection: vi.fn(),
    loggerError: vi.fn(),
    loggerWarn: vi.fn(),
    set: vi.fn(),
    xadd: vi.fn(),
  }))

vi.mock("@chatbotx.io/redis", () => ({
  createRedisConnection,
}))

vi.mock("../src/logger", () => ({
  logger: { error: loggerError, warn: loggerWarn },
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
  createRedisConnection.mockReturnValue({ set, xadd })
  loggerError.mockReset()
  loggerWarn.mockReset()
  set.mockReset()
  set.mockResolvedValue("OK")
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

  test("retries a failed stream append and succeeds on its second attempt", async () => {
    // Load after `vi.resetModules()` to isolate the module-scoped Redis client.
    const { publishRealtimeStreamRecord } = await import(
      "../src/platform/realtime-stream-publisher"
    )
    xadd.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue("1-0")
    vi.useFakeTimers()

    const publish = publishRealtimeStreamRecord({
      event: typingEvent,
      guestConversationId: "guest-1",
      kind: "guest-event",
      workspaceId: "ws-1",
    })
    await vi.runAllTimersAsync()

    await expect(publish).resolves.toBeUndefined()
    expect(xadd).toHaveBeenCalledTimes(2)
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, workspaceId: "ws-1" }),
      "Realtime stream operation failed; retrying",
    )
    vi.useRealTimers()
  })

  test("throws the last stream append error after retries are exhausted", async () => {
    // Load after `vi.resetModules()` to isolate the module-scoped Redis client.
    const { publishRealtimeStreamRecord } = await import(
      "../src/platform/realtime-stream-publisher"
    )
    const failure = new Error("ECONNREFUSED")
    xadd.mockRejectedValue(failure)
    vi.useFakeTimers()

    const publish = publishRealtimeStreamRecord({
      event: typingEvent,
      guestConversationId: "guest-1",
      kind: "guest-event",
      workspaceId: "ws-1",
    })
    const assertion = expect(publish).rejects.toBe(failure)
    await vi.runAllTimersAsync()

    await assertion
    expect(xadd).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
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

  test("writes the authoritative revoked-at marker, keyed by workspace+user, with a TTL that outlives any still-valid connect token", async () => {
    // The gateway checks this key at connect time independent of replay
    // `lastSeq`.
    const { getRealtimeMemberRevokedKey, REALTIME_MEMBER_REVOKED_TTL_SECONDS } =
      await import("@chatbotx.io/realtime-protocol")
    const { revokeWorkspaceMemberRealtimeConnections } = await import(
      "../src/platform/realtime-broadcast"
    )
    xadd.mockResolvedValue("1-0")

    await revokeWorkspaceMemberRealtimeConnections({
      reason: "deleted",
      userId: "user-1",
      workspaceId: "ws-1",
    })

    expect(set).toHaveBeenCalledWith(
      getRealtimeMemberRevokedKey("ws-1", "user-1"),
      expect.any(String),
      "EX",
      REALTIME_MEMBER_REVOKED_TTL_SECONDS,
    )
  })
})
