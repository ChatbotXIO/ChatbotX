import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  integrationQueueAddBulk,
  integrationQueueRemove,
  loggerInfo,
  loggerWarn,
  smartDelayService,
} = vi.hoisted(() => ({
  integrationQueueAddBulk: vi.fn(),
  integrationQueueRemove: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  smartDelayService: {
    claimForRun: vi.fn(),
    claimDueRows: vi.fn(),
    listStuckScheduled: vi.fn(),
    resetToPending: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business/smart-delay", () => ({ smartDelayService }))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    resumeFollowUp: "resumeFollowUp",
    resumeWait: "resumeWait",
    sendFlow: "sendFlow",
  },
  integrationQueue: {
    add: vi.fn(),
    addBulk: integrationQueueAddBulk,
    remove: integrationQueueRemove,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: loggerInfo,
    warn: loggerWarn,
  },
}))

const { scanSmartDelay } = await import(
  "../src/schedule/handlers/scan-smart-delay"
)

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "row-1",
  workspaceId: "workspace-1",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  contactInboxId: "contact-inbox-1",
  conversationId: "conversation-1",
  nodeId: "next-node",
  stepId: "step-1",
  type: "waitNode",
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  triggerAt: new Date("2026-07-16T00:01:00.000Z"),
  status: "scheduled",
  ...overrides,
})

