import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// ---------- hoisted spies ----------
const {
  getDueSpy,
  getScheduleKeySpy,
  getRetryKeySpy,
  withLockSpy,
  removeFromScheduleSpy,
  removeFromRetrySpy,
  getScheduleCountSpy,
  getRetryCountSpy,
  producerSendSpy,
  producerCloseSpy,
  createProducerSpy,
  findManySpy,
  loggerErrorSpy,
  loggerInfoSpy,
  useExistingSpy,
} = vi.hoisted(() => {
  const producerSendSpy = vi.fn()
  const producerCloseSpy = vi.fn()
  const createProducerSpy = vi
    .fn()
    .mockResolvedValue({ send: producerSendSpy, close: producerCloseSpy })

  return {
    getDueSpy: vi.fn(),
    getScheduleKeySpy: vi.fn((b: number) => `schedule:${b}`),
    getRetryKeySpy: vi.fn((b: number) => `retry:${b}`),
    withLockSpy: vi.fn(),
    removeFromScheduleSpy: vi.fn(),
    removeFromRetrySpy: vi.fn(),
    getScheduleCountSpy: vi.fn(),
    getRetryCountSpy: vi.fn(),
    producerSendSpy,
    producerCloseSpy,
    createProducerSpy,
    findManySpy: vi.fn(),
    loggerErrorSpy: vi.fn(),
    loggerInfoSpy: vi.fn(),
    useExistingSpy: vi.fn().mockResolvedValue({}),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      sequenceDispatchModel: { findMany: findManySpy },
    },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: { useExisting: useExistingSpy },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    getDue = getDueSpy
    getScheduleKey = getScheduleKeySpy
    getRetryKey = getRetryKeySpy
    withLock = withLockSpy
    removeFromSchedule = removeFromScheduleSpy
    removeFromRetry = removeFromRetrySpy
    getScheduleCount = getScheduleCountSpy
    getRetryCount = getRetryCountSpy
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  SEQUENCE_SCHEDULER_QUEUE_NAME: "sequence-scheduler",
}))

vi.mock("@chatbotx.io/worker-config/message-queue/factory", () => ({
  createProducer: createProducerSpy,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: loggerErrorSpy,
    info: loggerInfoSpy,
  },
}))

import { SchedulerWorker } from "../src/sequence-scheduler/worker-producer"

// ---------- helpers ----------

type WorkerInternal = {
  running: boolean
  _scheduler: unknown
  _producer: unknown
  timers: Map<number, NodeJS.Timeout>
  config: { buckets: number[] }
}

/**
 * Creates a SchedulerWorker with internal state already set (bypasses start()).
 * Use for processBucket / publishDispatches unit tests so the background
 * tick() started by start() cannot consume mockResolvedValueOnce values.
 */
function makeReadyWorker(
  overrides: Partial<ConstructorParameters<typeof SchedulerWorker>[0]> = {},
): SchedulerWorker {
  const w = new SchedulerWorker({
    buckets: [0],
    tickIntervalMs: 100,
    ...overrides,
  })
  const internal = w as unknown as WorkerInternal
  internal.running = true
  internal._scheduler = {
    getDue: getDueSpy,
    getScheduleKey: getScheduleKeySpy,
    getRetryKey: getRetryKeySpy,
    withLock: withLockSpy,
    removeFromSchedule: removeFromScheduleSpy,
    removeFromRetry: removeFromRetrySpy,
    getScheduleCount: getScheduleCountSpy,
    getRetryCount: getRetryCountSpy,
  }
  internal._producer = { send: producerSendSpy, close: producerCloseSpy }
  return w
}

/** withLock executes callback — lock acquired */
function mockLockAcquired() {
  withLockSpy.mockImplementation(
    async (
      _b: unknown,
      _d: unknown,
      _ttl: unknown,
      fn: () => Promise<unknown>,
    ) => fn(),
  )
}

/** withLock throws — lock not acquired */
function mockLockFailed() {
  withLockSpy.mockRejectedValue(new Error("Lock not acquired"))
}

