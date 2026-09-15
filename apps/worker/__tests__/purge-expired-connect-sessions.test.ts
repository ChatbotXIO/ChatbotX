import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeExpired = vi.fn()
const info = vi.fn()

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { purgeExpired },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info }),
}))

const { purgeExpiredConnectSessions } = await import(
  "../src/schedule/handlers/purge-expired-connect-sessions"
)

beforeEach(() => {
  purgeExpired.mockReset()
  info.mockReset()
})

describe("purgeExpiredConnectSessions", () => {
  test("logs the count when sessions were purged", async () => {
    purgeExpired.mockResolvedValue(3)

    await purgeExpiredConnectSessions()

    expect(purgeExpired).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith(
      { purged: 3 },
      "purgeExpiredConnectSessions: sessions expired",
    )
  })

  test("does not log when nothing was purged", async () => {
    purgeExpired.mockResolvedValue(0)

    await purgeExpiredConnectSessions()

    expect(info).not.toHaveBeenCalled()
  })
})
