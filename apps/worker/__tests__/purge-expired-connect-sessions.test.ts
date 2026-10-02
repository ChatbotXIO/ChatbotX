import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeExpired = vi.fn()
const info = vi.fn()
const warn = vi.fn()

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { purgeExpired },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn }),
}))

const { purgeExpiredConnectSessions } = await import(
  "../src/schedule/handlers/purge-expired-connect-sessions"
)

beforeEach(() => {
  purgeExpired.mockReset()
  info.mockReset()
  warn.mockReset()
})

describe("purgeExpiredConnectSessions", () => {
  test("passes retention/chunk options and logs both sweeps' counts", async () => {
    purgeExpired.mockResolvedValue({
      expired: 3,
      deletedTerminal: 5,
      terminalPurgeStopReason: "drained",
    })

    await purgeExpiredConnectSessions()

    expect(purgeExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        retentionDays: 7,
        chunkSize: expect.any(Number),
        interChunkDelayMs: expect.any(Number),
        maxChunks: expect.any(Number),
      }),
    )
    expect(info).toHaveBeenCalledWith(
      { expired: 3 },
      "purgeExpiredConnectSessions: sessions expired",
    )
    expect(info).toHaveBeenCalledWith(
      { deletedTerminal: 5 },
      "purgeExpiredConnectSessions: terminal rows purged",
    )
    expect(warn).not.toHaveBeenCalled()
  })

  test("does not log either sweep when nothing was purged", async () => {
    purgeExpired.mockResolvedValue({
      expired: 0,
      deletedTerminal: 0,
      terminalPurgeStopReason: "drained",
    })

    await purgeExpiredConnectSessions()

    expect(info).not.toHaveBeenCalled()
  })

  test("warns when the terminal purge stops with a backlog remaining (regression: the retention sweep falling behind must be observable)", async () => {
    purgeExpired.mockResolvedValue({
      expired: 0,
      deletedTerminal: 500,
      terminalPurgeStopReason: "chunkCap",
    })

    await purgeExpiredConnectSessions()

    expect(warn).toHaveBeenCalledWith(
      { deletedTerminal: 500, terminalPurgeStopReason: "chunkCap" },
      "purgeExpiredConnectSessions: terminal purge stopped with a backlog remaining",
    )
  })
})
