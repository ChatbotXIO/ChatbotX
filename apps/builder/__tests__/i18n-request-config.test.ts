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

type RequestConfigFactory = () => Promise<{
  locale: string
  timeZone?: string
}>

describe("i18n request config", () => {
  test("passes the user's cookie timezone to next-intl so client formatting never inherits the server zone", async () => {
    const config = await (requestConfig as unknown as RequestConfigFactory)()
    expect(config.timeZone).toBe("Asia/Ho_Chi_Minh")
    expect(config.locale).toBe("vi")
  })
})
