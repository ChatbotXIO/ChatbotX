import { beforeEach, describe, expect, test, vi } from "vitest"

// ── db spies ──────────────────────────────────────────────────────────────────
const findManyBroadcast = vi.fn()

// ── queue spies ───────────────────────────────────────────────────────────────
const scheduleAddSpy = vi.fn()

// ── distributed lock spy ──────────────────────────────────────────────────────
const runExclusiveSpy = vi.fn()

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: (...args: unknown[]) => findManyBroadcast(...args),
      },
    },
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: {
    enum: { scheduled: "scheduled", sending: "sending", sent: "sent" },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (opts: {
      key: string
      timeoutInSeconds: number
      fn: () => Promise<unknown>
    }) => {
      runExclusiveSpy(opts)
      return opts.fn()
    },
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  broadcastSendJobId: (broadcastId: string) => `broadcast-send-${broadcastId}`,
  ScheduleJobData: {
    sendBroadcast: "sendBroadcast",
  },
  scheduleQueue: {
    add: (...args: unknown[]) => scheduleAddSpy(...args),
  },
}))

const { reconcileBroadcasts } = await import(
  "../src/schedule/handlers/reconcile-broadcasts"
)

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  findManyBroadcast.mockResolvedValue([])
  scheduleAddSpy.mockResolvedValue(undefined)
})

// ── tests ─────────────────────────────────────────────────────────────────────
describe("reconcileBroadcasts", () => {
  test("acquires lock with the expected key and ttl", async () => {
    await reconcileBroadcasts()

    expect(runExclusiveSpy).toHaveBeenCalledTimes(1)
    const [opts] = runExclusiveSpy.mock.calls[0] as [
      { key: string; timeoutInSeconds: number },
    ]
    expect(opts.key).toBe("schedule:reconcile-broadcasts")
    expect(opts.timeoutInSeconds).toBe(55)
  })

  test("enqueues one sendBroadcast revive job per sending broadcast", async () => {
    findManyBroadcast.mockResolvedValue([{ id: "b-1" }, { id: "b-2" }])

    const result = await reconcileBroadcasts()

    expect(result).toEqual({ reconciled: 2 })
    expect(findManyBroadcast).toHaveBeenCalledWith({
      where: { status: "sending", handoffCompletedAt: { isNull: true } },
    })
    expect(scheduleAddSpy).toHaveBeenCalledTimes(2)
    expect(scheduleAddSpy).toHaveBeenNthCalledWith(
      1,
      "sendBroadcast",
      {
        type: "sendBroadcast",
        data: { broadcastId: "b-1" },
      },
      {
        jobId: "broadcast-send-b-1",
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    )
    expect(scheduleAddSpy).toHaveBeenNthCalledWith(
      2,
      "sendBroadcast",
      {
        type: "sendBroadcast",
        data: { broadcastId: "b-2" },
      },
      {
        jobId: "broadcast-send-b-2",
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    )
  })

  test("does not enqueue when no sending broadcasts exist", async () => {
    const result = await reconcileBroadcasts()

    expect(result).toEqual({ reconciled: 0 })
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  test("uses a jobId free of ':' (BullMQ rejects custom ids containing ':')", async () => {
    findManyBroadcast.mockResolvedValue([{ id: "b-1" }])

    await reconcileBroadcasts()

    const { jobId } = scheduleAddSpy.mock.calls[0][2] as { jobId: string }
    expect(jobId).not.toContain(":")
  })
})
