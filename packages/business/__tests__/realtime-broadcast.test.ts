import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  flushAllPendingWorkspaceRealtimeEvents,
  publishGuestRealtimeEvent,
  publishWorkspaceMemberRealtimeEvent,
  publishWorkspaceRealtimeEvent,
  queueWorkspaceRealtimeEvent,
  resetRealtimePublishStateForTests,
  revokeWorkspaceMemberRealtimeConnections,
} from "../src/platform/realtime-broadcast"

const {
  loggerError,
  markRealtimeMemberRevoked,
  publishRealtimeStreamRecord,
  publishSerializedRealtimeStreamRecord,
  retryWithLinearBackoff,
} = vi.hoisted(() => ({
  loggerError: vi.fn(),
  markRealtimeMemberRevoked: vi.fn(),
  publishRealtimeStreamRecord: vi.fn(),
  publishSerializedRealtimeStreamRecord: vi.fn(),
  retryWithLinearBackoff: vi.fn(
    async (
      fn: () => Promise<unknown>,
      options: { attempts: number },
    ): Promise<unknown> => {
      let lastError: unknown
      for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
        try {
          return await fn()
        } catch (error) {
          lastError = error
        }
      }
      throw lastError
    },
  ),
}))

vi.mock("../src/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}))

vi.mock("../src/platform/realtime-stream-publisher", () => ({
  markRealtimeMemberRevoked,
  publishRealtimeStreamRecord,
  publishSerializedRealtimeStreamRecord,
  resetRealtimeStreamPublisherForTests: vi.fn(),
  retryWithLinearBackoff,
}))

const typingEvent = {
  data: { typing: true },
  eventType: "typing",
} as const

beforeEach(() => {
  vi.useFakeTimers()
  loggerError.mockReset()
  markRealtimeMemberRevoked.mockReset()
  markRealtimeMemberRevoked.mockResolvedValue(undefined)
  publishRealtimeStreamRecord.mockReset()
  publishRealtimeStreamRecord.mockResolvedValue(undefined)
  publishSerializedRealtimeStreamRecord.mockReset()
  publishSerializedRealtimeStreamRecord.mockResolvedValue(undefined)
  resetRealtimePublishStateForTests()
})

afterEach(() => {
  resetRealtimePublishStateForTests()
  vi.useRealTimers()
})

describe("realtime stream broadcast", () => {
  test("coalesces workspace events into one durable stream record", async () => {
    const first = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)
    const second = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)

    await vi.advanceTimersByTimeAsync(25)
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ])

    expect(publishSerializedRealtimeStreamRecord).toHaveBeenCalledWith(
      "workspace_1",
      '{"events":[{"data":{"typing":true},"eventType":"typing"},{"data":{"typing":true},"eventType":"typing"}],"kind":"workspace-events","workspaceId":"workspace_1"}',
    )
  })

  test("flushes a later batch after an earlier append rejects", async () => {
    const { promise: firstAppend, reject: rejectFirstAppend } =
      Promise.withResolvers<void>()
    const failure = new Error("ECONNRESET")
    publishSerializedRealtimeStreamRecord
      .mockReturnValueOnce(firstAppend)
      .mockResolvedValueOnce(undefined)

    const first = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)
    await vi.advanceTimersByTimeAsync(25)

    const second = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)
    vi.advanceTimersByTime(25)
    const firstAssertion = expect(first).rejects.toBe(failure)
    rejectFirstAppend(failure)

    await firstAssertion
    await expect(second).resolves.toBeUndefined()
    expect(publishSerializedRealtimeStreamRecord).toHaveBeenCalledTimes(2)
  })

  test("flushes pending workspace records before shutdown", async () => {
    const delivery = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)

    await flushAllPendingWorkspaceRealtimeEvents()
    await expect(delivery).resolves.toBeUndefined()

    expect(publishSerializedRealtimeStreamRecord).toHaveBeenCalledTimes(1)
  })

  test("publishes directed member, revocation, and guest records directly", async () => {
    await expect(
      publishWorkspaceMemberRealtimeEvent(
        { userId: "user_1", workspaceId: "workspace_1" },
        typingEvent,
      ),
    ).resolves.toBeUndefined()
    await expect(
      revokeWorkspaceMemberRealtimeConnections({
        userId: "user_1",
        workspaceId: "workspace_1",
        reason: "deleted",
      }),
    ).resolves.toBeUndefined()
    await expect(
      publishGuestRealtimeEvent(
        { guestConversationId: "guest_1", workspaceId: "workspace_1" },
        typingEvent,
      ),
    ).resolves.toBeUndefined()

    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(1, {
      event: typingEvent,
      kind: "member-send",
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(2, {
      kind: "member-revoke",
      reason: "deleted",
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(3, {
      event: typingEvent,
      guestConversationId: "guest_1",
      kind: "guest-event",
      workspaceId: "workspace_1",
    })
  })

  test("retries a transient revoke-append failure before succeeding", async () => {
    publishRealtimeStreamRecord
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(undefined)

    const revoke = revokeWorkspaceMemberRealtimeConnections({
      userId: "user_1",
      workspaceId: "workspace_1",
      reason: "deleted",
    })
    await vi.runAllTimersAsync()

    await expect(revoke).resolves.toBeUndefined()
    expect(publishRealtimeStreamRecord).toHaveBeenCalledTimes(2)
  })

  test("throws after exhausting every revoke-append retry, so a failed member revoke is never silently swallowed", async () => {
    const persistentError = new Error("ECONNREFUSED")
    publishRealtimeStreamRecord.mockRejectedValue(persistentError)

    const revoke = revokeWorkspaceMemberRealtimeConnections({
      userId: "user_1",
      workspaceId: "workspace_1",
      reason: "deleted",
    })
    // Attach the rejection assertion in the same tick the promise is
    // created — `revoke` settles across several fake-timer-driven retries,
    // and awaiting `vi.runAllTimersAsync()` first leaves it unhandled for a
    // tick, which Node flags as an unhandled-then-handled rejection.
    const assertion = expect(revoke).rejects.toBe(persistentError)
    await vi.runAllTimersAsync()

    await assertion
    expect(publishRealtimeStreamRecord).toHaveBeenCalledTimes(3)
  })

  test("drains every workspace's shutdown flush independently, even when one workspace's append rejects", async () => {
    // A failure in one workspace must not prevent another pending append from
    // being awaited and logged during shutdown.
    const failure = new Error("ECONNRESET")
    publishSerializedRealtimeStreamRecord.mockImplementation(
      (workspaceId: string) =>
        workspaceId === "ws-fail"
          ? Promise.reject(failure)
          : Promise.resolve(undefined),
    )

    queueWorkspaceRealtimeEvent("ws-fail", typingEvent)
    queueWorkspaceRealtimeEvent("ws-ok", typingEvent)

    await expect(flushAllPendingWorkspaceRealtimeEvents()).rejects.toThrow()

    expect(publishSerializedRealtimeStreamRecord).toHaveBeenCalledWith(
      "ws-fail",
      expect.any(String),
    )
    expect(publishSerializedRealtimeStreamRecord).toHaveBeenCalledWith(
      "ws-ok",
      expect.any(String),
    )
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, workspaceId: "ws-fail" }),
      "Failed to flush pending realtime events on shutdown",
    )
  })
})
