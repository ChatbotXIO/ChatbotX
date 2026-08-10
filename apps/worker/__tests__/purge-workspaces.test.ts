import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeDueScheduled = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const lockExists = vi.fn()
const info = vi.fn()
const warn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { purgeDueScheduled },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
  distributedStore: { exists: lockExists },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn }),
}))
vi.mock("../src/services/integrations", () => ({
  allIntegrations: ["integration"],
}))

const { purgeWorkspaces } = await import(
  "../src/schedule/handlers/purge-workspaces"
)

beforeEach(() => {
  purgeDueScheduled.mockReset()
  runExclusive.mockClear()
  lockExists.mockReset()
  lockExists.mockResolvedValue(false)
  info.mockReset()
  warn.mockReset()
  purgeDueScheduled.mockResolvedValue(0)
})

describe("purgeWorkspaces", () => {
  test("runs under the distributed lock and passes all integrations", async () => {
    await purgeWorkspaces()
    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:purge-workspaces",
        retryTimeoutInSeconds: 5,
        timeoutInSeconds: 10_800,
      }),
    )
    expect(purgeDueScheduled).toHaveBeenCalledWith({
      integrations: ["integration"],
    })
  })

  test("logs only when workspaces were deleted", async () => {
    purgeDueScheduled.mockResolvedValue(2)
    await purgeWorkspaces()
    expect(info).toHaveBeenCalledWith(
      { deleted: 2 },
      "purgeWorkspaces: workspaces purged",
    )
  })

  test("skips successfully when another purge still holds the lock", async () => {
    const err = Object.assign(new Error("lock held"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:purge-workspaces",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(true)

    await expect(purgeWorkspaces()).resolves.toBeUndefined()
    expect(lockExists).toHaveBeenCalledWith("schedule:purge-workspaces")
    expect(purgeDueScheduled).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      { err },
      "purgeWorkspaces: skipped because another purge still holds the lock",
    )
  })

  test("rethrows lock acquisition failures when the lock key is not held", async () => {
    const err = Object.assign(new Error("redis unavailable"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:purge-workspaces",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(false)

    await expect(purgeWorkspaces()).rejects.toBe(err)
    expect(purgeDueScheduled).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalledWith(
      { err },
      "purgeWorkspaces: skipped because another purge still holds the lock",
    )
  })

  test("skips immediately when a local purge is already running", async () => {
    let resolvePurge: (() => void) | undefined
    purgeDueScheduled.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolvePurge = () => resolve(0)
        }),
    )

    const firstRun = purgeWorkspaces()
    await Promise.resolve()
    await expect(purgeWorkspaces()).resolves.toBeUndefined()

    expect(runExclusive).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      "purgeWorkspaces: skipped because a local purge is still running",
    )

    resolvePurge?.()
    await firstRun
  })
})
