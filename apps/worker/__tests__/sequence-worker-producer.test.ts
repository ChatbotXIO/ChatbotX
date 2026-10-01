import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  addToRetrySpy,
  batchAddToScheduleSpy,
  findPendingWorkspaceIdsSpy,
  getDueSpy,
  getRetryCountSpy,
  getScheduleCountSpy,
  getScheduleKeySpy,
  getSequenceSchedulerQueueSpy,
  getRetryKeySpy,
  loggerErrorSpy,
  queueAddBulkSpy,
  removeFromRetrySpy,
  removeFromScheduleSpy,
  useExistingSpy,
  withLockSpy,
} = vi.hoisted(() => ({
  addToRetrySpy: vi.fn(),
  batchAddToScheduleSpy: vi.fn(),
  findPendingWorkspaceIdsSpy: vi.fn(),
  getDueSpy: vi.fn(),
  getRetryCountSpy: vi.fn(),
  getScheduleCountSpy: vi.fn(),
  getScheduleKeySpy: vi.fn((bucket: number) => `schedule:${bucket}`),
  getSequenceSchedulerQueueSpy: vi.fn(),
  getRetryKeySpy: vi.fn((bucket: number) => `retry:${bucket}`),
  loggerErrorSpy: vi.fn(),
  queueAddBulkSpy: vi.fn(),
  removeFromRetrySpy: vi.fn(),
  removeFromScheduleSpy: vi.fn(),
  useExistingSpy: vi.fn(),
  withLockSpy: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  sequenceDispatchRepository: {
    listPendingWorkspaceIds: findPendingWorkspaceIdsSpy,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: { useExisting: useExistingSpy },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    addToRetry = addToRetrySpy
    batchAddToSchedule = batchAddToScheduleSpy
    getDue = getDueSpy
    getRetryCount = getRetryCountSpy
    getScheduleCount = getScheduleCountSpy
    getScheduleKey = getScheduleKeySpy
    getRetryKey = getRetryKeySpy
    removeFromRetry = removeFromRetrySpy
    removeFromSchedule = removeFromScheduleSpy
    withLock = withLockSpy
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  getSequenceSchedulerQueue: getSequenceSchedulerQueueSpy,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: loggerErrorSpy,
  },
}))

import { getAssignedBuckets } from "../src/sequence-scheduler/buckets"
import { SchedulerWorker } from "../src/sequence-scheduler/worker-producer"

type SchedulerWorkerConfig = {
  buckets: number[]
  claimLimit: number
  lockTtlMs: number
  tickIntervalMs: number
}

type SchedulerWorkerInternals = {
  _queue: { addBulk: typeof queueAddBulkSpy } | null
  _scheduler: {
    addToRetry: typeof addToRetrySpy
    batchAddToSchedule: typeof batchAddToScheduleSpy
    getDue: typeof getDueSpy
    getRetryCount: typeof getRetryCountSpy
    getScheduleCount: typeof getScheduleCountSpy
    getScheduleKey: typeof getScheduleKeySpy
    getRetryKey: typeof getRetryKeySpy
    removeFromRetry: typeof removeFromRetrySpy
    removeFromSchedule: typeof removeFromScheduleSpy
    withLock: typeof withLockSpy
  }
  config: SchedulerWorkerConfig
  running: boolean
  timers: Map<number, NodeJS.Timeout>
}

const makeReadyWorker = (
  options: Partial<SchedulerWorkerConfig> = {},
): SchedulerWorker => {
  const worker = new SchedulerWorker({
    buckets: [0],
    tickIntervalMs: 60_000,
    ...options,
  })
  const internals = worker as unknown as SchedulerWorkerInternals
  internals.running = true
  internals._queue = { addBulk: queueAddBulkSpy }
  internals._scheduler = {
    addToRetry: addToRetrySpy,
    batchAddToSchedule: batchAddToScheduleSpy,
    getDue: getDueSpy,
    getRetryCount: getRetryCountSpy,
    getScheduleCount: getScheduleCountSpy,
    getScheduleKey: getScheduleKeySpy,
    getRetryKey: getRetryKeySpy,
    removeFromRetry: removeFromRetrySpy,
    removeFromSchedule: removeFromScheduleSpy,
    withLock: withLockSpy,
  }
  return worker
}

const runClaimedLock = (): void => {
  withLockSpy.mockImplementation(
    async (
      _bucket: number,
      _dispatchId: string,
      _timeoutInSeconds: number,
      fn: () => Promise<void>,
    ) => await fn(),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  addToRetrySpy.mockResolvedValue(undefined)
  batchAddToScheduleSpy.mockResolvedValue(undefined)
  findPendingWorkspaceIdsSpy.mockResolvedValue([])
  getDueSpy.mockResolvedValue([])
  getRetryCountSpy.mockResolvedValue(0)
  getScheduleCountSpy.mockResolvedValue(0)
  getSequenceSchedulerQueueSpy.mockResolvedValue({ addBulk: queueAddBulkSpy })
  queueAddBulkSpy.mockResolvedValue([])
  removeFromRetrySpy.mockResolvedValue(undefined)
  removeFromScheduleSpy.mockResolvedValue(undefined)
  useExistingSpy.mockResolvedValue({})
})