describe("scanSmartDelay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"))
    smartDelayService.listStuckScheduled.mockResolvedValue([])
    smartDelayService.claimForRun.mockResolvedValue(true)
    smartDelayService.resetToPending.mockImplementation(
      ({ ids }: { ids: string[] }) => Promise.resolve(ids.length),
    )
    integrationQueueAddBulk.mockResolvedValue(undefined)
    integrationQueueRemove.mockResolvedValue(1)
  })

  test("returns zero counts when no smart-delay rows are due", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })
    expect(smartDelayService.listStuckScheduled).toHaveBeenCalledWith({
      olderThan: new Date("2026-07-15T23:50:00.000Z"),
      limit: 500,
    })
    expect(integrationQueueRemove).not.toHaveBeenCalled()
    expect(smartDelayService.resetToPending).not.toHaveBeenCalled()
    expect(integrationQueueAddBulk).not.toHaveBeenCalled()
  })

  test("removes stale wake-up jobs before resetting stuck rows to pending", async () => {
    smartDelayService.listStuckScheduled.mockResolvedValueOnce([
      { id: "stuck-1", triggerAt: new Date("2026-07-15T23:40:00.000Z") },
      { id: "stuck-2", triggerAt: new Date("2026-07-15T23:41:00.000Z") },
    ])
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })

    expect(integrationQueueRemove).toHaveBeenCalledWith(
      "smart-delay-stuck-1-1784158800000",
    )
    expect(integrationQueueRemove).toHaveBeenCalledWith(
      "smart-delay-stuck-2-1784158860000",
    )
    expect(smartDelayService.resetToPending).toHaveBeenCalledWith({
      ids: ["stuck-1", "stuck-2"],
      triggerAtBefore: new Date("2026-07-15T23:50:00.000Z"),
    })
    // The stale job must be removed BEFORE the row becomes claimable again,
    // otherwise the scanner's re-add hits BullMQ jobId dedup ("duplicated").
    const removeOrder = integrationQueueRemove.mock.invocationCallOrder[0]
    const resetOrder =
      smartDelayService.resetToPending.mock.invocationCallOrder[0]
    expect(removeOrder).toBeLessThan(resetOrder)
    expect(loggerWarn).toHaveBeenCalledWith(
      { count: 2, failedRemovals: 0 },
      "Reset stuck scheduled smart delay rows to pending",
    )
  })

  test("keeps claiming batches until a partial batch signals the backlog is drained", async () => {
    const fullBatch = Array.from({ length: 500 }, (_, index) =>
      makeRow({ id: `bulk-row-${index}` }),
    )
    smartDelayService.claimDueRows
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([makeRow({ id: "tail-row" })])

    await expect(scanSmartDelay()).resolves.toEqual({
      scanned: 501,
      enqueued: 501,
    })

    expect(smartDelayService.claimDueRows).toHaveBeenCalledTimes(2)
    expect(integrationQueueAddBulk).toHaveBeenCalledTimes(2)
  })

  test("sweeps stuck rows in batches until a partial batch", async () => {
    const fullBatch = Array.from({ length: 500 }, (_, index) => ({
      id: `stuck-${index}`,
      triggerAt: new Date("2026-07-15T23:40:00.000Z"),
    }))
    smartDelayService.listStuckScheduled
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([
        { id: "stuck-tail", triggerAt: new Date("2026-07-15T23:41:00.000Z") },
      ])
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })

    expect(smartDelayService.listStuckScheduled).toHaveBeenCalledTimes(2)
    expect(integrationQueueRemove).toHaveBeenCalledTimes(501)
    expect(smartDelayService.resetToPending).toHaveBeenCalledTimes(2)
    expect(loggerWarn).toHaveBeenCalledWith(
      { count: 501, failedRemovals: 0 },
      "Reset stuck scheduled smart delay rows to pending",
    )
  })

  test("reports only rows the CAS actually reset when one completed mid-sweep", async () => {
    smartDelayService.listStuckScheduled.mockResolvedValueOnce([
      { id: "stuck-1", triggerAt: new Date("2026-07-15T23:40:00.000Z") },
      { id: "stuck-2", triggerAt: new Date("2026-07-15T23:41:00.000Z") },
    ])
    // "stuck-2" was completed by its in-flight resume between the sweep's read
    // and write — the guarded reset returns 1, and the log must not overcount.
    smartDelayService.resetToPending.mockResolvedValueOnce(1)
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })

    expect(loggerWarn).toHaveBeenCalledWith(
      { count: 1, failedRemovals: 0 },
      "Reset stuck scheduled smart delay rows to pending",
    )
  })

  test("treats an unremovable active job as fulfilled and defers to the CAS", async () => {
    smartDelayService.listStuckScheduled.mockResolvedValueOnce([
      { id: "stuck-1", triggerAt: new Date("2026-07-15T23:40:00.000Z") },
    ])
    // BullMQ resolves 0 (not a rejection) when the job is locked/active.
    integrationQueueRemove.mockResolvedValueOnce(0)
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })

    expect(smartDelayService.resetToPending).toHaveBeenCalledWith({
      ids: ["stuck-1"],
      triggerAtBefore: new Date("2026-07-15T23:50:00.000Z"),
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      { count: 1, failedRemovals: 0 },
      "Reset stuck scheduled smart delay rows to pending",
    )
  })

  test("continues claiming when the sweep itself fails", async () => {
    smartDelayService.listStuckScheduled.mockRejectedValueOnce(
      new Error("db unavailable"),
    )
    smartDelayService.claimDueRows.mockResolvedValueOnce([makeRow()])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 1, enqueued: 1 })
  })

  test("warns when the sweep exhausts its per-run batch cap", async () => {
    const fullBatch = Array.from({ length: 500 }, (_, index) => ({
      id: `stuck-${index}`,
      triggerAt: new Date("2026-07-15T23:40:00.000Z"),
    }))
    smartDelayService.listStuckScheduled.mockResolvedValue(fullBatch)
    smartDelayService.claimDueRows.mockResolvedValueOnce([])

    await scanSmartDelay()

    expect(smartDelayService.listStuckScheduled).toHaveBeenCalledTimes(20)
    expect(loggerWarn).toHaveBeenCalledWith(
      { maxBatches: 20, batchSize: 500 },
      "Smart delay sweep hit its per-run batch cap; backlog remains for the next tick",
    )
  })

  test("warns when the claim loop exhausts its per-run batch cap", async () => {
    const fullBatch = Array.from({ length: 500 }, (_, index) =>
      makeRow({ id: `bulk-row-${index}` }),
    )
    smartDelayService.claimDueRows.mockResolvedValue(fullBatch)

    await expect(scanSmartDelay()).resolves.toEqual({
      scanned: 100_000,
      enqueued: 100_000,
    })

    expect(smartDelayService.claimDueRows).toHaveBeenCalledTimes(200)
    expect(loggerWarn).toHaveBeenCalledWith(
      { scanned: 100_000, maxBatches: 200 },
      "Smart delay claim hit its per-run batch cap; backlog remains for the next tick",
    )
  })

  test("completes remaining enqueueable rows when a terminal-row update fails", async () => {
    smartDelayService.claimForRun.mockRejectedValueOnce(new Error("db timeout"))
    smartDelayService.claimDueRows.mockResolvedValueOnce([
      makeRow({ id: "terminal-row", nodeId: null }),
      makeRow({ id: "resumable-row" }),
    ])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 2, enqueued: 1 })

    expect(integrationQueueAddBulk).toHaveBeenCalledTimes(1)
  })

  test("still resets stuck rows when removing a stale job fails", async () => {
    smartDelayService.listStuckScheduled.mockResolvedValueOnce([
      { id: "stuck-1", triggerAt: new Date("2026-07-15T23:40:00.000Z") },
      { id: "stuck-2", triggerAt: new Date("2026-07-15T23:41:00.000Z") },
    ])
    smartDelayService.claimDueRows.mockResolvedValueOnce([])
    integrationQueueRemove
      .mockRejectedValueOnce(new Error("job is active"))
      .mockResolvedValueOnce(1)

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 0, enqueued: 0 })

    expect(smartDelayService.resetToPending).toHaveBeenCalledWith({
      ids: ["stuck-1", "stuck-2"],
      triggerAtBefore: new Date("2026-07-15T23:50:00.000Z"),
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      { count: 2, failedRemovals: 1 },
      "Reset stuck scheduled smart delay rows to pending",
    )
  })

  test("enqueues wait rows as resumeWait and follow-up rows as resumeFollowUp", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([
      makeRow({ id: "wait-row", type: "waitNode" }),
      makeRow({ id: "follow-up-row", type: "followUp" }),
    ])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 2, enqueued: 2 })

    expect(smartDelayService.claimDueRows).toHaveBeenCalledWith({
      windowUntil: new Date("2026-07-16T00:05:59.999Z"),
      limit: 500,
    })
    expect(integrationQueueAddBulk).toHaveBeenCalledWith([
      {
        name: "resumeWait",
        data: {
          type: "resumeWait",
          data: { smartDelayId: "wait-row" },
        },
        opts: { jobId: "smart-delay-wait-row-1784160060000", delay: 60_000 },
      },
      {
        name: "resumeFollowUp",
        data: {
          type: "resumeFollowUp",
          data: { smartDelayId: "follow-up-row" },
        },
        opts: {
          jobId: "smart-delay-follow-up-row-1784160060000",
          delay: 60_000,
        },
      },
    ])
  })

  test("resets a failed enqueue batch to pending", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([
      makeRow({ id: "failed-row" }),
    ])
    integrationQueueAddBulk.mockRejectedValueOnce(new Error("redis down"))

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 1, enqueued: 0 })
    expect(smartDelayService.resetToPending).toHaveBeenCalledWith({
      ids: ["failed-row"],
    })
  })

  test("logs terminal rows without enqueueing them", async () => {
    smartDelayService.claimDueRows.mockResolvedValueOnce([
      makeRow({ id: "terminal-row", nodeId: null }),
    ])

    await expect(scanSmartDelay()).resolves.toEqual({ scanned: 1, enqueued: 0 })
    expect(loggerInfo).toHaveBeenCalledWith(
      { ids: ["terminal-row"] },
      "Smart delay rows without nodeId marked completed (terminal wait)",
    )
    expect(smartDelayService.claimForRun).toHaveBeenCalledWith({
      id: "terminal-row",
      to: "completed",
    })
    expect(integrationQueueAddBulk).not.toHaveBeenCalled()
  })
})
