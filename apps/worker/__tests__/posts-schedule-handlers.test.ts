import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  failMissed: vi.fn(),
  isLockAcquisitionError: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  maintain: vi.fn(),
  recoverExpired: vi.fn(),
  runExclusive: vi.fn(),
  scanDue: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  maintainChannelPostMetricPartitions: mocks.maintain,
  socialPostPublishService: {
    recoverExpired: mocks.recoverExpired,
    scanDue: mocks.scanDue,
  },
  socialPostScheduleService: { failMissed: mocks.failMissed },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: { exists: mocks.exists },
  isLockAcquisitionError: mocks.isLockAcquisitionError,
}))
vi.mock("../src/lib/logger", () => ({ logger: { error: mocks.loggerError } }))
const PUBLISHERS = { facebook: { name: "fake" } }
vi.mock("../src/post-publish/publishers", () => ({
  socialPublishers: PUBLISHERS,
}))

const { enqueueSocialPostTargets } = await import(
  "../src/schedule/handlers/enqueue-social-post-targets"
)
const { recoverSocialPostTargets } = await import(
  "../src/schedule/handlers/recover-social-post-targets"
)
const { maintainChannelPostMetricPartitions } = await import(
  "../src/schedule/handlers/maintain-channel-post-metric-partitions"
)

const runInsideLock = (): void => {
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
}

describe("enqueueSocialPostTargets (due targets)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    runInsideLock()
  })

  test("gives up the late targets first, then hands the due ones to the queue, under one lock shorter than the minute", async () => {
    mocks.failMissed.mockResolvedValue(2)
    mocks.scanDue.mockResolvedValue(5)

    await enqueueSocialPostTargets()

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:enqueue-social-post-targets",
        timeoutInSeconds: 50,
      }),
    )
    expect(mocks.failMissed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.scanDue.mock.invocationCallOrder[0],
    )
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { missed: 2 },
      expect.any(String),
    )
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { queued: 5 },
      expect.any(String),
    )
  })

  test("an idle tick logs nothing", async () => {
    mocks.failMissed.mockResolvedValue(0)
    mocks.scanDue.mockResolvedValue(0)

    await enqueueSocialPostTargets()

    expect(mocks.loggerWarn).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).not.toHaveBeenCalled()
  })

  test("a tick that finds the previous one still holding the lock is skipped, not failed", async () => {
    const contention = new Error("lock held")
    mocks.runExclusive.mockRejectedValue(contention)
    mocks.isLockAcquisitionError.mockReturnValue(true)
    mocks.exists.mockResolvedValue(true)

    await expect(enqueueSocialPostTargets()).resolves.toBeUndefined()

    expect(mocks.scanDue).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { err: contention },
      expect.stringContaining("skipped"),
    )
  })

  test("a lock error whose key is gone, and any other error, is rethrown so the job retries", async () => {
    const lost = new Error("lock lost")
    mocks.runExclusive.mockRejectedValue(lost)
    mocks.isLockAcquisitionError.mockReturnValue(true)
    mocks.exists.mockResolvedValue(false)
    await expect(enqueueSocialPostTargets()).rejects.toBe(lost)

    const db = new Error("db down")
    mocks.runExclusive.mockRejectedValue(db)
    mocks.isLockAcquisitionError.mockReturnValue(false)
    await expect(enqueueSocialPostTargets()).rejects.toBe(db)
  })
})

describe("recoverSocialPostTargets (expired leases)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    runInsideLock()
  })

  test("claims the expired leases under one 50 s lock without reading any network inline", async () => {
    mocks.recoverExpired.mockResolvedValue(3)

    await recoverSocialPostTargets()

    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:recover-social-post-targets",
        timeoutInSeconds: 50,
      }),
    )
    expect(mocks.recoverExpired).toHaveBeenCalledWith()
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { recovered: 3 },
      expect.any(String),
    )
  })

  test("nothing expired logs nothing", async () => {
    mocks.recoverExpired.mockResolvedValue(0)

    await recoverSocialPostTargets()

    expect(mocks.loggerInfo).not.toHaveBeenCalled()
  })

  test("a held lock is skipped; a recovery error is rethrown", async () => {
    mocks.runExclusive.mockRejectedValue(new Error("held"))
    mocks.isLockAcquisitionError.mockReturnValue(true)
    mocks.exists.mockResolvedValue(true)
    await expect(recoverSocialPostTargets()).resolves.toBeUndefined()
    expect(mocks.recoverExpired).not.toHaveBeenCalled()

    const boom = new Error("recover failed")
    mocks.runExclusive.mockImplementation(
      async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
    )
    mocks.recoverExpired.mockRejectedValue(boom)
    mocks.isLockAcquisitionError.mockReturnValue(false)
    await expect(recoverSocialPostTargets()).rejects.toBe(boom)
  })
})

describe("maintainChannelPostMetricPartitions", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test("runs the business maintenance once", async () => {
    mocks.maintain.mockResolvedValue(undefined)

    await maintainChannelPostMetricPartitions()

    expect(mocks.maintain).toHaveBeenCalledTimes(1)
  })

  test("a failure is logged and swallowed: the daily tick must not crash the schedule worker", async () => {
    const boom = new Error("partition create failed")
    mocks.maintain.mockRejectedValue(boom)

    await expect(maintainChannelPostMetricPartitions()).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: boom },
      expect.stringContaining("maintainChannelPostMetricPartitions"),
    )
  })
})
