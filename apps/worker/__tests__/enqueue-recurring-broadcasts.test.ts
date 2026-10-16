import { beforeEach, describe, expect, test, vi } from "vitest"

const FIXED_START = new Date("2026-10-13T02:00:00.000Z")

const listDue = vi.fn()
const findOldestDueAgeMs = vi.fn()
const addBulk = vi.fn()
const getPrioritizedCount = vi.fn()
const getDelayedCount = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const info = vi.fn()
const warn = vi.fn()
const lockError = Object.assign(new Error("lock"), {
  name: "LockAcquisitionError",
  code: "LOCK_ACQUISITION",
  key: "schedule:enqueue-recurring-broadcasts",
})

vi.mock("date-fns", () => ({ startOfMinute: () => FIXED_START }))
vi.mock("@chatbotx.io/business", () => ({
  broadcastRecurrenceService: {
    listDue: (...a: unknown[]) => listDue(...a),
    findOldestDueAgeMs: (...a: unknown[]) => findOldestDueAgeMs(...a),
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn, error: vi.fn() }),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
  isLockAcquisitionError: (error: unknown, key?: string) =>
    (error as { name?: string; key?: string })?.name ===
      "LockAcquisitionError" &&
    (key === undefined || (error as { key?: string }).key === key),
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ScheduleJobData: {
    materializeRecurringBroadcasts: "materializeRecurringBroadcasts",
  },
  scheduleQueue: {
    addBulk: (...a: unknown[]) => addBulk(...a),
    getPrioritizedCount: () => getPrioritizedCount(),
    getDelayedCount: () => getDelayedCount(),
  },
  MATERIALIZE_BATCH_SIZE: 100,
  MATERIALIZE_RECURRING_BROADCASTS_PRIORITY: 10,
  materializeBatchJobId: (due: number, page: number, chunk: number) =>
    `broadcast-recurrence-${due}-${page}-${chunk}`,
}))

const { enqueueRecurringBroadcasts } = await import(
  "../src/schedule/handlers/enqueue-recurring-broadcasts"
)

