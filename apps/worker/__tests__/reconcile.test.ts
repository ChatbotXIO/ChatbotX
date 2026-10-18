// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  addToScheduleSpy,
  executeSpy,
  findManySpy,
  getZSetMembersSpy,
  removeFromAllSpy,
} = vi.hoisted(() => ({
  addToScheduleSpy: vi.fn().mockResolvedValue(undefined),
  executeSpy: vi.fn(),
  findManySpy: vi.fn(),
  getZSetMembersSpy: vi.fn().mockResolvedValue([]),
  removeFromAllSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    execute: executeSpy,
    query: {
      sequenceDispatchModel: {
        findMany: findManySpy,
      },
    },
  },
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: Array.from(strings),
      values,
    }),
    { raw: (value: string) => ({ raw: value }) },
  ),
}))

vi.mock("@chatbotx.io/redis", () => ({
  bloomFilter: {},
  sequenceConnections: {
    useExisting: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  SchedulerClient: class {
    addToSchedule = addToScheduleSpy
    getZSetMembers = getZSetMembersSpy
    removeFromAll = removeFromAllSpy
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

const { ReconcileJob } = await import("../src/sequence-scheduler/worker")

function attachScheduler(job: InstanceType<typeof ReconcileJob>) {
  ;(
    job as unknown as {
      _scheduler: {
        addToSchedule: typeof addToScheduleSpy
        getZSetMembers: typeof getZSetMembersSpy
        removeFromAll: typeof removeFromAllSpy
      }
    }
  )._scheduler = {
    addToSchedule: addToScheduleSpy,
    getZSetMembers: getZSetMembersSpy,
    removeFromAll: removeFromAllSpy,
  }
}

describe("ReconcileJob", () => {
  const originalBucketRange = process.env.SCHEDULER_BUCKET_RANGE

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    executeSpy.mockResolvedValue([])
    process.env.SCHEDULER_BUCKET_RANGE = "0-0"
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.SCHEDULER_BUCKET_RANGE = originalBucketRange
  })

  test("reconcile scans pending dispatches by runAtMs without workspaceId", async () => {
    findManySpy.mockResolvedValue([])
    const job = new ReconcileJob({ intervalMs: 1000, cleanupIntervalMs: 1000 })
    attachScheduler(job)

    await job.reconcile()

    expect(findManySpy).toHaveBeenCalledOnce()
    const args = findManySpy.mock.calls[0]?.[0] as {
      limit: number
      orderBy: (
        dispatch: { runAtMs: string },
        helpers: { asc: (column: string) => unknown },
      ) => unknown[]
      where: Record<string, unknown>
    }
    expect(args.where).toMatchObject({
      status: "pending",
      runAtMs: { lte: expect.any(String) },
    })
    expect(args.where).not.toHaveProperty("workspaceId")
    expect(args.limit).toBe(1000)
    expect(
      args.orderBy(
        { runAtMs: "runAtMs" },
        { asc: (column: string) => ({ asc: column }) },
      ),
    ).toEqual([{ asc: "runAtMs" }])
  })

  test("reconcile adds each pending dispatch back to the scheduler", async () => {
    findManySpy.mockResolvedValue([
      { id: "dispatch-1", bucket: 7, runAtMs: "1234" },
      { id: "dispatch-2", bucket: 8, runAtMs: "5678" },
    ])
    const job = new ReconcileJob({ intervalMs: 1000, cleanupIntervalMs: 1000 })
    attachScheduler(job)

    const reconcilePromise = job.reconcile()
    await vi.advanceTimersByTimeAsync(1000)
    await reconcilePromise

    expect(addToScheduleSpy).toHaveBeenCalledTimes(2)
    expect(addToScheduleSpy).toHaveBeenNthCalledWith(1, 7, "dispatch-1", 1234)
    expect(addToScheduleSpy).toHaveBeenNthCalledWith(2, 8, "dispatch-2", 5678)
  })

  test("cleanupOrphans validates Redis ids against pending dispatches only", async () => {
    getZSetMembersSpy
      .mockResolvedValueOnce(["dispatch-1", "dispatch-orphan"])
      .mockResolvedValueOnce([])
    findManySpy.mockResolvedValue([{ id: "dispatch-1" }])
    const job = new ReconcileJob({ intervalMs: 1000, cleanupIntervalMs: 1000 })
    attachScheduler(job)

    await job.cleanupOrphans()

    expect(findManySpy).toHaveBeenCalledOnce()
    expect(findManySpy.mock.calls[0]?.[0]).toMatchObject({
      columns: { id: true },
      where: {
        id: { in: ["dispatch-1", "dispatch-orphan"] },
        status: "pending",
      },
    })
    expect(removeFromAllSpy).toHaveBeenCalledWith(0, "dispatch-orphan")
  })

  test("deleteTerminalDispatches batches terminal rows older than the retention TTL", async () => {
    executeSpy
      .mockResolvedValueOnce({ rows: [{ id: "d1" }, { id: "d2" }] })
      .mockResolvedValueOnce({ rows: [{ id: "d3" }] })
    const job = new ReconcileJob({
      intervalMs: 1000,
      cleanupIntervalMs: 1000,
      retentionBatchSize: 2,
      retentionTtlDays: 30,
    })

    const deleted = await job.deleteTerminalDispatches()

    expect(deleted).toBe(3)
    expect(executeSpy).toHaveBeenCalledTimes(2)
    const firstQuery = executeSpy.mock.calls[0]?.[0] as {
      strings: string[]
      values: unknown[]
    }
    expect(firstQuery.strings.join("")).toContain(
      'DELETE FROM "SequenceDispatch"',
    )
    expect(firstQuery.strings.join("")).toContain('"status" IN')
    expect(firstQuery.strings.join("")).toContain("LIMIT ")
    expect(firstQuery.values).toEqual(expect.arrayContaining([30, 2]))
  })
})