afterEach(() => {
  delete process.env.SCHEDULER_BUCKET_RANGE
  vi.useRealTimers()
})

describe("SchedulerWorker lifecycle", () => {
  test("initializes the typed singleton queue once", async () => {
    const worker = new SchedulerWorker({ buckets: [0], tickIntervalMs: 60_000 })

    await worker.start()
    await worker.start()

    expect(useExistingSpy).toHaveBeenCalledOnce()
    expect(getSequenceSchedulerQueueSpy).toHaveBeenCalledOnce()
    worker.stop()
  })

  test("fails startup when the sequence scheduler queue is unavailable", async () => {
    getSequenceSchedulerQueueSpy.mockResolvedValue(null)
    const worker = new SchedulerWorker({ buckets: [0], tickIntervalMs: 60_000 })

    await expect(worker.start()).rejects.toThrow(
      "Sequence scheduler queue is unavailable",
    )
  })

  test("clears bucket timers exactly once when stopped", async () => {
    const worker = new SchedulerWorker({
      buckets: [0, 1],
      tickIntervalMs: 60_000,
    })

    await worker.start()
    worker.stop()
    worker.stop()

    expect((worker as unknown as SchedulerWorkerInternals).timers.size).toBe(0)
  })

  test("keeps one timer per bucket across repeated ticks", async () => {
    vi.useFakeTimers()
    const worker = new SchedulerWorker({
      buckets: [0, 1, 2],
      tickIntervalMs: 5,
    })

    await worker.start()
    await vi.advanceTimersByTimeAsync(120)

    const timers = (worker as unknown as SchedulerWorkerInternals).timers
    expect([...timers.keys()].sort()).toEqual([0, 1, 2])
    expect(timers.size).toBe(3)
    worker.stop()
  })

  test("does not schedule another bucket tick after stop", async () => {
    vi.useFakeTimers()
    const worker = new SchedulerWorker({ buckets: [0], tickIntervalMs: 5 })

    await worker.start()
    await vi.advanceTimersByTimeAsync(30)
    worker.stop()
    getDueSpy.mockClear()

    await vi.advanceTimersByTimeAsync(60)

    expect(getDueSpy).not.toHaveBeenCalled()
  })
})

describe("SchedulerWorker.processBucket", () => {
  test("returns before locking when neither zset has due entries", async () => {
    const worker = makeReadyWorker()

    await worker.processBucket(0)

    expect(withLockSpy).not.toHaveBeenCalled()
    expect(queueAddBulkSpy).not.toHaveBeenCalled()
  })

  test("claims due schedule and retry entries, then publishes them together", async () => {
    getDueSpy
      .mockResolvedValueOnce(["scheduled"])
      .mockResolvedValueOnce(["retry"])
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: "scheduled", workspaceId: "workspace-1" },
      { id: "retry", workspaceId: "workspace-2" },
    ])
    runClaimedLock()
    const worker = makeReadyWorker()

    await worker.processBucket(0)

    expect(removeFromScheduleSpy).toHaveBeenCalledWith(0, "scheduled")
    expect(removeFromRetrySpy).toHaveBeenCalledWith(0, "retry")
    expect(queueAddBulkSpy).toHaveBeenCalledWith([
      expect.objectContaining({ name: "scheduled" }),
      expect.objectContaining({ name: "retry" }),
    ])
  })

  test("publishes only entries whose dispatch lock was acquired", async () => {
    getDueSpy
      .mockResolvedValueOnce(["claimed", "locked"])
      .mockResolvedValueOnce([])
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: "claimed", workspaceId: "workspace-1" },
    ])
    withLockSpy
      .mockImplementationOnce(
        async (
          _bucket: number,
          _dispatchId: string,
          _timeoutInSeconds: number,
          fn: () => Promise<void>,
        ) => await fn(),
      )
      .mockRejectedValueOnce(new Error("lock held"))
    const worker = makeReadyWorker()

    await worker.processBucket(0)

    expect(removeFromScheduleSpy).toHaveBeenCalledWith(0, "claimed")
    expect(removeFromScheduleSpy).not.toHaveBeenCalledWith(0, "locked")
    expect(queueAddBulkSpy).toHaveBeenCalledWith([
      expect.objectContaining({ name: "claimed" }),
    ])
  })

  test("uses scheduler lock TTL as seconds when claiming", async () => {
    getDueSpy.mockResolvedValueOnce(["dispatch-1"]).mockResolvedValueOnce([])
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: "dispatch-1", workspaceId: "workspace-1" },
    ])
    runClaimedLock()
    const worker = makeReadyWorker({ lockTtlMs: 60_000 })

    await worker.processBucket(0)

    expect(withLockSpy).toHaveBeenCalledWith(
      0,
      "dispatch-1",
      60,
      expect.any(Function),
    )
  })

  test("re-inserts claimed dispatches when BullMQ publishing fails", async () => {
    getDueSpy
      .mockResolvedValueOnce(["scheduled"])
      .mockResolvedValueOnce(["retry"])
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: "scheduled", workspaceId: "workspace-1" },
      { id: "retry", workspaceId: "workspace-1" },
    ])
    queueAddBulkSpy.mockRejectedValueOnce(new Error("queue unavailable"))
    runClaimedLock()
    const worker = makeReadyWorker()

    await worker.processBucket(0)

    expect(batchAddToScheduleSpy).toHaveBeenCalledWith([
      expect.objectContaining({ bucket: 0, dispatchId: "scheduled" }),
    ])
    expect(addToRetrySpy).toHaveBeenCalledWith(0, "retry", expect.any(Number))
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 0, count: 2 }),
      expect.stringContaining("Failed to publish"),
    )
  })

  test("reports only failed reinsertion entries", async () => {
    getDueSpy
      .mockResolvedValueOnce(["scheduled"])
      .mockResolvedValueOnce(["retry"])
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: "scheduled", workspaceId: "workspace-1" },
      { id: "retry", workspaceId: "workspace-1" },
    ])
    const reinsertionError = new Error("schedule unavailable")
    batchAddToScheduleSpy.mockRejectedValueOnce(reinsertionError)
    queueAddBulkSpy.mockRejectedValueOnce(new Error("queue unavailable"))
    runClaimedLock()
    const worker = makeReadyWorker()

    await worker.processBucket(0)

    expect(loggerErrorSpy).toHaveBeenLastCalledWith(
      {
        err: reinsertionError,
        bucket: 0,
        dispatchIds: ["scheduled"],
      },
      expect.stringContaining("Failed to re-insert"),
    )
  })
})

