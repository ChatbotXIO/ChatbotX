import { afterEach, describe, expect, test, vi } from "vitest"

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: loggerWarnMock },
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
      onReady: () => undefined,
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

  test("skips a malformed entry but still dispatches the valid entry in the same batch, logging a warning", async () => {
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
      onReady: () => undefined,
      redis: redis as never,
    })

    await streamReader.activateWorkspace("workspace-1")
    streamReader.start()

    await dispatchedRecords
    await streamReader.close()

    expect(dispatched).toEqual(["2-0"])
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock.mock.calls[0]?.[0]).toMatchObject({ id: "1-0" })
  })
})