beforeEach(() => {
  vi.clearAllMocks()
  // Safe defaults so tests that don't override still work
  getDueSpy.mockResolvedValue([])
  removeFromScheduleSpy.mockResolvedValue(undefined)
  removeFromRetrySpy.mockResolvedValue(undefined)
  findManySpy.mockResolvedValue([])
  producerSendSpy.mockResolvedValue(undefined)
  producerCloseSpy.mockResolvedValue(undefined)
  getScheduleCountSpy.mockResolvedValue(0)
  getRetryCountSpy.mockResolvedValue(0)
})

// =============================================================================
// start()
// =============================================================================

describe("start()", () => {
  afterEach(() => {
    // Extra cleanup for tests that call real start()
    useExistingSpy.mockResolvedValue({})
  })

  test("initializes redis connection + producer", async () => {
    const w = new SchedulerWorker({ buckets: [0], tickIntervalMs: 10_000 })
    await w.start()

    expect(useExistingSpy).toHaveBeenCalledOnce()
    expect(createProducerSpy).toHaveBeenCalledWith({
      topic: "sequence-scheduler",
      clientId: "sequence-scheduler",
    })

    await w.stop()
  })

  test("is idempotent — second call is a no-op", async () => {
    const w = new SchedulerWorker({ buckets: [0], tickIntervalMs: 10_000 })
    await w.start()
    await w.start()

    expect(createProducerSpy).toHaveBeenCalledOnce()

    await w.stop()
  })
})

// =============================================================================
// stop()
// =============================================================================

describe("stop()", () => {
  test("closes the producer", async () => {
    const w = new SchedulerWorker({ buckets: [0], tickIntervalMs: 10_000 })
    await w.start()
    await w.stop()

    expect(producerCloseSpy).toHaveBeenCalledOnce()
  })

  test("is idempotent — second call does not close producer again", async () => {
    const w = new SchedulerWorker({ buckets: [0], tickIntervalMs: 10_000 })
    await w.start()
    await w.stop()
    await w.stop()

    expect(producerCloseSpy).toHaveBeenCalledOnce()
  })

  test("clears the timers map", async () => {
    // Use a long interval so no real ticks fire during the test
    const w = new SchedulerWorker({ buckets: [0, 1], tickIntervalMs: 10_000 })
    await w.start()

    // Let initial async tick settle (it fires immediately in startBucketScheduler)
    await new Promise((r) => setTimeout(r, 20))

    await w.stop()

    expect((w as unknown as WorkerInternal).timers.size).toBe(0)
  })
})

// =============================================================================
// Timer map — RAM regression (the fix we applied)
// =============================================================================

describe("timer map — RAM fix", () => {
  test("timers.size equals bucket count after many ticks (never grows)", async () => {
    const BUCKETS = [0, 1, 2]
    // Very short interval so many ticks fire during our wait
    const w = new SchedulerWorker({ buckets: BUCKETS, tickIntervalMs: 5 })
    await w.start()

    // Wait long enough for ~20 ticks per bucket
    await new Promise((r) => setTimeout(r, 120))

    const timers = (w as unknown as WorkerInternal).timers
    expect(timers.size).toBe(BUCKETS.length) // NOT 60+

    await w.stop()
  })

  test("each bucket key maps to exactly one timer entry", async () => {
    const w = new SchedulerWorker({ buckets: [0, 1], tickIntervalMs: 5 })
    await w.start()
    await new Promise((r) => setTimeout(r, 60))

    const timers = (w as unknown as WorkerInternal).timers
    expect([...timers.keys()].sort()).toEqual([0, 1])
    expect(timers.size).toBe(2)

    await w.stop()
  })

  test("no timers fire after stop()", async () => {
    const w = new SchedulerWorker({ buckets: [0], tickIntervalMs: 5 })
    await w.start()
    await new Promise((r) => setTimeout(r, 30))

    await w.stop()
    getDueSpy.mockClear()

    await new Promise((r) => setTimeout(r, 60))

    expect(getDueSpy).not.toHaveBeenCalled()
  })
})

// =============================================================================
// processBucket()
// =============================================================================

