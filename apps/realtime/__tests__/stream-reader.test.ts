import {
  getRealtimeStreamKey,
  getRealtimeStreamShard,
} from "@chatbotx.io/realtime-protocol"
import { afterEach, describe, expect, test, vi } from "vitest"

const { loggerErrorMock, loggerWarnMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

vi.mock("../src/logger", () => ({
  logger: { error: loggerErrorMock, info: vi.fn(), warn: loggerWarnMock },
}))

// Dynamic import so vi.mock("../src/logger") above is applied before the
// module under test (and its static `import { logger }`) is evaluated.
const { createStreamReader } = await import("../src/stream-reader")

type RedisCall = (...arguments_: string[]) => Promise<unknown>

afterEach(() => {
  vi.restoreAllMocks()
})

describe("stream reader", () => {
  test("probes Redis and becomes ready on the first idle start without recovering", async () => {
    const { promise: ready, resolve: resolveReady } =
      Promise.withResolvers<void>()
    const reader = {
      call: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn(),
    }
    const onReady = vi.fn(() => resolveReady())
    const onRecovered = vi.fn()
    const streamReader = createStreamReader({
      onEntries: () => undefined,
      onError: () => undefined,
      onInvalidRecord: () => undefined,
      onReady,
      onRecovered,
      redis: {
        duplicate: () => reader,
        xrevrange: vi.fn().mockResolvedValue([]),
      } as never,
    })

    streamReader.start()
    await ready
    await streamReader.close()

    expect(reader.call).toHaveBeenCalledWith("PING")
    expect(onReady).toHaveBeenCalledOnce()
    expect(onRecovered).not.toHaveBeenCalled()
  })
  test("advances active shard cursors across keys and ignores a stale response", async () => {
    const dispatched: string[] = []
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    const { promise: dispatchedRecords, resolve: resolveDispatchedRecords } =
      Promise.withResolvers<void>()
    let reads = 0
    const reader = {
      call: vi.fn(async (...arguments_: string[]) => {
        reads += 1
        const streamIndex = arguments_.indexOf("STREAMS")
        const keys = arguments_.slice(streamIndex + 1, streamIndex + 3)
        if (reads <= 2) {
          return keys.map((key, index) => [
            key,
            [
              [
                `${index + 1}-0`,
                [
                  "record",
                  JSON.stringify({
                    events: [{ data: {}, eventType: "messageCreated" }],
                    kind: "workspace-events",
                    workspaceId: `workspace-${index + 1}`,
                  }),
                ],
              ],
            ],
          ])
        }
        return await idleRead
      }) as RedisCall,
      disconnect: vi.fn(() => resolveIdleRead(null)),
    }
    const redis = {
      duplicate: () => reader,
      xrevrange: vi.fn().mockResolvedValue([]),
    }
    const streamReader = createStreamReader({
      onEntries: (entries) => {
        dispatched.push(...entries.map((entry) => entry.id))
        resolveDispatchedRecords()
      },
      onError: (error) => {
        throw error
      },
      onInvalidRecord: () => undefined,
      onReady: () => undefined,
      onRecovered: () => undefined,
      redis: redis as never,
    })

    await streamReader.activateWorkspace("workspace-1")
    await streamReader.activateWorkspace("workspace-2")
    streamReader.start()

    await dispatchedRecords
    await Promise.resolve()
    await Promise.resolve()
    await streamReader.close()

    expect(dispatched).toEqual(["1-0", "2-0"])
    expect(reader.call).toHaveBeenCalledTimes(3)
  })

  test("resyncs only dispatched workspaces when an entry callback throws", async () => {
    const dispatchError = new Error("delivery failed")
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    const { promise: handled, resolve: resolveHandled } =
      Promise.withResolvers<void>()
    let reads = 0
    const reader = {
      call: vi.fn(async (...arguments_: string[]) => {
        reads += 1
        if (reads > 1) {
          return await idleRead
        }
        const streamIndex = arguments_.indexOf("STREAMS")
        const [streamKey] = arguments_.slice(streamIndex + 1, streamIndex + 2)
        return [
          [
            streamKey,
            [
              [
                "1-0",
                [
                  "record",
                  JSON.stringify({
                    events: [{ data: {}, eventType: "messageCreated" }],
                    kind: "workspace-events",
                    workspaceId: "workspace-1",
                  }),
                ],
              ],
            ],
          ],
        ]
      }) as RedisCall,
      disconnect: vi.fn(() => resolveIdleRead(null)),
    }
    const onError = vi.fn()
    const streamReader = createStreamReader({
      onDispatchError: (error, workspaceIds) => {
        expect(error).toBe(dispatchError)
        expect(workspaceIds).toEqual(["workspace-1"])
        resolveHandled()
      },
      onEntries: () => {
        throw dispatchError
      },
      onError,
      onInvalidRecord: () => undefined,
      onReady: () => undefined,
      onRecovered: () => undefined,
      redis: {
        duplicate: () => reader,
        xrevrange: vi.fn().mockResolvedValue([]),
      } as never,
    })

    await streamReader.activateWorkspace("workspace-1")
    streamReader.start()
    await handled
    await streamReader.close()

    expect(onError).not.toHaveBeenCalled()
  })

  test("skips a malformed entry but still dispatches the valid entry in the same batch, logging an error", async () => {
    const dispatched: string[] = []
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    const { promise: dispatchedRecords, resolve: resolveDispatchedRecords } =
      Promise.withResolvers<void>()
    let reads = 0
    const reader = {
      call: vi.fn(async (...arguments_: string[]) => {
        reads += 1
        const streamIndex = arguments_.indexOf("STREAMS")
        const [key] = arguments_.slice(streamIndex + 1, streamIndex + 2)
        if (reads === 1) {
          return [
            [
              key,
              [
                ["1-0", ["record", "not valid json"]],
                [
                  "2-0",
                  [
                    "record",
                    JSON.stringify({
                      events: [{ data: {}, eventType: "messageCreated" }],
                      kind: "workspace-events",
                      workspaceId: "workspace-1",
                    }),
                  ],
                ],
              ],
            ],
          ]
        }
        return await idleRead
      }) as RedisCall,
      disconnect: vi.fn(() => resolveIdleRead(null)),
    }
    const redis = {
      duplicate: () => reader,
      xrevrange: vi.fn().mockResolvedValue([]),
    }
    const streamReader = createStreamReader({
      onEntries: (entries) => {
        dispatched.push(...entries.map((entry) => entry.id))
        resolveDispatchedRecords()
      },
      onError: (error) => {
        throw error
      },
      onInvalidRecord: () => undefined,
      onReady: () => undefined,
      onRecovered: () => undefined,
      redis: redis as never,
    })

    await streamReader.activateWorkspace("workspace-1")
    streamReader.start()

    await dispatchedRecords
    await streamReader.close()

    expect(dispatched).toEqual(["2-0"])
    expect(loggerErrorMock).toHaveBeenCalledTimes(1)
    expect(loggerErrorMock.mock.calls[0]?.[0]).toMatchObject({ id: "1-0" })
  })

  test("drops only the invalid envelope within a coalesced workspace-events record, keeping the valid ones", async () => {
    // Regression for PR #1349 finding #4: the old all-or-nothing array
    // schema rejected an entire coalesced batch if any one event envelope
    // was invalid (e.g. a worker newer than this gateway build during a
    // rolling deploy), silently losing every *other* event in that record
    // too.
    const dispatched: { data: unknown; eventType: string }[] = []
    const invalidRecordCalls: {
      id: string
      shard: number
      workspaceId?: string
    }[] = []
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    const { promise: dispatchedRecords, resolve: resolveDispatchedRecords } =
      Promise.withResolvers<void>()
    let reads = 0
    const reader = {
      call: vi.fn(async (...arguments_: string[]) => {
        reads += 1
        const streamIndex = arguments_.indexOf("STREAMS")
        const [key] = arguments_.slice(streamIndex + 1, streamIndex + 2)
        if (reads === 1) {
          return [
            [
              key,
              [
                [
                  "1-0",
                  [
                    "record",
                    JSON.stringify({
                      events: [
                        { data: { id: "ok" }, eventType: "messageCreated" },
                        { data: {}, eventType: 123 },
                      ],
                      kind: "workspace-events",
                      workspaceId: "workspace-1",
                    }),
                  ],
                ],
              ],
            ],
          ]
        }
        return await idleRead
      }) as RedisCall,
      disconnect: vi.fn(() => resolveIdleRead(null)),
    }
    const redis = {
      duplicate: () => reader,
      xrevrange: vi.fn().mockResolvedValue([]),
    }
    const streamReader = createStreamReader({
      onEntries: (entries) => {
        for (const entry of entries) {
          if (entry.record.kind === "workspace-events") {
            dispatched.push(...entry.record.events)
          }
        }
        resolveDispatchedRecords()
      },
      onError: (error) => {
        throw error
      },
      onInvalidRecord: (info) => {
        invalidRecordCalls.push(info)
      },
      onReady: () => undefined,
      onRecovered: () => undefined,
      redis: redis as never,
    })

    await streamReader.activateWorkspace("workspace-1")
    streamReader.start()

    await dispatchedRecords
    await streamReader.close()

    expect(dispatched).toEqual([
      { data: { id: "ok" }, eventType: "messageCreated" },
    ])
    // The valid event is still delivered (the point of per-event
    // tolerance), but the dropped invalid envelope is no longer silent: it's
    // reported through `onInvalidRecord` same as a fully-unparseable entry,
    // so the malformed-record metric and workspace resync both see it. See
    // PR #1349 finding #7.
    expect(invalidRecordCalls).toEqual([
      {
        id: "1-0",
        shard: getRealtimeStreamShard("workspace-1"),
        workspaceId: "workspace-1",
      },
    ])
  })

  test("recovers after an XREAD rejection without skipping or duplicating entries, firing onRecovered exactly once", async () => {
    // Test gap flagged in PR #1349 round-4 review (criticality 8): the
    // reader's single Redis connection blocks on every active shard at
    // once, so one failed read means every active shard's position is
    // stale by an unknown amount once the retry succeeds — the gateway
    // uses `onRecovered` to force every connected socket to resync instead
    // of silently continuing as if nothing happened.
    const dispatched: string[] = []
    let recoveredCount = 0
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    const { promise: dispatchedRecords, resolve: resolveDispatchedRecords } =
      Promise.withResolvers<void>()
    let reads = 0
    const reader = {
      call: vi.fn(async (...arguments_: string[]) => {
        reads += 1
        const streamIndex = arguments_.indexOf("STREAMS")
        const [key] = arguments_.slice(streamIndex + 1, streamIndex + 2)
        if (reads === 1) {
          throw new Error("ECONNRESET")
        }
        if (reads === 2) {
          return [
            [
              key,
              [
                [
                  "1-0",
                  [
                    "record",
                    JSON.stringify({
                      events: [{ data: {}, eventType: "messageCreated" }],
                      kind: "workspace-events",
                      workspaceId: "workspace-1",
                    }),
                  ],
                ],
              ],
            ],
          ]
        }
        return await idleRead
      }) as RedisCall,
      disconnect: vi.fn(() => resolveIdleRead(null)),
    }
    const redis = {
      duplicate: () => reader,
      xrevrange: vi.fn().mockResolvedValue([]),
    }
    const streamReader = createStreamReader({
      onEntries: (entries) => {
        dispatched.push(...entries.map((entry) => entry.id))
        resolveDispatchedRecords()
      },
      onError: () => undefined,
      onInvalidRecord: () => undefined,
      onReady: () => undefined,
      onRecovered: () => {
        recoveredCount += 1
      },
      redis: redis as never,
    })

    await streamReader.activateWorkspace("workspace-1")
    streamReader.start()

    await dispatchedRecords
    await streamReader.close()

    // No skip: the one real entry still arrives. No duplicate: it arrives
    // exactly once, proving `lastId` wasn't rewound or re-read twice across
    // the failed-then-successful read pair.
    expect(dispatched).toEqual(["1-0"])
    expect(recoveredCount).toBe(1)
  })
  test("does not report a recent-entry gap when every evicted entry was already seen", async () => {
    const workspaceId = "workspace-1"
    const entries = Array.from({ length: 513 }, (_, index) => [
      `${index + 1}-0`,
      [
        "record",
        JSON.stringify({
          events: [{ data: {}, eventType: "messageCreated" }],
          kind: "workspace-events",
          workspaceId,
        }),
      ],
    ])
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    const { promise: dispatched, resolve: resolveDispatched } =
      Promise.withResolvers<void>()
    let reads = 0
    const reader = {
      call: vi.fn(async () => {
        reads += 1
        if (reads === 1) {
          return [[getRealtimeStreamKey(workspaceId), entries]]
        }
        return await idleRead
      }) as RedisCall,
      disconnect: vi.fn(() => resolveIdleRead(null)),
    }
    const streamReader = createStreamReader({
      onEntries: () => resolveDispatched(),
      onError: (error) => {
        throw error
      },
      onInvalidRecord: () => undefined,
      onReady: () => undefined,
      onRecovered: () => undefined,
      redis: {
        duplicate: () => reader,
        xrevrange: vi.fn().mockResolvedValue([]),
      } as never,
    })

    await streamReader.activateWorkspace(workspaceId)
    streamReader.start()
    await dispatched
    expect(streamReader.hasRecentEntriesGap(workspaceId, "1-0")).toBe(false)
    await streamReader.close()
  })

  test("resyncs after an ioredis reconnect that transparently resumes XREAD", async () => {
    const { promise: initialRead, resolve: resolveInitialRead } =
      Promise.withResolvers<null>()
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    const { promise: recovered, resolve: resolveRecovered } =
      Promise.withResolvers<void>()
    let reconnectHandler: (() => void) | undefined
    let reads = 0
    let reconnects = 0
    let recoveries = 0
    const reader = {
      call: vi.fn(async () => {
        reads += 1
        if (reads === 1) {
          return await initialRead
        }
        return await idleRead
      }) as RedisCall,
      disconnect: vi.fn(() => resolveIdleRead(null)),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === "reconnecting") {
          reconnectHandler = handler
        }
      }),
    }
    const streamReader = createStreamReader({
      onEntries: () => undefined,
      onError: () => undefined,
      onInvalidRecord: () => undefined,
      onReady: () => undefined,
      onReconnect: () => {
        reconnects += 1
      },
      onRecovered: () => {
        recoveries += 1
        resolveRecovered()
      },
      redis: {
        duplicate: () => reader,
        xrevrange: vi.fn().mockResolvedValue([]),
      } as never,
    })

    await streamReader.activateWorkspace("workspace-1")
    streamReader.start()
    await vi.waitFor(() => expect(reconnectHandler).toBeDefined())
    reconnectHandler?.()
    resolveInitialRead(null)
    await recovered
    await streamReader.close()

    expect(reconnects).toBe(1)
    expect(recoveries).toBe(1)
  })

  test("restarts after an unexpected reader-loop failure", async () => {
    vi.useFakeTimers()
    const duplicateError = new Error("duplicate failed")
    const reader = {
      call: vi.fn(),
      disconnect: vi.fn(),
    }
    const redis = {
      duplicate: vi
        .fn()
        .mockImplementationOnce(() => {
          throw duplicateError
        })
        .mockReturnValue(reader),
      xrevrange: vi.fn().mockResolvedValue([]),
    }
    const onError = vi.fn()
    const onRecovered = vi.fn()
    const streamReader = createStreamReader({
      onEntries: () => undefined,
      onError,
      onInvalidRecord: () => undefined,
      onReady: () => undefined,
      onRecovered,
      redis: redis as never,
    })

    streamReader.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onError).toHaveBeenCalledWith(duplicateError)
    expect(onRecovered).toHaveBeenCalledTimes(1)
    expect(redis.duplicate).toHaveBeenCalledTimes(2)

    const closing = streamReader.close()
    await vi.advanceTimersByTimeAsync(250)
    await closing
    vi.useRealTimers()
  })
})
