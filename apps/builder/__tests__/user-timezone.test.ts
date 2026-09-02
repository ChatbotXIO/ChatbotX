// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const cookieStore = new Map<string, string>()
const setCookie = vi.fn((name: string, value: string) => {
  cookieStore.set(name, value)
})
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: setCookie,
  }),
}))

import { getUserTimezone } from "@/lib/timezone"
import { setUserTimezone } from "@/lib/timezone.action"
import { TIMEZONE_COOKIE_NAME } from "@/lib/timezone-cookie"

describe("getUserTimezone", () => {
  beforeEach(() => {
    cookieStore.clear()
    setCookie.mockClear()
  })

  test("returns the IANA zone stored in the timezone cookie", async () => {
    cookieStore.set(TIMEZONE_COOKIE_NAME, "Asia/Ho_Chi_Minh")
    expect(await getUserTimezone()).toBe("Asia/Ho_Chi_Minh")
  })

  test("falls back to UTC when the cookie is missing", async () => {
    expect(await getUserTimezone()).toBe("UTC")
  })

  test("falls back to UTC when the cookie holds an unusable zone", async () => {
    cookieStore.set(TIMEZONE_COOKIE_NAME, "Not/AZone")
    expect(await getUserTimezone()).toBe("UTC")
  })
})

describe("setUserTimezone", () => {
  beforeEach(() => {
    cookieStore.clear()
    setCookie.mockClear()
  })

  test("stores a resolvable zone so later reads return it", async () => {
    await setUserTimezone("Asia/Ho_Chi_Minh")
    expect(setCookie).toHaveBeenCalledWith(
      TIMEZONE_COOKIE_NAME,
      "Asia/Ho_Chi_Minh",
      expect.objectContaining({
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: false,
      }),
    )
    expect(await getUserTimezone()).toBe("Asia/Ho_Chi_Minh")
  })

  test("ignores a zone this runtime cannot resolve", async () => {
    await setUserTimezone("Not/AZone")
    expect(setCookie).not.toHaveBeenCalled()
    expect(await getUserTimezone()).toBe("UTC")
  })
})
