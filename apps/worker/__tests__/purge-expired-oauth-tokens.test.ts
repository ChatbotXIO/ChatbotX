import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeExpiredTokens = vi.fn()
const runExclusive = vi.fn(
  async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
)
const info = vi.fn()
const error = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  mcpOAuthService: { purgeExpiredTokens },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ error, info }),
}))

const { purgeExpiredOAuthTokens } = await import(
  "../src/schedule/handlers/purge-expired-oauth-tokens"
)

beforeEach(() => {
  vi.clearAllMocks()
  purgeExpiredTokens.mockResolvedValue(0)
})

describe("purgeExpiredOAuthTokens", () => {
  test("purges expired refresh-token rows under the daily distributed lock", async () => {
    await purgeExpiredOAuthTokens()

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:purge-expired-oauth-tokens",
        timeoutInSeconds: expect.any(Number),
        fn: expect.any(Function),
      }),
    )
    expect(purgeExpiredTokens).toHaveBeenCalledTimes(1)
  })

  test("logs the count when expired rows were purged", async () => {
    purgeExpiredTokens.mockResolvedValue(4)

    await purgeExpiredOAuthTokens()

    expect(info).toHaveBeenCalledWith(
      { deleted: 4 },
      "purgeExpiredOAuthTokens: rows purged",
    )
  })

  test("logs and rethrows purge failures", async () => {
    const err = new Error("database unavailable")
    purgeExpiredTokens.mockRejectedValue(err)

    await expect(purgeExpiredOAuthTokens()).rejects.toBe(err)
    expect(error).toHaveBeenCalledWith(
      { err },
      "purgeExpiredOAuthTokens: failed",
    )
  })
})
