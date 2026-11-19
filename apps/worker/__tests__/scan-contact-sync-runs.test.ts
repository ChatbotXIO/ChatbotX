import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  pickDue: vi.fn(),
  markMaxAttemptsFailed: vi.fn(),
  sweepFollowUps: vi.fn(),
  enqueueChunk: vi.fn(),
  refundIfQueued: vi.fn(),
  runExclusive: vi.fn(),
  lockExists: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactSyncService: {
    pickDue: mocks.pickDue,
    markMaxAttemptsFailed: mocks.markMaxAttemptsFailed,
    sweepFollowUps: mocks.sweepFollowUps,
    enqueueChunk: mocks.enqueueChunk,
    refundIfPreviousChunkQueued: mocks.refundIfQueued,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: { exists: mocks.lockExists },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    info: vi.fn(),
    warn: mocks.warn,
    error: mocks.error,
    debug: vi.fn(),
  }),
}))

const { scanContactSyncRuns } = await import(
  "../src/schedule/handlers/scan-contact-sync-runs"
)

const LOCK_KEY = "schedule:scan-contact-sync-runs"
const lockError = () =>
  Object.assign(new Error("lock held"), {
    name: "LockAcquisitionError",
    code: "LOCK_ACQUISITION_FAILED",
    key: LOCK_KEY,
  })

const run = (id: string) => ({
  id,
  workspaceId: "ws-1",
  attempts: 1,
  chunkSeq: 1,
  status: "pending",
})

describe("scanContactSyncRuns", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.sweepFollowUps.mockResolvedValue(0)
    mocks.runExclusive.mockImplementation(
      async ({ fn }: { fn: () => Promise<void> }) => await fn(),
    )
    mocks.pickDue.mockResolvedValue([])
    mocks.refundIfQueued.mockResolvedValue(false)
  })

  it("fails exhausted runs before dispatching, under the sweeper lock", async () => {
    await scanContactSyncRuns()

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ key: LOCK_KEY }),
    )
    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledTimes(1)
    expect(mocks.pickDue).toHaveBeenCalledWith({ batchSize: 100 })
    expect(
      mocks.markMaxAttemptsFailed.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.pickDue.mock.invocationCallOrder[0] ?? 0)
  })

  it("re-dispatches every due run", async () => {
    mocks.pickDue.mockResolvedValue([run("run-1"), run("run-2")])

    await scanContactSyncRuns()

    expect(mocks.enqueueChunk).toHaveBeenCalledTimes(2)
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(run("run-1"))
  })

  it("does not dispatch a run whose previous chunk is still queued", async () => {
    mocks.pickDue.mockResolvedValue([run("run-1")])
    mocks.refundIfQueued.mockResolvedValue(true)

    await scanContactSyncRuns()

    expect(mocks.enqueueChunk).not.toHaveBeenCalled()
  })

  it("one failed enqueue does not stop the others", async () => {
    mocks.pickDue.mockResolvedValue([run("run-1"), run("run-2")])
    mocks.enqueueChunk
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValue(undefined)

    await scanContactSyncRuns()

    expect(mocks.enqueueChunk).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledTimes(1)
  })

  it("skips quietly while another sweeper holds the lock", async () => {
    mocks.runExclusive.mockRejectedValue(lockError())
    mocks.lockExists.mockResolvedValue(true)

    await expect(scanContactSyncRuns()).resolves.toBeUndefined()
    expect(mocks.pickDue).not.toHaveBeenCalled()
  })

  it("surfaces any other failure", async () => {
    mocks.runExclusive.mockRejectedValue(new Error("boom"))

    await expect(scanContactSyncRuns()).rejects.toThrow("boom")
  })

  it("sweeps the owed history syncs even when no run is due", async () => {
    mocks.pickDue.mockResolvedValue([])

    await scanContactSyncRuns()

    expect(mocks.sweepFollowUps).toHaveBeenCalledTimes(1)
  })

  it("sweeps after the runs were dispatched, in the same locked callback", async () => {
    mocks.pickDue.mockResolvedValue([run("run-1")])

    await scanContactSyncRuns()

    expect(mocks.enqueueChunk.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sweepFollowUps.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it("a failing sweep is logged and never fails the scan", async () => {
    mocks.pickDue.mockResolvedValue([])
    mocks.sweepFollowUps.mockRejectedValue(new Error("db blip"))

    await expect(scanContactSyncRuns()).resolves.toBeUndefined()
    expect(mocks.error).toHaveBeenCalled()
  })
})
