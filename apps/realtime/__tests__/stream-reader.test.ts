import { getRealtimeStreamShard } from "@chatbotx.io/realtime-protocol"
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
})
