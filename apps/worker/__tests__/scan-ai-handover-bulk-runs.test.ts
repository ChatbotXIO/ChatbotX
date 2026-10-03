import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  pickDue: vi.fn(),
  markMaxAttemptsFailed: vi.fn(),
  enqueueChunk: vi.fn(),
  refundIfQueued: vi.fn(),
  listAwaiting: vi.fn(),
  reconcile: vi.fn(),
  storeGet: vi.fn(),
  storePut: vi.fn(),
  storeDelete: vi.fn(),
  runExclusive: vi.fn(),
  lockExists: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  aiHandoverBulkRunService: {
    pickDue: mocks.pickDue,
    markMaxAttemptsFailed: mocks.markMaxAttemptsFailed,
    enqueueChunk: mocks.enqueueChunk,
    refundIfPreviousChunkQueued: mocks.refundIfQueued,
    listInboxesAwaitingRun: mocks.listAwaiting,
    reconcile: mocks.reconcile,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: {
    exists: mocks.lockExists,
    get: mocks.storeGet,
    put: mocks.storePut,
    delete: mocks.storeDelete,
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    info: vi.fn(),
    warn: mocks.warn,
    error: mocks.error,
    debug: vi.fn(),
  }),
}))

const { scanAiHandoverBulkRuns } = await import(
  "../src/schedule/handlers/scan-ai-handover-bulk-runs"
)

const LOCK_KEY = "schedule:scan-ai-handover-bulk-runs"
const lockError = () =>
  Object.assign(new Error("lock held"), {
    name: "LockAcquisitionError",
    code: "LOCK_ACQUISITION_FAILED",
    key: LOCK_KEY,
  })

const run = (id: string, attempts = 1, chunkSeq = 0) => ({
  id,
  workspaceId: "ws-1",
  attempts,
  chunkSeq,
  status: "pending" as const,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.refundIfQueued.mockResolvedValue(false)
  mocks.runExclusive.mockImplementation(
    ({ fn }: { fn: () => Promise<unknown> }) => fn(),
  )
  mocks.lockExists.mockResolvedValue(false)
  mocks.markMaxAttemptsFailed.mockResolvedValue(undefined)
  mocks.pickDue.mockResolvedValue([])
  mocks.enqueueChunk.mockResolvedValue(undefined)
  mocks.listAwaiting.mockResolvedValue([])
  mocks.reconcile.mockResolvedValue(undefined)
  mocks.storeGet.mockResolvedValue(null)
  mocks.storePut.mockResolvedValue(undefined)
  mocks.storeDelete.mockResolvedValue(undefined)
})

