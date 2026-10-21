import { beforeEach, describe, expect, test, vi } from "vitest"

const refreshLicenseToken = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const lockExists = vi.fn()
const warn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  refreshLicense: refreshLicenseToken,
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    distributedLock: { runExclusive },
    distributedStore: { exists: lockExists },
  }
})
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ warn }),
}))

// The handler must load after its dependencies have been mocked.
const { refreshLicense } = await import(
  "../src/schedule/handlers/refresh-license"
)

beforeEach(() => {
  refreshLicenseToken.mockReset()
  refreshLicenseToken.mockResolvedValue({
    status: "unchanged",
    expiresAt: "2026-01-01T00:00:00.000Z",
  })
  runExclusive.mockClear()
  lockExists.mockReset()
  lockExists.mockResolvedValue(false)
  warn.mockReset()
})

describe("refreshLicense", () => {
  test("runs the business refresh under the distributed lock", async () => {
    await refreshLicense()

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:refresh-license",
        retryTimeoutInSeconds: 0,
        timeoutInSeconds: 60,
      }),
    )
    expect(refreshLicenseToken).toHaveBeenCalledTimes(1)
  })

  test("skips successfully when another refresh holds the lock", async () => {
    const err = Object.assign(new Error("lock held"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:refresh-license",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(true)

    await expect(refreshLicense()).resolves.toBeUndefined()

    expect(lockExists).toHaveBeenCalledWith("schedule:refresh-license")
    expect(refreshLicenseToken).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      { err },
      "refreshLicense: skipped because another refresh still holds the lock",
    )
  })

  test("rethrows a lock acquisition failure when no lock is held", async () => {
    const err = Object.assign(new Error("redis unavailable"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:refresh-license",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(false)

    await expect(refreshLicense()).rejects.toBe(err)
    expect(refreshLicenseToken).not.toHaveBeenCalled()
  })
})