const dueRows = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${offset + index}`,
    workspaceId: "w1",
    nextRunAt: new Date(FIXED_START.getTime() - 1000 * (offset + index)),
  }))

beforeEach(() => {
  vi.clearAllMocks()
  addBulk.mockResolvedValue(undefined)
  getPrioritizedCount.mockResolvedValue(0)
  getDelayedCount.mockResolvedValue(0)
  findOldestDueAgeMs.mockResolvedValue(1500)
})

describe("enqueueRecurringBroadcasts", () => {
  test("does nothing but report the backlog age when no series is due", async () => {
    listDue.mockResolvedValue([])

    const result = await enqueueRecurringBroadcasts()

    expect(result).toEqual({ scanned: 0, enqueued: 0, skipped: false })
    expect(addBulk).not.toHaveBeenCalled()
  })

  test("hands due series to the schedule queue in batches, carrying the armed instant", async () => {
    listDue.mockResolvedValueOnce(dueRows(250)).mockResolvedValue([])

    const result = await enqueueRecurringBroadcasts()

    expect(result).toEqual({ scanned: 250, enqueued: 250, skipped: false })
    const [jobs] = addBulk.mock.calls[0] as [
      Array<{
        name: string
        data: { data: { items: Array<{ occurrenceAtMs: number }> } }
        opts: {
          jobId: string
          removeOnComplete: boolean
          removeOnFail: boolean
        }
      }>,
    ]
    expect(jobs.map((job) => job.data.data.items.length)).toEqual([
      100, 100, 50,
    ])
    expect(jobs[0].name).toBe("materializeRecurringBroadcasts")
    expect(jobs[0].data.data.items[0]).toEqual({
      recurrenceId: "r0",
      workspaceId: "w1",
      occurrenceAtMs: FIXED_START.getTime(),
    })
  })

  test("batches are prioritized so they yield to every other schedule job", async () => {
    listDue.mockResolvedValueOnce(dueRows(150)).mockResolvedValue([])

    await enqueueRecurringBroadcasts()

    const [jobs] = addBulk.mock.calls[0] as [
      Array<{ opts: { priority: number } }>,
    ]
    expect(jobs).toHaveLength(2)
    for (const job of jobs) {
      expect(job.opts.priority).toBe(10)
    }
  })

  test("batch job ids carry no colon and free their key when they end", async () => {
    listDue.mockResolvedValueOnce(dueRows(150)).mockResolvedValue([])

    await enqueueRecurringBroadcasts()

    const [jobs] = addBulk.mock.calls[0] as [
      Array<{
        opts: {
          jobId: string
          removeOnComplete: boolean
          removeOnFail: boolean
        }
      }>,
    ]
    for (const job of jobs) {
      expect(job.opts.jobId).not.toContain(":")
      expect(job.opts.removeOnComplete).toBe(true)
      expect(job.opts.removeOnFail).toBe(true)
    }
    expect(new Set(jobs.map((job) => job.opts.jobId)).size).toBe(jobs.length)
  })

  test("pages through a large backlog with a keyset cursor until a short page", async () => {
    listDue
      .mockResolvedValueOnce(dueRows(5000))
      .mockResolvedValueOnce(dueRows(10, 5000))

    const result = await enqueueRecurringBroadcasts()

    expect(result.scanned).toBe(5010)
    expect(listDue).toHaveBeenCalledTimes(2)
    expect(listDue.mock.calls[0][0]).toEqual({ limit: 5000, cursor: null })
    expect(listDue.mock.calls[1][0]).toEqual({
      limit: 5000,
      cursor: { nextRunAt: dueRows(5000).at(-1)?.nextRunAt, id: "r4999" },
    })
    expect(addBulk).toHaveBeenCalledTimes(2)
  })

  test("reports the oldest due age so an unhealthy worker is visible", async () => {
    listDue.mockResolvedValue([])
    await enqueueRecurringBroadcasts()
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ oldestDueAgeMs: 1500 }),
      expect.any(String),
    )
  })

  test("takes the lock without queueing behind a previous tick", async () => {
    listDue.mockResolvedValue([])
    await enqueueRecurringBroadcasts()
    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:enqueue-recurring-broadcasts",
        timeoutInSeconds: 55,
        retryTimeoutInSeconds: 0,
      }),
    )
  })

  test("skips the tick when the previous one still holds the lock", async () => {
    runExclusive.mockRejectedValueOnce(lockError)

    const result = await enqueueRecurringBroadcasts()

    expect(result).toEqual({ scanned: 0, enqueued: 0, skipped: true })
    expect(listDue).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  test("adds nothing while the schedule queue is backlogged, so Redis cannot grow without bound", async () => {
    getPrioritizedCount.mockResolvedValue(1500)
    getDelayedCount.mockResolvedValue(500)

    const result = await enqueueRecurringBroadcasts()

    expect(result).toEqual({ scanned: 0, enqueued: 0, skipped: true })
    expect(listDue).not.toHaveBeenCalled()
    expect(addBulk).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ pendingBatches: 2000, oldestDueAgeMs: 1500 }),
      expect.any(String),
    )
  })

  test("a backlog just under the limit still enqueues", async () => {
    getPrioritizedCount.mockResolvedValue(1999)
    listDue.mockResolvedValueOnce(dueRows(1)).mockResolvedValue([])

    const result = await enqueueRecurringBroadcasts()

    expect(result.enqueued).toBe(1)
  })

  test("any other failure propagates so the cron job fails loudly", async () => {
    runExclusive.mockRejectedValueOnce(new Error("redis down"))
    await expect(enqueueRecurringBroadcasts()).rejects.toThrow("redis down")
  })

  test("stops enqueueing once the per-tick cap is reached", async () => {
    listDue.mockImplementation(async () => dueRows(5000))

    const result = await enqueueRecurringBroadcasts()

    expect(result.enqueued).toBe(200_000)
    expect(listDue).toHaveBeenCalledTimes(40)
  })
})