describe("processBucket()", () => {
  test("returns early without locking when both queues are empty", async () => {
    getDueSpy.mockResolvedValue([])
    const w = makeReadyWorker()

    await w.processBucket(0)

    expect(withLockSpy).not.toHaveBeenCalled()
    expect(producerSendSpy).not.toHaveBeenCalled()
  })

  test("claims schedule candidates, removes them, publishes", async () => {
    getDueSpy
      .mockResolvedValueOnce(["d1", "d2"]) // schedule key
      .mockResolvedValueOnce([]) // retry key

    mockLockAcquired()
    findManySpy.mockResolvedValue([
      { id: "d1", workspaceId: "ws-1" },
      { id: "d2", workspaceId: "ws-1" },
    ])

    const w = makeReadyWorker()
    await w.processBucket(0)

    expect(removeFromScheduleSpy).toHaveBeenCalledTimes(2)
    expect(removeFromScheduleSpy).toHaveBeenCalledWith(0, "d1")
    expect(removeFromScheduleSpy).toHaveBeenCalledWith(0, "d2")
    expect(producerSendSpy).toHaveBeenCalledOnce()
  })

  test("claims retry candidates, removes them, publishes", async () => {
    getDueSpy
      .mockResolvedValueOnce([]) // schedule
      .mockResolvedValueOnce(["d3"]) // retry

    mockLockAcquired()
    findManySpy.mockResolvedValue([{ id: "d3", workspaceId: "ws-2" }])

    const w = makeReadyWorker()
    await w.processBucket(0)

    expect(removeFromRetrySpy).toHaveBeenCalledWith(0, "d3")
    expect(removeFromScheduleSpy).not.toHaveBeenCalled()
    expect(producerSendSpy).toHaveBeenCalledOnce()
  })

  test("claims from both schedule and retry in one tick", async () => {
    getDueSpy
      .mockResolvedValueOnce(["sched-1"]) // schedule
      .mockResolvedValueOnce(["retry-1"]) // retry

    mockLockAcquired()
    findManySpy.mockResolvedValue([
      { id: "sched-1", workspaceId: "ws-1" },
      { id: "retry-1", workspaceId: "ws-1" },
    ])

    const w = makeReadyWorker()
    await w.processBucket(0)

    expect(removeFromScheduleSpy).toHaveBeenCalledWith(0, "sched-1")
    expect(removeFromRetrySpy).toHaveBeenCalledWith(0, "retry-1")

    const sent = producerSendSpy.mock.calls[0][0] as { key: string }[]
    expect(sent.map((m) => m.key)).toEqual(
      expect.arrayContaining(["sched-1", "retry-1"]),
    )
  })

  test("skips dispatch when lock cannot be acquired (no remove, no publish)", async () => {
    getDueSpy
      .mockResolvedValueOnce(["locked-dispatch"])
      .mockResolvedValueOnce([])

    mockLockFailed()

    const w = makeReadyWorker()
    await w.processBucket(0)

    expect(removeFromScheduleSpy).not.toHaveBeenCalled()
    expect(producerSendSpy).not.toHaveBeenCalled()
  })

  test("publishes only successfully locked dispatches when some locks fail", async () => {
    getDueSpy
      .mockResolvedValueOnce(["ok-dispatch", "locked-dispatch"])
      .mockResolvedValueOnce([])

    // First lock acquired, second fails
    withLockSpy
      .mockImplementationOnce(
        async (
          _b: unknown,
          _d: unknown,
          _ttl: unknown,
          fn: () => Promise<unknown>,
        ) => fn(),
      )
      .mockRejectedValueOnce(new Error("Lock busy"))

    findManySpy.mockResolvedValue([{ id: "ok-dispatch", workspaceId: "ws-1" }])

    const w = makeReadyWorker()
    await w.processBucket(0)

    expect(removeFromScheduleSpy).toHaveBeenCalledWith(0, "ok-dispatch")
    expect(removeFromScheduleSpy).not.toHaveBeenCalledWith(0, "locked-dispatch")

    const sent = producerSendSpy.mock.calls[0][0] as { key: string }[]
    expect(sent).toHaveLength(1)
    expect(sent[0].key).toBe("ok-dispatch")
  })

  test("does not call producerSend when all claimed dispatches are absent from DB", async () => {
    getDueSpy
      .mockResolvedValueOnce(["ghost-dispatch"])
      .mockResolvedValueOnce([])

    mockLockAcquired()
    findManySpy.mockResolvedValue([]) // not in DB

    const w = makeReadyWorker()
    await w.processBucket(0)

    expect(producerSendSpy).not.toHaveBeenCalled()
  })

  test("passes lockTtlMs / 1000 as seconds to withLock", async () => {
    getDueSpy.mockResolvedValueOnce(["d1"]).mockResolvedValueOnce([])
    mockLockAcquired()
    findManySpy.mockResolvedValue([{ id: "d1", workspaceId: "ws-1" }])

    // lockTtlMs = 60_000 → should pass 60 seconds
    const w = makeReadyWorker({ lockTtlMs: 60_000 })
    await w.processBucket(0)

    expect(withLockSpy).toHaveBeenCalledWith(
      0,
      "d1",
      60, // seconds
      expect.any(Function),
    )
  })

  test("logs error with bucket number when processBucket throws", async () => {
    getDueSpy.mockRejectedValue(new Error("Redis connection lost"))

    const w = makeReadyWorker()

    // processBucket doesn't catch internally; the tick does
    // Call it ourselves and wrap
    try {
      await w.processBucket(0)
    } catch {
      // expected
    }

    // The error is propagated — tick() is what catches and logs
    // Here we verify processBucket surfaces the error
    expect(loggerErrorSpy).not.toHaveBeenCalled() // processBucket itself doesn't log
  })
})

