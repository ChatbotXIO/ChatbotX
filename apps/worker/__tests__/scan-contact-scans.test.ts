import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockPickDue,
  mockMarkMaxAttemptsFailed,
  runExclusive,
  lockExists,
  mockQueueAdd,
  warn,
  error,
  info,
} = vi.hoisted(() => ({
  mockPickDue: vi.fn(),
  mockMarkMaxAttemptsFailed: vi.fn(),
  runExclusive: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
  lockExists: vi.fn(),
  mockQueueAdd: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactScanService: {
    pickDue: mockPickDue,
    markMaxAttemptsFailed: mockMarkMaxAttemptsFailed,
  },
}))

vi.mock("@chatbotx.io/business/contact-scan", () => ({
  CONTACT_SCAN_MAX_ATTEMPTS: 5,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
  distributedStore: { exists: lockExists },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn, error, debug: vi.fn() }),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  buildContactScanJobId: ({
    runId,
    attempts,
  }: {
    runId: string
    attempts: number
  }) => `contact-scan-${runId}-${attempts}`,
  IntegrationJobAction: { contactScan: "contactScan" },
  integrationQueue: { add: mockQueueAdd },
}))

const { scanContactScans } = await import(
  "../src/schedule/handlers/scan-contact-scans"
)

const LOCK_KEY = "schedule:scan-contact-scans"

const run = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "run-1",
  attempts: 0,
  channel: "messenger",
  integrationId: "int-1",
  workspaceId: "ws-1",
  ...overrides,
})

describe("scanContactScans", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runExclusive.mockImplementation(
      async ({ fn }: { fn: () => Promise<unknown> }) => fn(),
    )
    lockExists.mockResolvedValue(false)
    mockMarkMaxAttemptsFailed.mockResolvedValue(undefined)
    mockPickDue.mockResolvedValue([])
    mockQueueAdd.mockResolvedValue(undefined)
  })

  it("runs the body under the distributed lock with the documented key/TTL", async () => {
    await scanContactScans()

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: LOCK_KEY,
        timeoutInSeconds: 50,
        retryTimeoutInSeconds: 5,
      }),
    )
  })

  it("marks max-attempt rows before picking due runs, both scoped to type contact_scan", async () => {
    await scanContactScans()

    expect(mockMarkMaxAttemptsFailed).toHaveBeenCalledWith({
      maxAttempts: 5,
    })
    expect(mockPickDue).toHaveBeenCalledWith({
      batchSize: 500,
      maxAttempts: 5,
    })
  })

  it("does nothing further when no run is due", async () => {
    mockPickDue.mockResolvedValue([])

    await scanContactScans()

    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  it("enqueues a contactScan job per due run with the built job id and removeOnComplete", async () => {
    mockPickDue.mockResolvedValue([run({ id: "run-a", attempts: 2 })])

    await scanContactScans()

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "contactScan",
      {
        type: "contactScan",
        data: { runId: "run-a", workspaceId: "ws-1" },
      },
      expect.objectContaining({
        jobId: "contact-scan-run-a-2",
        attempts: 1,
        removeOnComplete: true,
      }),
    )
  })

  it("does not stop the loop when one run's enqueue fails", async () => {
    mockPickDue.mockResolvedValue([run({ id: "run-a" }), run({ id: "run-b" })])
    mockQueueAdd
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce(undefined)

    await scanContactScans()

    expect(mockQueueAdd).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-a" }),
      "scanContactScans: enqueue failed",
    )
  })

  it("skips successfully when another run still holds the lock", async () => {
    const err = Object.assign(new Error("lock held"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: LOCK_KEY,
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(true)

    await expect(scanContactScans()).resolves.toBeUndefined()

    expect(lockExists).toHaveBeenCalledWith(LOCK_KEY)
    expect(mockPickDue).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      { err },
      "scanContactScans: skipped because another run still holds the lock",
    )
  })

  it("rethrows a lock-acquisition error when the lock key is not held", async () => {
    const err = Object.assign(new Error("redis unavailable"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: LOCK_KEY,
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(false)

    await expect(scanContactScans()).rejects.toBe(err)
    expect(mockPickDue).not.toHaveBeenCalled()
  })

  it("rethrows any other error unrelated to lock acquisition", async () => {
    const err = new Error("db exploded")
    runExclusive.mockRejectedValueOnce(err)

    await expect(scanContactScans()).rejects.toBe(err)
    expect(lockExists).not.toHaveBeenCalled()
  })
})
