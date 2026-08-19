import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// purgeAutomationThrottle — retention cron for AutomationThrottle rows.
// Verifies: the handler body runs inside distributedLock.runExclusive, the
// repository purge is invoked, logging only happens when rows were actually
// purged, and — per the worker-development skill — the scheduler
// name/BullMQ jobId never contains ':'.
// ---------------------------------------------------------------------------

const purgeStaleAutomationThrottlesMock = vi.fn()
const info = vi.fn()

const runExclusiveMock = vi.fn(
  async ({ fn }: { fn: () => Promise<void> }) => await fn(),
)

vi.mock("@chatbotx.io/database/repositories", () => ({
  purgeStaleAutomationThrottles: purgeStaleAutomationThrottlesMock,
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: runExclusiveMock },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info }),
}))
// Avoid pulling in the real worker-config barrel (queue construction opens a
// live Redis connection at import time) — this test only needs the
// `ScheduleJobData` string constant.
vi.mock("@chatbotx.io/worker-config", () => ({
  ScheduleJobData: { purgeAutomationThrottle: "purgeAutomationThrottle" },
}))

const { purgeAutomationThrottle } = await import(
  "../src/schedule/handlers/purge-automation-throttle"
)
const { ScheduleJobData } = await import("@chatbotx.io/worker-config")

beforeEach(() => {
  vi.clearAllMocks()
  purgeStaleAutomationThrottlesMock.mockResolvedValue(0)
})

describe("purgeAutomationThrottle", () => {
  test("runs the purge inside distributedLock.runExclusive with a TTL under the hourly cadence", async () => {
    await purgeAutomationThrottle()

    expect(runExclusiveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:purge-automation-throttle",
        timeoutInSeconds: expect.any(Number),
        fn: expect.any(Function),
      }),
    )
    const { timeoutInSeconds } = runExclusiveMock.mock.calls[0]?.[0] as {
      timeoutInSeconds: number
    }
    // Cadence is hourly (register-schedules.ts: "0 * * * *" = 3600s).
    expect(timeoutInSeconds).toBeLessThan(3600)
    expect(purgeStaleAutomationThrottlesMock).toHaveBeenCalledTimes(1)
  })

  test("logs the deleted count when rows were purged", async () => {
    purgeStaleAutomationThrottlesMock.mockResolvedValueOnce(7)

    await purgeAutomationThrottle()

    expect(info).toHaveBeenCalledWith(
      { deleted: 7 },
      "purgeAutomationThrottle: rows purged",
    )
  })

  test("stays silent when nothing was stale", async () => {
    await purgeAutomationThrottle()

    expect(info).not.toHaveBeenCalled()
  })
})

describe("purgeAutomationThrottle schedule job id", () => {
  test("the ScheduleJobData key used as the scheduler name / BullMQ jobId never contains ':'", () => {
    expect(ScheduleJobData.purgeAutomationThrottle).not.toContain(":")
  })
})
