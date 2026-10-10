import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  pollProcessingStatus: vi.fn(),
  sweepStranded: vi.fn(),
  syncSetups: vi.fn(),
  runExclusive: vi.fn(),
  lockExists: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  googleAdsConversionService: {
    pollProcessingStatus: mocks.pollProcessingStatus,
    sweepStranded: mocks.sweepStranded,
    syncSetups: mocks.syncSetups,
  },
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/redis")>()
  return {
    ...actual,
    distributedLock: { runExclusive: mocks.runExclusive },
    distributedStore: { exists: mocks.lockExists },
  }
})
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    warn: mocks.warn,
    error: mocks.error,
    info: vi.fn(),
  }),
}))

const { googleAdsHousekeeping, googleAdsSyncSetups } = await import(
  "../src/schedule/handlers/google-ads-housekeeping"
)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => fn(),
  )
  mocks.lockExists.mockResolvedValue(false)
})

describe("googleAdsHousekeeping", () => {
  test("polls processing status then sweeps stranded events, under the lock", async () => {
    const order: string[] = []
    mocks.pollProcessingStatus.mockImplementation(() => {
      order.push("poll")
      return Promise.resolve()
    })
    mocks.sweepStranded.mockImplementation(() => {
      order.push("sweep")
      return Promise.resolve()
    })

    await googleAdsHousekeeping()

    expect(order).toEqual(["poll", "sweep"])
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:google-ads-housekeeping",
        timeoutInSeconds: 3600,
        retryTimeoutInSeconds: 5,
      }),
    )
  })

  test("a poll failure still sweeps stranded events, then propagates", async () => {
    mocks.pollProcessingStatus.mockRejectedValue(new Error("poll down"))
    mocks.sweepStranded.mockResolvedValue(undefined)
    await expect(googleAdsHousekeeping()).rejects.toThrow("poll down")
    expect(mocks.sweepStranded).toHaveBeenCalledTimes(1)
  })

  test("when both fail the poll error is the one thrown", async () => {
    mocks.pollProcessingStatus.mockRejectedValue(new Error("poll down"))
    mocks.sweepStranded.mockRejectedValue(new Error("sweep down"))
    await expect(googleAdsHousekeeping()).rejects.toThrow("poll down")
  })

  test("when both fail each error is logged under err with its step", async () => {
    const pollErr = new Error("poll down")
    const sweepErr = new Error("sweep down")
    mocks.pollProcessingStatus.mockRejectedValue(pollErr)
    mocks.sweepStranded.mockRejectedValue(sweepErr)
    await expect(googleAdsHousekeeping()).rejects.toBe(pollErr)
    expect(mocks.error).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledWith(
      { err: pollErr, step: "poll" },
      expect.any(String),
    )
    expect(mocks.error).toHaveBeenCalledWith(
      { err: sweepErr, step: "sweep" },
      expect.any(String),
    )
  })

  test("a sweep failure propagates", async () => {
    mocks.sweepStranded.mockRejectedValue(new Error("sweep down"))
    await expect(googleAdsHousekeeping()).rejects.toThrow("sweep down")
  })

  test("skips quietly when another process holds the lock", async () => {
    mocks.runExclusive.mockRejectedValue(
      Object.assign(new Error("lock held"), {
        name: "LockAcquisitionError",
        code: "LOCK_ACQUISITION_FAILED",
        key: "schedule:google-ads-housekeeping",
      }),
    )
    mocks.lockExists.mockResolvedValue(true)

    await expect(googleAdsHousekeeping()).resolves.toBeUndefined()

    expect(mocks.pollProcessingStatus).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "google-ads-housekeeping" }),
      expect.stringContaining("another run holds the lock"),
    )
  })

  test("rethrows a lock failure when nobody actually holds the lock", async () => {
    const error = Object.assign(new Error("redis down"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:google-ads-housekeeping",
    })
    mocks.runExclusive.mockRejectedValue(error)
    mocks.lockExists.mockResolvedValue(false)

    await expect(googleAdsHousekeeping()).rejects.toBe(error)
  })

  test("skips a run overlapping a local run of the same job", async () => {
    let release: () => void = () => undefined
    mocks.pollProcessingStatus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const first = googleAdsHousekeeping()
    await vi.waitFor(() =>
      expect(mocks.pollProcessingStatus).toHaveBeenCalled(),
    )

    await googleAdsHousekeeping()

    expect(mocks.runExclusive).toHaveBeenCalledTimes(1)
    expect(mocks.warn).toHaveBeenCalledWith(
      { name: "google-ads-housekeeping" },
      expect.stringContaining("local run"),
    )
    release()
    await first
  })

  test("is runnable again after a failed run", async () => {
    mocks.pollProcessingStatus.mockRejectedValueOnce(new Error("x"))
    await expect(googleAdsHousekeeping()).rejects.toThrow("x")
    await googleAdsHousekeeping()
    // once on the failed run (a poll failure never skips the sweep), once now
    expect(mocks.sweepStranded).toHaveBeenCalledTimes(2)
  })
})

describe("googleAdsSyncSetups", () => {
  test("syncs setups under its own lock", async () => {
    await googleAdsSyncSetups()
    expect(mocks.syncSetups).toHaveBeenCalledTimes(1)
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ key: "schedule:google-ads-sync-setups" }),
    )
    expect(mocks.pollProcessingStatus).not.toHaveBeenCalled()
  })

  test("propagates errors", async () => {
    mocks.syncSetups.mockRejectedValue(new Error("sync down"))
    await expect(googleAdsSyncSetups()).rejects.toThrow("sync down")
  })

  test("is not blocked by a running housekeeping job", async () => {
    let release: () => void = () => undefined
    mocks.pollProcessingStatus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const running = googleAdsHousekeeping()
    await vi.waitFor(() =>
      expect(mocks.pollProcessingStatus).toHaveBeenCalled(),
    )

    await googleAdsSyncSetups()

    expect(mocks.syncSetups).toHaveBeenCalledTimes(1)
    release()
    await running
  })
})