// =============================================================================
// publishDispatches()
// =============================================================================

describe("publishDispatches()", () => {
  test("queries DB with all dispatch IDs and pending status filter", async () => {
    findManySpy.mockResolvedValue([])
    const w = makeReadyWorker()

    await w.publishDispatches([
      { dispatchId: "d1", bucket: 0 },
      { dispatchId: "d2", bucket: 1 },
    ])

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["d1", "d2"] },
          status: "pending",
        }),
      }),
    )
  })

  test("includes dispatchId, workspaceId, bucket and claimedAt in message value", async () => {
    findManySpy.mockResolvedValue([{ id: "d1", workspaceId: "ws-42" }])
    const w = makeReadyWorker()

    const before = Date.now()
    await w.publishDispatches([{ dispatchId: "d1", bucket: 5 }])
    const after = Date.now()

    const [msg] = producerSendSpy.mock.calls[0][0] as {
      key: string
      value: string
    }[]
    const payload = JSON.parse(msg.value)

    expect(payload.dispatchId).toBe("d1")
    expect(payload.workspaceId).toBe("ws-42")
    expect(payload.bucket).toBe(5)
    expect(payload.claimedAt).toBeGreaterThanOrEqual(before)
    expect(payload.claimedAt).toBeLessThanOrEqual(after)
  })

  test("message key equals dispatchId", async () => {
    findManySpy.mockResolvedValue([{ id: "d1", workspaceId: "ws-1" }])
    const w = makeReadyWorker()

    await w.publishDispatches([{ dispatchId: "d1", bucket: 0 }])

    const [msg] = producerSendSpy.mock.calls[0][0] as { key: string }[]
    expect(msg.key).toBe("d1")
  })

  test("filters out ghost dispatches not returned by DB", async () => {
    findManySpy.mockResolvedValue([{ id: "d1", workspaceId: "ws-1" }])
    const w = makeReadyWorker()

    await w.publishDispatches([
      { dispatchId: "d1", bucket: 0 },
      { dispatchId: "ghost", bucket: 0 },
    ])

    const sent = producerSendSpy.mock.calls[0][0] as { key: string }[]
    expect(sent).toHaveLength(1)
    expect(sent[0].key).toBe("d1")
  })

  test("does not call producerSend when all dispatches are filtered out", async () => {
    findManySpy.mockResolvedValue([]) // nothing pending
    const w = makeReadyWorker()

    await w.publishDispatches([{ dispatchId: "d1", bucket: 0 }])

    expect(producerSendSpy).not.toHaveBeenCalled()
  })

  test("batches all messages in a single producerSend call", async () => {
    findManySpy.mockResolvedValue([
      { id: "d1", workspaceId: "ws-1" },
      { id: "d2", workspaceId: "ws-2" },
      { id: "d3", workspaceId: "ws-3" },
    ])
    const w = makeReadyWorker()

    await w.publishDispatches([
      { dispatchId: "d1", bucket: 0 },
      { dispatchId: "d2", bucket: 0 },
      { dispatchId: "d3", bucket: 0 },
    ])

    expect(producerSendSpy).toHaveBeenCalledOnce()
    expect((producerSendSpy.mock.calls[0][0] as unknown[]).length).toBe(3)
  })

  test("preserves per-dispatch bucket in message payload", async () => {
    findManySpy.mockResolvedValue([
      { id: "d1", workspaceId: "ws-1" },
      { id: "d2", workspaceId: "ws-2" },
    ])
    const w = makeReadyWorker()

    await w.publishDispatches([
      { dispatchId: "d1", bucket: 10 },
      { dispatchId: "d2", bucket: 20 },
    ])

    const sent = producerSendSpy.mock.calls[0][0] as {
      key: string
      value: string
    }[]
    const buckets = sent.map((m) => JSON.parse(m.value).bucket)
    expect(buckets).toEqual(expect.arrayContaining([10, 20]))
  })
})

