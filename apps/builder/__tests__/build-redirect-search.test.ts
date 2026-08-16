// @vitest-environment node

import { describe, expect, test } from "vitest"
import { buildRedirectSearch } from "@/lib/build-redirect-search"

describe("buildRedirectSearch", () => {
  test("returns an empty string when there are no params", () => {
    expect(buildRedirectSearch({})).toBe("")
  })

  test("serializes string params with a leading question mark", () => {
    expect(buildRedirectSearch({ account: "iw-2", from: "2026-08-01" })).toBe(
      "?account=iw-2&from=2026-08-01",
    )
  })

  test("keeps every entry of array params", () => {
    expect(buildRedirectSearch({ tag: ["a", "b"] })).toBe("?tag=a&tag=b")
  })

  test("skips undefined values", () => {
    expect(
      buildRedirectSearch({ account: undefined, from: "2026-08-01" }),
    ).toBe("?from=2026-08-01")
  })

  test("encodes reserved characters", () => {
    expect(buildRedirectSearch({ q: "a b&c" })).toBe("?q=a+b%26c")
  })
})
