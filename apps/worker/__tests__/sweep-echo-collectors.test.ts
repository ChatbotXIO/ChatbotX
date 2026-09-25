import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  clearFlag: vi.fn(),
  lowAdd: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  scanPending: vi.fn(),
  schedule: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config/messenger-echo", () => ({
  echoCollector: {
    clearFlag: mocks.clearFlag,
    scanPending: mocks.scanPending,
    schedule: mocks.schedule,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: { messengerEchoFlush: "messengerEchoFlush" },
  lowQueue: { add: mocks.lowAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, info: mocks.loggerInfo },
}))

vi.mock("../src/env", () => ({
  env: { MESSENGER_ECHO_SWEEP_CLAIM_TTL_MS: 300_000 },
}))

const { MESSENGER_ECHO_SWEEP_MAX_ENQUEUES, sweepEchoCollectors } = await import(
  "../src/schedule/handlers/sweep-echo-collectors"
)

const scopes = (count: number) =>
  (async function* () {
    await Promise.resolve()
    for (let index = 0; index < count; index += 1) {
      yield { channel: "messenger", identifier: `page-${index}` }
    }
  })()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.clearFlag.mockResolvedValue(undefined)
  mocks.lowAdd.mockResolvedValue(undefined)
  mocks.schedule.mockResolvedValue(true)
})

describe("sweepEchoCollectors", () => {
  test("claims the flag and enqueues only when it wins", async () => {
    mocks.scanPending.mockReturnValue(scopes(3))
    mocks.schedule
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    await sweepEchoCollectors()

    expect(mocks.scanPending).toHaveBeenCalledExactlyOnceWith("messenger")
    expect(mocks.schedule).toHaveBeenCalledTimes(3)
    expect(mocks.schedule).toHaveBeenNthCalledWith(
      1,
      { channel: "messenger", identifier: "page-0" },
      300_000,
    )
    expect(mocks.lowAdd).toHaveBeenNthCalledWith(1, "messengerEchoFlush", {
      type: "messengerEchoFlush",
      data: { channel: "messenger", integrationIdentifier: "page-1" },
    })
    expect(mocks.lowAdd).toHaveBeenNthCalledWith(2, "messengerEchoFlush", {
      type: "messengerEchoFlush",
      data: { channel: "messenger", integrationIdentifier: "page-2" },
    })
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { enqueued: 2 },
      "Enqueued pending Messenger echo collector flushes",
    )
  })

  test("bounds the number of flush jobs added in one sweep", async () => {
    mocks.scanPending.mockReturnValue(
      scopes(MESSENGER_ECHO_SWEEP_MAX_ENQUEUES + 5),
    )

    await sweepEchoCollectors()

    expect(mocks.lowAdd).toHaveBeenCalledTimes(
      MESSENGER_ECHO_SWEEP_MAX_ENQUEUES,
    )
    expect(mocks.schedule).toHaveBeenCalledTimes(
      MESSENGER_ECHO_SWEEP_MAX_ENQUEUES,
    )
  })

  test("clears a won claim and continues when enqueueing fails", async () => {
    const enqueueError = new Error("queue unavailable")
    mocks.scanPending.mockReturnValue(scopes(2))
    mocks.lowAdd.mockRejectedValueOnce(enqueueError)

    await sweepEchoCollectors()

    expect(mocks.clearFlag).toHaveBeenCalledExactlyOnceWith({
      channel: "messenger",
      identifier: "page-0",
    })
    expect(mocks.lowAdd).toHaveBeenCalledTimes(2)
    expect(mocks.lowAdd).toHaveBeenLastCalledWith("messengerEchoFlush", {
      type: "messengerEchoFlush",
      data: { channel: "messenger", integrationIdentifier: "page-1" },
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        err: enqueueError,
        scope: { channel: "messenger", identifier: "page-0" },
      },
      "Failed to enqueue pending Messenger echo collector flush",
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { enqueued: 1 },
      "Enqueued pending Messenger echo collector flushes",
    )
  })
})
