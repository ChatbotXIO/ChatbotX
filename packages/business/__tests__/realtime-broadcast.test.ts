import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  flushAllPendingWorkspaceRealtimeEvents,
  publishGuestRealtimeEvent,
  publishWorkspaceMemberRealtimeEvent,
  publishWorkspaceRealtimeEvent,
  queueWorkspaceRealtimeEvent,
  resetRealtimePublishStateForTests,
  revokeWorkspaceMemberRealtimeConnections,
  tryRevokeWorkspaceMemberRealtimeConnections,
} from "../src/platform/realtime-broadcast"

const {
  defaultQueueAdd,
  drainInFlightRealtimeStreamPublishes,
  loggerError,
  markRealtimeMemberRevoked,
  publishRealtimeStreamRecord,
  publishSerializedRealtimeStreamRecord,
  retryWithLinearBackoff,
} = vi.hoisted(() => ({
  defaultQueueAdd: vi.fn(),
  drainInFlightRealtimeStreamPublishes: vi.fn(),
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

vi.mock("@chatbotx.io/worker-config", () => ({
  defaultQueue: { add: defaultQueueAdd },
  DefaultJobAction: {
    retryRealtimeMemberRevoke: "retryRealtimeMemberRevoke",
  },
}))

vi.mock("../src/platform/realtime-stream-publisher", () => ({
  drainInFlightRealtimeStreamPublishes,
  markRealtimeMemberRevoked,
  publishRealtimeStreamRecord,
  publishSerializedRealtimeStreamRecord,
  resetRealtimeStreamPublisherForTests: vi.fn(),
  retryWithLinearBackoff,
}))

const typingEvent = {
  data: { typing: true },
  eventType: "typing",
  route: { assignedTeamIds: [], assignedUserIds: ["user_1"] },
} as const

beforeEach(() => {
  vi.useFakeTimers()
  defaultQueueAdd.mockReset()
  drainInFlightRealtimeStreamPublishes.mockReset()
  markRealtimeMemberRevoked.mockReset()
  markRealtimeMemberRevoked.mockResolvedValue(undefined)
  drainInFlightRealtimeStreamPublishes.mockResolvedValue(undefined)
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
      '{"events":[{"data":{"typing":true},"eventType":"typing","route":{"assignedTeamIds":[],"assignedUserIds":["user_1"]}},{"data":{"typing":true},"eventType":"typing","route":{"assignedTeamIds":[],"assignedUserIds":["user_1"]}}],"kind":"workspace-events","workspaceId":"workspace_1"}',
    )
  })

  test("rejects an invalid workspace event without delaying valid events", async () => {
    const invalidEvent = {
      data: { messageIds: ["message-1"] },
      eventType: "messageDeleted",
    } as never

    await expect(
      publishWorkspaceRealtimeEvent("workspace_1", invalidEvent),
    ).rejects.toThrow("Invalid workspace realtime event")

    const validDelivery = publishWorkspaceRealtimeEvent(
      "workspace_1",
      typingEvent,
    )
    await vi.advanceTimersByTimeAsync(25)
    await expect(validDelivery).resolves.toBeUndefined()

    expect(publishSerializedRealtimeStreamRecord).toHaveBeenCalledWith(
      "workspace_1",
      expect.stringContaining('"events":[{"data":{"typing":true}'),
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
    expect(drainInFlightRealtimeStreamPublishes).toHaveBeenCalledTimes(1)
  })

  test("splits workspace batches at 64 events", async () => {
    const deliveries = Array.from({ length: 65 }, () =>
      publishWorkspaceRealtimeEvent("workspace_1", typingEvent),
    )

    await flushAllPendingWorkspaceRealtimeEvents()
    await expect(Promise.all(deliveries)).resolves.toHaveLength(65)

    const batches = publishSerializedRealtimeStreamRecord.mock.calls.map(
      ([, record]) =>
        JSON.parse(record as string) as {
          events: unknown[]
        },
    )
    expect(batches.map((batch) => batch.events)).toHaveLength(2)
    expect(batches.map((batch) => batch.events.length)).toEqual([64, 1])
  })

  test("splits two valid sub-limit events when their exact record exceeds 256 KiB", async () => {
    const workspaceId = "workspace_1"
    const messageEvent = {
      data: { text: "x".repeat(140 * 1024) },
      eventType: "messageCreated",
      route: { assignedTeamIds: [], assignedUserIds: [] },
    } as const
    const first = publishWorkspaceRealtimeEvent(workspaceId, messageEvent)
    const second = publishWorkspaceRealtimeEvent(workspaceId, messageEvent)

    await flushAllPendingWorkspaceRealtimeEvents()
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ])

    const records = publishSerializedRealtimeStreamRecord.mock.calls.map(
      ([, record]) => record as string,
    )
    expect(records).toHaveLength(2)
    expect(
      records.every((record) => Buffer.byteLength(record) <= 256 * 1024),
    ).toBe(true)
    expect(records.map((record) => JSON.parse(record).events)).toEqual([
      [messageEvent],
      [messageEvent],
    ])
  })

  test("flushes immediate event types without waiting for the 25ms window", async () => {
    const delivery = publishWorkspaceRealtimeEvent("workspace_1", {
      data: {
        assignedInboxTeamId: null,
        assignedUserId: "user_1",
        conversationIds: ["conversation_1"],
      },
      eventType: "conversationAssigned",
      route: { assignedTeamIds: [], assignedUserIds: ["user_1"] },
    })

    await expect(delivery).resolves.toBeUndefined()

    expect(publishSerializedRealtimeStreamRecord).toHaveBeenCalledTimes(1)
  })

  test("rejects new workspace appends once the ordered append chain reaches its cap", async () => {
    const appends = Array.from({ length: 8 }, () =>
      Promise.withResolvers<void>(),
    )
    let appendIndex = 0
    publishSerializedRealtimeStreamRecord.mockImplementation(
      () => appends[appendIndex++]?.promise,
    )
    const assignmentEvent = {
      data: {
        assignedInboxTeamId: null,
        assignedUserId: "user_1",
        conversationIds: ["conversation_1"],
      },
      eventType: "conversationAssigned",
      route: { assignedTeamIds: [], assignedUserIds: ["user_1"] },
    } as const
    const deliveries = Array.from({ length: 8 }, () =>
      publishWorkspaceRealtimeEvent("workspace_1", assignmentEvent),
    )

    await expect(
      publishWorkspaceRealtimeEvent("workspace_1", assignmentEvent),
    ).rejects.toThrow("Realtime workspace append backlog exceeded")

    for (const append of appends) {
      append.resolve()
    }
    await expect(Promise.all(deliveries)).resolves.toHaveLength(8)
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

    const revokeMarkerOrder =
      markRealtimeMemberRevoked.mock.invocationCallOrder[0]
    const revokeRecordOrder =
      publishRealtimeStreamRecord.mock.invocationCallOrder[1]
    expect(revokeMarkerOrder).toBeLessThan(
      revokeRecordOrder ?? Number.POSITIVE_INFINITY,
    )
    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(1, {
      event: typingEvent,
      kind: "member-send",
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(2, {
      kind: "member-revoke",
      reason: "deleted",
      revokedAtMs: expect.any(Number),
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

  test("re-marks the revoked member before every retry of a failed revoke append", async () => {
    publishRealtimeStreamRecord
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(undefined)

    const revoke = revokeWorkspaceMemberRealtimeConnections({
      revokedAtMs: 1000,
      userId: "user_1",
      workspaceId: "workspace_1",
      reason: "deleted",
    })
    await vi.runAllTimersAsync()

    await expect(revoke).resolves.toBeUndefined()
    expect(markRealtimeMemberRevoked).toHaveBeenCalledTimes(2)
    expect(markRealtimeMemberRevoked).toHaveBeenNthCalledWith(
      1,
      "workspace_1",
      "user_1",
      1000,
    )
    expect(markRealtimeMemberRevoked).toHaveBeenNthCalledWith(
      2,
      "workspace_1",
      "user_1",
      1000,
    )
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

  test("enqueues a durable retry after immediate member revocation fails", async () => {
    const persistentError = new Error("ECONNREFUSED")
    publishRealtimeStreamRecord.mockRejectedValue(persistentError)

    await expect(
      tryRevokeWorkspaceMemberRealtimeConnections({
        errorMessage: "Failed to revoke member realtime connections",
        reason: "deleted",
        userId: "user_1",
        workspaceId: "workspace_1",
      }),
    ).resolves.toBe(false)

    expect(defaultQueueAdd).toHaveBeenCalledWith(
      "retryRealtimeMemberRevoke",
      {
        type: "retryRealtimeMemberRevoke",
        data: {
          reason: "deleted",
          revokedAtMs: expect.any(Number),
          userId: "user_1",
          workspaceId: "workspace_1",
        },
      },
      {
        attempts: 8,
        backoff: { delay: 1000, type: "exponential" },
        removeOnComplete: true,
      },
    )
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

    const drainError = await flushAllPendingWorkspaceRealtimeEvents().catch(
      (error: unknown) => error,
    )
    expect(drainError).toBeInstanceOf(AggregateError)
    if (!(drainError instanceof AggregateError)) {
      throw new Error("Expected an AggregateError")
    }
    expect(drainError.errors).toEqual([failure])

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
    const shutdownLogCalls = loggerError.mock.calls.filter(([, message]) =>
      String(message).includes("shutdown"),
    )
    expect(shutdownLogCalls).toHaveLength(1)
  })

  test("drains an in-flight append that began before shutdown", async () => {
    const { promise: append, reject } = Promise.withResolvers<void>()
    const failure = new Error("ECONNRESET")
    publishSerializedRealtimeStreamRecord.mockReturnValueOnce(append)

    const delivery = publishWorkspaceRealtimeEvent("ws-in-flight", typingEvent)
    const deliveryAssertion = expect(delivery).rejects.toBe(failure)
    await vi.advanceTimersByTimeAsync(25)

    const drain = flushAllPendingWorkspaceRealtimeEvents()
    reject(failure)

    await deliveryAssertion
    const drainError = await drain.catch((error: unknown) => error)
    expect(drainError).toBeInstanceOf(AggregateError)
    if (!(drainError instanceof AggregateError)) {
      throw new Error("Expected an AggregateError")
    }
    expect(drainError.errors).toEqual([failure])
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, workspaceId: "ws-in-flight" }),
      "Failed to drain an in-flight realtime append on shutdown",
    )
    expect(loggerError).toHaveBeenCalledTimes(1)
  })
})