describe("SchedulerWorker.publishDispatches", () => {
  test("prefixes numeric dispatch IDs for BullMQ while preserving dispatch identity", async () => {
    const dispatchId = "18446744073709551615"
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: dispatchId, workspaceId: "workspace-1" },
    ])
    const worker = makeReadyWorker()

    await worker.publishDispatches(7, [{ dispatchId }])

    expect(queueAddBulkSpy).toHaveBeenCalledWith([
      {
        name: dispatchId,
        data: {
          bucket: 7,
          claimedAt: expect.any(Number),
          dispatchId,
          workspaceId: "workspace-1",
        },
        opts: { jobId: `sequence-${dispatchId}` },
      },
    ])
  })

  test("filters claimed IDs that no longer have a pending row", async () => {
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: "dispatch-1", workspaceId: "workspace-1" },
    ])
    const worker = makeReadyWorker()

    await worker.publishDispatches(0, [
      { dispatchId: "dispatch-1" },
      { dispatchId: "missing" },
    ])

    expect(queueAddBulkSpy).toHaveBeenCalledWith([
      expect.objectContaining({ name: "dispatch-1" }),
    ])
  })

  test("does not enqueue when no claimed ID remains pending", async () => {
    const worker = makeReadyWorker()

    await worker.publishDispatches(0, [{ dispatchId: "missing" }])

    expect(queueAddBulkSpy).not.toHaveBeenCalled()
  })

  test("batches all pending dispatches into one queue operation", async () => {
    findPendingWorkspaceIdsSpy.mockResolvedValue([
      { id: "dispatch-1", workspaceId: "workspace-1" },
      { id: "dispatch-2", workspaceId: "workspace-2" },
      { id: "dispatch-3", workspaceId: "workspace-3" },
    ])
    const worker = makeReadyWorker()

    await worker.publishDispatches(10, [
      { dispatchId: "dispatch-1" },
      { dispatchId: "dispatch-2" },
      { dispatchId: "dispatch-3" },
    ])

    expect(queueAddBulkSpy).toHaveBeenCalledOnce()
    const [jobs] = queueAddBulkSpy.mock.calls[0] as [unknown[]]
    expect(jobs).toHaveLength(3)
  })
})

describe("getAssignedBuckets", () => {
  test("uses all 256 buckets when no assignment is configured", () => {
    expect(getAssignedBuckets()).toEqual(
      Array.from({ length: 256 }, (_, index) => index),
    )
  })

  test("parses explicit lists and inclusive ranges", () => {
    process.env.SCHEDULER_BUCKET_RANGE = "0,5,200"
    expect(getAssignedBuckets()).toEqual([0, 5, 200])

    process.env.SCHEDULER_BUCKET_RANGE = "10-12"
    expect(getAssignedBuckets()).toEqual([10, 11, 12])
  })
})

describe("SchedulerWorker.getHealth", () => {
  test("returns per-bucket schedule and retry counts", async () => {
    getScheduleCountSpy.mockResolvedValue(5)
    getRetryCountSpy.mockResolvedValue(2)
    const worker = makeReadyWorker({ buckets: [3, 7] })

    await expect(worker.getHealth()).resolves.toEqual({
      buckets: [3, 7],
      running: true,
      stats: {
        3: { retry: 2, schedule: 5 },
        7: { retry: 2, schedule: 5 },
      },
    })

    expect(getScheduleCountSpy).toHaveBeenCalledTimes(2)
    expect(getRetryCountSpy).toHaveBeenCalledTimes(2)
  })
})
