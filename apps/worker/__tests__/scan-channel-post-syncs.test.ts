import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  isLockAcquisitionError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  runExclusive: vi.fn(),
  scanDue: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  channelPostSyncService: { scanDue: mocks.scanDue },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn }),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: { exists: mocks.exists },
  isLockAcquisitionError: mocks.isLockAcquisitionError,
}))

const { scanChannelPostSyncs } = await import(
  "../src/schedule/handlers/scan-channel-post-syncs"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<void> }) => await fn(),
  )
  mocks.scanDue.mockResolvedValue(0)
})

describe("scanChannelPostSyncs", () => {
  test("runs under one distributed lock whose ttl is shorter than the minute cadence", async () => {
    await scanChannelPostSyncs()

    const options = mocks.runExclusive.mock.calls[0]?.[0]
    expect(options.key).toBe("schedule:scan-channel-post-syncs")
    expect(options.timeoutInSeconds).toBeLessThan(60)
    expect(mocks.scanDue).toHaveBeenCalledTimes(1)
  })

  test("skips a tick when the previous one still holds the lock", async () => {
    const contention = new Error("locked")
    mocks.runExclusive.mockRejectedValueOnce(contention)
    mocks.isLockAcquisitionError.mockReturnValue(true)
    mocks.exists.mockResolvedValue(true)

    await expect(scanChannelPostSyncs()).resolves.toBeUndefined()
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("any other failure is thrown", async () => {
    mocks.runExclusive.mockRejectedValueOnce(new Error("db down"))
    mocks.isLockAcquisitionError.mockReturnValue(false)

    await expect(scanChannelPostSyncs()).rejects.toThrow("db down")
  })
})
