import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  isLockAcquisitionError: vi.fn(),
  listDue: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  materializeSeries: vi.fn(),
  runExclusive: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  socialPostRecurrenceService: {
    listDue: mocks.listDue,
    materializeSeries: mocks.materializeSeries,
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  }),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: { exists: mocks.exists },
  isLockAcquisitionError: mocks.isLockAcquisitionError,
}))
vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: mocks.isBlockedWorkspace,
}))
vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: async (
    _params: unknown,
    fn: () => Promise<unknown>,
  ) => await fn(),
}))

const { materializeSocialPostRecurrences } = await import(
  "../src/schedule/handlers/materialize-social-post-recurrences"
)

const series = (id: string, workspaceId: string) => ({
  id,
  nextRunAt: new Date("2030-01-01T00:00:00Z"),
  socialPostId: `post-${id}`,
  workspaceId,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
  mocks.isBlockedWorkspace.mockResolvedValue(false)
  mocks.materializeSeries.mockResolvedValue({
    created: 1,
    excluded: 0,
    missed: 0,
    skipped: 0,
  })
})

describe("materializeSocialPostRecurrences", () => {
  test("runs under one lock shorter than the minute cadence", async () => {
    mocks.listDue.mockResolvedValue([])

    await materializeSocialPostRecurrences()

    const options = mocks.runExclusive.mock.calls[0]?.[0]
    expect(options.key).toBe("schedule:materialize-social-post-recurrences")
    expect(options.timeoutInSeconds).toBeLessThan(60)
  })

  test("a blocked owner's series is left alone: nothing is materialised, so it does not advance", async () => {
    mocks.listDue.mockResolvedValue([
      series("1", "ws-blocked"),
      series("2", "ws-ok"),
    ])
    mocks.isBlockedWorkspace.mockImplementation(
      async (workspaceId: string) => workspaceId === "ws-blocked",
    )

    const result = await materializeSocialPostRecurrences()

    expect(mocks.materializeSeries).toHaveBeenCalledTimes(1)
    expect(mocks.materializeSeries).toHaveBeenCalledWith(series("2", "ws-ok"))
    expect(result).toMatchObject({ created: 1, skippedBlocked: 1 })
  })

  test("500 blocked series do not starve an active series behind them", async () => {
    const blocked = Array.from({ length: 500 }, (_, i) =>
      series(String(i), "ws-blocked"),
    )
    mocks.listDue
      .mockResolvedValueOnce(blocked)
      .mockResolvedValueOnce([series("active", "ws-ok")])
    mocks.isBlockedWorkspace.mockImplementation(
      async (workspaceId: string) => workspaceId === "ws-blocked",
    )

    const result = await materializeSocialPostRecurrences()

    expect(mocks.listDue).toHaveBeenNthCalledWith(2, 500, {
      id: "499",
      nextRunAt: blocked[499]?.nextRunAt,
    })
    expect(mocks.materializeSeries).toHaveBeenCalledTimes(1)
    expect(mocks.materializeSeries).toHaveBeenCalledWith(
      series("active", "ws-ok"),
    )
    expect(result).toMatchObject({ created: 1, skippedBlocked: 500 })
  })

  test("one failing series does not stop the others", async () => {
    mocks.listDue.mockResolvedValue([series("1", "a"), series("2", "b")])
    mocks.materializeSeries.mockRejectedValueOnce(new Error("boom"))

    const result = await materializeSocialPostRecurrences()

    expect(mocks.materializeSeries).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ created: 1, failed: 1 })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })

  test("skips a tick when the previous one still holds the lock", async () => {
    mocks.runExclusive.mockRejectedValueOnce(new Error("locked"))
    mocks.isLockAcquisitionError.mockReturnValue(true)
    mocks.exists.mockResolvedValue(true)

    await expect(materializeSocialPostRecurrences()).resolves.toBeUndefined()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })
})
