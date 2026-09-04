import { beforeEach, describe, expect, test, vi } from "vitest"

const clearExpired = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const lockExists = vi.fn()
const info = vi.fn()
const warn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  workspaceSupportAccessService: { clearExpired },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
  distributedStore: { exists: lockExists },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn }),
}))

const { clearExpiredSupportAccess } = await import(
  "../src/schedule/handlers/clear-expired-support-access"
)

beforeEach(() => {
  clearExpired.mockReset()
  runExclusive.mockClear()
  lockExists.mockReset()
  lockExists.mockResolvedValue(false)
  info.mockReset()
  warn.mockReset()
  clearExpired.mockResolvedValue(0)
})

describe("clearExpiredSupportAccess", () => {
  test("runs under the distributed lock and calls clearExpired", async () => {
    await clearExpiredSupportAccess()
    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:clear-expired-support-access",
        retryTimeoutInSeconds: 5,
        timeoutInSeconds: 3600,
      }),
    )
    expect(clearExpired).toHaveBeenCalledTimes(1)
  })

  test("logs only when workspaces were cleared", async () => {
    clearExpired.mockResolvedValue(2)
    await clearExpiredSupportAccess()
    expect(info).toHaveBeenCalledWith(
      { cleared: 2 },
      "clearExpiredSupportAccess: expired support access cleared",
    )
  })

  test("does not log when nothing was cleared", async () => {
    await clearExpiredSupportAccess()
    expect(info).not.toHaveBeenCalled()
  })

  test("skips successfully when another run still holds the lock", async () => {
    const err = Object.assign(new Error("lock held"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:clear-expired-support-access",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(true)

    await expect(clearExpiredSupportAccess()).resolves.toBeUndefined()
    expect(lockExists).toHaveBeenCalledWith(
      "schedule:clear-expired-support-access",
    )
    expect(clearExpired).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      { err },
      "clearExpiredSupportAccess: skipped because another run still holds the lock",
    )
  })

  test("rethrows lock acquisition failures when the lock key is not held", async () => {
    const err = Object.assign(new Error("redis unavailable"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:clear-expired-support-access",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(false)

    await expect(clearExpiredSupportAccess()).rejects.toBe(err)
    expect(clearExpired).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalledWith(
      { err },
      "clearExpiredSupportAccess: skipped because another run still holds the lock",
    )
  })

  test("skips immediately when a local run is already in progress", async () => {
    let resolveRun: (() => void) | undefined
    clearExpired.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolveRun = () => resolve(0)
        }),
    )

    const firstRun = clearExpiredSupportAccess()
    await Promise.resolve()
    await expect(clearExpiredSupportAccess()).resolves.toBeUndefined()

    expect(runExclusive).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      "clearExpiredSupportAccess: skipped because a local run is still in progress",
    )

    resolveRun?.()
    await firstRun
  })
})
