import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  createRedisConnection,
  connect,
  disconnect,
  loggerError,
  loggerWarn,
  set,
  xadd,
} = vi.hoisted(() => ({
  connect: vi.fn(),
  createRedisConnection: vi.fn(),
  disconnect: vi.fn(),
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

const STREAM_MIN_ID_PATTERN = /^\d+-0$/

beforeEach(() => {
  connect.mockReset()
  connect.mockResolvedValue(undefined)
  createRedisConnection.mockReset()
  createRedisConnection.mockReturnValue({ connect, disconnect, set, xadd })
  disconnect.mockReset()
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
  test("creates a lazy connection with fail-fast command options", async () => {
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
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      },
    )
  })

  test("waits for the initial connection before appending to the stream", async () => {
    const { promise, resolve } = Promise.withResolvers<void>()
    connect.mockReturnValueOnce(promise)
    xadd.mockResolvedValue("1-0")
    const { publishRealtimeStreamRecord } = await import(
      "../src/platform/realtime-stream-publisher"
    )

    const publish = publishRealtimeStreamRecord({
      event: typingEvent,
      guestConversationId: "guest-1",
      kind: "guest-event",
      workspaceId: "ws-1",
    })

    expect(xadd).not.toHaveBeenCalled()
    resolve()
    await publish

    expect(xadd).toHaveBeenCalledTimes(1)
  })

  test("recreates the client after its initial connection attempt rejects", async () => {
    const initialFailure = new Error("ECONNREFUSED")
    const initialConnect = vi.fn().mockRejectedValue(initialFailure)
    const retryConnect = vi.fn().mockResolvedValue(undefined)
    createRedisConnection
      .mockReturnValueOnce({
        connect: initialConnect,
        disconnect,
        set,
        xadd,
      })
      .mockReturnValueOnce({
        connect: retryConnect,
        disconnect,
        set,
        xadd,
      })
    xadd.mockResolvedValue("1-0")
    vi.useFakeTimers()
    const { publishRealtimeStreamRecord } = await import(
      "../src/platform/realtime-stream-publisher"
    )

    const publish = publishRealtimeStreamRecord({
      event: typingEvent,
      guestConversationId: "guest-1",
      kind: "guest-event",
      workspaceId: "ws-1",
    })
    await vi.runAllTimersAsync()

    await expect(publish).resolves.toBeUndefined()
    expect(createRedisConnection).toHaveBeenCalledTimes(2)
    expect(initialConnect).toHaveBeenCalledTimes(1)
    expect(retryConnect).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(xadd).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
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

  test("writes a numeric revoked-at marker and appends with the Redis stream retention arguments", async () => {
    const { getRealtimeMemberRevokedKey, getRealtimeStreamKey } = await import(
      "@chatbotx.io/realtime-protocol"
    )
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
      65,
    )
    expect(Number(set.mock.calls[0]?.[1])).toBeGreaterThan(0)
    expect(xadd).toHaveBeenCalledWith(
      getRealtimeStreamKey("ws-1"),
      "MINID",
      "~",
      expect.stringMatching(STREAM_MIN_ID_PATTERN),
      "*",
      "record",
      expect.any(String),
    )
  })
})
