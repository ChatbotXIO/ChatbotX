import { afterEach, describe, expect, test } from "vitest"
import { setClientCookie } from "@/lib/cookies"

const clearCookies = () => {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim()
    if (name) {
      setClientCookie(name, "", 0)
    }
  }
}

describe("setClientCookie", () => {
  afterEach(() => {
    clearCookies()
  })

  test("writes a name=value pair readable from document.cookie", () => {
    setClientCookie("a", "true", 60)

    expect(document.cookie).toContain("a=true")
  })
})