describe("scanAiHandoverBulkRuns", () => {
  it("runs under the distributed lock with the documented key and TTL", async () => {
    await scanAiHandoverBulkRuns()

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: LOCK_KEY,
        timeoutInSeconds: 50,
        retryTimeoutInSeconds: 5,
      }),
    )
  })

  it("terminalizes exhausted runs before picking due ones, and dispatches nothing when none is due", async () => {
    const order: string[] = []
    mocks.markMaxAttemptsFailed.mockImplementation(() => {
      order.push("markMax")
      return Promise.resolve()
    })
    mocks.pickDue.mockImplementation(() => {
      order.push("pickDue")
      return Promise.resolve([])
    })

    await scanAiHandoverBulkRuns()

    expect(order).toEqual(["markMax", "pickDue"])
    expect(mocks.enqueueChunk).not.toHaveBeenCalled()
  })

  it("dispatches each due run as its next chunk", async () => {
    const due = [run("run-a", 2, 3), run("run-b")]
    mocks.pickDue.mockResolvedValue(due)

    await scanAiHandoverBulkRuns()

    expect(mocks.enqueueChunk.mock.calls.map((call) => call[0])).toEqual(due)
  })

  it("does not dispatch a run whose previous chunk is still queued (a backed-up queue), so it is never failed for waiting", async () => {
    mocks.pickDue.mockResolvedValue([run("run-a"), run("run-b")])
    mocks.refundIfQueued.mockImplementation((picked: { id: string }) =>
      Promise.resolve(picked.id === "run-a"),
    )

    await scanAiHandoverBulkRuns()

    expect(mocks.enqueueChunk).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueChunk.mock.calls[0][0]).toMatchObject({ id: "run-b" })
  })

  it("keeps a run alive across many ticks while its job waits in a backed-up queue", async () => {
    mocks.pickDue.mockResolvedValue([run("run-a", 1, 1)])
    mocks.refundIfQueued.mockResolvedValue(true)

    for (let tick = 0; tick < 5; tick++) {
      await scanAiHandoverBulkRuns()
    }

    expect(mocks.refundIfQueued).toHaveBeenCalledTimes(5)
    expect(mocks.enqueueChunk).not.toHaveBeenCalled()
  })

  it("keeps dispatching when one run's enqueue fails, and logs it with `err`", async () => {
    mocks.pickDue.mockResolvedValue([run("run-a"), run("run-b")])
    mocks.enqueueChunk
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce(undefined)

    await scanAiHandoverBulkRuns()

    expect(mocks.enqueueChunk).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), runId: "run-a" }),
      "scanAiHandoverBulkRuns: enqueue failed",
    )
  })

  describe("reconciling Pages that are owed a run", () => {
    const pages = (count: number, from = 0) =>
      Array.from({ length: count }, (_, index) => ({
        workspaceId: "ws-1",
        inboxId: `inbox-${String(from + index).padStart(3, "0")}`,
      }))

    it("reconciles each Page awaiting a run, and one failing Page does not stop the rest", async () => {
      mocks.listAwaiting.mockResolvedValue(pages(3))
      mocks.reconcile
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValue(undefined)

      await scanAiHandoverBulkRuns()

      expect(mocks.reconcile).toHaveBeenCalledTimes(3)
      expect(mocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          inboxId: "inbox-000",
        }),
        "scanAiHandoverBulkRuns: reconcile failed",
      )
    })

    it("a full list stores the last Page id as the cursor for the next tick", async () => {
      mocks.listAwaiting.mockResolvedValue(pages(50))

      await scanAiHandoverBulkRuns()

      expect(mocks.storePut).toHaveBeenCalledWith(
        "schedule:scan-ai-handover-bulk-runs:cursor",
        "inbox-049",
        expect.any(Number),
      )
      expect(mocks.storeDelete).not.toHaveBeenCalled()
    })

    it("resumes after the stored cursor", async () => {
      mocks.storeGet.mockResolvedValue("inbox-049")
      mocks.listAwaiting.mockResolvedValue(pages(2, 50))

      await scanAiHandoverBulkRuns()

      expect(mocks.listAwaiting).toHaveBeenCalledWith({
        limit: 50,
        afterInboxId: "inbox-049",
      })
    })

    it("wraps around to the first Page when the sweep reached the end, so no Page is skipped for good", async () => {
      mocks.storeGet.mockResolvedValue("inbox-999")
      mocks.listAwaiting
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(pages(2))

      await scanAiHandoverBulkRuns()

      expect(mocks.listAwaiting).toHaveBeenNthCalledWith(2, { limit: 50 })
      expect(mocks.reconcile).toHaveBeenCalledTimes(2)
      // A short list is the end of this sweep: the cursor is dropped.
      expect(mocks.storeDelete).toHaveBeenCalledWith(
        "schedule:scan-ai-handover-bulk-runs:cursor",
      )
    })

    it("does nothing (and keeps no cursor) when no Page is owed a run", async () => {
      await scanAiHandoverBulkRuns()

      expect(mocks.reconcile).not.toHaveBeenCalled()
      expect(mocks.storePut).not.toHaveBeenCalled()
    })

    it("runs after the due runs were dispatched", async () => {
      const order: string[] = []
      mocks.pickDue.mockImplementation(() => {
        order.push("pickDue")
        return Promise.resolve([])
      })
      mocks.listAwaiting.mockImplementation(() => {
        order.push("awaiting")
        return Promise.resolve([])
      })

      await scanAiHandoverBulkRuns()

      expect(order).toEqual(["pickDue", "awaiting"])
    })
  })

  it("skips quietly when another sweep still holds the lock", async () => {
    const err = lockError()
    mocks.runExclusive.mockRejectedValueOnce(err)
    mocks.lockExists.mockResolvedValueOnce(true)

    await expect(scanAiHandoverBulkRuns()).resolves.toBeUndefined()

    expect(mocks.pickDue).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith({ err }, expect.any(String))
  })

  it("rethrows a lock failure when the lock key is not actually held", async () => {
    const err = lockError()
    mocks.runExclusive.mockRejectedValueOnce(err)

    await expect(scanAiHandoverBulkRuns()).rejects.toBe(err)
  })

  it("rethrows any other error", async () => {
    const err = new Error("db exploded")
    mocks.runExclusive.mockRejectedValueOnce(err)

    await expect(scanAiHandoverBulkRuns()).rejects.toBe(err)
    expect(mocks.lockExists).not.toHaveBeenCalled()
  })
})
