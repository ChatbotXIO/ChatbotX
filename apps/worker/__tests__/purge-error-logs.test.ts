import { beforeEach, describe, expect, it, vi } from "vitest"

const execute = vi.fn()
vi.mock("@chatbotx.io/database/client", () => ({
  db: { execute: (...args: unknown[]) => execute(...args) },
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    { raw: (v: string) => v },
  ),
}))

const info = vi.fn()
const warn = vi.fn()
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn, error: vi.fn() }),
}))

const load = async () =>
  (await import("../src/schedule/handlers/purge-error-logs")).purgeErrorLogs

const rows = (n: number) => ({
  rows: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
})

describe("purgeErrorLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    execute.mockReset()
    info.mockReset()
    warn.mockReset()
    vi.useRealTimers()
  })

  it("stops after the first short chunk", async () => {
    const purgeErrorLogs = await load()
    execute.mockResolvedValueOnce(rows(10))

    await purgeErrorLogs()

    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("keeps deleting while chunks come back full", async () => {
    const purgeErrorLogs = await load()
    execute
      .mockResolvedValueOnce(rows(1000))
      .mockResolvedValueOnce(rows(1000))
      .mockResolvedValueOnce(rows(3))

    await purgeErrorLogs()

    expect(execute).toHaveBeenCalledTimes(3)
  })

  it("does nothing further when the first chunk is empty", async () => {
    const purgeErrorLogs = await load()
    execute.mockResolvedValueOnce(rows(0))

    await purgeErrorLogs()

    expect(execute).toHaveBeenCalledTimes(1)
    expect(info).not.toHaveBeenCalled()
  })

  // The old fixed 50-chunk cap removed at most 50k rows a day, far below what
  // a single failed broadcast can add, so the table could never drain. The
  // limit is now wall-clock.
  it("keeps draining well past the old 50-chunk cap, then stops at the budget", async () => {
    const purgeErrorLogs = await load()
    execute.mockResolvedValue(rows(1000))
    vi.useFakeTimers()

    const pending = purgeErrorLogs()
    // Past MAX_RUN_DURATION_MS (10 minutes) so the deadline is what stops it.
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000)
    await pending

    expect(execute.mock.calls.length).toBeGreaterThan(1000)
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ stopReason: "deadline" }),
      expect.any(String),
    )
    expect(info).not.toHaveBeenCalled()
  })
})
