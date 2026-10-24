// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(factory: T) => factory,
}))

vi.mock("@/lib/locale", () => ({
  getUserLocale: vi.fn().mockResolvedValue("vi"),
}))

vi.mock("@/lib/timezone", () => ({
  getUserTimezone: vi.fn().mockResolvedValue("Asia/Ho_Chi_Minh"),
}))

const { default: requestConfig } = await import("../src/i18n/request")

type RequestConfigFactory = (params: {
  locale?: string
  requestLocale: Promise<string | undefined>
}) => Promise<{
  locale: string
  timeZone?: string
}>

describe("i18n request config", () => {
  test("passes the user's cookie timezone to next-intl so client formatting never inherits the server zone", async () => {
    const config = await (requestConfig as unknown as RequestConfigFactory)({
      requestLocale: Promise.resolve(undefined),
    })
    expect(config.timeZone).toBe("Asia/Ho_Chi_Minh")
    expect(config.locale).toBe("vi")
  })

  test("an explicit locale wins over the cookie, so the web shop can speak the workspace language", async () => {
    const config = await (requestConfig as unknown as RequestConfigFactory)({
      locale: "ja",
      requestLocale: Promise.resolve(undefined),
    })
    expect(config.locale).toBe("ja")
  })
})