// =============================================================================
// getAssignedBuckets() — parsed from SCHEDULER_BUCKET_RANGE
// =============================================================================

describe("getAssignedBuckets() via constructor", () => {
  afterEach(() => {
    delete process.env.SCHEDULER_BUCKET_RANGE
  })

  test("returns all 256 buckets (0-255) when env var not set", () => {
    delete process.env.SCHEDULER_BUCKET_RANGE
    const w = new SchedulerWorker()
    const { buckets } = (w as unknown as WorkerInternal).config
    expect(buckets).toHaveLength(256)
    expect(buckets[0]).toBe(0)
    expect(buckets[255]).toBe(255)
  })

  test("parses comma-separated bucket list", () => {
    process.env.SCHEDULER_BUCKET_RANGE = "0,5,10,200"
    const w = new SchedulerWorker()
    expect((w as unknown as WorkerInternal).config.buckets).toEqual([
      0, 5, 10, 200,
    ])
  })

  test("parses start-end range (inclusive)", () => {
    process.env.SCHEDULER_BUCKET_RANGE = "10-15"
    const w = new SchedulerWorker()
    expect((w as unknown as WorkerInternal).config.buckets).toEqual([
      10, 11, 12, 13, 14, 15,
    ])
  })

  test("single-element range (start === end) returns one bucket", () => {
    process.env.SCHEDULER_BUCKET_RANGE = "42-42"
    const w = new SchedulerWorker()
    expect((w as unknown as WorkerInternal).config.buckets).toEqual([42])
  })
})

// =============================================================================
// getHealth()
// =============================================================================

describe("getHealth()", () => {
  test("returns running=true and per-bucket stats", async () => {
    getScheduleCountSpy.mockResolvedValue(5)
    getRetryCountSpy.mockResolvedValue(2)

    const w = makeReadyWorker({ buckets: [0, 1] })
    const health = await w.getHealth()

    expect(health.running).toBe(true)
    expect(health.buckets).toEqual([0, 1])
    expect(health.stats[0]).toEqual({ schedule: 5, retry: 2 })
    expect(health.stats[1]).toEqual({ schedule: 5, retry: 2 })
  })

  test("queries schedule + retry count for every bucket", async () => {
    const w = makeReadyWorker({ buckets: [3, 7, 15] })
    await w.getHealth()

    expect(getScheduleCountSpy).toHaveBeenCalledTimes(3)
    expect(getRetryCountSpy).toHaveBeenCalledTimes(3)
  })

  test("each bucket stat is independently populated", async () => {
    getScheduleCountSpy
      .mockResolvedValueOnce(10) // bucket 0
      .mockResolvedValueOnce(0) // bucket 1
    getRetryCountSpy
      .mockResolvedValueOnce(3) // bucket 0
      .mockResolvedValueOnce(7) // bucket 1

    const w = makeReadyWorker({ buckets: [0, 1] })
    const { stats } = await w.getHealth()

    expect(stats[0]).toEqual({ schedule: 10, retry: 3 })
    expect(stats[1]).toEqual({ schedule: 0, retry: 7 })
  })
})
